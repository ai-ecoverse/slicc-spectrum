import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', providers: 'all', vault: 'secrets' })}`
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
      [settings, 'connect'],
    ]) {
      const real = port[name].bind(port);
      port[name] = (...args) => {
        window.order.push(name);
        return real(...args);
      };
    }
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

async function fill(page, scope, values) {
  for (const [selector, value] of values) {
    await page.evaluate(
      ([scope, selector]) => {
        const input = window.settingsPart(`${scope} ${selector}`);
        input.value = '';
        input.focus();
        return true;
      },
      [scope, selector]
    );
    await page.type(value);
  }
}

async function add(page, id, values) {
  await click(page, '[data-action=add-provider]');
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await click(page, `.option[data-provider="${id}"]`);
  await page.until(() => !!window.settingsPart('dialog.picker input[data-field=value]'));
  await fill(page, 'dialog.picker', values);
  await click(page, 'dialog.picker [data-action=save]');
}

async function edit(page, id, values) {
  await page.evaluate((id) => {
    window.model.settings.disconnect(id);
    window.order = [];
    return true;
  }, id);
  await click(page, `.account[data-id="${id}"] [data-action=connect]`);
  await page.until((id) => !!window.settingsPart(`form.key[data-id="${id}"]`), id);
  await fill(page, `form.key[data-id="${id}"]`, values);
  await click(page, `form.key[data-id="${id}"] [data-action=save]`);
  await page.until((id) => window.account(id).status === 'connected', id);
}

const key = 'cf-key-0123456789';

test('the first save puts the key with every vault setting, then connects', async (t) => {
  const page = await open(t);
  await add(page, 'cloudflare', [
    ['input[data-field=value]', key],
    ['input[data-account-field=account]', 'acct-1'],
    ['input[data-account-field=gateway]', 'gw-1'],
  ]);
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts.at(-1)), {
    name: 'CLOUDFLARE_WORKERS_AI_API_KEY',
    options: {
      kind: 'model',
      provider: 'cloudflare',
      settings: { CLOUDFLARE_ACCOUNT_ID: 'acct-1', CLOUDFLARE_GATEWAY_ID: 'gw-1' },
    },
  });
  assert.deepEqual(await page.evaluate(() => window.order), ['put', 'connect']);
  assert.deepEqual(page.errors, []);
});

test('a field edit without a new key sends the full settings and keeps the key', async (t) => {
  const page = await open(t);
  await add(page, 'cloudflare', [
    ['input[data-field=value]', key],
    ['input[data-account-field=account]', 'acct-1'],
    ['input[data-account-field=gateway]', 'gw-1'],
  ]);
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  await edit(page, 'cloudflare', [
    ['input[data-account-field=account]', 'acct-2'],
    ['input[data-account-field=gateway]', 'gw-1'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.order), ['settings', 'connect']);
  assert.deepEqual(await page.evaluate(() => window.model.vault.settingsCalls), [
    {
      name: 'CLOUDFLARE_WORKERS_AI_API_KEY',
      kind: 'model',
      settings: { CLOUDFLARE_ACCOUNT_ID: 'acct-2', CLOUDFLARE_GATEWAY_ID: 'gw-1' },
    },
  ]);
  assert.equal(await page.evaluate(() => window.model.vault.puts.length), 1);
  assert.deepEqual(page.errors, []);
});

test('Azure’s endpoint is a setting when bare and an endpoint when https, and a switch cleans up', async (t) => {
  const page = await open(t);
  const url = 'https://harbor.openai.azure.example';
  const name = 'AZURE_OPENAI_API_KEY';
  await add(page, 'azure-openai', [
    ['input[data-field=value]', 'az-key-0123456789'],
    ['input[data-account-field=endpoint]', 'harbor'],
    ['input[data-account-field=deployment]', 'harbor-gpt'],
  ]);
  await page.until(() => window.account('azure-openai')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts.at(-1).options.settings), {
    AZURE_OPENAI_RESOURCE_NAME: 'harbor',
  });
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), []);
  await edit(page, 'azure-openai', [
    ['input[data-account-field=endpoint]', url],
    ['input[data-account-field=deployment]', 'harbor-gpt'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.model.vault.settingsCalls.at(-1).settings), {});
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [
    { add: { model: [{ name, url }] } },
  ]);
  await edit(page, 'azure-openai', [
    ['input[data-account-field=endpoint]', 'harbor'],
    ['input[data-account-field=deployment]', 'harbor-gpt'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.model.vault.settingsCalls.at(-1).settings), {
    AZURE_OPENAI_RESOURCE_NAME: 'harbor',
  });
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges.at(-1)), {
    remove: { model: [{ name, url }] },
  });
  assert.deepEqual(await page.evaluate(() => window.order), ['settings', 'endpoints', 'connect']);
  assert.deepEqual(page.errors, []);
});

test('a refused setting shows on its field and connect never runs', async (t) => {
  const page = await open(t);
  await add(page, 'cloudflare', [
    ['input[data-field=value]', key],
    ['input[data-account-field=account]', 'bad-acct'],
  ]);
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault refused CLOUDFLARE_ACCOUNT_ID. Check that value and try again.'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order,
      invalid: window
        .settingsPart('dialog.picker input[data-account-field=account]')
        .getAttribute('aria-invalid'),
    })),
    { order: ['put'], invalid: 'true' }
  );
  assert.deepEqual(page.errors, []);
});
