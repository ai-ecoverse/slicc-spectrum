import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.log = () => window.chatPart('.log');
    window.gap = () => {
      const log = window.log();
      return log.scrollHeight - log.scrollTop - log.clientHeight;
    };
    window.jump = () => window.chatPart('[data-action=jump-latest]');
    return true;
  });
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('.decision-turn[data-id=k-l17]'));
  await page.until(() => window.log().scrollHeight > window.log().clientHeight * 4);
  await page.until(() => window.gap() <= 1);
  return page;
}

async function center(page) {
  return page.evaluate(() => {
    const box = window.log().getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
}

async function still(page) {
  let top = -1;
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => window.log().scrollTop);
    if (now === top) return now;
    top = now;
    await wait(200);
  }
  return top;
}

async function wheel(page, deltaY) {
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    ...(await center(page)),
    deltaX: 0,
    deltaY,
  });
  return still(page);
}

async function readBack(page, screens = 2) {
  const height = await page.evaluate(() => window.log().clientHeight);
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => window.gap())) > height * screens) break;
    await wheel(page, -40);
    await wait(500);
  }
  return still(page);
}

test('the transcript keeps the reader where they are while timers tick and nothing new arrives', async (t) => {
  const page = await open(t);
  const top = await readBack(page);
  const height = await page.evaluate(() => window.log().clientHeight);
  assert.ok((await page.evaluate(() => window.gap())) > height * 2);
  const seen = await page.evaluate(() => window.model.agent.messages('cone-kitchen').length);
  const tops = [];
  for (let i = 0; i < 6; i++) {
    await wait(500);
    tops.push(await page.evaluate(() => window.log().scrollTop));
  }
  assert.equal(await page.evaluate(() => window.model.agent.messages('cone-kitchen').length), seen);
  assert.deepEqual(tops, Array(6).fill(top));
  assert.equal(await page.evaluate(() => !!window.jump()), false);
  assert.deepEqual(page.errors, []);
});

test('new output while the reader is scrolled up keeps their place and offers Jump to latest', async (t) => {
  const page = await open(t);
  const top = await wheel(page, -1500);
  assert.ok((await page.evaluate(() => window.gap())) > 1000);
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The flour bin is low.')
  );
  await page.until(() => !!window.jump());
  assert.equal(await page.evaluate(() => window.log().scrollTop), top);
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'cron', 'Oven timer', 'The bread is done.')
  );
  await page.until(() => /\(2 new\)/.test(window.jump().textContent));
  assert.equal(await page.evaluate(() => window.log().scrollTop), top);
  assert.deepEqual(
    await page.evaluate(() => {
      const button = window.jump();
      const log = window.log().getBoundingClientRect();
      const box = button.getBoundingClientRect();
      const composer = window.chatPart('slicc-composer').getBoundingClientRect();
      return {
        text: button.textContent.trim(),
        icon: !!button.querySelector('[slot=icon]'),
        inside: box.left >= log.left && box.right <= log.right,
        above: box.bottom <= composer.top,
      };
    }),
    { text: 'Jump to latest (2 new)', icon: true, inside: true, above: true }
  );

  await page.evaluate(() => {
    window.jump().click();
    return true;
  });
  await page.until(() => window.gap() <= 1 && !window.jump());
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The sugar bin is low.')
  );
  await page.until(() =>
    window.chatPart('swc-conversation-thread').lastElementChild.textContent.includes('sugar')
  );
  await wait(300);
  assert.ok((await page.evaluate(() => window.gap())) <= 1);
  assert.equal(await page.evaluate(() => !!window.jump()), false);
  assert.deepEqual(page.errors, []);
});

test('scrolling back to the bottom resumes following and hides Jump to latest', async (t) => {
  const page = await open(t);
  await wheel(page, -1500);
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The flour bin is low.')
  );
  await page.until(() => !!window.jump());
  await wheel(page, 5000);
  await page.until(() => window.gap() <= 1 && !window.jump());
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'cron', 'Oven timer', 'The bread is done.')
  );
  await page.until(() =>
    window.chatPart('swc-conversation-thread').lastElementChild.textContent.includes('bread')
  );
  await wait(300);
  assert.ok((await page.evaluate(() => window.gap())) <= 1);
  assert.deepEqual(page.errors, []);
});

test("the user's own send while scrolled up scrolls down and resumes following", async (t) => {
  const page = await open(t);
  await wheel(page, -1500);
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The flour bin is low.')
  );
  await page.until(() => !!window.jump());
  await page.evaluate(() => {
    const composer = window.chatPart('slicc-composer');
    composer.value = 'What can I bake with less flour?';
    return true;
  });
  await page.evaluate(() => window.chatPart('slicc-composer', 'swc-prompt-field').focus());
  await page.press('Enter');
  await page.until(() =>
    window.model.agent
      .messages('cone-kitchen')
      .some((message) => message.role === 'user' && /less flour/.test(message.text))
  );
  await page.until(() => window.gap() <= 1 && !window.jump());
  await wait(300);
  assert.ok((await page.evaluate(() => window.gap())) <= 1);
  assert.deepEqual(page.errors, []);
});

test('a tool card opening above the viewport does not move the message being read', async (t) => {
  const page = await open(t);
  await wheel(page, -1500);
  const before = await page.evaluate(() => {
    const log = window.log();
    const box = log.getBoundingClientRect();
    const tools = [...log.querySelectorAll('details.tool:not([open])')].filter(
      (tool) => tool.getBoundingClientRect().bottom < box.top
    );
    const turns = [...log.querySelectorAll('swc-conversation-turn')].filter((turn) => {
      const rect = turn.getBoundingClientRect();
      return rect.top > box.top + 40 && rect.top < box.bottom - 40;
    });
    window.reading = turns[0];
    window.opened = tools.at(-1);
    return { tools: tools.length, top: window.reading?.getBoundingClientRect().top };
  });
  assert.ok(before.tools > 0 && before.top !== undefined, JSON.stringify(before));
  await page.evaluate(() => {
    window.height = window.log().scrollHeight;
    window.opened.open = true;
    return true;
  });
  await page.until(() => window.log().scrollHeight > window.height);
  await wait(300);
  const after = await page.evaluate(() => window.reading.getBoundingClientRect().top);
  assert.ok(Math.abs(after - before.top) <= 1, JSON.stringify({ before, after }));
  assert.equal(await page.evaluate(() => !!window.jump()), false);
  assert.deepEqual(page.errors, []);
});

test('Jump to latest floats above the composer on a phone', async (t) => {
  const page = await open(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.until(() => window.chatPart().getBoundingClientRect().right <= innerWidth);
  await page.until(() => window.gap() <= 1);
  await wheel(page, -1500);
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The flour bin is low.')
  );
  await page.until(() => !!window.jump());
  assert.deepEqual(
    await page.evaluate(() => {
      const box = window.jump().getBoundingClientRect();
      const composer = window.chatPart('slicc-composer').getBoundingClientRect();
      return { fits: box.left >= 0 && box.right <= innerWidth, above: box.bottom <= composer.top };
    }),
    { fits: true, above: true }
  );
  assert.deepEqual(page.errors, []);
});
