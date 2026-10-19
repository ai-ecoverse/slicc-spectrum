import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
const narrow = await launch(['--window-size=430,1000']);
after(async () => {
  await chrome.close();
  await narrow.close();
});

async function open(t, updates = 'current', color = 'light', browser = chrome) {
  const page = await browser.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ updates, color, delay: '20' })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  return page;
}

const shown = () => window.app.dock.has('updates');
const status = () =>
  window
    .$('slicc-app', '[data-updates]')
    ?.getAttribute('accessible-label')
    ?.replace('Install / Update: ', '');

test('boot opens the panel and readiness closes it without closing a manual reopen', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] swc-progress-bar')
        ?.getAttribute('value-label') === '63 of 95'
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-updates').shadowRoot.querySelectorAll('article')
          .length
    ),
    6
  );
  assert.equal(await page.evaluate(status), 'updating 3');
  assert.deepEqual(
    await page.evaluate(() => {
      const item = window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=grammars]');
      return [
        item.querySelector('swc-status-light').textContent.trim(),
        item.querySelector('swc-progress-bar').getAttribute('value-label'),
      ];
    }),
    ['Linking', '12 of 15']
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=global] swc-progress-bar')
        .hasAttribute('indeterminate')
    ),
    true
  );
  assert.equal(
    await page.evaluate(() =>
      Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', 'h1, sp-badge, swc-badge'))
    ),
    false
  );
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] summary').click();
  });
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] details').open
    ),
    true
  );
  assert.match(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] pre').textContent
    ),
    /downloaded 63/
  );
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.app.dock.has('updates'));
  assert.equal(await page.evaluate(status), undefined);
  await page.evaluate(() => window.$('slicc-app', 'sp-action-menu').click());
  await page.until(() => window.$('slicc-app', 'sp-action-menu').open);
  await page.until(() => {
    window.$('slicc-app', 'sp-action-menu sp-menu-item[value=updates]').click();
    return window.app.dock.has('updates');
  });
  await page.evaluate(() => window.model.updates.setScenario('current'));
  assert.equal(await page.evaluate(shown), true);
  assert.deepEqual(page.errors, []);
});

test('background updates stay hidden, reopen from status and dispatch component actions', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.updates.setScenario('available'));
  await page.until(
    () =>
      window.$('slicc-app', '[data-updates]')?.getAttribute('accessible-label') ===
      'Install / Update: update ready'
  );
  assert.equal(await page.evaluate(shown), false);
  await page.evaluate(() => {
    window.dispatched = [];
    const act = window.model.updates.act.bind(window.model.updates);
    window.model.updates.act = (id, action) => {
      window.dispatched.push([id, action]);
      return act(id, action);
    };
    window.$('slicc-app', '[data-updates]').click();
  });
  await page.until(shown);
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=update-now]'))
  );
  assert.match(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] .version').textContent
    ),
    /0\.24\.0 → 0\.25\.0/
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=update-now]').click()
  );
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=restart-agent]'))
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=restart-agent]').click()
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=reload]').click()
  );
  await page.until(() => window.model.updates.list().every((item) => item.actions.length === 0));
  assert.deepEqual(await page.evaluate(() => window.dispatched), [
    ['agent', 'update-now'],
    ['agent', 'restart-agent'],
    ['kernel', 'reload'],
  ]);
  assert.equal(await page.evaluate(shown), true);
  assert.deepEqual(page.errors, []);
});

test('new failures reopen once, show diagnostics and Retry, and dispatch errors remain visible', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.updates.setScenario('failure'));
  await page.until(shown);
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[role=alert]'))
  );
  assert.equal(await page.evaluate(status), '1 failed');
  await page.evaluate(() => window.app.dock.close('updates'));
  await page.evaluate(() => window.model.updates.setScenario('failure'));
  assert.equal(await page.evaluate(shown), false);
  await page.evaluate(() => window.$('slicc-app', '[data-updates]').click());
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=retry]'))
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=retry]').click()
  );
  await page.until(
    () => window.model.updates.list().find((item) => item.id === 'global').state === 'installed'
  );
  assert.equal(
    await page.evaluate(() =>
      Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[role=alert]'))
    ),
    false
  );
  await page.evaluate(() => {
    window.model.updates.setScenario('available');
    window.model.updates.act = async () => {
      throw new Error('The update service is offline.');
    };
  });
  await page.until(() =>
    Boolean(window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=update-now]'))
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-action=update-now]').click()
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[role=alert]')?.textContent.trim() ===
      'The update service is offline.'
  );
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[role=alert]'));
  assert.deepEqual(page.errors, []);
});

test('a manually saved updates panel stays open after boot readiness', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.app.show('updates'));
  await page.until(shown);
  await page.goto('/ui/?updates=boot&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.has('updates'));
  assert.equal(
    await page.evaluate(() => window.app.dock.api.getPanel('updates').params.boot),
    false
  );
  await page.evaluate(async () => {
    window.model.updates.setScenario('current');
    await window.app.updateComplete;
  });
  assert.equal(await page.evaluate(shown), true);
  assert.deepEqual(page.errors, []);
});

test('a boot panel restored by a reload still closes once the agent is ready', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  await page.evaluate(() => {
    const key = window.app.storageKey;
    const layout = JSON.parse(localStorage.getItem(key));
    delete layout.panels.updates.params.boot;
    window.app.storage = null;
    localStorage.setItem(key, JSON.stringify(layout));
  });
  await page.goto('/ui/?updates=boot&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.has('updates'));
  await page.until(() => window.app.dock.api.getPanel('updates').params.boot === true);
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.app.dock.has('updates'));
  assert.deepEqual(page.errors, []);
});

test('a panel a failure opened after boot still closes after a reload once the agent is ready', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.updates.setScenario('failure'));
  await page.until(shown);
  await page.goto('/ui/?updates=boot&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.has('updates'));
  await page.until(() => window.app.dock.api.getPanel('updates').params.boot === true);
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.app.dock.has('updates'));
  assert.equal(
    await page.evaluate(() => localStorage.getItem(window.app.storageKey).includes('"updates"')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('a boot failure prevents auto-close until it is resolved', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  await page.evaluate(() => window.model.updates.setScenario('failure'));
  await page.until(
    () =>
      window.$('slicc-app', '[data-updates]')?.getAttribute('accessible-label') ===
      'Install / Update: 1 failed'
  );
  assert.equal(await page.evaluate(shown), true);
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.app.dock.has('updates'));
  assert.deepEqual(page.errors, []);
});

test('boot remains visible across phone and tablet layouts without background focus stealing', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  for (const width of [390, 900]) {
    await page.evaluate((value) => {
      window.app.style.width = `${value}px`;
    }, width);
    await page.until(
      (value) =>
        window.app.screen === (value < 640 ? 'phone' : 'tablet') && window.app.dock.has('updates'),
      width
    );
    await page.until(() => {
      const box = window.$('slicc-app', 'slicc-dock', 'slicc-updates').getBoundingClientRect();
      return box.right <= window.app.getBoundingClientRect().right;
    });
  }
  await page.evaluate(() => window.model.updates.setScenario('current'));
  await page.until(() => !window.app.dock.has('updates'));
  await page.evaluate(() => {
    window.model.updates.setScenario('available');
    window.app.style.width = '390px';
  });
  await page.until(() => window.app.screen === 'phone');
  assert.equal(await page.evaluate(shown), false);
  await page.goto('/ui/?updates=current&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  assert.equal(await page.evaluate(shown), false);
  assert.deepEqual(page.errors, []);
});

for (const [name, color, browser] of [
  ['light', 'light', chrome],
  ['dark', 'dark', chrome],
  ['narrow', 'light', narrow],
]) {
  test(`Install / Update screenshots in ${name}`, async (t) => {
    const page = await open(t, 'boot', color, browser);
    await page.until(shown);
    await page.until(
      () =>
        window
          .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] swc-progress-bar')
          ?.getAttribute('value-label') === '63 of 95'
    );
    if (name === 'narrow') {
      assert.equal(await page.evaluate(() => window.app.screen), 'phone');
      assert.equal(
        await page.evaluate(() => {
          const shell = window.$('slicc-app', '.shell').getBoundingClientRect();
          return shell.left === 0 && shell.width <= innerWidth;
        }),
        true
      );
    }
    for (const scenario of ['boot', 'restart', 'failure']) {
      if (scenario !== 'boot') {
        await page.evaluate(async (value) => {
          window.model.updates.setScenario(value);
          await window.app.updateComplete;
          window.app.show('updates');
        }, scenario);
      }
      await page.until((value) => {
        const node = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
        return Boolean(
          node?.shadowRoot.querySelector(
            value === 'boot'
              ? '[data-state=downloading]'
              : value === 'restart'
                ? '[data-state=ready]'
                : '[data-state=failed]'
          )
        );
      }, scenario);
      await page.evaluate((value) => {
        if (value === 'failure') {
          window
            .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-state=failed]')
            .scrollIntoView({ block: 'nearest' });
        }
        return document.fonts.ready.then(() => true);
      }, scenario);
      const fits = await page.evaluate(() => {
        const node = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
        const box = node.getBoundingClientRect();
        return node.scrollWidth <= node.clientWidth && box.left >= 0 && box.right <= innerWidth;
      });
      assert.equal(fits, true);
      await page.screenshot(new URL(`updates-${name}-${scenario}.png`, page.dir));
    }
    assert.deepEqual(page.errors, []);
  });
}

test('an install fills one bar from download through linking and never goes back', async (t) => {
  const page = await installing(t);
  const phases = [
    ['checking', null],
    ['downloading', { phase: 'download', done: 10, total: 20 }],
    ['downloading', { phase: 'download', done: 10, total: 40 }],
    ['downloading', { phase: 'download', done: 40, total: 40 }],
    ['linking', { phase: 'link', done: 4, total: 40 }],
    ['checking', null],
    ['linking', { phase: 'link', done: 40, total: 40 }],
  ];
  const seen = await page.evaluate(async (steps) => {
    const port = window.model.updates;
    const element = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
    const read = async (selector) => {
      await element.updateComplete;
      const bar = element.shadowRoot.querySelector(`${selector} swc-progress-bar`);
      return bar.hasAttribute('indeterminate')
        ? null
        : [
            bar.getAttribute('max-value'),
            Number(bar.getAttribute('value')),
            bar.getAttribute('value-label'),
          ];
    };
    const drive = async (list, event, id, selector, running) => {
      const values = [];
      for (const [state, progress] of steps) {
        const items = port[list]().map((item) =>
          item.id === id ? { ...item, state: running ?? state, progress } : item
        );
        port[list] = () => items;
        port.emit(event, items);
        values.push(await read(selector));
      }
      return values;
    };
    return {
      agent: await drive('list', 'items', 'agent', 'article[data-id=agent]'),
      git: await drive('packages', 'packages', 'git', 'li[data-id=git]', 'updating'),
    };
  }, phases);
  const counts = ['10 of 20', '10 of 40', '40 of 40', '4 of 40', '4 of 40', '40 of 40'];
  for (const [row, suffix] of [
    ['agent', ''],
    ['git', ' packages'],
  ]) {
    assert.equal(seen[row][0], null, row);
    const shown = seen[row].slice(1);
    assert.deepEqual(
      shown.map(([max]) => max),
      Array(6).fill('100'),
      row
    );
    assert.deepEqual(
      shown.map(([, , label]) => label),
      counts.map((count) => `${count}${suffix}`),
      row
    );
    const values = shown.map(([, value]) => value);
    assert.deepEqual(values, [25, 25, 50, 55, 55, 100], row);
    assert.ok(
      values.every((value, index) => index === 0 || value >= values[index - 1]),
      row
    );
    assert.ok(
      values.slice(0, 3).every((value) => value <= 50),
      row
    );
    assert.ok(
      values.slice(3).every((value) => value >= 50),
      row
    );
  }
  assert.deepEqual(page.errors, []);
});

test('a row that settles while Install / Update is a background tab starts its next install at 0', async (t) => {
  const page = await installing(t);
  const bars = await page.evaluate(async () => {
    const port = window.model.updates;
    const api = window.app.dock.api;
    const element = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
    const set = (list, event, id, patch) => {
      const items = port[list]().map((item) => (item.id === id ? { ...item, ...patch } : item));
      port[list] = () => items;
      port.emit(event, items);
    };
    const both = (patch, pkg) => {
      set('list', 'items', 'agent', patch);
      set('packages', 'packages', 'git', pkg ?? patch);
    };
    const read = async () => {
      await element.updateComplete;
      return ['article[data-id=agent]', 'li[data-id=git]'].map((selector) => {
        const bar = element.shadowRoot.querySelector(`${selector} swc-progress-bar`);
        if (!bar) return 'none';
        return bar.hasAttribute('indeterminate') ? 'indeterminate' : bar.getAttribute('value');
      });
    };
    both(
      { state: 'linking', progress: { phase: 'link', done: 40, total: 40 } },
      {
        state: 'updating',
        progress: { phase: 'link', done: 40, total: 40 },
      }
    );
    const full = await read();
    api.getPanel('chat:cone-sliccy').api.setActive();
    const hidden = element.isConnected;
    both({ state: 'current', progress: null }, { state: 'installed', progress: null });
    both({ state: 'checking', progress: null }, { state: 'updating', progress: null });
    api.getPanel('updates').api.setActive();
    const checking = await read();
    both(
      { state: 'downloading', progress: { phase: 'download', done: 1, total: 10 } },
      {
        state: 'updating',
        progress: { phase: 'download', done: 1, total: 10 },
      }
    );
    return { full, hidden, checking, again: await read() };
  });
  assert.deepEqual(bars, {
    full: ['100', '100'],
    hidden: false,
    checking: ['indeterminate', 'indeterminate'],
    again: ['5', '5'],
  });
  assert.deepEqual(page.errors, []);
});

test('a download that reports bytes fills by bytes and shows megabytes', async (t) => {
  const page = await installing(t);
  const mb = 1024 * 1024;
  const steps = [
    { phase: 'download', done: 0, total: 1, bytes: { done: 0, total: 40 * mb } },
    { phase: 'download', done: 0, total: 1, bytes: { done: 10 * mb, total: 40 * mb } },
    { phase: 'download', done: 1, total: 1, bytes: { done: 40 * mb, total: 40 * mb } },
    { phase: 'link', done: 7, total: 14 },
  ];
  const seen = await page.evaluate(async (steps) => {
    const port = window.model.updates;
    const element = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
    const drive = async (list, event, id, selector, state) => {
      const shown = [];
      for (const progress of steps) {
        const items = port[list]().map((item) =>
          item.id === id ? { ...item, state, progress } : item
        );
        port[list] = () => items;
        port.emit(event, items);
        await element.updateComplete;
        const bar = element.shadowRoot.querySelector(`${selector} swc-progress-bar`);
        shown.push([Number(bar.getAttribute('value')), bar.getAttribute('value-label')]);
      }
      return shown;
    };
    return {
      agent: await drive('list', 'items', 'agent', 'article[data-id=agent]', 'downloading'),
      git: await drive('packages', 'packages', 'git', 'li[data-id=git]', 'installing'),
    };
  }, steps);
  const bars = (unit) => [
    [0, '0 B of 40.0 MB'],
    [13, '10.0 MB of 40.0 MB'],
    [50, '40.0 MB of 40.0 MB'],
    [75, `7 of 14${unit}`],
  ];
  assert.deepEqual(seen, { agent: bars(''), git: bars(' packages') });
  assert.deepEqual(page.errors, []);
});

test('a package install that fails shows no bar next to its Retry', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/ui/?updates=current&packages=fail&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => window.app.show('updates'));
  await page.until(() =>
    Boolean(
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-updates',
        'li[data-id=git] swc-button[data-action=install]'
      )
    )
  );
  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-updates',
        'li[data-id=git] swc-button[data-action=install]'
      )
      .click()
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-updates', 'li[data-id=git]')?.dataset.state ===
      'failed'
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const git = window.$('slicc-app', 'slicc-dock', 'slicc-updates', 'li[data-id=git]');
      return [
        Boolean(git.querySelector('swc-progress-bar')),
        [...git.querySelectorAll('swc-button')].map((button) => button.dataset.action),
      ];
    }),
    [false, ['retry']]
  );
});

async function installing(context) {
  const page = await chrome.page(context);
  await page.goto('/ui/?updates=current&packages=mixed&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => window.app.show('updates'));
  await page.until(() => window.$('slicc-app', 'slicc-dock', 'slicc-updates', 'li[data-id=git]'));
  return page;
}

for (const [name, browser] of [
  ['wide', chrome],
  ['narrow', narrow],
]) {
  test(`optional packages install, ask before removing a requirement, and fit ${name}`, async (t) => {
    const page = await browser.page(t);
    await page.goto('/ui/?updates=current&packages=mixed&color=light&delay=20');
    await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
    await page.evaluate(() => {
      window.pkg = (id, selector = '') =>
        window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-updates',
          `li[data-id=${id}] ${selector}`.trim()
        );
      window.app.show('updates');
    });
    await page.until(() => window.pkg('git'));
    const before = await page.evaluate(status);
    const layout = await page.evaluate(() => {
      const node = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
      const name = window.pkg('uv', 'h3').getBoundingClientRect();
      const buttons = window.pkg('uv', '.buttons').getBoundingClientRect();
      return {
        fits: node.scrollWidth <= node.clientWidth,
        beside: name.right <= buttons.left && name.top < buttons.bottom,
        name: name.width,
      };
    });
    assert.deepEqual([layout.fits, layout.beside, layout.name > 10], [true, true, true]);

    await page.evaluate(() => {
      const button = window.pkg('git', '[data-action=install]');
      button.focus();
      button.click();
    });
    await page.until(() => window.pkg('git', '[data-action=install]')?.hasAttribute('pending'));
    await page.until(() => window.pkg('git')?.dataset.state === 'installed');
    assert.equal(
      await page.evaluate(() => window.pkg('git', 'swc-status-light').textContent.trim()),
      'Installed'
    );
    await page.until(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-updates').shadowRoot.activeElement ===
        window.pkg('git', '[data-action=remove]')
    );

    const ask = () => {
      const button = window.pkg('python', '[data-action=remove]');
      button.focus();
      button.click();
    };
    const dialog = () => {
      const root = window.$('slicc-app', 'slicc-confirm')?.shadowRoot;
      if (!root?.querySelector('dialog')?.open) return null;
      return [
        root.querySelector('h2').textContent,
        root.querySelector('p').textContent,
        root.querySelector('[data-action]').textContent.trim(),
        root.querySelector('[data-action]').getAttribute('variant'),
      ];
    };
    await page.evaluate(ask);
    await page.until(dialog);
    assert.deepEqual(await page.evaluate(dialog), [
      'Remove Python?',
      'uv needs it and stops working until Python is back.',
      'Remove',
      'accent',
    ]);
    assert.equal(
      await page.evaluate(() =>
        window.pkg('python', '[data-action=remove]').hasAttribute('pending')
      ),
      true
    );
    await page.evaluate(() =>
      window.$('slicc-app', 'slicc-confirm').shadowRoot.querySelector('[data-cancel]').click()
    );
    await page.until(() => !window.$('slicc-app', 'slicc-confirm'));
    await page.until(() => !window.pkg('python', '[data-action=remove]').hasAttribute('pending'));
    assert.equal(await page.evaluate(() => window.pkg('python').dataset.state), 'installed');
    assert.equal(await page.evaluate(() => window.pkg('python', '[data-error]')), null);

    await page.evaluate(ask);
    await page.until(dialog);
    await page.evaluate(() =>
      window.$('slicc-app', 'slicc-confirm').shadowRoot.querySelector('[data-action]').click()
    );
    await page.until(() => window.pkg('python')?.dataset.state === 'available');
    assert.equal(await page.evaluate(() => window.pkg('uv', '[data-requires]')), null);
    assert.equal(
      await page.evaluate(() => window.pkg('uv', '[data-warnings]').textContent.trim()),
      'Needs Python, which isn’t installed. Install Python again to use it.'
    );
    assert.equal(
      await page.evaluate(() => window.pkg('ruff', '[data-requires]').textContent),
      'Installs Python too'
    );

    await page.evaluate(() => window.pkg('pdf', '[data-action=retry]').click());
    await page.until(() => window.pkg('pdf')?.dataset.state === 'installed');
    assert.equal(await page.evaluate(() => window.pkg('pdf', '[data-error]')), null);
    assert.equal(await page.evaluate(status), before);
    assert.deepEqual(page.errors, []);
  });
}

test('your packages say where they live, and that updates keep them until you remove or unpin them', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/ui/?updates=current&packages=user&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.yours = (selector) =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-updates',
        `section[data-section=user-packages] ${selector}`
      );
    window.app.show('updates');
  });
  const hint = () => window.yours('.hint')?.textContent.trim();
  await page.until(hint);
  assert.equal(
    await page.evaluate(hint),
    'Packages you added with pnpm in /opt/user. Seven’s updates keep them until you remove them. Pinned versions stay until you unpin them.'
  );
  assert.match(
    await page.evaluate(
      () => window.yours('li[data-id="user:user:@harbor/tide-math"] .meta').textContent
    ),
    /in \/opt\/user/
  );
  await page.evaluate(() =>
    window.yours('li[data-id="user:agent:@harbor/agent-kit"] [data-action=unpin]').click()
  );
  await page.until(() => !window.yours('li[data-id="user:agent:@harbor/agent-kit"]'));
  assert.equal(
    await page.evaluate(hint),
    'Packages you added with pnpm in /opt/user. Seven’s updates keep them until you remove them.'
  );
  assert.deepEqual(page.errors, []);
});

test('a ready update shows what’s new for its whole range, and rows without notes show none', async (t) => {
  const page = await open(t, 'restart');
  await page.evaluate(() => {
    window.inUpdates = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-updates', selector);
    window.app.show('updates');
    return true;
  });
  await page.until(() => Boolean(window.inUpdates('[data-id=kernel] details[data-releases]')));
  assert.deepEqual(
    await page.evaluate(() => {
      const details = window.inUpdates('[data-id=kernel] details[data-releases]');
      return [details.open, details.querySelector('summary').textContent.trim()];
    }),
    [false, 'What’s new']
  );
  await page.evaluate(() => {
    window.inUpdates('[data-id=kernel] [data-action=whats-new]').click();
    return true;
  });
  await page.until(() => window.inUpdates('[data-id=kernel] details[data-releases]').open);
  const kernel = await page.evaluate(() => {
    const details = window.inUpdates('[data-id=kernel] details[data-releases]');
    const releases = [...details.querySelectorAll('.release')];
    return {
      versions: releases.map((release) => release.dataset.version),
      visible: releases.every((release) => release.getBoundingClientRect().height > 0),
      certified: releases.map((release) => Boolean(release.querySelector('[data-certified]'))),
      links: releases.map((release) => {
        const link = release.querySelector('a[data-action=release-notes]');
        return [link.getAttribute('aria-label'), link.target, link.href];
      }),
      text: details.innerText,
    };
  });
  assert.deepEqual(kernel.versions, ['1.13.0', '1.12.2', '1.12.1']);
  assert.equal(kernel.visible, true);
  assert.deepEqual(kernel.certified, [true, true, false]);
  assert.deepEqual(kernel.links[0], [
    'Kernel 1.13.0 release notes',
    '_blank',
    'https://github.com/harbor-demo/harbor-kernel/releases/tag/v1.13.0',
  ]);
  assert.match(kernel.text, /Features[\s\S]*wait -n[\s\S]*Bug Fixes[\s\S]*slow DNS[\s\S]*mid-line/);
  assert.doesNotMatch(kernel.text, /cert-verify|sha256|certified @harbor/);
  assert.deepEqual(
    await page.evaluate(() => [
      window.inUpdates('[data-id=agent]').querySelectorAll('[data-releases] .release').length,
      Boolean(window.inUpdates('[data-id=grammars] details')),
      window
        .inUpdates('[data-id=grammars] a[data-action=release-notes]')
        ?.getAttribute('aria-label'),
      Boolean(window.inUpdates('[data-id=skills] details, [data-id=skills] a')),
    ]),
    [1, false, 'Syntax grammars 4.5.0 release notes', false]
  );
  await page.evaluate(() => {
    window.model.updates.setScenario('failure');
    return true;
  });
  await page.until(() => Boolean(window.inUpdates('[data-id=global][data-state=failed]')));
  assert.equal(
    await page.evaluate(() => Boolean(window.inUpdates('[data-id=global] details[data-releases]'))),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('hostile release notes render as text and https links only, load no image and are capped', async (t) => {
  const page = await open(t, 'restart');
  await page.evaluate(() => {
    window.inUpdates = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-updates', selector);
    const port = window.model.updates;
    const hostile = [
      '### Features',
      '',
      '<script>window.pwned = 1</script>',
      '',
      '* <img src=x onerror="window.pwned = 2"> inline',
      '* [run](javascript:window.pwned=3) and [plain](http://127.0.0.1:1/plain) and [ok](https://example.com/ok)',
      '* ![pixel](data:image/png;base64,iVBORw0KGgo=) ![tracker](http://127.0.0.1:1/hostile-tracker.png) ![remote](https://example.com/hostile-remote.png)',
      '',
      '<iframe src="https://example.com/frame"></iframe>',
      '',
      'x'.repeat(10 * 1024 * 1024),
    ].join('\n');
    const items = port.list().map((item) =>
      item.id === 'kernel'
        ? {
            ...item,
            releases: [
              { version: '1.13.0', url: 'https://example.com/v1.13.0', notes: hostile },
              { version: '1.12.2', url: 'javascript:window.pwned=4', notes: '* fine' },
            ],
          }
        : item
    );
    port.list = () => items;
    port.emit('items', items);
    window.app.show('updates');
    return true;
  });
  await page.until(() => Boolean(window.inUpdates('[data-id=kernel] [data-action=whats-new]')));
  await page.evaluate(() => {
    window.inUpdates('[data-id=kernel] [data-action=whats-new]').click();
    return true;
  });
  await page.until(() => window.inUpdates('[data-id=kernel] details[data-releases]').open);
  const seen = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const details = window.inUpdates('[data-id=kernel] details[data-releases]');
    const notes = details.querySelector('.release[data-version="1.13.0"] .markdown');
    const allowed = new Set(['P', 'UL', 'LI', 'A', 'CODE', 'STRONG', 'EM']);
    return {
      pwned: window.pwned ?? null,
      tags: [...new Set([...notes.querySelectorAll('*')].map((node) => node.tagName))].filter(
        (tag) => !allowed.has(tag)
      ),
      links: [...details.querySelectorAll('a')].map((link) => [
        link.getAttribute('href'),
        link.target,
        link.rel,
      ]),
      hostileText: /<script>window\.pwned = 1<\/script>/.test(notes.textContent),
      length: notes.textContent.length,
      ellipsis: notes.textContent.trimEnd().endsWith('…'),
      cut: details.querySelector('.release[data-version="1.13.0"] [data-cut] a')?.href ?? null,
      plainTitle: details
        .querySelector('.release[data-version="1.12.2"] .title')
        .textContent.trim(),
      images: performance
        .getEntriesByType('resource')
        .filter((entry) => /hostile|\/x$|\/frame$/.test(entry.name))
        .map((entry) => entry.name),
    };
  });
  assert.equal(seen.pwned, null);
  assert.deepEqual(seen.tags, []);
  for (const [href, target, rel] of seen.links) {
    assert.match(href, /^https:\/\//);
    assert.equal(target, '_blank');
    assert.equal(rel, 'noopener noreferrer');
  }
  assert.deepEqual(
    seen.links.map(([href]) => href),
    [
      'https://example.com/v1.13.0',
      'https://example.com/ok',
      'https://example.com/hostile-remote.png',
      'https://example.com/v1.13.0',
    ]
  );
  assert.equal(seen.hostileText, true);
  assert.ok(seen.length <= 65_536 + 1, String(seen.length));
  assert.ok(seen.length > 60_000, String(seen.length));
  assert.equal(seen.ellipsis, true);
  assert.equal(seen.cut, 'https://example.com/v1.13.0');
  assert.equal(seen.plainTitle, '1.12.2');
  assert.deepEqual(seen.images, []);
  assert.deepEqual(page.errors, []);
});

test('package rows link their release or npm page, show what’s new after the commands, and keep it open across layouts', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/ui/?updates=restart&packages=user&color=light&delay=20');
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.evaluate(() => {
    window.inUpdates = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-updates', selector);
    window.app.show('updates');
    return true;
  });
  await page.until(() => Boolean(window.inUpdates('li[data-id=uv] [data-action=whats-new]')));
  const rows = await page.evaluate(() => {
    const link = (selector) => {
      const node = window.inUpdates(selector);
      return node && [node.textContent, node.getAttribute('aria-label'), node.href, node.target];
    };
    const uv = window.inUpdates('li[data-id=uv]');
    const children = [...uv.children];
    return {
      biome: link('li[data-id=biome] .meta a[data-action=npm-page]'),
      python: link('li[data-id=python] .meta a[data-action=release-notes]'),
      uvLink: Boolean(uv.querySelector('.meta a')),
      order:
        children.indexOf(uv.querySelector(':scope > .commands')) <
        children.indexOf(uv.querySelector(':scope > details[data-releases]')),
      versions: [...uv.querySelectorAll('.release')].map((release) => release.dataset.version),
      pins: [...window.inUpdates('section[data-section=user-packages]').querySelectorAll('a')]
        .length,
      focused: (() => {
        const updates = window.$('slicc-app', 'slicc-dock', 'slicc-updates');
        updates.focus();
        return updates.shadowRoot.activeElement?.dataset.action ?? null;
      })(),
    };
  });
  assert.deepEqual(rows.biome, [
    'npm page',
    'npm page for Biome 2.2.4',
    'https://www.npmjs.com/package/@harbor/biome-wasm/v/2.2.4',
    '_blank',
  ]);
  assert.deepEqual(rows.python, [
    'Release notes',
    'Python 3.13.1 release notes',
    'https://github.com/harbor-demo/python-wasm/releases/tag/v3.13.1',
    '_blank',
  ]);
  assert.equal(rows.uvLink, false);
  assert.equal(rows.order, true);
  assert.deepEqual(rows.versions, ['0.9.2', '0.9.0']);
  assert.equal(rows.pins, 0);
  assert.equal(rows.focused, 'reload');
  await page.evaluate(() => {
    window.inUpdates('li[data-id=uv] [data-action=whats-new]').click();
    return true;
  });
  await page.until(() => window.inUpdates('li[data-id=uv] details[data-releases]').open);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => window.app.screen === 'phone');
  await page.evaluate(() => {
    window.app.show('updates');
    return true;
  });
  await page.until(() => {
    const details = window.inUpdates('li[data-id=uv] details[data-releases]');
    return details?.open === true && details.getBoundingClientRect().right <= innerWidth;
  });
  assert.deepEqual(page.errors, []);
});
