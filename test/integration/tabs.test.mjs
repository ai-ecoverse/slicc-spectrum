import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
const narrow = await launch(['--window-size=430,1000']);
after(async () => {
  await chrome.close();
  await narrow.close();
});

async function open(t, tabs, color = 'light', browser = chrome) {
  const page = await browser.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ tabs, color, delay: '20' })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.light = () => window.$('slicc-app', 'header [data-tabs]');
    window.banner = () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-notices')
        ?.shadowRoot.querySelector('[data-tabs-notice]');
    return true;
  });
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

for (const [name, color, browser] of [
  ['wide', 'light', chrome],
  ['wide', 'dark', chrome],
  ['narrow', 'light', narrow],
]) {
  test(`follower, skew and stalled tabs in ${name} ${color}`, async (t) => {
    const page = await open(t, 'follower', color, browser);
    await page.until(() => window.light()?.dataset.role === 'follower');
    assert.equal(
      await page.evaluate(() => window.light().getAttribute('aria-label')),
      'Another tab. SLICC runs in another tab. This tab shows it and sends your actions there.'
    );
    assert.equal(await page.evaluate(() => !!window.banner()), false);
    await shot(page, `tabs-follower-${name}-${color}`);

    await page.evaluate(() => window.model.tabs.setScenario('newer'));
    await page.until(() => window.banner()?.dataset.skew === 'newer');
    assert.match(
      await page.evaluate(() => window.banner().textContent),
      /Another tab runs a newer SLICC\. Reload this tab\./
    );
    await shot(page, `tabs-newer-${name}-${color}`);
    await page.evaluate(() => window.banner().querySelector('[data-action=reload]').click());
    await page.until(() => window.light()?.dataset.role === 'connecting');
    await page.until(() => window.light()?.dataset.role === 'follower');
    assert.equal(await page.evaluate(() => window.model.tabs.reloads), 1);

    await page.evaluate(() => window.model.tabs.setScenario('stalled'));
    await page.until(() => window.banner()?.dataset.tabsNotice === 'stalled');
    assert.equal(
      await page.evaluate(() => !!window.banner().querySelector('[data-action]')),
      false
    );
    await shot(page, `tabs-stalled-${name}-${color}`);

    await page.evaluate(() => window.model.tabs.setScenario('older'));
    await page.until(() => window.banner()?.dataset.skew === 'older');
    await shot(page, `tabs-older-${name}-${color}`);
    assert.deepEqual(page.errors, []);
  });

  test(`connecting and alone tabs in ${name} ${color}`, async (t) => {
    const page = await open(t, 'connecting', color, browser);
    await page.evaluate(() => window.model.agent.clear('cone-sliccy'));
    await page.until(() => window.light()?.dataset.role === 'connecting');
    await page.until(
      () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.empty[data-connecting]')
    );
    await shot(page, `tabs-connecting-${name}-${color}`);
    await page.evaluate(() => window.model.tabs.setScenario('alone'));
    await page.until(() => !!window.$('slicc-app', '[data-tabs=alone]'));
    assert.equal(
      await page.evaluate(() => getComputedStyle(window.$('slicc-app', 'main')).display),
      'none'
    );
    assert.equal(await page.evaluate(() => !!window.light()), false);
    await shot(page, `tabs-alone-${name}-${color}`);
    assert.deepEqual(page.errors, []);
  });
}
