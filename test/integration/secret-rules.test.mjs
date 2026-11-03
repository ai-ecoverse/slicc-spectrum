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
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => button.dataset.action),
      };
    });
  };
  const policy = '/etc/slicc/secrets-policy.toml';
  const cases = [
    [mcp, null, true],
    ['sort notes.txt | uniq', null, true],
    ['find . -name x', null, true],
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
  for (const [index, [command, rules, always]] of cases.entries()) {
    const id = `sudo-${index}`;
    assert.deepEqual(
      await ask(id, command),
      { rules, actions: always ? ['deny', 'always', 'once'] : ['deny', 'once'] },
      command
    );
    await page.evaluate((id) => window.model.approvals.end(id, 'withdrawn'), id);
  }
  assert.deepEqual(page.errors, []);
});
