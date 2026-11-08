import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '0', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    const composer = () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer');
    window.composer = composer;
    window.addMenu = () => composer().shadowRoot.querySelector('swc-popover');
    window.addButton = () =>
      composer()
        .shadowRoot.querySelector('swc-prompt-field')
        .shadowRoot.querySelector('.swc-PromptField-upload');
    window.menuValues = () =>
      [...composer().shadowRoot.querySelectorAll('sp-menu-item')].map((item) =>
        item.getAttribute('value')
      );
    window.chips = () =>
      [...composer().shadowRoot.querySelectorAll('swc-upload-attachment')].map((chip) => ({
        kind: chip.getAttribute('data-kind'),
        name: chip.querySelector('[slot=title]')?.textContent,
        error: chip.hasAttribute('data-error'),
        detail: chip.querySelector('[slot=subtitle]')?.textContent,
      }));
    window.liveChips = () =>
      [
        ...(window.$('slicc-app', 'slicc-live')?.shadowRoot?.querySelectorAll('[data-id]') ?? []),
      ].map((chip) => chip.dataset.id);
  });
  return page;
}

async function openMenu(page) {
  await page.evaluate(() => window.addButton().click());
  await page.until(() => window.addMenu().open === true);
}

test('without a capture port, screenshot with no browser tab shows an error chip', async (t) => {
  const page = await open(t, { browser: 'off', capture: 'off' });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  assert.deepEqual(await page.evaluate(() => window.chips()), [
    {
      kind: 'file',
      name: 'screenshot.png',
      error: true,
      detail: 'No screen or browser tab to screenshot',
    },
  ]);
  assert.deepEqual(page.errors, []);
});

test('with capture on, the + menu offers record audio and video', async (t) => {
  const page = await open(t, { capture: 'on', live: 'off' });
  await openMenu(page);
  assert.deepEqual(
    await page.evaluate(() =>
      window.menuValues().filter((value) => value.startsWith('record') || value === 'screenshot')
    ),
    ['screenshot', 'record-audio', 'record-video']
  );
  assert.deepEqual(page.errors, []);
});

test('capture.kinds without video hides Record video', async (t) => {
  const page = await open(t, { capture: 'audio' });
  await openMenu(page);
  assert.deepEqual(
    await page.evaluate(() => window.menuValues().filter((value) => value.startsWith('record'))),
    ['record-audio']
  );
  assert.deepEqual(page.errors, []);
});

test('Take a screenshot uses capture.still and attaches an image', async (t) => {
  const page = await open(t, { capture: 'on', live: 'off', browser: 'off' });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.kind === 'image' && !chip.error));
  assert.equal(await page.evaluate(() => window.composer().attachments[0].kind), 'image');
  assert.equal(await page.evaluate(() => window.composer().attachments[0].name), 'screenshot.png');
  assert.deepEqual(page.errors, []);
});

test('Record audio shows a live chip and attaches after Stop', async (t) => {
  const page = await open(t, { capture: 'on', live: 'off', switches: 'capture' });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=record-audio]').click()
  );
  await page.until(() => window.liveChips().includes('capture-audio'));
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-live')
      .shadowRoot.querySelector('[data-id=capture-audio] [data-action=live-act]')
      .click()
  );
  await page.until(() => window.composer().attachments.length === 1);
  assert.equal(await page.evaluate(() => window.composer().attachments[0].kind), 'file');
  assert.equal(await page.evaluate(() => window.composer().attachments[0].mimeType), 'audio/webm');
  await page.until(() => !window.liveChips().includes('capture-audio'));
  assert.deepEqual(page.errors, []);
});

test('a denied capture with switches on shows the port’s own reason', async (t) => {
  const page = await open(t, { capture: 'deny', switches: 'capture' });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  assert.equal(await page.evaluate(() => window.chips()[0].detail), 'Screen capture was denied');
  assert.deepEqual(page.errors, []);
});

test('screenshot with Screen switched off points to Settings', async (t) => {
  const page = await open(t, { capture: 'on', switches: 'capture' });
  await page.evaluate(() => window.model.switches.set('screen', false));
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  assert.equal(
    await page.evaluate(() => window.chips()[0].detail),
    'Screen capture is switched off. Turn it on in Settings, Capture and devices.'
  );
  assert.deepEqual(page.errors, []);
});

test('record audio with Microphone switched off points to Settings', async (t) => {
  const page = await open(t, { capture: 'on', switches: 'capture' });
  await page.evaluate(() => window.model.switches.set('microphone', false));
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=record-audio]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  assert.equal(
    await page.evaluate(() => window.chips()[0].detail),
    'Microphone is switched off. Turn it on in Settings, Capture and devices.'
  );
  assert.deepEqual(page.errors, []);
});

test('text with an error chip sends the text only', async (t) => {
  const page = await open(t, { capture: 'deny', switches: 'capture' });
  await page.evaluate(() => {
    window.sent = [];
    const send = window.model.agent.send.bind(window.model.agent);
    window.model.agent.send = async (id, input) => {
      window.sent.push({ id, input });
      return send(id, input);
    };
  });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  await page.evaluate(() => {
    window.composer().value = 'Keep the tide notes';
    window.composer().send();
  });
  await page.until(() => window.sent.length === 1);
  assert.deepEqual(
    await page.evaluate(() => {
      const input = window.sent[0].input;
      return {
        text: input.text,
        attachments: (input.attachments ?? []).map((attachment) => [
          attachment.name,
          !!attachment.error,
        ]),
        left: window.composer().attachments.length,
      };
    }),
    { text: 'Keep the tide notes', attachments: [], left: 0 }
  );
  assert.deepEqual(page.errors, []);
});

test('an error chip alone does not send', async (t) => {
  const page = await open(t, { capture: 'deny', switches: 'capture' });
  await page.evaluate(() => {
    window.sent = [];
    const send = window.model.agent.send.bind(window.model.agent);
    window.model.agent.send = async (id, input) => {
      window.sent.push({ id, input });
      return send(id, input);
    };
  });
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=screenshot]').click()
  );
  await page.until(() => window.chips().some((chip) => chip.error));
  await page.evaluate(() => window.composer().send());
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => ({
      sent: window.sent.length,
      chips: window
        .composer()
        .attachments.map((attachment) => [attachment.name, !!attachment.error]),
    })),
    { sent: 0, chips: [['screenshot.png', true]] }
  );
  assert.deepEqual(page.errors, []);
});
