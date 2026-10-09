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
    assert.equal(
      await page.evaluate(() => window.pkg('uv', '[data-requires]').textContent),
      'Needs Python (not installed)'
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
