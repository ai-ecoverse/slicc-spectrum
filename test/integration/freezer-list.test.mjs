import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

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

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.evaluate(() => {
    window.freezer = () => window.app.dock.content('freezer');
    window.inFreezer = (selector) => window.freezer()?.shadowRoot.querySelector(selector);
    window.allInFreezer = (selector) => [
      ...(window.freezer()?.shadowRoot.querySelectorAll(selector) ?? []),
    ];
    window.row = (id) => window.inFreezer(`.row[data-id="${id}"]`);
    window.app.show('freezer');
    return true;
  });
  await page.until(() => window.allInFreezer('.row').length === window.model.agent.frozen().length);
  return page;
}

test('the Freezer lists conversations under Live and Frozen, with no badges or status lights', async (t) => {
  const page = await open(t);
  const seen = await page.evaluate(() => {
    const frozen = window.model.agent.frozen();
    return {
      sections: window
        .allInFreezer('section')
        .map((section) => [
          section.dataset.section,
          section.querySelector('h3').textContent,
          section.getAttribute('aria-labelledby') === section.querySelector('h3').id,
          section.querySelectorAll(':scope > ul > li.row').length,
        ]),
      live: frozen.filter((cone) => cone.live).length,
      rest: frozen.filter((cone) => !cone.live).length,
      badges: window.allInFreezer('.list swc-badge').length,
      lights: window.allInFreezer('.list swc-status-light').length,
      liveFirst: window
        .allInFreezer('section[data-section=live] .row')
        .every((row) => row.hasAttribute('data-live')),
      frozenAfter: window
        .allInFreezer('section[data-section=frozen] .row')
        .every((row) => !row.hasAttribute('data-live')),
    };
  });
  assert.deepEqual(seen.sections, [
    ['live', 'Live', true, seen.live],
    ['frozen', 'Frozen', true, seen.rest],
  ]);
  assert.deepEqual(
    [seen.badges, seen.lights, seen.liveFirst, seen.frozenAfter],
    [0, 0, true, true]
  );
});

test('a Freezer row leads with the conversation title and folds name, kind, age, model and size into one meta line', async (t) => {
  const page = await open(t);
  await page.until(() => !!window.row('scoop-tide-check'));
  const rows = await page.evaluate(() => {
    const read = (id) => {
      const row = window.row(id);
      return {
        title: row.querySelector('.title').textContent,
        meta: row.querySelector('.meta').textContent,
        keys: [...row.querySelectorAll('.meta [data-meta]')].map((part) => part.dataset.meta),
      };
    };
    return {
      scoop: read('scoop-tide-check'),
      agent: read('run-nightly-digest'),
      live: read('cone-harbor'),
      same: read('cone-triage'),
    };
  });
  assert.equal(rows.scoop.title, 'Check the tide tables against the harbor feed');
  assert.match(
    rows.scoop.meta,
    /^tide-check · Scoop · (today|yesterday|\d+ days ago|\d+ weeks ago) · Claude Haiku 4\.5 · 9 messages$/
  );
  assert.deepEqual(rows.scoop.keys, ['name', 'kind', 'when', 'model', 'messages']);
  assert.deepEqual(rows.agent.keys, ['name', 'kind', 'when', 'model', 'messages']);
  assert.match(rows.agent.meta, /^nightly-digest · Agent run · /);
  assert.deepEqual(rows.live.keys, ['name', 'model', 'messages']);
  assert.deepEqual(rows.same, {
    title: 'inbox-triage',
    meta: 'Claude Sonnet 5.5 · 4 messages',
    keys: ['model', 'messages'],
  });
});

test('Freezer row actions are quiet, always visible icon buttons on the title line, named and tipped', async (t) => {
  const page = await open(t);
  await viewport(page, 1280);
  await page.evaluate(() => {
    window.freezer().shadowRoot.activeElement?.blur();
    return true;
  });
  const shape = await page.evaluate(() => {
    const row = window.row('scoop-tide-check');
    const title = row.querySelector('.title').getBoundingClientRect();
    const buttons = [...row.querySelectorAll('swc-action-button')];
    return {
      actions: buttons.map((button) => [
        button.dataset.action,
        button.getAttribute('accessible-label'),
        button.hasAttribute('quiet'),
        button.textContent.trim(),
        !!button.querySelector('[slot=icon]'),
        row.querySelector(`swc-tooltip[for="${button.id}"]`)?.textContent,
        Math.abs(button.getBoundingClientRect().top - title.top) < title.height,
        getComputedStyle(button.parentElement).opacity,
      ]),
      open: [...window.row('cone-harbor').querySelectorAll('swc-action-button')].map((button) => [
        button.dataset.action,
        button.textContent.trim(),
        !!button.querySelector('swc-icon-open-in[slot=icon]'),
      ]),
    };
  });
  assert.deepEqual(shape.actions, [
    ['thaw', 'Thaw tide-check', true, '', true, 'Thaw tide-check', true, '1'],
    ['remove', 'Remove tide-check', true, '', true, 'Remove tide-check', true, '1'],
  ]);
  assert.deepEqual(shape.open, [['open', '', true]]);
});

test('Freezer rows sit flat on the panel layer, with no card fill, and fit a 320 phone without sideways scroll', async (t) => {
  const page = await open(t);
  await viewport(page, 320);
  await page.evaluate(() => {
    window.app.show('freezer');
    return true;
  });
  await page.until(() => window.row('scoop-tide-check')?.getBoundingClientRect().width > 0);
  const seen = await page.evaluate(() => {
    const list = window.inFreezer('.list');
    const row = window.row('scoop-tide-check');
    return {
      list: getComputedStyle(list).backgroundColor,
      row: getComputedStyle(row).backgroundColor,
      overflow: list.scrollWidth <= list.clientWidth,
      rowFits: window
        .allInFreezer('.row')
        .every((item) => item.getBoundingClientRect().right <= list.getBoundingClientRect().right),
    };
  });
  assert.equal(seen.row, 'rgba(0, 0, 0, 0)');
  assert.notEqual(seen.list, 'rgba(0, 0, 0, 0)');
  assert.deepEqual([seen.overflow, seen.rowFits], [true, true]);
});
