import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

for (const guest of [false, true]) {
  test(`prompt controls keep their accessible names in beta6 for ${guest ? 'guests' : 'owners'}`, async (t) => {
    const page = await chrome.page(t);
    await page.goto(guest ? '/guest/?delay=5&seat=off' : '/ui/?delay=5&color=light');
    await page.until(() => window.ready === true);
    await page.until(
      (guest) =>
        !!window.$(
          ...(guest ? ['slicc-chat'] : ['slicc-app', 'slicc-dock', 'slicc-chat']),
          'slicc-composer',
          'swc-prompt-field'
        ),
      guest
    );
    await page.evaluate((guest) => {
      window.composer = window.$(
        ...(guest ? ['slicc-chat'] : ['slicc-app', 'slicc-dock', 'slicc-chat']),
        'slicc-composer'
      );
      window.field = window.composer.shadowRoot.querySelector('swc-prompt-field');
      window.names = () => {
        const root = window.field.shadowRoot;
        return {
          area: root.querySelector('textarea').getAttribute('aria-label'),
          send: root
            .querySelector('.swc-PromptField-send, .swc-PromptField-stop')
            .getAttribute('accessible-label'),
          upload: root.querySelector('.swc-PromptField-upload').getAttribute('accessible-label'),
        };
      };
      return true;
    }, guest);
    await page.until(() => window.names().area === 'Message');
    assert.deepEqual(await page.evaluate(() => window.names()), {
      area: 'Message',
      send: 'Send',
      upload: guest ? 'Add attachment' : 'Add',
    });
    if (guest) return;
    await page.evaluate(() => {
      window.model.agent.busy = () => true;
      window.composer.requestUpdate();
      return true;
    });
    await page.until(() => window.names().send === 'Stop');
    await page.evaluate(() => {
      window.composer.value = 'Check the invented garden plan';
      window.composer.requestUpdate();
      return true;
    });
    await page.until(() => window.names().send === 'Steer');
    assert.equal(await page.evaluate(() => window.names().area), 'Message');
    assert.deepEqual(page.errors, []);
  });
}
