import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, width) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', browser: 'idle' })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.inBrowser = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-browser', selector);
    window.app.show('browser');
    return document.fonts.ready.then(() => true);
  });
  await page.until(() => !!window.inBrowser('li[data-id=tab-pull] .driver'));
  return page;
}

const boxes = () =>
  [
    ...window
      .$('slicc-app', 'slicc-dock', 'slicc-browser')
      .shadowRoot.querySelectorAll('.cards > li'),
  ].map((li) => {
    const box = li.getBoundingClientRect();
    return { id: li.dataset.id, top: box.top, height: box.height };
  });

for (const width of [700, 1400]) {
  test(`browser cards keep their size when an agent takes and leaves a tab at ${width}px`, async (t) => {
    const page = await open(t, width);
    await page.until(() => window.inBrowser('.cards').getBoundingClientRect().width > 0);
    const before = await page.evaluate(boxes);
    await page.evaluate(() => {
      window.drive = window.model.browser.record({
        tabId: 'tab-pull',
        agentId: 'scoop-otter',
        kind: 'scroll',
      });
      return true;
    });
    await page.until(() => !!window.inBrowser('li[data-id=tab-pull] [data-action=stop-agent]'));
    await page.evaluate(() => customElements.whenDefined('swc-button').then(() => true));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
        )
    );
    assert.deepEqual(await page.evaluate(boxes), before);
    await page.evaluate(() => window.model.agent.stop('scoop-otter'));
    await page.until(() => !!window.inBrowser('li[data-id=tab-pull] .driver'));
    assert.deepEqual(await page.evaluate(boxes), before);
    assert.deepEqual(page.errors, []);
  });
}
