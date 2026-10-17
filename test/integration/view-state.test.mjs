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
    window.view = (id) => window.app.dock.content(id) ?? null;
    window.part = (id, selector) => window.view(id)?.shadowRoot?.querySelector(selector) ?? null;
    window.laidOut = (node) =>
      !!node &&
      node.getBoundingClientRect().width > 0 &&
      node.getBoundingClientRect().right <= innerWidth;
    return true;
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  return page;
}

async function viewport(page, width) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const screen = width < 640 ? 'phone' : width < 1200 ? 'tablet' : 'desktop';
  await page.until((screen) => window.app.screen === screen, screen);
}

async function show(page, id, ready) {
  await page.evaluate((id) => {
    window.app.show(id);
    return true;
  }, id);
  await page.until(([id, ready]) => window.laidOut(window.part(id, ready)), [id, ready]);
}

async function armClick(page, id, selector) {
  await page.evaluate(
    ([id, selector]) => {
      const outgoing = window.view(id);
      window.outgoing = outgoing;
      window.clicked = null;
      addEventListener(
        'resize',
        () => {
          window.clicked = {
            connected: outgoing.isConnected,
            screen: window.app.screen,
          };
          outgoing.shadowRoot.querySelector(selector).click();
        },
        { once: true }
      );
      return true;
    },
    [id, selector]
  );
}

async function rebuilt(page, id, ready) {
  await page.until(
    ([id, ready]) => window.view(id) !== window.outgoing && window.laidOut(window.part(id, ready)),
    [id, ready]
  );
  return page.evaluate(() => window.clicked);
}

const processes = '.section[data-id=processes] .toggle';
const monitorOpen = () =>
  window.part('monitor', '.section[data-id=processes] .toggle')?.getAttribute('aria-expanded');

test('the monitor keeps a closed section from 1280 to a 420 phone, and a click during the rebuild sticks', async (t) => {
  const page = await open(t, { monitor: 'agent' });
  await viewport(page, 1280);
  await show(page, 'monitor', processes);
  assert.equal(await page.evaluate(monitorOpen), 'true');
  await page.evaluate((selector) => {
    window.part('monitor', selector).click();
    return true;
  }, processes);
  await page.until(() => window.part('monitor', '#rows-processes') === null);

  await viewport(page, 420);
  await show(page, 'monitor', processes);
  assert.equal(await page.evaluate(monitorOpen), 'false');
  assert.equal(await page.evaluate(() => window.part('monitor', '#rows-processes')), null);

  await page.evaluate((selector) => {
    window.part('monitor', selector).click();
    return true;
  }, processes);
  await page.until(
    () => window.part('monitor', '.section[data-id=processes][data-open] #rows-processes') !== null
  );
  await page.evaluate(() => {
    window.outgoing = window.view('monitor');
    return true;
  });
  await viewport(page, 1280);
  await rebuilt(page, 'monitor', processes);
  assert.equal(await page.evaluate(monitorOpen), 'true');

  await armClick(page, 'monitor', processes);
  await viewport(page, 420);
  const clicked = await rebuilt(page, 'monitor', processes);
  assert.deepEqual(clicked, { connected: true, screen: 'desktop' });
  assert.equal(await page.evaluate(monitorOpen), 'false');
  assert.equal(await page.evaluate(() => window.part('monitor', '#rows-processes')), null);
  assert.deepEqual(page.errors, []);
});

const harbor = 'li[data-id=cone-harbor] [data-action=toggle-cone]';
const otter = () => window.part('agents', 'li[data-id=scoop-otter]') !== null;

test('an expanded cone in Agents stays open from 1280 to a 420 phone, and a click during the rebuild sticks', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await show(page, 'agents', 'li[data-id=cone-harbor]');
  assert.equal(await page.evaluate(otter), false);
  await page.evaluate((selector) => {
    window.part('agents', selector).click();
    return true;
  }, harbor);
  await page.until(otter);

  await viewport(page, 420);
  await show(page, 'agents', 'li[data-id=cone-harbor]');
  assert.equal(await page.evaluate(otter), true);
  assert.equal(
    await page.evaluate(() =>
      window.part('agents', 'li[data-id=cone-harbor]').getAttribute('aria-expanded')
    ),
    'true'
  );

  await page.evaluate((selector) => {
    window.part('agents', selector).click();
    return true;
  }, harbor);
  await page.until(() => !window.part('agents', 'li[data-id=scoop-otter]'));
  await page.evaluate(() => {
    window.outgoing = window.view('agents');
    return true;
  });
  await viewport(page, 1280);
  await rebuilt(page, 'agents', 'li[data-id=cone-harbor]');
  assert.equal(await page.evaluate(otter), false);

  await armClick(page, 'agents', harbor);
  await viewport(page, 420);
  await page.evaluate(() => {
    window.app.show('agents');
    return true;
  });
  const clicked = await rebuilt(page, 'agents', 'li[data-id=cone-harbor]');
  assert.deepEqual(clicked, { connected: true, screen: 'desktop' });
  await page.until(otter);
  assert.equal(await page.evaluate(() => window.model.agent.active()), 'cone-sliccy');
  assert.deepEqual(page.errors, []);
});

const panels = [
  {
    name: 'an open memory',
    id: 'memory',
    ready: '.row[data-id] .head',
    act: () => {
      const row = window.part('memory', '.row[data-id]');
      window.picked = row.dataset.id;
      row.querySelector('.head').click();
      return true;
    },
    held: () =>
      window
        .part('memory', `.row[data-id="${window.picked}"][data-open] .head`)
        ?.getAttribute('aria-expanded') === 'true',
  },
  {
    name: 'an expanded folder in Files',
    id: 'files',
    ready: 'slicc-file-tree',
    act: () => {
      const row = (path) =>
        window
          .part('files', 'slicc-file-tree')
          .tree.getFileTreeContainer()
          ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`);
      window.folderRow = row;
      if (!row('shared/')) return false;
      if (!row('shared/MEMORY.md')) row('shared/').click();
      return true;
    },
    held: () => {
      const row = (path) =>
        window
          .part('files', 'slicc-file-tree')
          ?.tree?.getFileTreeContainer()
          ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`);
      return !!row('shared/') && !!row('shared/MEMORY.md');
    },
  },
  {
    name: 'an open lick in the chat',
    id: 'chat:cone-kitchen',
    before: () => window.model.agent.select('cone-kitchen'),
    ready: 'details.lick[data-id=k-l1] > summary',
    act: () => {
      window.part('chat:cone-kitchen', 'details.lick[data-id=k-l1] > summary').click();
      return true;
    },
    held: () => window.part('chat:cone-kitchen', 'details.lick[data-id=k-l1]')?.open === true,
  },
  {
    name: 'an open tool run in the chat',
    id: 'chat:cone-kitchen',
    before: () => window.model.agent.select('cone-kitchen'),
    ready: '[data-action=open-run][data-target=k-r7]',
    act: () => {
      window.part('chat:cone-kitchen', '[data-action=open-run][data-target=k-r7]').click();
      return true;
    },
    held: () =>
      window
        .part('chat:cone-kitchen', '[data-action=open-run][data-target=k-r7]')
        ?.getAttribute('aria-expanded') === 'true',
  },
  {
    name: 'an expanded address in Browser',
    id: 'browser',
    params: { browser: 'idle' },
    before: () => {
      window.model.browser.record({
        tabId: 'tab-preview',
        agentId: 'cone-harbor',
        kind: 'goto',
        value: 'https://forecast.example.com/harbor/today',
      });
      return true;
    },
    ready: '[data-action=action-url]',
    act: () => {
      window.part('browser', '[data-action=action-url]').click();
      return true;
    },
    held: () =>
      window.part('browser', '[data-action=action-url]')?.getAttribute('aria-expanded') === 'true',
  },
  {
    name: 'the open recent actions in Browser',
    id: 'browser',
    widths: [420, 1280, 420],
    params: { browser: 'idle' },
    before: () => {
      for (const value of ['https://forecast.example.com/a', 'https://forecast.example.com/b'])
        window.model.browser.record({
          tabId: 'tab-preview',
          agentId: 'cone-harbor',
          kind: 'goto',
          value,
        });
      return true;
    },
    ready: '.actions.last',
    act: () => {
      const summary = window.part('browser', 'details > summary');
      if (!summary) return false;
      summary.click();
      return true;
    },
    held: () => window.part('browser', 'details:has(> summary)')?.open === true,
  },
  {
    name: 'an open disclosure in Network',
    id: 'network',
    params: { links: 'linked' },
    ready: 'details > summary',
    act: () => {
      window.part('network', 'details > summary').click();
      return true;
    },
    held: () => window.part('network', 'details')?.open === true,
  },
  {
    name: 'an open install log in Install / Update',
    id: 'updates',
    params: { updates: 'restart' },
    ready: 'article[data-id] details > summary',
    act: () => {
      window.part('updates', 'article[data-id] details > summary').click();
      return true;
    },
    held: () => window.part('updates', 'article[data-id] details')?.open === true,
  },
  {
    name: 'the open removed secrets in Settings',
    id: 'settings',
    params: { vault: 'secrets' },
    ready: 'slicc-secrets',
    act: () => {
      const summary = window
        .part('settings', 'slicc-secrets')
        .shadowRoot?.querySelector('details[data-removed] > summary');
      if (!summary) return false;
      summary.click();
      return true;
    },
    held: () =>
      window.part('settings', 'slicc-secrets')?.shadowRoot?.querySelector('details[data-removed]')
        ?.open === true,
  },
];

for (const spec of panels) {
  test(`${spec.name} survives the rebuild from ${(spec.widths ?? [1280, 420]).join(' to ')}`, async (t) => {
    const page = await open(t, spec.params);
    const [first, ...rest] = spec.widths ?? [1280, 420];
    await viewport(page, first);
    if (spec.before) await page.evaluate(spec.before);
    await show(page, spec.id, spec.ready);
    assert.equal(await page.evaluate(spec.held), false);
    await page.until(spec.act);
    await page.until(spec.held);
    for (const width of rest) {
      await page.evaluate((id) => {
        window.outgoing = window.view(id);
        return true;
      }, spec.id);
      await viewport(page, width);
      await show(page, spec.id, spec.ready);
    }
    assert.equal(await page.evaluate((id) => window.view(id) !== window.outgoing, spec.id), true);
    await page.until(spec.held);
    assert.equal(await page.evaluate(spec.held), true);
    assert.deepEqual(page.errors, []);
  });
}

test('a search in Files leaves its folders out of what a rebuilt Files opens', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await show(page, 'files', 'slicc-file-tree');
  await page.evaluate(() => {
    window.treeRow = (path) =>
      window
        .part('files', 'slicc-file-tree')
        ?.tree?.getFileTreeContainer()
        ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`) ?? null;
    return true;
  });
  await page.until(() => !!window.treeRow('shared/'));
  assert.equal(await page.evaluate(() => !!window.treeRow('shared/MEMORY.md')), false);
  await page.evaluate(() => {
    const field = window.part('files', 'sp-search');
    field.value = 'MEMORY';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    return true;
  });
  await page.until(() => !!window.treeRow('shared/MEMORY.md'));
  await page.evaluate(() => {
    window.outgoing = window.view('files');
    return true;
  });
  await viewport(page, 420);
  await show(page, 'files', 'slicc-file-tree');
  await page.until(() => window.view('files') !== window.outgoing && !!window.treeRow('shared/'));
  assert.equal(await page.evaluate(() => window.part('files', 'sp-search').value), '');
  assert.equal(await page.evaluate(() => !!window.treeRow('shared/MEMORY.md')), false);
  assert.deepEqual(page.errors, []);
});

test('a folder closed over open subfolders in Files stays closed after a rebuild', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await show(page, 'files', 'slicc-file-tree');
  await page.evaluate(() => {
    window.treeRow = (path) =>
      window
        .part('files', 'slicc-file-tree')
        ?.tree?.getFileTreeContainer()
        ?.shadowRoot?.querySelector(`[data-item-path="${path}"]`) ?? null;
    return true;
  });
  const src = 'workspace/harbor/src/';
  const lib = 'workspace/harbor/src/lib/';
  await page.until((lib) => !!window.treeRow(lib), lib);
  await page.evaluate((src) => {
    window.treeRow(src).click();
    return true;
  }, src);
  await page.until((lib) => !window.treeRow(lib), lib);
  await page.evaluate(() => {
    window.outgoing = window.view('files');
    return true;
  });
  await viewport(page, 420);
  await show(page, 'files', 'slicc-file-tree');
  await page.until((src) => window.view('files') !== window.outgoing && !!window.treeRow(src), src);
  assert.equal(await page.evaluate((lib) => !!window.treeRow(lib), lib), false);
  assert.deepEqual(page.errors, []);
});
