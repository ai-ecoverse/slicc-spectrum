import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
const narrow = await launch(['--window-size=390,844']);
after(async () => {
  await chrome.close();
  await narrow.close();
});

async function open(t, color = 'light', browser = chrome) {
  const page = await browser.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.part = (panel, selector) =>
      window.$('slicc-app', 'slicc-dock').content(panel)?.shadowRoot.querySelector(selector);
  });
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((resolve) => setTimeout(resolve, 200));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

const dialog = () => {
  const confirm = window.$('slicc-app', 'slicc-confirm');
  const shown = confirm?.shadowRoot.querySelector('dialog');
  if (!shown?.open) return null;
  return {
    parent: confirm.parentElement.localName,
    root: confirm.getRootNode().host?.localName,
    role: shown.getAttribute('role'),
    modal: shown.matches(':modal'),
    title: confirm.shadowRoot.querySelector('h2').textContent,
    body: confirm.shadowRoot.querySelector('p').textContent,
    variant: confirm.shadowRoot.querySelector('sp-alert-dialog').getAttribute('variant'),
    buttons: [...confirm.shadowRoot.querySelectorAll('swc-button')].map((button) => [
      button.textContent.trim(),
      button.getAttribute('variant'),
    ]),
  };
};

const answer = (ok) =>
  window
    .$('slicc-app', 'slicc-confirm')
    .shadowRoot.querySelector(ok ? '[data-action]' : '[data-cancel]')
    .click();

const closed = () => !window.$('slicc-app', 'slicc-confirm');

const revertAll = () =>
  [
    ...window
      .$('slicc-app', 'slicc-dock', 'slicc-changes')
      .shadowRoot.querySelectorAll('.bar sp-action-button'),
  ]
    .find((button) => button.textContent.trim() === 'Revert all')
    .click();

test('Revert all asks first: cancel keeps the changes, confirm reverts them', async (t) => {
  const page = await open(t);
  await page.until(() => window.model.files.changes().length === 4);

  await page.evaluate(revertAll);
  await page.until(dialog);
  assert.deepEqual(await page.evaluate(dialog), {
    parent: 'sp-theme',
    root: 'slicc-app',
    role: 'alertdialog',
    modal: true,
    title: 'Revert 4 changes?',
    body: "This discards the agents' edits and puts every file back. You can't undo this.",
    variant: 'destructive',
    buttons: [
      ['Cancel', 'secondary'],
      ['Revert all', 'negative'],
    ],
  });
  await shot(page, 'confirm-revert-all-light');

  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.files.changes().length), 4);

  await page.evaluate(revertAll);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until(() => window.model.files.changes().length === 0);
  assert.ok(await page.evaluate(closed));
  assert.deepEqual(page.errors, []);
});

test('the dialog takes focus on Cancel, Escape cancels, and focus goes back to the trigger', async (t) => {
  const page = await open(t);
  await page.until(() => window.model.files.changes().length === 4);
  const trigger = () =>
    [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-changes')
        .shadowRoot.querySelectorAll('.bar sp-action-button'),
    ]
      .find((button) => button.textContent.trim() === 'Revert all')
      .focus();

  await page.evaluate(trigger);
  await page.press('Enter');
  await page.until(dialog);
  await page.until(() => /slicc-confirm > swc-button > button$/.test(window.focused()));
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-confirm').shadowRoot.activeElement.dataset.cancel
    ),
    ''
  );

  await page.press('Escape');
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.files.changes().length), 4);
  await page.until(() => /slicc-changes > sp-action-button$/.test(window.focused()));

  await page.press('Enter');
  await page.until(dialog);
  await page.until(() => /slicc-confirm > swc-button > button$/.test(window.focused()));
  await page.press('Enter');
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.files.changes().length), 4);
  await page.until(() => /slicc-changes > sp-action-button$/.test(window.focused()));

  await page.press(' ');
  await page.until(dialog);
  await page.until(() => /slicc-confirm > swc-button > button$/.test(window.focused()));
  await page.press('Tab');
  await page.until(
    () => window.$('slicc-app', 'slicc-confirm').shadowRoot.activeElement?.dataset.action === ''
  );
  await page.press('Enter');
  await page.until(() => window.model.files.changes().length === 0);
  assert.deepEqual(page.errors, []);
});

test('every destructive action asks first and acts only on confirm', async (t) => {
  const page = await open(t);
  const ask = async (click, title) => {
    await page.evaluate(click);
    await page.until(dialog);
    assert.equal((await page.evaluate(dialog)).title, title);
  };

  await page.until(() => window.model.files.changes().length === 4);
  const revert = () =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-changes',
        'li[data-path="/workspace/harbor/src/lib/retry.ts"] sp-action-button[label=Revert]'
      )
      .click();
  await ask(revert, 'Revert retry.ts?');
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.files.changes().length), 4);
  await ask(revert, 'Revert retry.ts?');
  await page.evaluate(answer, true);
  await page.until(() => window.model.files.changes().length === 3);

  await page.evaluate(() => window.app.open('diff', '/workspace/harbor/src/lib/cache.ts'));
  await page.until(() => !!window.part('diff:/workspace/harbor/src/lib/cache.ts', '.bar'));
  const revertDiff = () =>
    [
      ...window
        .part('diff:/workspace/harbor/src/lib/cache.ts', '.bar')
        .querySelectorAll('sp-action-button'),
    ]
      .find((button) => button.textContent.trim() === 'Revert')
      .click();
  await ask(revertDiff, 'Revert cache.ts?');
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.files.changes().length), 3);
  await ask(revertDiff, 'Revert cache.ts?');
  await page.evaluate(answer, true);
  await page.until(() => window.model.files.changes().length === 2);

  await page.evaluate(() => window.app.show('freezer'));
  await page.until(() => !!window.part('freezer', '.card'));
  const frozen = await page.evaluate(() => window.model.agent.frozen().length);
  const discard = () =>
    [...window.part('freezer', '.card').querySelectorAll('sp-action-button')]
      .find((button) => button.textContent.trim() === 'Delete')
      .click();
  await page.evaluate(discard);
  await page.until(dialog);
  assert.match((await page.evaluate(dialog)).title, /^Delete .+\?$/);
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.agent.frozen().length), frozen);
  await page.evaluate(discard);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until((count) => window.model.agent.frozen().length === count - 1, frozen);

  await page.evaluate(() => window.app.show('memory'));
  await page.until(() => !!window.part('memory', '.row .head'));
  const memories = await page.evaluate(() => window.model.memory.list().length);
  await page.evaluate(() => window.part('memory', '.row .head').click());
  await page.until(() => !!window.part('memory', '.row .body'));
  const forget = () =>
    [...window.part('memory', '.row .actions').querySelectorAll('sp-action-button')]
      .find((button) => button.textContent.trim() === 'Forget')
      .click();
  await page.evaluate(forget);
  await page.until(dialog);
  assert.match((await page.evaluate(dialog)).title, /^Forget “.+”\?$/);
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.memory.list().length), memories);
  await page.evaluate(forget);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until((count) => window.model.memory.list().length === count - 1, memories);

  await page.evaluate(() => window.app.show('settings'));
  await page.until(
    () =>
      !!window.settingsPart('.account') &&
      window.model.settings.accounts().some((a) => a.status === 'connected')
  );
  const account = await page.evaluate(() =>
    window.model.settings.accounts().find((a) => a.status === 'connected')
  );
  const disconnect = (id) =>
    [...window.settingsPart(`.account[data-id="${id}"]`).querySelectorAll('sp-button')]
      .find((button) => button.textContent.trim() === 'Disconnect')
      .click();
  await page.evaluate(disconnect, account.id);
  await page.until(dialog);
  assert.equal((await page.evaluate(dialog)).title, `Disconnect ${account.provider}?`);
  await page.evaluate(answer, false);
  await page.until(closed);
  await page.evaluate(disconnect, account.id);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until(
    (id) => window.model.settings.accounts().find((a) => a.id === id).status === 'disconnected',
    account.id
  );

  await page.evaluate(() => window.$('slicc-app', 'slicc-tray', '.chip').click());
  await page.until(() => !!window.$('slicc-app', 'slicc-tray', '.panel'));
  const leave = () =>
    [...window.$('slicc-app', 'slicc-tray').shadowRoot.querySelectorAll('.panel sp-action-button')]
      .find((button) => button.textContent.trim() === 'Disconnect')
      .click();
  await page.evaluate(leave);
  await page.until(dialog);
  assert.match((await page.evaluate(dialog)).title, /^Disconnect from .+\?$/);
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.notEqual(await page.evaluate(() => window.model.tray.status().connection), 'offline');
  await page.evaluate(leave);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until(() => window.model.tray.status().connection === 'offline');

  await page.evaluate(() => window.app.show('terminal'));
  await page.until(() => window.model.terminals.list().length > 0);
  const terminals = await page.evaluate(() => window.model.terminals.list().length);
  const close = () => window.$('slicc-app', 'slicc-dock', 'slicc-terminals', '.tab .close').click();
  await page.evaluate(close);
  await page.until(dialog);
  assert.match((await page.evaluate(dialog)).title, /^Close .+\?$/);
  await page.evaluate(answer, false);
  await page.until(closed);
  assert.equal(await page.evaluate(() => window.model.terminals.list().length), terminals);
  await page.evaluate(close);
  await page.until(dialog);
  await page.evaluate(answer, true);
  await page.until((count) => window.model.terminals.list().length === count - 1, terminals);
  assert.deepEqual(page.errors, []);
});

for (const [name, color, browser] of [
  ['desktop', 'dark', chrome],
  ['phone', 'light', narrow],
  ['phone', 'dark', narrow],
]) {
  test(`the confirmation is themed and fits on ${name} in ${color}`, async (t) => {
    const page = await open(t, color, browser);
    await page.evaluate(() => window.app.show('changes'));
    await page.until(
      () => !!window.$('slicc-app', 'slicc-dock', 'slicc-changes', '.bar sp-action-button')
    );
    await page.evaluate(revertAll);
    await page.until(dialog);
    const box = await page.evaluate(() => {
      const shown = window.$('slicc-app', 'slicc-confirm').shadowRoot.querySelector('dialog');
      const { left, right, width } = shown.getBoundingClientRect();
      return {
        left,
        right,
        width,
        viewport: innerWidth,
        scheme: getComputedStyle(shown).colorScheme,
        background: getComputedStyle(shown).backgroundColor,
      };
    });
    assert.equal(box.scheme, color);
    assert.ok(box.left >= 0 && box.right <= box.viewport, JSON.stringify(box));
    if (name === 'phone')
      assert.equal(Math.round(box.width), box.viewport - 32, JSON.stringify(box));
    else assert.ok(box.width <= 480, JSON.stringify(box));
    await shot(page, `confirm-${name}-${color}`);
    await page.press('Escape');
    await page.until(closed);
    assert.deepEqual(page.errors, []);
  });
}
