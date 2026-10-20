import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, approvals, color = 'light') {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color, approvals })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    window.card = () => {
      const root = window.approvals();
      return {
        kind: root.querySelector('dialog')?.dataset.kind,
        title: root.querySelector('h2')?.textContent,
        body: root.querySelector('#asking')?.textContent,
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => [
          button.dataset.action,
          button.textContent.trim(),
        ]),
        focused: root.activeElement?.dataset.action ?? null,
      };
    };
    return true;
  });
  return page;
}

async function ask(page, id) {
  await page.until(
    (id) =>
      window.approvals().querySelector('dialog')?.dataset.approval === id &&
      window.approvals().activeElement?.dataset.action === 'deny',
    id
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
}

async function click(page, action) {
  const { x, y } = await page.evaluate((action) => {
    const box = window.approvals().querySelector(`[data-action=${action}]`).getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, action);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

const buttons = [
  ['deny', 'Deny'],
  ['once', 'Allow once'],
];

test('each tray op asks with its own title and body, Deny focused, and records once and deny', async (t) => {
  const page = await open(t, 'tray');
  await ask(page, 'tray-url');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'tray',
    title: 'Share this seven’s join URL?',
    body: 'sliccy wants this seven’s join URL. Anyone with it can ask to link to this seven.',
    actions: buttons,
    focused: 'deny',
  });
  await click(page, 'once');
  await ask(page, 'tray-rotate');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'tray',
    title: 'Make a new join URL?',
    body: 'sliccy wants a new join URL. Linked devices move to it, and the old one stops working.',
    actions: buttons,
    focused: 'deny',
  });
  await click(page, 'deny');
  await ask(page, 'tray-unlink');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'tray',
    title: 'Unlink Kitchen tablet?',
    body: 'sliccy wants to unlink Kitchen tablet from this seven.',
    actions: buttons,
    focused: 'deny',
  });
  await click(page, 'once');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['tray-url', 'once'],
    ['tray-rotate', 'deny'],
    ['tray-unlink', 'once'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a tray request never offers Always allow, even when the port sends always', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() => {
    const now = Date.now();
    window.model.approvals.raise({
      id: 'tray-anon',
      kind: 'tray',
      op: 'unlink',
      requester: { kind: 'agent', name: 'sliccy' },
      createdAt: now,
      expiresAt: now + 300_000,
      always: true,
    });
    return true;
  });
  await ask(page, 'tray-anon');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'tray',
    title: 'Unlink a device?',
    body: 'sliccy wants to unlink a device from this seven.',
    actions: buttons,
    focused: 'deny',
  });
  assert.equal(await page.evaluate(() => !!window.approvals().querySelector('.hint')), false);
  await page.evaluate(() => {
    const element = window.$('slicc-app', 'slicc-approvals');
    return element.decide(window.model.approvals.list()[0], 'always').then(() => true);
  });
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await page.press('Escape');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['tray-anon', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('an ended tray request reads as answered in another tab or timed out', async (t) => {
  const page = await open(t, 'tray');
  await ask(page, 'tray-url');
  const gone = async (reason) => {
    await page.until(
      (reason) => window.approvals().querySelector('dialog')?.dataset.gone === reason,
      reason
    );
    return page.evaluate(() => ({
      title: window.approvals().querySelector('h2').textContent,
      body: window.approvals().querySelector('#asking').textContent,
      timer: window.approvals().querySelector('[data-timer]')?.textContent ?? null,
      actions: [...window.approvals().querySelectorAll('[slot=button]')].map(
        (button) => button.dataset.action
      ),
    }));
  };
  await page.evaluate(() => window.model.approvals.end('tray-url', 'answered'));
  assert.deepEqual(await gone('elsewhere'), {
    title: 'Answered in another tab',
    body: 'sliccy wants this seven’s join URL. Anyone with it can ask to link to this seven.',
    timer: null,
    actions: ['close'],
  });
  await click(page, 'close');
  await ask(page, 'tray-rotate');
  await page.evaluate(() => window.model.approvals.end('tray-rotate', 'expired'));
  assert.deepEqual(await gone('expired'), {
    title: 'Tray request timed out',
    body: 'sliccy wants a new join URL. Linked devices move to it, and the old one stops working.',
    timer: 'Denied because nobody answered in time.',
    actions: ['close'],
  });
  await click(page, 'close');
  await ask(page, 'tray-unlink');
  await page.evaluate(() => window.model.approvals.end('tray-unlink', 'withdrawn'));
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  assert.deepEqual(page.errors, []);
});

test('the tray-expired fixture times out on its own', async (t) => {
  const page = await open(t, 'tray-expired');
  await page.until(() => window.approvals().querySelector('dialog')?.dataset.gone === 'expired');
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('h2').textContent),
    'Tray request timed out'
  );
  assert.deepEqual(page.errors, []);
});

test('without decide, a tray request is a waiting notice in the chat', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() => {
    window.model.approvals.decide = undefined;
    const now = Date.now();
    window.model.approvals.raise({
      id: 'tray-url',
      kind: 'tray',
      op: 'url',
      requester: { kind: 'agent', name: 'sliccy' },
      createdAt: now,
      expiresAt: now + 300_000,
    });
    return true;
  });
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-notices',
        '[data-approval-kind=tray]'
      )
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const notice = window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-notices',
        '[data-approval-kind=tray]'
      );
      return [
        notice.dataset.approvalNotice,
        notice.querySelector('.title').textContent,
        ...[...notice.querySelectorAll('p')].map((p) => p.textContent.replace(/at .*\./, 'at …')),
      ];
    }),
    [
      'tray-url',
      'Waiting for tray approval',
      'sliccy wants this seven’s join URL. Anyone with it can ask to link to this seven.',
      "It waits for the owner's approval. Denied automatically at …",
    ]
  );
  assert.equal(await page.evaluate(() => !!window.approvals().querySelector('dialog')), false);
  assert.deepEqual(page.errors, []);
});

test('an approval of a kind this build does not know is skipped, in the dialog and the notices', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() => {
    const now = Date.now();
    const raise = (id, kind) =>
      window.model.approvals.raise({
        id,
        kind,
        op: 'url',
        requester: { kind: 'agent', name: 'sliccy' },
        createdAt: now,
        expiresAt: now + 300_000,
      });
    raise('later-kind', 'constructor');
    raise('tray-url', 'tray');
    return true;
  });
  await ask(page, 'tray-url');
  await click(page, 'deny');
  await page.until(() => !window.approvals().querySelector('dialog'));
  await page.evaluate(() => {
    window.model.approvals.decide = undefined;
    const now = Date.now();
    window.model.approvals.raise({
      id: 'nudge',
      kind: 'future',
      requester: { kind: 'agent', name: 'sliccy' },
      createdAt: now,
      expiresAt: now + 300_000,
    });
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await page.evaluate(
      () =>
        window
          .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-notices')
          ?.shadowRoot.querySelectorAll('[data-approval-notice]').length ?? 0
    ),
    0
  );
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['tray-url', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});
