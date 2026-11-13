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

async function open(t) {
  const page = await chrome.page(t);
  const url = `/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`;
  await page.goto(url);
  if (!(await settled(page))) await page.goto(url);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  return page;
}

test('a step label with U+202E shows a chip in the header and the row, not reordered text', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const agent = window.model.agent;
    const now = Date.now();
    const call = {
      id: 'bidi-1',
      name: 'bash',
      title: 'echo pay',
      input: 'echo pay',
      output: '',
      status: 'done',
      paths: [],
    };
    const added = [
      { id: 'bidi-user', role: 'user', text: 'Pay', createdAt: now },
      {
        id: 'bidi-run',
        role: 'assistant',
        status: 'done',
        createdAt: now,
        model: 'claude-opus-5-5',
        parts: [{ type: 'tool', tool: call }],
      },
    ];
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => (id === 'cone-sliccy' ? [...messages(id), ...added] : messages(id));
    agent.stepLabel = async (_agentId, callId) =>
      callId === 'bidi-1' ? 'Paying \u202Eredro eht\u202C now' : null;
    agent.select('cone-sliccy');
    agent.emit('messages', 'cone-sliccy');
    return true;
  });
  await page.until(
    () => !!window.chatPart('swc-conversation-turn[data-id=bidi-run] slicc-status-label .control')
  );
  await page.evaluate(() =>
    window
      .chatPart('swc-conversation-turn[data-id=bidi-run] swc-response-status')
      .shadowRoot.querySelector('.swc-ResponseStatus-headerTrail--button')
      .click()
  );
  await page.until(() => !!window.chatPart('#label-bidi-1 slicc-step-label .control'));
  const raw = /[\u202A-\u202E\u2066-\u2069]/;
  const read = await page.evaluate(() => {
    const chips = (node) =>
      [...node.querySelectorAll('.control')].map((chip) => [
        chip.getAttribute('role'),
        chip.getAttribute('aria-label'),
        chip.textContent,
      ]);
    const header = window.chatPart('swc-conversation-turn[data-id=bidi-run] slicc-status-label');
    const row = window.chatPart('#label-bidi-1 slicc-step-label');
    return {
      text: [header.textContent, row.textContent],
      chips: [chips(header), chips(row)],
      titles: [
        header.querySelector('span[title]')?.getAttribute('title'),
        row.querySelector('span[title]')?.getAttribute('title'),
      ],
    };
  });
  const chips = [
    ['img', 'U+202E', 'U+202E'],
    ['img', 'U+202C', 'U+202C'],
  ];
  const shown = 'Paying U+202Eredro ehtU+202C now';
  assert.deepEqual(read.chips, [chips, chips]);
  assert.deepEqual(read.text, [shown, shown]);
  assert.deepEqual(read.titles, [shown, shown]);
  for (const value of [...read.text, ...read.titles])
    assert.ok(!raw.test(value), JSON.stringify(value));
  assert.deepEqual(page.errors, []);
});

test('a step label with a ZWSP-split token: secret is cut in the header and the row', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const agent = window.model.agent;
    const now = Date.now();
    const call = {
      id: 'zwsp-1',
      name: 'bash',
      title: 'echo secret',
      input: 'echo secret',
      output: '',
      status: 'done',
      paths: [],
    };
    const added = [
      { id: 'zwsp-user', role: 'user', text: 'Check the token', createdAt: now },
      {
        id: 'zwsp-run',
        role: 'assistant',
        status: 'done',
        createdAt: now,
        model: 'claude-opus-5-5',
        parts: [{ type: 'tool', tool: call }],
      },
    ];
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => (id === 'cone-sliccy' ? [...messages(id), ...added] : messages(id));
    agent.stepLabel = async (_agentId, callId) =>
      callId === 'zwsp-1' ? 'Entering tok\u200Ben: hunter2 in the field' : null;
    agent.select('cone-sliccy');
    agent.emit('messages', 'cone-sliccy');
    return true;
  });
  await page.until(
    () =>
      window.chatPart('swc-conversation-turn[data-id=zwsp-run] slicc-status-label')?.textContent ===
      'Entering token: …'
  );
  await page.evaluate(() =>
    window
      .chatPart('swc-conversation-turn[data-id=zwsp-run] swc-response-status')
      .shadowRoot.querySelector('.swc-ResponseStatus-headerTrail--button')
      .click()
  );
  await page.until(() => window.chatPart('#label-zwsp-1')?.textContent === 'Entering token: …');
  assert.deepEqual(
    await page.evaluate(() => [
      window.chatPart('swc-conversation-turn[data-id=zwsp-run] slicc-status-label').textContent,
      window.chatPart('#label-zwsp-1').textContent,
      window.chatPart('swc-conversation-turn[data-id=zwsp-run] slicc-status-label .control')
        ?.length ?? 0,
      window.chatPart('.log').textContent.includes('hunter2'),
    ]),
    ['Entering token: …', 'Entering token: …', 0, false]
  );
  assert.deepEqual(page.errors, []);
});
