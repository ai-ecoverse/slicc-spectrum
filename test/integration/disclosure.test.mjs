import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.roots = () => {
      const out = [];
      const walk = (root) => {
        out.push(root);
        for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
      };
      walk(document);
      return out;
    };
    window.summaries = () =>
      window.roots().flatMap((root) => [...root.querySelectorAll('details > summary')]);
    window.summaryOf = (text) =>
      window.summaries().find((summary) => summary.textContent.trim().startsWith(text)) ?? null;
    window.laidOut = (node) =>
      !!node &&
      node.getBoundingClientRect().width > 0 &&
      node.getBoundingClientRect().right <= innerWidth;
    return true;
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  return page;
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

async function expanded(page, text) {
  const { result } = await page.send('Runtime.evaluate', {
    expression: `window.summaryOf(${JSON.stringify(text)})`,
  });
  const { nodes } = await page.send('Accessibility.getPartialAXTree', {
    objectId: result.objectId,
    fetchRelatives: false,
  });
  return nodes[0].properties?.find((property) => property.name === 'expanded')?.value.value;
}

const surfaces = [
  {
    id: 'network',
    params: { network: 'ok' },
    summaries: ['Link another device', 'Other ways to reach the whole web'],
  },
  { id: 'updates', params: { updates: 'restart' }, summaries: ['Install log'] },
  { id: 'settings', params: { vault: 'secrets' }, summaries: ['Removed'] },
];

for (const surface of surfaces) {
  test(`the disclosures in ${surface.id} show the quiet chevron, not the native marker, and toggle their expanded state`, async (t) => {
    const page = await open(t, surface.params);
    await viewport(page, 1280);
    await page.evaluate((id) => {
      window.app.show(id);
      return true;
    }, surface.id);
    for (const text of surface.summaries)
      await page.until((text) => window.laidOut(window.summaryOf(text)), text);
    const markers = await page.evaluate(() =>
      window.summaries().map((summary) => {
        const style = getComputedStyle(summary);
        return [
          summary.textContent.trim(),
          style.display !== 'list-item' && style.listStyleType === 'none',
        ];
      })
    );
    assert.ok(markers.length >= surface.summaries.length, JSON.stringify(markers));
    assert.deepEqual(
      markers.filter(([, quiet]) => !quiet),
      [],
      'no summary in the app shows the native marker'
    );
    for (const text of surface.summaries) {
      const state = () =>
        page.evaluate((text) => {
          const summary = window.summaryOf(text);
          const chevron = summary.querySelector(':scope > swc-icon-chevron-right.chevron');
          return {
            open: summary.parentElement.open,
            chevron: !!chevron && chevron.getAttribute('aria-hidden') === 'true',
            turned: !!chevron && getComputedStyle(chevron).transform !== 'none',
          };
        }, text);
      const still = (text) =>
        window.summaryOf(text).querySelector('.chevron').getAnimations().length === 0;
      await page.evaluate((text) => {
        const summary = window.summaryOf(text);
        if (summary.parentElement.open) summary.parentElement.open = false;
        return true;
      }, text);
      await page.until(still, text);
      assert.deepEqual(await state(), { open: false, chevron: true, turned: false }, text);
      assert.equal(await expanded(page, text), false, text);
      await page.evaluate((text) => {
        window.summaryOf(text).focus();
        return true;
      }, text);
      await page.press('Enter');
      await page.until((text) => window.summaryOf(text).parentElement.open, text);
      await page.until(still, text);
      assert.deepEqual(await state(), { open: true, chevron: true, turned: true }, text);
      assert.equal(await expanded(page, text), true, text);
      await page.press(' ');
      await page.until((text) => !window.summaryOf(text).parentElement.open, text);
      await page.until(still, text);
      assert.deepEqual(await state(), { open: false, chevron: true, turned: false }, text);
      assert.equal(await expanded(page, text), false, text);
    }
    assert.deepEqual(page.errors, []);
  });
}

test('a long folder name in the narrow tablet Files panel ellipsizes and keeps its full name as a title', async (t) => {
  const page = await open(t);
  const folder = 'workspace/quarterly-forecast-archive-northern-region/';
  await page.evaluate(
    (folder) =>
      window.model.files
        .write(`/${folder}tide-summary-for-the-northern-harbor.md`, 'x')
        .then(() => true),
    folder
  );
  await viewport(page, 1000);
  await page.evaluate(() => {
    window.app.show('files');
    window.treeRow = (path) =>
      window.app.dock
        .content('files')
        ?.shadowRoot?.querySelector('slicc-file-tree')
        ?.tree?.getFileTreeContainer()
        ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`) ?? null;
    return true;
  });
  await page.until((folder) => window.laidOut(window.treeRow(folder)), folder);
  const seen = await page.evaluate((folder) => {
    const row = window.treeRow(folder);
    const content = row.querySelector('[data-item-section=content]');
    const style = getComputedStyle(content);
    const text = [...content.querySelectorAll('[data-truncate-content=visible]')]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => node.textContent)
      .join('');
    const parent = window.treeRow('workspace/');
    const indent = (node) =>
      node.querySelector('[data-item-section=icon]').getBoundingClientRect().left;
    return {
      narrow: window.app.dock.content('files').getBoundingClientRect().width < 400,
      overflows: content.scrollWidth > content.clientWidth,
      ellipsis: style.textOverflow,
      nowrap: style.whiteSpace,
      text,
      title: row.title,
      chevron: !!row.querySelector(
        '[data-item-section=icon] [data-icon-name=file-tree-icon-chevron]'
      ),
      indented: indent(row) > indent(parent),
    };
  }, folder);
  assert.deepEqual(seen, {
    narrow: true,
    overflows: true,
    ellipsis: 'ellipsis',
    nowrap: 'nowrap',
    text: 'quarterly-forecast-archive-northern-region',
    title: 'quarterly-forecast-archive-northern-region',
    chevron: true,
    indented: true,
  });
  assert.deepEqual(page.errors, []);
});

test('the inline sprinkle handle keeps its 20px inline start margin', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await page.evaluate(() => {
    window.welcome = () =>
      window.app.dock
        .content('chat:cone-sliccy')
        ?.shadowRoot?.querySelector('slicc-sprinkle[inline]') ?? null;
    return true;
  });
  await page.until(() => !!window.welcome()?.shadowRoot?.querySelector('.handle'));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.welcome().shadowRoot;
      const handle = root.querySelector('.handle');
      return [
        getComputedStyle(handle).marginInlineStart,
        Math.round(
          handle.getBoundingClientRect().left -
            root.querySelector('.frame').getBoundingClientRect().left
        ),
      ];
    }),
    ['20px', 20]
  );
  assert.deepEqual(page.errors, []);
});
