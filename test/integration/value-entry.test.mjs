import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, query) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', vault: 'secrets', entry: 'frame', ...query })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.composer = (...path) =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', ...path);
    window.frameIn = (host) => host?.shadowRoot?.querySelector('[data-vault-value]');
    window.hosts = {
      composer: () => window.composer('form.secret slicc-vault-value'),
      add: () => window.settingsPart('slicc-secrets', '[data-form=add] slicc-vault-value'),
      picker: () => window.settingsPart('dialog.picker [data-entry] slicc-vault-value'),
    };
    window.puts = [];
    const { vault } = window.model;
    const put = vault.put.bind(vault);
    vault.put = (...args) => {
      window.puts.push(args[0]);
      return put(...args);
    };
    return true;
  });
  return page;
}

async function typeInFrame(page, find, value) {
  await page.until(
    (find) =>
      !!window.frameIn(window.hosts[find]())?.querySelector('[data-action=save]:not([disabled])'),
    find
  );
  await page.evaluate(
    ([find, value]) => {
      const frame = window.frameIn(window.hosts[find]());
      frame.querySelector('input').value = value;
      frame.querySelector('[data-action=save]').click();
      return true;
    },
    [find, value]
  );
}

const sample = 'tide-sample-value-0042';

async function sharePopup(page) {
  await page.until(() => !!window.composer());
  await page.evaluate(() => {
    window.composer().openPopup('secret');
    return true;
  });
  await page.until(() => !!window.composer('form.secret input[name=name]'));
  await page.evaluate(() => window.composer('form.secret input[name=name]').focus());
}

test('Share a secret opens the vault’s field for a new name and attaches the name on done', async (t) => {
  const page = await open(t);
  await sharePopup(page);
  await page.insert('tide token');
  assert.equal(await page.evaluate(() => !!window.composer('[data-action=replace-secret]')), false);
  assert.equal(
    await page.evaluate(() => !!window.composer('form.secret input[type=password]')),
    false
  );
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(() => !!window.composer('form.secret[data-entry] slicc-vault-value'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered), [{ name: 'TIDE_TOKEN' }]);
  await typeInFrame(page, 'composer', sample);
  await page.until(
    () =>
      window.composer('swc-upload-attachment[data-kind=secret] [slot=title]')?.textContent ===
      'TIDE_TOKEN'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      puts: window.puts,
      popup: !!window.composer('form.secret'),
      sealed: window.model.vault.list().secrets.some(({ name }) => name === 'TIDE_TOKEN'),
      leaked: document.documentElement.outerHTML.includes('tide-sample'),
    })),
    { puts: [], popup: false, sealed: true, leaked: false }
  );
  assert.deepEqual(page.errors, []);
});

test('an existing name shares at once, or replaces through a confirm and the field, and Back cancels', async (t) => {
  const page = await open(t);
  await sharePopup(page);
  const existing = await page.evaluate(
    () =>
      window.model.vault
        .list()
        .secrets.find(({ kind, state }) => kind === 'secret' && state !== 'removed').name
  );
  await page.insert(existing);
  await page.until(() => !!window.composer('[data-action=replace-secret]'));
  await page.evaluate(() => window.composer('[data-action=replace-secret]').click());
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() =>
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click()
  );
  await page.until(() => !!window.composer('form.secret[data-entry] slicc-vault-value'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered), [
    { name: existing, replace: true },
  ]);
  await page.evaluate(() => window.composer('[data-action=back-secret]').click());
  await page.until(() => window.model.vault.cancelled.length === 1);
  await page.until(() => !!window.composer('form.secret input[name=name]'));
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(
    (existing) =>
      window.composer('swc-upload-attachment[data-kind=secret] [slot=title]')?.textContent ===
      existing,
    existing
  );
  assert.deepEqual(await page.evaluate(() => [window.model.vault.entered.length, window.puts]), [
    1,
    [],
  ]);
  assert.deepEqual(page.errors, []);
});

test('Escape in the vault’s field closes the popup and cancels the request', async (t) => {
  const page = await open(t);
  await sharePopup(page);
  await page.insert('reef key');
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(
    () => !!window.frameIn(window.composer('form.secret slicc-vault-value'))?.querySelector('input')
  );
  await page.evaluate(() => {
    window
      .frameIn(window.composer('form.secret slicc-vault-value'))
      .querySelector('input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  });
  await page.until(() => !window.composer('form.secret'));
  await page.until(() => window.model.vault.cancelled.length === 1);
  assert.deepEqual(page.errors, []);
});

async function secretsPage(page) {
  await page.evaluate(() => {
    window.secrets = (...path) => window.settingsPart('slicc-secrets', ...path);
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.secrets?.('[data-action=add-secret]'));
}

test('Settings › Secrets adds through Next and the vault’s field, and Replace opens the field at once', async (t) => {
  const page = await open(t);
  await secretsPage(page);
  await page.evaluate(() => window.secrets('[data-action=add-secret]').click());
  await page.until(() => !!window.secrets('[data-form=add] input[data-field=name]'));
  assert.equal(
    await page.evaluate(() => !!window.secrets('[data-form=add] input[type=password]')),
    false
  );
  await page.evaluate(() => window.secrets('[data-form=add] input[data-field=name]').focus());
  await page.insert('PIER_TOKEN');
  await page.evaluate(() => window.secrets('[data-action=enter-value]').click());
  await page.until(() => !!window.secrets('[data-form=add][data-entry] slicc-vault-value'));
  await typeInFrame(page, 'add', sample);
  await page.until(() => !window.secrets('[data-form]'));
  assert.ok(
    await page.evaluate(() =>
      window.model.vault.list().secrets.some(({ name }) => name === 'PIER_TOKEN')
    )
  );
  await page.evaluate(() =>
    window.secrets('[data-secret=PIER_TOKEN] [data-action=replace]').click()
  );
  await page.until(() => !!window.secrets('[data-form=replace][data-entry] slicc-vault-value'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered), [
    { name: 'PIER_TOKEN' },
    { name: 'PIER_TOKEN', replace: true },
  ]);
  await page.evaluate(() => window.secrets('[data-form=replace] [data-action=cancel]').click());
  await page.until(() => window.model.vault.cancelled.length === 1);
  assert.deepEqual(await page.evaluate(() => window.puts), []);
  assert.deepEqual(page.errors, []);
});

test('Settings › Accounts opens the field with the settings checked at enter, then connects', async (t) => {
  const page = await open(t, { providers: 'all' });
  await page.evaluate(() => {
    window.app.show('settings');
    window.account = (id) => window.model.settings.accounts().find((item) => item.id === id);
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-provider]'));
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="cloudflare"]').click()
  );
  await page.until(() => !!window.settingsPart('dialog.picker [data-action=enter-key]'));
  assert.equal(
    await page.evaluate(() => !!window.settingsPart('dialog.picker input[type=password]')),
    false
  );
  for (const [field, value] of [
    ['account', 'acct-1'],
    ['gateway', 'gw-1'],
  ]) {
    await page.evaluate(
      (field) => window.settingsPart(`dialog.picker input[data-account-field=${field}]`).focus(),
      field
    );
    await page.insert(value);
  }
  await page.evaluate(() => window.settingsPart('dialog.picker [data-action=enter-key]').click());
  await page.until(() => !!window.settingsPart('dialog.picker [data-entry] slicc-vault-value'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered), [
    {
      name: 'CLOUDFLARE_WORKERS_AI_API_KEY',
      kind: 'model',
      provider: 'cloudflare',
      settings: { CLOUDFLARE_ACCOUNT_ID: 'acct-1', CLOUDFLARE_GATEWAY_ID: 'gw-1' },
    },
  ]);
  await typeInFrame(page, 'picker', 'cf-key-0123456789');
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.puts), []);
  assert.deepEqual(page.errors, []);
});

test('an account without fields opens the vault’s field at once, and Back leaves it', async (t) => {
  const page = await open(t, { providers: 'all' });
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-provider]'));
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="mistral"]').click()
  );
  await page.until(() => !!window.settingsPart('dialog.picker [data-entry] slicc-vault-value'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered.map(({ kind }) => kind)), [
    'model',
  ]);
  await page.evaluate(() => window.settingsPart('dialog.picker [data-action=back-key]').click());
  await page.until(() => window.model.vault.cancelled.length === 1);
  await page.until(() => !!window.settingsPart('dialog.picker .option[data-provider="mistral"]'));
  assert.deepEqual(page.errors, []);
});

test('valueEntry says this UI types values only in the vault’s field', async (t) => {
  const page = await open(t);
  assert.equal(
    await page.evaluate(async () => (await import('/dist/slicc-ui.js')).valueEntry),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('a kept key can change only its settings, and a vault refusal at enter shows on its field', async (t) => {
  const page = await open(t, { providers: 'all' });
  await page.evaluate(() => {
    window.app.show('settings');
    window.account = (id) => window.model.settings.accounts().find((item) => item.id === id);
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-provider]'));
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="cloudflare"]').click()
  );
  await page.until(() => !!window.settingsPart('dialog.picker [data-action=enter-key]'));
  await page.evaluate(() =>
    window.settingsPart('dialog.picker input[data-account-field=account]').focus()
  );
  await page.insert('bad-acct');
  await page.evaluate(() => window.settingsPart('dialog.picker [data-action=enter-key]').click());
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault refused CLOUDFLARE_ACCOUNT_ID. Check that value and try again.'
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .settingsPart('dialog.picker input[data-account-field=account]')
        .getAttribute('aria-invalid')
    ),
    'true'
  );
  await page.evaluate(() => {
    window.settingsPart('dialog.picker input[data-account-field=account]').value = '';
    window.settingsPart('dialog.picker input[data-account-field=account]').focus();
    return true;
  });
  await page.insert('acct-1');
  await page.evaluate(() => window.settingsPart('dialog.picker [data-action=enter-key]').click());
  await typeInFrame(page, 'picker', 'cf-key-0123456789');
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  await page.until(() => !window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() => {
    window.model.settings.disconnect('cloudflare');
    return true;
  });
  await page.until(
    () => !!window.settingsPart('.account[data-id="cloudflare"] [data-action=connect]')
  );
  await page.evaluate(() =>
    window.settingsPart('.account[data-id="cloudflare"] [data-action=connect]').click()
  );
  await page.until(
    () => !!window.settingsPart('form.key[data-id="cloudflare"] [data-action=save]')
  );
  await page.evaluate(() => {
    const input = window.settingsPart(
      'form.key[data-id="cloudflare"] input[data-account-field=account]'
    );
    input.value = '';
    input.focus();
    return true;
  });
  await page.insert('acct-2');
  await page.evaluate(() =>
    window.settingsPart('form.key[data-id="cloudflare"] [data-action=save]').click()
  );
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  assert.deepEqual(
    await page.evaluate(() => ({
      settings: window.model.vault.settingsCalls.at(-1)?.settings,
      entered: window.model.vault.entered.length,
      puts: window.puts,
    })),
    {
      settings: { CLOUDFLARE_ACCOUNT_ID: 'acct-2' },
      entered: 1,
      puts: [],
    }
  );
  assert.deepEqual(page.errors, []);
});

test('a locked vault unlocks in the field, and an EEXIST at enter shows in the popup', async (t) => {
  const page = await open(t, { vault: 'locked' });
  await page.evaluate(async () => {
    for (const { id } of window.model.vault.status().waiting) await window.model.vault.cancel(id);
    return true;
  });
  await sharePopup(page);
  await page.insert('harbor deploy');
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(
    () =>
      !!window
        .frameIn(window.composer('form.secret slicc-vault-value'))
        ?.querySelector('[data-action=unlock]')
  );
  await page.screenshot(new URL('share-locked.png', page.dir));
  await page.evaluate(() => {
    window
      .frameIn(window.composer('form.secret slicc-vault-value'))
      .querySelector('[data-action=unlock]')
      .click();
    return true;
  });
  await typeInFrame(page, 'composer', sample);
  await page.until(
    () =>
      window.composer('swc-upload-attachment[data-kind=secret] [slot=title]')?.textContent ===
      'HARBOR_DEPLOY'
  );
  await page.evaluate(() => {
    const enter = window.model.vault.enter;
    window.model.vault.enter = async (options) => {
      const error = new Error(`${options.name} already holds a value; replace it instead`);
      error.code = 'EEXIST';
      throw error;
    };
    window.restore = enter;
    return true;
  });
  await sharePopup(page);
  await page.insert('fresh name');
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(
    () =>
      window.composer('form.secret [data-error]')?.textContent.trim() ===
      'FRESH_NAME already holds a value; replace it instead'
  );
  assert.deepEqual(page.errors, []);
});

for (const [color, width] of [
  ['light', 1280],
  ['dark', 1280],
  ['light', 420],
])
  test(`the value field in the composer, Settings › Secrets and Accounts, ${color} ${width}`, async (t) => {
    const page = await open(t, { color, providers: 'all' });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
    await new Promise((resolve) => setTimeout(resolve, 400));
    await sharePopup(page);
    await page.insert('tide token');
    await page.evaluate(() => window.composer('[data-action=share-secret]').click());
    await page.until(
      () =>
        !!window
          .frameIn(window.composer('form.secret slicc-vault-value'))
          ?.querySelector('[data-action=save]:not([disabled])')
    );
    await page.screenshot(new URL(`composer-${color}-${width}.png`, page.dir));
    await page.evaluate(() => {
      window.composer().popup = null;
      window.app.show('settings');
      return true;
    });
    await page.until(() => window.model.vault.cancelled.length === 1);
    await secretsPage(page);
    await page.evaluate(() => window.secrets('[data-action=add-secret]').click());
    await page.until(() => !!window.secrets('[data-form=add] input[data-field=name]'));
    await page.evaluate(() => window.secrets('[data-form=add] input[data-field=name]').focus());
    await page.insert('PIER_TOKEN');
    await page.evaluate(() => {
      window.secrets('[data-action=enter-value]').click();
      return true;
    });
    await page.until(
      () =>
        !!window
          .frameIn(window.secrets('[data-form=add] slicc-vault-value'))
          ?.querySelector('[data-action=save]:not([disabled])')
    );
    await page.evaluate(() =>
      window.secrets('[data-form=add]').scrollIntoView({ block: 'center' })
    );
    await page.screenshot(new URL(`secrets-add-${color}-${width}.png`, page.dir));
    await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
    await page.until(() => window.settingsPart('dialog.picker')?.open);
    await page.evaluate(() =>
      window.settingsPart('dialog.picker .option[data-provider="mistral"]').click()
    );
    await page.until(
      () =>
        !!window.frameIn(window.hosts.picker())?.querySelector('[data-action=save]:not([disabled])')
    );
    await page.screenshot(new URL(`account-key-${color}-${width}.png`, page.dir));
    const sideways = await page.evaluate(() => {
      const host = window.hosts.picker();
      const box = host.getBoundingClientRect();
      return box.right <= window.innerWidth && box.width > 0;
    });
    assert.equal(sideways, true);
    assert.deepEqual(page.errors, []);
  });

async function press(page, point) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}

const closes = {
  cancel: async (page) => {
    await page.evaluate(() => window.composer('[data-action=cancel-secret]').click());
  },
  outside: async (page) => {
    const point = await page.evaluate(() => {
      const box = window.composer('form.secret').getBoundingClientRect();
      return { x: box.left + box.width / 2, y: Math.max(1, box.top - 40) };
    });
    await press(page, point);
  },
  escape: async (page) => {
    await page.evaluate(() =>
      window.composer('form.secret input, form.secret swc-button')?.focus()
    );
    await page.evaluate(() => {
      window
        .composer('form.secret')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
        );
      return true;
    });
  },
};

for (const [how, close] of Object.entries(closes)) {
  test(`with the vault's field open, ${how} closes the popup and cancels the enter request`, async (t) => {
    const page = await open(t);
    await sharePopup(page);
    await page.insert('tide token');
    await page.evaluate(() => window.composer('[data-action=share-secret]').click());
    await page.until(
      () =>
        !!window
          .frameIn(window.composer('form.secret[data-entry] slicc-vault-value'))
          ?.querySelector('input')
    );
    const inside = await page.evaluate(() => {
      const box = window.composer('form.secret .lead').getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await press(page, inside);
    assert.equal(await page.evaluate(() => !!window.composer('form.secret[data-entry]')), true);
    assert.equal(await page.evaluate(() => window.model.vault.entered.length), 1);
    await close(page);
    await page.until(() => !window.composer('form.secret'));
    await page.until(() => window.model.vault.cancelled.length === 1);
    assert.deepEqual(
      await page.evaluate(() => [
        window.model.vault.cancelled[0].startsWith('enter-'),
        window.composer().entry,
        window.puts,
      ]),
      [true, null, []]
    );
    assert.deepEqual(page.errors, []);
  });

  test(`with the name only, ${how} closes the popup without an enter request`, async (t) => {
    const page = await open(t);
    await sharePopup(page);
    await page.insert('tide token');
    await close(page);
    await page.until(() => !window.composer('form.secret'));
    assert.deepEqual(
      await page.evaluate(() => [window.model.vault.entered, window.model.vault.cancelled]),
      [[], []]
    );
    assert.deepEqual(page.errors, []);
  });

  test(`without enter, ${how} closes the popup and clears the typed value`, async (t) => {
    const page = await open(t, { entry: 'input' });
    await sharePopup(page);
    await page.insert('tide token');
    await page.evaluate(() => window.composer('form.secret input[name=value]').focus());
    await page.insert(sample);
    await page.evaluate(() => {
      window.typed = window.composer('form.secret input[name=value]');
      return true;
    });
    await close(page);
    await page.until(() => !window.composer('form.secret'));
    assert.deepEqual(await page.evaluate(() => [window.typed.value, window.puts]), ['', []]);
    assert.deepEqual(page.errors, []);
  });
}

test('with enter and the vault away, no surface ever shows a value input', async (t) => {
  const page = await open(t, { vault: 'waiting', providers: 'all' });
  const inputs = () => {
    const roots = [document];
    let found = 0;
    for (let index = 0; index < roots.length; index++) {
      found += roots[index].querySelectorAll(
        'input[type=password], input[name=value], input[data-field=value]'
      ).length;
      for (const node of roots[index].querySelectorAll('*'))
        if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    return found;
  };
  await sharePopup(page);
  await page.insert('tide token');
  assert.equal(await page.evaluate(inputs), 0);
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(
    () =>
      window.composer('swc-upload-attachment[data-kind=secret] [slot=title]')?.textContent ===
      'TIDE_TOKEN'
  );
  assert.deepEqual(await page.evaluate(() => window.model.vault.entered), []);
  await page.evaluate(() => {
    window.app.show('settings');
    window.model.settings.disconnect('openai');
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-provider]'));
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="mistral"]').click()
  );
  await page.until(() => !!window.settingsPart('dialog.picker form.key'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => [
      window.settingsPart('dialog.picker form.key .hint')?.textContent,
      window.settingsPart('dialog.picker [data-action=enter-key]')?.hasAttribute('disabled'),
      window.model.vault.entered.length,
    ]),
    ['Waiting for the vault', true, 0]
  );
  assert.equal(await page.evaluate(inputs), 0);
  assert.deepEqual(await page.evaluate(() => window.puts), []);
  assert.deepEqual(page.errors, []);
});

test('an open field stays through a brief away, and a vault swap or closing Settings cancels the request', async (t) => {
  const page = await open(t, { providers: 'all' });
  await sharePopup(page);
  await page.insert('tide token');
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(() => !!window.composer('form.secret[data-entry] slicc-vault-value'));
  await page.evaluate(() => {
    window.model.vault.wait();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.composer('form.secret[data-entry] slicc-vault-value'),
      !!window.composer('form.secret input[name=value]'),
    ]),
    [true, false]
  );
  await page.evaluate(() => {
    window.model.vault.arrive();
    window.composer().closeSecret();
    window.app.show('settings');
    return true;
  });
  await page.until(() => window.model.vault.cancelled.length === 1);
  await secretsPage(page);
  await page.evaluate(() => window.secrets('[data-action=add-secret]').click());
  await page.until(() => !!window.secrets('[data-form=add] input[data-field=name]'));
  await page.evaluate(() => window.secrets('[data-form=add] input[data-field=name]').focus());
  await page.insert('PIER_TOKEN');
  await page.evaluate(() => window.secrets('[data-action=enter-value]').click());
  await page.until(() => !!window.secrets('[data-form=add][data-entry] slicc-vault-value'));
  await page.evaluate(async () => {
    const { createDummyModel } = await import('/dist/slicc-dummy.js');
    const other = createDummyModel({ delay: 5, vault: 'secrets', entry: 'frame' });
    const element = window.settingsPart('slicc-secrets');
    element.model = { ...element.model, vault: other.vault };
    return true;
  });
  await page.until(() => window.model.vault.cancelled.length === 2);
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="mistral"]').click()
  );
  await page.until(() => !!window.hosts.picker());
  await page.evaluate(() => {
    window.settingsPart().remove();
    return true;
  });
  await page.until(() => window.model.vault.cancelled.length === 3);
  assert.deepEqual(page.errors, []);
});

test('late or stale frame events after Back or a new form change nothing and throw nothing', async (t) => {
  const page = await open(t, { providers: 'all' });
  await page.evaluate(() => {
    window.late = (host, events) => {
      for (const detail of events)
        host.dispatchEvent(
          new CustomEvent('vault-value', { detail, bubbles: true, composed: true })
        );
    };
    return true;
  });
  await sharePopup(page);
  await page.insert('tide token');
  await page.evaluate(() => window.composer('[data-action=share-secret]').click());
  await page.until(() => !!window.composer('form.secret[data-entry] slicc-vault-value'));
  await page.evaluate(() => {
    const host = window.hosts.composer();
    const request = window.composer().entry.request;
    window.composer('[data-action=back-secret]').click();
    window.late(host, [
      { event: 'gone', request, state: 'cancelled' },
      { event: 'done', request, state: 'sealed', name: 'TIDE_TOKEN' },
      { event: 'error', code: 'EIO', message: 'Stale.' },
      { event: 'escape' },
    ]);
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.composer('form.secret input[name=name]'),
      window.composer('form.secret [data-error]')?.textContent ?? null,
      window.composer().attachments.length,
    ]),
    [true, null, 0]
  );
  await page.evaluate(() => {
    window.composer().closeSecret();
    window.app.show('settings');
    return true;
  });
  await secretsPage(page);
  await page.evaluate(() => window.secrets('[data-action=add-secret]').click());
  await page.until(() => !!window.secrets('[data-form=add] input[data-field=name]'));
  await page.evaluate(() => window.secrets('[data-form=add] input[data-field=name]').focus());
  await page.insert('PIER_TOKEN');
  await page.evaluate(() => window.secrets('[data-action=enter-value]').click());
  await page.until(() => !!window.secrets('[data-form=add][data-entry] slicc-vault-value'));
  await page.evaluate(() => {
    const host = window.hosts.add();
    const element = window.settingsPart('slicc-secrets');
    const request = element.entry.request;
    element.open({ kind: 'add' });
    window.late(host, [
      { event: 'gone', request, state: 'cancelled' },
      { event: 'error', code: 'EIO', message: 'Stale.' },
      { event: 'escape' },
    ]);
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.secrets('[data-form=add] input[data-field=name]'),
      window.secrets('[data-error=form]')?.textContent ?? null,
    ]),
    [true, null]
  );
  await page.evaluate(() => window.settingsPart('[data-action=add-provider]').click());
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await page.evaluate(() =>
    window.settingsPart('dialog.picker .option[data-provider="cloudflare"]').click()
  );
  await page.until(() => !!window.settingsPart('dialog.picker input[data-account-field=account]'));
  await page.evaluate(() =>
    window.settingsPart('dialog.picker input[data-account-field=account]').focus()
  );
  await page.insert('acct-1');
  await page.evaluate(() => window.settingsPart('dialog.picker [data-action=enter-key]').click());
  await page.until(() => !!window.hosts.picker());
  await page.evaluate(() => {
    const host = window.hosts.picker();
    const settings = window.settingsPart();
    const request = settings.keyEntry.request;
    window.settingsPart('dialog.picker [data-action=back-key]').click();
    window.late(host, [
      { event: 'gone', request, state: 'cancelled' },
      { event: 'done', request, state: 'sealed' },
      { event: 'error', code: 'EIO', message: 'Stale.' },
      { event: 'escape' },
    ]);
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.settingsPart('dialog.picker [data-action=enter-key]'),
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ?? null,
      window.model.settings.accounts().find((account) => account.id === 'cloudflare')?.status ??
        null,
    ]),
    [true, null, null]
  );
  assert.deepEqual(page.errors, []);
});
