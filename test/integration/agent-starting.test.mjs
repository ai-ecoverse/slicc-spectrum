import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const line = 'Seven is installing its agent.';

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent: 'waiting', ...params })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.chat = () =>
      window.app.dock.content('chat:cone-sliccy')?.shadowRoot ??
      window.app.dock.content('chat')?.shadowRoot ??
      null;
    window.composer = () => window.chat()?.querySelector('slicc-composer')?.shadowRoot ?? null;
    window.field = () =>
      window.composer()?.querySelector('swc-prompt-field')?.shadowRoot?.querySelector('textarea');
    window.rows = () =>
      [...(window.composer()?.querySelectorAll('li.queued[data-mode=starting]') ?? [])].map(
        (row) => [
          row.querySelector('.text').textContent.trim(),
          row.querySelector('.next').textContent,
        ]
      );
    window.users = () =>
      window.model.agent
        .messages(window.model.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
    window.app.show('chat');
    return true;
  });
  await page.until(() => !!window.field());
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  return page;
}

async function say(page, text) {
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').focus();
    return true;
  });
  await page.until(
    () =>
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
      window.field()
  );
  await page.type(text);
  await page.until((text) => window.field().value === text, text);
  await page.press('Enter');
  await page.until((text) => window.rows().some(([shown]) => shown.endsWith(text)), text);
}

test('while the agent starts, the chat has no empty state and the composer says why', async (t) => {
  const page = await open(t);
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.agent.list().length,
      window.model.agent.starting(),
      !!window.chat().querySelector('[data-empty]'),
      window.composer().querySelector('swc-prompt-field').getAttribute('placeholder'),
      !!window.chat().querySelector('header sp-picker'),
    ]),
    [0, line, false, line, false]
  );
  assert.deepEqual(page.errors, []);
});

test('Enter while the agent starts queues a row that reads Sent when the agent starts, and it can be dropped', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
    ['Queued: Then list the moorings', 'Sent when the agent starts'],
  ]);
  await page.evaluate(() => {
    window
      .composer()
      .querySelector('li.queued[data-mode=starting]:first-child [data-action=unqueue]')
      .click();
    return true;
  });
  await page.until(() => window.rows().length === 1);
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Then list the moorings', 'Sent when the agent starts'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('once the agent starts, the queued messages go to it in order and the rows go', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  await page.until(() => window.rows().length === 0);
  await page.until(() => window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.equal(await page.evaluate(() => window.model.agent.starting()), null);
  assert.deepEqual(
    await page.evaluate(() =>
      window.app.dock.api.panels.map((panel) => panel.id).filter((id) => id.startsWith('chat'))
    ),
    ['chat:cone-sliccy']
  );
  assert.deepEqual(page.errors, []);
});

test('the dummy agent starts on its own after a while', async (t) => {
  const page = await open(t, { agent: 'starting' });
  await page.until(() => window.model.agent.list().length > 0 && !window.model.agent.starting());
  assert.ok(await page.evaluate(() => !!window.model.agent.active()));
  assert.deepEqual(page.errors, []);
});

test('a dock rebuild while the agent starts keeps the queued rows', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => window.app.screen === 'phone');
  await page.evaluate(() => {
    window.app.show('chat');
    return true;
  });
  await page.until(() => window.rows().length === 1);
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('if the line clears with no agent, the queued rows stay', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(() => !window.model.agent.starting());
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(await page.evaluate(() => window.rows()), [
    ['Queued: Check the harbor tides', 'Sent when the agent starts'],
  ]);
  assert.equal(await page.evaluate(() => window.model.agent.list().length), 0);
  assert.deepEqual(page.errors, []);
});

async function swap(page) {
  await page.evaluate(async () => {
    const { createDummyModel } = await import('/dist/slicc-dummy.js');
    window.old = window.model;
    window.model = createDummyModel({ delay: 5, color: 'light' });
    window.app.model = window.model;
    return true;
  });
}

test('when the embedder swaps in a new model with agents, the rows go to it in order', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await swap(page);
  await page.until(() => window.rows().length === 0 && window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.deepEqual(page.errors, []);
});

test('the old model clearing its line after a swap sends nothing twice', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await swap(page);
  await page.until(() => window.rows().length === 0 && window.users().length === 2);
  await page.evaluate(() => {
    window.old.agent.arrive();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => [
      window.users(),
      window.model.agent.queue(window.model.agent.active()).length,
      window.old.agent
        .messages(window.old.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text),
    ]),
    [['What is on my plate today?', 'Check the harbor tides'], 0, ['What is on my plate today?']]
  );
  assert.deepEqual(page.errors, []);
});

test('text typed but not sent while the agent starts is still in the field once it arrives', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').focus();
    return true;
  });
  await page.until(
    () =>
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
      window.field()
  );
  await page.type('half typed');
  await page.until(() => window.field().value === 'half typed');
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => !!window.app.dock.content('chat:cone-sliccy'));
  await page.until(() => window.field()?.value === 'half typed');
  await page.until(
    () =>
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
      window.field()
  );
  await page.type(' more');
  await page.until(() => window.field().value === 'half typed more');
  assert.deepEqual(page.errors, []);
});

test('text typed but not sent while the agent starts survives a model swap', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').value = 'half typed';
    return true;
  });
  await page.until(() => window.field().value === 'half typed');
  await swap(page);
  await page.until(() => !!window.app.dock.content('chat:cone-sliccy'));
  await page.until(() => window.field()?.value === 'half typed');
  assert.deepEqual(page.errors, []);
});

test('a fresh load while the agent starts shows the agentless chat, and the agent chat takes its slot', async (t) => {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent: 'waiting' })}`);
  await page.until(() => window.ready === true && window.app.dock?.has('chat'));
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => !window.app.dock.has('chat') && window.app.dock.has('chat:cone-sliccy'));
  await page.until(
    () => window.app.dock.content('chat:cone-sliccy').getBoundingClientRect().width > 0
  );
  const widths = await page.evaluate(() =>
    ['agents', 'chat:cone-sliccy'].map(
      (id) => window.app.dock.content(id).getBoundingClientRect().width
    )
  );
  assert.ok(widths[1] > widths[0] * 2, JSON.stringify(widths));
  assert.deepEqual(page.errors, []);
});

test('a reload while the agent starts leaves the next normal load with the agent chat', async (t) => {
  const page = await open(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.until(() => window.app.dock.has('chat:cone-sliccy'));
  assert.deepEqual(
    await page.evaluate(() =>
      window.app.dock.api.panels.map((panel) => panel.id).filter((id) => id.startsWith('chat'))
    ),
    ['chat:cone-sliccy']
  );
  assert.deepEqual(page.errors, []);
});

test('after a reload a row whose file was lost is held, Put back fills the field, and the other rows still send', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.evaluate(() => {
    const composer = window.chat().querySelector('slicc-composer');
    composer.attachments = [
      { id: 'n1', name: 'tides.csv', kind: 'text', mimeType: 'text/csv', size: 3, text: 'a,b' },
      { id: 'n2', name: 'notes.txt', kind: 'text', mimeType: 'text/plain', size: 3, text: 'abc' },
    ];
    composer.value = 'Compare with the attached tides';
    composer.send();
    return true;
  });
  await say(page, 'Then list the moorings');
  await reopen(page);
  await page.until(
    () => window.composer()?.querySelectorAll('li.queued[data-mode=starting]').length === 3
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.composer().querySelectorAll('li.queued[data-mode=starting]')].map((row) => [
        row.querySelector('.text').textContent.trim(),
        row.querySelector('[data-lost]')?.textContent.trim() ?? null,
        !!row.querySelector('[data-action=restore-starting]'),
      ])
    ),
    [
      ['Queued: Check the harbor tides', null, false],
      [
        'Held: Compare with the attached tides',
        ', Not sent: 2 files weren’t kept after reload. (tides.csv, notes.txt)',
        true,
      ],
      ['Queued: Then list the moorings', null, false],
    ]
  );
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.app.dock.has('chat:cone-sliccy') && window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  await page.until(() => !!window.composer()?.querySelector('[data-action=restore-starting]'));
  await page.evaluate(() => {
    window.composer().querySelector('[data-action=restore-starting]').click();
    return true;
  });
  await page.until(
    () =>
      window.field()?.value === 'Compare with the attached tides' &&
      window.composer().querySelector('swc-prompt-field').shadowRoot.activeElement ===
        window.field() &&
      !window.composer().querySelector('li.queued[data-mode=starting]')
  );
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('slicc-spectrum.starting')), null);
  const hint = () => window.composer().querySelector('[data-reattach]')?.textContent.trim() ?? null;
  assert.equal(await page.evaluate(hint), 'Attach tides.csv and notes.txt again.');
  const attach = (names) =>
    page.evaluate((names) => {
      window.chat().querySelector('slicc-composer').attachments = names.map((name, index) => ({
        id: `r${index}`,
        name,
        kind: 'text',
        mimeType: 'text/plain',
        size: 3,
        text: 'abc',
      }));
      return true;
    }, names);
  await attach(['tides.csv']);
  await page.until(
    () =>
      window.composer().querySelector('[data-reattach]')?.textContent.trim() ===
      'Attach notes.txt again.'
  );
  await attach(['tides.csv', 'other.csv']);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await page.evaluate(hint), 'Attach notes.txt again.');
  await attach(['tides.csv', 'notes.txt']);
  await page.until(() => !window.composer().querySelector('[data-reattach]'));
  assert.deepEqual(page.errors, []);
});

async function reopen(page) {
  await page.reload();
  await page.until(() => window.ready === true && window.app.dock.has('chat'));
  await page.evaluate(() => {
    window.chat = () =>
      window.app.dock.content('chat:cone-sliccy')?.shadowRoot ??
      window.app.dock.content('chat')?.shadowRoot ??
      null;
    window.composer = () => window.chat()?.querySelector('slicc-composer')?.shadowRoot ?? null;
    window.field = () =>
      window.composer()?.querySelector('swc-prompt-field')?.shadowRoot?.querySelector('textarea');
    window.users = () =>
      window.model.agent
        .messages(window.model.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
    return true;
  });
  await page.until(() => !!window.composer()?.querySelector('swc-prompt-field'));
}

test('a file-only row reloads as not sent, is not sent on arrival, and goes when dropped', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const composer = window.chat().querySelector('slicc-composer');
    composer.attachments = [
      { id: 'n2', name: 'radar.png', kind: 'text', mimeType: 'text/plain', size: 3, text: 'abc' },
    ];
    composer.send();
    return true;
  });
  await page.until(() => window.rows().length === 1);
  await reopen(page);
  await page.until(
    () => window.composer().querySelectorAll('li.queued[data-mode=starting]').length === 1
  );
  const row = () => {
    const node = window.composer().querySelector('li.queued[data-mode=starting]');
    return (
      node && [
        node.querySelector('.text').textContent.trim(),
        node.querySelector('.next:last-of-type').textContent,
      ]
    );
  };
  assert.deepEqual(await page.evaluate(row), [
    'Queued: radar.png',
    'Not sent. Attach the files again.',
  ]);
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(
    () =>
      window.app.dock.has('chat:cone-sliccy') &&
      !!window.composer()?.querySelector('li.queued[data-mode=starting]')
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.agent
        .messages(window.model.agent.active())
        .filter((message) => message.role === 'user')
        .map((message) => message.text)
    ),
    ['What is on my plate today?']
  );
  await page.evaluate(() => {
    window.composer().querySelector('li.queued [data-action=unqueue]').click();
    return true;
  });
  await page.until(() => sessionStorage.getItem('slicc-spectrum.starting') === null);
  assert.deepEqual(page.errors, []);
});

test('a dropped row does not come back after a reload', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await page.evaluate(() => {
    window
      .composer()
      .querySelector('li.queued[data-mode=starting]:first-child [data-action=unqueue]')
      .click();
    return true;
  });
  await page.until(() => window.rows().length === 1);
  await reopen(page);
  await page.until(
    () => window.composer().querySelectorAll('li.queued[data-mode=starting]').length === 1
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.composer().querySelectorAll('li.queued[data-mode=starting] .text')].map((node) =>
        node.textContent.trim()
      )
    ),
    ['Queued: Then list the moorings']
  );
  assert.deepEqual(page.errors, []);
});

test('after Put back the reattach line names four files, opens the file picker, and goes when the field is cleared', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const composer = window.chat().querySelector('slicc-composer');
    composer.attachments = ['a.csv', 'b.csv', 'c.csv', 'd.csv'].map((name, index) => ({
      id: `f${index}`,
      name,
      kind: 'text',
      mimeType: 'text/csv',
      size: 3,
      text: 'a,b',
    }));
    composer.value = 'Merge the four exports';
    composer.send();
    return true;
  });
  await page.until(() => window.rows().length === 1);
  await reopen(page);
  await page.until(() => !!window.composer()?.querySelector('[data-action=restore-starting]'));
  await page.evaluate(() => {
    window.composer().querySelector('[data-action=restore-starting]').click();
    return true;
  });
  await page.until(() => !!window.composer().querySelector('[data-reattach]'));
  assert.equal(
    await page.evaluate(() =>
      window.composer().querySelector('[data-reattach]').textContent.trim()
    ),
    'Attach these 4 files again: a.csv, b.csv, c.csv, d.csv.'
  );
  await page.evaluate(() => {
    window.picked = 0;
    window.composer().querySelector('input[type=file]').click = () => {
      window.picked += 1;
    };
    window.composer().querySelector('[data-action=reattach]').click();
    return true;
  });
  assert.equal(await page.evaluate(() => window.picked), 1);
  await page.evaluate(() => {
    window.chat().querySelector('slicc-composer').value = '';
    return true;
  });
  await page.until(() => !window.composer().querySelector('[data-reattach]'));
  assert.deepEqual(page.errors, []);
});

async function hideChat(page) {
  await page.evaluate(() => {
    const port = window.model.notices;
    const list = port.list.bind(port);
    port.list = () =>
      list().map((notice) =>
        notice.id === 'starting'
          ? { ...notice, actions: [{ id: 'show-updates', label: 'Open Install / Update' }] }
          : notice
      );
    port.act = async (id, action) => {
      if (id === 'starting' && action === 'show-updates') window.app.show('updates');
    };
    port.emit('notices', port.list());
    window.button = () =>
      window
        .chat()
        ?.querySelector('slicc-notices')
        ?.shadowRoot?.querySelector('[data-notice=starting] [data-action=show-updates]');
    window.hidden = () =>
      !window.held.isConnected &&
      window.app.dock.api.getPanel('updates')?.api.isVisible === true &&
      window.app.dock.api.panels
        .filter((panel) => panel.id.startsWith('chat'))
        .every((panel) => !panel.api.isVisible);
    return true;
  });
  await page.until(() => !!window.button());
  await page.evaluate(() => {
    window.held = window.chat().querySelector('slicc-composer');
    window.inChatGroup = window.app.dock.api.getPanel('chat').group;
    window.button().click();
    return true;
  });
  await page.until(() => window.hidden());
  assert.equal(
    await page.evaluate(() => window.app.dock.api.getPanel('updates').group === window.inChatGroup),
    true
  );
}

test('the rows go once, in order, while Install / Update hides the chat, and showing the chat sends nothing twice', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await hideChat(page);
  await swap(page);
  await page.until(() => window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.equal(await page.evaluate(() => window.hidden()), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('slicc-spectrum.starting')), null);
  await page.evaluate(() => {
    window.app.show('chat');
    return true;
  });
  await page.until(() => !!window.field());
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => [
      window.rows(),
      window.users(),
      window.model.agent.queue(window.model.agent.active()).length,
    ]),
    [[], ['What is on my plate today?', 'Check the harbor tides', 'Then list the moorings'], 0]
  );
  assert.deepEqual(page.errors, []);
});

test('with two chats open the rows go once each', async (t) => {
  const page = await open(t, { agent: 'ready' });
  await page.until(() => !!window.app.dock.content('chat:cone-sliccy'));
  await page.evaluate(() => {
    window.app.dock.open({
      id: 'chat:cone-harbor',
      component: 'chat',
      title: 'harbor',
      params: { agent: 'cone-harbor' },
      position: { referencePanel: 'chat:cone-sliccy', direction: 'right' },
    });
    window.composers = () =>
      ['chat:cone-sliccy', 'chat:cone-harbor'].map((id) =>
        window.app.dock.content(id)?.shadowRoot?.querySelector('slicc-composer')
      );
    window.shown = () =>
      window
        .composers()
        .map((node) => node.shadowRoot.querySelectorAll('li.queued[data-mode=starting]').length);
    window.sent = (id) =>
      window.model.agent
        .messages(id)
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
    window.before = window.sent('cone-harbor');
    window.model.agent.select('cone-sliccy');
    window.model.agent.setStarting('Seven is updating its agent.');
    return true;
  });
  await page.until(() => window.composers().every((node) => node?.isConnected));
  await say(page, 'Check the harbor tides');
  await say(page, 'Then list the moorings');
  await page.until(() => window.shown().every((count) => count === 2));
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(() => window.shown().every((count) => count === 0));
  await page.until(() => window.sent('cone-sliccy').length === 3);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => [
      window.sent('cone-sliccy'),
      window.model.agent.queue('cone-sliccy').length,
      window.sent('cone-harbor').length === window.before.length,
    ]),
    [['What is on my plate today?', 'Check the harbor tides', 'Then list the moorings'], 0, true]
  );
  assert.deepEqual(page.errors, []);
});

test('after a reload a held row stays held when the others go while the chat is hidden', async (t) => {
  const page = await open(t);
  await say(page, 'Check the harbor tides');
  await page.evaluate(() => {
    const composer = window.chat().querySelector('slicc-composer');
    composer.attachments = [
      { id: 'n1', name: 'tides.csv', kind: 'text', mimeType: 'text/csv', size: 3, text: 'a,b' },
    ];
    composer.value = 'Compare with the attached tides';
    composer.send();
    return true;
  });
  await say(page, 'Then list the moorings');
  await reopen(page);
  await page.until(
    () => window.composer()?.querySelectorAll('li.queued[data-mode=starting]').length === 3
  );
  await hideChat(page);
  await swap(page);
  await page.until(() => window.users().length === 3);
  assert.deepEqual(await page.evaluate(() => window.users()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  assert.equal(await page.evaluate(() => window.hidden()), true);
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('slicc-spectrum.starting')).map((row) => [
        row.text,
        [...row.lost, ...row.attachments].map((file) => file.name),
      ])
    ),
    [['Compare with the attached tides', ['tides.csv']]]
  );
  await page.evaluate(() => {
    window.app.show('chat');
    return true;
  });
  await page.until(() => !!window.composer()?.querySelector('[data-action=restore-starting]'));
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.composer().querySelectorAll('li.queued[data-mode=starting] .text')].map((node) =>
        node.textContent.trim()
      )
    ),
    ['Held: Compare with the attached tides']
  );
  assert.equal((await page.evaluate(() => window.users())).length, 3);
  assert.deepEqual(page.errors, []);
});

test('composers outside the app send the rows once, and not after both are gone', async (t) => {
  const page = await open(t, { agent: 'ready' });
  await page.evaluate(() => {
    window.loose = [0, 1].map(() => {
      const node = document.createElement('slicc-composer');
      node.model = window.model;
      document.body.append(node);
      return node;
    });
    window.counts = () =>
      window.loose.map(
        (node) => node.shadowRoot?.querySelectorAll('li.queued[data-mode=starting]').length ?? -1
      );
    window.sent = () =>
      window.model.agent
        .messages('cone-sliccy')
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
    window.queueLoose = (text) => {
      window.loose[0].value = text;
      window.loose[0].send();
    };
    window.model.agent.select('cone-sliccy');
    window.model.agent.setStarting('Seven is updating its agent.');
    return true;
  });
  await page.until(() => window.loose.every((node) => node.hasUpdated));
  await page.evaluate(() => {
    window.queueLoose('Check the harbor tides');
    window.queueLoose('Then list the moorings');
    return true;
  });
  await page.until(() => window.counts().every((count) => count === 2));
  assert.deepEqual(await page.evaluate(() => window.rows()), []);
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(
    () => window.counts().every((count) => count === 0) && window.sent().length === 3
  );
  await page.evaluate(() => {
    window.model.agent.setStarting('Seven is updating its agent.');
    window.queueLoose('Check the anchorage');
    window.loose[0].remove();
    return true;
  });
  await page.until(() => window.counts()[1] === 1);
  await page.evaluate(() => {
    window.loose[1].remove();
    window.model.agent.setStarting(null);
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(await page.evaluate(() => window.sent()), [
    'What is on my plate today?',
    'Check the harbor tides',
    'Then list the moorings',
  ]);
  await page.evaluate(() => {
    document.body.append(window.loose[1]);
    return true;
  });
  await page.until(() => window.sent().length === 4 && window.counts()[1] === 0);
  assert.deepEqual(await page.evaluate(() => window.sent().slice(-1)), ['Check the anchorage']);
  assert.deepEqual(page.errors, []);
});
