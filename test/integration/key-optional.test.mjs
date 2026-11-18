import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', providers: 'all', vault: 'secrets', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.app.show('settings');
    window.account = (id) =>
      window.model.settings.accounts().find((candidate) => candidate.id === id);
    window.order = [];
    const { vault, settings } = window.model;
    for (const [port, name] of [
      [vault, 'put'],
      [vault, 'settings'],
      [vault, 'endpoints'],
      [vault, 'enter'],
      [settings, 'connect'],
    ]) {
      if (!port[name]) continue;
      const real = port[name].bind(port);
      port[name] = (...args) => {
        window.order.push([name, args[0]]);
        return real(...args);
      };
    }
    window.dialog = () => {
      const confirm = window.deep('slicc-confirm');
      if (!confirm?.shadowRoot.querySelector('dialog')?.open) return null;
      return {
        title: confirm.shadowRoot.querySelector('h2').textContent,
        body: confirm.shadowRoot.querySelector('p').textContent,
      };
    };
    window.answer = (ok) => {
      window
        .deep('slicc-confirm')
        .shadowRoot.querySelector(ok ? '[data-action]' : '[data-cancel]')
        .click();
      return true;
    };
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-provider]'));
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

async function fill(page, values) {
  for (const [selector, value] of values) {
    await page.evaluate((selector) => {
      window.settingsPart(`dialog.picker ${selector}`).focus();
      return true;
    }, selector);
    await page.type(value);
  }
}

async function choose(page) {
  await click(page, '[data-action=add-provider]');
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await click(page, '.option[data-provider="local"]');
  await page.until(() => !!window.settingsPart('dialog.picker form.key'));
}

test('a keyless provider connects with only its endpoint and puts nothing in the vault', async (t) => {
  const page = await open(t);
  await choose(page);
  assert.deepEqual(
    await page.evaluate(() => ({
      label: window.settingsPart('dialog.picker form.key label.field span').textContent,
      disabled: window.settingsPart('dialog.picker [data-action=save]').disabled,
    })),
    { label: 'Local or self-hosted API key (optional)', disabled: true }
  );
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]').disabled);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order,
      puts: window.model.vault.puts.length,
      changes: window.model.vault.endpointChanges,
      fields: window.model.settings.connects.at(-1).fields,
    })),
    {
      order: [['connect', 'local']],
      puts: 0,
      changes: [],
      fields: { endpoint: 'http://localhost:11434' },
    }
  );
  await page.until(() => !window.settingsPart('dialog.picker'));
  assert.equal(
    await page.evaluate(() => !!window.settingsPart('.account[data-id=local] .kept')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('with a key, the key is put first, then its endpoint, then connect', async (t) => {
  const page = await open(t);
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  const add = { add: { model: [{ name: 'LOCAL_API_KEY', url: 'http://localhost:11434' }] } };
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'LOCAL_API_KEY'],
    ['endpoints', add],
    ['connect', 'local'],
  ]);
  assert.equal(await page.evaluate(() => window.dialog()), null);
  await page.until(
    () =>
      window.settingsPart('.account[data-id=local] .kept')?.textContent.trim() ===
      '· Key kept in the vault'
  );
  await page.evaluate(() => window.model.vault.remove('LOCAL_API_KEY', 'model'));
  await page.until(() => !window.settingsPart('.account[data-id=local] .kept'));
  assert.equal(await page.evaluate(() => window.account('local').status), 'connected');
  assert.deepEqual(page.errors, []);
});

const lan = 'http://192.168.1.20:11434';

async function keyedLan(page) {
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', lan],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => !!window.dialog());
  assert.deepEqual(await page.evaluate(() => window.dialog()), {
    title: `Connect to ${lan}?`,
    body: 'This key goes unencrypted over your local network.',
  });
  assert.deepEqual(await page.evaluate(() => window.order.map(([name]) => name)), [
    'put',
    'endpoints',
  ]);
}

test('an insecure endpoint reply asks before connecting, and Connect goes on', async (t) => {
  const page = await open(t);
  await keyedLan(page);
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order.map(([name]) => name)), [
    'put',
    'endpoints',
    'connect',
  ]);
  assert.deepEqual(page.errors, []);
});

test('cancelling the insecure confirm takes the endpoint back and never connects', async (t) => {
  const page = await open(t);
  await keyedLan(page);
  await page.evaluate(() => window.answer(false));
  await page.until(() => window.order.length === 3);
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      last: window.order.at(-1)[1],
      added: !!window.account('local'),
      open: window.settingsPart('dialog.picker')?.dataset.picker,
    })),
    {
      order: ['put', 'endpoints', 'endpoints'],
      last: { remove: { model: [{ name: 'LOCAL_API_KEY', url: lan }] } },
      added: false,
      open: 'connect',
    }
  );
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]').pending);
  assert.deepEqual(page.errors, []);
});

test('with the vault’s own field, Connect without a key connects and enters nothing', async (t) => {
  const page = await open(t, { entry: 'frame' });
  await choose(page);
  assert.deepEqual(
    await page.evaluate(() => ({
      label: window.settingsPart('dialog.picker .entry-label').textContent,
      hint: window.settingsPart('dialog.picker form.key .hint').textContent,
      button: window.settingsPart('dialog.picker [data-action=save]').textContent.trim(),
    })),
    {
      label: 'Local or self-hosted API key (optional)',
      hint: 'You type the API key in the vault’s own field next. Or connect without one.',
      button: 'Connect without a key',
    }
  );
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});
