import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', providers: 'all', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.app.show('settings');
    window.rows = () =>
      [...(window.settingsPart('.accounts[data-group=providers]')?.children ?? [])]
        .filter((node) => node.matches('.account'))
        .map((node) => node.dataset.id);
    window.inner = () => window.$('slicc-app', 'slicc-dock', 'slicc-settings').shadowRoot;
    window.active = () => window.inner().activeElement;
    window.picker = () => window.settingsPart('dialog.picker');
    window.options = () =>
      [...(window.picker()?.querySelectorAll('.option') ?? [])].map(
        (node) => node.dataset.provider
      );
    window.account = (id) =>
      window.model.settings.accounts().find((candidate) => candidate.id === id);
    window.save = () => window.settingsPart('dialog.picker [data-action=save]');
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

async function picker(page) {
  await click(page, '[data-action=add-provider]');
  await page.until(() => window.picker()?.open && window.active()?.localName === 'sp-search');
}

async function choose(page, id) {
  await picker(page);
  await click(page, `.option[data-provider="${id}"]`);
  await page.until((id) => window.picker()?.dataset.picker === 'connect', id);
}

test('Accounts lists connected providers first, then expired, then not connected', async (t) => {
  const page = await open(t);
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    'anthropic',
    'github',
    'ollama',
    'adobe',
    'ai-adobe',
    'amazon-bedrock',
    'openai',
  ]);
  assert.equal(
    await page.evaluate(() => window.settingsPart('[data-action=add-provider]').textContent.trim()),
    'Add a provider'
  );
  assert.deepEqual(page.errors, []);
});

test('without providers(), Settings keeps its rows, order and actions', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/ui/?delay=5&color=light');
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => window.app.show('settings'));
  await page.until(() => !!window.settingsPart('.account[data-id=openai]'));
  assert.deepEqual(
    await page.evaluate(() => ({
      rows: [...window.settingsPart('.accounts').querySelectorAll('.account')].map(
        (row) => row.dataset.id
      ),
      add: !!window.settingsPart('[data-action=add-provider]'),
      remove: !!window.settingsPart('[data-action=remove-account]'),
      group: window.settingsPart('.accounts').dataset.group ?? null,
    })),
    {
      rows: ['anthropic', 'github', 'adobe', 'ai-adobe', 'openai'],
      add: false,
      remove: false,
      group: null,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('the picker filters as you type, walks with the arrows and leaves Added unpickable', async (t) => {
  const page = await open(t);
  await picker(page);
  const all = await page.evaluate(() => window.options());
  assert.equal(all.length, 14);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.picker().querySelectorAll('.option[aria-disabled=true]')].map(
        (node) => node.dataset.provider
      )
    ),
    ['ai-adobe', 'amazon-bedrock', 'anthropic', 'ollama', 'openai']
  );
  assert.equal(
    await page.evaluate(
      () => window.picker().querySelector('.option[data-provider=groq] .tag').textContent
    ),
    'API key'
  );
  await page.type('openai');
  await page.until(() => window.options().join() === 'azure-openai,openai,openai-codex');
  await page.press('ArrowDown');
  await page.until(() => window.active()?.dataset.provider === 'azure-openai');
  await page.press('ArrowDown');
  await page.until(() => window.active()?.dataset.provider === 'openai');
  assert.equal(
    await page.evaluate(() => window.active().querySelector('[data-added]').textContent.trim()),
    'Added'
  );
  await page.press('Enter');
  assert.equal(await page.evaluate(() => window.picker().dataset.picker), 'pick');
  await page.press('ArrowDown');
  await page.until(() => window.active()?.dataset.provider === 'openai-codex');
  await page.press('Home');
  await page.until(() => window.active()?.dataset.provider === 'azure-openai');
  await page.press('ArrowUp');
  await page.until(() => window.active()?.localName === 'sp-search');
  await page.type('zz');
  await page.until(
    () => window.picker().querySelector('.empty')?.textContent === 'No provider matches “openaizz”.'
  );
  await page.press('Escape');
  await page.until(() => !window.picker());
  await page.until(() => window.active()?.dataset.action === 'add-provider');
  assert.deepEqual(page.errors, []);
});

test('Enter in the search picks the first match, and Back returns to it', async (t) => {
  const page = await open(t);
  await picker(page);
  await page.type('mist');
  await page.until(() => window.options().join() === 'mistral');
  await page.press('Enter');
  await page.until(() => window.picker().dataset.picker === 'connect');
  assert.equal(
    await page.evaluate(() => window.picker().querySelector('h2').textContent),
    'Add Mistral'
  );
  await click(page, 'dialog.picker [data-action=back]');
  await page.until(() => window.active()?.dataset.provider === 'mistral');
  assert.deepEqual(page.errors, []);
});

test('an API key provider takes its key, links to Get a key and is added', async (t) => {
  const page = await open(t);
  await choose(page, 'mistral');
  await page.until(() => window.active()?.localName === 'sp-textfield');
  assert.deepEqual(
    await page.evaluate(() => {
      const link = window.settingsPart('dialog.picker [data-action=get-key]');
      return {
        href: link.href,
        target: link.target,
        rel: link.rel.split(' ').includes('noopener'),
        disabled: window.save().disabled,
        label: window.save().textContent.trim(),
      };
    }),
    {
      href: 'https://console.mistral.example/keys',
      target: '_blank',
      rel: true,
      disabled: true,
      label: 'Connect',
    }
  );
  await page.type('mk-123');
  await page.until(() => !window.save().disabled);
  await page.press('Enter');
  await page.until(() => !window.picker());
  await page.until(() => window.account('mistral')?.status === 'connected');
  await page.until(() => window.active()?.closest?.('.account')?.dataset.id === 'mistral');
  assert.equal(await page.evaluate(() => window.rows()[3]), 'mistral');
  assert.deepEqual(page.errors, []);
});

test('with the vault, the key goes to the provider’s vault name before connect', async (t) => {
  const page = await open(t, { vault: 'secrets' });
  await choose(page, 'cloudflare');
  await page.until(() => !!window.settingsPart('dialog.picker input[data-field=value]'));
  await page.evaluate(() => {
    window.settingsPart('dialog.picker input[data-field=value]').focus();
    return true;
  });
  await page.type('cf-key-0123456789');
  await page.evaluate(() => {
    window.settingsPart('dialog.picker input[data-account-field=account]').focus();
    return true;
  });
  await page.type('acct-1');
  await page.until(() => !window.save().disabled);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(() => window.account('cloudflare')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts.at(-1)), {
    name: 'CLOUDFLARE_WORKERS_AI_API_KEY',
    options: { kind: 'model', provider: 'cloudflare' },
  });
  await click(page, '.account[data-id=cloudflare] [data-action=disconnect]');
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(() => window.account('cloudflare')?.status === 'disconnected');
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.vault
        .list()
        .secrets.filter((secret) => secret.name === 'CLOUDFLARE_WORKERS_AI_API_KEY')
        .map((secret) => secret.state)
    ),
    ['removed']
  );
  assert.equal(await page.evaluate(() => window.rows().includes('cloudflare')), true);
  assert.deepEqual(page.errors, []);
});

test('a fields provider waits for its required fields, shows a rejection inline and keeps them', async (t) => {
  const page = await open(t);
  await choose(page, 'azure-openai');
  await page.until(() => window.active()?.localName === 'sp-textfield');
  await page.type('az-key');
  await page.evaluate(() => {
    window.settingsPart('dialog.picker input[data-account-field=endpoint]').focus();
    return true;
  });
  await page.type('http://harbor.example');
  assert.equal(await page.evaluate(() => window.save().disabled), true);
  assert.equal(
    await page.evaluate(() => window.settingsPart('dialog.picker #help-endpoint').textContent),
    'The resource’s endpoint, from Keys and endpoint.'
  );
  await page.evaluate(() => {
    window.settingsPart('dialog.picker input[data-account-field=deployment]').focus();
    return true;
  });
  await page.type('harbor-gpt');
  await page.until(() => !window.save().disabled);
  await click(page, 'dialog.picker [data-action=save]');
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The endpoint must use https://.'
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const endpoint = window.settingsPart('dialog.picker input[data-account-field=endpoint]');
      return {
        open: window.picker().dataset.picker,
        endpoint: endpoint.value,
        invalid: endpoint.getAttribute('aria-invalid'),
        failure: !!window.settingsPart('dialog.picker .failure'),
        added: !!window.model.settings.accounts().find((a) => a.id === 'azure-openai'),
      };
    }),
    {
      open: 'connect',
      endpoint: 'http://harbor.example',
      invalid: 'true',
      failure: false,
      added: false,
    }
  );
  assert.deepEqual(page.errors, []);
});

async function azure(page, endpoint) {
  await choose(page, 'azure-openai');
  await page.until(() => !!window.settingsPart('dialog.picker input[data-field=value]'));
  for (const [selector, value] of [
    ['input[data-field=value]', 'az-key-0123456789'],
    ['input[data-account-field=endpoint]', endpoint],
    ['input[data-account-field=deployment]', 'harbor-gpt'],
  ]) {
    await page.evaluate((selector) => {
      window.settingsPart(`dialog.picker ${selector}`).focus();
      return true;
    }, selector);
    await page.type(value);
  }
  await page.until(() => !window.save().disabled);
  await page.evaluate(() => {
    window.order = [];
    const { vault, settings } = window.model;
    const put = vault.put.bind(vault);
    vault.put = (name, ...rest) => {
      window.order.push(['put', name]);
      return put(name, ...rest);
    };
    const endpoints = vault.endpoints.bind(vault);
    vault.endpoints = (change) => {
      window.order.push(['endpoints', change]);
      return endpoints(change);
    };
    const connect = settings.connect.bind(settings);
    settings.connect = (...args) => {
      window.order.push(['connect', args[0]]);
      return connect(...args);
    };
    return true;
  });
  await click(page, 'dialog.picker [data-action=save]');
}

const base = 'https://harbor.openai.azure.example';

test('an https endpoint is bound to the key’s record after put and before connect, and Remove leaves it to the vault', async (t) => {
  const page = await open(t, { vault: 'secrets' });
  await azure(page, base);
  await page.until(() => window.account('azure-openai')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'AZURE_OPENAI_API_KEY'],
    ['endpoints', { add: { model: [{ name: 'AZURE_OPENAI_API_KEY', url: base }] } }],
    ['connect', 'azure-openai'],
  ]);
  await click(page, '.account[data-id=azure-openai] [data-action=remove-account]');
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(() => !window.account('azure-openai'));
  assert.deepEqual(
    await page.evaluate(() => ({
      changes: window.model.vault.endpointChanges.length,
      record: window.model.vault
        .list()
        .secrets.find((secret) => secret.name === 'AZURE_OPENAI_API_KEY')?.state,
    })),
    { changes: 1, record: 'removed' }
  );
  assert.deepEqual(page.errors, []);
});

test('a provider added again after Remove binds its endpoint again', async (t) => {
  const page = await open(t, { vault: 'secrets' });
  await azure(page, base);
  await page.until(() => window.account('azure-openai')?.status === 'connected');
  await click(page, '.account[data-id=azure-openai] [data-action=remove-account]');
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(() => !window.account('azure-openai'));
  await azure(page, base);
  await page.until(() => window.account('azure-openai')?.status === 'connected');
  const bound = { add: { model: [{ name: 'AZURE_OPENAI_API_KEY', url: base }] } };
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [bound, bound]);
  assert.deepEqual(page.errors, []);
});

test('while a picked provider connects, Accounts shows no second key form for it', async (t) => {
  const page = await open(t, { delay: '60' });
  await choose(page, 'groq');
  await page.until(() => window.active()?.localName === 'sp-textfield');
  await page.type('gsk-0123456789');
  await page.press('Enter');
  await page.until(() => !!window.settingsPart('.account[data-id=groq]'));
  assert.equal(
    await page.evaluate(() => window.inner().querySelectorAll('form.key[data-id=groq]').length),
    1
  );
  await page.until(() => !window.picker());
  assert.deepEqual(page.errors, []);
});

test('a bare resource name is not registered as an endpoint', async (t) => {
  const page = await open(t, { vault: 'secrets' });
  await azure(page, 'harbor');
  await page.until(() => window.account('azure-openai')?.status === 'connected');
  assert.deepEqual(await page.evaluate(() => window.order), [
    ['put', 'AZURE_OPENAI_API_KEY'],
    ['connect', 'azure-openai'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), []);
  assert.deepEqual(page.errors, []);
});

test('when the vault refuses the endpoint, the field says why and connect never runs', async (t) => {
  const page = await open(t, { vault: 'endpoints-fail' });
  await azure(page, base);
  await page.until(
    () =>
      window.settingsPart('dialog.picker #key-problem')?.textContent.trim() ===
      'The vault refused that endpoint. Check the address and try again.'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      order: window.order.map(([kind]) => kind),
      invalid: window
        .settingsPart('dialog.picker input[data-account-field=endpoint]')
        .getAttribute('aria-invalid'),
      added: !!window.account('azure-openai'),
    })),
    { order: ['put', 'endpoints'], invalid: 'true', added: false }
  );
  assert.deepEqual(page.errors, []);
});

test('a rejected key shows the reason inline in the picker', async (t) => {
  const page = await open(t);
  await choose(page, 'groq');
  await page.until(() => window.active()?.localName === 'sp-textfield');
  await page.type('bad-key');
  await page.press('Enter');
  await page.until(
    () =>
      window.settingsPart('dialog.picker .failure[role=alert]')?.textContent.trim() ===
      'Groq didn’t accept that key.'
  );
  assert.equal(await page.evaluate(() => !!window.account('groq')), false);
  assert.deepEqual(page.errors, []);
});

test('an OAuth provider signs in within the click and shows the signing-in states', async (t) => {
  const page = await open(t, { delay: '60' });
  await page.evaluate(() => {
    customElements.get('slicc-chat').closedAfter = 300;
    return true;
  });
  await choose(page, 'openai-codex');
  await page.until(() => window.active()?.dataset.action === 'sign-in');
  await click(page, 'dialog.picker [data-action=sign-in]');
  await page.until(
    () => window.settingsPart('dialog.picker [data-action=sign-in]')?.textContent === 'Signing in…'
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      gesture: window.model.settings.connects.at(-1),
      cancel: !!window.settingsPart('dialog.picker [data-action=cancel-sign-in]'),
      note: window.settingsPart('dialog.picker [data-signing]').textContent,
    })),
    {
      gesture: { id: 'openai-codex', gesture: true },
      cancel: true,
      note: 'Continue in the sign-in window that opened.',
    }
  );
  await page.until(
    () =>
      window.settingsPart('dialog.picker [data-signing]')?.textContent ===
      'Closed the sign-in window? Cancel, then Log in again.'
  );
  await page.until(() => !window.picker());
  assert.equal(await page.evaluate(() => window.account('openai-codex').status), 'connected');
  assert.deepEqual(page.errors, []);
});

test('Cancel stops an OAuth sign-in and leaves the provider unadded', async (t) => {
  const page = await open(t, { delay: '60' });
  await choose(page, 'github-copilot');
  await click(page, 'dialog.picker [data-action=sign-in]');
  await click(page, 'dialog.picker [data-action=cancel-sign-in]');
  await page.until(
    () => window.settingsPart('dialog.picker [data-action=sign-in]')?.textContent === 'Sign in'
  );
  assert.equal(await page.evaluate(() => !!window.account('github-copilot')), false);
  assert.equal(await page.evaluate(() => !!window.settingsPart('dialog.picker .failure')), false);
  assert.deepEqual(page.errors, []);
});

test('a provider on this device connects with one click', async (t) => {
  const page = await open(t);
  await choose(page, 'lm-studio');
  assert.equal(
    await page.evaluate(() => window.settingsPart('dialog.picker .step .hint').textContent),
    'SLICC connects to LM Studio on this device.'
  );
  await click(page, 'dialog.picker [data-action=connect]');
  await page.until(() => !window.picker());
  assert.equal(await page.evaluate(() => window.account('lm-studio').status), 'connected');
  assert.deepEqual(page.errors, []);
});

test('Remove asks first with Cancel focused, then deletes the key and drops the row', async (t) => {
  const page = await open(t, { vault: 'secrets', accounts: 'vault' });
  await page.evaluate(() =>
    window.model.vault
      .put('OPENAI_API_KEY', 'sk-ant-0123456789', undefined, {
        kind: 'model',
        provider: 'openai',
      })
      .then(() => true)
  );
  const confirmFocus = () => {
    const dialog = window.deep('slicc-confirm');
    return !!dialog?.shadowRoot.activeElement?.hasAttribute('data-cancel');
  };
  await click(page, '.account[data-id=openai] [data-action=remove-account]');
  await page.until(confirmFocus);
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.deep('slicc-confirm').shadowRoot;
      return {
        title: root.querySelector('#title').textContent,
        body: root.querySelector('#body').textContent,
        action: root.querySelector('[data-action]').textContent.trim(),
        variant: root.querySelector('[data-action]').getAttribute('variant'),
      };
    }),
    {
      title: 'Remove OpenAI?',
      body: 'Its key is deleted from the vault. Models from it stop working.',
      action: 'Remove',
      variant: 'negative',
    }
  );
  await page.press('Enter');
  await page.until(() => !window.deep('slicc-confirm'));
  assert.equal(await page.evaluate(() => window.rows().includes('openai')), true);
  await click(page, '.account[data-id=openai] [data-action=remove-account]');
  await page.until(confirmFocus);
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(() => !window.rows().includes('openai'));
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.vault
        .list()
        .secrets.filter((secret) => secret.name === 'OPENAI_API_KEY')
        .map((secret) => secret.state)
    ),
    ['removed']
  );
  await page.until(() => window.active()?.dataset.action === 'add-provider');
  assert.deepEqual(page.errors, []);
});

test('when the vault refuses to delete the key, Remove stops and says why', async (t) => {
  const page = await open(t, { vault: 'secrets', accounts: 'vault' });
  await page.evaluate(() => {
    window.model.vault.remove = async () => {
      throw new Error('The vault is busy. Try again.');
    };
    return true;
  });
  await click(page, '.account[data-id=openai] [data-action=remove-account]');
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(
    () =>
      window.settingsPart('.failure[role=alert]')?.textContent.trim() ===
      'The vault is busy. Try again.'
  );
  assert.equal(await page.evaluate(() => window.rows().includes('openai')), true);
  assert.deepEqual(page.errors, []);
});

test('a provider that needs a CORS-free transport says so in the picker and on its account', async (t) => {
  const page = await open(t);
  assert.equal(
    await page.evaluate(
      () =>
        window.settingsPart('.notes [data-notice=cors-free-transport]')?.textContent ===
        'Needs the SLICC extension or CLI, because the browser blocks direct requests to it.'
    ),
    true
  );
  await picker(page);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.picker().querySelectorAll('.option [data-notice=cors-free-transport]')].map(
        (node) => [node.closest('.option').dataset.provider, node.textContent]
      )
    ),
    [
      ['amazon-bedrock', 'Needs the SLICC extension or CLI'],
      ['cloudflare', 'Needs the SLICC extension or CLI'],
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('Accounts and the picker fit 420 px without scrolling sideways', async (t) => {
  const page = await open(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => {
    const host = window.$('slicc-app', 'slicc-dock', 'slicc-settings');
    const add = window.settingsPart('[data-action=add-provider]');
    return (
      add &&
      host.getBoundingClientRect().right <= innerWidth &&
      document.getAnimations().length === 0 &&
      add.getBoundingClientRect().right <= innerWidth
    );
  });
  const overflow = () => {
    const host = window.$('slicc-app', 'slicc-dock', 'slicc-settings');
    const wide = [...window.inner().querySelectorAll('.account, .notes, .option, dialog')].filter(
      (node) => node.getBoundingClientRect().right > innerWidth + 0.5
    );
    return {
      scroll: host.scrollWidth - host.clientWidth,
      wide: wide.map((node) => node.className),
    };
  };
  assert.deepEqual(await page.evaluate(overflow), { scroll: 0, wide: [] });
  await picker(page);
  assert.deepEqual(await page.evaluate(overflow), { scroll: 0, wide: [] });
  await click(page, '.option[data-provider=azure-openai]');
  await page.until(() => window.picker().dataset.picker === 'connect');
  assert.deepEqual(await page.evaluate(overflow), { scroll: 0, wide: [] });
  assert.deepEqual(page.errors, []);
});
