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
    window.header = () => window.$('slicc-app', 'header [data-surface=support]');
    window.badge = () => window.header()?.closest('.badged')?.querySelector('swc-badge') ?? null;
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

test('Support opens from a header button next to Settings that counts unread requests, not from the rails', async (t) => {
  const off = await open(t);
  assert.deepEqual(
    await off.evaluate(() => [
      !!window.header(),
      !!window.$('slicc-app', '[data-surface=support]'),
      window.app.dock.api.panels.some((panel) => panel.id === 'support'),
    ]),
    [false, false, false]
  );
  const offErrors = [...off.errors];
  const page = await load(off, { support: 'on' });
  await page.until(() => !!window.header());
  assert.deepEqual(
    await page.evaluate(() => {
      const header = window.header();
      const next = header.closest('.badged').nextElementSibling;
      const settings = window.$('slicc-app', 'header #settings');
      const view = [
        ...window.$('slicc-app', 'header sp-action-menu').querySelectorAll('sp-menu-item'),
      ];
      return [
        header.id,
        header.getAttribute('accessible-label'),
        !!header.querySelector('swc-icon-help-circle'),
        window.badge()?.textContent.trim(),
        window.badge()?.getAttribute('variant'),
        next.tagName === 'SWC-TOOLTIP' && next.textContent,
        !!(
          header.closest('.badged').compareDocumentPosition(settings) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
        view.some((item) => item.value === 'support'),
        !!window.app.shadowRoot.querySelector('.rail [data-surface=support]'),
      ];
    }),
    [
      'support',
      'Support, 1 unread',
      true,
      '1',
      'informative',
      'Support, 1 unread',
      true,
      true,
      false,
    ]
  );
  await page.evaluate(() => {
    window.header().click();
    return true;
  });
  await page.until(() => !!window.part('.bar[data-surface=support]'));
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.until(() => window.app.getAttribute('screen') === 'phone');
  await page.until(() => !!window.app.shadowRoot.querySelector('.rail.bottom sp-action-menu'));
  assert.deepEqual(
    await page.evaluate(() => {
      const more = window.app.shadowRoot.querySelector('.rail.bottom sp-action-menu');
      return [
        [...more.querySelectorAll('sp-menu-item')].some((item) => item.value === 'support'),
        /unread/.test(more.getAttribute('label')),
        !!window.app.shadowRoot.querySelector('.rail [data-surface=support]'),
        window.header().getAttribute('accessible-label'),
      ];
    }),
    [false, false, false, 'Support, 1 unread']
  );
  assert.deepEqual(offErrors, []);
  assert.deepEqual(page.errors, []);
});

test('Support asks for an explicit Adobe sign-in, shows the account and signs out to the sign-in card', async (t) => {
  const page = await open(t, { support: 'signed-out' });
  await page.until(() => !!window.header());
  assert.equal(await page.evaluate(() => window.badge()), null);
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
  await page.until(() => window.badge()?.textContent.trim() === '1');
  await page.evaluate(async () => {
    window.part('.row[data-id=sup-export] .head').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await window.typeInto('textarea[name=reply]', 'A draft for Paper Mill');
    window.part('[data-action=back]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-action=sign-out]'));
  await page.evaluate(() => {
    window.part('[data-action=sign-out]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-sign-in]'));
  assert.equal(await page.evaluate(() => window.badge()), null);
  await page.evaluate(() => {
    window.part('[data-action=sign-in]').click();
    return true;
  });
  await page.until(() => window.parts('.row').length === 3);
  await page.evaluate(() => {
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => !!window.part('textarea[name=reply]'));
  assert.equal(await page.evaluate(() => window.part('textarea[name=reply]').value), '');
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
  await page.until(() => !!window.header());
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

async function openRequest(page, id, count) {
  await page.evaluate((id) => {
    window.part(`.row[data-id=${id}] .head`).click();
    return true;
  }, id);
  await page.until((count) => window.parts('.message').length === count, count);
}

test('an account switch signalled only through threads leaves the open request for the list', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await openRequest(page, 'sup-preview', 4);
  await page.evaluate(() => {
    const port = window.model.support;
    const other = {
      state: 'ready',
      identity: 'Ole Brandt',
      org: 'Quay Labs',
      channel: 'Quay support',
    };
    port.status = () => other;
    port.threads = () => [];
    port.emit('threads', []);
    return true;
  });
  await page.until(() => !!window.part('[data-empty=none]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.parts('.message').length,
      !!window.part('.composer'),
      window.part('[data-account] .who').textContent,
    ]),
    [0, false, 'Signed in as Ole Brandt, Quay Labs']
  );
  assert.deepEqual(page.errors, []);
});

test('losing enrollment with a request open shows the not-enrolled note instead', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await openRequest(page, 'sup-preview', 4);
  await page.evaluate(() => {
    const { identity, org } = window.model.support.status();
    window.model.support.setStatus({ state: 'not-enrolled', identity, org });
    return true;
  });
  await page.until(() => !!window.part('[data-empty=not-enrolled]'));
  assert.deepEqual(
    await page.evaluate(() => [window.parts('.message').length, !!window.part('.composer')]),
    [0, false]
  );
  assert.deepEqual(page.errors, []);
});

test('a failed sign-out says why in the list', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.signOut = () =>
      Promise.reject(new Error('Adobe didn’t end the session. Try again.'));
    window.part('[data-action=sign-out]').click();
    return true;
  });
  await page.until(() => !!window.part('.banner [data-error]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('.banner [data-error]').textContent.trim(),
      window.parts('.row').length,
    ]),
    ['Adobe didn’t end the session. Try again.', 3]
  );
  assert.deepEqual(page.errors, []);
});

test('a sign-in while the Support tab is hidden behind another tab shows its account when it comes back', async (t) => {
  const page = await open(t, { support: 'signed-out' });
  await show(page);
  await page.until(() => !!window.part('[data-sign-in]'));
  await page.evaluate(() => {
    window.app.show('changes');
    return true;
  });
  await page.until(() => !window.panel()?.isConnected);
  await page.evaluate(() => {
    window.model.support.arrive();
    return true;
  });
  await show(page);
  await page.until(() => window.parts('.row').length === 3);
  assert.equal(
    await page.evaluate(() => window.part('[data-account] .who')?.textContent ?? null),
    'Signed in as Mara Lind, Paper Mill'
  );
  assert.deepEqual(page.errors, []);
});

test('a request stays open across closing the panel, unless the account changed meanwhile', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await openRequest(page, 'sup-preview', 4);
  const reopen = async () => {
    await page.evaluate(() => {
      window.app.dock.close('support');
      return true;
    });
    await page.until(() => !window.app.dock.has('support'));
  };
  await reopen();
  await show(page);
  await page.until(() => window.parts('.message').length === 4);
  await reopen();
  await page.evaluate(() => {
    window.model.support.setStatus({
      ...window.model.support.status(),
      identity: 'Ole Brandt',
      org: 'Quay Labs',
    });
    return true;
  });
  await show(page);
  await page.until(() => window.parts('.row').length === 3);
  assert.deepEqual(
    await page.evaluate(() => [
      window.parts('.message').length,
      window.part('[data-account] .who').textContent,
    ]),
    [0, 'Signed in as Ole Brandt, Quay Labs']
  );
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
  await page.until(() => !window.badge());
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

test('a request that loads after the panel closed is not acknowledged until it shows', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    const port = window.model.support;
    const thread = port.thread.bind(port);
    port.thread = (id) =>
      new Promise((resolve) => {
        window.finish = () => {
          const done = thread(id);
          resolve(done);
          return done;
        };
      });
    window.part('.row[data-id=sup-preview] .head').click();
    return true;
  });
  await page.until(() => typeof window.finish === 'function');
  await page.evaluate(() => {
    window.app.dock.close('support');
    return true;
  });
  await page.until(() => !window.app.dock.has('support'));
  await page.evaluate(async () => {
    delete window.model.support.thread;
    await window.finish();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return true;
  });
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.support.calls.filter((call) => call[0] === 'read'),
      window.model.support.unread(),
      window.badge()?.textContent.trim(),
    ]),
    [[], 1, '1']
  );
  await show(page);
  await page.until(() => window.parts('.message').length === 4);
  await page.until(() => !window.badge());
  assert.deepEqual(
    await page.evaluate(() => window.model.support.calls.filter((call) => call[0] === 'read')),
    [['read', 'sup-preview', 'sup-preview-4']]
  );
  assert.deepEqual(page.errors, []);
});

test('a new request is one message: the first line becomes the title, it reads once, opens, and shows the reply that comes in', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.answerTicks = 20;
    window.part('[data-action=new-request]').click();
    return true;
  });
  await page.until(() => !!window.part('.form'));
  const disabled = () => window.part('.form [data-action=send]').hasAttribute('disabled');
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.part('[name=title]'),
      window.part('textarea[name=message]').getAttribute('aria-label'),
      window.part('#hint').textContent,
      !!window.part('[data-derived-title]'),
      window.part('.form [data-action=send]').hasAttribute('disabled'),
      !!window.part('.form [data-action=send] swc-icon-send'),
    ]),
    [
      false,
      'Message',
      'The first line is the title. Ctrl+Enter sends, Enter adds a new line. Markdown works.',
      false,
      true,
      true,
    ]
  );
  await page.evaluate(async () => {
    const picker = window.part('sp-picker[name=topic]');
    picker.value = 'builds';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await window.panel().updateComplete;
    window.part('textarea[name=message]').focus();
    return true;
  });
  await page.insert('Search results miss new pages');
  await page.press('Enter');
  await page.insert('Pages published today don’t show in search.');
  await page.until(() => !!window.part('[data-derived-title]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('textarea[name=message]').value,
      window.part('[data-derived-title] span').textContent,
      window.model.support.calls.filter((call) => call[0] === 'create').length,
    ]),
    [
      'Search results miss new pages\nPages published today don’t show in search.',
      'Search results miss new pages',
      0,
    ]
  );
  assert.equal(await page.evaluate(disabled), false);
  assert.match(
    await page.evaluate(() => window.part('.form [data-audience]').textContent),
    /Everyone approved at Paper Mill and Adobe Support can read this/
  );
  await page.press('Enter', 'ctrl');
  await page.evaluate(() => {
    window.part('.form [data-action=send]')?.click();
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
    [
      'Search results miss new pages',
      'Builds and publishing',
      'Pages published today don’t show in search.',
    ],
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
  await page.evaluate(() => {
    window.part('[data-action=back]').click();
    return true;
  });
  await page.until(() => window.parts('.row').length === 4);
  assert.equal(
    await page.evaluate(() => window.part('.row .title').textContent),
    'Search results miss new pages'
  );
  await page.until(() => window.model.support.unread() === 1);
  await page.until(() => window.header().getAttribute('accessible-label') === 'Support, 1 unread');
  assert.deepEqual(page.errors, []);
});

test('a one-line request and a request with a long first line each read once', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  const send = async (text) => {
    await page.evaluate(async (text) => {
      window.model.support.answerTicks = null;
      window.part('[data-action=new-request]').click();
      await window.panel().updateComplete;
      await window.typeInto('textarea[name=message]', text);
      window.part('.form [data-action=send]').click();
      return true;
    }, text);
    await page.until(() => window.parts('.message').length === 1);
    const read = await page.evaluate(() => [
      window.part('[data-title]').textContent,
      window.part('.message .body').innerText,
      window.model.support.calls
        .filter((call) => call[0] === 'create')
        .at(-1)
        .slice(2, 4),
    ]);
    await page.evaluate(() => {
      window.part('[data-action=back]').click();
      return true;
    });
    await page.until(() => !!window.part('[data-action=new-request]'));
    return read;
  };
  assert.deepEqual(await send('Exports time out.'), [
    'Exports time out.',
    'Exports time out.',
    ['Exports time out.', 'Exports time out.'],
  ]);
  const line =
    'Since this morning every preview build on the docs site stops after the first page, and the publish step still reports success for all of them';
  const [title, body, sent] = await send(`${line}\nIt started after the 9:00 deploy.`);
  assert.equal(
    title,
    'Since this morning every preview build on the docs site stops after the first page, and the publish step still reports…'
  );
  assert.ok(title.length <= 120);
  assert.deepEqual(sent, [title, '…success for all of them\nIt started after the 9:00 deploy.']);
  assert.equal(body.split('Since this morning').length, 2);
  assert.match(
    body.replace(/\s+/g, ' '),
    /still reports… …success for all of them It started after the 9:00 deploy\.$/
  );
  assert.deepEqual(page.errors, []);
});

test('a reply sends on Enter, Shift+Enter adds a line, and the editor formats, previews and counts', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.answerTicks = null;
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => !!window.part('textarea[name=reply]'));
  assert.equal(
    await page.evaluate(() => window.part('#hint').textContent),
    'Enter sends, Shift+Enter adds a new line. Markdown works.'
  );
  await page.evaluate(() => {
    window.part('textarea[name=reply]').focus();
    return true;
  });
  await page.insert('It still times out');
  await page.press('Enter', 'shift');
  await page.insert('on April too');
  await page.evaluate(() => {
    window.part('textarea[name=reply]').setSelectionRange(22, 27);
    window.part('[data-format=bold]').click();
    return true;
  });
  await page.until(() => window.part('textarea[name=reply]').value.includes('**April**'));
  await page.press('i', 'ctrl');
  assert.deepEqual(
    await page.evaluate(() => {
      const area = window.part('textarea[name=reply]');
      return [area.value, window.panel().shadowRoot.activeElement === area];
    }),
    ['It still times out\non **_April_** too', true]
  );
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'It still times out\non **April** too');
    window.part('[data-action=preview]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-preview] strong'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-preview] strong').textContent,
      !!window.part('textarea[name=reply]'),
      window.part('[data-action=preview]').getAttribute('aria-pressed'),
      window.part('[data-format=bold]').hasAttribute('disabled'),
    ]),
    ['April', false, 'true', true]
  );
  await page.evaluate(() => {
    window.part('[data-action=preview]').click();
    return true;
  });
  await page.until(() => !!window.part('textarea[name=reply]'));
  await page.evaluate(() => {
    const area = window.part('textarea[name=reply]');
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return true;
  });
  await page.press('Enter');
  await page.until(() => window.parts('.message').length === 3);
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.support.calls.filter((call) => call[0] === 'reply').map((call) => call[3]),
      window.part('.message:last-child .body strong').textContent,
      window.part('textarea[name=reply]').value,
    ]),
    [['It still times out\non **April** too'], 'April', '']
  );
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'x'.repeat(1799));
    return true;
  });
  assert.equal(await page.evaluate(() => window.part('[data-count]')), null);
  await page.evaluate(() => {
    window.part('textarea[name=reply]').focus();
    return true;
  });
  await page.insert('yz');
  await page.until(() => !!window.part('[data-count]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-count]').textContent,
      window.part('textarea[name=reply]').maxLength,
    ]),
    ['1,801 / 2,000', 2000]
  );
  await page.insert('z'.repeat(300));
  await page.until(() => window.part('[data-count]')?.hasAttribute('data-full'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('textarea[name=reply]').value.length,
      window.part('[data-count]').textContent,
      window.part('.composer [data-action=send]').hasAttribute('disabled'),
    ]),
    [2000, '2,000 / 2,000', false]
  );
  assert.deepEqual(page.errors, []);
});

test('drafts stay with their request across requests and closing the panel', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await openRequest(page, 'sup-export', 2);
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'Draft for the export');
    window.part('[data-action=back]').click();
    return true;
  });
  await openRequest(page, 'sup-preview', 4);
  assert.equal(await page.evaluate(() => window.part('textarea[name=reply]').value), '');
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'Draft for the preview');
    window.part('[data-action=back]').click();
    await window.panel().updateComplete;
    window.part('[data-action=new-request]').click();
    await window.panel().updateComplete;
    await window.typeInto('textarea[name=message]', 'A new request in the works');
    window.app.dock.close('support');
    return true;
  });
  await page.until(() => !window.app.dock.has('support'));
  await show(page);
  await page.until(() => !!window.part('textarea[name=message]'));
  assert.equal(
    await page.evaluate(() => window.part('textarea[name=message]').value),
    'A new request in the works'
  );
  await page.evaluate(() => {
    window.part('[data-action=cancel]').click();
    return true;
  });
  await openRequest(page, 'sup-export', 2);
  assert.equal(
    await page.evaluate(() => window.part('textarea[name=reply]').value),
    'Draft for the export'
  );
  await page.evaluate(() => {
    window.part('[data-action=back]').click();
    return true;
  });
  await openRequest(page, 'sup-preview', 4);
  assert.equal(
    await page.evaluate(() => window.part('textarea[name=reply]').value),
    'Draft for the preview'
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.support.calls.filter((call) => call[0] === 'reply' || call[0] === 'create')
    ),
    []
  );
  assert.deepEqual(page.errors, []);
});

test('a not-enrolled account shows its pending or declined access request', async (t) => {
  const page = await open(t, { support: 'pending' });
  await show(page);
  await page.until(() => !!window.part('[data-empty=not-enrolled]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const card = window.part('[data-empty=not-enrolled]');
      return [
        card.dataset.request,
        card.querySelector('.state').textContent.trim(),
        card.querySelector('.more').textContent,
        !!card.querySelector('[data-reason]'),
        !!window.part('[data-action=new-request]'),
        window.part('[data-account] .who').textContent,
      ];
    }),
    [
      'pending',
      'Your request is waiting for approval',
      'Adobe is reviewing your request for Quay Labs. You can start once it’s approved, or sign in with another account.',
      false,
      false,
      'Signed in as Mara Lind, Quay Labs',
    ]
  );
  await page.screenshot(new URL('support-pending-light.png', page.dir));
  await load(page, { support: 'declined', color: 'dark' });
  await show(page);
  await page.until(() => !!window.part('[data-empty=not-enrolled]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const card = window.part('[data-empty=not-enrolled]');
      return [
        card.dataset.request,
        card.querySelector('.state').textContent.trim(),
        card.querySelector('[data-reason]').textContent,
      ];
    }),
    [
      'declined',
      'Your request was declined',
      'We only open Support to the people your admin named. Ask Ilse Varga to add you.',
    ]
  );
  await page.screenshot(new URL('support-declined-dark.png', page.dir));
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
    await window.typeInto('textarea[name=reply]', 'It still times out.');
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => !!window.part('[data-error]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-error]').textContent.trim(),
      window.part('textarea[name=reply]').value,
    ]),
    ['Support didn’t get that. Try again.', 'It still times out.']
  );
  await page.evaluate(() => {
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 3);
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'And one more.');
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
      window.part('textarea[name=reply]').value,
    ]),
    [false, '']
  );
  assert.deepEqual(page.errors, []);
});

test('text typed while a reply sends stays in the field and goes out with a new key', async (t) => {
  const page = await open(t, { support: 'on' });
  await show(page);
  await page.evaluate(() => {
    window.model.support.answerTicks = null;
    window.part('.row[data-id=sup-export] .head').click();
    return true;
  });
  await page.until(() => !!window.part('.composer'));
  await page.evaluate(async () => {
    const port = window.model.support;
    const reply = port.reply.bind(port);
    port.reply = (draft) =>
      new Promise((resolve) => {
        window.finish = () => {
          const done = reply(draft);
          resolve(done);
          return done;
        };
      });
    await window.typeInto('textarea[name=reply]', 'It still times out.');
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(
    () =>
      typeof window.finish === 'function' &&
      window.part('.composer [data-action=send]').hasAttribute('pending')
  );
  assert.equal(
    await page.evaluate(() => window.part('textarea[name=reply]').hasAttribute('disabled')),
    false
  );
  await page.evaluate(async () => {
    await window.typeInto('textarea[name=reply]', 'It still times out, and so does April.');
    delete window.model.support.reply;
    await window.finish();
    return true;
  });
  await page.until(() => window.parts('.message').length === 3);
  await page.until(() => !window.part('.composer [data-action=send]').hasAttribute('pending'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('.message:last-child .body').textContent.trim(),
      window.part('textarea[name=reply]').value,
      window.part('.composer [data-action=send]').hasAttribute('disabled'),
    ]),
    ['It still times out.', 'It still times out, and so does April.', false]
  );
  await page.evaluate(() => {
    window.part('.composer [data-action=send]').click();
    return true;
  });
  await page.until(() => window.parts('.message').length === 4);
  const replies = await page.evaluate(() =>
    window.model.support.calls.filter((call) => call[0] === 'reply').map((call) => call.slice(1))
  );
  assert.deepEqual(
    replies.map(([, thread, body]) => [thread, body]),
    [
      ['sup-export', 'It still times out.'],
      ['sup-export', 'It still times out, and so does April.'],
    ]
  );
  assert.notEqual(replies[0][0], replies[1][0]);
  await page.until(() => window.part('textarea[name=reply]').value === '');
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

for (const [screen, metrics] of [
  ['desktop', { width: 1280, height: 800, mobile: false }],
  ['phone', { width: 390, height: 844, mobile: true }],
]) {
  test(`the Support panel in light and dark on a ${screen}`, async (t) => {
    const page = await chrome.page(t);
    await page.send('Emulation.setDeviceMetricsOverride', { ...metrics, deviceScaleFactor: 2 });
    t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
    for (const color of ['light', 'dark']) {
      await load(page, { support: 'on', color, delay: '0' });
      await show(page);
      await page.until(() => window.parts('.row').length === 3);
      await page.screenshot(new URL(`support-list-${screen}-${color}.png`, page.dir));
      await page.evaluate(() => {
        window.model.support.setStatus({ state: 'signed-out' });
        return true;
      });
      await page.until(() => !!window.part('[data-sign-in]'));
      await page.screenshot(new URL(`support-sign-in-${screen}-${color}.png`, page.dir));
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
      await page.evaluate(async () => {
        await window.typeInto(
          'textarea[name=reply]',
          'It works again, **thanks**. The last build finished in 40 seconds.'
        );
        return true;
      });
      await page.screenshot(new URL(`support-thread-${screen}-${color}.png`, page.dir));
      await page.evaluate(() => {
        window.part('[data-action=back]').click();
        return true;
      });
      await page.until(() => !!window.part('[data-action=new-request]'));
      await page.evaluate(async () => {
        window.part('[data-action=new-request]').click();
        await window.panel().updateComplete;
        await window.typeInto(
          'textarea[name=message]',
          'Search results miss pages published today\n\nPages we publish show up in **preview** right away, but `/search` only finds them the next morning.\n\n- Site: docs\n- Since: Monday'
        );
        return true;
      });
      await page.until(() => !!window.part('[data-derived-title]'));
      await page.screenshot(new URL(`support-new-${screen}-${color}.png`, page.dir));
      assert.deepEqual(page.errors, []);
    }
  });
}
