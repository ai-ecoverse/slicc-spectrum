import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, query = {}) {
  return load(await chrome.page(t), query);
}

async function load(page, query = {}) {
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...query })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.panel = () => window.$('slicc-app', 'slicc-dock').content('support');
    window.part = (selector) => window.panel()?.shadowRoot.querySelector(selector);
    window.parts = (selector) => [...(window.panel()?.shadowRoot.querySelectorAll(selector) ?? [])];
    window.rail = () => window.$('slicc-app', '.rail [data-surface=support]');
    window.typeInto = async (selector, text) => {
      const field = window.part(selector);
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await window.panel().updateComplete;
    };
    return true;
  });
  return page;
}

async function show(page) {
  await page.evaluate(() => {
    window.app.show('support');
    return true;
  });
  await page.until(() => !!window.part('.bar[data-surface=support]'));
}

test('the Support panel is offered with a support port, and its rail button counts unread requests', async (t) => {
  const off = await open(t);
  assert.deepEqual(
    await off.evaluate(() => [
      !!window.rail(),
      window.app.dock.api.panels.some((panel) => panel.id === 'support'),
    ]),
    [false, false]
  );
  const offErrors = [...off.errors];
  const page = await load(off, { support: 'on' });
  await page.until(() => !!window.rail());
  assert.deepEqual(
    await page.evaluate(() => [
      window.rail().getAttribute('accessible-label'),
      window.rail().closest('.badged')?.querySelector('swc-badge')?.textContent.trim(),
      window.rail().closest('.badged')?.querySelector('swc-badge')?.getAttribute('variant'),
    ]),
    ['Open Support, 1 unread', '1', 'informative']
  );
  assert.deepEqual(offErrors, []);
  assert.deepEqual(page.errors, []);
});

test('Support asks for an explicit Adobe sign-in, shows the account and signs out to the sign-in card', async (t) => {
  const page = await open(t, { support: 'signed-out' });
  await page.until(() => !!window.rail());
  assert.equal(await page.evaluate(() => window.rail().closest('.badged')), null);
  await show(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-sign-in] h3').textContent,
      !!window.part('[data-action=new-request]'),
      window.parts('.row').length,
    ]),
    ['Get help from Adobe Support', false, 0]
  );
  await page.evaluate(() => {
    window.part('[data-action=sign-in]').click();
    return true;
  });
  await page.until(() => window.part('[data-action=sign-in]')?.hasAttribute('pending'));
  await page.until(() => window.parts('.row').length === 3);
  assert.equal(
    await page.evaluate(() => window.part('[data-account] .who').textContent),
    'Signed in as Mara Lind, Paper Mill'
  );
  await page.until(() => window.rail().closest('.badged')?.textContent.trim() === '1');
  await page.evaluate(async () => {
    window.part('.row[data-id=sup-export] .head').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await window.typeInto('sp-textfield[name=reply]', 'A draft for Paper Mill');
    window.part('[data-action=back]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-action=sign-out]'));
  await page.evaluate(() => {
    window.part('[data-action=sign-out]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-sign-in]'));
  assert.equal(await page.evaluate(() => window.rail().closest('.badged')), null);
  await page.evaluate(() => {
    window.part('[data-action=sign-in]').click();
    return true;
  });
  await page.until(() => window.parts('.row').length === 3);
  await page.evaluate(() => {
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => !!window.part('sp-textfield[name=reply]'));
  assert.equal(await page.evaluate(() => window.part('sp-textfield[name=reply]').value), '');
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.support.calls.filter((call) => call[0].startsWith('sign')).map((call) => call[0])
    ),
    ['signIn', 'signOut', 'signIn']
  );
  assert.deepEqual(page.errors, []);
});

test('a failed sign-in says why and can be tried again', async (t) => {
  const page = await open(t, { support: 'sign-in-fail' });
  await show(page);
  await page.evaluate(() => {
    window.part('[data-action=sign-in]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-error]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-error]').textContent.trim(),
      window.part('[data-action=sign-in]').hasAttribute('pending'),
    ]),
    ['The sign-in window was closed before it finished.', false]
  );
  assert.deepEqual(page.errors, []);
});

test('an account that is not enrolled says so for its organization and can switch accounts', async (t) => {
  const page = await open(t, { support: 'not-enrolled' });
  await page.until(() => !!window.rail());
  await show(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-empty=not-enrolled]').textContent,
      window.part('[data-account] .who').textContent,
      !!window.part('[data-action=new-request]'),
    ]),
    [
      'Support isn’t set up for Quay Labs yet. Ask your Adobe contact to add you, or sign in with another account.',
      'Signed in as Mara Lind, Quay Labs',
      false,
    ]
  );
  await page.evaluate(() => {
    window.part('[data-action=sign-out]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-action=sign-in]'));
  assert.deepEqual(page.errors, []);
});

test('requests list newest first with their marks, and opening one reads it and acknowledges the last message', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-channel]').textContent,
      window
        .parts('.row')
        .map((row) => [
          row.dataset.id,
          row.hasAttribute('data-unread'),
          row.hasAttribute('data-resolved'),
          [...row.querySelectorAll('swc-badge')].map((badge) => badge.textContent.trim()),
        ]),
    ]),
    [
      'Mill support',
      [
        ['sup-preview', true, false, ['1 unread']],
        ['sup-editor', false, true, ['Resolved']],
        ['sup-export', false, false, []],
      ],
    ]
  );
  await page.evaluate(() => {
    window.part('.row[data-id=sup-preview] .head').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 4);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-title]').textContent,
      window
        .parts('.message')
        .map((node) => [node.dataset.author, node.querySelector('.name').textContent]),
      window.part('.message[data-id=sup-preview-4] strong')?.textContent,
      window.part('[data-audience]').textContent.trim(),
    ]),
    [
      'Preview builds stop after the first page',
      [
        ['customer', 'Mara Lind'],
        ['support', 'Adobe Support'],
        ['customer', 'Ole Brandt'],
        ['support', 'Adobe Support'],
      ],
      'one more build',
      'Everyone approved at Paper Mill and Adobe Support can read this. Only what you write here is sent.',
    ]
  );
  await page.until(() => !window.rail().closest('.badged'));
  assert.deepEqual(
    await page.evaluate(() => window.model.support.calls.filter((call) => call[0] === 'read')),
    [['read', 'sup-preview', 'sup-preview-4']]
  );
  await page.evaluate(() => {
    window.part('[data-action=back]').click();
    return true;
  });
  await page.until(() => window.parts('.row').length === 3);
  assert.equal(
    await page.evaluate(() => window.part('.row[data-id=sup-preview]').hasAttribute('data-unread')),
    false
  );
  await page.evaluate(() => {
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 2);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('.message[data-id=sup-export-2] .deleted')?.textContent,
      window.model.support.calls.filter((call) => call[0] === 'read').length,
    ]),
    ['This message was deleted.', 1]
  );
  assert.deepEqual(page.errors, []);
});

test('a new request sends title, topic and description once, opens, and shows the reply that comes in', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.answerTicks = 20;
    window.part('[data-action=new-request]').click();
    return true;
  });
  await page.until(() => !!window.part('.form'));
  const disabled = () => window.part('.form [data-action=send]').hasAttribute('disabled');
  assert.equal(await page.evaluate(disabled), true);
  await page.evaluate(async () => {
    await window.typeInto('sp-textfield[name=title]', 'Search results miss new pages');
    return true;
  });
  assert.equal(await page.evaluate(disabled), true);
  await page.evaluate(async () => {
    await window.typeInto('sp-textfield[name=body]', 'Pages published today don’t show in search.');
    const picker = window.part('sp-picker[name=topic]');
    picker.value = 'builds';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await window.panel().updateComplete;
    return true;
  });
  assert.equal(await page.evaluate(disabled), false);
  assert.match(
    await page.evaluate(() => window.part('.form [data-audience]').textContent),
    /Everyone approved at Paper Mill and Adobe Support can read this/
  );
  await page.evaluate(() => {
    window.part('.form [data-action=send]').click();
    window.part('.form [data-action=send]').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 1);
  const created = await page.evaluate(() => [
    window.part('[data-title]').textContent,
    [...window.part('.message .body').children].map((node) => node.textContent),
    window.model.support.calls
      .filter((call) => call[0] === 'create')
      .map(([, key, ...rest]) => [typeof key, key.length > 8, ...rest]),
  ]);
  assert.deepEqual(created, [
    'Search results miss new pages',
    ['Builds and publishing', 'Pages published today don’t show in search.'],
    [
      [
        'string',
        true,
        'Search results miss new pages',
        'Pages published today don’t show in search.',
        'builds',
      ],
    ],
  ]);
  await page.until(() => window.parts('.message').length === 2);
  assert.equal(
    await page.evaluate(() => window.part('.message[data-author=support] .name').textContent),
    'Adobe Support'
  );
  await page.until(() =>
    window.model.support.calls.some((call) => call[0] === 'read' && call[1].startsWith('sup-new-'))
  );
  await page.until(() => window.model.support.unread() === 1);
  assert.equal(
    await page.evaluate(() => window.rail().getAttribute('accessible-label')),
    'Support, shown, 1 unread'
  );
  assert.deepEqual(page.errors, []);
});

test('a failed reply keeps the draft and its key, and editing the text after it gets a new key', async (t) => {
  const page = await open(t, { support: 'fail' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.answerTicks = null;
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => !!window.part('.composer'));
  await page.evaluate(async () => {
    await window.typeInto('sp-textfield[name=reply]', 'It still times out.');
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-error]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-error]').textContent.trim(),
      window.part('sp-textfield[name=reply]').value,
    ]),
    ['Support didn’t get that. Try again.', 'It still times out.']
  );
  await page.evaluate(() => {
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 3);
  await page.evaluate(async () => {
    await window.typeInto('sp-textfield[name=reply]', 'And one more.');
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 4);
  const replies = await page.evaluate(() =>
    window.model.support.calls.filter((call) => call[0] === 'reply').map((call) => call[1])
  );
  assert.equal(replies.length, 3);
  assert.equal(replies[0], replies[1]);
  assert.notEqual(replies[1], replies[2]);
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.part('[data-error]'),
      window.part('sp-textfield[name=reply]').value,
    ]),
    [false, '']
  );
  assert.deepEqual(page.errors, []);
});

test('support text renders as safe markdown, and an offline port keeps the last list with a note', async (t) => {
  const page = await open(t, { support: 'offline' });
  await show(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-offline]').textContent.trim(),
      window.parts('.row').length,
    ]),
    ['Support can’t be reached right now. These are the requests loaded last.', 3]
  );
  await page.evaluate(() => {
    window.model.support.answer(
      'sup-editor',
      'See <img src=x onerror="window.pwned=1"> and [this](javascript:window.pwned=2) or [docs](https://docs.example/a).'
    );
    window.part('.row[data-id=sup-editor] .head').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 3);
  assert.deepEqual(
    await page.evaluate(() => {
      const body = window.part('.message:last-child .body');
      return [
        body.querySelectorAll('img').length,
        [...body.querySelectorAll('a')].map((link) => link.getAttribute('href')),
        window.pwned ?? null,
      ];
    }),
    [0, ['https://docs.example/a'], null]
  );
  assert.deepEqual(page.errors, []);
});

test('the Support panel in light and dark', async (t) => {
  const page = await chrome.page(t);
  for (const color of ['light', 'dark']) {
    await load(page, { support: 'on', color, delay: '0' });
    await show(page);
    await page.screenshot(new URL(`support-list-${color}.png`, page.dir));
    await page.evaluate(() => {
      window.model.support.setStatus({ state: 'signed-out' });
      return true;
    });
    await page.until(() => !!window.part('[data-sign-in]'));
    await page.screenshot(new URL(`support-sign-in-${color}.png`, page.dir));
    await page.evaluate(() => {
      window.model.support.arrive();
      return true;
    });
    await page.until(() => window.parts('.row').length === 3);
    await page.evaluate(() => {
      window.part('.row[data-id=sup-preview] .head').click();
      return true;
    });
    await page.until(() => window.parts('.message').length === 4);
    await page.screenshot(new URL(`support-thread-${color}.png`, page.dir));
    await page.evaluate(() => {
      window.part('[data-action=back]').click();
      return true;
    });
    await page.until(() => !!window.part('[data-action=new-request]'));
    await page.evaluate(() => {
      window.part('[data-action=new-request]').click();
      return true;
    });
    await page.until(() => !!window.part('.form'));
    await page.screenshot(new URL(`support-new-${color}.png`, page.dir));
    assert.deepEqual(page.errors, []);
  }
});
