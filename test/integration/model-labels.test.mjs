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

test('a step label with U+202E shows notation in the header and a chip in the row, not reordered text', async (t) => {
  const page = await open(t);
  const shown = 'Paying U+202Eredro ehtU+202C now';
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
  await page.until((text) => {
    const status = window.chatPart('swc-conversation-turn[data-id=bidi-run] swc-response-status');
    return [...(status?.shadowRoot?.querySelectorAll('.swc-ResponseStatus-label') ?? [])].some(
      (node) => node.textContent === text
    );
  }, shown);
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
    const status = window.chatPart('swc-conversation-turn[data-id=bidi-run] swc-response-status');
    const visible = [
      ...(status.shadowRoot?.querySelectorAll('.swc-ResponseStatus-label') ?? []),
    ].map((node) => node.textContent);
    const header = window.chatPart('swc-conversation-turn[data-id=bidi-run] slicc-status-label');
    const row = window.chatPart('#label-bidi-1 slicc-step-label');
    return {
      visible,
      header: header.textContent,
      headerChips: header.querySelectorAll('.control').length,
      row: row.textContent,
      rowChips: chips(row),
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
  assert.ok(read.visible.includes(shown), JSON.stringify(read.visible));
  assert.equal(read.header, shown);
  assert.equal(read.headerChips, 0);
  assert.equal(read.row, shown);
  assert.deepEqual(read.rowChips, chips);
  assert.deepEqual(read.titles, [shown, shown]);
  for (const value of [shown, ...read.visible, read.header, read.row, ...read.titles])
    assert.ok(!raw.test(value), JSON.stringify(value));
  assert.deepEqual(page.errors, []);
});

test('a step label with emoji keeps ⚠️ and a ZWJ sequence, with no chip', async (t) => {
  const page = await open(t);
  const label = '⚠️ Checking \u{1F469}\u200D\u{1F4BB} setup';
  await page.evaluate((text) => {
    const agent = window.model.agent;
    const now = Date.now();
    const call = {
      id: 'emoji-1',
      name: 'bash',
      title: 'echo setup',
      input: 'echo setup',
      output: '',
      status: 'done',
      paths: [],
    };
    const added = [
      { id: 'emoji-user', role: 'user', text: 'Check setup', createdAt: now },
      {
        id: 'emoji-run',
        role: 'assistant',
        status: 'done',
        createdAt: now,
        model: 'claude-opus-5-5',
        parts: [{ type: 'tool', tool: call }],
      },
    ];
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => (id === 'cone-sliccy' ? [...messages(id), ...added] : messages(id));
    agent.stepLabel = async (_agentId, callId) => (callId === 'emoji-1' ? text : null);
    agent.select('cone-sliccy');
    agent.emit('messages', 'cone-sliccy');
    return true;
  }, label);
  await page.until(
    (text) =>
      window.chatPart('swc-conversation-turn[data-id=emoji-run] slicc-status-label')
        ?.textContent === text,
    label
  );
  await page.evaluate(() =>
    window
      .chatPart('swc-conversation-turn[data-id=emoji-run] swc-response-status')
      .shadowRoot.querySelector('.swc-ResponseStatus-headerTrail--button')
      .click()
  );
  await page.until((text) => window.chatPart('#label-emoji-1')?.textContent === text, label);
  assert.deepEqual(
    await page.evaluate((text) => {
      const header = window.chatPart('swc-conversation-turn[data-id=emoji-run] slicc-status-label');
      const row = window.chatPart('#label-emoji-1 slicc-step-label');
      return {
        text: [header.textContent, row.textContent],
        titles: [
          header.querySelector('span[title]')?.getAttribute('title'),
          row.querySelector('span[title]')?.getAttribute('title'),
        ],
        chips: [
          header.querySelectorAll('.control').length,
          row.querySelectorAll('.control').length,
        ],
        hasNotation:
          header.textContent.includes('U+') ||
          row.textContent.includes('U+') ||
          header.innerHTML.includes('U+FE0F') ||
          header.innerHTML.includes('U+200D'),
        expected: text,
      };
    }, label),
    {
      text: [label, label],
      titles: [label, label],
      chips: [0, 0],
      hasNotation: false,
      expected: label,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('title fallback when stepLabel is null: growing secret prefix and bidi/ZWSP titles', async (t) => {
  const page = await open(t);
  const growing = 'Logging …';
  const bidi = 'Paying U+202Eredro ehtU+202C now';
  const cut = 'Entering token: …';
  const raw = /[\u202A-\u202E\u2066-\u2069\u200B]/;
  const read = () =>
    page.evaluate(() => {
      const header = window.chatPart(
        'swc-conversation-turn[data-id=fallback-run] slicc-status-label'
      );
      const row = window.chatPart('#label-fallback-1 slicc-step-label');
      const status = window.chatPart(
        'swc-conversation-turn[data-id=fallback-run] swc-response-status'
      );
      return {
        visible: [...(status?.shadowRoot?.querySelectorAll('.swc-ResponseStatus-label') ?? [])].map(
          (node) => node.textContent
        ),
        header: header?.textContent ?? '',
        row: row?.textContent ?? '',
        titles: [
          header?.querySelector('span[title]')?.getAttribute('title') ?? '',
          row?.querySelector('span[title]')?.getAttribute('title') ?? '',
        ],
        rowChips: [...(row?.querySelectorAll('.control') ?? [])].map((chip) =>
          chip.getAttribute('aria-label')
        ),
        leaked: window.chatPart('.log')?.textContent.includes('hunter2') ?? false,
      };
    });
  await page.evaluate(() => {
    const agent = window.model.agent;
    const now = Date.now();
    window.fallbackCall = {
      id: 'fallback-1',
      name: 'bash',
      title: 'Logging sk',
      input: 'echo sk',
      output: '',
      status: 'running',
      paths: [],
    };
    window.fallbackReply = {
      id: 'fallback-run',
      role: 'assistant',
      status: 'streaming',
      createdAt: now,
      model: 'claude-opus-5-5',
      parts: [{ type: 'tool', tool: window.fallbackCall }],
    };
    const added = [
      { id: 'fallback-user', role: 'user', text: 'Log in', createdAt: now },
      window.fallbackReply,
    ];
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => (id === 'cone-sliccy' ? [...messages(id), ...added] : messages(id));
    agent.stepLabel = async () => null;
    agent.select('cone-sliccy');
    agent.emit('messages', 'cone-sliccy');
    return true;
  });
  await page.until((text) => {
    const header = window.chatPart(
      'swc-conversation-turn[data-id=fallback-run] slicc-status-label'
    )?.textContent;
    const row = window.chatPart('#label-fallback-1')?.textContent;
    return header === text && row === text;
  }, growing);
  const growingRead = await read();
  assert.ok(growingRead.visible.includes(growing), JSON.stringify(growingRead.visible));
  assert.equal(growingRead.header, growing);
  assert.equal(growingRead.row, growing);
  assert.deepEqual(growingRead.titles, [growing, growing]);
  assert.deepEqual(growingRead.rowChips, []);
  assert.equal(growingRead.leaked, false);
  await page.evaluate(() => {
    window.fallbackCall.title = 'Paying \u202Eredro eht\u202C now';
    window.model.agent.emit('message', {
      agentId: 'cone-sliccy',
      message: window.fallbackReply,
    });
    return true;
  });
  await page.until((text) => window.chatPart('#label-fallback-1')?.textContent === text, bidi);
  await page.until((text) => {
    const header = window.chatPart(
      'swc-conversation-turn[data-id=fallback-run] slicc-status-label'
    )?.textContent;
    return header === text;
  }, bidi);
  const bidiRead = await read();
  assert.ok(bidiRead.visible.includes(bidi), JSON.stringify(bidiRead.visible));
  assert.equal(bidiRead.header, bidi);
  assert.equal(bidiRead.row, bidi);
  assert.deepEqual(bidiRead.titles, [bidi, bidi]);
  assert.deepEqual(bidiRead.rowChips, ['U+202E', 'U+202C']);
  for (const value of [bidiRead.header, bidiRead.row, ...bidiRead.titles, ...bidiRead.visible])
    assert.ok(!raw.test(value), JSON.stringify(value));
  await page.evaluate(() => {
    window.fallbackCall.title = 'Entering tok\u200Ben: hunter2 in the field';
    window.fallbackCall.status = 'done';
    window.fallbackReply.status = 'done';
    window.model.agent.emit('message', {
      agentId: 'cone-sliccy',
      message: window.fallbackReply,
    });
    return true;
  });
  await page.until((text) => {
    const header = window.chatPart(
      'swc-conversation-turn[data-id=fallback-run] slicc-status-label'
    )?.textContent;
    const row = window.chatPart('#label-fallback-1')?.textContent;
    return header === text && row === text;
  }, cut);
  const done = await read();
  assert.ok(done.visible.includes(cut), JSON.stringify(done.visible));
  assert.equal(done.header, cut);
  assert.equal(done.row, cut);
  assert.deepEqual(done.titles, [cut, cut]);
  assert.deepEqual(done.rowChips, []);
  assert.equal(done.leaked, false);
  for (const value of [done.header, done.row, ...done.titles, ...done.visible])
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
