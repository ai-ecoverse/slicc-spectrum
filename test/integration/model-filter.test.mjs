import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const extra = [
  ['nova-lite', 'Nova Lite', 'Amazon Bedrock'],
  ['nova-pro', 'Nova Pro', 'Amazon Bedrock'],
  ['claude-opus-4-8', 'Claude Opus 4.8', 'Amazon Bedrock'],
];

async function open(t, count = extra.length) {
  const page = await chrome.page(t);
  await page.goto('/ui/?delay=5&color=light');
  await page.until(() => window.ready === true);
  await page.until(() => !!window.chatPart('header sp-picker[label=Model]'));
  await page.evaluate(
    ([rows, count]) => {
      const settings = window.model.settings;
      const base = settings.models.bind(settings);
      const added = rows
        .slice(0, count)
        .map(([id, label, provider]) => ({ id, label, provider, images: true }));
      settings.models = () => [...base(), ...added];
      settings.emit('settings', settings.get());
      window.picker = () => window.chatPart('header sp-picker[label=Model]');
      window.within = (picker) => ({
        filter: picker.querySelector('sp-search[data-action=filter-models]'),
        shown: [...picker.querySelectorAll('sp-menu-item')]
          .filter((item) => item.checkVisibility())
          .map((item) => item.getAttribute('value') ?? item.textContent.trim()),
      });
      window.query = () => window.within(window.picker()).filter?.value ?? null;
      window.state = () => ({
        shown: window.within(window.picker()).shown,
        open: window.picker().open,
        focused: window.focused(),
        value: window.picker().value,
      });
      return true;
    },
    [extra, count]
  );
  return page;
}

async function click(page, picker) {
  const { x, y } = await page.evaluate((picker) => {
    const box = window[picker]().getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, picker);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

async function opened(page) {
  await click(page, 'picker');
  await page.until(() => window.picker().open === true);
  await page.until(() => window.focused().endsWith('sp-search > input'));
}

test('five models or fewer list without a filter', async (t) => {
  const page = await open(t, 1);
  assert.deepEqual(
    await page.evaluate(() => [
      window.query(),
      window.picker().querySelectorAll('sp-menu-item').length,
    ]),
    [null, 5]
  );
});

test('typing in the model list filters it and Enter picks the first match', async (t) => {
  const page = await open(t);
  await page.until(() => window.query() === '');
  await opened(page);
  assert.equal((await page.evaluate(() => window.state())).shown.length, 7);
  await page.insert('nova');
  await page.until(() => window.state().shown.length === 2);
  assert.deepEqual((await page.evaluate(() => window.state())).shown, ['nova-lite', 'nova-pro']);
  await page.press('Escape');
  await page.until(() => window.query() === '' && window.state().shown.length === 7);
  await page.insert('bedrock opus');
  await page.until(() => window.state().shown.join() === 'claude-opus-4-8');
  await page.press('Escape');
  await page.until(() => window.query() === '' && window.state().shown.length === 7);
  await page.insert('pro');
  await page.until(() => window.state().shown.join() === 'nova-pro');
  await page.press('Enter');
  await page.until(() => window.state().value === 'nova-pro' && !window.state().open);
  assert.equal(
    await page.evaluate(
      () => window.model.agent.list().find((agent) => agent.id === 'cone-sliccy').model
    ),
    'nova-pro'
  );
  await page.until(() => window.query() === '');
  await opened(page);
  assert.equal((await page.evaluate(() => window.state())).shown.length, 7);
});

test('no match says so, Escape clears the filter and then closes the list', async (t) => {
  const page = await open(t);
  await page.until(() => window.query() === '');
  const before = await page.evaluate(() => window.picker().value);
  await opened(page);
  await page.insert('zzz');
  await page.until(() => window.state().shown.join() === 'No matching models');
  await page.press('Escape');
  await page.until(() => window.state().shown.length === 7);
  assert.equal(await page.evaluate(() => window.state().open), true);
  await page.press('Escape');
  await page.until(() => window.state().open === false);
  assert.equal(await page.evaluate(() => window.picker().value), before);
});

test('arrows leave the field for the list and typing on an item goes back to it', async (t) => {
  const page = await open(t);
  await page.until(() => window.query() === '');
  await opened(page);
  await page.insert('nova');
  await page.until(() => window.state().shown.length === 2);
  await page.press('Home');
  await page.press('ArrowLeft');
  assert.match(await page.evaluate(() => window.state().focused), /sp-search > input$/);
  await page.press('ArrowDown');
  await page.until(() => /sp-menu-item$/.test(window.state().focused));
  assert.equal(
    await page.evaluate(() => window.picker().querySelector('sp-menu-item:focus')?.value),
    'nova-lite'
  );
  await page.press('x');
  await page.until(() => window.query() === 'novax');
  assert.match(await page.evaluate(() => window.state().focused), /sp-search > input$/);
});

test('opening the model list from the keyboard focuses the filter', async (t) => {
  const page = await open(t);
  await page.until(() => window.query() === '');
  await page.evaluate(() => {
    window.picker().focus();
    return true;
  });
  await page.press('ArrowDown');
  await page.until(() => window.state().open === true);
  await page.until(() => window.state().focused.endsWith('sp-search > input'));
  await page.press('v');
  await page.until(() => window.state().shown.length === 2);
});

test('the settings model picker filters too', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.app.show('settings');
    window.settingsPicker = () => window.settingsPart('sp-picker[label=Model]');
    return true;
  });
  await page.until(() => !!window.settingsPicker()?.querySelector('sp-search'));
  await click(page, 'settingsPicker');
  await page.until(() => window.settingsPicker().open === true);
  await page.until(() => window.focused().endsWith('sp-search > input'));
  await page.insert('haiku');
  await page.until(
    () => window.within(window.settingsPicker()).shown.join() === 'claude-haiku-4-5'
  );
  await page.press('Enter');
  await page.until(() => window.model.settings.get().model === 'claude-haiku-4-5');
});
