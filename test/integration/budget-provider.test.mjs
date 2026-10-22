import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => !!window.$('slicc-app', 'slicc-tray', '#usage'));
  return page;
}

const read = () => {
  const root = window.$('slicc-app', 'slicc-tray').shadowRoot;
  const usage = root.querySelector('#usage');
  return {
    chip: usage.querySelector('swc-status-light').textContent.trim(),
    label: usage.getAttribute('accessible-label') ?? usage.getAttribute('aria-label'),
    tip: root.querySelector('swc-tooltip[for=usage]').textContent.trim(),
  };
};

async function monitorLabel(page) {
  await page.evaluate(() => window.$('slicc-app', 'slicc-tray', '#usage').click());
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('monitor')
        ?.shadowRoot.querySelector('.vital[data-id=budget] [slot=label]')
  );
  return page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('monitor')
      .shadowRoot.querySelector('.vital[data-id=budget] [slot=label]')
      .textContent.trim()
  );
}

for (const [budget, name] of [
  ['adobe', 'Adobe'],
  ['xai', 'SuperGrok'],
]) {
  test(`the tray and the monitor label the ${name} budget by its provider`, async (t) => {
    const page = await open(t, { budget });
    const tray = await page.evaluate(read);
    assert.equal(tray.chip, `${name} weekly 32%`);
    assert.equal(
      tray.label,
      `${name} weekly 32%. Spent $23.67 · $0.59/h. 32% of the weekly budget, resets in 4 days.`
    );
    assert.equal(
      tray.tip,
      `${name} weekly. Spent $23.67 · $0.59/h. 32% of the weekly budget, resets in 4 days.`
    );
    assert.equal(await monitorLabel(page), `${name} weekly`);
    assert.deepEqual(page.errors, []);
  });
}

test('a budget without a provider keeps its plain label in the tray and the monitor', async (t) => {
  const page = await open(t);
  const tray = await page.evaluate(read);
  assert.equal(tray.chip, 'Budget 32%');
  assert.equal(
    tray.label,
    'Budget 32%. Spent $23.67 · $0.59/h. 32% of the weekly budget, resets in 4 days.'
  );
  assert.equal(tray.tip, 'Spent $23.67 · $0.59/h. 32% of the weekly budget, resets in 4 days.');
  assert.equal(await monitorLabel(page), 'Budget (weekly)');
  assert.deepEqual(page.errors, []);
});

test('the monitor shows a provider it does not know by its id', async (t) => {
  const page = await open(t);
  await monitorLabel(page);
  const label = await page.evaluate(async () => {
    const host = window.$('slicc-app', 'slicc-dock').content('monitor');
    const base = window.model.monitor.snapshot();
    window.model.monitor.snapshot = () => ({
      ...base,
      vitals: base.vitals.map((vital) =>
        vital.id === 'budget' ? { ...vital, provider: 'acme', window: 'monthly' } : vital
      ),
    });
    host.shadowRoot.querySelector('.bar swc-action-button').click();
    await host.updateComplete;
    return host.shadowRoot.querySelector('.vital[data-id=budget] [slot=label]').textContent.trim();
  });
  assert.equal(label, 'acme monthly');
  assert.deepEqual(page.errors, []);
});

async function viewport(t, page, width) {
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

const fit = () => {
  const root = window.$('slicc-app', 'slicc-tray').shadowRoot;
  const usage = root.querySelector('#usage');
  return {
    shown: usage.querySelector('swc-status-light').innerText.trim(),
    lines: (() => {
      const light = usage.querySelector('swc-status-light');
      const walker = document.createTreeWalker(light, NodeFilter.SHOW_TEXT);
      const tops = new Set();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.width > 0) tops.add(Math.round(rect.bottom));
      }
      return tops.size;
    })(),
    label: usage.getAttribute('accessible-label'),
    tip: root.querySelector('swc-tooltip[for=usage]').textContent.trim(),
    right: usage.getBoundingClientRect().right,
    height: Math.round(usage.getBoundingClientRect().height),
    chip: Math.round(root.querySelector('#chip').getBoundingClientRect().height),
    width: innerWidth,
  };
};

test('at 1280 the provider budget chip shows its window on one line in the header', async (t) => {
  const page = await open(t, { budget: 'xai' });
  await viewport(t, page, 1280);
  await page.until(() => window.app.getAttribute('screen') === 'desktop');
  await page.until(() => {
    const usage = window.$('slicc-app', 'slicc-tray', '#usage').getBoundingClientRect();
    return usage.width > 0 && usage.right <= innerWidth;
  });
  const box = await page.evaluate(fit);
  assert.equal(box.shown, 'SuperGrok weekly 32%', JSON.stringify(box));
  assert.equal(box.lines, 1, JSON.stringify(box));
  assert.equal(box.height, box.chip, JSON.stringify(box));
});

test('on a tablet the provider budget chip drops its window and the label and tooltip keep it', async (t) => {
  const page = await open(t, { budget: 'xai' });
  await viewport(t, page, 800);
  await page.until(() => window.app.getAttribute('screen') === 'tablet');
  await page.until(() => {
    const usage = window.$('slicc-app', 'slicc-tray', '#usage').getBoundingClientRect();
    return usage.width > 0 && usage.right <= innerWidth;
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '#usage swc-status-light').innerText.trim() ===
      'SuperGrok 32%'
  );
  const box = await page.evaluate(fit);
  assert.equal(box.shown, 'SuperGrok 32%', JSON.stringify(box));
  assert.equal(box.lines, 1, JSON.stringify(box));
  assert.match(box.label, /^SuperGrok weekly 32%\. /);
  assert.match(box.tip, /^SuperGrok weekly\. /);
  assert.equal(box.height, box.chip, JSON.stringify(box));
  assert.deepEqual(page.errors, []);
});

test('at the narrowest tablet the header keeps the View menu and its last button in view beside the SuperGrok chip', async (t) => {
  const page = await open(t, { budget: 'xai' });
  await viewport(t, page, 640);
  await page.until(() => window.app.getAttribute('screen') === 'tablet');
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '#usage swc-status-light').innerText.trim() ===
      'SuperGrok 32%'
  );
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const header = await page.evaluate(() => {
    const root = window.$('slicc-app', 'header');
    const shown = [...root.children].filter((child) => child.getBoundingClientRect().width > 0);
    return {
      end: shown.at(-1).getBoundingClientRect().right,
      menu: window.$('slicc-app', 'header sp-action-menu').getBoundingClientRect().width,
      icon: window
        .$('slicc-app', 'header sp-action-menu swc-icon-view-grid')
        .getBoundingClientRect().width,
      width: innerWidth,
    };
  });
  assert.ok(header.end <= header.width, JSON.stringify(header));
  assert.ok(header.menu >= header.icon && header.icon > 0, JSON.stringify(header));
  assert.deepEqual(page.errors, []);
});

test('on a 420 phone the SuperGrok budget card keeps its meter inside and names the window in its title', async (t) => {
  const page = await open(t, { budget: 'xai' });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.until(() => window.app.getAttribute('screen') === 'phone');
  await page.evaluate(() => window.app.show('monitor'));
  await page.until(() => {
    const card = window
      .$('slicc-app', 'slicc-dock')
      .content('monitor')
      ?.shadowRoot.querySelector('.vital[data-id=budget]');
    const box = card?.getBoundingClientRect();
    return !!box && box.width > 0 && box.right <= innerWidth;
  });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.until(
    () => window.$('slicc-app', 'slicc-dock').content('monitor').getAnimations().length === 0
  );
  const card = await page.evaluate(() => {
    const vital = window
      .$('slicc-app', 'slicc-dock')
      .content('monitor')
      .shadowRoot.querySelector('.vital[data-id=budget]');
    return {
      scroll: vital.scrollWidth,
      client: vital.clientWidth,
      shown: vital.querySelector('[slot=label]').innerText.trim(),
      title: vital.title,
    };
  });
  assert.ok(card.scroll <= card.client, JSON.stringify(card));
  assert.equal(card.shown, 'SuperGrok', JSON.stringify(card));
  assert.equal(card.title, 'SuperGrok weekly, resets in 4 days');
  assert.deepEqual(page.errors, []);
});
