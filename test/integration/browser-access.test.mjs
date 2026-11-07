import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}, width = 1280, height = 1000) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 420,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', links: 'followers', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.net = () => window.$('slicc-app', 'slicc-dock').content('network')?.shadowRoot;
    window.row = (id) => window.net()?.querySelector(`[data-device=${id}]`);
    window.access = (id) => {
      const row = window.row(id);
      const fixed = row?.querySelector('[data-access=fixed]');
      if (fixed) return fixed.textContent.trim();
      return [...(row?.querySelectorAll('[data-access=edit] sp-switch') ?? [])].map((toggle) => [
        toggle.dataset.action,
        toggle.textContent.trim(),
        toggle.checked,
      ]);
    };
    window.granted = (id) =>
      window.model.network.status().links.devices.find((device) => device.id === id).access;
    window.dialog = () => {
      const confirm = window.$('slicc-app', 'slicc-confirm');
      const shown = confirm?.shadowRoot.querySelector('dialog');
      if (!shown?.open) return null;
      return {
        title: confirm.shadowRoot.querySelector('h2').textContent,
        body: confirm.shadowRoot.querySelector('p').textContent,
        buttons: [...confirm.shadowRoot.querySelectorAll('swc-button')].map((button) =>
          button.textContent.trim()
        ),
      };
    };
    window.answer = (ok) => {
      window
        .$('slicc-app', 'slicc-confirm')
        .shadowRoot.querySelector(ok ? '[data-action]' : '[data-cancel]')
        .click();
      return true;
    };
    return true;
  });
  await page.evaluate(() => window.app.show('network'));
  await page.until(() => !!window.row('link-dock')?.querySelector('[data-access]'));
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    return document.fonts.ready.then(() => true);
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

async function devices(page) {
  await page.evaluate(() => {
    window.row('link-quay').scrollIntoView({ block: 'start' });
    return true;
  });
}

const body =
  'It can open, read and control the tabs in this browser, as you, with your signed-in sites. This SLICC’s own pages and the vault stay out of its reach. Unlinking it, or a new certificate on it, turns this off again.';

test('a CLI device with browser in its access gets a Browser switch after Control', async (t) => {
  const page = await open(t);
  assert.deepEqual(await page.evaluate(() => window.access('link-dock')), [
    ['access-control', 'Control', false],
    ['access-browser', 'Browser', false],
  ]);
  assert.deepEqual(await page.evaluate(() => window.access('link-pier')), [
    ['access-control', 'Control', true],
    ['access-browser', 'Browser', true],
  ]);
  assert.deepEqual(await page.evaluate(() => window.access('link-bay')), [
    ['access-view', 'View', true],
    ['access-control', 'Control', true],
    ['access-terminal', 'Terminal', true],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a device on this computer lists Browser as always allowed', async (t) => {
  const page = await open(t);
  assert.equal(
    await page.evaluate(() => window.access('link-quay')),
    'Always allowed from this computer: Control, Browser.'
  );
  assert.equal(
    await page.evaluate(() => !!window.row('link-quay').querySelector('sp-switch')),
    false
  );
});

test('turning Browser on asks first, and Cancel leaves it off', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.row('link-dock').querySelector('[data-action=access-browser]').click();
    return true;
  });
  await page.until(() => window.dialog() !== null);
  assert.deepEqual(await page.evaluate(() => window.dialog()), {
    title: 'Let SLICC on dock-builder drive this browser?',
    body,
    buttons: ['Cancel', 'Allow'],
  });
  await page.evaluate(() => window.answer(false));
  await page.until(() => window.dialog() === null);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual((await page.evaluate(() => window.access('link-dock')))[1], [
    'access-browser',
    'Browser',
    false,
  ]);
  assert.equal(await page.evaluate(() => window.granted('link-dock').browser), false);
  assert.deepEqual(page.errors, []);
});

test('Allow on the Browser confirm grants it through setAccess', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.row('link-dock').querySelector('[data-action=access-browser]').click();
    return true;
  });
  await page.until(() => window.dialog() !== null);
  await page.evaluate(() => window.answer(true));
  await page.until(() => window.granted('link-dock').browser === true);
  await page.until(() => window.access('link-dock')[1][2] === true);
  assert.equal(await page.evaluate(() => window.granted('link-dock').control), false);
  assert.deepEqual(page.errors, []);
});

test('a cdp chip with an empty what renders without a stray separator', async (t) => {
  const page = await open(t, { live: 'screen' });
  await page.evaluate(() => {
    window.model.live.add({
      id: 'live-cdp-link-dock',
      kind: 'cdp',
      label: 'Driving this browser',
      what: '',
      asker: 'slicc on dock-builder',
      since: Date.now(),
      action: { label: 'Stop' },
    });
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-live')
        ?.shadowRoot.querySelector('[data-id=live-cdp-link-dock][data-kind=cdp]')
  );
  const chip = await page.evaluate(() => {
    const node = window
      .$('slicc-app', 'slicc-live')
      .shadowRoot.querySelector('[data-id=live-cdp-link-dock]');
    return {
      text: node.querySelector('.text').innerText,
      title: node.querySelector('.text').title,
      button: node.querySelector('[data-action=live-act]').textContent.trim(),
    };
  });
  assert.match(chip.text, /^Driving this browser · slicc on dock-builder · 0:0\d$/);
  assert.match(chip.title, /^Driving this browser · slicc on dock-builder · 0:0\d$/);
  assert.equal(chip.button, 'Stop');
  assert.deepEqual(page.errors, []);
});

for (const [name, params, width, height] of [
  ['light', { color: 'light' }, 1280, 1000],
  ['dark', { color: 'dark' }, 1280, 1000],
  ['phone', { color: 'light' }, 420, 860],
]) {
  test(`Linked devices with the Browser switch, ${name}`, async (t) => {
    const page = await open(t, params, width, height);
    await devices(page);
    await shot(page, `devices-${name}`);
    await page.evaluate(() => {
      window.row('link-dock').querySelector('[data-action=access-browser]').click();
      return true;
    });
    await page.until(() => window.dialog() !== null);
    await shot(page, `confirm-${name}`);
    await page.evaluate(() => window.answer(false));
    await page.until(() => window.dialog() === null);
    assert.deepEqual(page.errors, []);
  });
}
