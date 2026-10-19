import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const docs = 'https://docs.example/mcp';
const moved = 'https://docs.eu.example/mcp';
const tickets = 'https://tickets.example/mcp';

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', vault: 'secrets', accounts: 'vault', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.app.show('settings');
    window.account = (id) =>
      window.model.settings.accounts().find((candidate) => candidate.id === id);
    window.dialog = () => window.deep('slicc-confirm')?.shadowRoot ?? null;
    window.order = [];
    const { vault, settings } = window.model;
    for (const [port, name] of [
      [vault, 'put'],
      [vault, 'endpoints'],
      [settings, 'connect'],
    ]) {
      const real = port[name]?.bind(port);
      if (real)
        port[name] = (...args) => {
          window.order.push(name);
          return real(...args);
        };
    }
    return true;
  });
  await page.until(() => !!window.settingsPart('.account[data-id="mcp:docs"]'));
  return page;
}

async function click(page, selector) {
  await page.until((selector) => {
    const target = window.settingsPart(selector);
    if (!target || target.disabled) return false;
    target.scrollIntoView({ block: 'center' });
    const box = target.getBoundingClientRect();
    window.point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    return box.width > 0;
  }, selector);
  const { x, y } = await page.evaluate(() => window.point);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

async function confirmShown(page) {
  await page.until(() => !!window.dialog()?.activeElement?.hasAttribute('data-cancel'));
  return page.evaluate(() => ({
    title: window.dialog().querySelector('#title').textContent,
    body: window.dialog().querySelector('#body').textContent,
    action: window.dialog().querySelector('[data-action]').textContent.trim(),
  }));
}

async function answer(page, yes) {
  await page.evaluate((yes) => {
    window
      .dialog()
      .querySelector(yes ? '[data-action]' : '[data-cancel]')
      .click();
    return true;
  }, yes);
  await page.until(() => !window.dialog());
}

async function typeToken(page) {
  await click(page, '.account[data-id="mcp:tickets"] [data-action=connect]');
  await page.until(
    () => !!window.settingsPart('form.key[data-id="mcp:tickets"] input[data-field=value]')
  );
  await page.evaluate(() => {
    window.settingsPart('form.key[data-id="mcp:tickets"] input[data-field=value]').focus();
    return true;
  });
  await page.type('tickets-token-0123456789');
  await click(page, 'form.key[data-id="mcp:tickets"] [data-action=save]');
}

test('saving an MCP token asks to connect to its URL, then puts, registers and connects', async (t) => {
  const page = await open(t);
  await typeToken(page);
  assert.deepEqual(await confirmShown(page), {
    title: `Connect to ${tickets}?`,
    body: `SLICC sends this token only to ${tickets}.`,
    action: 'Connect',
  });
  await answer(page, false);
  assert.deepEqual(await page.evaluate(() => window.order), []);
  await click(page, 'form.key[data-id="mcp:tickets"] [data-action=save]');
  await confirmShown(page);
  await answer(page, true);
  await page.until(() => window.account('mcp:tickets').status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), ['put', 'endpoints', 'connect']);
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [
    { add: { mcp: [{ server: 'tickets', url: tickets }] } },
  ]);
  assert.deepEqual(page.errors, []);
});

test('when the vault refuses the MCP URL, the form says why and connect never runs', async (t) => {
  const page = await open(t, { vault: 'endpoints-fail' });
  await typeToken(page);
  await confirmShown(page);
  await answer(page, true);
  await page.until(
    () =>
      window.settingsPart('form.key[data-id="mcp:tickets"] #key-problem')?.textContent.trim() ===
      'The vault refused that endpoint. Check the address and try again.'
  );
  assert.deepEqual(await page.evaluate(() => window.order), ['put', 'endpoints']);
  assert.equal(await page.evaluate(() => window.account('mcp:tickets').status), 'expired');
  assert.deepEqual(page.errors, []);
});

test('a moved MCP server offers Reconnect, and re-registers only after the confirm', async (t) => {
  const page = await open(t, { mcp: 'moved' });
  await page.until(
    () => !!window.settingsPart('.account[data-id="mcp:docs"] [data-action=reconnect-mcp]')
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.settingsPart('.account[data-id="mcp:docs"] + .notes [data-notice=moved]').textContent
    ),
    `The server moved to ${moved}. Reconnect to send the token there.`
  );
  await click(page, '.account[data-id="mcp:docs"] [data-action=reconnect-mcp]');
  assert.equal((await confirmShown(page)).title, `Connect to ${moved}?`);
  await answer(page, false);
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), []);
  await click(page, '.account[data-id="mcp:docs"] [data-action=reconnect-mcp]');
  await confirmShown(page);
  await answer(page, true);
  await page.until(() => !window.settingsPart('[data-action=reconnect-mcp]'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [
    {
      remove: { mcp: [{ server: 'docs', url: docs }] },
      add: { mcp: [{ server: 'docs', url: moved }] },
    },
  ]);
  assert.equal(await page.evaluate(() => !!window.settingsPart('[data-notice=moved]')), false);
  assert.deepEqual(page.errors, []);
});

test('Disconnect takes the MCP server URL back after removing the token', async (t) => {
  const page = await open(t);
  await click(page, '.account[data-id="mcp:docs"] [data-action=disconnect]');
  await page.until(() => !!window.dialog());
  await answer(page, true);
  await page.until(() => window.account('mcp:docs').status === 'disconnected');
  await page.until(() => window.model.vault.endpointChanges.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [
    { remove: { mcp: [{ server: 'docs', url: docs }] } },
  ]);
  assert.equal(
    await page.evaluate(
      () =>
        window.model.vault.list().secrets.find((secret) => secret.name === 'MCP_DOCS_TOKEN').state
    ),
    'removed'
  );
  assert.deepEqual(page.errors, []);
});

test('without endpoints on the vault, an MCP token saves without a confirm', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.vault.endpoints = undefined;
    window.app.show('settings');
    return true;
  });
  await typeToken(page);
  await page.until(() => window.account('mcp:tickets').status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), ['put', 'connect']);
  assert.deepEqual(page.errors, []);
});
