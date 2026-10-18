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
            inherits:
              !!chevron && getComputedStyle(chevron).color === getComputedStyle(summary).color,
            ring: summary.matches(':focus-visible') ? getComputedStyle(summary).outlineStyle : null,
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
      assert.deepEqual(
        await state(),
        { open: false, chevron: true, turned: false, inherits: true, ring: null },
        text
      );
      assert.equal(await expanded(page, text), false, text);
      await page.evaluate((text) => {
        window.summaryOf(text).focus();
        return true;
      }, text);
      await page.press('Enter');
      await page.until((text) => window.summaryOf(text).parentElement.open, text);
      await page.until(still, text);
      assert.deepEqual(
        await state(),
        { open: true, chevron: true, turned: true, inherits: true, ring: 'solid' },
        text
      );
      assert.equal(await expanded(page, text), true, text);
      await page.press(' ');
      await page.until((text) => !window.summaryOf(text).parentElement.open, text);
      await page.until(still, text);
      assert.deepEqual(
        await state(),
        { open: false, chevron: true, turned: false, inherits: true, ring: 'solid' },
        text
      );
      assert.equal(await expanded(page, text), false, text);
    }
    assert.deepEqual(page.errors, []);
  });
}

test('the quiet chevron mirrors right to left and stays still under reduced motion', async (t) => {
  const page = await open(t, { network: 'ok' });
  t.after(() => page.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {}));
  await viewport(page, 1280);
  await page.evaluate(() => {
    window.app.show('network');
    return true;
  });
  const text = 'Link another device';
  await page.until((text) => window.laidOut(window.summaryOf(text)), text);
  const chevron = (text) => {
    const summary = window.summaryOf(text);
    const style = getComputedStyle(summary.querySelector('.chevron'));
    return [summary.parentElement.open, style.transform, style.transitionDuration];
  };
  const still = (text) =>
    window.summaryOf(text).querySelector('.chevron').getAnimations().length === 0;
  assert.deepEqual(await page.evaluate(chevron, text), [false, 'none', '0.13s']);
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
    return true;
  });
  await page.until(still, text);
  assert.deepEqual(await page.evaluate(chevron, text), [
    false,
    'matrix(-1, 0, 0, 1, 0, 0)',
    '0.13s',
  ]);
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.evaluate((text) => {
    window.summaryOf(text).parentElement.open = true;
    return true;
  }, text);
  await page.until((text) => window.summaryOf(text).parentElement.open, text);
  const [shown, turned, duration] = await page.evaluate(chevron, text);
  assert.deepEqual(
    [shown, turned.startsWith('matrix(') && turned !== 'matrix(-1, 0, 0, 1, 0, 0)', duration],
    [true, true, '0s']
  );
  assert.equal(await page.evaluate(still, text), true);
  await page.evaluate(() => {
    document.documentElement.dir = '';
    return true;
  });
  assert.deepEqual(page.errors, []);
});

const folders = [
  {
    name: 'a long folder name',
    write:
      '/workspace/quarterly-forecast-archive-northern-region/tide-summary-for-the-northern-harbor.md',
    row: 'workspace/quarterly-forecast-archive-northern-region/',
    label: 'quarterly-forecast-archive-northern-region',
  },
  {
    name: 'a long flattened folder chain',
    write: '/workspace/northern-harbor-archives/tidal-observations-collection/buoy-readings.md',
    row: 'workspace/northern-harbor-archives/tidal-observations-collection/',
    label: 'northern-harbor-archives / tidal-observations-collection',
  },
];

for (const folder of folders) {
  test(`${folder.name} in the narrow tablet Files panel ellipsizes and keeps its full name as a title`, async (t) => {
    const page = await open(t);
    await page.evaluate(
      (path) => window.model.files.write(path, 'x').then(() => true),
      folder.write
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
    await page.until((path) => window.laidOut(window.treeRow(path)), folder.row);
    const seen = await page.evaluate((path) => {
      const row = window.treeRow(path);
      const content = row.querySelector('[data-item-section=content]');
      const style = getComputedStyle(content);
      const parent = window.treeRow('workspace/');
      const indent = (node) =>
        node.querySelector('[data-item-section=icon]').getBoundingClientRect().left;
      return {
        narrow: window.app.dock.content('files').getBoundingClientRect().width < 400,
        overflows: content.scrollWidth > content.clientWidth,
        ellipsis: style.textOverflow,
        nowrap: style.whiteSpace,
        text: content.innerText.replace(/\s+/g, ' ').trim(),
        title: row.title,
        chevron: !!row.querySelector(
          '[data-item-section=icon] [data-icon-name=file-tree-icon-chevron]'
        ),
        indented: indent(row) > indent(parent),
      };
    }, folder.row);
    assert.deepEqual(seen, {
      narrow: true,
      overflows: true,
      ellipsis: 'ellipsis',
      nowrap: 'nowrap',
      text: folder.label,
      title: folder.label,
      chevron: true,
      indented: true,
    });
    assert.deepEqual(page.errors, []);
  });
}

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
