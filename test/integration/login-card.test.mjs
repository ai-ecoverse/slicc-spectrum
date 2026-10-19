import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.card = (id, selector = '') =>
      window.chatPart(`.error-card[data-id="${id}"] ${selector}`.trim());
    window.cardState = (id) => {
      const card = window.card(id);
      const login = card?.querySelector('[data-action=login]');
      return {
        state: card?.dataset.login ?? null,
        actions: [...(card?.querySelectorAll('[data-action]') ?? [])].map((b) => b.dataset.action),
        label: card?.querySelector('.fix swc-button:last-child')?.textContent.trim() ?? null,
        pending: !!login?.hasAttribute('pending'),
        detail: card?.querySelector('.detail')?.textContent.trim() ?? null,
        error: card?.querySelector('[data-error=login]')?.textContent.trim() ?? null,
      };
    };
    return true;
  });
  return page;
}

async function kitchen(page) {
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.card('k-s3', '[data-action=login]'));
  await page.evaluate(() => {
    window.card('k-s3').scrollIntoView({ block: 'center' });
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function click(page, id, action) {
  await page.until(
    ([id, action]) => {
      const button = window.card(id, `[data-action=${action}]`);
      if (!button) return false;
      button.scrollIntoView({ block: 'center' });
      const box = button.getBoundingClientRect();
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      let node = document.elementFromPoint(x, y);
      while (node?.shadowRoot && node !== button) {
        const inner = node.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === node) break;
        node = inner;
      }
      const hit = node === button || button.contains(node) || button.shadowRoot?.contains(node);
      window.point = hit ? { x, y } : null;
      return hit;
    },
    [id, action]
  );
  const { x, y } = await page.evaluate(() => window.point);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

const userTexts = () =>
  window.model.agent
    .messages('cone-kitchen')
    .filter((message) => message.role === 'user')
    .map((message) => message.text);

test('Log in on the expired-session card signs in within the click, then offers Retry', async (t) => {
  const page = await open(t);
  await kitchen(page);
  assert.deepEqual(await page.evaluate(() => window.cardState('k-s3')), {
    state: 'idle',
    actions: ['login'],
    label: 'Log in',
    pending: false,
    detail: 'The Adobe session expired. Log in again to continue.',
    error: null,
  });
  const edge = () =>
    window.card('k-s3', '.fix swc-button:last-child').getBoundingClientRect().right;
  await click(page, 'k-s3', 'login');
  const before = await page.evaluate(edge);
  assert.deepEqual(await page.evaluate(() => window.model.settings.connects), [
    { id: 'ai-adobe', gesture: true },
  ]);
  await page.until(() => window.cardState('k-s3').state === 'signing-in');
  assert.ok(Math.abs((await page.evaluate(edge)) - before) < 1);
  assert.equal(
    await page.evaluate(() => window.card('k-s3', '.fix').firstElementChild.dataset.action),
    'cancel-login'
  );
  assert.deepEqual(await page.evaluate(() => window.cardState('k-s3')), {
    state: 'signing-in',
    actions: ['cancel-login', 'login'],
    label: 'Signing in…',
    pending: true,
    detail: 'Continue in the sign-in window that opened.',
    error: null,
  });
  await page.until(() => window.cardState('k-s3').state === 'connected');
  assert.deepEqual(await page.evaluate(() => window.cardState('k-s3')), {
    state: 'connected',
    actions: ['retry'],
    label: 'Retry',
    pending: false,
    detail: 'Signed in. Retry to send it again.',
    error: null,
  });
  assert.equal(
    await page.evaluate(() => window.card('k-s3', '.lead').textContent),
    'Signed in to Adobe AI again.'
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const icon = window.card('k-s3', '.icon');
      return [
        window.card('k-s3').getAttribute('role'),
        !!window.card('k-s3', '.sr'),
        icon.localName,
        icon.getAttribute('aria-hidden'),
        getComputedStyle(icon).color === getComputedStyle(window.card('k-s3', '.detail')).color,
        window.card('k-s3', '.detail').getAttribute('role'),
        window.card('k-s3', '.fix').getAttribute('aria-live'),
      ];
    }),
    [null, false, 'swc-icon-info-circle', 'true', true, 'status', 'off']
  );
  const sentBefore = await page.evaluate(userTexts);
  await click(page, 'k-s3', 'retry');
  await page.until((count) => {
    const queued = window.model.agent.queue?.('cone-kitchen') ?? [];
    return (
      window.model.agent.messages('cone-kitchen').filter((m) => m.role === 'user').length +
        queued.length >
      count + 2
    );
  }, sentBefore.length);
  const sent = await page.evaluate(() => {
    const queued = window.model.agent.queue?.('cone-kitchen') ?? [];
    return [
      ...window.model.agent
        .messages('cone-kitchen')
        .filter((m) => m.role === 'user')
        .map((m) => m.text),
      ...queued.map((m) => m.text),
    ];
  });
  assert.ok(sent.includes(sentBefore.at(-1)), JSON.stringify(sent));
  assert.deepEqual(page.errors, []);
});

test('Log in keeps keyboard focus on the card’s button from Log in to Retry', async (t) => {
  const page = await open(t, { delay: '30' });
  await kitchen(page);
  const held = () => {
    const card = window.card('k-s3');
    const button = card.querySelector('.fix swc-button:last-child');
    return card.getRootNode().activeElement === button ? button.dataset.action : null;
  };
  await page.evaluate(() => {
    window.card('k-s3', '[data-action=login]').focus();
    return true;
  });
  await page.press('Enter');
  await page.until(() => window.cardState('k-s3').state === 'signing-in');
  assert.equal(await page.evaluate(held), 'login');
  await page.until(() => window.cardState('k-s3').state === 'connected');
  assert.equal(await page.evaluate(held), 'retry');
  assert.deepEqual(page.errors, []);
});

test('Log in on an account that needs a token opens Settings at its row and connects nothing', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-triage'));
  await page.until(() => !!window.card('m-t4', '[data-action=login]'));
  await click(page, 'm-t4', 'login');
  await page.until(() => {
    const settings = window.$('slicc-app', 'slicc-dock', 'slicc-settings');
    const row = window.settingsPart('.account[data-id="mcp:tickets"]');
    return !!row && settings.shadowRoot.activeElement === row.querySelector('swc-button');
  });
  assert.deepEqual(await page.evaluate(() => window.model.settings.connects), []);
  assert.deepEqual(page.errors, []);
});

test('Cancel stops the sign-in and puts Log in back without an error', async (t) => {
  const page = await open(t, { delay: '30' });
  await kitchen(page);
  await click(page, 'k-s3', 'login');
  await page.until(() => !!window.card('k-s3', '[data-action=cancel-login]'));
  await click(page, 'k-s3', 'cancel-login');
  await page.until(() => window.cardState('k-s3').label === 'Log in');
  assert.deepEqual(await page.evaluate(() => window.cardState('k-s3')), {
    state: 'idle',
    actions: ['login'],
    label: 'Log in',
    pending: false,
    detail: 'The Adobe session expired. Log in again to continue.',
    error: null,
  });
  assert.equal(
    await page.evaluate(
      () => window.model.settings.accounts().find((a) => a.id === 'ai-adobe').status
    ),
    'expired'
  );
  assert.deepEqual(page.errors, []);
});

test('a failed sign-in shows why, keeps Log in, and Open settings goes to the account', async (t) => {
  const page = await open(t, { login: 'fail' });
  await kitchen(page);
  await click(page, 'k-s3', 'login');
  await page.until(() => !!window.card('k-s3', '[data-error=login]'));
  assert.deepEqual(await page.evaluate(() => window.cardState('k-s3')), {
    state: 'idle',
    actions: ['login', 'settings'],
    label: 'Log in',
    pending: false,
    detail: 'The Adobe session expired. Log in again to continue.',
    error: 'The sign-in window was closed before it finished.Open settings',
  });
  await click(page, 'k-s3', 'settings');
  await page.until(() => !!window.settingsPart('.account[data-id=ai-adobe]'));
  await page.until(() => {
    const settings = window.$('slicc-app', 'slicc-dock', 'slicc-settings');
    const row = window.settingsPart('.account[data-id=ai-adobe]');
    return settings.shadowRoot.activeElement === row.querySelector('swc-button');
  });
  assert.deepEqual(page.errors, []);
});

test('Log in without an account still opens Settings at Accounts', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-triage'));
  await page.until(() => !!window.card('m-t3', '[data-action=login]'));
  await click(page, 'm-t3', 'login');
  await page.until(() => !!window.settingsPart('h2[data-section=accounts]'));
  assert.deepEqual(await page.evaluate(() => window.model.settings.connects), []);
  assert.deepEqual(page.errors, []);
});

test('a watch-only follower cannot start the sign-in from the card', async (t) => {
  const page = await open(t, { follow: 'watch' });
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.card('k-s3'));
  assert.deepEqual(
    await page.evaluate(() => {
      const button = window.card('k-s3', '[data-action=login]');
      return [!!button?.disabled, window.card('k-s3').dataset.login ?? null];
    }),
    [true, null]
  );
  assert.deepEqual(await page.evaluate(() => window.model.settings.connects), []);
  assert.deepEqual(page.errors, []);
});

test('a sign-in that opens no window keeps the card’s own detail while it signs in', async (t) => {
  const page = await open(t, { delay: '200' });
  await page.evaluate(() => {
    const settings = window.model.settings;
    const accounts = settings.accounts.bind(settings);
    settings.accounts = () =>
      accounts().map((account) =>
        account.id === 'ai-adobe' ? { ...account, auth: 'local' } : account
      );
    return true;
  });
  await kitchen(page);
  await click(page, 'k-s3', 'login');
  await page.until(() => window.cardState('k-s3').state === 'signing-in');
  assert.equal(
    (await page.evaluate(() => window.cardState('k-s3'))).detail,
    'The Adobe session expired. Log in again to continue.'
  );
  assert.deepEqual(page.errors, []);
});

test('a sign-in that takes long asks whether the window was closed, and keeps Cancel', async (t) => {
  const page = await open(t, { delay: '300' });
  await page.evaluate(() => {
    customElements.get('slicc-chat').closedAfter = 400;
    return true;
  });
  await kitchen(page);
  await click(page, 'k-s3', 'login');
  await page.until(() => window.cardState('k-s3').state === 'signing-in');
  assert.equal(
    (await page.evaluate(() => window.cardState('k-s3'))).detail,
    'Continue in the sign-in window that opened.'
  );
  await page.until(
    () =>
      window.cardState('k-s3').detail === 'Closed the sign-in window? Cancel, then Log in again.'
  );
  assert.deepEqual((await page.evaluate(() => window.cardState('k-s3'))).actions, [
    'cancel-login',
    'login',
  ]);
  await click(page, 'k-s3', 'cancel-login');
  await page.until(() => window.cardState('k-s3').label === 'Log in');
  await click(page, 'k-s3', 'login');
  await page.until(() => window.cardState('k-s3').state === 'signing-in');
  assert.equal(
    (await page.evaluate(() => window.cardState('k-s3'))).detail,
    'Continue in the sign-in window that opened.'
  );
  assert.deepEqual(page.errors, []);
});
