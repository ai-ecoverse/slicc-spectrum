import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
const narrow = await launch(['--window-size=430,1000']);
after(async () => {
  await chrome.close();
  await narrow.close();
});

async function open(t, notices, color = 'light', browser = chrome) {
  const page = await browser.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ notices, color, delay: '20' })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-notices'));
  await page.evaluate(() => {
    window.notice = (id, selector = '') =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-notices')
        .shadowRoot.querySelector(`[data-notice=${id}] ${selector}`.trim());
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
  test(`notices sit above the transcript and act, fail and dismiss in ${name} ${color}`, async (t) => {
    const page = await open(t, 'mixed', color, browser);
    await page.until(() => !!window.notice('storage'));
    assert.deepEqual(
      await page.evaluate(() => {
        const chat = window.$('slicc-app', 'slicc-dock', 'slicc-chat');
        const header = chat.shadowRoot.querySelector('header').getBoundingClientRect();
        const log = chat.shadowRoot.querySelector('.log').getBoundingClientRect();
        const box = window.notice('welcome').getBoundingClientRect();
        const storage = window.notice('storage');
        const edge = storage.getBoundingClientRect().right;
        return {
          order: window.notice('storage').getBoundingClientRect().top < box.top,
          between: storage.getBoundingClientRect().top >= header.bottom && box.bottom <= log.top,
          role: storage.getAttribute('role'),
          focus: chat.shadowRoot.activeElement?.tagName === 'SLICC-NOTICES',
          overflow: [...storage.querySelectorAll('swc-button, swc-close-button, p, .title')]
            .filter((node) => node.getBoundingClientRect().right > edge + 0.5)
            .map((node) => node.tagName),
          inside: edge <= chat.getBoundingClientRect().right + 0.5,
          bounded: getComputedStyle(chat.shadowRoot.querySelector('slicc-notices')).overflowY,
        };
      }),
      {
        order: true,
        between: true,
        role: 'status',
        focus: false,
        overflow: [],
        inside: true,
        bounded: 'auto',
      }
    );
    if (name === 'narrow') assert.equal(await page.evaluate(() => window.app.screen), 'phone');
    await shot(page, `notices-${name}-${color}`);

    await page.evaluate(() => window.notice('storage', 'swc-button[data-action=retry]').click());
    await page.until(() =>
      window.notice('storage', '[data-action=retry]')?.hasAttribute('pending')
    );
    await page.until(() => !window.notice('storage'));
    assert.deepEqual(
      await page.evaluate(() => window.model.notices.list().map((notice) => notice.id)),
      ['welcome']
    );
    await page.evaluate(() => window.notice('welcome', 'swc-close-button[data-dismiss]').click());
    await page.until(() => !window.notice('welcome'));
    assert.deepEqual(await page.evaluate(() => window.model.notices.list()), []);
    assert.deepEqual(page.errors, []);
  });
}

test('a failed action shows inline and keeps the notice', async (t) => {
  const page = await open(t, 'fail');
  await page.until(() => !!window.notice('storage'));
  await page.evaluate(() => window.notice('storage', 'swc-button[data-action=retry]').focus());
  await page.evaluate(() => window.notice('storage', 'swc-button[data-action=retry]').click());
  await page.until(() => !!window.notice('storage', '[data-error]'));
  assert.match(
    await page.evaluate(() => window.notice('storage', '[data-error]').textContent),
    /declined again/
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-notices').shadowRoot.activeElement
          ?.dataset.action
    ),
    'retry'
  );
  await shot(page, 'notices-failed');
  assert.deepEqual(page.errors, []);
});
