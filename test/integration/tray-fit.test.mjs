import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => !!window.$('slicc-app', 'slicc-tray', '#chip'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return page;
}

async function resize(page, width) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(
    (width) =>
      innerWidth === width &&
      window.$('slicc-app', 'header').getBoundingClientRect().width === width &&
      window.app.getAttribute('screen') === (width < 1200 ? 'tablet' : 'desktop'),
    width
  );
  await page.evaluate(() =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))).then(
      () => true
    )
  );
}

async function reconnecting(page) {
  await page.evaluate(() => {
    const tray = window.model.tray;
    const status = tray.status.bind(tray);
    tray.status = () => ({ ...status(), connection: 'reconnecting' });
    tray.emit('status', tray.status());
    return true;
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '#chip swc-status-light').textContent.trim() ===
      'sliccstart, Reconnecting'
  );
}

async function unbudgeted(page) {
  await page.evaluate(() => {
    const tray = window.model.tray;
    const status = tray.status.bind(tray);
    tray.status = () => ({ ...status(), budget: undefined });
    tray.emit('status', tray.status());
    return true;
  });
  await page.until(() => !window.$('slicc-app', 'slicc-tray', '#usage'));
}

const measure = () => {
  const root = window.$('slicc-app', 'slicc-tray').shadowRoot;
  const lines = (node) => {
    if (!node) return 0;
    const tops = new Set();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    return tops.size;
  };
  const header = window.$('slicc-app', 'header');
  const shown = [...header.children].filter((child) => child.getBoundingClientRect().width > 0);
  const menu = window.$('slicc-app', 'header sp-action-menu').getBoundingClientRect();
  const theme = window.$('slicc-app', 'header #theme').getBoundingClientRect();
  return {
    width: innerWidth,
    usage: lines(root.querySelector('#usage swc-status-light')),
    chip: lines(root.querySelector('#chip swc-status-light')),
    shownChip: root.querySelector('#chip swc-status-light').innerText.trim(),
    last: shown.at(-1).getBoundingClientRect().right,
    lastId: shown.at(-1).id,
    menu: [menu.left, menu.right, menu.width],
    theme: [theme.left, theme.right, theme.width],
    scroll: header.scrollWidth - header.clientWidth,
  };
};

function fits(box) {
  const at = JSON.stringify(box);
  assert.ok(box.chip === 1, at);
  assert.equal(box.lastId, 'theme', at);
  assert.ok(box.last <= box.width, at);
  assert.ok(box.menu[2] > 0 && box.menu[0] >= 0 && box.menu[1] <= box.width, at);
  assert.ok(box.theme[2] > 0 && box.theme[0] >= 0 && box.theme[1] <= box.width, at);
  assert.ok(box.scroll <= 0, at);
}

for (const budget of ['plain', 'xai']) {
  for (const width of [640, 680, 720]) {
    test(`at ${width} the ${budget} budget chip keeps its text on one line and the header its last button`, async (t) => {
      const page = await open(t, { budget });
      await resize(page, width);
      const box = await page.evaluate(measure);
      assert.equal(box.usage, 1, JSON.stringify(box));
      fits(box);
      assert.deepEqual(page.errors, []);
    });
  }
}

const widths = [];
for (let width = 640; width < 1200; width += 40) widths.push(width);
widths.push(1199);

for (const [name, params, setup] of [
  ['the plain budget', { budget: 'plain' }],
  ['the Adobe budget', { budget: 'adobe' }],
  ['the SuperGrok budget', { budget: 'xai' }],
  ['a follower with the SuperGrok budget', { budget: 'xai', follow: 'watch' }],
  ['no budget', {}, unbudgeted],
  [
    'an offline tray',
    { budget: 'xai' },
    (page) =>
      page.evaluate(() => {
        window.model.tray.disconnect();
        return true;
      }),
  ],
  ['a reconnecting tray with the SuperGrok budget', { budget: 'xai' }, reconnecting],
]) {
  test(`from 640 to 1199 the header keeps the tray on one line and the View menu and theme button in view with ${name}`, async (t) => {
    const page = await open(t, params);
    if (setup) await setup(page);
    const failed = [];
    for (const width of widths) {
      await resize(page, width);
      const box = await page.evaluate(measure);
      try {
        if (box.usage > 1) throw new Error(`usage on ${box.usage} lines`);
        fits(box);
      } catch (error) {
        failed.push(`${width}: ${error.message}`);
      }
    }
    assert.deepEqual(failed, []);
    assert.deepEqual(page.errors, []);
  });
}

test('on a tablet a tray that is not live shows only its state and its label keeps the name', async (t) => {
  const page = await open(t, { budget: 'xai' });
  await reconnecting(page);
  await resize(page, 640);
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '#chip swc-status-light').innerText.trim() ===
      'Reconnecting'
  );
  const tablet = await page.evaluate(() => {
    const chip = window.$('slicc-app', 'slicc-tray', '#chip');
    return {
      shown: chip.querySelector('swc-status-light').innerText.trim(),
      followers: chip.querySelector('.followers').getBoundingClientRect().width,
      label: chip.getAttribute('accessible-label'),
    };
  });
  assert.equal(tablet.shown, 'Reconnecting');
  assert.equal(tablet.followers, 0);
  assert.equal(tablet.label, 'Tray sliccstart: Reconnecting, 2 followers');
  await resize(page, 1280);
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '#chip swc-status-light').innerText.trim() ===
      'sliccstart, Reconnecting'
  );
  const followers = await page.evaluate(() =>
    window.$('slicc-app', 'slicc-tray', '#chip .followers').innerText.trim()
  );
  assert.equal(followers, '2');
  const box = await page.evaluate(measure);
  assert.equal(box.chip, 1, JSON.stringify(box));
  assert.deepEqual(page.errors, []);
});

test('on a tablet a live tray keeps its name and followers on one line', async (t) => {
  const page = await open(t, { budget: 'xai' });
  await resize(page, 640);
  const box = await page.evaluate(() => {
    const chip = window.$('slicc-app', 'slicc-tray', '#chip');
    return {
      shown: chip.querySelector('swc-status-light').innerText.trim(),
      followers: chip.querySelector('.followers').innerText.trim(),
    };
  });
  assert.equal(box.shown, 'sliccstart');
  assert.equal(box.followers, '2');
  fits(await page.evaluate(measure));
  assert.deepEqual(page.errors, []);
});
