import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readings = Array.from(
  { length: 11 },
  (_, index) => `bed ${index + 1}: 18.${index} C, humidity ${60 + index}%`
).join('\n');

async function open(t, width, height) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', notices: 'storage' })}`
  );
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => !!window.chatPart('.log') && !!window.chatPart('slicc-composer'));
  if (width < 600) {
    await page.until(() => document.querySelector('slicc-app').screen === 'phone');
    await page.until(() => window.chatPart().getBoundingClientRect().right <= innerWidth);
  }
  await page.evaluate(() => {
    window.model.notices.dismiss('storage');
    window.model.agent.select('scoop-heron');
    window.log = () => window.chatPart('.log');
    window.gap = () => {
      const log = window.log();
      return log.scrollHeight - log.scrollTop - log.clientHeight;
    };
    window.card = () => window.chatPart('swc-conversation-thread')?.lastElementChild;
    window.place = () => {
      const log = window.log();
      const box = log.getBoundingClientRect();
      const top = window.card().getBoundingClientRect().top;
      const end = Math.min(
        box.bottom,
        window.chatPart('slicc-composer').getBoundingClientRect().top
      );
      const style = getComputedStyle(log);
      const room =
        log.clientHeight -
        Number.parseFloat(style.paddingBlockStart) -
        Number.parseFloat(style.paddingBlockEnd);
      return {
        visible: top >= box.top - 0.5 && top < end,
        fits: window.card().getBoundingClientRect().height <= room,
      };
    };
    return true;
  });
  await page.until(
    () => !window.chatPart('slicc-notices').shadowRoot.querySelector('[data-notice]')
  );
  return page;
}

async function reading(page, title) {
  await page.evaluate(
    (name, body) => {
      window.model.agent.lick('scoop-heron', 'webhook', name, 'The night readings are in.', body);
      return true;
    },
    title,
    readings
  );
  await page.until(
    (name) => window.card()?.textContent.includes(name) && !!window.card().querySelector('details'),
    title
  );
  await page.evaluate(() => {
    window.card().querySelector('details').open = true;
    return true;
  });
  await page.until(() => window.card().querySelector('pre')?.getBoundingClientRect().height > 0);
  await wait(300);
}

async function notices(page) {
  await page.evaluate(() => {
    window.model.notices.starting(true);
    window.model.notices.readOnly(true);
    return true;
  });
  await page.until(
    () => window.chatPart('slicc-notices').shadowRoot.querySelectorAll('[data-notice]').length === 2
  );
  await wait(300);
}

for (const [name, width, height] of [
  ['wide', 1280, 800],
  ['phone', 420, 860],
]) {
  test(`a notice above the log keeps the latest card's top in view on ${name}`, async (t) => {
    const page = await open(t, width, height);
    await reading(page, 'Greenhouse sensor');
    assert.deepEqual(await page.evaluate(() => window.place()), { visible: true, fits: true });
    await notices(page);
    assert.deepEqual(await page.evaluate(() => window.place()), { visible: true, fits: false });
    await page.evaluate(() => {
      window.model.agent.lick('scoop-heron', 'cron', 'Sprinkler', 'The east beds are watered.');
      return true;
    });
    await page.until(() => window.card().textContent.includes('Sprinkler'));
    await page.until(() => window.gap() <= 1);
    assert.equal(await page.evaluate(() => !!window.chatPart('[data-action=jump-latest]')), false);
    assert.deepEqual(page.errors, []);
  });

  test(`opening the latest card under a notice keeps its top in view on ${name}`, async (t) => {
    const page = await open(t, width, height);
    await notices(page);
    await reading(page, 'Greenhouse sensor');
    assert.deepEqual(await page.evaluate(() => window.place()), { visible: true, fits: false });
    assert.equal(await page.evaluate(() => !!window.chatPart('[data-action=jump-latest]')), false);
    assert.deepEqual(page.errors, []);
  });
}
