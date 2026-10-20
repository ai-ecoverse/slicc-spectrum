import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '40', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.copies = [];
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text) => {
        window.copies.push(text);
      },
    });
    window.inner = () => window.$('slicc-app', 'slicc-dock', 'slicc-settings').shadowRoot;
    window.part = (surface, selector) =>
      surface === 'chat' ? window.chatPart(selector) : window.settingsPart(selector);
    window.signIn = (surface, scope) => {
      const root = window.part(surface, scope);
      const block = root?.querySelector('[data-sign-in]');
      const code = block?.querySelector('[data-id=sign-in-code]');
      const copy = block?.querySelector('[data-action=copy-sign-in-code]');
      const link = block?.querySelector('a[data-action=open-sign-in]');
      return {
        shown: !!block,
        lead: block?.querySelector('.enter')?.textContent.trim() ?? null,
        code: code?.textContent.trim() ?? null,
        mono: code ? getComputedStyle(code).fontFamily.includes('Source Code Pro') : null,
        select: code ? getComputedStyle(code).userSelect : null,
        copy: copy?.getAttribute('accessible-label') ?? null,
        copyText: copy?.textContent.trim() ?? null,
        quiet: copy ? copy.hasAttribute('quiet') : null,
        link: link ? { href: link.getAttribute('href'), target: link.target, rel: link.rel } : null,
        unknown: block?.querySelector('[data-id=sign-in-unknown]')?.textContent.trim() ?? null,
        url: block?.querySelector('[data-id=sign-in-url]')?.textContent.trim() ?? null,
      };
    };
    return true;
  });
  return page;
}

async function click(page, surface, selector) {
  await page.until(
    ([surface, selector]) => {
      const target = window.part(surface, selector);
      if (!target || target.disabled) return false;
      target.scrollIntoView({ block: 'center' });
      const box = target.getBoundingClientRect();
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      let node = document.elementFromPoint(x, y);
      while (node?.shadowRoot && node !== target) {
        const inner = node.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === node) break;
        node = inner;
      }
      const hit = node === target || target.contains(node) || target.shadowRoot?.contains(node);
      window.point = { x, y };
      return box.width > 0 && hit;
    },
    [surface, selector]
  );
  const { x, y } = await page.evaluate(() => window.point);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

async function settings(page) {
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.settingsPart('.account[data-id=ai-adobe] [data-action=connect]'));
}

const row = '.accounts .account[data-id=ai-adobe] + .notes';
const unknown = 'This sign-in page isn’t one SLICC knows. Check the address before you go there.';
const known = {
  href: 'https://auth.openai.com/codex/device',
  target: '_blank',
  rel: 'noopener noreferrer',
};
const step = 'dialog.picker .step';

const codex = '.accounts .account[data-id=openai-codex] + .notes';

async function codexRow(page) {
  await settings(page);
  await click(page, 'settings', '.account[data-id=openai-codex] [data-action=connect]');
  await page.until((codex) => window.signIn('settings', codex).shown, codex);
}

async function addCodex(page) {
  await settings(page);
  await click(page, 'settings', '[data-action=add-provider]');
  await page.until(() => window.settingsPart('dialog.picker')?.open);
  await click(page, 'settings', '.option[data-provider="openai-codex"]');
  await click(page, 'settings', 'dialog.picker [data-action=sign-in]');
  await page.until((step) => window.signIn('settings', step).shown, step);
}

test('a device code shows in the Settings row, monospace, with Copy, and a page that is not the account’s is plain text with a warning', async (t) => {
  const page = await open(t, { login: 'code' });
  await settings(page);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=connect]');
  await page.until((row) => window.signIn('settings', row).shown, row);
  assert.deepEqual(await page.evaluate((row) => window.signIn('settings', row), row), {
    shown: true,
    lead: 'Enter this code on the sign-in page:',
    code: 'WDJB-MJHT',
    mono: true,
    select: 'all',
    copy: 'Copy the code',
    copyText: 'Copy',
    quiet: true,
    link: null,
    unknown,
    url: 'https://auth.openai.com/codex/device',
  });
  assert.equal(
    await page.evaluate(
      () => window.settingsPart('.account[data-id=ai-adobe] swc-status-light').textContent
    ),
    'Signing in…'
  );
  await click(page, 'settings', `${row} [data-action=copy-sign-in-code]`);
  await page.until((row) => window.signIn('settings', row).copyText === 'Copied', row);
  assert.deepEqual(await page.evaluate(() => window.copies), ['WDJB-MJHT']);
  assert.deepEqual(
    await page.evaluate(
      (row) => [
        window.signIn('settings', row).copy,
        window.settingsPart(`${row} [data-sign-in] [role=status]`).textContent,
      ],
      row
    ),
    ['Copied', 'Copied']
  );
  await page.until(
    () =>
      window.settingsPart('.account[data-id=ai-adobe] swc-status-light')?.textContent ===
      'Connected'
  );
  assert.equal(await page.evaluate(() => !!window.settingsPart('[data-sign-in]')), false);
  assert.deepEqual(page.errors, []);
});

test('Cancel still stops a device-code sign-in and takes the code away', async (t) => {
  const page = await open(t, { login: 'code', delay: '200' });
  await settings(page);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=connect]');
  await page.until((row) => window.signIn('settings', row).code === 'WDJB-MJHT', row);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=cancel-sign-in]');
  await page.until(
    () =>
      window.settingsPart('.account[data-id=ai-adobe] swc-status-light')?.textContent === 'Expired'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.settingsPart('[data-sign-in]'),
      window.model.settings.accounts().find((account) => account.id === 'ai-adobe').status,
    ]),
    [false, 'expired']
  );
  assert.deepEqual(page.errors, []);
});

test('a URL-only sign-in on its known host shows only the link', async (t) => {
  const page = await open(t, { login: 'url', delay: '200' });
  await codexRow(page);
  assert.deepEqual(await page.evaluate((codex) => window.signIn('settings', codex), codex), {
    shown: true,
    lead: null,
    code: null,
    mono: null,
    select: null,
    copy: null,
    copyText: null,
    quiet: null,
    link: {
      href: 'https://auth.openai.com/oauth/authorize?client_id=slicc-dummy&response_type=code&state=7f3a',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    unknown: null,
    url: null,
  });
  assert.deepEqual(page.errors, []);
});

test('a failed copy reads Couldn’t copy, on the button and in the status', async (t) => {
  const page = await open(t, { providers: 'all', delay: '200' });
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('denied');
      },
    });
    return true;
  });
  await addCodex(page);
  await click(page, 'settings', `${step} [data-action=copy-sign-in-code]`);
  await page.until((step) => window.signIn('settings', step).copyText === 'Couldn’t copy', step);
  assert.deepEqual(
    await page.evaluate(
      (step) => [
        window.signIn('settings', step).copy,
        window.settingsPart(`${step} [data-sign-in] [role=status]`).textContent,
      ],
      step
    ),
    ['Couldn’t copy', 'Couldn’t copy']
  );
  assert.deepEqual(page.errors, []);
});

test('a lookalike host shows no link: the warning and the full address as text, and the code stays', async (t) => {
  const page = await open(t, { login: 'lookalike', delay: '200' });
  await codexRow(page);
  assert.deepEqual(
    await page.evaluate((codex) => {
      const parts = window.signIn('settings', codex);
      const block = window.settingsPart(`${codex} [data-sign-in]`);
      return {
        ...parts,
        anchors: block.querySelectorAll('a').length,
        icon: !!block.querySelector('[data-id=sign-in-unknown] swc-icon-alert-triangle'),
        selectable: getComputedStyle(block.querySelector('[data-id=sign-in-url]')).userSelect,
        copies: block.querySelectorAll('[data-action^=copy]').length,
      };
    }, codex),
    {
      shown: true,
      lead: 'Enter this code on the sign-in page:',
      code: 'WDJB-MJHT',
      mono: true,
      select: 'all',
      copy: 'Copy the code',
      copyText: 'Copy',
      quiet: true,
      link: null,
      unknown,
      url: 'https://auth.openai.com.example.net/device',
      anchors: 0,
      icon: true,
      selectable: 'text',
      copies: 1,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('a javascript: sign-in page renders no link, only text', async (t) => {
  const page = await open(t, { delay: '200' });
  await page.evaluate(() => {
    const port = window.model.settings;
    const accounts = port.accounts.bind(port);
    port.accounts = () =>
      accounts().map((account) =>
        account.status === 'signing-in'
          ? { ...account, signIn: { url: 'javascript:alert(1)', code: 'ZXCV-BNMQ' } }
          : account
      );
    return true;
  });
  await settings(page);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=connect]');
  await page.until((row) => window.signIn('settings', row).code === 'ZXCV-BNMQ', row);
  assert.deepEqual(
    await page.evaluate((row) => {
      const parts = window.signIn('settings', row);
      return [
        parts.link,
        parts.unknown,
        parts.url,
        window.settingsPart(`${row} [data-sign-in]`).querySelectorAll('a').length,
      ];
    }, row),
    [null, unknown, 'javascript:alert(1)', 0]
  );
  assert.deepEqual(page.errors, []);
});

test('without a signIn, a signing-in row shows no code and no link', async (t) => {
  const page = await open(t, { delay: '200' });
  await settings(page);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=connect]');
  await page.until(
    () =>
      window.settingsPart('.account[data-id=ai-adobe] swc-status-light')?.textContent ===
      'Signing in…'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.settingsPart('[data-sign-in]'),
      !!window.settingsPart(`.accounts .account[data-id=ai-adobe] + .notes`),
    ]),
    [false, false]
  );
  assert.deepEqual(page.errors, []);
});

test('adding a device-code provider shows its code and its known sign-in link in the picker until it is connected', async (t) => {
  const page = await open(t, { providers: 'all' });
  await addCodex(page);
  assert.deepEqual(
    await page.evaluate((step) => {
      const parts = window.signIn('settings', step);
      return [
        window.settingsPart('dialog.picker [data-signing]').textContent,
        parts.code,
        parts.link,
        parts.unknown,
        !!window.settingsPart('dialog.picker [data-action=cancel-sign-in]'),
        !!window.settingsPart('.accounts .account[data-id=openai-codex] + .notes [data-sign-in]'),
      ];
    }, step),
    ['Continue in the sign-in window that opened.', 'WDJB-MJHT', known, null, true, false]
  );
  await click(page, 'settings', 'dialog.picker [data-action=copy-sign-in-code]');
  await page.until(() => window.copies.length === 1);
  assert.deepEqual(await page.evaluate(() => window.copies), ['WDJB-MJHT']);
  await page.until(() => !window.settingsPart('dialog.picker'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.settings.accounts().find((account) => account.id === 'openai-codex').status,
      !!window.settingsPart('[data-sign-in]'),
    ]),
    ['connected', false]
  );
  assert.deepEqual(page.errors, []);
});

const card = '.error-card[data-id="k-s3"]';

async function chatLogin(page) {
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until((card) => !!window.chatPart(`${card} [data-action=login]`), card);
  await page.evaluate((card) => {
    window.chatPart(card).scrollIntoView({ block: 'center' });
    return true;
  }, card);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await click(page, 'chat', `${card} [data-action=login]`);
  await page.until((card) => window.signIn('chat', card).shown, card);
}

test('the expired-session card shows the device code and its known sign-in link while signing in, and drops them once connected', async (t) => {
  const page = await open(t, { login: 'code' });
  await chatLogin(page);
  assert.equal(await page.evaluate(() => window.model.settings.connects.at(-1).id), 'openai-codex');
  assert.deepEqual(await page.evaluate((card) => window.signIn('chat', card), card), {
    shown: true,
    lead: 'Enter this code on the sign-in page:',
    code: 'WDJB-MJHT',
    mono: true,
    select: 'all',
    copy: 'Copy the code',
    copyText: 'Copy',
    quiet: true,
    link: known,
    unknown: null,
    url: null,
  });
  assert.equal(
    await page.evaluate((card) => window.chatPart(`${card} .detail`).textContent, card),
    'Continue in the sign-in window that opened.'
  );
  await click(page, 'chat', `${card} [data-action=copy-sign-in-code]`);
  await page.until((card) => window.signIn('chat', card).copyText === 'Copied', card);
  assert.deepEqual(await page.evaluate(() => window.copies), ['WDJB-MJHT']);
  await page.until((card) => window.chatPart(card)?.dataset.login === 'connected', card);
  assert.equal(
    await page.evaluate((card) => !!window.chatPart(`${card} [data-sign-in]`), card),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('the expired-session card shows a lookalike sign-in page as text with the warning, and no link', async (t) => {
  const page = await open(t, { login: 'lookalike', delay: '200' });
  await chatLogin(page);
  assert.deepEqual(
    await page.evaluate((card) => {
      const parts = window.signIn('chat', card);
      return [
        parts.code,
        parts.link,
        parts.unknown,
        parts.url,
        window.chatPart(`${card} [data-sign-in]`).querySelectorAll('a').length,
      ];
    }, card),
    ['WDJB-MJHT', null, unknown, 'https://auth.openai.com.example.net/device', 0]
  );
  assert.deepEqual(page.errors, []);
});

async function dualPage(t, params = {}) {
  const page = await open(t, { accounts: 'dual', vault: 'secrets', delay: '20', ...params });
  await page.evaluate(() => {
    window.calls = [];
    const port = window.model.settings;
    const connect = port.connect.bind(port);
    window.held = null;
    port.connect = (...args) => {
      if (window.hold && args[3]?.method === 'key') {
        window.calls.push({ call: 'held', options: args[3] });
        return new Promise((resolve, reject) => {
          window.held = () => connect(...args).then(resolve, reject);
        });
      }
      window.calls.push({
        call: 'connect',
        args: args.length,
        id: args[0],
        options: args[3] ?? null,
        active: navigator.userActivation.isActive,
      });
      return connect(...args);
    };
    const vault = window.model.vault;
    const put = vault.put.bind(vault);
    vault.put = (...args) => {
      window.calls.push({ call: 'put', name: args[0] });
      return put(...args);
    };
    return true;
  });
  await settings(page);
  await page.until(() => !!window.settingsPart('.account[data-id=lumen] [data-action=connect]'));
  return page;
}

test('a dual account signs in with method sign-in inside the click', async (t) => {
  const page = await dualPage(t);
  assert.deepEqual(
    await page.evaluate(() => [
      window.settingsPart('.account[data-id=lumen] [data-action=connect]').textContent.trim(),
      window
        .settingsPart('.account[data-id=lumen] + .notes [data-action=use-key]')
        .textContent.trim(),
    ]),
    ['Sign in', 'Use an API key instead']
  );
  await click(page, 'settings', '.account[data-id=lumen] [data-action=connect]');
  await page.until(() => window.calls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.calls), [
    { call: 'connect', args: 4, id: 'lumen', options: { method: 'sign-in' }, active: true },
  ]);
  await page.until(
    () =>
      window.settingsPart('.account[data-id=lumen] swc-status-light')?.textContent === 'Connected'
  );
  assert.deepEqual(page.errors, []);
});

test('a dual account takes a key: vault.put first, then connect with method key', async (t) => {
  const page = await dualPage(t);
  await click(page, 'settings', '.account[data-id=lumen] + .notes [data-action=use-key]');
  await page.until(
    () =>
      window.settingsPart('form.key[data-id=lumen] input[data-field=value]') ===
      window.inner().activeElement
  );
  assert.equal(
    await page.evaluate(() =>
      window.settingsPart('form.key[data-id=lumen] [data-action=get-key]').getAttribute('href')
    ),
    'https://console.lumen.example/keys'
  );
  await click(page, 'settings', 'form.key[data-id=lumen] + .notes [data-action=use-sign-in]');
  await page.until(
    () =>
      !window.settingsPart('form.key[data-id=lumen]') &&
      window.inner().activeElement ===
        window.settingsPart('.account[data-id=lumen] [data-action=connect]')
  );
  await click(page, 'settings', '.account[data-id=lumen] + .notes [data-action=use-key]');
  await page.until(
    () =>
      window.settingsPart('form.key[data-id=lumen] input[data-field=value]') ===
      window.inner().activeElement
  );
  await page.type('lumen-sample-0042');
  await page.press('Enter');
  await page.until(
    () =>
      window.settingsPart('.account[data-id=lumen] swc-status-light')?.textContent === 'Connected'
  );
  assert.deepEqual(await page.evaluate(() => window.calls), [
    { call: 'put', name: 'LUMEN_API_KEY' },
    { call: 'connect', args: 4, id: 'lumen', options: { method: 'key' }, active: true },
  ]);
  const record = () =>
    window.model.vault.list().secrets.find((secret) => secret.name === 'LUMEN_API_KEY')?.state;
  assert.notEqual(await page.evaluate(record), 'removed');
  await click(page, 'settings', '.account[data-id=lumen] [data-action=disconnect]');
  await page.until(() => !!window.deep('slicc-confirm'));
  await page.evaluate(() => {
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-action]').click();
    return true;
  });
  await page.until(
    () =>
      window.settingsPart('.account[data-id=lumen] swc-status-light')?.textContent ===
      'Not connected'
  );
  assert.equal(await page.evaluate(record), 'removed');
  assert.deepEqual(page.errors, []);
});

test('a dual account never reads Signing in while its key connect is pending', async (t) => {
  const page = await dualPage(t);
  await page.evaluate(() => {
    window.hold = true;
    return true;
  });
  await click(page, 'settings', '.account[data-id=lumen] + .notes [data-action=use-key]');
  await page.until(
    () =>
      window.settingsPart('form.key[data-id=lumen] input[data-field=value]') ===
      window.inner().activeElement
  );
  await page.type('lumen-sample-0042');
  await page.press('Enter');
  await page.until(() => typeof window.held === 'function');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.settingsPart('.account[data-id=lumen]');
      return [
        row.querySelector('swc-status-light').textContent,
        row.querySelector('[data-action=connect]')?.hasAttribute('pending') ?? false,
        !!window.settingsPart('[data-signing]'),
        !!window.settingsPart('.account[data-id=lumen] [data-action=cancel-sign-in]'),
        window.settingsPart('form.key[data-id=lumen] [data-action=save]').hasAttribute('pending'),
      ];
    }),
    ['Not connected', false, false, false, true]
  );
  await page.evaluate(() => {
    window.held();
    return true;
  });
  await page.until(
    () =>
      window.settingsPart('.account[data-id=lumen] swc-status-light')?.textContent === 'Connected'
  );
  assert.deepEqual(page.errors, []);
});

test('accounts that are not dual call connect without options', async (t) => {
  const page = await dualPage(t);
  await click(page, 'settings', '.account[data-id=ai-adobe] [data-action=connect]');
  await page.until(() => window.calls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.calls), [
    { call: 'connect', args: 1, id: 'ai-adobe', options: null, active: true },
  ]);
  assert.equal(
    await page.evaluate(
      () => !!window.settingsPart('.account[data-id=ai-adobe] + .notes [data-action=use-key]')
    ),
    false
  );
  assert.deepEqual(page.errors, []);
});
