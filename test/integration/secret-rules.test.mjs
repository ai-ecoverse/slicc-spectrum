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

test('the sudo dialog offers Always allow for the read-only jq command and not for a rules change', async (t) => {
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
  assert.deepEqual(await ask('sudo-mcp', mcp), {
    rules: null,
    actions: ['deny', 'always', 'once'],
  });
  await page.evaluate(() => window.model.approvals.end('sudo-mcp', 'withdrawn'));
  assert.deepEqual(await ask('sudo-policy', 'tee /etc/slicc/secrets-policy.toml'), {
    rules: '/etc/slicc/secrets-policy.toml',
    actions: ['deny', 'once'],
  });
  assert.deepEqual(page.errors, []);
});
