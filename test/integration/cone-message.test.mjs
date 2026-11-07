import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function settled(page) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => window.ready === true).catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function open(t, params = {}) {
  const page = await chrome.page(t);
  const url = `/ui/?${new URLSearchParams({ delay: '0', color: 'light', ...params })}`;
  await page.goto(url);
  if (!(await settled(page))) await page.goto(url);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  return page;
}

test('a cone-message lick shows its label and icon, and an unknown channel falls back', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.select('cone-kitchen');
    window.model.agent.lick(
      'cone-kitchen',
      'cone-message',
      'Message from landlording',
      '[slicc message from cone:cone-32 "landlording" (user cone-32)]',
      'Can you take the Friday on-call?'
    );
    return true;
  });
  await page.until(() => !!window.chatPart('.lick[data-channel="cone-message"]'));
  const cone = await page.evaluate(() => {
    const lick = window.chatPart('.lick[data-channel="cone-message"]');
    const turn = lick.closest('.lick-turn');
    return {
      who: turn.querySelector('.meta .who').textContent,
      line: lick.querySelector('.lick-head .text').textContent,
      pill: turn.querySelector('.reaction').textContent,
      named: turn.querySelector('.reaction').title,
      label: turn.getAttribute('accessible-label'),
      body: lick.querySelector('.output')?.textContent ?? null,
      channel: lick.dataset.channel,
    };
  });
  assert.deepEqual(cone, {
    who: 'Message from landlording',
    line: '[slicc message from cone:cone-32 "landlording" (user cone-32)]',
    pill: '💬',
    named: 'Cone message',
    label: 'Cone message event',
    body: 'Can you take the Friday on-call?',
    channel: 'cone-message',
  });

  await page.evaluate(() => {
    const agent = window.model.agent;
    const messages = agent.messages.bind(agent);
    agent.messages = (id) =>
      id !== 'cone-kitchen'
        ? messages(id)
        : [
            ...messages(id),
            {
              id: 'unknown-lick',
              role: 'lick',
              channel: 'future-channel',
              title: 'From the wire',
              text: 'A channel spectrum has not named yet',
              createdAt: Date.now(),
            },
          ];
    agent.emit('messages', 'cone-kitchen');
    return true;
  });
  await page.until(() => !!window.chatPart('.lick[data-channel="future-channel"]'));
  const unknown = await page.evaluate(() => {
    const lick = window.chatPart('.lick[data-channel="future-channel"]');
    const turn = lick.closest('.lick-turn');
    return {
      who: turn.querySelector('.meta .who').textContent,
      line: lick.querySelector('.lick-head .text').textContent,
      pill: turn.querySelector('.reaction').textContent,
      named: turn.querySelector('.reaction').title,
      label: turn.getAttribute('accessible-label'),
      channel: lick.dataset.channel,
    };
  });
  assert.deepEqual(unknown, {
    who: 'From the wire',
    line: 'A channel spectrum has not named yet',
    pill: '📎',
    named: 'Notice',
    label: 'Notice event',
    channel: 'future-channel',
  });
  assert.deepEqual(page.errors, []);
});
