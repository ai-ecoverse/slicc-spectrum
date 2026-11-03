import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const mcp = String.raw`/usr/bin/jq '.mcpServers // . | to_entries[] | {name: .key, url: .value.url, headers: (.value.headers // {} | with_entries(.value |= (if test("^\\$\\{") then "hidden" else . end)))}' /etc/slicc/agent/mcp.json`;

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', approvals: 'none' })}`);
  await page.until(() => window.ready === true);
  return page;
}

async function verdicts(page, cases) {
  return page.evaluate(async (cases) => {
    const { secretRules } = await import('/dist/slicc-ui.js');
    return cases.map(([command, cwd]) => secretRules(command, cwd));
  }, cases);
}

test('a read-only jq program is not read as paths, globs or expansions', async (t) => {
  const page = await open(t);
  const clean = { certain: null, maybe: null };
  assert.deepEqual(
    await verdicts(page, [
      [mcp, '/tmp'],
      [mcp, '/'],
      [mcp, '/etc'],
      ["jq '.a // .b' /etc/hosts", '/tmp'],
      ["jq '[.[] | .a]' x.json", '/'],
      ["jq '{a: .b}' x.json", '/etc'],
      ["echo '$HOME'", '/tmp'],
      ["find / -name '*.toml'", '/tmp'],
      ['sort -r / | uniq', '/tmp'],
      ["yq '.a' /etc/hosts", '/tmp'],
      ['sha256sum /etc/hosts; md5sum /', '/tmp'],
    ]),
    Array(11).fill(clean)
  );
  assert.deepEqual(page.errors, []);
});

test('the real secret rule changes are still flagged', async (t) => {
  const page = await open(t);
  const certain = (path) => ({ certain: path, maybe: null });
  assert.deepEqual(
    await verdicts(page, [
      ['tee /etc/slicc/secrets-policy.toml', '/tmp'],
      ['rm -rf /etc/fnox', '/tmp'],
      ["sh -c 'cd /etc; rm -r slicc'", '/tmp'],
      ['sh -c \'jq ".a // .b" x\'', '/tmp'],
      ["jq '.a' x > /etc/slicc/secrets-policy.toml", '/tmp'],
      ['jq . /etc/fnox/config.toml', '/tmp'],
      ["cat '/etc/fnox/['", '/tmp'],
      ["cd /etc; cat 'fnox/config.toml'", '/tmp'],
      ['cat /etc/fn{ox,x}/config.toml', '/tmp'],
      ["jq '.a // .b' x; rm -rf /", '/tmp'],
      ['find / -delete', '/tmp'],
      ['find /etc -exec rm {} +', '/tmp'],
      ['sort -o /tmp/x /etc', '/tmp'],
      ['sort --comp=sh /etc', '/tmp'],
      ['yq -i . /etc/slicc', '/tmp'],
      ['uniq /etc /tmp/x', '/tmp'],
      ['xxd /etc/slicc /tmp/x', '/tmp'],
      ['base64 -o /tmp/x /etc', '/tmp'],
      ['tree -o /tmp/x /etc', '/tmp'],
      ["sort '--output=/etc' f", '/tmp'],
      ["sort '-T/etc' f", '/tmp'],
      ["yq '--split-exp-file=e' /etc", '/tmp'],
      ['tree -R -H . /etc', '/tmp'],
      ['uniq -- -a /etc', '/tmp'],
      ["grep '--file=/etc/fnox/config.toml' x", '/tmp'],
    ]),
    [
      certain('/etc/slicc/secrets-policy.toml'),
      certain('/etc/fnox'),
      certain('/etc/slicc'),
      certain('/'),
      certain('/etc/slicc/secrets-policy.toml'),
      certain('/etc/fnox/config.toml'),
      certain('/etc/fnox/['),
      certain('/etc/fnox/config.toml'),
      certain('/etc/fn{ox,x}/config.toml'),
      certain('/'),
      certain('/'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc/slicc'),
      certain('/etc'),
      certain('/etc/slicc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc'),
      certain('/etc/fnox/config.toml'),
    ]
  );
  assert.deepEqual(
    await verdicts(page, [
      ['cat "$X"', '/tmp'],
      ['cat "$(rm -rf /etc/fnox)"', '/tmp'],
    ]),
    [
      { certain: null, maybe: '$X' },
      { certain: '/etc/fnox', maybe: null },
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('a write whose target comes from data may change secret rules, and a read through xargs stays clean', async (t) => {
  const page = await open(t);
  const clean = { certain: null, maybe: null };
  const maybe = (token) => ({ certain: null, maybe: token });
  assert.deepEqual(
    await verdicts(page, [
      ['yq -s .a f.yaml', '/tmp'],
      ['yq --split-exp=.a f.yaml', '/tmp'],
      ["yq '--split-exp-file=e' f.yaml", '/tmp'],
      ['/usr/bin/yq -Ps .a f.yaml', '/tmp'],
      ['xargs rm < list', '/tmp'],
      ['xargs tee < list', '/tmp'],
      ['xargs sort -o out < list', '/tmp'],
      ["xargs sh -c 'rm x'", '/tmp'],
      ['xargs xargs < list', '/tmp'],
      ['xargs -n 1 /bin/rm < list', '/tmp'],
      ['xargs -in rm < list', '/tmp'],
      ['xargs --max-args 1 rm < list', '/tmp'],
      ['xargs -- rm < list', '/tmp'],
      ['xargs --null rm < list', '/tmp'],
      ["bash -c 'cd /srv; xargs rm < list'", '/tmp'],
      ['xargs --replace=cat rm < list', '/tmp'],
      ['xargs --eof=cat rm < list', '/tmp'],
      ['FOO=1 xargs rm < list', '/tmp'],
      ["sh -c 'A=1 xargs rm < list'", '/tmp'],
    ]),
    [
      maybe('yq -s'),
      maybe('yq --split-exp'),
      maybe('yq --split-exp-file'),
      maybe('yq -Ps'),
      maybe('xargs rm'),
      maybe('xargs tee'),
      maybe('xargs sort'),
      maybe('xargs sh'),
      maybe('xargs xargs'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
      maybe('xargs rm'),
    ]
  );
  assert.deepEqual(
    await verdicts(page, [
      ['yq -i . f.yaml', '/tmp'],
      ["yq '.a' f.yaml", '/tmp'],
      ['xargs cat < list', '/tmp'],
      ['xargs grep x -- < list', '/tmp'],
      ['xargs sha256sum -a list', '/tmp'],
      ['xargs < list', '/tmp'],
      ["xargs < 'my list'", '/tmp'],
      ['xargs -n1 -I{} cat {} < list', '/tmp'],
      ["xargs cat 2>/dev/null < 'a b'", '/tmp'],
      ["find /etc -name '*.conf' | xargs grep x", '/tmp'],
      ['sh -c \'xargs cat < "a b"\'', '/tmp'],
      ['xargs --max-lines 1 cat < list', '/tmp'],
      ['xargs --max-lines=1 cat < list', '/tmp'],
      ['xargs --replace=X cat X < list', '/tmp'],
      ['xargs --replace cat < list', '/tmp'],
    ]),
    Array(15).fill(clean)
  );
  assert.deepEqual(
    await verdicts(page, [
      ['yq -s .a /etc/fnox/x.yaml', '/tmp'],
      ['yq -s \'"/etc/" + .name\' f.yaml', '/tmp'],
      ['echo /etc/slicc | xargs rm -rf', '/tmp'],
    ]),
    [
      { certain: '/etc/fnox/x.yaml', maybe: null },
      { certain: '/etc', maybe: null },
      { certain: '/etc/slicc', maybe: null },
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('ordinary reads and read-only pipelines never may change secret rules', async (t) => {
  const page = await open(t);
  const clean = { certain: null, maybe: null };
  const rows = [
    ['jq ".x // ." file', '/tmp'],
    ['jq ".x // ." file', '/'],
    ['jq ".x // ." file', '/etc'],
    ['cat f | jq .x', '/tmp'],
    ['yq -o=json . f.yaml', '/tmp'],
    ['yq -ojson . f.yaml', '/tmp'],
    ['yq -p=csv . f.csv', '/tmp'],
    ['yq -o json . f.yaml', '/tmp'],
    ['yq -P -o=props . f.yaml', '/tmp'],
    ['yq -r=false .a f.yaml', '/tmp'],
    ['yq -os . f.yaml', '/tmp'],
    ["yq '.a' f.yaml", '/tmp'],
    ["yq e '.a' f.yaml", '/tmp'],
    ['yq -i . f.yaml', '/tmp'],
    ['sort f | uniq -c', '/tmp'],
    ['find . -name x | xargs grep y', '/tmp'],
    ['xargs -I{} cat {} < list', '/tmp'],
    ['xargs wc -l < list', '/tmp'],
    ['xargs --max-lines=1 cat < list', '/tmp'],
    ['xargs --max-lines 1 cat < list', '/tmp'],
    ['env xargs cat < list', '/tmp'],
    ['command -v xargs', '/tmp'],
    ['ls | wc -l', '/tmp'],
    ['tar tf x.tar', '/tmp'],
    ['unzip -l x.zip', '/tmp'],
    ['grep -r x . | head', '/tmp'],
    ['cut -d, -f1 f', '/tmp'],
    ['sort -to /etc', '/tmp'],
    ['sort -t o /etc', '/tmp'],
    ["tree -P '*.o' /etc", '/tmp'],
    ['tree -P*.o /etc', '/tmp'],
    ['base64 -w0 /etc', '/tmp'],
    ['file -m magic /etc', '/tmp'],
    ['uniq -f 1 /etc', '/tmp'],
    ['xxd -l 16 /etc', '/tmp'],
    ['xxd -s 4 /etc', '/tmp'],
  ];
  const seen = await verdicts(page, rows);
  assert.deepEqual(
    rows.map(([command], index) => [command, seen[index]]),
    rows.map(([command]) => [command, clean])
  );
  assert.deepEqual(page.errors, []);
});

test('a wrapper does not hide xargs or yq writing a target from data', async (t) => {
  const page = await open(t);
  const rows = [
    ['command xargs rm < list', 'xargs rm'],
    ['command -p xargs rm < list', 'xargs rm'],
    ['exec xargs rm < list', 'xargs rm'],
    ['exec -a x xargs rm < list', 'xargs rm'],
    ['env xargs rm < list', 'xargs rm'],
    ['env -i VAR=x xargs rm < list', 'xargs rm'],
    ['env -u HOME xargs rm < list', 'xargs rm'],
    ["env -S 'xargs rm' < list", 'xargs rm'],
    ['nice xargs rm < list', 'xargs rm'],
    ['nice -n 5 xargs rm < list', 'xargs rm'],
    ['nice -10 xargs rm < list', 'xargs rm'],
    ['nohup xargs rm < list', 'xargs rm'],
    ['time xargs rm < list', 'xargs rm'],
    ['time -p env FOO=1 nice xargs rm < list', 'xargs rm'],
    ['timeout 5 xargs rm < list', 'xargs rm'],
    ['timeout -s KILL 5 xargs rm < list', 'xargs rm'],
    ['stdbuf -oL xargs rm < list', 'xargs rm'],
    ['stdbuf -o L xargs rm < list', 'xargs rm'],
    ['setsid xargs rm < list', 'xargs rm'],
    ['ionice -c 3 xargs rm < list', 'xargs rm'],
    ["sh -c 'nohup xargs rm < list'", 'xargs rm'],
    ['nice yq -s .a f.yaml', 'yq -s'],
    ['xargs --replace=cat rm < list', 'xargs rm'],
    ['yq -Ps .a f.yaml', 'yq -Ps'],
  ];
  const found = await verdicts(
    page,
    rows.map(([command]) => [command, '/tmp'])
  );
  assert.deepEqual(
    rows.map(([command], index) => [command, found[index]]),
    rows.map(([command, token]) => [command, { certain: null, maybe: token }])
  );
  assert.deepEqual(page.errors, []);
});

test('xargs running a read-only program is clean unless a write flag shows in the command', async (t) => {
  const page = await open(t);
  const rows = [
    ['xargs sort < list', null],
    ['xargs sort -r < list', null],
    ['xargs sort -o out < list', 'xargs sort'],
    ['xargs find < list', null],
    ['xargs find -name x < list', null],
    ['xargs find -delete < list', 'xargs find'],
    ['xargs find -exec rm {} + < list', 'xargs find'],
    ['xargs file < list', null],
    ['xargs file -C < list', 'xargs file'],
    ['xargs tree < list', null],
    ['xargs tree -o out < list', 'xargs tree'],
    ['xargs base64 < list', null],
    ['xargs base64 -o out < list', 'xargs base64'],
    ['xargs uniq -c < list', null],
    ['xargs uniq in out < list', 'xargs uniq'],
    ['xargs xxd < list', null],
    ['xargs xxd in out < list', 'xargs xxd'],
    ['xargs yq . < list', null],
    ['xargs yq -o=json . < list', null],
    ['xargs yq -i . < list', 'xargs yq'],
    ['xargs yq -s .a < list', 'xargs yq'],
    ['xargs xargs cat < list', 'xargs xargs'],
    ['xargs cp -t /tmp < list', 'xargs cp'],
  ];
  const found = await verdicts(
    page,
    rows.map(([command]) => [command, '/tmp'])
  );
  assert.deepEqual(
    rows.map(([command], index) => [command, found[index]]),
    rows.map(([command, token]) => [command, { certain: null, maybe: token }])
  );
  assert.deepEqual(page.errors, []);
});

test('the sudo dialog offers Always allow for read-only commands and not for a write flag that reaches the rules', async (t) => {
  const page = await open(t);
  const ask = async (id, command) => {
    await page.evaluate(
      ({ id, command }) => {
        const now = Date.now();
        window.model.approvals.raise({
          id,
          kind: 'sudo',
          requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
          command,
          cwd: '/tmp',
          createdAt: now,
          expiresAt: now + 300_000,
          always: true,
        });
      },
      { id, command }
    );
    await page.until(
      (id) => window.$('slicc-app', 'slicc-approvals', 'dialog')?.dataset.approval === id,
      id
    );
    await page.until(() => {
      const root = window.$('slicc-app', 'slicc-approvals').shadowRoot;
      root.querySelector('[data-action=full-command]:not([data-shown])')?.click();
      return !!root.querySelector('[data-action=once]');
    });
    return page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-approvals').shadowRoot;
      return {
        rules: root.querySelector('[data-secret-rules]')?.dataset.secretRules ?? null,
        notice: root.querySelector('[data-secret-rules] strong')?.textContent ?? null,
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => button.dataset.action),
      };
    });
  };
  const policy = '/etc/slicc/secrets-policy.toml';
  const cases = [
    [mcp, null, true],
    ['sort notes.txt | uniq', null, true],
    ['find . -name x', null, true],
    ['xargs cat < list', null, true],
    ['xargs grep x -- < list', null, true],
    ["find /etc -name '*.conf' | xargs grep x", null, true],
    ['yq -s .a f.yaml', 'yq -s', false],
    ['xargs rm < list', 'xargs rm', false],
    ['xargs sh -c \'rm "$1"\' _ < list', 'xargs sh', false],
    ['xargs tee out < list', 'xargs tee', false],
    ['yq --split-exp-file=x f.yaml', 'yq --split-exp-file', false],
    ['command xargs rm < list', 'xargs rm', false],
    ['yq -o=json . f.yaml', null, true],
    ['cat f | jq .x', null, true],
    ['xargs wc -l < list', null, true],
    ['tar tf x.tar', null, true],
    ['unzip -l x.zip', null, true],
    ['tee /etc/slicc/secrets-policy.toml', policy, false],
    [`sort --output=${policy} notes.txt`, policy, false],
    [`sort --out=${policy} notes.txt`, policy, false],
    [`sort -o${policy} notes.txt`, policy, false],
    [`sort '--output=${policy}' notes.txt`, policy, false],
    ["sort '--out=/etc' notes.txt", '/etc', false],
    [`yq '--split-exp="/etc/" + .name' f.yaml`, '/etc', false],
    ["yq '--inplace=true' . /etc/slicc", '/etc/slicc', false],
    ['yq --inplace . /etc/slicc', '/etc/slicc', false],
    ['yq -i.bak . /etc/slicc', '/etc/slicc', false],
    [`base64 --output=${policy} notes.txt`, policy, false],
    ["base64 '--output=/etc' notes.txt", '/etc', false],
  ];
  const unseen = /^(?:xargs|yq) /;
  for (const [index, [command, rules, always]] of cases.entries()) {
    const id = `sudo-${index}`;
    let notice = null;
    if (rules)
      notice = unseen.test(rules) ? 'This may change secret rules.' : 'This changes secret rules.';
    assert.deepEqual(
      await ask(id, command),
      { rules, notice, actions: always ? ['deny', 'always', 'once'] : ['deny', 'once'] },
      command
    );
    await page.evaluate((id) => window.model.approvals.end(id, 'withdrawn'), id);
  }
  assert.deepEqual(page.errors, []);
});
