import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const long =
  '/workspace/quarterly-forecast-archive-northern-region/tide-summary-for-the-northern-harbor.md';
const longRow = long.slice(1);

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await load(page, params);
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  return page;
}

async function load(page, params = {}) {
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.fileTree = () =>
      window.app.dock.content('files')?.shadowRoot?.querySelector('slicc-file-tree') ?? null;
    window.treeRow = (path) =>
      window
        .fileTree()
        ?.tree?.getFileTreeContainer()
        ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`) ?? null;
    window.treeRows = () => [
      ...(window
        .fileTree()
        ?.tree?.getFileTreeContainer()
        ?.shadowRoot?.querySelectorAll("[data-type='item']") ?? []),
    ];
    window.ringed = () =>
      window
        .treeRows()
        .filter((row) => {
          const ring = getComputedStyle(row, '::before');
          return ring.display !== 'none' && ring.content !== 'none' && ring.outlineStyle !== 'none';
        })
        .map((row) => row.dataset.itemPath);
    window.laidOut = (node) =>
      !!node &&
      node.getBoundingClientRect().width > 0 &&
      node.getBoundingClientRect().right <= innerWidth &&
      node.getBoundingClientRect().bottom <= innerHeight;
    window.center = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.left + Math.min(40, box.width / 2), y: box.top + box.height / 2 };
    };
    return true;
  });
}

async function viewport(page, width, height = 860) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const screen = width < 640 ? 'phone' : width < 1200 ? 'tablet' : 'desktop';
  await page.until((screen) => window.app.screen === screen, screen);
}

async function click(page, point) {
  const mouse = (type) =>
    page.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
  await mouse('mouseMoved');
  await mouse('mousePressed');
  await mouse('mouseReleased');
}

async function longFile(page) {
  await page.evaluate((path) => window.model.files.write(path, 'x').then(() => true), long);
  await viewport(page, 1000);
  if (await page.evaluate(() => window.laidOut(window.fileTree()))) return;
  const rail = await page.evaluate(() =>
    window.center(window.$('slicc-app', '.rail.left [data-surface=files]'))
  );
  await click(page, rail);
  await page.until((path) => {
    const row = window.treeRow(path);
    row?.scrollIntoView({ block: 'center' });
    return window.laidOut(row);
  }, longRow);
}

function seenName(path) {
  const row = window.treeRow(path);
  const content = row.querySelector("[data-item-section='content']");
  const markers = [...content.querySelectorAll('[data-truncate-marker]')].filter(
    (marker) => marker.getClientRects().length > 0
  );
  const segments = [...content.querySelectorAll('[data-truncate-container]')];
  const boxes = segments.map((segment) => segment.getBoundingClientRect());
  const apart = boxes.every((box, i) => i === 0 || boxes[i - 1].right <= box.left + 0.5);
  const first = segments[0];
  const last = segments.at(-1);
  return {
    markers: markers.length,
    apart,
    ellipsis: getComputedStyle(first).textOverflow,
    nowrap: getComputedStyle(first).whiteSpace,
    cut: first.scrollWidth > first.clientWidth,
    extension: last.querySelector("[data-truncate-content='visible']").textContent,
    whole: last.scrollWidth <= last.clientWidth,
    title: row.title,
  };
}

const named = {
  markers: 0,
  apart: true,
  ellipsis: 'ellipsis',
  nowrap: 'nowrap',
  cut: true,
  extension: 'md',
  whole: true,
  title: 'tide-summary-for-the-northern-harbor.md',
};

for (const scheme of ['light', 'dark', 'forced']) {
  test(`a long file name in the narrow tablet Files panel ellipsizes cleanly and keeps its extension, at rest, hover, selected and focused, ${scheme}`, async (t) => {
    const page = await open(t, { color: scheme === 'dark' ? 'dark' : 'light' });
    if (scheme === 'forced')
      await page.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'forced-colors', value: 'active' }],
      });
    t.after(() => page.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {}));
    await longFile(page);
    assert.deepEqual(await page.evaluate(seenName, longRow), named, 'rest');
    const point = await page.evaluate((path) => window.center(window.treeRow(path)), longRow);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await page.until(
      (path) => window.treeRow(path).matches(':hover') && window.laidOut(window.treeRow(path)),
      longRow
    );
    assert.deepEqual(await page.evaluate(seenName, longRow), named, 'hover');
    await click(page, point);
    await page.until((path) => window.treeRow(path)?.dataset.itemSelected === 'true', longRow);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    await page.until((path) => window.laidOut(window.treeRow(path)), longRow);
    assert.deepEqual(await page.evaluate(seenName, longRow), named, 'selected');
    await page.press('ArrowUp');
    await page.press('ArrowDown');
    await page.until((path) => window.treeRow(path)?.matches(':focus-visible') === true, longRow);
    assert.deepEqual(await page.evaluate(seenName, longRow), named, 'focused');
    assert.deepEqual(page.errors, []);
  });
}

test('a tree row shows no focus ring after load, a panel shown by mouse, or a mouse click, and shows one after arrow keys and Tab', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await page.evaluate(() => {
    window.app.show('files');
    return true;
  });
  await page.until(() => window.treeRows().length > 0);
  await load(page);
  await page.until(() => window.treeRows().length > 0);
  assert.deepEqual(await page.evaluate(() => window.ringed()), [], 'after load');
  await page.evaluate(() => {
    window.app.show('agents');
    return true;
  });
  await page.until(() => !window.laidOut(window.fileTree()));
  await click(
    page,
    await page.evaluate(() =>
      window.center(window.$('slicc-app', '.rail.left [data-surface=files]'))
    )
  );
  await page.until(() => /slicc-file-tree/.test(window.focused()));
  assert.deepEqual(await page.evaluate(() => window.ringed()), [], 'after a panel show by mouse');
  await page.evaluate(() => {
    window.app.show('agents');
    return true;
  });
  await page.until(() => !window.laidOut(window.fileTree()));
  await page.evaluate(() => {
    window.app.show('files');
    return true;
  });
  await page.until(() => /slicc-file-tree/.test(window.focused()));
  assert.deepEqual(await page.evaluate(() => window.ringed()), [], 'after a panel show by script');
  const readme = 'workspace/harbor/README.md';
  await page.until((path) => window.laidOut(window.treeRow(path)), readme);
  await click(page, await page.evaluate((path) => window.center(window.treeRow(path)), readme));
  await page.until((path) => window.treeRow(path)?.dataset.itemSelected === 'true', readme);
  await page.until((path) => window.treeRow(path)?.dataset.itemFocused === 'true', readme);
  assert.deepEqual(await page.evaluate(() => window.ringed()), [], 'after a mouse click');
  await page.press('ArrowDown');
  await page.until(() => window.ringed().length === 1);
  assert.deepEqual(
    await page.evaluate(() => window.ringed()),
    ['workspace/harbor/wrangler.toml'],
    'after ArrowDown'
  );
  const search = await page.evaluate(() =>
    window.center(window.app.dock.content('files').shadowRoot.querySelector('sp-search'))
  );
  await click(page, search);
  await page.until(() => /sp-search/.test(window.focused()));
  assert.deepEqual(await page.evaluate(() => window.ringed()), [], 'in the search field');
  await page.press('Tab');
  await page.until(() => /slicc-file-tree/.test(window.focused()));
  await page.until(() => window.ringed().length === 1);
  assert.deepEqual(
    await page.evaluate(() => window.ringed()),
    ['workspace/harbor/wrangler.toml'],
    'after Tab'
  );
  assert.deepEqual(page.errors, []);
});

const wrap =
  'Wrap the upstream fetch in src/routes/forecast.ts with three retries and exponential backoff.';

for (const width of [1000, 420]) {
  test(`a long Freezer title at ${width} keeps its whole text, clamps with an ellipsis and has its full title`, async (t) => {
    const page = await open(t);
    await viewport(page, width);
    await page.evaluate(() => {
      window.app.show('freezer');
      window.freezerTitle = () =>
        [
          ...(window.app.dock.content('freezer')?.shadowRoot?.querySelectorAll('.title') ?? []),
        ].find((title) => title.textContent.startsWith('Wrap the upstream fetch')) ?? null;
      return true;
    });
    await page.until(() => window.laidOut(window.freezerTitle()));
    const seen = await page.evaluate(() => {
      const title = window.freezerTitle();
      const style = getComputedStyle(title);
      return {
        text: title.textContent,
        title: title.title,
        ellipsis: style.textOverflow,
        clamp: style.webkitLineClamp,
        overflow: style.overflow,
        overflows: title.scrollHeight > title.clientHeight,
      };
    });
    assert.deepEqual(seen, {
      text: wrap,
      title: wrap,
      ellipsis: 'ellipsis',
      clamp: '2',
      overflow: 'hidden',
      overflows: width === 1000,
    });
    assert.deepEqual(page.errors, []);
  });
}
