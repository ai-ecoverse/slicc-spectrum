import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const MiB = 1024 * 1024;

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '0', color: 'light' })}`);
  await page.until(() => window.ready === true);
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer'));
  await page.evaluate(() => {
    const composer = () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer');
    window.composer = composer;
    window.field = () => composer().shadowRoot.querySelector('swc-prompt-field');
    window.sendButton = () => window.field().shadowRoot.querySelector('.swc-PromptField-send');
    window.chips = () =>
      [...composer().shadowRoot.querySelectorAll('swc-upload-attachment')].map((chip) => ({
        name: chip.querySelector('[slot=title]').textContent,
        error: chip.hasAttribute('data-error'),
        detail: chip.querySelector('[slot=subtitle]').textContent,
      }));
    window.attach = (name, bytes, type = 'application/pdf') => {
      const file = new File(['%PDF'], name, { type });
      Object.defineProperty(file, 'size', { value: bytes });
      return composer().addFiles([file]);
    };
    window.sent = (text) =>
      window.model.agent
        .messages('cone-sliccy')
        .some((message) => message.role === 'user' && message.text === text);
    return true;
  });
  return page;
}

async function focus(page) {
  await page.evaluate(() => {
    window.composer().focus();
    return true;
  });
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
}

async function draft(page, text) {
  await focus(page);
  await page.insert(text);
}

test('a file over 100 MB keeps the draft and disables Send until it is removed', async (t) => {
  const page = await open(t);
  await page.evaluate((bytes) => window.attach('Kaufvertrag.pdf', bytes), 90 * MiB);
  await page.evaluate((bytes) => window.attach('archive.zip', bytes), 101 * MiB);
  await page.until(() => window.chips().length === 2 && window.sendButton()?.disabled === true);
  assert.deepEqual(await page.evaluate(() => window.chips()), [
    { name: 'Kaufvertrag.pdf', error: false, detail: '90.0 MB' },
    {
      name: 'archive.zip',
      error: true,
      detail: 'Too large: attachments are limited to 100.0 MB',
    },
  ]);
  await draft(page, 'Opa contract');
  await page.press('Enter');
  await page.evaluate(() => {
    window.sendButton().click();
    window.field().dispatchEvent(new CustomEvent('swc-prompt-field-submit'));
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => ({
      sent: window.sent('Opa contract'),
      value: window.composer().value,
      attachments: window.composer().attachments.length,
      disabled: window.sendButton().disabled,
    })),
    { sent: false, value: 'Opa contract', attachments: 2, disabled: true }
  );
  await page.evaluate(() => {
    const chip = window.composer().shadowRoot.querySelector('swc-upload-attachment[data-error]');
    chip.dispatchEvent(new CustomEvent('swc-upload-attachment-dismiss', { bubbles: true }));
    return true;
  });
  await page.until(() => window.sendButton()?.disabled === false);
  await focus(page);
  await page.press('Enter');
  await page.until(() => window.sent('Opa contract'));
  assert.deepEqual(page.errors, []);
});

test('the agent’s own limits mark a file too large and a message too big, and keep the draft', async (t) => {
  const page = await open(t);
  await page.evaluate((mib) => {
    window.model.agent.attachmentLimits = () => ({ file: 8 * mib, total: 10 * mib });
    return true;
  }, MiB);
  await page.evaluate((bytes) => window.attach('Kaufvertrag Opawohnung.pdf', bytes), 9 * MiB);
  await page.until(() => window.chips().length === 1 && window.sendButton()?.disabled === true);
  assert.deepEqual(await page.evaluate(() => window.chips()), [
    {
      name: 'Kaufvertrag Opawohnung.pdf',
      error: true,
      detail: 'Too large: attachments are limited to 8.0 MB',
    },
  ]);
  await draft(page, 'The contract');
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => ({
      sent: window.sent('The contract'),
      value: window.composer().value,
      attachments: window.composer().attachments.length,
    })),
    { sent: false, value: 'The contract', attachments: 1 }
  );

  await page.evaluate(() => {
    window.composer().attachments = [];
    return true;
  });
  await page.until(() => window.sendButton()?.disabled === false);
  await page.evaluate((bytes) => window.attach('one.pdf', bytes), 6 * MiB);
  await page.evaluate((bytes) => window.attach('two.pdf', bytes), 6 * MiB);
  await page.until(() => window.sendButton()?.disabled === true);
  assert.deepEqual(
    await page.evaluate(() => ({
      chips: window.chips().map((chip) => chip.error),
      alert: window
        .composer()
        .shadowRoot.querySelector('[data-send-error=together]')
        ?.textContent.trim(),
    })),
    {
      chips: [false, false],
      alert: 'These attachments add up to more than 10.0 MB; send them in separate messages.',
    }
  );
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await page.evaluate(() => window.sent('The contract')), false);
  await page.evaluate(() => {
    window.composer().detach(window.composer().attachments[1].id);
    return true;
  });
  await page.until(
    () =>
      window.sendButton()?.disabled === false &&
      !window.composer().shadowRoot.querySelector('[data-send-error=together]')
  );
  await focus(page);
  await page.press('Enter');
  await page.until(() => window.sent('The contract'));
  assert.deepEqual(page.errors, []);
});
