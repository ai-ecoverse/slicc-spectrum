import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    return cases.map(([command, cwd]) => {
      const { certain, maybe } = secretRules(command, cwd);
      return { certain, maybe };
    });
  }, cases);
}

async function onces(page, cases) {
  return page.evaluate(async (cases) => {
    const { secretRules } = await import('/dist/slicc-ui.js');
    return cases.map(([command, cwd]) => secretRules(command, cwd).once);
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
      ["bash -lc 'cd /etc; rm -r slicc'", '/tmp'],
      ['if cd /etc; then rm -r slicc; fi', '/tmp'],
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
      certain('/etc/slicc'),
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
      ['sh -c \'xargs cat < "a b"\'', '/tmp'],
      ['xargs --max-lines 1 cat < list', '/tmp'],
      ['xargs --max-lines=1 cat < list', '/tmp'],
      ['xargs --replace=X cat X < list', '/tmp'],
      ['xargs --replace cat < list', '/tmp'],
    ]),
    Array(14).fill(clean)
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
    ['sort -t o /etc', '/tmp'],
    ["tree -P '*.o' /etc", '/tmp'],
    ['base64 -w0 /etc', '/tmp'],
    ['file -m magic /etc', '/tmp'],
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
    ['timeout --sig KILL 5 xargs rm < list', 'xargs rm'],
    ['timeout --signal=KILL 5 xargs rm < list', 'xargs rm'],
    ['nice --a 0 xargs rm < list', 'xargs rm'],
    ['stdbuf --o L xargs rm < list', 'xargs rm'],
    ["env --split-string='xargs rm' < list", 'xargs rm'],
    ["env -S'xargs rm' < list", 'xargs rm'],
    ["env -iS'xargs rm' < list", 'xargs rm'],
    ["env --sp 'xargs rm' < list", 'xargs rm'],
    ["bash -lc 'xargs rm < list'", 'xargs rm'],
    ['A+=1 xargs rm < list', 'xargs rm'],
    ['a[1]=x xargs rm < list', 'xargs rm'],
    ['if xargs rm < list; then :; fi', 'xargs rm'],
    ['! xargs rm < list', 'xargs rm'],
    ['{ xargs rm < list; }', 'xargs rm'],
    ['while xargs rm < list; do :; done', 'xargs rm'],
    ['for f in a; do xargs rm < list; done', 'xargs rm'],
    ['coproc xargs rm < list', 'xargs rm'],
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
  const fed = [
    ['xargs sort < list', 'xargs sort'],
    ['xargs find -name x < list', 'xargs find'],
    ['xargs file < list', 'xargs file'],
    ['xargs tree < list', 'xargs tree'],
    ['xargs base64 < list', 'xargs base64'],
    ['xargs uniq -c < list', 'xargs uniq'],
    ['xargs xxd < list', 'xargs xxd'],
    ['xargs yq . < list', 'xargs yq'],
    ['nice xargs sort < list', 'xargs sort'],
    ["sh -c 'xargs sort < list'", 'xargs sort'],
    ["env -S'xargs sort' < list", 'xargs sort'],
    ['xargs uniq input < list', 'xargs uniq'],
    ['xargs xxd input < list', 'xargs xxd'],
    ['until false; do xargs sort < list; done', 'xargs sort'],
    ['xargs cat < list', null],
    ['xargs grep x < list', null],
    ['xargs --replace=sort cat < list', null],
    ['sort notes.txt', null],
    ['xargs sort -o out < list', null],
    ['xargs rm < list', null],
  ];
  const once = await onces(
    page,
    fed.map(([command]) => [command, '/tmp'])
  );
  assert.deepEqual(
    fed.map(([command], index) => [command, once[index]]),
    fed
  );
  assert.deepEqual(page.errors, []);
});

test('every command the base check flags keeps its verdict, except the listed reads and cd paths', async (t) => {
  const page = await open(t);
  const base = JSON.parse(
    readFileSync(new URL('./secret-rules-base.json', import.meta.url), 'utf8')
  );
  const clean = { certain: null, maybe: null };
  const changed = {
    "find /etc -name '*.conf' | xargs grep x": clean,
    'sort -to /etc': clean,
    'uniq -f 1 /etc': clean,
    'uniq -s 2 /etc': clean,
    'xxd -l 16 /etc': clean,
    'xxd -s 4 /etc': clean,
    "bash -lc 'cd /etc; rm -r slicc'": { certain: '/etc/slicc', maybe: null },
    'if cd /etc; then rm -r slicc; fi': { certain: '/etc/slicc', maybe: null },
    '{ cd /etc; rm -r slicc; }': { certain: '/etc/slicc', maybe: null },
    "bash -lc 'cd /etc && rm -rf fnox'": { certain: '/etc/fnox', maybe: null },
    'function f { cd /etc; rm -r slicc; }': { certain: '/etc/slicc', maybe: null },
    'if cd /etc; then rm -r x; fi': clean,
    'find /etc | xargs grep x': clean,
    'find /etc | xargs -I{} cat {}': clean,
    'sort -ko /etc': clean,
    'yq -Ii /etc/slicc': clean,
  };
  const found = await verdicts(
    page,
    base.map(([command, cwd]) => [command, cwd ?? undefined])
  );
  assert.deepEqual(
    base.map(([command], index) => [command, found[index]]),
    base.map(([command, , certain, maybe]) => [command, changed[command] ?? { certain, maybe }])
  );
  assert.deepEqual(page.errors, []);
});

test('the data-write detector and the read-only fixes keep the true positives', async (t) => {
  const page = await open(t);
  const certain = (path) => ({ certain: path, maybe: null });
  const clean = { certain: null, maybe: null };
  const rows = [
    ['chown -Rc cd /etc', certain('/etc')],
    ['rm -rf then cd /etc', certain('/etc')],
    ['rm -rf do cd /etc', certain('/etc')],
    ['rm -rf then cd /etc/slicc', certain('/etc/slicc')],
    ['grep -rc xargs .', clean],
    ['tar -czf xargs rm', clean],
    ['git commit -m "fix; xargs rm"', clean],
    ["env -S'xargs\\_rm' < list", { certain: null, maybe: 'env -S' }],
    ["env -S'xargs\\crm' < list", { certain: null, maybe: 'env -S' }],
    ['chown -c cd /etc', certain('/etc')],
    ['chmod -R 777 sh -Rc cd /etc', certain('/etc')],
    ['chmod -R 777 sh -c -- cd /etc', certain('/etc')],
    ['chmod 777 bash -vc cd /etc', certain('/etc')],
    ["bash -c -- 'cd /etc; rm -r slicc'", certain('/etc/slicc')],
    ["FOO=1 sh -c 'cd /etc; rm -r slicc'", certain('/etc/slicc')],
    ["timeout -s KILL 5 sh -c 'cd /etc; rm -r slicc'", certain('/etc/slicc')],
    ["sh x -c 'cd /etc; rm -r slicc'", certain('/etc/slicc')],
    ['chmod -c cd /etc', certain('/etc')],
    ["su -c 'cd /etc; rm -r slicc'", certain('/etc/slicc')],
    ['rm -rf if cd /etc', certain('/etc')],
    ['function f { cd /etc; rm -r slicc; }', certain('/etc/slicc')],
    ['sort --output=/etc/slicc/secrets-policy.toml f', certain('/etc/slicc/secrets-policy.toml')],
    ["sort '--output=/etc' f", certain('/etc')],
    ['sort -o /etc/x /etc', certain('/etc')],
    ['yq -i . /etc/slicc', certain('/etc/slicc')],
    ['tree -R -H . /etc', certain('/etc')],
    ['uniq -f 1 /etc /tmp/out', certain('/etc')],
    ['xxd -l 16 /etc /tmp/out', certain('/etc')],
    ['echo /etc | xargs sort', certain('/etc')],
    ['echo /etc | xargs rm -rf', certain('/etc')],
    ['find / | xargs xargs grep x', certain('/')],
    ['find /etc | command xargs rm', certain('/etc')],
    ['command xargs rm < list', { certain: null, maybe: 'xargs rm' }],
    ['sort -to /etc', clean],
    ['sort -ko /etc', clean],
    ['tree -P*.o /etc', certain('/etc')],
    ['tree -Lo /etc', certain('/etc')],
    ['tree -Ho /tmp/x /etc', certain('/etc')],
    ['tree -Po /tmp/x /etc', certain('/etc')],
    ['tree -Io /tmp/x /etc', certain('/etc')],
    ['tree -To /tmp/x /etc', certain('/etc')],
    ['tree -Ho http://x /etc', certain('/etc')],
    ['tree -aHo /tmp/x /etc', certain('/etc')],
    ['tree -dfHo /tmp/x /etc', certain('/etc')],
    ['tree -Ho /tmp/x /', certain('/')],
    ['tree -Ho /tmp/x /etc/slicc', certain('/etc/slicc')],
    ['tree -Io /tmp/x /etc/slicc', certain('/etc/slicc')],
    ['tree -L2o /tmp/x /etc', certain('/etc')],
    ['tree -L 2 /etc', clean],
    ['tree -P *.o /etc', clean],
    ['xxd -lo /etc /tmp/x', certain('/etc')],
    ['xxd -ro /etc /tmp/x', certain('/etc')],
    ['xxd -capitalize /etc /tmp/x', certain('/etc')],
    ['xxd -offset 4 /etc /tmp/x', certain('/etc')],
    ['xxd /etc -l', certain('/etc')],
    ['xxd -- -l /etc', certain('/etc')],
    ['xxd -len 16 /etc', clean],
    ['xxd -l16 /etc', clean],
    ['uniq -wf /etc /tmp/x', certain('/etc')],
    ['uniq -f1 /etc /tmp/x', certain('/etc')],
    ['uniq -wf /etc', clean],
    ['base64 -io /tmp/x /etc', certain('/etc')],
    ['base64 -bo /tmp/x /etc', certain('/etc')],
    ['base64 -w0 /etc', clean],
    ['uniq -f 1 /etc', clean],
    ['xxd -l 16 /etc', clean],
    ["find /etc -name '*.conf' | xargs grep x", clean],
    ['find /etc | xargs -I{} cat {}', clean],
    [`bash -c "eval 'xargs rm < list'"`, { certain: null, maybe: 'xargs rm' }],
    ["eval 'xargs rm < list'", { certain: null, maybe: 'xargs rm' }],
    ["bash -lc 'xargs rm < list'", { certain: null, maybe: 'xargs rm' }],
    ["nice sh -c 'xargs rm < list'", { certain: null, maybe: 'xargs rm' }],
    ['rm -rf $X; xargs rm < list', { certain: null, maybe: '$X' }],
    ['env - xargs rm < list', { certain: null, maybe: 'xargs rm' }],
    ['env - xargs cat < list', clean],
    ["bash -c -- 'xargs rm < list'", { certain: null, maybe: 'xargs rm' }],
    ["bash -c -- 'xargs cat < list'", clean],
    ['function f { xargs rm < list; }; f', { certain: null, maybe: 'xargs rm' }],
    ['function f { xargs cat < list; }; f', clean],
    ['f() { xargs rm < list; }; f', { certain: null, maybe: 'xargs rm' }],
  ];
  const found = await verdicts(
    page,
    rows.map(([command]) => [command, '/tmp'])
  );
  assert.deepEqual(
    rows.map(([command], index) => [command, found[index]]),
    rows
  );
  assert.deepEqual(page.errors, []);
});

test('repeated options that may take a value are parsed in linear time', async (t) => {
  const page = await open(t);
  const timed = await page.evaluate(async () => {
    const { secretRules } = await import('/dist/slicc-ui.js');
    const rows = [];
    for (const count of [40, 200])
      for (const [prefix, option, tail] of [
        ['xargs', '--e', 'cat < list'],
        ['xargs', '--r', 'rm < list'],
        ['nice', '--a', 'cat'],
        ['nice', '--a', 'xargs rm < list'],
        ['timeout', '--sig', '5 xargs rm < list'],
        ['env', '--u', 'xargs rm < list'],
      ]) {
        const command = `${prefix} ${`${option} `.repeat(count)}${tail}`;
        const start = performance.now();
        const { certain, maybe } = secretRules(command, '/tmp');
        rows.push([count, prefix, option, performance.now() - start < 50, { certain, maybe }]);
      }
    return rows;
  });
  const clean = { certain: null, maybe: null };
  const rm = { certain: null, maybe: 'xargs rm' };
  const expected = [clean, rm, clean, rm, rm, rm];
  assert.deepEqual(
    timed,
    [40, 200].flatMap((count) =>
      [
        ['xargs', '--e'],
        ['xargs', '--r'],
        ['nice', '--a'],
        ['nice', '--a'],
        ['timeout', '--sig'],
        ['env', '--u'],
      ].map(([prefix, option], index) => [count, prefix, option, true, expected[index]])
    )
  );
  assert.deepEqual(
    await verdicts(page, [
      ['xargs --replace=X cat X < list', '/tmp'],
      ['xargs --replace=cat rm < list', '/tmp'],
      ['xargs --replace cat < list', '/tmp'],
    ]),
    [clean, rm, clean]
  );
  assert.deepEqual(page.errors, []);
});

test('pure output programs are read-only, alone and through xargs', async (t) => {
  const page = await open(t);
  const clean = { certain: null, maybe: null };
  const rows = [
    ['ls | xargs -n1 basename', clean],
    ['ls | xargs dirname', clean],
    ['seq 3 | xargs printf x', clean],
    ['printf %s /etc', clean],
    ['basename /etc/slicc', clean],
    ['pr /etc', clean],
    ['join /etc a', clean],
    ['paste /etc/slicc a', clean],
    ['fold /etc', clean],
    ['id; uname -a; nproc; whoami; printenv', clean],
    [
      'dirname /etc/slicc/secrets-policy.toml',
      { certain: '/etc/slicc/secrets-policy.toml', maybe: null },
    ],
    [
      'tr a b < /etc/slicc/secrets-policy.toml',
      { certain: '/etc/slicc/secrets-policy.toml', maybe: null },
    ],
    [
      'printf x > /etc/slicc/secrets-policy.toml',
      { certain: '/etc/slicc/secrets-policy.toml', maybe: null },
    ],
    ['basename x > /etc/fnox/config.toml', { certain: '/etc/fnox/config.toml', maybe: null }],
    ['xargs basename < /etc/fnox/list', { certain: '/etc/fnox/list', maybe: null }],
    ['xargs rm < list', { certain: null, maybe: 'xargs rm' }],
    ['xargs tee < list', { certain: null, maybe: 'xargs tee' }],
    ['command xargs rm < list', { certain: null, maybe: 'xargs rm' }],
  ];
  const found = await verdicts(
    page,
    rows.map(([command]) => [command, '/tmp'])
  );
  assert.deepEqual(
    rows.map(([command], index) => [command, found[index]]),
    rows
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
        onceOnly: root.querySelector('[data-once-only]')?.textContent ?? null,
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
    ['xargs sort < list', null, false, true],
    ['find . -name x | xargs file', null, false, true],
    ['xargs grep x -- < list', null, true],
    ["find . -name '*.conf' | xargs grep x", null, true],
    ["find /etc -name '*.conf' | xargs grep x", null, true],
    ['sort -to /etc', null, true],
    ['yq -s .a f.yaml', 'yq -s', false],
    ['xargs rm < list', 'xargs rm', false],
    ['xargs sh -c \'rm "$1"\' _ < list', '$1', false],
    ["xargs sh -c 'rm x' < list", 'xargs sh', false],
    ['xargs tee out < list', 'xargs tee', false],
    ['yq --split-exp-file=x f.yaml', 'yq --split-exp-file', false],
    ['command xargs rm < list', 'xargs rm', false],
    ['yq -o=json . f.yaml', null, true],
    ['cat f | jq .x', null, true],
    ['xargs wc -l < list', null, true],
    ['ls | xargs -n1 basename', null, true],
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
  const onceOnly =
    'Always allow isn’t offered: xargs adds arguments from its input, and they could include a write flag.';
  for (const [index, [command, rules, always, once]] of cases.entries()) {
    const id = `sudo-${index}`;
    let notice = null;
    if (rules)
      notice = rules.startsWith('/')
        ? 'This changes secret rules.'
        : 'This may change secret rules.';
    assert.deepEqual(
      await ask(id, command),
      {
        rules,
        notice,
        onceOnly: once ? onceOnly : null,
        actions: always ? ['deny', 'always', 'once'] : ['deny', 'once'],
      },
      command
    );
    await page.evaluate((id) => window.model.approvals.end(id, 'withdrawn'), id);
  }
  assert.deepEqual(page.errors, []);
});
