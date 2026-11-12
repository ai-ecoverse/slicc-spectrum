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
    window.row = () => window.chatPart('[data-older]');
    window.calls = (id) => window.model.agent.olderCalls.filter((call) => call === id).length;
    window.shown = (id) => window.model.agent.messages(id).length;
    window.visible = () => {
      const top = window.log().getBoundingClientRect().top;
      const card = [...window.chatPart('swc-conversation-thread').children].find(
        (child) =>
          !child.matches('.day') &&
          child.getBoundingClientRect().height > 0 &&
          child.getBoundingClientRect().top >= top
      );
      return { card, at: card.getBoundingClientRect().top - top };
    };
    return true;
  });
  return page;
}

async function center(page) {
  return page.evaluate(() => {
    const box = window.log().getBoundingClientRect();
    const end = Math.min(box.bottom, window.chatPart('slicc-composer').getBoundingClientRect().top);
    return { x: Math.round(box.x + box.width / 2), y: Math.round((box.top + end) / 2) };
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

async function settled(page, id) {
  let calls = -1;
  for (let i = 0; i < 60; i++) {
    await page.until(() => window.row()?.getAttribute('aria-busy') !== 'true');
    await wait(250);
    const now = await page.evaluate((agent) => window.calls(agent), id);
    if (now === calls) return now;
    calls = now;
  }
  return calls;
}

test('a long conversation loads earlier turns as the reader nears the top, without moving the turn in view', async (t) => {
  const page = await open(t, { older: 'paged' });
  await page.evaluate(() => {
    window.model.agent.select('cone-kitchen');
    return true;
  });
  await page.until(() => window.calls('cone-kitchen') > 0);
  const calls = await settled(page, 'cone-kitchen');
  assert.equal(await page.evaluate(() => window.model.agent.hasOlder('cone-kitchen')), true);
  assert.ok(
    await page.evaluate(() => window.log().scrollTop >= window.log().clientHeight),
    'it loads only until the log is more than a screen above the view'
  );
  assert.ok((await page.evaluate(() => window.gap())) <= 1, 'the log still follows the bottom');
  assert.equal(await page.evaluate(() => window.row()?.dataset.older), 'loading');
  await page.evaluate(() => {
    window.model.agent.olderTicks = 200;
    return true;
  });
  const shown = await page.evaluate(() => window.shown('cone-kitchen'));
  for (let i = 0; i < 40 && (await page.evaluate(() => window.log().scrollTop)) > 0; i++)
    await wheel(page, -4000);
  const before = await page.evaluate(() => {
    window.mark = window.visible();
    return { at: window.mark.at, busy: window.row().getAttribute('aria-busy') };
  });
  assert.equal(before.busy, 'true');
  await page.until((count) => window.shown('cone-kitchen') > count, shown);
  await page.until(() => window.row()?.getAttribute('aria-busy') !== 'true');
  await wait(300);
  const kept = await page.evaluate(() => {
    const top = window.log().getBoundingClientRect().top;
    return {
      connected: window.mark.card.isConnected,
      at: window.mark.card.getBoundingClientRect().top - top,
      scrolled: window.log().scrollTop > 0,
    };
  });
  assert.equal(kept.connected, true);
  assert.ok(Math.abs(kept.at - before.at) <= 1, `the turn moved from ${before.at} to ${kept.at}`);
  assert.equal(kept.scrolled, true);
  assert.equal(
    await page.evaluate(() => window.chatPart('[data-action=jump-latest]')?.textContent.trim()),
    'Jump to latest',
    'earlier messages never count as new'
  );
  assert.ok((await page.evaluate(() => window.calls('cone-kitchen'))) > calls);
  await page.evaluate(() => {
    window.model.agent.olderTicks = 1;
    return true;
  });
  for (
    let i = 0;
    i < 40 && (await page.evaluate(() => window.model.agent.hasOlder('cone-kitchen')));
    i++
  )
    await wheel(page, -4000);
  await page.until(() => !window.model.agent.hasOlder('cone-kitchen') && !window.row());
  assert.equal(await page.evaluate(() => window.shown('cone-kitchen')), 43);
  const done = await settled(page, 'cone-kitchen');
  await wait(500);
  assert.equal(await page.evaluate(() => window.calls('cone-kitchen')), done);
  assert.deepEqual(page.errors, []);
});

test('a conversation shorter than the view keeps loading until the start, then stops asking', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.paginate(0, 1, ['cone-tides']);
    window.model.agent.select('cone-tides');
    return true;
  });
  await page.until(() => !window.model.agent.hasOlder('cone-tides') && !window.row());
  assert.equal(await page.evaluate(() => window.shown('cone-tides')), 2);
  assert.ok(
    await page.evaluate(() => window.chatPart('.column').offsetHeight < window.log().clientHeight)
  );
  assert.equal(await settled(page, 'cone-tides'), 2);
  await wait(500);
  assert.equal(await page.evaluate(() => window.calls('cone-tides')), 2);
  assert.equal(
    await page.evaluate(() => window.chatPart('swc-conversation-thread').children.length > 0),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('an agent port without hasOlder is never asked for earlier messages', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.paginate(1, 1, ['cone-sliccy']);
    window.model.agent.hasOlder = undefined;
    window.model.agent.select('cone-sliccy');
    return true;
  });
  await page.until(() => window.chatPart('swc-conversation-thread')?.children.length > 0);
  await wait(500);
  assert.equal(await page.evaluate(() => window.model.agent.olderCalls.length), 0);
  assert.equal(await page.evaluate(() => !!window.row()), false);
  assert.equal(await page.evaluate(() => window.shown('cone-sliccy')), 1);
  assert.deepEqual(page.errors, []);
});

test('a failed load shows a retry row instead of asking again, and Retry loads the rest', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.paginate(1, 1, ['cone-sliccy']);
    window.model.agent.failOlder(1);
    window.model.agent.select('cone-sliccy');
    return true;
  });
  await page.until(() => window.row()?.dataset.older === 'failed');
  await wait(500);
  assert.equal(await page.evaluate(() => window.calls('cone-sliccy')), 1);
  assert.deepEqual(
    await page.evaluate(() => ({
      role: window.row().getAttribute('role'),
      text: window.row().querySelector('span').textContent,
      retry: window.row().querySelector('[data-action=retry-older]').textContent.trim(),
      shown: window.shown('cone-sliccy'),
    })),
    { role: 'alert', text: 'Couldn’t load earlier messages.', retry: 'Retry', shown: 1 }
  );
  await page.evaluate(() => {
    const retry = window.chatPart('[data-action=retry-older]');
    retry.focus();
    retry.click();
    return true;
  });
  await page.until(() => !window.chatPart('[data-action=retry-older]'));
  assert.equal(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot.activeElement === window.log()
    ),
    true,
    'focus stays in the chat when the retry row goes'
  );
  await page.until(() => !window.model.agent.hasOlder('cone-sliccy') && !window.row());
  assert.equal(await page.evaluate(() => window.shown('cone-sliccy')), 3);
  assert.equal(await settled(page, 'cone-sliccy'), 3);
  assert.deepEqual(page.errors, []);
});

test('a load still running for one agent never moves the log of the agent shown since', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const agent = window.model.agent;
    agent.paginate(0, 2, ['cone-sliccy']);
    agent.olderTicks = 1;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    window.releaseOlder = () => release();
    const load = agent.older.bind(agent);
    agent.older = async (id, before) => {
      await held;
      return load(id, before);
    };
    agent.select('cone-sliccy');
    return true;
  });
  await page.until(() => window.row()?.getAttribute('aria-busy') === 'true');
  await page.evaluate(() => {
    window.model.agent.select('cone-kitchen');
    return true;
  });
  await page.until(() => !!window.chatPart('.decision-turn[data-id=k-l17]'));
  await page.until(() => window.gap() <= 1);
  const top = await wheel(page, -1500);
  assert.equal(await page.evaluate(() => window.shown('cone-sliccy')), 0);
  await page.evaluate(() => window.releaseOlder());
  await page.until(() => window.shown('cone-sliccy') === 2);
  await page.evaluate(async () => {
    const chat = window.$('slicc-app', 'slicc-dock', 'slicc-chat');
    await chat.updateComplete;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  });
  assert.deepEqual(
    await page.evaluate(() => ({
      top: window.log().scrollTop,
      row: !!window.row(),
      kitchen: window.calls('cone-kitchen'),
      sliccy: window.calls('cone-sliccy'),
    })),
    { top, row: false, kitchen: 0, sliccy: 1 }
  );
  await page.evaluate(() => {
    window.model.agent.select('cone-sliccy');
    return true;
  });
  await page.until(() => !window.model.agent.hasOlder('cone-sliccy') && !window.row());
  assert.equal(await page.evaluate(() => window.shown('cone-sliccy')), 3);
  assert.deepEqual(page.errors, []);
});

test('after loading history and going back to the bottom, the log follows new messages again', async (t) => {
  const page = await open(t, { older: 'paged' });
  await page.evaluate(() => {
    window.model.agent.select('cone-kitchen');
    return true;
  });
  await page.until(() => window.calls('cone-kitchen') > 0);
  await settled(page, 'cone-kitchen');
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The flour bin is low.')
  );
  await page.until(() =>
    window.chatPart('swc-conversation-thread').lastElementChild.textContent.includes('flour')
  );
  await wait(300);
  assert.ok((await page.evaluate(() => window.gap())) <= 1);
  const shown = await page.evaluate(() => window.shown('cone-kitchen'));
  for (let i = 0; i < 40 && (await page.evaluate(() => window.log().scrollTop)) > 0; i++)
    await wheel(page, -4000);
  await page.until((count) => window.shown('cone-kitchen') > count, shown);
  await settled(page, 'cone-kitchen');
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'cron', 'Oven timer', 'The bread is done.')
  );
  await page.until(() => !!window.chatPart('[data-action=jump-latest]'));
  await page.until(() =>
    /\(1 new\)/.test(window.chatPart('[data-action=jump-latest]').textContent)
  );
  assert.equal(
    await page.evaluate(() => window.chatPart('[data-action=jump-latest]').textContent.trim()),
    'Jump to latest (1 new)'
  );
  for (let i = 0; i < 40 && (await page.evaluate(() => window.gap())) > 1; i++)
    await wheel(page, 4000);
  await page.until(() => !window.chatPart('[data-action=jump-latest]'));
  await page.evaluate(() =>
    window.model.agent.lick('cone-kitchen', 'webhook', 'Pantry sensor', 'The sugar bin is low.')
  );
  await page.until(() =>
    window.chatPart('swc-conversation-thread').lastElementChild.textContent.includes('sugar')
  );
  await wait(300);
  assert.ok((await page.evaluate(() => window.gap())) <= 1);
  assert.equal(await page.evaluate(() => !!window.chatPart('[data-action=jump-latest]')), false);
  assert.deepEqual(page.errors, []);
});
