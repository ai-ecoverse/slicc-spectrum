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
const status = () => window.$('slicc-app', '[data-updates]')?.textContent;

test('boot opens the panel and readiness closes it without closing a manual reopen', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] sp-badge')
      ?.textContent.includes('63/95')
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
  assert.match(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=grammars] sp-badge')
          .textContent
    ),
    /Linking 12\/15/
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
  await page.until(() => window.$('slicc-app', '[data-updates]')?.textContent === 'update ready');
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
      window.$('slicc-app', 'slicc-dock', 'slicc-updates', '[role=alert]')?.textContent ===
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

test('a boot failure prevents auto-close until it is resolved', async (t) => {
  const page = await open(t, 'boot');
  await page.until(shown);
  await page.evaluate(() => window.model.updates.setScenario('failure'));
  await page.until(() => window.$('slicc-app', '[data-updates]')?.textContent === '1 failed');
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
    await page.until(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-updates', '[data-id=agent] sp-badge')
        ?.textContent.includes('63/95')
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
