import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const registrations = 'slicc-spectrum.mcp-endpoints';
const docs = 'https://docs.example/mcp';
const wiki = 'https://wiki.example/mcp';

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto('/ui/?delay=5');
  await page.until(() => window.ready === true);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    return true;
  }, registrations);
  await visit(page, params);
  return page;
}

async function visit(page, params) {
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', vault: 'secrets', accounts: 'vault', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.app.show('settings');
    window.account = (id) =>
      window.model.settings.accounts().find((candidate) => candidate.id === id);
    window.dialog = () => window.deep('slicc-confirm')?.shadowRoot ?? null;
    window.row = (id) => window.settingsPart(`.account[data-id="${id}"]`);
    window.field = (name) =>
      window.settingsPart(`form[data-form=add-server] [data-server-field=${name}]`);
    window.order = [];
    const { vault, settings } = window.model;
    for (const [port, name] of [
      [vault, 'remove'],
      [vault, 'endpoints'],
      [settings, 'removeServer'],
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

async function openForm(page) {
  await click(page, '[data-action=add-server]');
  await page.until(() => !!window.field('name'));
}

async function fill(page, field, text) {
  await page.evaluate((field) => {
    window.field(field).focus();
    return true;
  }, field);
  await page.insert(text);
}

async function fillForm(page, { name, url, token = false }) {
  await openForm(page);
  await fill(page, 'name', name);
  await fill(page, 'url', url);
  if (token) await click(page, 'form[data-form=add-server] [data-server-field=token]');
}

const submit = (page) => click(page, 'form[data-form=add-server] [data-action=save]');

const edits = (page) => page.evaluate(() => window.model.settings.serverEdits);

const problem = (page, name) =>
  page.evaluate(
    (name) =>
      window
        .settingsPart(`form[data-form=add-server] [data-problem=${name}]`)
        ?.textContent.trim() ?? null,
    name
  );

const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), registrations);

async function confirmRemove(page, id) {
  await click(page, `.account[data-id="${id}"] [data-action=remove-server]`);
  await page.until(() => !!window.dialog()?.activeElement?.hasAttribute('data-cancel'));
  const shown = await page.evaluate(() => ({
    title: window.dialog().querySelector('#title').textContent,
    body: window.dialog().querySelector('#body').textContent,
    action: window.dialog().querySelector('[data-action]').textContent.trim(),
  }));
  return shown;
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

const rowParts = (page, id) =>
  page.evaluate((id) => {
    const row = window.row(id);
    return {
      label: row.querySelector('swc-status-light').textContent.trim(),
      identity: row.querySelector('.identity').textContent.trim(),
      connect: !!row.querySelector('[data-action=connect]'),
      disconnect: !!row.querySelector('[data-action=disconnect]'),
      remove: !!row.querySelector('[data-action=remove-server]'),
    };
  }, id);

test('adding a server with a token sends the entry, closes the form, and the row offers Connect once it reconciles', async (t) => {
  const page = await open(t);
  await fillForm(page, { name: 'wiki', url: wiki, token: true });
  assert.equal(await page.evaluate(() => window.account('mcp:wiki') === undefined), true);
  await submit(page);
  await page.until(() => !window.settingsPart('form[data-form=add-server]'));
  assert.deepEqual(await edits(page), [{ add: 'wiki', entry: { url: wiki, token: true } }]);
  await page.until(() => !!window.row('mcp:wiki'));
  assert.deepEqual(await rowParts(page, 'mcp:wiki'), {
    label: 'Needs a token',
    identity: 'wiki.example',
    connect: true,
    disconnect: false,
    remove: true,
  });
  await click(page, '.account[data-id="mcp:wiki"] [data-action=connect]');
  await page.until(
    () => !!window.settingsPart('form.key[data-id="mcp:wiki"] input[data-field=value]')
  );
  await openForm(page);
  assert.equal(await page.evaluate(() => window.field('name').value), '');
  assert.equal(await page.evaluate(() => window.field('token').checked), false);
  assert.deepEqual(page.errors, []);
});

test('adding a server without a token shows a row with only Remove', async (t) => {
  const page = await open(t);
  await fillForm(page, { name: 'wiki', url: wiki });
  await submit(page);
  await page.until(() => !!window.row('mcp:wiki'));
  assert.deepEqual(await edits(page), [{ add: 'wiki', entry: { url: wiki } }]);
  assert.deepEqual(await rowParts(page, 'mcp:wiki'), {
    label: 'Connected',
    identity: 'wiki.example',
    connect: false,
    disconnect: false,
    remove: true,
  });
  assert.equal(
    await page.evaluate(
      () => window.settingsPart('swc-action-button[data-action=add-server]') !== null
    ),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('the token help shows only while Uses a token is on', async (t) => {
  const page = await open(t);
  const help = () => page.evaluate(() => !!window.settingsPart('[data-token-help]'));
  await openForm(page);
  assert.equal(await help(), false);
  await click(page, 'form[data-form=add-server] [data-server-field=token]');
  await page.until(() => !!window.settingsPart('[data-token-help]'));
  await click(page, 'form[data-form=add-server] [data-server-field=token]');
  await page.until(() => !window.settingsPart('[data-token-help]'));
  await click(page, 'form[data-form=add-server] [data-server-field=token]');
  await page.until(() => !!window.settingsPart('[data-token-help]'));
  await click(page, 'form[data-form=add-server] [data-action=cancel]');
  await openForm(page);
  assert.equal(await help(), false);
  assert.deepEqual(page.errors, []);
});

test('Enter in a field adds the server, and Add waits for the answer', async (t) => {
  const page = await open(t);
  await fillForm(page, { name: 'wiki', url: wiki });
  await page.evaluate(() => {
    const { settings } = window.model;
    const real = settings.addServer;
    window.release = null;
    settings.addServer = async (...args) => {
      await new Promise((resolve) => {
        window.release = resolve;
      });
      return real(...args);
    };
    return true;
  });
  await page.press('Enter');
  await page.until(() => typeof window.release === 'function');
  await page.until(
    () => window.settingsPart('form[data-form=add-server] [data-action=save]').pending === true
  );
  assert.equal(
    await page.evaluate(
      () => window.settingsPart('form[data-form=add-server] [data-action=cancel]').disabled
    ),
    true
  );
  await page.press('Enter');
  await page.evaluate(() => {
    window.release();
    return true;
  });
  await page.until(() => !window.settingsPart('form[data-form=add-server]'));
  assert.deepEqual(await edits(page), [{ add: 'wiki', entry: { url: wiki } }]);
  assert.deepEqual(page.errors, []);
});

test('a URL with a secret in it says what to do, on the URL field, and adds nothing', async (t) => {
  const page = await open(t, { servers: 'refuse' });
  await fillForm(page, { name: 'wiki', url: `${wiki}?key=abc123`, token: true });
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=url]'));
  assert.equal(
    await problem(page, 'url'),
    'This URL contains a secret. Remove it, turn on Uses a token, and paste the token when you connect.'
  );
  assert.equal(await problem(page, 'form'), null);
  assert.deepEqual(
    await page.evaluate(() => ({
      name: window.field('name').value,
      url: window.field('url').value,
      invalid: window.field('url').getAttribute('aria-invalid'),
      token: window.field('token').checked,
      pending: window.settingsPart('form[data-form=add-server] [data-action=save]').pending,
      added: window.account('mcp:wiki') === undefined,
    })),
    {
      name: 'wiki',
      url: `${wiki}?key=abc123`,
      invalid: 'true',
      token: true,
      pending: false,
      added: true,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('any other refusal shows the agent’s reason as a sentence on the form', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.settings.addServer = async () => ({
      ok: false,
      code: 'sse',
      reason: 'the legacy SSE transport is not supported; use the streamable HTTP URL',
    });
    return true;
  });
  await fillForm(page, { name: 'wiki', url: wiki });
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=form]'));
  assert.equal(
    await problem(page, 'form'),
    'The legacy SSE transport is not supported; use the streamable HTTP URL'
  );
  assert.equal(await page.evaluate(() => window.field('url').hasAttribute('aria-invalid')), false);
  await page.evaluate(() => {
    window.model.settings.addServer = async () => ({ ok: false, reason: 'no code on this one' });
    return true;
  });
  await submit(page);
  await page.until(
    () => window.settingsPart('[data-problem=form]')?.textContent.trim() === 'No code on this one'
  );
  assert.deepEqual(page.errors, []);
});

test('a name the agent already has is refused in its own words', async (t) => {
  const page = await open(t);
  await fillForm(page, { name: 'docs', url: wiki });
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=form]'));
  assert.equal(
    await problem(page, 'form'),
    '/etc/slicc/agent/mcp.json already has a server called "docs". Remove it first.'
  );
  assert.deepEqual(page.errors, []);
});

test('a failed call shows its message and keeps the form', async (t) => {
  const page = await open(t, { servers: 'fail' });
  await fillForm(page, { name: 'wiki', url: wiki });
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=form]'));
  assert.equal(await problem(page, 'form'), 'The agent did not answer.');
  assert.equal(await page.evaluate(() => window.field('url').value), wiki);
  assert.deepEqual(page.errors, []);
});

test('obvious mistakes stay on the page, on the field that has them', async (t) => {
  const page = await open(t);
  await openForm(page);
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=name]'));
  assert.equal(await problem(page, 'name'), 'Name can’t be empty');
  assert.equal(
    await page.evaluate(() => window.field('name').getAttribute('aria-invalid')),
    'true'
  );
  await fill(page, 'name', 'my server');
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=name]'));
  assert.equal(await problem(page, 'name'), 'Use only letters, digits, _ and - in the name.');
  await page.evaluate(() => {
    window.field('name').value = 'wiki';
    return true;
  });
  await submit(page);
  await page.until(() => !!window.settingsPart('[data-problem=url]'));
  assert.equal(await problem(page, 'url'), 'URL can’t be empty');
  await fill(page, 'url', 'http://wiki.example/mcp');
  await submit(page);
  await page.until(
    () =>
      window.settingsPart('[data-problem=url]')?.textContent.trim() === 'The URL must use https://.'
  );
  assert.deepEqual(await edits(page), []);
  assert.deepEqual(page.errors, []);
});

test('Cancel closes the form and forgets what was typed', async (t) => {
  const page = await open(t);
  await fillForm(page, { name: 'wiki', url: wiki });
  await click(page, 'form[data-form=add-server] [data-action=cancel]');
  await page.until(() => !window.settingsPart('form[data-form=add-server]'));
  await openForm(page);
  assert.equal(await page.evaluate(() => window.field('name').value), '');
  assert.deepEqual(await edits(page), []);
  assert.deepEqual(page.errors, []);
});

test('a view-only seat sees the servers but neither Add server nor Remove', async (t) => {
  const page = await open(t, { servers: 'view-only', mcp: 'states' });
  await page.until(() => !!window.row('mcp:atlas'));
  assert.deepEqual(
    await page.evaluate(() => ({
      add: !!window.settingsPart('[data-action=add-server]'),
      remove: !!window.settingsPart('[data-action=remove-server]'),
      methods: [typeof window.model.settings.addServer, typeof window.model.settings.removeServer],
    })),
    { add: false, remove: false, methods: ['undefined', 'undefined'] }
  );
  assert.deepEqual(page.errors, []);
});

test('rows read their state in words, and only rows that sign in offer Connect', async (t) => {
  const page = await open(t, { mcp: 'states' });
  await page.until(() => !!window.row('mcp:hollow'));
  const rows = {};
  for (const name of [
    'atlas',
    'beacon',
    'cargo',
    'drift',
    'ember',
    'fathom',
    'glacier',
    'hollow',
    'inlet',
  ])
    rows[name] = await rowParts(page, `mcp:${name}`);
  const row = (label, identity, connect) => ({
    label,
    identity,
    connect,
    disconnect: false,
    remove: true,
  });
  assert.deepEqual(rows, {
    atlas: row('Connected', 'atlas.example', false),
    beacon: row('Connecting…', 'beacon.example', false),
    cargo: row('Couldn’t connect', 'cargo.example', false),
    drift: row('Needs a token', 'drift.example', true),
    ember: row('Needs sign-in', 'ember.example', true),
    fathom: row('Couldn’t connect', 'fathom.example', true),
    glacier: row('Disabled', 'glacier.example', false),
    hollow: row('Refused', 'Stdio servers need a newer kernel, so this one is skipped', false),
    inlet: row(
      'Refused',
      'inlet.example · This entry was refused. Remove it and add it again here.',
      false
    ),
  });
  assert.equal(
    await page.evaluate(() =>
      window.row('mcp:ember').querySelector('[data-action=connect]').textContent.trim()
    ),
    'Sign in'
  );
  assert.deepEqual(page.errors, []);
});

test('a refused row re-reads its reason on every accounts event, and falls back to the line', async (t) => {
  const page = await open(t, { mcp: 'states' });
  await page.until(() => !!window.row('mcp:hollow'));
  const note = () =>
    page.evaluate(() => window.row('mcp:hollow').querySelector('[data-refusal]').textContent);
  await page.until(
    () =>
      window.row('mcp:hollow').querySelector('[data-refusal]').textContent ===
      'Stdio servers need a newer kernel, so this one is skipped'
  );
  await page.evaluate(() => {
    const { settings } = window.model;
    settings.refusals = async () => ({
      hollow: { code: 'sse', reason: 'the legacy SSE transport is not supported' },
    });
    settings.emit('accounts', settings.accounts());
    return true;
  });
  await page.until(
    () =>
      window.row('mcp:hollow').querySelector('[data-refusal]').textContent ===
      'The legacy SSE transport is not supported'
  );
  await page.evaluate(() => {
    const { settings } = window.model;
    settings.refusals = async () => {
      throw new Error('EACCES');
    };
    settings.emit('accounts', settings.accounts());
    return true;
  });
  await page.until(
    () =>
      window.row('mcp:hollow').querySelector('[data-refusal]').textContent ===
      'This entry was refused. Remove it and add it again here.'
  );
  assert.equal(await note(), 'This entry was refused. Remove it and add it again here.');
  assert.deepEqual(page.errors, []);
});

test('a view-only seat reads the plain line on a refused row', async (t) => {
  const page = await open(t, { mcp: 'states', servers: 'view-only' });
  await page.until(() => !!window.row('mcp:hollow'));
  assert.equal(
    await page.evaluate(() => window.row('mcp:hollow').querySelector('[data-refusal]').textContent),
    'This entry was refused. Remove it and add it again here.'
  );
  assert.deepEqual(page.errors, []);
});

test('Remove asks first, then clears the token and the registration before the agent, and waits for the row to go', async (t) => {
  const page = await open(t);
  await page.evaluate(
    ([key, docs]) => {
      localStorage.setItem(key, JSON.stringify({ docs }));
      return true;
    },
    [registrations, docs]
  );
  await visit(page, {});
  assert.deepEqual(await confirmRemove(page, 'mcp:docs'), {
    title: 'Remove docs?',
    body: 'Its token is deleted from the vault. Agents can’t use it any more.',
    action: 'Remove',
  });
  await answer(page, false);
  assert.deepEqual(await page.evaluate(() => window.order), []);
  await confirmRemove(page, 'mcp:docs');
  await answer(page, true);
  await page.until(() => !window.row('mcp:docs'));
  assert.deepEqual(await page.evaluate(() => window.order), [
    'remove',
    'endpoints',
    'removeServer',
  ]);
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), [
    { remove: { mcp: [{ server: 'docs', url: docs }] } },
  ]);
  assert.deepEqual(await stored(page), {});
  assert.equal(
    await page.evaluate(
      () =>
        window.model.vault.list().secrets.find((secret) => secret.name === 'MCP_DOCS_TOKEN').state
    ),
    'removed'
  );
  assert.deepEqual(await edits(page), [{ remove: 'mcp:docs' }]);
  assert.deepEqual(page.errors, []);
});

test('the row reads Removing until the accounts event takes it away', async (t) => {
  const page = await open(t, { mcp: 'states', delay: '40' });
  await page.until(() => !!window.row('mcp:atlas'));
  await confirmRemove(page, 'mcp:atlas');
  await answer(page, true);
  await page.until(
    () =>
      window.row('mcp:atlas')?.querySelector('swc-status-light').textContent.trim() === 'Removing…'
  );
  assert.equal(
    await page.evaluate(
      () => window.row('mcp:atlas').querySelector('[data-action=remove-server]').disabled
    ),
    true
  );
  await page.until(() => !window.row('mcp:atlas'));
  assert.deepEqual(page.errors, []);
});

test('removing a server with no token touches neither the vault nor the endpoints', async (t) => {
  const page = await open(t, { mcp: 'states' });
  await page.until(() => !!window.row('mcp:atlas'));
  const { body } = await confirmRemove(page, 'mcp:atlas');
  assert.equal(body, 'Agents can’t use it any more.');
  await answer(page, true);
  await page.until(() => !window.row('mcp:atlas'));
  assert.deepEqual(await page.evaluate(() => window.order), ['removeServer']);
  assert.deepEqual(page.errors, []);
});

test('with nothing in the vault, the dialog promises no deletion and no endpoint is taken back', async (t) => {
  const page = await open(t, { mcp: 'states' });
  await page.until(() => !!window.row('mcp:hollow'));
  for (const id of ['atlas', 'drift', 'ember', 'glacier', 'hollow']) {
    const { body } = await confirmRemove(page, `mcp:${id}`);
    assert.equal(body, 'Agents can’t use it any more.');
    await answer(page, false);
  }
  await confirmRemove(page, 'mcp:drift');
  await answer(page, true);
  await page.until(() => !window.row('mcp:drift'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.endpointChanges), []);
  assert.deepEqual(page.errors, []);
});

test('every trash button is named after its server for assistive technology', async (t) => {
  const page = await open(t, { mcp: 'states' });
  await page.until(() => !!window.row('mcp:hollow'));
  const servers = await page.evaluate(() =>
    window.model.settings
      .accounts()
      .filter((account) => account.group === 'mcp')
      .map((account) => account.provider)
  );
  await page.send('Accessibility.enable');
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const names = nodes
    .filter((node) => !node.ignored && node.role?.value === 'button')
    .map((node) => node.name?.value)
    .filter((name) => servers.some((server) => name === `Remove ${server}`));
  assert.deepEqual(
    names,
    servers.map((server) => `Remove ${server}`)
  );
  assert.deepEqual(page.errors, []);
});

test('an agent’s refusal to remove shows in the row and keeps it', async (t) => {
  const page = await open(t, { servers: 'refuse' });
  await confirmRemove(page, 'mcp:docs');
  await answer(page, true);
  await page.until(
    () =>
      window.settingsPart('.account[data-id="mcp:docs"] ~ .failure')?.textContent.trim() ===
      "/etc/slicc/agent/mcp.json isn't valid JSON, so it is unchanged. Fix the file first."
  );
  assert.equal(await page.evaluate(() => !!window.row('mcp:docs')), true);
  assert.equal((await rowParts(page, 'mcp:docs')).label, 'Connected');
  assert.deepEqual(page.errors, []);
});

test('at a true 420 the rows and the form stay inside the page', async (t) => {
  const page = await open(t, { mcp: 'states' });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.until(() => window.app.screen === 'phone');
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-action=add-server]'));
  await openForm(page);
  await page.until(() => {
    const form = window.settingsPart('form[data-form=add-server]');
    return form.getBoundingClientRect().right <= window.innerWidth;
  });
  assert.equal(
    await page.evaluate(() => {
      const { right } = window.settingsPart('.accounts[data-group=mcp]').getBoundingClientRect();
      return right <= window.innerWidth;
    }),
    true
  );
  assert.deepEqual(page.errors, []);
});
