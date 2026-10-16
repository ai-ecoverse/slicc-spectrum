import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const label = 'Seat 2 (Mara)';
const review = "Messages from guests need a review, and this agent can't review them yet.";
const allowed = new Set([
  'on',
  'list',
  'active',
  'messages',
  'send',
  'busy',
  'readOnly',
  'hold',
  'queue',
  'suggestion',
]);

async function open(t, query) {
  const page = await chrome.page(t);
  await page.goto(`/guest/?${new URLSearchParams({ delay: '5', ...query })}`);
  await page.until(() => window.ready === true);
  await page.until(() => !!window.$('slicc-chat', 'slicc-composer', 'swc-prompt-field'));
  await page.evaluate(() => {
    window.part = (selector) => window.chat.shadowRoot.querySelector(selector);
    window.box = (selector) =>
      window.$('slicc-chat', 'slicc-composer').shadowRoot.querySelector(selector);
    window.area = () => window.box('swc-prompt-field').shadowRoot.querySelector('textarea');
    return true;
  });
  return page;
}

async function write(page, text) {
  await page.evaluate(() => {
    window.area().focus();
    return true;
  });
  await page.type(text);
}

async function forbidden(page) {
  return page
    .evaluate(() => [...new Set(window.calls)])
    .then((calls) => ({
      calls: calls.filter((name) => !allowed.has(name)),
    }));
}

test('a guest chat shows only the cone, its transcript and a plain composer', async (t) => {
  const page = await open(t, { seat: 'off' });
  const shown = await page.evaluate(() => {
    const header = window.part('header');
    const field = window.box('swc-prompt-field');
    const leading = field.shadowRoot.querySelector('.swc-PromptField-leading-actions');
    const sprinkle = window.part('slicc-sprinkle');
    return {
      cone: header.querySelector('[data-seat-cone]')?.textContent,
      status: !!header.querySelector('swc-status-light'),
      header: [
        'sp-picker',
        'swc-meter',
        '[data-action=new-chat]',
        '[data-action=set-up-model]',
      ].filter((selector) => header.querySelector(selector)),
      composer: [
        'swc-popover',
        'sp-menu',
        'input[type=file]',
        '.queue',
        '[data-action=push-to-talk]',
      ].filter((selector) => window.box(selector)),
      stop: !!field.shadowRoot.querySelector('.swc-PromptField-stop'),
      upload: !!leading && leading.inert,
      send: field.getAttribute('send-label'),
      keys: window.box('#keys').textContent,
      note: window.box('[data-seat-note]').textContent,
      decide: !!window.part('[data-action=allow], [data-action=deny]'),
      piled: !!window.part('.decision-turn[data-pending]'),
      answers: [...window.chat.shadowRoot.querySelectorAll('[data-action=answer]')].map(
        (button) => button.disabled
      ),
      errors: !!window.part('.error-card swc-button'),
      sprinkle: sprinkle?.shadowRoot.querySelector('[data-view-only]')?.textContent,
      inert: !!sprinkle?.shadowRoot.querySelector('iframe')?.inert,
      host: window.part('swc-conversation-turn[data-id="g-1"] .who')?.textContent,
      own: window.part('swc-conversation-turn[data-id="g-3"]').getAttribute('accessible-label'),
      ownName: !!window.part('swc-conversation-turn[data-id="g-3"] .who'),
      other: window.part('swc-conversation-turn[data-id="g-5"] .who')?.textContent,
    };
  });
  assert.deepEqual(shown, {
    cone: 'sliccy',
    status: true,
    header: [],
    composer: [],
    stop: false,
    upload: true,
    send: 'Send',
    keys: 'Enter sends, Shift+Enter adds a new line.',
    note: `You’re chatting with sliccy as ${label}.`,
    decide: false,
    piled: false,
    answers: [true, true],
    errors: false,
    sprinkle: 'View only on this device',
    inert: true,
    host: 'From the host',
    own: 'Your message',
    ownName: false,
    other: 'From Seat 3 (Jonas)',
  });
  await write(page, '/');
  assert.equal(await page.evaluate(() => !!window.box('.popup')), false);
  assert.deepEqual(await forbidden(page), { calls: [] });
  assert.deepEqual(await page.evaluate(() => window.model.refused), []);
});

test('Enter sends a guest message as the reader’s own, and Shift+Enter adds a line', async (t) => {
  const page = await open(t, { seat: 'off' });
  await write(page, 'Thanks for');
  await page.press('Enter', 'shift');
  await page.type('the table');
  assert.equal(await page.evaluate(() => window.area().value), 'Thanks for\nthe table');
  await page.press('Enter');
  await page.until(() =>
    window.port.messages('cone-sliccy').some((message) => message.text === 'Thanks for\nthe table')
  );
  await page.until(() => window.port.messages('cone-sliccy').at(-1).status === 'done');
  const turn = await page.evaluate(() => {
    const sent = window.port
      .messages('cone-sliccy')
      .find((message) => message.text === 'Thanks for\nthe table');
    const node = window.part(`swc-conversation-turn[data-id="${sent.id}"]`);
    return {
      origin: sent.origin,
      from: sent.from,
      label: node.getAttribute('accessible-label'),
      name: !!node.querySelector('.who'),
      remote: node.hasAttribute('data-remote'),
      draft: window.area().value,
    };
  });
  assert.deepEqual(turn, {
    origin: 'guest',
    from: label,
    label: 'Your message',
    name: false,
    remote: false,
    draft: '',
  });
  await page.press('ArrowUp');
  assert.equal(await page.evaluate(() => window.area().value), 'Thanks for\nthe table');
  assert.deepEqual(await forbidden(page), { calls: [] });
  assert.deepEqual(await page.evaluate(() => window.model.refused), []);
});

test('a rejected guest send shows its reason above the composer and keeps the draft', async (t) => {
  const page = await open(t, { seat: 'review' });
  assert.equal(
    await page.evaluate(() => window.box('[data-seat-note]').textContent),
    'The host reviews what you send before it reaches the agent.'
  );
  await write(page, 'Can you add Lisbon?');
  await page.evaluate(() => {
    window.box('swc-prompt-field').shadowRoot.querySelector('.swc-PromptField-send').click();
    return true;
  });
  await page.until(() => !!window.box('[data-send-error]'));
  const state = await page.evaluate(() => {
    const error = window.box('[data-send-error]');
    const field = window.box('swc-prompt-field');
    return {
      text: error.textContent,
      role: error.getAttribute('role'),
      above: error.getBoundingClientRect().bottom <= field.getBoundingClientRect().top,
      draft: window.area().value,
      sent: window.port
        .messages('cone-sliccy')
        .some((message) => message.text === 'Can you add Lisbon?'),
    };
  });
  assert.deepEqual(state, {
    text: review,
    role: 'alert',
    above: true,
    draft: 'Can you add Lisbon?',
    sent: false,
  });
  assert.deepEqual(await forbidden(page), { calls: [] });
});

test('an expiring seat says when its link ends, and an empty chat says hello', async (t) => {
  const page = await open(t, { seat: 'expiring', history: 'none' });
  const shown = await page.evaluate(() => ({
    empty: window.part('[data-empty]').textContent,
    note: window.box('[data-seat-note]').textContent,
  }));
  assert.equal(shown.empty, 'No messages yet. Say hello to sliccy.');
  assert.match(
    shown.note,
    /^The host reviews what you send before it reaches the agent\. Your link expires at \d{1,2}:\d{2}( ?[AP]M)?\.$/
  );
  assert.deepEqual(await forbidden(page), { calls: [] });
});
