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
      [vault, 'remove'],
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

const record = () =>
  window.model.vault
    .list()
    .secrets.find((secret) => secret.name === 'LOCAL_API_KEY' && secret.state !== 'removed')
    ?.kind ?? null;

test('cancelling the insecure confirm takes the endpoint back, removes the new key and leaves the form usable', async (t) => {
  const page = await open(t);
  await keyedLan(page);
  await page.evaluate(() => window.answer(false));
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]')?.pending);
  await page.until(
    () =>
      !window.model.vault
        .list()
        .secrets.some((s) => s.name === 'LOCAL_API_KEY' && s.state !== 'removed')
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      last: window.order[2][1],
      connects: window.model.settings.connects.length,
      added: !!window.account('local'),
      open: window.settingsPart('dialog.picker')?.dataset.picker,
      endpoint: window.settingsPart('dialog.picker input[data-account-field=endpoint]').value,
    })),
    {
      order: ['put', 'endpoints', 'endpoints', 'remove'],
      last: { remove: { model: [{ name: 'LOCAL_API_KEY', url: lan }] } },
      connects: 0,
      added: false,
      open: 'connect',
      endpoint: lan,
    }
  );
  await fill(page, [['input[data-field=value]', 'local-key-0123456789']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => !!window.dialog());
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(page.errors, []);
});

test('cancelling the insecure confirm keeps a key that was already in the vault', async (t) => {
  const page = await open(t);
  await page.evaluate(() =>
    window.model.vault
      .put('LOCAL_API_KEY', 'local-key-older-0123', undefined, { kind: 'model', provider: 'local' })
      .then(() => {
        window.order = [];
        return true;
      })
  );
  await keyedLan(page);
  await page.evaluate(() => window.answer(false));
  await page.until(() => window.order.length === 3);
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]')?.pending);
  assert.equal(await page.evaluate(record), 'model');
  assert.equal(await page.evaluate(() => window.model.settings.connects.length), 0);
  assert.deepEqual(page.errors, []);
});

test('a keyless connect to a plain-network URL registers nothing and asks nothing', async (t) => {
  const page = await open(t);
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', lan]]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => ({ order: window.order, dialog: window.dialog() })), {
    order: [['connect', 'local']],
    dialog: null,
  });
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

test('when the vault refuses a keyed http endpoint, the field shows its sentence and connect never runs', async (t) => {
  const page = await open(t, { vault: 'endpoints-fail' });
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', 'http://203.0.113.7:11434'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault refused that endpoint. Check the address and try again.'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      url: window.order[1][1],
      invalid: window
        .settingsPart('dialog.picker input[data-account-field=endpoint]')
        .getAttribute('aria-invalid'),
      dialog: window.dialog(),
      added: !!window.account('local'),
    })),
    {
      order: ['put', 'endpoints'],
      url: { add: { model: [{ name: 'LOCAL_API_KEY', url: 'http://203.0.113.7:11434' }] } },
      invalid: 'true',
      dialog: null,
      added: false,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('a keyed reconnect after a keyless connect binds the same endpoint to the new record', async (t) => {
  const page = await open(t);
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker'));
  await page.evaluate(() => {
    window.model.settings.disconnect('local');
    window.order = [];
    return true;
  });
  await click(page, '.account[data-id=local] [data-action=connect]');
  await page.until(() => !!window.settingsPart('form.key[data-id=local] input[data-field=value]'));
  await page.evaluate(() => {
    window.settingsPart('form.key[data-id=local] input[data-field=value]').focus();
    return true;
  });
  await page.type('local-key-0123456789');
  await click(page, 'form.key[data-id=local] [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'LOCAL_API_KEY'],
    ['endpoints', { add: { model: [{ name: 'LOCAL_API_KEY', url: 'http://localhost:11434' }] } }],
    ['connect', 'local'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a keyless connect needs no unlocked vault', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.vault.lock().then(() => true));
  await page.until(() => window.model.vault.status().locked);
  await choose(page);
  assert.equal(
    await page.evaluate(() => !!window.settingsPart('dialog.picker [data-locked]')),
    true
  );
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});

test('a keyless connect doesn’t wait for the vault’s own field', async (t) => {
  const page = await open(t, { vault: 'waiting', entry: 'frame' });
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  assert.deepEqual(
    await page.evaluate(() => ({
      next: window.settingsPart('dialog.picker [data-action=enter-key]').disabled,
      keyless: window.settingsPart('dialog.picker [data-action=save]').disabled,
    })),
    { next: true, keyless: false }
  );
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});

test('a new keyless account with a vault setting field sets nothing on a missing record', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const { settings } = window.model;
    const offered = settings.providers();
    settings.providers = () =>
      offered.map((option) =>
        option.id === 'local'
          ? {
              ...option,
              fields: [
                ...option.fields,
                { name: 'tenant', label: 'Tenant', vaultSetting: 'LOCAL_TENANT' },
              ],
            }
          : option
      );
    return true;
  });
  await choose(page);
  await fill(page, [
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
    ['input[data-account-field=tenant]', 'harbor'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});

test('when the vault won’t take the endpoint back after Cancel, the field says so and nothing connects', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const { vault } = window.model;
    const endpoints = vault.endpoints;
    vault.endpoints = (change) => {
      if (!change.remove) return endpoints(change);
      window.order.push(['endpoints', change]);
      return Promise.reject(new Error('The vault kept http://192.168.1.20:11434. Try again.'));
    };
    return true;
  });
  await keyedLan(page);
  await page.evaluate(() => window.answer(false));
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault kept http://192.168.1.20:11434. Try again.'
  );
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]')?.pending);
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      invalid: window
        .settingsPart('dialog.picker input[data-account-field=endpoint]')
        .getAttribute('aria-invalid'),
      connects: window.model.settings.connects.length,
      open: window.settingsPart('dialog.picker')?.dataset.picker,
    })),
    {
      order: ['put', 'endpoints', 'endpoints', 'remove'],
      invalid: 'true',
      connects: 0,
      open: 'connect',
    }
  );
  assert.deepEqual(page.errors, []);
});

test('Disconnect and Remove of a keyless account leave the vault alone and promise no key', async (t) => {
  const page = await open(t);
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker'));
  await page.evaluate(() => {
    window.order = [];
    return true;
  });
  await click(page, '.account[data-id=local] [data-action=disconnect]');
  await page.until(() => !!window.dialog());
  assert.equal(
    await page.evaluate(() => window.dialog().body),
    'Agents can’t use Local or self-hosted until you connect it again.'
  );
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.account('local')?.status === 'disconnected');
  await page.until(() => !window.dialog());
  await click(page, '.account[data-id=local] [data-action=remove-account]');
  await page.until(() => !!window.dialog());
  assert.equal(await page.evaluate(() => window.dialog().body), 'Models from it stop working.');
  await page.evaluate(() => window.answer(true));
  await page.until(() => !window.account('local'));
  assert.deepEqual(await page.evaluate(() => window.order), []);
  assert.deepEqual(page.errors, []);
});

async function keyedLocal(page) {
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker'));
}

const loading = (page) =>
  page.evaluate(() => {
    const { vault } = window.model;
    vault.list = () => null;
    vault.emit('list', null);
    window.order = [];
    return true;
  });

test('with a locked vault, a typed key holds Save back and is never dropped', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.vault.lock().then(() => true));
  await page.until(() => window.model.vault.status().locked);
  await choose(page);
  await fill(page, [
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
    ['input[data-field=value]', 'local-key-0123456789'],
  ]);
  assert.equal(
    await page.evaluate(() => window.settingsPart('dialog.picker [data-action=save]').disabled),
    true
  );
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => ({
      value: window.settingsPart('dialog.picker input[data-field=value]').value,
      order: window.order,
      locked: !!window.settingsPart('dialog.picker [data-locked]'),
    })),
    { value: 'local-key-0123456789', order: [], locked: true }
  );
  assert.deepEqual(page.errors, []);
});

test('with two custom bases, the insecure confirm names the plain-network URL', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const { settings } = window.model;
    const offered = settings.providers();
    settings.providers = () =>
      offered.map((option) =>
        option.id === 'local'
          ? {
              ...option,
              fields: [...option.fields, { name: 'mirror', label: 'Mirror', customBase: true }],
            }
          : option
      );
    return true;
  });
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', 'https://models.harbor.example'],
    ['input[data-account-field=mirror]', lan],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => !!window.dialog());
  assert.equal(await page.evaluate(() => window.dialog().title), `Connect to ${lan}?`);
  await page.evaluate(() => window.answer(false));
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]')?.pending);
  assert.deepEqual(page.errors, []);
});

const loaded = (page) =>
  page.evaluate(() => {
    const { vault } = window.model;
    delete vault.list;
    vault.emit('list', vault.list());
    return true;
  });

const disabled = (page, selector) =>
  page.evaluate((selector) => !!window.settingsPart(selector)?.disabled, selector);

async function retype(page, values) {
  for (const [selector, value] of values) {
    await page.evaluate((selector) => {
      const input = window.settingsPart(`form.key[data-id=local] ${selector}`);
      input.value = '';
      input.focus();
      return true;
    }, selector);
    await page.type(value);
  }
}

test('while the vault list loads, Disconnect waits, then removes the key', async (t) => {
  const page = await open(t);
  await keyedLocal(page);
  await loading(page);
  await page.until(
    () => window.settingsPart('.account[data-id=local] [data-action=disconnect]')?.disabled
  );
  assert.equal(await disabled(page, '.account[data-id=local] [data-action=remove-account]'), true);
  assert.equal(
    await page.evaluate(
      () =>
        window.settingsPart('.account[data-id=local] ~ .notes [data-notice=loading]')?.textContent
    ),
    'Loading the vault…'
  );
  await loaded(page);
  await page.until(() => !window.settingsPart('[data-notice=loading]'));
  await click(page, '.account[data-id=local] [data-action=disconnect]');
  await page.until(() => !!window.dialog());
  assert.equal(
    await page.evaluate(() => window.dialog().body),
    'Agents can’t use Local or self-hosted until you connect it again. You can restore its key from Removed in Secrets for 30 days.'
  );
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.account('local')?.status === 'disconnected');
  assert.deepEqual(await page.evaluate(() => window.order), [['remove', 'LOCAL_API_KEY']]);
  assert.deepEqual(page.errors, []);
});

test('while the vault list loads, Remove of a keyed account waits, then removes the key', async (t) => {
  const page = await open(t);
  await keyedLocal(page);
  await loading(page);
  await page.until(
    () => window.settingsPart('.account[data-id=local] [data-action=remove-account]')?.disabled
  );
  await loaded(page);
  await click(page, '.account[data-id=local] [data-action=remove-account]');
  await page.until(() => !!window.dialog());
  assert.equal(
    await page.evaluate(() => window.dialog().body),
    'Its key is deleted from the vault. Models from it stop working.'
  );
  await page.evaluate(() => window.answer(true));
  await page.until(() => !window.account('local'));
  assert.deepEqual(await page.evaluate(() => window.order), [['remove', 'LOCAL_API_KEY']]);
  assert.deepEqual(page.errors, []);
});

test('while the vault list loads, a keyed save waits, then binds a changed URL', async (t) => {
  const page = await open(t);
  await keyedLocal(page);
  await page.evaluate(() => {
    window.model.settings.disconnect('local');
    return true;
  });
  await loading(page);
  await click(page, '.account[data-id=local] [data-action=connect]');
  await page.until(() => !!window.settingsPart('form.key[data-id=local] input[data-field=value]'));
  await retype(page, [
    ['input[data-field=value]', 'local-key-9876543210'],
    ['input[data-account-field=endpoint]', 'http://localhost:1234'],
  ]);
  assert.deepEqual(
    await page.evaluate(() => ({
      hint: window.settingsPart('form.key[data-id=local] .hint').textContent,
      disabled: window.settingsPart('form.key[data-id=local] [data-action=save]').disabled,
    })),
    { hint: 'Loading the vault…', disabled: true }
  );
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => ({
      value: window.settingsPart('form.key[data-id=local] input[data-field=value]').value,
      order: window.order,
    })),
    { value: 'local-key-9876543210', order: [] }
  );
  await loaded(page);
  await click(page, 'form.key[data-id=local] [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'LOCAL_API_KEY'],
    [
      'endpoints',
      {
        remove: { model: [{ name: 'LOCAL_API_KEY', url: 'http://localhost:11434' }] },
        add: { model: [{ name: 'LOCAL_API_KEY', url: 'http://localhost:1234' }] },
      },
    ],
    ['connect', 'local'],
  ]);
  assert.deepEqual(page.errors, []);
});

async function keylessThenLoading(page, url) {
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', url]]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker'));
  await page.evaluate(() => {
    window.model.settings.disconnect('local');
    return true;
  });
  await loading(page);
  await click(page, '.account[data-id=local] [data-action=connect]');
  await page.until(() => !!window.settingsPart('form.key[data-id=local] input[data-field=value]'));
  await retype(page, [['input[data-field=value]', 'local-key-0123456789']]);
  assert.equal(await disabled(page, 'form.key[data-id=local] [data-action=save]'), true);
  await loaded(page);
  await click(page, 'form.key[data-id=local] [data-action=save]');
}

test('while the vault list loads, a key for a keyless account waits, then binds its URL', async (t) => {
  const page = await open(t);
  await keylessThenLoading(page, 'http://localhost:11434');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'LOCAL_API_KEY'],
    ['endpoints', { add: { model: [{ name: 'LOCAL_API_KEY', url: 'http://localhost:11434' }] } }],
    ['connect', 'local'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('after the vault list loads, Cancel removes the key a keyless account just got', async (t) => {
  const page = await open(t);
  await keylessThenLoading(page, lan);
  await page.until(() => !!window.dialog());
  await page.evaluate(() => window.answer(false));
  await page.until(() => window.order.some(([name]) => name === 'remove'));
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'LOCAL_API_KEY'],
    ['endpoints', { add: { model: [{ name: 'LOCAL_API_KEY', url: lan }] } }],
    ['endpoints', { remove: { model: [{ name: 'LOCAL_API_KEY', url: lan }] } }],
    ['remove', 'LOCAL_API_KEY'],
  ]);
  assert.equal(await page.evaluate(() => window.account('local').status), 'disconnected');
  assert.deepEqual(page.errors, []);
});

const reshape = (page, fields) =>
  page.evaluate((fields) => {
    const { settings } = window.model;
    const offered = settings.providers();
    settings.providers = () =>
      offered.map((option) => (option.id === 'local' ? { ...option, fields } : option));
    return true;
  }, fields);

const kept = (page, settings) =>
  page.evaluate(
    (settings) =>
      window.model.vault
        .put('LOCAL_API_KEY', 'local-key-older-0123', undefined, {
          kind: 'model',
          provider: 'local',
          ...(settings ? { settings } : {}),
        })
        .then(() => {
          window.order = [];
          return true;
        }),
    settings
  );

test('a keyOptional provider without custom bases keeps its key optional once a key is kept', async (t) => {
  const page = await open(t);
  await reshape(page, [{ name: 'model', label: 'Model', required: true }]);
  await kept(page);
  await choose(page);
  await fill(page, [['input[data-account-field=model]', 'harbor-7b']]);
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]').disabled);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});

test('cancelling the insecure confirm on a settings-only save puts the old settings back', async (t) => {
  const page = await open(t);
  await reshape(page, [
    { name: 'endpoint', label: 'Endpoint', required: true, customBase: true },
    { name: 'tenant', label: 'Tenant', vaultSetting: 'LOCAL_TENANT' },
  ]);
  await kept(page, { LOCAL_TENANT: 'harbor' });
  await choose(page);
  await fill(page, [
    ['input[data-account-field=endpoint]', lan],
    ['input[data-account-field=tenant]', 'tide'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => !!window.dialog());
  await page.evaluate(() => window.answer(false));
  await page.until(() => window.model.vault.settingsCalls.length === 2);
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      settings: window.model.vault.settingsCalls.map((call) => call.settings),
      connects: window.model.settings.connects.length,
    })),
    {
      order: ['settings', 'endpoints', 'endpoints', 'settings'],
      settings: [{ LOCAL_TENANT: 'tide' }, { LOCAL_TENANT: 'harbor' }],
      connects: 0,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('when connect is refused and the vault won’t take the endpoint back, the field says so', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const { vault, settings } = window.model;
    const endpoints = vault.endpoints;
    vault.endpoints = (change) => {
      if (!change.remove) return endpoints(change);
      window.order.push(['endpoints', change]);
      return Promise.reject(new Error('The vault kept http://localhost:11434. Try again.'));
    };
    settings.connect = async (id) => {
      window.order.push(['connect', id]);
      throw new Error('The server didn’t answer.');
    };
    return true;
  });
  await choose(page);
  await fill(page, [
    ['input[data-field=value]', 'local-key-0123456789'],
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault kept http://localhost:11434. Try again.'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([name]) => name),
      failure: window.settingsPart('dialog.picker .failure[role=alert]')?.textContent.trim(),
      invalid: window
        .settingsPart('dialog.picker input[data-account-field=endpoint]')
        .getAttribute('aria-invalid'),
      added: !!window.account('local'),
    })),
    {
      order: ['put', 'endpoints', 'connect', 'endpoints'],
      failure: 'The server didn’t answer.',
      invalid: 'true',
      added: false,
    }
  );
  assert.deepEqual(page.errors, []);
});

const tenantFields = [
  { name: 'endpoint', label: 'Endpoint', required: true, customBase: true },
  { name: 'tenant', label: 'Tenant', vaultSetting: 'LOCAL_TENANT' },
];

test('with a kept key and a vault without settings, a vault setting edit needs a new key', async (t) => {
  const page = await open(t);
  await reshape(page, tenantFields);
  await kept(page, { LOCAL_TENANT: 'harbor' });
  await page.evaluate(() => {
    window.model.vault.settings = undefined;
    return true;
  });
  await choose(page);
  await fill(page, [
    ['input[data-account-field=endpoint]', 'http://localhost:11434'],
    ['input[data-account-field=tenant]', 'tide'],
  ]);
  assert.equal(await disabled(page, 'dialog.picker [data-action=save]'), true);
  await fill(page, [['input[data-field=value]', 'local-key-9876543210']]);
  await page.until(() => !window.settingsPart('dialog.picker [data-action=save]').disabled);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts.at(-1).options.settings), {
    LOCAL_TENANT: 'tide',
  });
  assert.deepEqual(page.errors, []);
});

test('when the vault won’t put the old settings back after Cancel, the form says so', async (t) => {
  const page = await open(t);
  await reshape(page, tenantFields);
  await kept(page, { LOCAL_TENANT: 'harbor' });
  await page.evaluate(() => {
    const { vault } = window.model;
    const settings = vault.settings.bind(vault);
    let calls = 0;
    vault.settings = (...args) => {
      calls += 1;
      return calls === 1
        ? settings(...args)
        : Promise.reject(new Error('The vault kept LOCAL_TENANT as tide. Try again.'));
    };
    return true;
  });
  await choose(page);
  await fill(page, [
    ['input[data-account-field=endpoint]', lan],
    ['input[data-account-field=tenant]', 'tide'],
  ]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => !!window.dialog());
  await page.evaluate(() => window.answer(false));
  await page.until(
    () =>
      window.settingsPart('dialog.picker .failure[role=alert]')?.textContent.trim() ===
      'The vault kept LOCAL_TENANT as tide. Try again.'
  );
  assert.equal(await page.evaluate(() => window.model.settings.connects.length), 0);
  assert.deepEqual(page.errors, []);
});

test('on a vault that can’t take a key, Disconnect of a keyOptional account still removes its kept key', async (t) => {
  const page = await open(t);
  await kept(page);
  await page.evaluate(() => {
    window.model.vault.put = undefined;
    return true;
  });
  await choose(page);
  await fill(page, [['input[data-account-field=endpoint]', 'http://localhost:11434']]);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker'));
  await page.evaluate(() => {
    window.order = [];
    return true;
  });
  await click(page, '.account[data-id=local] [data-action=disconnect]');
  await page.until(() => !!window.dialog());
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.account('local')?.status === 'disconnected');
  assert.deepEqual(await page.evaluate(() => window.order), [['remove', 'LOCAL_API_KEY']]);
  assert.deepEqual(page.errors, []);
});

test('a keyOptional provider without fields doesn’t open the vault’s field by itself', async (t) => {
  const page = await open(t, { entry: 'frame' });
  await reshape(page, []);
  await choose(page);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => ({
      field: !!window.settingsPart('dialog.picker slicc-vault-value'),
      button: window.settingsPart('dialog.picker [data-action=save]')?.textContent.trim(),
      order: window.order,
    })),
    { field: false, button: 'Connect without a key', order: [] }
  );
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('local')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [['connect', 'local']]);
  assert.deepEqual(page.errors, []);
});
