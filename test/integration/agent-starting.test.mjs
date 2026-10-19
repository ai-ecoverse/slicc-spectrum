import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const line = 'Seven is installing its agent.';

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent: 'waiting', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.chat = () =>
      window.app.dock.content('chat:cone-sliccy')?.shadowRoot ??
      window.app.dock.content('chat')?.shadowRoot ??
      null;
    window.composer = () => window.chat()?.querySelector('slicc-composer')?.shadowRoot ?? null;
    window.field = () =>
      window.composer()?.querySelector('swc-prompt-field')?.shadowRoot?.querySelector('textarea');
    window.rows = () =>
      [...(window.composer()?.querySelectorAll('li.queued[data-mode=starting]') ?? [])].map(
        (row) => [
          row.querySelector('.text').textContent.trim(),
          row.querySelector('.next').textContent,
        ]
      );
    window.users = () =>
      window.model.agent
        .messages(window.model.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
    window.app.show('chat');
    return true;
  });
  await page.until(() => !!window.field());
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  return page;
}

async function say(page, text) {
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').focus();
    return true;
  });
  await page.until(
    () =>
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
      window.field()
  );
  await page.type(text);
  await page.until((text) => window.field().value === text, text);
  await page.press('Enter');
  await page.until((text) => window.rows().some(([shown]) => shown.endsWith(text)), text);
}

test('while the agent starts, the chat has no empty state and the composer says why', async (t) => {
  const page = await open(t);
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.agent.list().length,
      window.model.agent.starting(),
      !!window.chat().querySelector('[data-empty]'),
      window.composer().querySelector('swc-prompt-field').getAttribute('placeholder'),
      !!window.chat().querySelector('header sp-picker'),
    ]),
    [0, line, false, line, false]
  );
  assert.deepEqual(page.errors, []);
});

test('Enter while the agent starts queues a row that reads Sent when the agent starts, and it can be dropped', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
    ['Queued: Then list the moorings', 'Sent when the agent starts'],
  ]);
  await page.evaluate(() => {
    window
      .composer()
      .querySelector('li.queued[data-mode=starting]:first-child [data-action=unqueue]')
      .click();
    return true;
  });
  await page.until(() => window.rows().length === 1);
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Then list the moorings', 'Sent when the agent starts'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('once the agent starts, the queued messages go to it in order and the rows go', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  await page.until(() => window.rows().length === 0);
  await page.until(() => window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.equal(await page.evaluate(() => window.model.agent.starting()), null);
  assert.deepEqual(
    await page.evaluate(() =>
      window.app.dock.api.panels.map((panel) => panel.id).filter((id) => id.startsWith('chat'))
    ),
    ['chat:cone-sliccy']
  );
  assert.deepEqual(page.errors, []);
});

test('the dummy agent starts on its own after a while', async (t) => {
  const page = await open(t, { agent: 'starting' });
  await page.until(() => window.model.agent.list().length > 0 && !window.model.agent.starting());
  assert.ok(await page.evaluate(() => !!window.model.agent.active()));
  assert.deepEqual(page.errors, []);
});

test('a dock rebuild while the agent starts keeps the queued rows', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => window.app.screen === 'phone');
  await page.evaluate(() => {
    window.app.show('chat');
    return true;
  });
  await page.until(() => window.rows().length === 1);
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('if the line clears with no agent, the queued rows stay', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(() => !window.model.agent.starting());
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
  ]);
  assert.equal(await page.evaluate(() => window.model.agent.list().length), 0);
  assert.deepEqual(page.errors, []);
});

async function swap(page) {
  await page.evaluate(async () => {
    const { createDummyModel } = await import('/dist/slicc-dummy.js');
    window.old = window.model;
    window.model = createDummyModel({ delay: 5, color: 'light' });
    window.app.model = window.model;
    return true;
  });
}

test('when the embedder swaps in a new model with agents, the rows go to it in order', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await swap(page);
  await page.until(() => window.rows().length === 0 && window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.deepEqual(page.errors, []);
});

test('the old model clearing its line after a swap sends nothing twice', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await swap(page);
  await page.until(() => window.rows().length === 0 && window.users().length === 2);
  await page.evaluate(() => {
    window.old.agent.arrive();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => [
      window.users(),
      window.model.agent.queue(window.model.agent.active()).length,
      window.old.agent
        .messages(window.old.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text),
    ]),
    [['What is on my plate today?', 'Check the harbor tides'], 0, ['What is on my plate today?']]
  );
  assert.deepEqual(page.errors, []);
});

test('text typed but not sent while the agent starts is still in the field once it arrives', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').focus();
    return true;
  });
  await page.until(
    () =>
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
      window.field()
  );
  await page.type('half typed');
  await page.until(() => window.field().value === 'half typed');
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => !!window.app.dock.content('chat:cone-sliccy'));
  await page.until(() => window.field()?.value === 'half typed');
  assert.deepEqual(page.errors, []);
});

test('text typed but not sent while the agent starts survives a model swap', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').value = 'half typed';
    return true;
  });
  await page.until(() => window.field().value === 'half typed');
  await swap(page);
  await page.until(() => !!window.app.dock.content('chat:cone-sliccy'));
  await page.until(() => window.field()?.value === 'half typed');
  assert.deepEqual(page.errors, []);
});
