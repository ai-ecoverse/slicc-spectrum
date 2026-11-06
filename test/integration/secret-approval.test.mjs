import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, query) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...query })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    window.frame = () =>
      window
        .approvals()
        .querySelector('slicc-vault-value')
        ?.shadowRoot.querySelector('[data-vault-value]');
    window.card = () => {
      const root = window.approvals();
      const dialog = root.querySelector('dialog');
      return {
        id: dialog?.dataset.approval,
        kind: dialog?.dataset.kind,
        requester: dialog?.dataset.requester,
        title: root.querySelector('h2')?.textContent,
        asking: root.querySelector('#asking')?.textContent,
        command: root.querySelector('[data-command]')?.textContent,
        cwd: root.querySelector('.cwd')?.textContent,
        prompt: root.querySelector('[data-prompt]')?.textContent ?? null,
        reveal: root.querySelector('[data-reveal]')?.textContent ?? null,
        frame: !!root.querySelector('[data-value-frame] slicc-vault-value'),
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

async function asked(page, id) {
  await page.until(
    (id) =>
      window.approvals().querySelector('dialog')?.dataset.approval === id &&
      window.approvals().activeElement?.dataset.action === 'deny' &&
      !window.approvals().querySelector('[data-value-frame][inert]') &&
      !!window.frame()?.querySelector('swc-button:not([disabled])'),
    id
  );
}

async function click(page, x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

async function press(page, selector) {
  const { x, y } = await page.evaluate((selector) => {
    const box = window.frame().querySelector(selector).getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, selector);
  await click(page, x, y);
}

test('an enter and a reveal ask show the trusted block, the prompt, the frame and only Deny', async (t) => {
  const page = await open(t, { approvals: 'secret', vault: 'secrets' });
  await asked(page, 'ask-harbor');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    id: 'ask-harbor',
    kind: 'secret',
    requester: 'user',
    title: 'Enter a value for HARBOR_DEPLOY_TOKEN?',
    asking: 'You ran this in Terminal 1 (as cone):',
    command: '/usr/bin/fnox set HARBOR_DEPLOY_TOKEN',
    cwd: 'In /home/cone/harbor',
    prompt:
      'From the agent, not checked by SLICC:Paste the harbor deploy token from the release checklist.',
    reveal: null,
    frame: true,
    actions: [['deny', 'Deny']],
    focused: 'deny',
  });
  assert.deepEqual(await page.evaluate(() => window.model.vault.frames[0].messages.at(-1)), {
    type: 'slicc-vault',
    v: 1,
    op: 'value',
    request: 'ask-harbor',
    config: { theme: 'light', dir: 'ltr', lang: 'en' },
  });
  await page.screenshot(new URL('secret-enter.png', page.dir));
  await page.evaluate(() => window.frame().querySelector('input').focus());
  await page.send('Input.insertText', { text: 'harbor-deploy-0042' });
  await press(page, '[data-action=save]');
  await asked(page, 'ask-lagoon');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    id: 'ask-lagoon',
    kind: 'secret',
    requester: 'agent',
    title: 'Reveal LAGOON_API_KEY to a program?',
    asking: 'docs-pass ran this in scoop:docs:',
    command: '/usr/bin/sealed ask LAGOON_API_KEY --reveal',
    cwd: 'In /home/cone/harbor',
    prompt:
      'From the agent, not checked by SLICC:The tide report script signs its uploads with this key.',
    reveal:
      '/usr/bin/sealed gets the plaintext. It can send it anywhere. The agent asked for this.',
    frame: true,
    actions: [['deny', 'Deny']],
    focused: 'deny',
  });
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(window.approvals().querySelector('[data-reveal]')).backgroundColor
    ),
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--swc-negative-subtle-background-color-default)';
      window.$('slicc-app', 'slicc-approvals').shadowRoot.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    })
  );
  await page.screenshot(new URL('secret-reveal.png', page.dir));
  await press(page, '[data-action=allow]');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(
    await page.evaluate(() => ({
      decisions: window.model.approvals.decisions,
      list: window.model.approvals.list().length,
      revealed: window.model.vault.revealed,
      sealed: window.model.vault.list().secrets.some(({ name }) => name === 'HARBOR_DEPLOY_TOKEN'),
      waiting: window.model.vault.status().waiting.filter(({ kind }) => kind === 'ask').length,
    })),
    { decisions: [], list: 0, revealed: ['ask-lagoon'], sealed: true, waiting: 0 }
  );
  assert.deepEqual(page.errors, []);
});

test('Deny, Escape on the dialog and Escape inside the frame cancel the ask in the vault', async (t) => {
  const page = await open(t, { approvals: 'secret', vault: 'secrets' });
  await asked(page, 'ask-harbor');
  await page.press('Escape');
  await asked(page, 'ask-lagoon');
  await page.evaluate(() => window.frame().querySelector('[data-action=allow]').focus());
  await page.press('Escape');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(
    await page.evaluate(() => ({
      decisions: window.model.approvals.decisions,
      cancelled: window.model.vault.cancelled,
      revealed: window.model.vault.revealed,
    })),
    {
      decisions: [
        ['ask-harbor', 'deny'],
        ['ask-lagoon', 'deny'],
      ],
      cancelled: ['ask-harbor', 'ask-lagoon'],
      revealed: [],
    }
  );
  assert.deepEqual(page.errors, []);
});

test('after the frame saves, focus goes back to the terminal that had it', async (t) => {
  const page = await open(t, { approvals: 'none', vault: 'secrets' });
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=terminal]').click());
  await page.until(() => window.screen().includes('$'));
  await page.evaluate(() => window.terminal().focus());
  await page.until(() => window.activated().terminal);
  await page.evaluate(() => {
    const now = Date.now();
    window.model.approvals.raise({
      id: 'ask-pier',
      kind: 'secret',
      mode: 'enter',
      name: 'PIER_TOKEN',
      reveal: false,
      requester: { kind: 'user', name: 'cone', where: 'a terminal' },
      process: { exe: '/usr/bin/fnox', argv: ['fnox', 'set', 'PIER_TOKEN'], cwd: '/home/cone' },
      createdAt: now,
      expiresAt: now + 300_000,
    });
    return true;
  });
  await asked(page, 'ask-pier');
  assert.equal(await page.evaluate(() => window.card().prompt), null);
  await page.evaluate(() => window.frame().querySelector('input').focus());
  await page.send('Input.insertText', { text: 'pier-token-0099' });
  await press(page, '[data-action=save]');
  await page.until(() => !window.approvals().querySelector('dialog'));
  await page.until(() => window.activated().terminal);
  assert.deepEqual(page.errors, []);
});

test('a long argv keeps the frame inert until its end has been in view, with control chips', async (t) => {
  const page = await open(t, { approvals: 'secret-long', vault: 'secrets' });
  await page.until(
    () =>
      window.approvals().querySelector('dialog')?.dataset.approval === 'ask-long' &&
      !!window.approvals().querySelector('[data-allow-hint]')
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      inert: !!window.approvals().querySelector('[data-value-frame][inert]'),
      hint: window.approvals().querySelector('[data-allow-hint]').textContent,
      chips: [...window.approvals().querySelectorAll('.control')]
        .map((chip) => chip.title)
        .filter((title) => title !== 'line feed (U+000A)'),
      reveal: window.approvals().querySelector('[data-reveal]').textContent,
    })),
    {
      inert: true,
      hint: 'Scroll to the end of the command to answer it.',
      chips: [
        'carriage return (U+000D)',
        'carriage return (U+000D)',
        'U+202E',
        'carriage return (U+000D)',
      ],
      reveal: '/usr/bin/sh gets the plaintext. It can send it anywhere. The agent asked for this.',
    }
  );
  await page.screenshot(new URL('secret-long.png', page.dir));
  await page.evaluate(() => {
    const lines = window.approvals().querySelector('.command .lines');
    lines.scrollTop = lines.scrollHeight;
    return true;
  });
  await page.until(
    () =>
      !window.approvals().querySelector('[data-value-frame][inert]') &&
      !window.approvals().querySelector('[data-allow-hint]')
  );
  assert.deepEqual(page.errors, []);
});

test('without the vault the ask can only be denied, and an expired ask says so', async (t) => {
  const page = await open(t, { approvals: 'secret-enter' });
  await page.until(() => window.approvals().activeElement?.dataset.action === 'deny');
  assert.deepEqual(
    await page.evaluate(() => [
      window.approvals().querySelector('[data-id=no-frame]')?.textContent,
      window.card().frame,
      window.card().actions,
    ]),
    [
      'The vault isn’t available here, so this request can only be denied.',
      false,
      [['deny', 'Deny']],
    ]
  );
  await page.evaluate(() => window.model.approvals.end('ask-harbor', 'expired'));
  await page.until(() => window.approvals().querySelector('dialog')?.dataset.gone === 'expired');
  assert.deepEqual(
    await page.evaluate(() => [window.card().title, window.card().command, window.card().actions]),
    ['Secret request timed out', '/usr/bin/fnox set HARBOR_DEPLOY_TOKEN', [['close', 'Close']]]
  );
  assert.deepEqual(page.errors, []);
});

test('a request cancelled elsewhere shows Answered elsewhere, and a locked vault unlocks in the frame', async (t) => {
  const page = await open(t, { approvals: 'secret-reveal', vault: 'locked' });
  await page.until(
    () =>
      !!window.frame()?.querySelector('[data-action=unlock]') &&
      !window.approvals().querySelector('[data-value-frame][inert]')
  );
  await page.evaluate(() => window.frame().querySelector('[data-action=unlock]').click());
  await page.until(() => !!window.frame()?.querySelector('[data-action=allow]:not([disabled])'));
  await page.evaluate(() => window.model.vault.cancel('ask-lagoon'));
  await page.until(() => window.approvals().querySelector('dialog')?.dataset.gone === 'elsewhere');
  assert.equal(await page.evaluate(() => window.card().title), 'Answered elsewhere');
  assert.deepEqual(page.errors, []);
});
