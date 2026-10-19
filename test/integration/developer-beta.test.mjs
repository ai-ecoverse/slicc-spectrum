import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, beta, query = {}) {
  return go(await chrome.page(t), beta, query);
}

async function go(page, beta, query = {}) {
  await page.goto(`/ui/?${new URLSearchParams({ beta, color: 'light', delay: '20', ...query })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.panel = () => window.$('slicc-app', 'slicc-dock', 'slicc-updates');
    window.agentRow = () => window.panel()?.shadowRoot.querySelector('article[data-id=agent]');
    window.buttons = () =>
      [...(window.agentRow()?.querySelectorAll('swc-button') ?? [])].map(
        (button) => button.dataset.action
      );
    window.rowText = () => {
      const row = window.agentRow();
      return {
        npm: row?.dataset.npm ?? null,
        meta: row?.querySelector('[data-npm-meta]')?.textContent.trim() ?? null,
        note: row?.querySelector('[data-npm-note]')?.textContent.trim() ?? null,
        beta: row?.querySelector('[data-beta]')?.textContent.trim() ?? null,
        light: row?.querySelector('swc-status-light')?.textContent.trim() ?? null,
        error: row?.querySelector('[role=alert]')?.textContent.trim() ?? null,
        buttons: window.buttons(),
      };
    };
    window.chip = () => {
      const button = window.$('slicc-app', 'header [data-updates]');
      const badge = button?.querySelector('[data-beta]');
      const box = badge?.getBoundingClientRect();
      return {
        text: badge?.textContent.trim() ?? null,
        visible: Boolean(box && box.width > 0 && box.right <= innerWidth && box.left >= 0),
        label: button?.getAttribute('accessible-label') ?? null,
        tip: window.$('slicc-app', 'header swc-tooltip[for=updates]')?.textContent.trim() ?? null,
      };
    };
    window.toggle = () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-settings')
        ?.shadowRoot.querySelector('[data-setting=developer]');
    return true;
  });
  return page;
}

async function phone(page) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => window.app.getAttribute('screen') === 'phone');
}

test('Developer mode shows in Settings only with setDeveloper, waits while pending and shows a rejection', async (t) => {
  const page = await open(t, 'off');
  await page.evaluate(() => window.app.show('settings'));
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-settings', 'sp-picker'))
  );
  assert.equal(await page.evaluate(() => Boolean(window.toggle())), false);

  await go(page, 'offered');
  await page.evaluate(() => window.app.show('settings'));
  await page.until(() => Boolean(window.toggle()));
  assert.deepEqual(
    await page.evaluate(() => {
      const toggle = window.toggle();
      return [
        toggle.localName,
        toggle.checked,
        toggle.textContent.trim(),
        toggle.closest('.row').textContent.replace(/\s+/g, ' ').trim(),
      ];
    }),
    [
      'sp-switch',
      true,
      'Developer mode',
      "Updates Developer mode Check npm for newer releases that aren't certified yet, and offer them as betas in Install / Update.",
    ]
  );
  await page.evaluate(() => {
    window.calls = [];
    const set = window.model.updates.setDeveloper;
    window.model.updates.setDeveloper = (on) => {
      window.calls.push(on);
      return new Promise((resolve, reject) => {
        window.settle = () => set(on).then(resolve, reject);
      });
    };
    window.toggle().click();
    return true;
  });
  await page.until(() => window.toggle().disabled);
  assert.deepEqual(
    await page.evaluate(() => [
      window.calls,
      window.toggle().checked,
      window.toggle().getAttribute('aria-busy'),
      Boolean(window.toggle().closest('.row').querySelector('swc-progress-circle[data-pending]')),
    ]),
    [[false], false, 'true', true]
  );
  await page.evaluate(() => {
    window.app.model = { ...window.model };
    return true;
  });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  assert.deepEqual(
    await page.evaluate(() => [
      window.toggle().disabled,
      window.toggle().getAttribute('aria-busy'),
      window.toggle().checked,
    ]),
    [true, 'true', false]
  );
  await page.evaluate(() => window.settle());
  await page.until(() => !window.toggle().disabled);
  assert.deepEqual(
    await page.evaluate(() => [window.toggle().checked, window.model.updates.developer()]),
    [false, false]
  );

  await page.evaluate(() => {
    window.model.updates.setDeveloper = () =>
      Promise.reject(new Error('npm did not answer. Try again later.'));
    window.toggle().click();
    return true;
  });
  await page.until(() => Boolean(window.toggle().closest('.row').querySelector('[data-error]')));
  assert.deepEqual(
    await page.evaluate(() => {
      const error = window.toggle().closest('.row').querySelector('[data-error]');
      return [
        error.getAttribute('role'),
        error.textContent.trim(),
        window.toggle().checked,
        window.toggle().disabled,
      ];
    }),
    ['alert', 'npm did not answer. Try again later.', false, false]
  );
  await page.evaluate(() => {
    const source = window.model.updates;
    source.setDeveloper = () =>
      new Promise((_, reject) => {
        window.stale = () => reject(new Error('the old port failed'));
      });
    window.toggle().click();
    return true;
  });
  await page.until(() => window.toggle().disabled);
  await page.evaluate(() => {
    const source = window.model.updates;
    window.app.model = {
      ...window.model,
      updates: {
        list: () => source.list(),
        ready: () => source.ready(),
        act: (id, action) => source.act(id, action),
        on: (name, listener) => source.on(name, listener),
        developer: () => true,
        setDeveloper: () => Promise.resolve(),
      },
    };
    return true;
  });
  await page.until(() => window.toggle() && !window.toggle().disabled);
  await page.evaluate(() => window.stale());
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  assert.deepEqual(
    await page.evaluate(() => [
      Boolean(window.toggle().closest('.row').querySelector('[data-error]')),
      window.toggle().disabled,
      window.toggle().checked,
    ]),
    [false, false, true]
  );
  assert.deepEqual(page.errors, []);
});

test('Install / Update shows every npm row state with its text and buttons', async (t) => {
  const page = await open(t, 'offered');
  await page.evaluate(() => window.app.show('updates'));
  await page.until(() => window.agentRow()?.dataset.npm === 'offered');
  assert.deepEqual(await page.evaluate(() => window.rowText()), {
    npm: 'offered',
    meta: '6.6.0 (certified) · 6.13.5 on npm, not certified',
    note: '12 packages change in /opt/agent.',
    beta: null,
    light: 'Up to date',
    error: null,
    buttons: ['install-beta'],
  });
  assert.equal(
    await page.evaluate(() =>
      window
        .agentRow()
        .querySelector('.meta a[data-action=release-notes]')
        ?.getAttribute('aria-label')
    ),
    'Agent (/opt/agent) 6.6.0 release notes'
  );
  await page.evaluate(() => window.agentRow().querySelector('[data-action=whats-new]').click());
  await page.until(() => window.agentRow().querySelector('[data-releases]').open);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.agentRow().querySelectorAll('[data-releases] .release')].map((release) => [
        release.dataset.version,
        release.innerText.replace(/\s+/g, ' ').trim(),
      ])
    ),
    [
      [
        '6.13.5',
        '6.13.5 Bug Fixes tools: a tide table with a blank row no longer stops the import',
      ],
      ['6.10.0', '6.10.0 Features chat: answers can quote a buoy reading with its time and place'],
    ]
  );
  assert.equal(
    await page.evaluate(() =>
      window.agentRow().querySelector('[data-action=install-beta]').getAttribute('variant')
    ),
    'secondary'
  );
  await page.evaluate(() => void window.model.updates.setDeveloper(false));
  await page.until(() => !window.agentRow().hasAttribute('data-npm'));
  assert.deepEqual(await page.evaluate(() => window.rowText()), {
    npm: null,
    meta: null,
    note: null,
    beta: null,
    light: 'Up to date',
    error: null,
    buttons: [],
  });
  assert.equal(
    await page.evaluate(() => window.agentRow().querySelector('.version').textContent.trim()),
    '6.6.0'
  );
  await page.evaluate(() => void window.model.updates.setDeveloper(true));
  await page.until(() => window.agentRow().dataset.npm === 'checking');
  assert.equal(await page.evaluate(() => window.rowText().note), 'Checking npm…');
  await page.until(() => window.agentRow().dataset.npm === 'offered');

  await page.evaluate(() => {
    const port = window.model.updates;
    const set = (npm) => {
      const items = port
        .list()
        .map((item) =>
          item.kind === 'agent' ? { ...item, npm, actions: ['install-beta'] } : item
        );
      port.list = () => items;
      port.emit('items', items);
    };
    window.setNpm = set;
    return true;
  });
  await page.evaluate(() => window.setNpm({ state: 'current', latest: '6.6.0' }));
  await page.until(() => window.agentRow().dataset.npm === 'current');
  assert.deepEqual(
    await page.evaluate(() => [
      window.rowText().note,
      window.rowText().meta,
      window.rowText().buttons,
    ]),
    ['npm: no newer release', null, []]
  );
  await page.evaluate(() => window.setNpm({ state: 'failed', reason: 'npm did not answer.' }));
  await page.until(() => window.agentRow().dataset.npm === 'failed');
  assert.deepEqual(
    await page.evaluate(() => [
      window.rowText().note,
      window.rowText().light,
      window.rowText().buttons,
    ]),
    ['npm did not answer.', 'Up to date', []]
  );
  await page.evaluate(() =>
    window.setNpm({
      state: 'offered',
      latest: '6.13.5',
      changes: { count: 1, gated: ['@harbor/a', '@harbor/b'] },
    })
  );
  await page.until(() => window.agentRow().dataset.npm === 'offered');
  assert.equal(
    await page.evaluate(() => window.rowText().note),
    '1 package changes in /opt/agent. @harbor/a and @harbor/b stay at their certified versions.'
  );
  await page.evaluate(() =>
    window.setNpm({
      state: 'offered',
      latest: '6.13.6',
      changes: { count: 3, gated: ['@harbor/a'] },
    })
  );
  await page.until(() => window.rowText().note.startsWith('3 packages'));
  assert.equal(
    await page.evaluate(() => window.rowText().note),
    '3 packages change in /opt/agent. @harbor/a stays at its certified version.'
  );
  await page.evaluate(() => {
    const port = window.model.updates;
    const items = port.list().map((item) =>
      item.kind === 'agent'
        ? {
            ...item,
            state: 'available',
            to: '6.7.0',
            npm: { state: 'offered', latest: '6.13.5', changes: { count: 12, gated: [] } },
            actions: ['update-now', 'install-beta'],
          }
        : item
    );
    port.list = () => items;
    port.emit('items', items);
    return true;
  });
  await page.until(() => window.rowText().light === 'Update available');
  assert.deepEqual(await page.evaluate(() => [window.rowText().meta, window.rowText().buttons]), [
    '6.6.0 (certified) → 6.7.0 · 6.13.5 on npm, not certified',
    ['update-now', 'install-beta'],
  ]);
  await page.evaluate(() => {
    const port = window.model.updates;
    const items = port.list().map((item) =>
      item.kind === 'agent'
        ? {
            ...item,
            from: '6.13.5',
            beta: { version: '6.13.5', certified: '6.6.0' },
            npm: { state: 'current', latest: '6.13.5' },
            actions: ['update-now', 'back-to-certified'],
          }
        : item
    );
    port.list = () => items;
    port.emit('items', items);
    return true;
  });
  await page.until(() => window.rowText().beta === 'Beta');
  assert.deepEqual(await page.evaluate(() => [window.rowText().meta, window.rowText().light]), [
    '6.13.5 beta · certified 6.6.0 → 6.7.0',
    'Update available',
  ]);
  await page.evaluate(() => {
    const port = window.model.updates;
    const items = port.list().map((item) =>
      item.kind === 'agent'
        ? {
            ...item,
            to: '6.14.0',
            npm: { state: 'offered', latest: '6.14.0', changes: { count: 2, gated: [] } },
          }
        : item
    );
    port.list = () => items;
    port.emit('items', items);
    return true;
  });
  await page.until(() => window.rowText().meta?.endsWith('6.14.0'));
  assert.equal(
    await page.evaluate(() => window.rowText().meta),
    '6.13.5 beta · certified 6.6.0 → 6.14.0'
  );
  await page.evaluate(() => {
    const port = window.model.updates;
    const items = port
      .list()
      .map((item) =>
        item.kind === 'agent'
          ? { ...item, state: 'current', from: null, to: null, beta: null, actions: [] }
          : item
      );
    port.list = () => items;
    port.emit('items', items);
    return true;
  });
  await page.until(() => window.rowText().beta === null);
  assert.equal(
    await page.evaluate(() => window.rowText().meta),
    'Not installed · 6.14.0 on npm, not certified'
  );

  const blocked = await go(page, 'blocked');
  await blocked.evaluate(() => window.app.show('updates'));
  await blocked.until(() => window.agentRow()?.dataset.npm === 'not-offered');
  assert.deepEqual(await blocked.evaluate(() => window.rowText()), {
    npm: 'not-offered',
    meta: '6.6.0 (certified) · 6.13.5 on npm, not offered: it needs kernel 1.14.0 or later',
    note: null,
    beta: null,
    light: 'Up to date',
    error: null,
    buttons: [],
  });

  const installed = await go(page, 'installed');
  await installed.evaluate(() => window.app.show('updates'));
  await installed.until(() => Boolean(window.agentRow()?.querySelector('[data-beta]')));
  assert.deepEqual(await installed.evaluate(() => window.rowText()), {
    npm: 'current',
    meta: '6.13.5 beta · certified 6.6.0',
    note: 'npm: no newer release',
    beta: 'Beta',
    light: 'Beta installed',
    error: null,
    buttons: ['back-to-certified'],
  });
  assert.equal(
    await installed.evaluate(() =>
      window.agentRow().querySelector('swc-status-light').getAttribute('variant')
    ),
    'notice'
  );
  assert.equal(
    await installed.evaluate(() =>
      window
        .agentRow()
        .querySelector('.meta a[data-action=release-notes]')
        ?.getAttribute('aria-label')
    ),
    'Agent (/opt/agent) 6.13.5 release notes'
  );
  assert.deepEqual(
    await installed.evaluate(() => {
      const badge = window.agentRow().querySelector('[data-beta]');
      return [
        badge.localName,
        badge.getAttribute('variant'),
        badge.closest('.title').querySelector('h2').textContent,
      ];
    }),
    ['swc-badge', 'notice', 'Agent (/opt/agent)']
  );

  const failed = await go(page, 'failed');
  await failed.evaluate(() => window.app.show('updates'));
  await failed.until(() => window.agentRow()?.dataset.state === 'failed');
  assert.deepEqual(await failed.evaluate(() => window.rowText()), {
    npm: 'offered',
    meta: '6.6.0 (certified) · 6.13.5 on npm, not certified',
    note: '12 packages change in /opt/agent.',
    beta: null,
    light: 'Update failed',
    error:
      'Couldn’t install the beta: pnpm stopped with an error, shown in the install log. Retry.',
    buttons: ['retry', 'install-beta'],
  });
  assert.deepEqual(page.errors, []);
});

test('Install beta and Back to certified call act with their actions', async (t) => {
  const page = await open(t, 'offered');
  await page.evaluate(() => {
    window.dispatched = [];
    const act = window.model.updates.act.bind(window.model.updates);
    window.model.updates.act = (id, action) => {
      window.dispatched.push([id, action]);
      return act(id, action);
    };
    window.app.show('updates');
    return true;
  });
  await page.until(() => window.buttons().includes('install-beta'));
  await page.evaluate(() => window.agentRow().querySelector('[data-action=install-beta]').click());
  await page.until(() => window.buttons().includes('back-to-certified'));
  assert.deepEqual(await page.evaluate(() => window.rowText()), {
    npm: 'current',
    meta: '6.13.5 beta · certified 6.6.0',
    note: 'npm: no newer release',
    beta: 'Beta',
    light: 'Ready to apply',
    error: null,
    buttons: ['restart-agent', 'back-to-certified'],
  });
  await page.evaluate(() => window.agentRow().querySelector('[data-action=restart-agent]').click());
  await page.until(() => window.rowText().light === 'Beta installed');
  assert.deepEqual(await page.evaluate(() => window.rowText().buttons), ['back-to-certified']);
  await page.evaluate(() =>
    window.agentRow().querySelector('[data-action=back-to-certified]').click()
  );
  await page.until(() => window.buttons().includes('install-beta'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.rowText().beta,
      window.rowText().light,
      window.rowText().buttons,
    ]),
    [null, 'Ready to apply', ['restart-agent', 'install-beta']]
  );
  assert.deepEqual(await page.evaluate(() => window.dispatched), [
    ['agent', 'install-beta'],
    ['agent', 'restart-agent'],
    ['agent', 'back-to-certified'],
  ]);
  assert.deepEqual(page.errors, []);
});

for (const width of [1280, 420]) {
  test(`the header shows a Beta chip with its tooltip at ${width}`, async (t) => {
    const page = await open(t, 'installed');
    if (width === 420) await phone(page);
    else await page.until(() => window.app.getAttribute('screen') === 'desktop');
    await page.until(() => window.chip().visible);
    assert.deepEqual(await page.evaluate(() => window.chip()), {
      text: 'Beta',
      visible: true,
      label: 'Install / Update: Agent runs beta 6.13.5, not certified',
      tip: 'Agent runs beta 6.13.5, not certified',
    });
    assert.equal(
      await page.evaluate(() =>
        window.$('slicc-app', 'header [data-updates] [data-beta]').getAttribute('variant')
      ),
      'notice'
    );
    await page.evaluate(() => window.model.updates.setScenario('available'));
    await page.until(() => window.chip().label?.startsWith('Install / Update: update ready'));
    assert.deepEqual(await page.evaluate(() => window.chip()), {
      text: 'Beta',
      visible: true,
      label: 'Install / Update: update ready. Agent runs beta 6.13.5, not certified',
      tip: 'Update ready. Agent runs beta 6.13.5, not certified',
    });
    const off = await go(page, 'off');
    await off.evaluate(() => window.model.updates.setScenario('available'));
    await off.until(() => Boolean(window.$('slicc-app', 'header [data-updates]')));
    assert.equal(await off.evaluate(() => window.chip().text), null);
    assert.deepEqual(page.errors, []);
  });
}

test('a mirrored port without setDeveloper shows no switch and no beta buttons', async (t) => {
  const page = await open(t, 'failed');
  await page.evaluate(() => {
    const source = window.model.updates;
    const mirror = {
      list: () => source.list(),
      ready: () => source.ready(),
      act: (id, action) => source.act(id, action),
      on: (name, listener) => source.on(name, listener),
      developer: () => true,
    };
    window.app.model = { ...window.model, updates: mirror };
    window.app.show('updates');
    return true;
  });
  await page.until(() => window.agentRow()?.dataset.npm === 'offered');
  assert.deepEqual(await page.evaluate(() => window.buttons()), ['retry']);
  assert.deepEqual(await page.evaluate(() => [window.rowText().meta, window.rowText().note]), [
    null,
    null,
  ]);
  await page.evaluate(() => window.app.show('settings'));
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-settings', 'sp-picker'))
  );
  assert.equal(await page.evaluate(() => Boolean(window.toggle())), false);
  assert.deepEqual(page.errors, []);
});
