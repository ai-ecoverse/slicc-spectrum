import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function settled(page) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => window.ready === true).catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function open(t, params = {}) {
  const page = await chrome.page(t);
  const url = `/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`;
  await page.goto(url);
  if (!(await settled(page))) await page.goto(url);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  return page;
}

async function altM(page, type) {
  const m = { key: 'µ', code: 'KeyM', windowsVirtualKeyCode: 77, modifiers: 1 };
  if (type === 'keyDown') {
    await page.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Alt',
      code: 'AltLeft',
      windowsVirtualKeyCode: 18,
      modifiers: 1,
    });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...m, text: 'µ' });
  } else await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...m });
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

const layout = () => window.layout();

test('the shell renders the default layout from the dummy model', async (t) => {
  const page = await open(t);
  const panels = await page.evaluate(layout);

  assert.deepEqual(Object.keys(panels).sort(), ['agents', 'changes', 'chat:cone-sliccy']);
  assert.ok(panels.agents.box[0] < panels['chat:cone-sliccy'].box[0], JSON.stringify(panels));
  assert.ok(panels.changes.box[0] > panels['chat:cone-sliccy'].box[0]);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app', '.rail.left').querySelectorAll('[data-surface]')].map(
        (b) => b.dataset.surface
      )
    ),
    ['agents', 'chat', 'files', 'memory', 'freezer', 'settings', 'updates']
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app').shadowRoot.querySelectorAll('.rail [data-visible]')].map(
        (b) => b.dataset.surface
      )
    ),
    ['agents', 'chat', 'changes']
  );
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'sp-theme').getAttribute('system')),
    'spectrum-two'
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [document.documentElement, document.body].map(
        (element) => getComputedStyle(element).overscrollBehaviorY
      )
    ),
    ['none', 'none']
  );
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', '.swc-theme').className),
    'swc-theme swc-theme--sizeM swc-theme--light'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.$('slicc-app', '.rail.left [data-surface=files] [slot=icon]').localName,
      window.$('slicc-app', 'header swc-action-button#theme [slot=icon]').localName,
      [...window.$('slicc-app').shadowRoot.querySelectorAll('[slot=icon]')].filter((icon) =>
        icon.localName.startsWith('sp-icon-')
      ).length,
    ]),
    ['swc-icon-folder', 'swc-icon-contrast', 0]
  );
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', '[data-panel=agents] > *').localName
    ),
    'slicc-agents'
  );
  const rows = await page.evaluate(() =>
    [...window.$('slicc-app', 'slicc-dock', 'slicc-agents').shadowRoot.querySelectorAll('li')].map(
      (li) => [li.dataset.id, li.className, li.getAttribute('aria-selected')]
    )
  );
  assert.deepEqual(rows[0], ['cone-sliccy', 'cone', 'true']);
  assert.deepEqual(rows[1], ['scoop-wren', 'scoop', 'false']);
  assert.deepEqual(rows[2], ['cone-kitchen', 'cone', 'false']);
  assert.deepEqual(
    rows.filter(([, kind]) => kind === 'scoop').map(([id]) => id),
    ['scoop-wren']
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const header = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'header');
      return [
        window.$('slicc-app', 'footer'),
        header.querySelector('swc-status-light').textContent,
        [...header.querySelectorAll('sp-picker')].map((picker) => picker.getAttribute('label')),
        header.querySelector('swc-meter').getAttribute('value'),
        /sliccy/.test(header.textContent),
      ];
    }),
    [null, 'Idle', ['Model', 'Thinking'], '21', false]
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app', 'header sp-picker').querySelectorAll('sp-menu-item')].map((item) =>
        [...item.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent)
          .join('')
          .trim()
      )
    ),
    [
      'sliccy',
      'kitchen-sink',
      'harbor',
      'release-notes',
      'inbox-triage',
      'tide-tables',
      'New cone',
      'Delete cone',
      'Show all agents',
    ]
  );
  assert.deepEqual(
    chrome.requests.filter((path) => path.startsWith('/node_modules/')),
    []
  );
  assert.deepEqual(page.errors, []);
  await shot(page, 'shell-light');

  await page.evaluate(() => window.app.show('files'));
  const tabs = await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock')
        .shadowRoot.querySelectorAll('.dv-tabs-container .dv-tab'),
    ].map((tab) => {
      const inner = tab.querySelector('.slicc-tab');
      const close = inner.querySelector('.slicc-tab-close');
      return [
        tab.getAttribute('role'),
        tab.getAttribute('aria-selected'),
        getComputedStyle(tab).backgroundColor,
        getComputedStyle(inner).fontSize,
        getComputedStyle(inner, '::after').height,
        getComputedStyle(close).display,
        close.getAttribute('role'),
        close.tabIndex,
        close.getAttribute('aria-label') === `Close ${inner.textContent.trim()}`,
      ];
    })
  );
  assert.equal(tabs.filter((tab) => tab[1] === 'false').length, 1, JSON.stringify(tabs));
  for (const tab of tabs) {
    const selected = tab[1] === 'true';
    assert.deepEqual(
      tab,
      [
        'tab',
        String(selected),
        'rgba(0, 0, 0, 0)',
        '14px',
        selected ? '2px' : 'auto',
        selected ? 'grid' : 'none',
        'button',
        -1,
        true,
      ],
      JSON.stringify(tabs)
    );
  }
});

test('panels move, close, float and come back, and a reload keeps the layout', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
      el.textContent.includes('Agents')
    );
    const target = dock.api
      .getPanel('chat:cone-sliccy')
      .group.element.querySelector('.dv-content-container');
    return window.drag(tab, target, 0.5, 0.95);
  });
  let panels = await page.evaluate(layout);
  assert.ok(panels.agents.box[1] > panels['chat:cone-sliccy'].box[1], JSON.stringify(panels));
  assert.equal(panels.agents.box[0], panels['chat:cone-sliccy'].box[0]);

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find(
      (el) => el.textContent.trim() === 'sliccy'
    );
    tab
      .querySelector('.slicc-tab-close')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tab.querySelector('.slicc-tab-close').click();
  });
  await page.until(() => !window.$('slicc-app', 'slicc-dock').has('chat:cone-sliccy'));

  await page.evaluate(() => window.$('slicc-app', 'sp-action-menu').click());
  await page.until(() => window.$('slicc-app', 'sp-action-menu').open === true);
  await page.until(() => {
    window.$('slicc-app', 'sp-action-menu sp-menu-item[value=chat]').click();
    return window.$('slicc-app', 'slicc-dock').has('chat:cone-sliccy');
  });

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
      el.textContent.includes('Agents')
    );
    tab.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 60,
      })
    );
  });
  await page.until(() =>
    [...window.$('slicc-app', 'slicc-dock').shadowRoot.querySelectorAll('*')].some(
      (el) => el.textContent === 'Float'
    )
  );
  await page.evaluate(() =>
    [...window.$('slicc-app', 'slicc-dock').shadowRoot.querySelectorAll('*')]
      .find((el) => el.textContent === 'Float' && el.children.length === 0)
      .click()
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').api.getPanel('agents').group.api.location.type ===
      'floating'
  );
  await shot(page, 'floating');
  panels = await page.evaluate(layout);

  await page.goto('/ui/?delay=5');
  await page.until(
    () => window.ready === true && window.$('slicc-app', 'slicc-dock')?.api.panels.length === 3
  );
  let reloaded;
  for (let i = 0; i < 40; i++) {
    reloaded = await page.evaluate(layout);
    if (JSON.stringify(reloaded) === JSON.stringify(panels)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(reloaded, panels);

  await page.evaluate(() => window.app.resetLayout());
  const reset = await page.evaluate(layout);
  assert.equal(reset.agents.floating, false);
  assert.ok(reset.agents.box[0] < reset['chat:cone-sliccy'].box[0]);
  assert.deepEqual(page.errors, []);
});

test('sending a message streams a reply with a tool call', async (t) => {
  const page = await open(t, { delay: '8' });
  await page.evaluate(() => {
    window.seen = [];
    window.model.agent.on('message', ({ message }) => {
      if (message.role !== 'assistant') return;
      const tool = message.parts.find((part) => part.type === 'tool')?.tool;
      const text = message.parts.find((part) => part.type === 'text')?.text ?? '';
      window.seen.push([message.status, tool?.status ?? null, text.length]);
    });
  });
  await page.press('2', 'alt');
  await page.until(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-chat').matches(':focus-within')
  );
  await page.type('Run the tests');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === 'Run the tests'
  );
  await page.press('Enter');

  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        '[data-status=streaming] details.tool[data-status=running]'
      )
  );
  await page.until(() => {
    const field = window.$(
      'slicc-app',
      'slicc-dock',
      'slicc-chat',
      'slicc-composer',
      'swc-prompt-field'
    );
    return field.hasAttribute('generating') && field.getAttribute('stop-label') === 'Stop';
  });
  await shot(page, 'chat-streaming');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'swc-conversation-turn.assistant:last-of-type'
      )?.dataset.status === 'done'
  );

  const seen = await page.evaluate(() => window.seen);
  assert.ok(
    seen.some(([status, tool]) => status === 'streaming' && tool === 'running'),
    JSON.stringify(seen)
  );
  const lengths = seen
    .filter(([status, tool]) => status === 'streaming' && tool === 'done')
    .map(([, , n]) => n);
  assert.ok(new Set(lengths).size > 5, JSON.stringify(lengths));
  const reply = await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'swc-conversation-turn.assistant:last-of-type')
      .textContent.replace(/\s+/g, ' ')
  );
  assert.match(reply, /Run the tests\s*\$ npm test/);
  assert.match(reply, /All 3 tests pass/);
  assert.equal(
    await page.evaluate(
      () =>
        window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'swc-prompt-field',
          'textarea'
        ).value
    ),
    ''
  );

  await page.evaluate(() => {
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'swc-conversation-turn.assistant:last-of-type details.tool summary'
      )
      .click();
  });
  assert.match(
    await page.evaluate(
      () =>
        window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'swc-conversation-turn.assistant:last-of-type details.tool[open] .output'
        ).textContent
    ),
    /ℹ pass 3/
  );
  assert.deepEqual(page.errors, []);
  await shot(page, 'chat-light');
});

test('a content-filter stop drops the last turn and puts its prompt back in the composer', async (t) => {
  const page = await open(t);
  const send = (text) =>
    page.evaluate((text) => window.model.agent.send('cone-sliccy', text), text);
  const composed = (text) =>
    page.until(
      (text) =>
        window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'swc-prompt-field',
          'textarea'
        ).value === text,
      text
    );
  const failures = (count) =>
    page.until(
      (count) =>
        window.model.agent
          .messages('cone-sliccy')
          .filter((message) => message.role === 'assistant' && message.status === 'error')
          .length === count,
      count
    );
  const drop = () =>
    page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-chat')
          .shadowRoot.querySelectorAll('swc-button'),
      ]
        .filter((button) => button.textContent.trim() === 'Drop the last turn')
        .at(-1)
        .click()
    );
  const users = () =>
    page.evaluate(() =>
      window.model.agent
        .messages('cone-sliccy')
        .filter((message) => message.role === 'user')
        .map((message) => message.text)
    );

  await send('Summarize the forbidden notes');
  await failures(1);
  const card = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const error = [...root.querySelectorAll('.error-card')].at(-1);
    error.scrollIntoView({ block: 'center' });
    return [
      error.querySelector('.lead').textContent,
      error.querySelector('.detail').textContent,
      error.querySelector('swc-button').textContent.trim(),
    ];
  });
  assert.deepEqual(card, [
    "The model's content filter stopped this reply.",
    'Provider stopped with: content_filtered',
    'Drop the last turn',
  ]);
  await shot(page, 'filtered-before');

  await drop();
  await composed('Summarize the forbidden notes');
  assert.deepEqual(
    await page.evaluate(() => {
      const last = window.model.agent.messages('cone-sliccy').at(-1);
      return [last.role, last.title];
    }),
    ['system', 'Rewound 1 turn']
  );
  assert.ok(!(await users()).includes('Summarize the forbidden notes'));
  assert.deepEqual(
    await page.evaluate(() => {
      const divider = [...window.chatPart().shadowRoot.querySelectorAll('.marker.notice')].at(-1);
      return [
        divider.getAttribute('role'),
        divider.querySelectorAll(':scope > .line').length,
        divider.querySelector('.marker-text').textContent.replace(/\s+/g, ' ').trim(),
      ];
    }),
    ['note', 2, 'Rewound 1 turn Its prompt is back in the composer.']
  );
  await shot(page, 'filtered-after');

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field', 'textarea')
      .select()
  );
  await page.insert('Summarize the notes');
  await page.press('Enter');
  await page.until(() => {
    const last = window.model.agent.messages('cone-sliccy').at(-1);
    return last.role === 'assistant' && last.status === 'done';
  });
  assert.ok((await users()).includes('Summarize the notes'));

  await send('First forbidden question');
  await failures(1);
  await send('Second forbidden question');
  await failures(2);
  await send('Third forbidden question');
  await failures(3);
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-chat')
          .shadowRoot.querySelectorAll('swc-button[data-action=drop-turn]'),
      ].map((button) => button.textContent.trim())
    ),
    ['Drop the last turn', 'Drop 2 failed turns', 'Drop 3 failed turns']
  );
  await shot(page, 'filtered-run');
  await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('swc-button[data-action=drop-turn]'),
    ]
      .at(-1)
      .click()
  );
  await composed('Third forbidden question');
  const left = await users();
  assert.ok(
    !left.includes('First forbidden question') &&
      !left.includes('Second forbidden question') &&
      !left.includes('Third forbidden question')
  );
  assert.ok(left.includes('Summarize the notes'));
  assert.deepEqual(
    await page.evaluate(() => {
      const last = window.model.agent.messages('cone-sliccy').at(-1);
      return [last.role, last.title];
    }),
    ['system', 'Rewound 3 turns']
  );
  await shot(page, 'filtered-run-after');
  assert.deepEqual(page.errors, []);
});

test('a running reply stops with Escape', async (t) => {
  const page = await open(t, { delay: '40' });
  await page.press('2', 'alt');
  await page.until(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-chat').matches(':focus-within')
  );
  await page.insert('What changed?');
  await page.press('Enter');
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-status=streaming]')
  );
  await page.press('Escape');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'swc-conversation-turn.assistant:last-of-type'
      )?.dataset.status === 'stopped'
  );
  assert.deepEqual(page.errors, []);
});

test('a terminal answers color queries with a single theme throughout a theme switch', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=terminal]').click());
  await page.until(() => window.screen().includes('$'));
  const answers = await page.evaluate(async () => {
    const term = window.terminal().shadowRoot.querySelector('slicc-terminal');
    const send = term.send.bind(term);
    const seen = [];
    term.send = (reply) => seen.push(reply);
    const ask = () => {
      const start = seen.length;
      term.write('\x1b]10;?;?\x07');
      return seen.slice(start).join('');
    };
    const out = [ask()];
    window.$('slicc-app', 'header swc-action-button#theme').click();
    out.push(ask());
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      out.push(ask());
    }
    for (let i = 0; i < 3; i++) {
      await new Promise(requestAnimationFrame);
      out.push(ask());
    }
    term.send = send;
    return out;
  });
  const light = '\x1b]10;rgb:2929/2929/2929\x07\x1b]11;rgb:ffff/ffff/ffff\x07';
  const dark = '\x1b]10;rgb:dbdb/dbdb/dbdb\x07\x1b]11;rgb:2222/2222/2222\x07';
  assert.equal(answers[0], light);
  assert.equal(answers.at(-1), dark);
  for (const answer of answers)
    assert.ok(answer === light || answer === dark, JSON.stringify(answer));
  assert.deepEqual(page.errors, []);
});

test('the theme switches between light and dark and survives a reload', async (t) => {
  const page = await open(t);
  const surface = () => [
    window.$('slicc-app', 'sp-theme').getAttribute('color'),
    getComputedStyle(window.$('slicc-app', 'slicc-dock', 'slicc-chat')).backgroundColor,
    getComputedStyle(window.$('slicc-app', '.swc-theme')).colorScheme,
  ];
  const light = await page.evaluate(surface);
  assert.equal(light[0], 'light');
  assert.equal(light[2], 'light');

  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#theme').click());
  await page.until(() => window.$('slicc-app', 'sp-theme').getAttribute('color') === 'dark');
  const dark = await page.evaluate(surface);
  assert.notEqual(dark[1], light[1]);
  assert.equal(dark[2], 'dark');
  await shot(page, 'shell-dark');

  await page.evaluate(() => window.model.agent.select('cone-harbor'));
  await shot(page, 'chat-dark');

  await page.goto('/ui/?delay=5');
  await page.until(() => window.ready === true);
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'sp-theme').getAttribute('color')),
    'dark'
  );

  await page.press('T', 'alt', 'shift');
  await page.until(() => window.$('slicc-app', 'sp-theme').getAttribute('color') === 'light');
  assert.deepEqual(page.errors, []);
});

async function pointer(t, fine) {
  const page = await chrome.page(t);
  const url = `/ui/?delay=5&color=light&pointer=${fine ? 'fine' : 'coarse'}`;
  await page.goto(url);
  if (!(await settled(page))) await page.goto(url);
  await page.until(() => window.dock()?.api.panels.length > 0);
  return page;
}

test('with a coarse pointer, activating a panel never focuses a text field', async (t) => {
  const page = await pointer(t, false);
  assert.equal(await page.evaluate(() => matchMedia('(pointer: fine)').matches), false);
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  const seen = [];
  const check = async (want) => {
    const state = await page
      .within(
        5000,
        (want) => {
          const state = window.activated();
          return state.focused && (state.id === want || state.id.startsWith(`${want}:`))
            ? state
            : null;
        },
        want
      )
      .catch(async () =>
        assert.fail(`${want}: ${JSON.stringify(await page.evaluate(() => window.activated()))}`)
      );
    if (state.terminal) assert.match(state.id, /^terminal:/);
    else assert.equal(state.text, false, `${want}: ${state.path}`);
    seen.push(`${state.id}: ${state.path}`);
  };
  const rails = await page.evaluate(() =>
    [...window.app.shadowRoot.querySelectorAll('.rail [data-surface]')].map(
      (button) => button.dataset.surface
    )
  );
  assert.ok(rails.includes('memory') && rails.includes('browser'), rails.join());
  for (const id of rails) {
    await page.evaluate(
      (id) => window.app.shadowRoot.querySelector(`.rail [data-surface="${id}"]`).click(),
      id
    );
    await check(id);
  }
  const keys = await page.evaluate(() => window.app.surfaces.slice(0, 9).map((item) => item.id));
  for (const [index, id] of keys.entries()) {
    await page.press(String(index + 1), 'alt');
    await check(id);
  }
  t.diagnostic(seen.join('\n'));
  assert.ok(
    seen.some((line) => /^chat:.*slicc-chat > div$/.test(line)),
    seen.join('\n')
  );
  assert.ok(
    seen.some((line) => /^sprinkle:.*slicc-sprinkle > iframe$/.test(line)),
    seen.join('\n')
  );
  assert.deepEqual(page.errors, []);
});

test('with a fine pointer, activating chat focuses the composer', async (t) => {
  const page = await pointer(t, true);
  await page.press('1', 'alt');
  await page.until(() => /slicc-agents/.test(window.focused()));
  await page.press('2', 'alt');
  await page.until(() =>
    /slicc-chat > slicc-composer > swc-prompt-field > textarea$/.test(window.focused())
  );
  assert.deepEqual(page.errors, []);
});

test('the keyboard reaches every panel, agent and tab', async (t) => {
  const page = await open(t);
  await page.press('1', 'alt');
  await page.until(() => /slicc-agents > li#cone-sliccy$/.test(window.focused()));
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  await page.until(() => /li#cone-harbor$/.test(window.focused()));
  await page.press('Enter');
  await page.until(() => window.model.agent.active() === 'cone-harbor');
  await page.press('ArrowUp');
  await page.press(' ');
  await page.until(() => window.model.agent.active() === 'cone-kitchen');

  await page.press('F6');
  await page.until(() => /slicc-changes/.test(window.focused()));
  await page.press('F6');
  await page.until(() => /slicc-chat/.test(window.focused()));
  await page.press('F6', 'shift');
  await page.until(() => /slicc-changes/.test(window.focused()));
  await page.press('3', 'alt');
  await page.until(() => /slicc-files/.test(window.focused()));

  await page.evaluate(() =>
    window.drag(
      [...window.$('slicc-app', 'slicc-dock').shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
        el.textContent.includes('Agents')
      ),
      window
        .$('slicc-app', 'slicc-dock')
        .api.getPanel('chat:cone-sliccy')
        .group.element.querySelector('.dv-content-container'),
      0.5,
      0.5
    )
  );
  await page.until(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    return dock.api.getPanel('agents').group === dock.api.getPanel('chat:cone-sliccy').group;
  });
  await page.press('2', 'alt');
  await page.until(
    () => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat:cone-kitchen'
  );
  await page.press(']', 'ctrl');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'agents');
  await page.press('[', 'ctrl');
  await page.until(
    () => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat:cone-kitchen'
  );
  assert.deepEqual(page.errors, []);
});

test('each screen class has its own layout, and rails restore closed panels', async (t) => {
  const page = await open(t);
  const state = () => {
    const app = document.querySelector('slicc-app');
    return {
      screen: app.screen,
      panels: app.dock.api.panels.map((panel) => panel.id).sort(),
      rails: [...app.shadowRoot.querySelectorAll('.rail [data-surface]')].map(
        (button) => button.dataset.surface
      ),
      visible: [...app.shadowRoot.querySelectorAll('.rail [data-visible]')].map(
        (button) => button.dataset.surface
      ),
    };
  };
  assert.deepEqual(await page.evaluate(state), {
    screen: 'desktop',
    panels: ['agents', 'changes', 'chat:cone-sliccy'],
    rails: [
      'agents',
      'chat',
      'files',
      'memory',
      'freezer',
      'settings',
      'updates',
      'sprinkle:suggestions',
      'changes',
      'terminal',
      'browser',
      'monitor',
      'network',
    ],
    visible: ['agents', 'chat', 'changes'],
  });

  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  await page.until(
    () => !window.$('slicc-app', '.rail.left [data-surface=agents]').hasAttribute('data-visible')
  );
  await shot(page, 'rails-light');
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=agents]').click());
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('agents'));

  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '390px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  assert.deepEqual(await page.evaluate(state), {
    screen: 'phone',
    panels: ['chat:cone-sliccy'],
    rails: ['agents', 'chat', 'files', 'changes', 'terminal', 'browser'],
    visible: ['chat'],
  });
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window.$('slicc-app', '.rail.bottom sp-action-menu').querySelectorAll('sp-menu-item'),
      ].map((item) => [item.getAttribute('value'), item.textContent.trim()])
    ),
    [
      ['sprinkle:suggestions', 'Suggestions'],
      ['memory', 'Memory'],
      ['freezer', 'Freezer'],
      ['monitor', 'Monitor'],
      ['settings', 'Settings'],
      ['updates', 'Install / Update'],
      ['network', 'Network'],
    ]
  );
  assert.ok(
    await page.evaluate(() =>
      [
        ...window.app.shadowRoot.querySelectorAll(
          '.rail.bottom swc-action-button, .rail.bottom sp-action-menu'
        ),
      ].every((button) => {
        const box = button.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44;
      })
    )
  );
  await shot(page, 'phone-light');

  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '900px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'tablet');
  assert.deepEqual(await page.evaluate(state), {
    screen: 'tablet',
    panels: ['agents', 'chat:cone-sliccy'],
    rails: [
      'agents',
      'chat',
      'files',
      'memory',
      'freezer',
      'settings',
      'updates',
      'sprinkle:suggestions',
      'changes',
      'terminal',
      'browser',
      'monitor',
      'network',
    ],
    visible: ['agents', 'chat'],
  });
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  await page.until(
    () => !window.$('slicc-app', '.rail.left [data-surface=agents]').hasAttribute('data-visible')
  );

  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'desktop');
  assert.deepEqual((await page.evaluate(state)).panels, ['agents', 'changes', 'chat:cone-sliccy']);

  await page.goto('/ui/?delay=5');
  await page.until(() => window.ready === true);
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '900px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'tablet');
  await page.until(() => document.querySelector('slicc-app').dock.api.panels.length === 1);
  assert.deepEqual(await page.evaluate(state), {
    screen: 'tablet',
    panels: ['chat:cone-sliccy'],
    rails: [
      'agents',
      'chat',
      'files',
      'memory',
      'freezer',
      'settings',
      'updates',
      'sprinkle:suggestions',
      'changes',
      'terminal',
      'browser',
      'monitor',
      'network',
    ],
    visible: ['chat'],
  });
  assert.deepEqual(page.errors, []);
});

test('code uses the bundled Source Code Pro, and the phone layout works in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.until(() => document.fonts.check('12px "Source Code Pro"'));
  await page.evaluate(() => document.fonts.load('12px "Source Code Pro"'));
  await page.until(() =>
    [...document.fonts].some(
      (face) => face.family.includes('Source Code Pro') && face.status === 'loaded'
    )
  );
  assert.ok(
    chrome.requests.includes('/dist/fonts/source-code-pro-latin-400-normal.woff2'),
    chrome.requests.join()
  );
  assert.equal(
    await page.evaluate(() =>
      document.fonts.load('12px "Adobe Clean"').then(
        () => 'loaded',
        () => 'fallback'
      )
    ),
    'fallback'
  );
  assert.ok(chrome.requests.includes('/fonts/AdobeClean-Regular.otf'), chrome.requests.join());
  assert.deepEqual(
    await page.evaluate(() => [
      [...document.fonts]
        .filter((face) => face.family === 'adobe-clean-spectrum-vf')
        .map((face) => face.weight),
      getComputedStyle(window.$('slicc-app', '.brand')).fontFamily.split(',').slice(0, 4).join(','),
    ]),
    [['100 900'], 'adobe-clean-spectrum-vf, "Adobe Clean Spectrum VF", adobe-clean, "Adobe Clean"']
  );
  await page.evaluate(() => {
    window.app.variableFont = null;
  });
  assert.equal(
    await page.evaluate(
      () => [...document.fonts].filter((face) => face.family === 'adobe-clean-spectrum-vf').length
    ),
    0
  );
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '390px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await shot(page, 'phone-dark');
  assert.deepEqual(page.errors, []);
});

test('a file opens from the tree in a tab, by click and by keyboard', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=files]').click());
  await page.until(() => /slicc-files/.test(window.focused()));
  await page.until(() => !!window.row('workspace/harbor/src/lib/units.ts'));
  assert.match(
    await page.evaluate(() => window.row('workspace/harbor/src/lib/cache.ts').textContent),
    /M/
  );
  await page.evaluate(() => window.row('workspace/harbor/src/lib/units.ts').click());
  await page.until(() =>
    window.code('file:/workspace/harbor/src/lib/units.ts').includes('toFahrenheit')
  );
  const tab = await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    return [dock.api.activePanel.id, dock.api.activePanel.title];
  });
  assert.deepEqual(tab, ['file:/workspace/harbor/src/lib/units.ts', 'units.ts']);
  await shot(page, 'file-light');

  await page.press('3', 'alt');
  await page.until(() => /slicc-files/.test(window.focused()));
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .reveal('workspace/harbor/README.md')
  );
  await page.press('Enter');
  await page.until(() =>
    window.code('file:/workspace/harbor/README.md').includes('A small forecast API')
  );
  const group = await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    return dock.api
      .getPanel('file:/workspace/harbor/README.md')
      .group.panels.map((panel) => panel.id);
  });
  assert.deepEqual(group, [
    'file:/workspace/harbor/src/lib/units.ts',
    'file:/workspace/harbor/README.md',
  ]);
  assert.deepEqual(page.errors, []);
});

test('the files search filters the tree, and a letter typed in the tree starts a search', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=files]').click());
  await page.until(() => /slicc-files/.test(window.focused()));
  await page.until(() => !!window.row('workspace/harbor/README.md'));
  assert.equal(
    await page.evaluate(() => window.filesPart('.find sp-search[data-action=search]').label),
    'Search files'
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .reveal('workspace/harbor/README.md')
  );
  await page.press('u');
  await page.until(() => /slicc-files > sp-search/.test(window.focused()));
  await page.type('nits');
  await page.until(() => window.filesPart('sp-search').value === 'units');
  await page.until(
    () =>
      !!window.row('workspace/harbor/src/lib/units.ts') && !window.row('workspace/harbor/README.md')
  );
  await shot(page, 'files-search');
  await page.press('ArrowDown');
  await page.until(() => /slicc-file-tree/.test(window.focused()));
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .reveal('workspace/harbor/src/lib/units.ts')
  );
  await page.press('Enter');
  await page.until(() =>
    window.code('file:/workspace/harbor/src/lib/units.ts').includes('toFahrenheit')
  );
  await page.evaluate(() => window.app.show('files'));
  await page.evaluate(() => {
    const field = window.filesPart('sp-search');
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await page.until(() => !!window.row('workspace/harbor/README.md'));
  await page.evaluate(() => {
    const field = window.filesPart('sp-search');
    field.value = 'zzqx';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await page.until(
    () =>
      window.filesPart('.note[data-empty]')?.textContent === 'No files match.' &&
      !window.row('workspace/harbor/README.md')
  );
  await page.evaluate(() => {
    const field = window.filesPart('sp-search');
    field.value = 'units';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await page.until(
    () => !window.filesPart('.note[data-empty]') && !window.row('workspace/harbor/README.md')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .reveal('workspace/harbor/src/lib/units.ts')
  );
  await page.press('Escape');
  await page.until(
    () => window.filesPart('sp-search').value === '' && !!window.row('workspace/harbor/README.md')
  );
  assert.deepEqual(page.errors, []);
});

test('a diff opens from the changes list, switches layout, and accepting or reverting clears it', async (t) => {
  const page = await open(t);
  const id = 'diff:/workspace/harbor/src/lib/cache.ts';

  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-changes',
        'li[data-path="/workspace/harbor/src/lib/cache.ts"]'
      )
      .click()
  );
  await page.until((id) => window.code(id).includes('dayOf'), id);
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'slicc-dock').api.activePanel.id),
    id
  );
  await shot(page, 'diff-light');

  await page.evaluate((id) => window.button(id, 'Split'), id);
  await page.until(() => window.model.settings.get().diffStyle === 'split');
  await page.until(
    (id) =>
      window
        .$('slicc-app', 'slicc-dock')
        .content(id)
        .shadowRoot.querySelector('slicc-diff-view')
        .getAttribute('diff-style') === 'split',
    id
  );
  await shot(page, 'diff-split');

  await page.evaluate((id) => window.button(id, 'Accept'), id);
  await page.until(() => window.model.files.changes().length === 4);
  await page.until(
    (id) =>
      window
        .$('slicc-app', 'slicc-dock')
        .content(id)
        .shadowRoot.textContent.includes('No pending changes'),
    id
  );

  await page.press('4', 'alt');
  await page.until(() => /slicc-changes/.test(window.focused()));
  await page.press('ArrowDown');
  await page.press('Enter');
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').api.activePanel.id ===
      'diff:/workspace/harbor/src/lib/retry.ts'
  );
  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-changes',
        'li[data-path="/workspace/harbor/src/lib/retry.ts"] swc-action-button[accessible-label="Revert retry.ts"]'
      )
      .click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => window.model.files.changes().length === 3);
  await page.until(() => window.row('workspace/harbor/src/lib/retry.ts') === null);
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('changes'));
  await page.until(
    () =>
      window.$('slicc-app', '.rail [data-surface=changes]')?.getAttribute('accessible-label') ===
        'Open Changes, 3 changes' && window.$('slicc-app', '.badged swc-badge').textContent === '3'
  );
  assert.deepEqual(page.errors, []);
});

test('an agent edit shows up in changes, in the tree and in the open file', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.app.show('files'));
  const id = 'file:/workspace/harbor/src/lib/units.ts';
  await page.evaluate(() => window.app.open('file', '/workspace/harbor/src/lib/units.ts'));
  await page.until((id) => window.code(id).includes('toFahrenheit'), id);
  await page.evaluate(() => window.model.agent.send('cone-sliccy', 'Add a Kelvin helper'));
  await page.until(() => window.model.files.changes().length === 6);
  await page.until((id) => window.code(id).includes('toKelvin'), id);
  await page.until(() =>
    /M/.test(window.row('workspace/harbor/src/lib/units.ts')?.textContent ?? '')
  );
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-changes',
        'li[data-path="/workspace/harbor/src/lib/units.ts"]'
      )
  );
  await page.evaluate(
    (id) =>
      [
        ...window
          .$('slicc-app', 'slicc-dock')
          .content(id)
          .shadowRoot.querySelectorAll('swc-action-button'),
      ]
        .find((button) => button.textContent.trim() === 'Diff')
        .click(),
    id
  );
  await page.until(() =>
    window.code('diff:/workspace/harbor/src/lib/units.ts').includes('toKelvin')
  );
  assert.deepEqual(page.errors, []);
});

test('files, changes and diffs in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.evaluate(() => window.app.open('file', '/workspace/harbor/src/routes/forecast.ts'));
  await page.until(() =>
    window.code('file:/workspace/harbor/src/routes/forecast.ts').includes('retry')
  );
  await shot(page, 'file-dark');
  await page.evaluate(() => window.app.open('diff', '/workspace/harbor/src/routes/forecast.ts'));
  await page.until(() =>
    window.code('diff:/workspace/harbor/src/routes/forecast.ts').includes('retry')
  );
  await shot(page, 'diff-dark');
  assert.deepEqual(page.errors, []);
});

test('a binary change has no diff, and can still be accepted or reverted', async (t) => {
  const page = await open(t);
  const binary = 'diff:/workspace/harbor/static/radar.png';
  await page.evaluate(() => window.app.open('diff', '/workspace/harbor/static/radar.png'));
  await page.until(
    (id) =>
      /No diff for this file/.test(
        window.$('slicc-app', 'slicc-dock').content(id)?.shadowRoot.textContent ?? ''
      ),
    binary
  );
  const buttons = (id) =>
    [
      ...window
        .$('slicc-app', 'slicc-dock')
        .content(id)
        .shadowRoot.querySelectorAll('swc-action-button'),
    ].map((button) => button.textContent.trim());
  assert.deepEqual(await page.evaluate(buttons, binary), ['Accept', 'Revert', 'Open the file']);
  await shot(page, 'diff-binary');

  await page.evaluate(
    (id) =>
      [
        ...window
          .$('slicc-app', 'slicc-dock')
          .content(id)
          .shadowRoot.querySelectorAll('swc-action-button'),
      ]
        .find((button) => button.textContent.trim() === 'Revert')
        .click(),
    binary
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => window.model.files.changes().length === 4);
  assert.equal(
    await page.evaluate(() =>
      window.model.files.read('/workspace/harbor/static/radar.png').then(() => true)
    ),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('git changes group by repository, without authors, and Revert says it can’t be undone', async (t) => {
  const page = await open(t, { changes: 'git' });
  await page.evaluate(() => window.app.show('changes'));
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-changes')?.shadowRoot.querySelectorAll('.repo')
        .length === 2
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-changes')
          .shadowRoot.querySelectorAll('.repo'),
      ].map((header) => header.textContent.trim().replace(/\s+/g, ' '))
    ),
    ['/workspace/harbor 5', '/workspace/skills 1']
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-changes')
          .shadowRoot.querySelectorAll('li[data-path]'),
      ]
        .slice(0, 2)
        .map((row) => [row.title, row.querySelector('.where').textContent.trim()])
    ),
    [
      ['/workspace/harbor/src/legacy/xml.ts, deleted', 'src/legacy'],
      ['/workspace/harbor/src/lib/cache.ts, modified', 'src/lib'],
    ]
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-changes')
      .shadowRoot.querySelector('li[data-path]')
      .focus()
  );
  await page.press('End');
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-changes').shadowRoot.activeElement?.dataset
        .path === '/workspace/skills/release-notes/SKILL.md'
  );
  await shot(page, 'changes-git');

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-changes')
      .shadowRoot.querySelector(
        'li[data-path="/workspace/skills/release-notes/SKILL.md"] swc-action-button[accessible-label^="Revert"]'
      )
      .click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-confirm').shadowRoot.querySelector('p').textContent
    ),
    'Its uncommitted changes are discarded and can’t be undone.'
  );
  await shot(page, 'changes-git-revert');
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-changes').shadowRoot.querySelectorAll('.repo')
        .length === 1
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-changes')
        .shadowRoot.querySelector('.repo')
        .textContent.trim()
        .replace(/\s+/g, ' ')
    ),
    '/workspace/harbor 5'
  );
  assert.equal(await page.evaluate(() => window.model.changes.changes().length), 5);

  await page.evaluate(() => window.app.open('diff', '/workspace/harbor/src/lib/cache.ts'));
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('diff:/workspace/harbor/src/lib/cache.ts')
        ?.shadowRoot.querySelector('.bar')
        ?.textContent.includes('Modified') === true
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('diff:/workspace/harbor/src/lib/cache.ts')
        .shadowRoot.querySelector('.bar')
        .textContent.includes(' by ')
    ),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('without git, Changes says what it needs and the rail has no count', async (t) => {
  const page = await open(t, { changes: 'nogit' });
  await page.evaluate(() => window.app.show('changes'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock', 'slicc-changes')
        ?.shadowRoot.querySelector('[data-unavailable]')
  );
  assert.match(
    await page.evaluate(
      () =>
        window
          .$('slicc-app', 'slicc-dock', 'slicc-changes')
          .shadowRoot.querySelector('[data-unavailable]').textContent
    ),
    /^Changes needs git, and git isn’t installed\. Install it with pnpm add -g @ai-ecoverse\/wasm-git, then run git init/
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-changes')
          .shadowRoot.querySelectorAll('[data-command]'),
      ].map((row) => row.dataset.command)
    ),
    ['pnpm add -g @ai-ecoverse/wasm-git', 'git init', 'curl -fsSL https://get.sliccy.ai/slicc | sh']
  );
  await shot(page, 'changes-no-git');
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('changes'));
  await page.until(() => !!window.$('slicc-app', '.rail [data-surface=changes]'));
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', '.rail [data-surface=changes]').getAttribute('accessible-label')
    ),
    'Open Changes'
  );
  assert.deepEqual(page.errors, []);
});

test('terminals run the fake shell, each in its own panel', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=terminal]').click());
  await page.until(() => window.screen().includes('user@slicc:/workspace/harbor$'));
  await page.press('5', 'alt');
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.type('ls src');
  await page.press('Enter');
  await page.until(() => /index\.ts\s+legacy\s+lib\s+routes/.test(window.screen()));
  await page.type('git status');
  await page.press('Enter');
  await page.until(() =>
    window.screen().replace(/\n/g, '').includes('modified:   /workspace/harbor/src/lib/cache.ts')
  );
  await shot(page, 'terminal-light');

  const terminals = () =>
    window
      .dock()
      .api.panels.filter((panel) => panel.id.startsWith('terminal:'))
      .map((panel) => `${panel.id}:${panel.title}`);
  assert.deepEqual(await page.evaluate(terminals), ['terminal:term-1:bash · harbor']);
  assert.match(
    await page.evaluate(() =>
      window.terminal().shadowRoot.querySelector('.bar').textContent.replace(/\s+/g, ' ')
    ),
    /\/workspace\/harbor New terminal/
  );
  await page.evaluate(() => window.terminal().focus());
  await page.type('cd src');
  await page.press('Enter');
  await page.until(
    () =>
      window.terminal().shadowRoot.querySelector('.cwd')?.textContent === '/workspace/harbor/src'
  );

  await page.evaluate(() =>
    window.terminal().shadowRoot.querySelector('swc-action-button').click()
  );
  await page.until(() => window.model.terminals.list().length === 2);
  await page.until(() => window.dock().has('terminal:term-2'));
  await page.until(() => window.dock().api.activePanel?.id === 'terminal:term-2');
  await page.until(
    () =>
      window.screen().includes('$') && !window.screen().replace(/\n/g, '').includes('git status')
  );
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.type('cd src');
  await page.press('Enter');
  await page.until(() => window.screen().includes('/workspace/harbor/src$'));
  await page.evaluate(() =>
    window
      .dock()
      .api.getPanel('terminal:term-2')
      .api.moveTo({
        group: window.dock().api.getPanel('chat:cone-sliccy').api.group,
        position: 'bottom',
      })
  );
  await page.until(
    () =>
      window.dock().api.getPanel('terminal:term-2').api.group !==
      window.dock().api.getPanel('terminal:term-1').api.group
  );
  await page.until(() => window.screen().includes('/workspace/harbor/src$'));
  await page.evaluate(() => window.terminal().focus());
  await page.type('pwd');
  await page.press('Enter');
  await page.until(() => window.screen().split('\n').includes('/workspace/harbor/src'));
  await shot(page, 'terminal-panels-light');

  await page.type('exit');
  await page.press('Enter');
  await page.until(() => window.model.terminals.list().length === 1);
  await page.until(() => !window.dock().has('terminal:term-2'));
  await page.until(() => window.screen().replace(/\n/g, '').includes('git status'));

  await page.evaluate(() => {
    const tab = [...window.dock().shadowRoot.querySelectorAll('.dv-tab')].find(
      (el) => el.textContent.trim() === 'bash · harbor'
    );
    tab
      .querySelector('.slicc-tab-close')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tab.querySelector('.slicc-tab-close').click();
  });
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => window.model.terminals.list().length === 0);
  await page.until(() => !!window.$('slicc-app', '.rail.right [data-surface=terminal]'));
  await page.evaluate(() => window.$('slicc-app', 'sp-action-menu').click());
  await page.until(() => window.$('slicc-app', 'sp-action-menu').open === true);
  await page.until(() => {
    const created = window.model.terminals.list().length === 1;
    if (!created && !(Date.now() - (window.clicked ?? 0) < 1000)) {
      window.clicked = Date.now();
      window.$('slicc-app', 'sp-action-menu sp-menu-item[value=new-terminal]')?.click();
    }
    return created;
  });
  await page.until(() => window.dock().has('terminal:term-3'));

  await page.evaluate(() =>
    window.model.terminals.open({ cwd: '/workspace/docs', agentId: 'cone-harbor' })
  );
  await page.until(() => window.dock().has('terminal:term-4'));
  assert.equal(await page.evaluate(() => window.dock().api.activePanel?.id), 'terminal:term-3');
  assert.equal(
    await page.evaluate(() => window.dock().api.getPanel('terminal:term-4').title),
    'bash 4 · docs'
  );
  await page.evaluate(() => window.dock().focusPanel('terminal:term-4'));
  await page.until(() =>
    /Driven by harbor/.test(window.dock().content('terminal:term-4')?.shadowRoot.textContent)
  );
  assert.deepEqual(page.errors, []);
});

test('the browser lists its tabs with thumbnails, focuses one, and follows agents', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=browser]').click());
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.window'));
  const windows = () =>
    [...window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot.querySelectorAll('li')].map(
      (item) =>
        `${item.dataset.id}:${item.querySelector('.window').getAttribute('aria-current')}:${item.querySelector('.host').textContent}`
    );
  assert.deepEqual(await page.evaluate(windows), [
    'tab-preview:true:localhost:8787',
    'tab-docs:false:api.example.com',
    'tab-pull:false:git.example.com',
  ]);
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot.querySelectorAll('.thumb img')
        .length === 3
  );
  const first = await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-preview]')
      .textContent.replace(/\s+/g, ' ')
      .trim()
  );
  assert.match(first, /harbor · localhost localhost:8787 Loaded Active Last used by harbor/);
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-docs] swc-close-button')
        .getAttribute('accessible-label')
    ),
    'Close Forecast API reference'
  );
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(
          window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'ul')
        ).gridTemplateColumns.split(' ').length
    ),
    1
  );
  await shot(page, 'browser-light');

  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-docs] .window').focus()
  );
  await page.press('Enter');
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.focused'));
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.address .url').textContent.trim()
    ),
    'api.example.com/docs/v2/forecast'
  );
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.driving').dataset.driving
    ),
    'none'
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', '[data-action=open-tab]').click()
  );
  await page.until(() => window.model.browser.active() === 'tab-docs');
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', '[data-action=all-tabs]').click()
  );
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-docs] .window')
        ?.getAttribute('aria-current') === 'true'
  );

  await page.press('6', 'alt');
  await page.until(() => /slicc-browser > button$/.test(window.focused()));
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-browser', '.window[aria-current=true]')
        .closest('li')
        .getAttribute('data-id')
    ),
    'tab-docs'
  );
  assert.doesNotMatch(await page.evaluate(() => window.focused()), /sp-textfield/);
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'sp-textfield').focus()
  );
  await page.until(() => /slicc-browser > sp-textfield/.test(window.focused()));
  await page.insert('example.com/status');
  await page.press('Enter');
  await page.until(() =>
    window.model.browser.list().some((tab) => tab.url === 'https://example.com/status')
  );
  await page.until(() =>
    window.model.browser
      .list()
      .some((tab) => tab.url === 'https://example.com/status' && tab.status === 'complete')
  );
  await page.until(() =>
    [
      ...window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot.querySelectorAll('li'),
    ].some(
      (item) =>
        item.textContent.includes('example.com') &&
        item.textContent.includes('Loaded') &&
        !!item.querySelector('.thumb img')
    )
  );
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'sp-textfield').value
    ),
    ''
  );

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-pull] swc-close-button')
      .click()
  );
  await page.until(() => !window.model.browser.list().some((tab) => tab.id === 'tab-pull'));
  await page.until(
    () => !window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-pull]')
  );

  await page.evaluate(() => window.model.agent.send('cone-harbor', 'Open the units docs'));
  await page.until(() => window.model.browser.list().length === 4);
  await page.until(
    () =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-browser')
          .shadowRoot.querySelectorAll('.driver'),
      ].length === 2
  );

  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.getPanel('browser').api.maximize()
  );
  await page.until(
    () =>
      getComputedStyle(
        window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'ul')
      ).gridTemplateColumns.split(' ').length > 1
  );
  await shot(page, 'browser-grid-light');
  assert.deepEqual(page.errors, []);
});

test('the browser follows a driven tab live, lists its actions and stops the agent', async (t) => {
  const page = await open(t, { browser: 'driving' });
  await page.evaluate(() => {
    window.inBrowser = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-browser', selector);
    window.app.show('browser');
  });
  await page.until(() => window.inBrowser('figure')?.dataset.view === 'live');
  assert.equal(
    await page.evaluate(() => window.inBrowser('.driving swc-status-light').textContent.trim()),
    'harbor is using this tab'
  );
  assert.equal(
    await page.evaluate(() => window.inBrowser('.address .url').textContent.trim()),
    'localhost:8787/forecast'
  );
  await page.until(() => window.inBrowser('.actions.last li')?.dataset.status === 'running');
  assert.match(
    await page.evaluate(() => window.inBrowser('details summary').textContent.trim()),
    /^Recent actions \(\d+\)$/
  );
  assert.equal(
    await page.evaluate(() => window.inBrowser('li[data-kind=request]').title),
    'GET https://api.example.com/v2/tides'
  );
  await shot(page, 'browser-driving-light');

  await page.evaluate(() => window.inBrowser('.driving [data-action=stop-agent]').click());
  await page.until(() => window.inBrowser('.driving')?.dataset.driving === 'none');
  await page.until(() => window.inBrowser('.actions.last li')?.dataset.status === 'failed');
  assert.equal(
    await page.evaluate(() => window.inBrowser('.actions.last .failure').textContent.trim()),
    'Stopped'
  );

  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(
    () => !!window.inBrowser('li[data-id=tab-pull][data-controlled] [data-action=stop-agent]')
  );
  await page.evaluate(() => window.dock().close('browser'));
  await page.until(() => !!window.$('slicc-app', '.rail .badged .dot[data-driven]'));
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', '.rail [data-surface=browser]').getAttribute('accessible-label')
    ),
    'Open Browser, a tab is in use'
  );
  await page.evaluate(() => window.model.agent.stop('scoop-otter'));
  await page.until(() => !window.$('slicc-app', '.rail .badged .dot[data-driven]'));
  assert.deepEqual(page.errors, []);
});

for (const [width, height] of [
  [1280, 800],
  [420, 860],
]) {
  test(`the browser preview stays put while an agent starts and stops at ${width} px`, async (t) => {
    const page = await open(t, { browser: 'idle' });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
    if (width === 420)
      await page.until(() => document.querySelector('slicc-app').screen === 'phone');
    await page.evaluate(() => {
      window.inBrowser = (selector) =>
        window.$('slicc-app', 'slicc-dock', 'slicc-browser', selector);
      window.app.show('browser');
      return true;
    });
    await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .window'));
    await page.evaluate(() => window.inBrowser('li[data-id=tab-preview] .window').click());
    await page.until(() => window.inBrowser('.driving')?.dataset.driving === 'none');
    const measure = () =>
      page.evaluate(() => {
        const top = (selector) =>
          Math.round(window.inBrowser(selector).getBoundingClientRect().top);
        return {
          driving: top('.driving'),
          figure: top('figure'),
          actions: top('details, h3'),
          height: Math.round(window.inBrowser('.driving').getBoundingClientRect().height),
        };
      });
    const before = await measure();
    await page.evaluate(() =>
      window.model.browser.record({ tabId: 'tab-preview', agentId: 'cone-harbor', kind: 'scroll' })
    );
    await page.until(() => window.inBrowser('.driving')?.dataset.driving === 'agent');
    await page.until(() => !!window.inBrowser('.driving [data-action=stop-agent]'));
    const driven = await measure();
    assert.deepEqual(driven, before);
    await page.evaluate(() => window.inBrowser('.driving [data-action=stop-agent]').click());
    await page.until(() => window.inBrowser('.driving')?.dataset.driving === 'none');
    assert.deepEqual(await measure(), before);
    assert.deepEqual(page.errors, []);
  });
}

test('the browser says when browser control isn’t connected', async (t) => {
  const page = await open(t, { browser: 'off' });
  await page.evaluate(() => window.app.show('browser'));
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.offline[data-browser=none]')
  );
  assert.ok(
    await page.evaluate(
      () => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '[data-action=copy-command]')
    )
  );
  await shot(page, 'browser-off-light');
  assert.deepEqual(page.errors, []);
});

test('signing in to an account reads Signing in and can be cancelled', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(
    () => !!window.settingsPart('.account[data-id=adobe] swc-button[data-action=connect]')
  );
  await page.evaluate(() =>
    window.settingsPart('.account[data-id=adobe] swc-button[data-action=connect]').click()
  );
  await page.until(
    () => !!window.settingsPart('.account[data-id=adobe] swc-button[data-action=cancel-sign-in]')
  );
  assert.equal(
    await page.evaluate(() =>
      window.settingsPart('.account[data-id=adobe] swc-status-light').textContent.trim()
    ),
    'Signing in…'
  );
  await shot(page, 'signing-in');
  await page.evaluate(() =>
    window.settingsPart('.account[data-id=adobe] swc-button[data-action=cancel-sign-in]').click()
  );
  await page.until(
    () =>
      window.model.settings.accounts().find((account) => account.id === 'adobe').status ===
      'expired'
  );
  await page.until(
    () => !!window.settingsPart('.account[data-id=adobe] swc-button[data-action=connect]')
  );
  assert.equal(await page.evaluate(() => !!window.settingsPart('.failure')), false);
  assert.deepEqual(page.errors, []);
});

test('settings change the theme and the composer, and connect accounts', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'settings');
  await page.until(
    () =>
      !!window.$('slicc-app', 'slicc-dock', 'slicc-settings', '.account[data-id=openai] swc-button')
  );
  await shot(page, 'settings-light');

  await page.evaluate(() => {
    const picker = window.$('slicc-app', 'slicc-dock', 'slicc-settings', 'sp-picker[label=Theme]');
    picker.value = 'dark';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.until(() => window.$('slicc-app', 'sp-theme').getAttribute('color') === 'dark');
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-settings', 'sp-switch[data-setting=showThinking]')
      .click()
  );
  await page.until(() => window.model.settings.get().showThinking === false);

  await page.evaluate(() => window.settingsPart('.account[data-id=openai] swc-button').click());
  await page.until(() => !!window.settingsPart('form.key[data-id=openai] sp-textfield'));
  await page.until(() => /sp-textfield/i.test(window.focused()));
  await page.evaluate(() => {
    window.settingsPart('form.key[data-id=openai] sp-textfield').value = 'dummy-key-0000';
  });
  await shot(page, 'settings-api-key');
  const masked = await page.evaluate(() => {
    const field = window.settingsPart('form.key[data-id=openai] sp-textfield');
    return field.shadowRoot.querySelector('input').type;
  });
  assert.equal(masked, 'password');
  await page.evaluate(() =>
    window.settingsPart('form.key[data-id=openai] swc-button[data-action=save]').click()
  );
  await page.until(() =>
    window.settingsPart('.account[data-id=openai]').textContent.includes('Connected')
  );
  await page.until(() => !window.settingsPart('form.key'));
  const shown = await page.evaluate(() => window.settingsPart('.page').getRootNode().innerHTML);
  assert.ok(!shown.includes('dummy-key-0000'));
  assert.match(
    await page.evaluate(
      () => window.settingsPart('.account[data-id=openai] .identity').textContent
    ),
    /API key/
  );
  await page.evaluate(() => {
    window.model.settings.disconnect('openai');
  });
  await page.until(() =>
    window.settingsPart('.account[data-id=openai]').textContent.includes('Not connected')
  );
  await page.evaluate(() => window.settingsPart('.account[data-id=openai] swc-button').click());
  await page.until(() => !!window.settingsPart('form.key[data-id=openai] sp-textfield'));
  await page.evaluate(() => {
    const field = window.settingsPart('form.key[data-id=openai] sp-textfield');
    field.value = 'dummy-key-0001';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.until(() =>
    window.settingsPart('.account[data-id=openai]').textContent.includes('Connected')
  );
  await page.evaluate(() => window.model.settings.disconnect('openai'));
  await page.evaluate(() => window.settingsPart('.account[data-id=openai] swc-button').click());
  await page.until(() => !!window.settingsPart('form.key[data-id=openai]'));
  await page.evaluate(() =>
    window.settingsPart('form.key[data-id=openai] swc-button[data-action=cancel]').click()
  );
  await page.until(() => !window.settingsPart('form.key'));
  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-settings',
        '.account[data-id=github] swc-button[data-action=disconnect]'
      )
      .click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(
    () =>
      window.model.settings.accounts().find((account) => account.id === 'github').status ===
      'disconnected'
  );
  await shot(page, 'settings-dark');

  for (const width of [640, 420]) {
    await page.evaluate((px) => {
      window.settingsPart('.page').getRootNode().host.style.width = `${px}px`;
    }, width);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const overflow = await page.evaluate(() => {
      const host = window.settingsPart('.page').getRootNode().host;
      const edge = host.getBoundingClientRect().right;
      return [
        ...host.shadowRoot.querySelectorAll(
          'sp-picker, sp-switch, .account swc-button, .account swc-status-light'
        ),
      ]
        .filter((element) => element.getBoundingClientRect().right > edge + 0.5)
        .map((element) => element.getAttribute('label') ?? element.textContent.trim());
    });
    assert.deepEqual(overflow, [], `at ${width}px`);
  }
  await shot(page, 'settings-narrow');
  assert.deepEqual(page.errors, []);
});

test('terminal and browser in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.evaluate(() => window.app.show('browser'));
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.thumb img'));
  await shot(page, 'browser-dark');
  await page.press('5', 'alt');
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.type('cat README.md');
  await page.press('Enter');
  await page.until(() => window.screen().includes('A small forecast API'));
  await shot(page, 'terminal-dark');
  assert.deepEqual(page.errors, []);
});

const chat = (...path) => window.$('slicc-app', 'slicc-dock', 'slicc-chat', ...path);

test('tool cards show the command, its timeout, and an edit as a diff', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-harbor'));
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        ?.shadowRoot?.querySelector('.runs[data-runs=cluster] .strip > .label')?.textContent
  );
  const cards = await page.evaluate(async () => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const cluster = root.querySelector('.runs[data-runs=cluster]');
    const edit = cluster.querySelector('.tool[data-tool="edit_file"]');
    cluster.querySelector(`[data-action=open-run][aria-controls=${edit.id}]`).click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    window.clusterSummary = [
      cluster.querySelector('.strip').title,
      cluster.querySelector('.icons').getAttribute('aria-label'),
      cluster.querySelector('.strip > .label').textContent,
    ];
    return [...cluster.querySelectorAll('.tool')].map((card) => ({
      name: card.dataset.tool,
      meta: card.querySelector('.tool-meta')?.textContent ?? null,
      input: card.querySelector('pre.input')?.textContent ?? null,
      diff: card.querySelector('slicc-diff-view')?.getAttribute('path') ?? null,
    }));
  });
  assert.deepEqual(await page.evaluate(() => window.clusterSummary), [
    '2 commands, 1 read, 1 edit. Done',
    '2 commands, 1 read, 1 edit. Done',
    'Find and fix the stale cache entry',
  ]);
  assert.deepEqual(
    cards.find((card) => card.input === '$ npm test'),
    { name: 'bash', meta: 'timeout 120s', input: '$ npm test', diff: null }
  );
  assert.deepEqual(
    cards.find((card) => card.name === 'edit_file'),
    {
      name: 'edit_file',
      meta: null,
      input: null,
      diff: '/workspace/harbor/src/lib/cache.ts',
    }
  );
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('.tool slicc-diff-view')
      ?.shadowRoot?.querySelector('diffs-container')
      ?.shadowRoot?.textContent.includes('dayOf')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('.tool[data-tool="edit_file"]')
      .scrollIntoView({ block: 'start' })
  );
  await shot(page, 'tool-cards-light');
  await page.evaluate(() => window.model.settings.update({ color: 'dark' }));
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelector('.tool slicc-diff-view')
        ?.getAttribute('color') === 'dark'
  );
  await shot(page, 'tool-cards-dark');
  assert.deepEqual(page.errors, []);
});

test('tool runs cluster across messages, pick their icons, and open from the keyboard', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('[data-id=k-m8] slicc-tool-runs .runs'));
  const shape = await page.evaluate(() => {
    const root = window.chatPart().shadowRoot;
    const groups = (id) =>
      [...root.querySelectorAll(`[data-id=${id}] slicc-tool-runs > .runs`)].map((runs) => [
        runs.dataset.runs,
        runs.querySelectorAll('.tool').length,
        runs.dataset.status,
      ]);
    const icons = (index) =>
      [
        ...root
          .querySelectorAll('[data-id=k-m8] slicc-tool-runs')
          [index].querySelectorAll('.icons .chip'),
      ].map((chip) => [chip.dataset.icon, chip.dataset.target ?? null, chip.dataset.state]);
    const card = root.querySelector('.tool[data-id=k-tool1]');
    return {
      m3: groups('k-m3'),
      m8: groups('k-m8'),
      single: groups('k-tool2'),
      absorbed: !!root.querySelector('swc-conversation-turn[data-id=k-tool1]'),
      card: card?.id,
      ran: card?.querySelector('.call > .ran')?.textContent,
      first: icons(0),
      second: icons(1),
    };
  });
  assert.deepEqual(shape.m3, [['cluster', 17, 'running']]);
  assert.deepEqual(shape.m8, [
    ['cluster', 4, 'done'],
    ['cluster', 5, 'running'],
  ]);
  assert.deepEqual(shape.single, [['single', 1, 'done']]);
  assert.equal(shape.absorbed, false);
  assert.equal(shape.card, 'run-k-t15');
  assert.match(shape.ran, /^Ran at \d\d:\d\d$/);
  assert.deepEqual(shape.first, [
    ['favicon', 'api.example.com', 'done'],
    ['file', '/workspace/harbor/docs/forecast.md', 'done'],
    ['command', null, 'done'],
    ['read', null, 'done'],
  ]);
  assert.deepEqual(shape.second, [
    ['edit', null, 'done'],
    ['command', null, 'done'],
    ['file', 'src/lib/units.test.ts', 'error'],
    ['favicon', 'git.example.com', 'cancelled'],
    ['command', null, 'running'],
  ]);

  const focused = () => {
    const active = window.chatPart().shadowRoot.activeElement;
    return active ? (active.dataset.target ?? active.dataset.action ?? active.localName) : null;
  };
  const shown = () =>
    [
      ...window
        .chatPart()
        .shadowRoot.querySelectorAll('[data-id=k-m8] slicc-tool-runs')[1]
        .querySelectorAll('.cards > .slot'),
    ].map((slot) => (slot.hidden ? '-' : 'open'));
  await page.evaluate(() =>
    window.chatPart().shadowRoot.querySelector('[data-action=open-run][data-target=k-r5]').focus()
  );
  await page.press('Tab');
  await page.press('Tab');
  assert.equal(await page.evaluate(focused), 'k-r7');
  assert.equal(
    await page.evaluate(() =>
      window.chatPart().shadowRoot.activeElement.getAttribute('aria-label')
    ),
    'Run the unit tests, Failed'
  );
  await page.press('Enter');
  await page.until(
    () => window.chatPart('[data-target=k-r7]').getAttribute('aria-expanded') === 'true'
  );
  assert.deepEqual(await page.evaluate(shown), ['-', '-', 'open', '-', '-']);
  assert.match(
    await page.evaluate(() => window.chatPart('#run-k-r7 pre.input').textContent),
    /^\$ npx vitest run src\/lib\/units\.test\.ts$/
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const card = window.chatPart('#run-k-r7');
      return [
        card.localName,
        card.getAttribute('role'),
        card.getAttribute('aria-label'),
        card.querySelectorAll('summary, .chevron, .chip, .title, .state').length,
        card.textContent.includes('bash'),
      ];
    }),
    ['div', 'region', 'Run the unit tests, Failed', 0, false]
  );
  await page.press(' ');
  await page.until(
    () => window.chatPart('[data-target=k-r7]').getAttribute('aria-expanded') === 'false'
  );
  await page.press('Tab');
  await page.press('Tab');
  await page.press('Tab');
  assert.equal(await page.evaluate(focused), 'open-cluster');
  await page.evaluate(() => {
    window.everyRun = () =>
      window
        .chatPart()
        .shadowRoot.querySelectorAll('[data-id=k-m8] slicc-tool-runs')[1]
        .querySelector('[data-action=open-cluster]')
        .getAttribute('aria-expanded');
  });
  await page.press('Enter');
  await page.until(() => window.everyRun() === 'true');
  assert.deepEqual(await page.evaluate(shown), ['open', 'open', 'open', 'open', 'open']);
  await page.press(' ');
  await page.until(() => window.everyRun() === 'false');
  assert.deepEqual(await page.evaluate(shown), ['-', '-', '-', '-', '-']);
  await page.until(() =>
    [
      ...window.chatPart().shadowRoot.querySelectorAll('[data-id=k-m8] slicc-tool-runs .label'),
    ].every((label) => label.textContent)
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window.chatPart().shadowRoot.querySelectorAll('[data-id=k-m8] slicc-tool-runs .strip'),
      ].map((strip) => [strip.title, strip.querySelector('.label').textContent])
    ),
    [
      ['3 commands, 1 read. Done', 'Compare the docs with the live API'],
      [
        '4 commands, 1 edit. Running, 1 failed, 1 cancelled',
        'Move the forecast docs to Celsius, then build and test the site',
      ],
    ]
  );

  await page.evaluate(() => window.chatPart('[data-id=k-tool2] details.run > summary').focus());
  await page.press('Enter');
  await page.until(() => window.chatPart('[data-id=k-tool2] details.run').open === true);
  assert.equal(
    await page.evaluate(() =>
      window.chatPart('[data-id=k-tool2] details.run > summary').getAttribute('aria-label')
    ),
    'Check the preview port, Done'
  );
  assert.equal(
    await page.evaluate(
      () =>
        window
          .chatPart('[data-id=k-tool2] details.run > summary')
          .querySelectorAll('.chevron, .name').length
    ),
    0
  );
  await page.press(' ');
  await page.until(() => window.chatPart('[data-id=k-tool2] details.run').open === false);

  const motion = () => {
    const chip = window.chatPart('[data-target=k-r9] .chip');
    const face = getComputedStyle(chip.querySelector('.face'));
    return [face.animationName, getComputedStyle(chip).outlineStyle];
  };
  assert.deepEqual(await page.evaluate(motion), ['run-pulse', 'none']);
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.deepEqual(await page.evaluate(motion), ['none', 'dashed']);
  await page.send('Emulation.setEmulatedMedia', { features: [] });
  assert.deepEqual(page.errors, []);
});

test('a growing run keeps its place, shows its newest five runs and its label, and stacks on a narrow panel', async (t) => {
  const page = await open(t, { delay: '30' });
  const viewport = (width) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await viewport(1280);
  await page.evaluate(() => window.model.agent.select('cone-harbor'));
  await page.until(() => !!window.chatPart('.runs[data-runs=cluster]'));
  await page.evaluate(() => {
    window.growth = [];
    const record = () => {
      const turn = window
        .chatPart()
        .shadowRoot.querySelector('swc-conversation-turn.assistant[data-status]:last-of-type');
      const runs = turn?.querySelector('.runs[data-runs=cluster]');
      if (runs) {
        const box = runs.querySelector('.strip').getBoundingClientRect();
        const entry = [
          runs.querySelectorAll('.icons > .run').length,
          Math.round(box.left),
          Math.round(box.width),
          Math.round(box.height),
        ].join(' ');
        if (window.growth.at(-1) !== entry) window.growth.push(entry);
      }
      window.growing = requestAnimationFrame(record);
    };
    record();
    void window.model.agent.send('cone-harbor', 'Investigate the Celsius bug');
  });
  await page.until(
    () =>
      window
        .chatPart('swc-conversation-turn.assistant:last-of-type')
        ?.querySelectorAll('.runs[data-runs=cluster] .icons > .run[data-status=done]').length === 7
  );
  const growth = await page.evaluate(() => {
    cancelAnimationFrame(window.growing);
    return window.growth;
  });
  assert.deepEqual(
    growth.map((entry) => entry.split(' ')[0]),
    ['3', '4', '5', '6', '7']
  );
  assert.equal(new Set(growth.map((entry) => entry.split(' ').slice(1).join(' '))).size, 1);
  await page.until(
    () =>
      window.chatPart('swc-conversation-turn.assistant:last-of-type .runs .strip > .label')
        ?.textContent === 'Find why Celsius requests get Fahrenheit'
  );
  const geometry = () => {
    const runs = window.chatPart('swc-conversation-turn.assistant:last-of-type .runs');
    const strip = runs.querySelector('.strip').getBoundingClientRect();
    const icons = runs.querySelector('.icons');
    const box = icons.getBoundingClientRect();
    const label = runs.querySelector('.label').getBoundingClientRect();
    const buttons = [...icons.children].map((button) => button.getBoundingClientRect());
    const shown = buttons.filter((b) => b.right > box.left + 1 && b.left < box.right - 1);
    return {
      shown: shown.length,
      whole: shown.every((b) => b.left >= box.left - 0.5 && b.right <= box.right + 0.5),
      newest: buttons.at(-1).right <= box.right + 0.5,
      start: Math.round(box.left - strip.left),
      end: Math.round(strip.right - label.right),
      stacked: label.top >= box.bottom,
      margins: Math.round(
        strip.left - runs.parentElement.parentElement.getBoundingClientRect().left
      ),
    };
  };
  const wide = await page.evaluate(geometry);
  assert.deepEqual(
    [wide.shown, wide.whole, wide.newest, wide.stacked],
    [5, true, true, false],
    JSON.stringify(wide)
  );
  assert.ok(wide.start < 8 && wide.end < 16, JSON.stringify(wide));
  await page.evaluate(() =>
    window
      .chatPart('swc-conversation-turn.assistant:last-of-type .runs .icons > .run:last-child')
      .click()
  );
  const edges = () => {
    const runs = window.chatPart('swc-conversation-turn.assistant:last-of-type .runs');
    const strip = runs.querySelector('.strip').getBoundingClientRect();
    const input = runs
      .querySelector('.cards > .slot:not([hidden]) pre.input')
      .getBoundingClientRect();
    return [strip.left - input.left, strip.right - input.right].map(Math.round);
  };
  assert.deepEqual(await page.evaluate(edges), [0, 0]);
  await shot(page, 'tool-runs-growing');

  await viewport(420);
  await page.until(() => window.app.getAttribute('screen') === 'phone');
  await page.until(
    () => !!window.chatPart('swc-conversation-turn.assistant:last-of-type .runs .strip > .label')
  );
  const narrow = await page.evaluate(geometry);
  assert.deepEqual(
    [narrow.shown, narrow.whole, narrow.newest, narrow.stacked],
    [7, true, true, true],
    JSON.stringify(narrow)
  );
  assert.deepEqual(await page.evaluate(edges), [0, 0]);
  await page.evaluate(() =>
    window
      .chatPart('swc-conversation-turn.assistant:last-of-type .runs')
      .scrollIntoView({ block: 'center' })
  );
  await shot(page, 'tool-runs-phone');
  assert.deepEqual(page.errors, []);
});

test('the kitchen sink shows every kind of message, content and lick', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.lick'));
  const kinds = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const count = (selector) => root.querySelectorAll(selector).length;
    return {
      channels: [
        ...new Set([...root.querySelectorAll('.lick')].map((lick) => lick.dataset.channel)),
      ].length,
      user: count('.message.user'),
      steered: count('.message.user[data-mode=steer]'),
      assistant: count('.message.assistant'),
      tool: count('.message.tool-message'),
      cluster: count('.runs[data-runs=cluster]'),
      markers: count('.marker'),
      errors: count('.error-card'),
      notices: count('.notice'),
      days: count('.day'),
      attachments: count('.attachment'),
      media: count('.gallery .media') + count('.gallery .audio'),
      cards: count('.card'),
      plan: count('.plan'),
      check: count('ul.check li'),
      diff: count('.inline-diff slicc-diff-view'),
      questions: count('.question'),
      delegations: count('.delegation'),
      links: count('.link-card'),
      tables: count('.text table'),
      code: count('.text pre'),
      tasks: count('.task'),
      quotes: count('.text blockquote'),
      queued: window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer')
        .shadowRoot.querySelectorAll('.queued').length,
    };
  });
  assert.deepEqual(kinds, {
    channels: 17,
    user: 6,
    steered: 1,
    assistant: 8,
    tool: 1,
    cluster: 3,
    markers: 3,
    errors: 3,
    notices: 1,
    days: 2,
    attachments: 5,
    media: 5,
    cards: 0,
    plan: 0,
    check: 0,
    diff: 0,
    questions: 3,
    delegations: 4,
    links: 0,
    tables: 1,
    code: 1,
    tasks: 2,
    quotes: 1,
    queued: 2,
  });
  for (const [index, fraction] of [0, 0.25, 0.5, 0.75, 1].entries()) {
    await page.evaluate((fraction) => {
      const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
      log.scrollTop = (log.scrollHeight - log.clientHeight) * fraction;
    }, fraction);
    await shot(page, `kitchen-sink-light-${index + 1}`);
  }

  const cards = await page.evaluate(async () => {
    const chat = window.$('slicc-app', 'slicc-dock', 'slicc-chat');
    chat.style.width = '400px';
    await new Promise((resolve) => setTimeout(resolve, 100));
    const all = [...chat.shadowRoot.querySelectorAll('.error-card')];
    all.at(0).scrollIntoView({ block: 'center' });
    return all.map((card) => {
      const button = card.querySelector('swc-button');
      return {
        lead: card.querySelector('.lead, strong')?.textContent.trim(),
        alert: card.getAttribute('role') === 'alert',
        announced: card.textContent.replace(/\s+/g, ' ').trim().startsWith('Error: '),
        icon: card.querySelector('swc-icon-alert-diamond')?.getAttribute('aria-hidden') === 'true',
        bold: Number(getComputedStyle(card.querySelector('.lead')).fontWeight) >= 700,
        detail: card.querySelector('.detail')?.textContent.trim() ?? null,
        oneLine: !button || button.getBoundingClientRect().height < 34,
        inside:
          !button ||
          button.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5,
      };
    });
  });
  assert.ok(
    cards.every(
      (card) =>
        card.oneLine && card.inside && card.alert && card.announced && card.icon && card.bold
    ),
    JSON.stringify(cards)
  );
  assert.ok(
    cards.some(
      (card) =>
        card.lead === 'The request is too large for this model.' &&
        card.detail === 'The model returned 413: the request is larger than its context window.'
    )
  );
  await shot(page, 'error-cards-narrow');
  const stacked = await page.evaluate(async () => {
    const chat = window.$('slicc-app', 'slicc-dock', 'slicc-chat');
    chat.style.width = '300px';
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [...chat.shadowRoot.querySelectorAll('.error-card')]
      .filter((card) => card.querySelector('swc-button') && card.querySelector('.detail'))
      .map((card) => {
        const box = card.getBoundingClientRect();
        const button = card.querySelector('swc-button').getBoundingClientRect();
        const detail = card.querySelector('.detail').getBoundingClientRect();
        return {
          below: button.top >= detail.bottom - 0.5,
          inside: button.right <= box.right + 0.5 && button.bottom <= box.bottom + 0.5,
          wide: detail.width > box.width / 2,
        };
      });
  });
  assert.ok(stacked.length > 0);
  assert.ok(
    stacked.every((card) => card.below && card.inside && card.wide),
    JSON.stringify(stacked)
  );
  await shot(page, 'error-cards-stacked');
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-chat').style.width = '';
  });

  await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('.question[data-state=open] swc-button'),
    ]
      .find((button) => button.textContent.trim() === 'Move it to KV')
      .click()
  );
  await page.until(
    () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.question[data-state=open]') === null
  );
  await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('.decision[data-kind=approval] swc-button'),
    ]
      .find((button) => button.textContent.trim() === 'Allow')
      .click()
  );
  await page.until(
    () =>
      window.model.agent.messages('cone-kitchen').find((message) => message.id === 'k-l17')
        .state === 'confirmed'
  );
  await page.evaluate(() => window.model.settings.update({ color: 'dark' }));
  for (const [index, fraction] of [0, 0.5, 1].entries()) {
    await page.evaluate((fraction) => {
      const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
      log.scrollTop = (log.scrollHeight - log.clientHeight) * fraction;
    }, fraction);
    await shot(page, `kitchen-sink-dark-${index + 1}`);
  }
  assert.deepEqual(page.errors, []);
});

test('compaction and notices are full-width dividers that screen readers still hear', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('[data-id=k-s2]'));
  const dividers = await page.evaluate(() => {
    const root = window.chatPart().shadowRoot;
    const read = (divider) => {
      const text = divider.querySelector('.marker-text');
      const hidden = text.querySelector('.sr')?.textContent ?? '';
      const [start, end] = [...divider.querySelectorAll(':scope > .line')].map(
        (line) => line.getBoundingClientRect().width
      );
      return {
        role: divider.getAttribute('role'),
        shown: text.textContent.replace(hidden, '').replace(/\s+/g, ' ').trim(),
        heard: text.textContent.replace(/\s+/g, ' ').trim(),
        lines: start > 20 && end > 20 && Math.abs(start - end) < 1,
        fault: text.querySelector('.fault')?.getAttribute('aria-hidden') ?? null,
        label: divider.closest('swc-conversation-turn').getAttribute('accessible-label'),
      };
    };
    return [
      read(root.querySelector('.marker[data-id=k-s1]')),
      read(root.querySelector('.marker[data-id=k-s2]')),
      read(root.querySelector('.marker.notice')),
    ];
  });
  assert.deepEqual(dividers, [
    {
      role: 'status',
      shown: 'Context compacted',
      heard: 'Context compacted. 58 earlier messages were summarized.',
      lines: true,
      fault: null,
      label: 'Context compacted',
    },
    {
      role: 'status',
      shown: 'Compaction failed, transcript truncated',
      heard:
        'Compaction failed, transcript truncated. The summary failed, so the oldest 20 messages were dropped instead.',
      lines: true,
      fault: 'true',
      label: 'Compaction failed, transcript truncated',
    },
    {
      role: 'note',
      shown: 'Model changed to Claude Opus 5.5 (Anthropic)',
      heard: 'Model changed to Claude Opus 5.5 (Anthropic)',
      lines: true,
      fault: null,
      label: 'Notice',
    },
  ]);
  await page.evaluate(() =>
    window.chatPart().shadowRoot.querySelector('[data-id=k-s1]').scrollIntoView({ block: 'center' })
  );
  await shot(page, 'dividers');
  await page.evaluate(() => {
    const agent = window.model.agent;
    const messages = agent.messages.bind(agent);
    agent.messages = (id) =>
      id !== 'cone-kitchen'
        ? messages(id)
        : [
            ...messages(id),
            {
              id: 'dv-gone',
              role: 'system',
              kind: 'compaction',
              text: 'The oldest 12 messages were dropped.',
              state: 'discarded',
              createdAt: Date.now(),
            },
          ];
    agent.emit('messages', 'cone-kitchen');
  });
  await page.until(() => !!window.chatPart('[data-id=dv-gone]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const divider = window.chatPart('[data-id=dv-gone]');
      return [
        divider.closest('swc-conversation-turn').getAttribute('accessible-label'),
        divider.querySelector('.marker-text').textContent.trim(),
        divider.querySelector('.fault')?.getAttribute('aria-hidden') ?? null,
      ];
    }),
    ['Context discarded', 'Context discarded. The oldest 12 messages were dropped.', 'true']
  );
  const narrow = await page.evaluate(async () => {
    const chat = window.chatPart();
    chat.style.width = '300px';
    await new Promise((resolve) => setTimeout(resolve, 100));
    const divider = chat.shadowRoot.querySelector('.marker.notice');
    divider.scrollIntoView({ block: 'center' });
    return {
      wrapped: divider.querySelector('.marker-text').getBoundingClientRect().height > 30,
      lines: [...divider.querySelectorAll(':scope > .line')].map(
        (line) => line.getBoundingClientRect().width >= 12
      ),
    };
  });
  assert.deepEqual(narrow, { wrapped: true, lines: [true, true] });
  await shot(page, 'dividers-narrow');
  assert.deepEqual(page.errors, []);
});

test('times show every two minutes, each day starts with one, and hidden times and usage stay reachable', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const agent = window.model.agent;
    const messages = agent.messages.bind(agent);
    const midnight = new Date(2026, 9, 5).getTime();
    const minute = 60_000;
    const usage = { input: 1200, output: 34, cost: 0.5 };
    agent.messages = (id) =>
      id !== 'cone-sliccy'
        ? messages(id)
        : [
            { id: 'st-a', role: 'user', text: 'Late question', createdAt: midnight - 1.5 * minute },
            {
              id: 'st-b',
              role: 'assistant',
              status: 'done',
              parts: [{ type: 'text', text: 'Late answer' }],
              usage,
              createdAt: midnight - minute,
            },
            {
              id: 'st-c',
              role: 'lick',
              channel: 'cron',
              title: 'Nightly',
              text: 'ran',
              createdAt: midnight - minute / 2,
            },
            { id: 'st-d', role: 'user', text: 'Still here', createdAt: midnight + 1000 },
            { id: 'st-e', role: 'user', text: 'Hello again', createdAt: midnight + minute },
            { id: 'st-f', role: 'user', text: 'Later', createdAt: midnight + 3 * minute },
          ];
    agent.emit('messages', 'cone-sliccy');
    return true;
  });
  await page.until(() => !!window.chatPart('[data-id=st-f]'));
  const seen = await page.evaluate(() => {
    const root = window.chatPart().shadowRoot;
    const ids = ['st-a', 'st-b', 'st-c', 'st-d', 'st-e', 'st-f'];
    const reply = root.querySelector('swc-conversation-turn[data-id=st-b]');
    return {
      shown: ids.filter((id) =>
        root.querySelector(
          `[data-id=${id}] .meta time.when, .lick-turn:has(.lick[data-id=${id}]) .meta time.when`
        )
      ),
      reachable: ids.filter((id) =>
        root.querySelector(
          `[data-id=${id}] time[datetime], .lick-turn:has(.lick[data-id=${id}]) time[datetime]`
        )
      ),
      days: root.querySelectorAll('.day').length,
      empty: !root.querySelector('[data-id=st-b] .meta'),
      title: root.querySelector('[data-id=st-b] .reply')?.getAttribute('title'),
      description: reply?.getAttribute('aria-description'),
    };
  });
  assert.deepEqual(seen, {
    shown: ['st-a', 'st-d', 'st-f'],
    reachable: ['st-a', 'st-b', 'st-c', 'st-d', 'st-e', 'st-f'],
    days: 2,
    empty: true,
    title: '1,200 in · 34 out · $0.50',
    description: '1,200 in · 34 out · $0.50',
  });
});

test('licks sit on the right with a byline, a quiet chevron on their toggle and named reaction pills', async (t) => {
  const page = await open(t, { delay: '0' });
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('.lick[data-id=k-l19]'));
  const seen = await page.evaluate(() => {
    const root = window.chatPart().shadowRoot;
    const turns = [...root.querySelectorAll('.lick-turn')];
    const turn = (id) => root.querySelector(`.lick[data-id=${id}]`).closest('.lick-turn');
    const pills = (id) =>
      [...turn(id).querySelectorAll('.reactions .reaction')].map((pill) => [
        pill.textContent,
        pill.title,
        pill.getAttribute('aria-hidden'),
      ]);
    const thread = root.querySelector('swc-conversation-thread').getBoundingClientRect();
    return {
      right: turns.every((node) => {
        const box = node.querySelector('.bubble').getBoundingClientRect();
        return thread.right - box.right < 48 && box.left > thread.left + 48;
      }),
      bylines: turns.every((node) => node.querySelector('.bubble > .meta > .who')),
      named: turns.every((node) => {
        const pill = node.querySelector('.reaction');
        return pill.title && pill.getAttribute('aria-hidden') === 'true';
      }),
      webhook: pills('k-l1'),
      allowed: pills('k-l18'),
      denied: pills('k-l19'),
      spoken: ['k-l18', 'k-l19'].map((id) =>
        [...turn(id).querySelectorAll('.lick-head .sr')].map((node) => node.textContent).join('')
      ),
      times: turn('k-l2').querySelector('.times').textContent,
      chevron: !!root.querySelector(
        'details.lick[data-id=k-l1] > summary .chevron[aria-hidden=true]'
      ),
      plain: root.querySelector('div.lick[data-id=k-l2] .chevron'),
    };
  });
  assert.deepEqual(seen, {
    right: true,
    bylines: true,
    named: true,
    webhook: [['🪝', 'Webhook', 'true']],
    allowed: [
      ['🔐', 'Permission', 'true'],
      ['👍', 'Allowed', 'true'],
    ],
    denied: [
      ['🔐', 'Permission', 'true'],
      ['👎', 'Denied', 'true'],
    ],
    spoken: ['Allowed. ', 'Denied. '],
    times: '×3',
    chevron: true,
    plain: null,
  });
  const state = () => {
    const lick = window.chatPart('details.lick[data-id=k-l1]');
    return [
      lick.open,
      getComputedStyle(lick.querySelector('summary .chevron')).transform !== 'none',
    ];
  };
  await page.evaluate(() => {
    window.chatPart('details.lick[data-id=k-l1] > summary').focus();
    return true;
  });
  await page.press('Enter');
  await page.until(() => window.chatPart('details.lick[data-id=k-l1]').open);
  assert.deepEqual(await page.evaluate(state), [true, true]);
  await page.evaluate(() => {
    window.chatPart('details.lick[data-id=k-l1] > pre').click();
    return true;
  });
  assert.deepEqual(await page.evaluate(state), [true, true]);
  await page.press(' ');
  await page.until(() => !window.chatPart('details.lick[data-id=k-l1]').open);
  assert.deepEqual(await page.evaluate(state), [false, false]);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => window.chatPart().getBoundingClientRect().width <= 420);
  const spill = await page.evaluate(() => {
    const root = window.chatPart().shadowRoot;
    return [...root.querySelectorAll('.lick-frame')]
      .filter((frame) => {
        const box = frame.getBoundingClientRect();
        const bubble = frame.parentElement.getBoundingClientRect();
        return box.left < bubble.left - 1 || box.right > bubble.right + 1;
      })
      .map((frame) => frame.querySelector('.lick').dataset.id);
  });
  assert.deepEqual(spill, []);
  assert.deepEqual(page.errors, []);
});

test('decision cards pile at the top, reveal from the keyboard and leave the pile with focus kept', async (t) => {
  const page = await open(t, { delay: '0' });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('.decision-turn[data-id=k-l17]'));
  const bottom = () => {
    const log = window.chatPart('.log');
    log.scrollTop = log.scrollHeight;
    return true;
  };
  const pile = () => {
    const root = window.chatPart().shadowRoot;
    const log = root.querySelector('.log');
    const front = root.querySelector('.decision-turn[data-pinned]:not([style*="--depth: 1"])');
    return {
      cards: [...root.querySelectorAll('.decision-turn[data-pending]')].map((turn) => [
        turn.dataset.id,
        turn.hasAttribute('data-pinned'),
        getComputedStyle(turn).filter,
      ]),
      padding: Number.parseFloat(log.style.getPropertyValue('--pile')),
      front: front
        ? Math.round(front.getBoundingClientRect().bottom - log.getBoundingClientRect().top)
        : 0,
      still: getComputedStyle(root.querySelector('.decision-turn')).transitionDuration,
      focus: root.activeElement?.closest?.('[data-id]')?.dataset.id ?? null,
    };
  };
  await page.evaluate(bottom);
  await page.until(() =>
    window.chatPart('.decision-turn[data-id=k-l17]').hasAttribute('data-pinned')
  );
  const stuck = await page.evaluate(pile);
  assert.deepEqual(stuck.cards, [
    ['k-q3', true, 'blur(0.6px)'],
    ['k-l17', true, 'blur(0px)'],
  ]);
  assert.ok(stuck.padding > 0 && Math.abs(stuck.padding - stuck.front) <= 1);
  assert.equal(stuck.still, '0s');
  const timer = await page.evaluate(() => {
    const head = window.chatPart('.decision-turn[data-id=k-l17] .decision-head');
    return [
      head.querySelector('.timer').getAttribute('aria-hidden'),
      head.querySelector('.timer + .sr').textContent,
    ];
  });
  assert.equal(timer[0], 'true');
  assert.match(timer[1], /^Expires at \d\d:\d\d$/);

  await page.evaluate(() => {
    window.chatPart('.decision-turn[data-id=k-l17]').focus();
    return true;
  });
  const before = await page.evaluate(() => window.chatPart('.log').scrollTop);
  await page.press('Enter');
  await page.until(
    () => !window.chatPart('.decision-turn[data-id=k-l17]').hasAttribute('data-pinned')
  );
  const shown = await page.evaluate(pile);
  assert.ok((await page.evaluate(() => window.chatPart('.log').scrollTop)) < before);
  assert.deepEqual(
    shown.cards.find(([id]) => id === 'k-l17'),
    ['k-l17', false, 'none']
  );
  assert.equal(shown.focus, 'k-l17');

  await page.evaluate(bottom);
  await page.until(
    () => window.chatPart('.decision-turn[data-id=k-q3]').style.getPropertyValue('--depth') === '1'
  );
  await page.evaluate(() => {
    window
      .chatPart('.decision-turn[data-id=k-q3] swc-button, .decision-turn[data-id=k-q3] input')
      .focus();
    return true;
  });
  await page.until(
    () => !window.chatPart('.decision-turn[data-id=k-q3]').hasAttribute('data-pinned')
  );

  await page.evaluate(bottom);
  await page.until(() =>
    window.chatPart('.decision-turn[data-id=k-l17]').hasAttribute('data-pinned')
  );
  await page.evaluate(() => {
    window.chatPart('.decision-turn[data-id=k-l17] swc-button[data-action=allow]').focus();
    return true;
  });
  await page.press('Enter');
  await page.until(() => !window.chatPart('.decision-turn[data-id=k-l17]'));
  assert.equal(
    await page.evaluate(() => window.chatPart().shadowRoot.activeElement?.dataset.id),
    'k-q3'
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.model.agent.messages('cone-kitchen').find((message) => message.id === 'k-l17').state
    ),
    'confirmed'
  );

  const elsewhere = await page.evaluate(() => {
    const agent = window.model.agent;
    agent.lick('cone-kitchen', 'sudo-request', 'harbor', 'Wants to read the deploy key');
    const message = agent.messages('cone-kitchen').at(-1);
    message.state = 'pending';
    agent.emit('messages', 'cone-kitchen');
    return message.id;
  });
  await page.until(
    (card) => !!window.chatPart(`.decision-turn[data-id=${card}] swc-button[data-action=allow]`),
    elsewhere
  );
  await page.evaluate((card) => {
    window.chatPart(`.decision-turn[data-id=${card}] swc-button[data-action=allow]`).focus();
    window.model.agent.resolveLick('cone-kitchen', card, 'dismissed');
    return true;
  }, elsewhere);
  await page.until(
    (card) =>
      !window.chatPart(`.decision-turn[data-id=${card}]`) &&
      window.chatPart().shadowRoot.activeElement?.dataset.id === 'k-q3',
    elsewhere
  );

  const id = await page.evaluate(() => {
    const agent = window.model.agent;
    agent.lick('cone-kitchen', 'sudo-request', 'tide-runner', 'Wants to run npm publish');
    const message = agent.messages('cone-kitchen').at(-1);
    message.state = 'pending';
    message.expiresAt = Date.now() + 2500;
    agent.emit('messages', 'cone-kitchen');
    return message.id;
  });
  await page.until(
    (card) => !!window.chatPart(`.decision-turn[data-id=${card}] swc-button[data-action=deny]`),
    id
  );
  assert.equal(
    await page.evaluate(
      (card) => window.chatPart(`.decision-turn[data-id=${card}] .timer + .sr`).textContent,
      id
    ),
    'Less than a minute left'
  );
  await page.evaluate((card) => {
    window.chatPart(`.decision-turn[data-id=${card}] swc-button[data-action=deny]`).focus();
    return true;
  }, id);
  await page.until(
    (card) => window.chatPart(`.decision-turn[data-id=${card}]`).hasAttribute('data-expired'),
    id
  );
  const expired = await page.evaluate((card) => {
    const turn = window.chatPart(`.decision-turn[data-id=${card}]`);
    return [
      turn.hasAttribute('data-pending'),
      !!turn.querySelector('swc-button'),
      turn.querySelector('.timer').textContent,
      turn.querySelector('.timer + .sr').textContent,
    ];
  }, id);
  assert.deepEqual(expired, [false, false, 'Timed out', 'Timed out']);
  await page.until(() => window.chatPart().shadowRoot.activeElement?.dataset.id === 'k-q3');
  const late = await page.evaluate(() => {
    const agent = window.model.agent;
    agent.lick('cone-kitchen', 'sudo-request', 'quiet-otter', 'Wants to tag 1.9.0');
    const message = agent.messages('cone-kitchen').at(-1);
    message.state = 'pending';
    agent.emit('messages', 'cone-kitchen');
    return message.id;
  });
  await page.until((card) => !!window.chatPart(`.decision-turn[data-id=${card}]`), late);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.chatPart().shadowRoot.querySelectorAll('.decision-turn[data-pending]')].map(
        (turn) => [turn.dataset.id, turn.style.getPropertyValue('--stack').trim()]
      )
    ),
    [
      ['k-q3', '0'],
      [late, '1'],
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('the composer runs commands, mentions, attaches, queues and steers', async (t) => {
  const page = await open(t, { delay: '20' });
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));

  await page.insert('/comp');
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        '.popup .item[data-value=compact]'
      )
  );
  await shot(page, 'composer-commands');
  await page.press('Enter');
  await page.press('Enter');
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some((message) => message.role === 'system' && message.state === 'summarized')
  );

  await page.insert('Ask @tid');
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        '.popup[data-kind=mention] .item[data-value=tidal-wren]'
      )
  );
  await page.press('Tab');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === 'Ask @tidal-wren '
  );

  await page.evaluate(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>';
    const data = new DataTransfer();
    data.items.add(new File([svg], 'pasted.svg', { type: 'image/svg+xml' }));
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field', 'textarea')
      .dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          composed: true,
          cancelable: true,
        })
      );
  });
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-upload-attachment[data-kind=image]'
      )
  );
  await shot(page, 'composer-attachment');
  await page.insert('to run the tests');
  await page.press('Enter');
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some((message) => message.role === 'user' && message.attachments?.[0]?.kind === 'image')
  );
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('.message.user .attachment').length === 1
  );

  await page.until(() => window.model.agent.busy('cone-sliccy') === false);
  await page.insert('Run the tests');
  await page.press('Enter');
  await page.until(() => window.model.agent.busy('cone-sliccy'));
  await page.insert('Then open the docs');
  await page.press('Enter', 'ctrl');
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.queued')
  );
  await shot(page, 'composer-queued');
  await page.insert('Show me the files too');
  await page.until(() => {
    const field = window.$(
      'slicc-app',
      'slicc-dock',
      'slicc-chat',
      'slicc-composer',
      'swc-prompt-field'
    );
    return field.getAttribute('send-label') === 'Steer' && !field.hasAttribute('generating');
  });
  await shot(page, 'composer-steer');
  await page.press('Enter');
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some((message) => message.role === 'user' && message.delivered === 'steer')
  );
  await page.until(
    () =>
      window.model.agent.busy('cone-sliccy') === false &&
      window.model.agent.queue('cone-sliccy').length === 0
  );
  const delivered = await page.evaluate(() => {
    const turns = [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('.message.user[data-origin=user]'),
    ];
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    let last = -Infinity;
    let spaced = true;
    for (const node of root.querySelectorAll('.day, .meta time.when')) {
      if (node.classList.contains('day')) {
        last = -Infinity;
        continue;
      }
      const at = Date.parse(node.getAttribute('datetime'));
      if (at - last < 120000) spaced = false;
      last = at;
    }
    return {
      kinds: [...new Set(turns.map((turn) => turn.dataset.delivered))].sort(),
      labels: turns.filter((turn) => turn.querySelector('.who, .tag')).length,
      times: turns.every((turn) => turn.querySelector('time[datetime]')),
      hidden: turns.some((turn) => !turn.querySelector('.meta')),
      spaced,
    };
  });
  assert.deepEqual(delivered, {
    kinds: ['follow-up', 'run', 'steer'],
    labels: 0,
    times: true,
    hidden: true,
    spaced: true,
  });
  await shot(page, 'composer-delivered');

  await page.press('ArrowUp');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === 'Then open the docs'
  );
  await page.press('ArrowDown');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === ''
  );
  await page.until(() => !!window.model.agent.suggestion('cone-sliccy'));
  await page.press('Tab');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === window.model.agent.suggestion('cone-sliccy')
  );
  assert.deepEqual(page.errors, []);
});

async function dropFiles(t, color, width) {
  const page = await open(t, { color });
  if (width) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.until(() => window.app.getAttribute('screen') === 'phone');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer'));
  await page.evaluate(() => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ),
      (char) => char.charCodeAt(0)
    );
    window.dropBytes = [0, 1, 2, 127, 128, 254, 255];
    window.dropTransfer = () => {
      const data = new DataTransfer();
      data.items.add(new File([png], 'harbor.png', { type: 'image/png' }));
      data.items.add(new File(['tide tables\n'], 'tides.txt', { type: 'text/plain' }));
      data.items.add(
        new File([new Uint8Array(window.dropBytes)], 'buoy.bin', {
          type: 'application/octet-stream',
        })
      );
      return data;
    };
    window.drag = (type, target, dataTransfer) =>
      target.dispatchEvent(
        new DragEvent(type, {
          dataTransfer,
          bubbles: true,
          composed: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        })
      );
    const pane = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
    const data = window.dropTransfer();
    window.drag('dragenter', pane, data);
    window.drag('dragover', pane, data);
    return true;
  });
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'swc-dropzone[dragged]')
  );
  await shot(page, `attach-drop-${width ?? 1280}-${color}`);
  await page.evaluate(() =>
    window.drag(
      'drop',
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log'),
      window.dropTransfer()
    )
  );
  await page.until(
    () =>
      !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'swc-dropzone') &&
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').attachments.length === 3
  );
  await shot(page, `attach-three-${width ?? 1280}-${color}`);
  return page;
}

async function sentAttachments(page, text) {
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').focus();
    return true;
  });
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
  await page.insert(text);
  await page.press('Enter');
  await page.until(
    (text) =>
      window.model.agent
        .messages('cone-sliccy')
        .some((message) => message.role === 'user' && message.text === text),
    text
  );
  return page.evaluate(async (text) => {
    const message = window.model.agent
      .messages('cone-sliccy')
      .find((candidate) => candidate.role === 'user' && candidate.text === text);
    const binary = message.attachments.find((attachment) => attachment.kind === 'file');
    const bytes = [...new Uint8Array(await (await fetch(binary.url)).arrayBuffer())];
    return {
      kinds: message.attachments.map((attachment) => attachment.kind),
      names: message.attachments.map((attachment) => attachment.name),
      image: message.attachments[0].url.slice(0, 22),
      text: message.attachments[1].text,
      blob: binary.url.slice(0, 5),
      bytes,
      expected: window.dropBytes,
    };
  }, text);
}

test('files dropped on the chat pane and on the composer reach the agent with their content', async (t) => {
  const page = await dropFiles(t, 'light');
  const expected = {
    kinds: ['image', 'text', 'file'],
    names: ['harbor.png', 'tides.txt', 'buoy.bin'],
    image: 'data:image/png;base64,',
    text: 'tide tables\n',
    blob: 'blob:',
  };
  const pane = await sentAttachments(page, 'From the pane');
  assert.deepEqual(pane.bytes, pane.expected);
  assert.deepEqual(
    { ...pane, bytes: undefined, expected: undefined },
    { ...expected, bytes: undefined, expected: undefined }
  );

  await page.until(() => window.model.agent.busy('cone-sliccy') === false);
  await page.evaluate(() => {
    const textarea = window.$(
      'slicc-app',
      'slicc-dock',
      'slicc-chat',
      'slicc-composer',
      'swc-prompt-field',
      'textarea'
    );
    const data = window.dropTransfer();
    window.drag('dragenter', textarea, data);
    window.drag('dragover', textarea, data);
    window.drag('drop', textarea, data);
    return true;
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').attachments.length === 3
  );
  const field = await sentAttachments(page, 'From the composer');
  assert.deepEqual(field.bytes, field.expected);
  assert.deepEqual(
    { ...field, bytes: undefined, expected: undefined },
    { ...expected, bytes: undefined, expected: undefined }
  );
  assert.equal(
    await page.evaluate(() => !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'swc-dropzone')),
    true
  );
  assert.deepEqual(page.errors, []);
});

for (const [color, width] of [['dark'], ['light', 420]]) {
  test(`dropping files shows where to drop and attaches them, ${color}${width ? ` at ${width}` : ''}`, async (t) => {
    const page = await dropFiles(t, color, width);
    assert.deepEqual(page.errors, []);
  });
}

test('the slash popup offers the agent’s prompts and skills and sends them as messages', async (t) => {
  const page = await open(t, { delay: '0' });
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
  await page.insert('/');
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        '.popup .section[data-group=Skills]'
      )
  );
  const listed = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.popup');
    return {
      values: [...root.querySelectorAll('.item')].map((item) => item.dataset.value),
      groups: [...root.querySelectorAll('.section')].map((section) =>
        section.getAttribute('aria-label')
      ),
      heading: getComputedStyle(root.querySelector('.heading')).textTransform,
    };
  });
  assert.deepEqual(listed.values.slice(-2), ['review', 'skill:pdf']);
  assert.equal(listed.values[0], 'clear');
  assert.deepEqual(listed.groups, ['Prompts', 'Skills']);
  assert.equal(listed.heading, 'none');
  await shot(page, 'composer-agent-commands');

  await page.press('ArrowUp');
  await page.until(() => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.popup');
    const item = root.querySelector('.item[aria-selected=true]');
    const box = root.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    return item.dataset.value === 'skill:pdf' && rect.top >= box.top && rect.bottom <= box.bottom;
  });
  await shot(page, 'composer-agent-skills');
  await page.press('Enter');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === '/skill:pdf '
  );
  assert.equal(
    await page.evaluate(
      () => !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.popup')
    ),
    true
  );
  await page.insert('merge the tide charts');
  await page.press('Enter');
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some(
        (message) => message.role === 'user' && message.text === '/skill:pdf merge the tide charts'
      )
  );
});

test('the prompt field gets its registered properties, new lines, the add menu and queue actions', async (t) => {
  const page = await open(t, { delay: '40' });
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));

  assert.deepEqual(
    await page.evaluate(() => {
      const field = window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field'
      );
      return [
        document.head.querySelectorAll('style[data-slicc-properties]').length,
        getComputedStyle(field).getPropertyValue('--swc-prompt-field-brand-color').trim(),
        getComputedStyle(field).getPropertyValue('--_swc-prompt-field-bg-stop-1').trim() !== '',
      ];
    }),
    [1, 'rgb(236, 105, 255)', true]
  );

  await page.insert('first');
  await page.press('Enter', 'shift');
  await page.insert('second');
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      ).value === 'first\nsecond'
  );
  assert.equal(
    await page.evaluate(() =>
      window.model.agent.messages('cone-sliccy').some((message) => message.text === 'first')
    ),
    false
  );

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field')
      .shadowRoot.querySelector('.swc-PromptField-upload')
      .click()
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover')?.open ===
      true
  );
  await page.until(() => /slicc-composer > sp-menu/.test(window.focused()));
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'sp-menu-item[value=secret]')
      .click()
  );
  await page.until(
    () =>
      !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'form.secret') &&
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover').open ===
        false
  );
  await page.until(() => /slicc-composer > input/.test(window.focused()));
  await page.insert('api token');
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'form.secret swc-button')
      .click()
  );
  await page.until(
    () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-upload-attachment[data-kind=secret] [slot=title]'
      )?.textContent === 'API_TOKEN'
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-upload-attachment')
      .shadowRoot.querySelector('.swc-UploadAttachment-dismiss')
      .click()
  );
  await page.until(
    () =>
      !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-upload-attachment')
  );

  await page.evaluate(() => {
    void window.model.agent.send('cone-sliccy', { text: 'Run the tests' });
    void window.model.agent.send('cone-sliccy', { text: 'Queued one', mode: 'queue' });
    void window.model.agent.send('cone-sliccy', { text: 'Queued two', mode: 'queue' });
  });
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer')
        .shadowRoot.querySelectorAll('.queued').length === 2
  );
  await shot(page, 'composer-queue-actions');
  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        '.queued:last-child [data-action=unqueue]'
      )
      .click()
  );
  await page.until(() => window.model.agent.queue('cone-sliccy').length === 1);
  await page.evaluate(() =>
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        '.queued [data-action=send-now]'
      )
      .click()
  );
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some(
        (message) =>
          message.role === 'user' && message.text === 'Queued one' && message.delivered === 'steer'
      )
  );
  await page.until(() => !window.model.agent.busy('cone-sliccy'));
  assert.equal(
    await page.evaluate(() =>
      window.model.agent.messages('cone-sliccy').some((message) => message.text === 'Queued two')
    ),
    false
  );
  assert.deepEqual(page.errors, []);
});

const panel = (id, ...path) => {
  const content = window.$('slicc-app', 'slicc-dock').content(id);
  return path.length ? content?.shadowRoot.querySelector(path.join(' ')) : content;
};

test('memory, monitor and the freezer open from the rails and work', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=memory]').click());
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock').content('memory')?.shadowRoot.querySelector('.row')
  );
  assert.match(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.textContent
    ),
    /Lead with the result/
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('memory')
      .shadowRoot.querySelector('.row .head')
      .click()
  );
  await page.until(
    () =>
      !!window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.querySelector('.row .body')
  );
  await shot(page, 'memory-light');

  const memory = (selector) =>
    page.evaluate(
      (selector) =>
        [
          ...window
            .$('slicc-app', 'slicc-dock')
            .content('memory')
            .shadowRoot.querySelectorAll(selector),
        ].map((node) => node.dataset.scope ?? node.textContent.trim()),
      selector
    );
  assert.deepEqual(await memory('.bar > span:first-child'), ['10 of 10 memories']);
  assert.deepEqual(
    [...new Set(await memory('.row .scope'))],
    ['global', 'cone-harbor', 'cone-release', 'role:reviewer']
  );
  const scope = (value) =>
    page.evaluate((value) => {
      const picker = window
        .$('slicc-app', 'slicc-dock')
        .content('memory')
        .shadowRoot.querySelector('.tools sp-picker[label=Scope]');
      picker.value = value;
      picker.dispatchEvent(new Event('change'));
    }, value);
  await scope('global');
  await page.until(() =>
    /5 of 5 memories/.test(
      window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.querySelector('.bar')
        .textContent
    )
  );
  assert.deepEqual(await memory('.row .scope'), []);
  await scope('cone-sliccy');
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.querySelector('.note')
  );
  assert.deepEqual(await memory('.note'), ['No memories for sliccy yet.']);
  await scope('*');
  await page.until(() =>
    /10 of 10 memories/.test(
      window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.querySelector('.bar')
        .textContent
    )
  );

  await page.evaluate(() => {
    window.memoryPart = (selector) =>
      window.$('slicc-app', 'slicc-dock').content('memory').shadowRoot.querySelector(selector);
    window.memoryPart('.tools sp-picker[label=Scope]').open = true;
  });
  await page.until(() => window.memoryPart('.tools sp-picker[label=Scope]').open === true);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.memoryPart('.tools sp-picker[label=Scope]').querySelectorAll('[slot=header]')].map(
        (node) => node.textContent
      )
    ),
    ['Cones', 'Roles']
  );
  await shot(page, 'memory-scopes');
  await page.evaluate(() =>
    window.memoryPart('.tools sp-picker[label=Scope] sp-menu-item[value="role:reviewer"]').click()
  );
  await page.until(() => /2 of 2 memories/.test(window.memoryPart('.bar').textContent));
  assert.ok(await page.evaluate(() => !!window.memoryPart('.row[data-id=mem-10] .from')));
  assert.equal(
    await page.evaluate(() => window.memoryPart('.tools sp-picker[label=Scope]').value),
    'role:reviewer'
  );
  await shot(page, 'memory-role-notes');

  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=monitor]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('monitor')?.shadowRoot.querySelectorAll('.vital')
        .length === 6
  );
  await page.evaluate(() => window.model.tray.disconnect());
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('monitor')
        .shadowRoot.querySelector('.alert[data-severity=error]')
  );
  await page.evaluate(() => window.model.tray.reconnect());
  await page.until(
    () =>
      !window
        .$('slicc-app', 'slicc-dock')
        .content('monitor')
        .shadowRoot.querySelector('.alert[data-severity=error]')
  );
  await shot(page, 'monitor-light');
  const narrow = await page.evaluate(async () => {
    const host = window.$('slicc-app', 'slicc-dock').content('monitor');
    host.style.width = '200px';
    await new Promise(requestAnimationFrame);
    const root = host.shadowRoot;
    const edge = host.getBoundingClientRect().right;
    const button = root.querySelector('.bar swc-action-button').getBoundingClientRect();
    const [title, time] = [...root.querySelectorAll('.bar strong, .bar strong + span')].map(
      (part) => part.getBoundingClientRect()
    );
    const lines = (node, from, to) => {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    };
    const split = [...root.querySelectorAll('.section[data-id=changes] .row swc-status-light')]
      .flatMap((light) => [...light.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE))
      .flatMap((node) =>
        [...node.textContent.matchAll(/[^/\s]+/g)]
          .filter((word) => lines(node, word.index, word.index + word[0].length) > 1)
          .map((word) => word[0])
      );
    const rows = root.querySelectorAll('.section[data-id=changes] .row').length;
    return {
      inside: button.right <= edge + 0.5,
      wrapped: time.top > title.top,
      clear: time.right <= button.left,
      split,
      rows,
    };
  });
  assert.deepEqual(narrow, {
    inside: true,
    wrapped: true,
    clear: true,
    split: [],
    rows: narrow.rows,
  });
  assert.ok(narrow.rows > 0);
  await shot(page, 'monitor-narrow');
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('monitor')
      .shadowRoot.querySelector('.section[data-id=changes]')
      .scrollIntoView({ block: 'end' })
  );
  await shot(page, 'monitor-narrow-changes');
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock').content('monitor').style.width = '';
  });

  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=freezer]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('freezer')?.shadowRoot.querySelectorAll('.card')
        .length === window.model.agent.frozen().length
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock')
          .content('freezer')
          .shadowRoot.querySelectorAll('.card:not([data-live])'),
      ].map((card) => [card.dataset.kind, card.querySelector('[data-badge=kind]').textContent])
    ),
    [
      ['scoop', 'Scoop'],
      ['cone', 'Cone'],
      ['agent', 'Agent run'],
      ['cone', 'Cone'],
      ['cone', 'Cone'],
    ]
  );
  await shot(page, 'freezer-light');
  await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock')
        .content('freezer')
        .shadowRoot.querySelectorAll('.card[data-id=cone-kv-spike] swc-action-button'),
    ]
      .find((button) => button.textContent.trim() === 'Thaw')
      .click()
  );
  await page.until(() => window.model.agent.active() === 'cone-kv-spike');
  await page.until(() => window.model.agent.list().some((agent) => agent.id === 'cone-kv-spike'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('freezer')
        .shadowRoot.querySelector('.card[data-id=cone-kv-spike][data-live] [data-action=open]')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('freezer')
      .shadowRoot.querySelector('.card[data-id=scoop-tide-check] [data-action=thaw]')
      .click()
  );
  await page.until(() => window.model.agent.active() === 'scoop-tide-check-thaw-1');
  await page.until(() =>
    /thawed as tide-check$/.test(
      window
        .$('slicc-app', 'slicc-dock')
        .content('freezer')
        .shadowRoot.querySelector('.card[data-id=scoop-tide-check] .meta').textContent
    )
  );
  await page.evaluate(() => window.app.show('agents'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('agents')
        ?.shadowRoot.querySelector('li[data-id=cone-kv-spike] [data-action=delete-cone]')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('agents')
      .shadowRoot.querySelector('li[data-id=cone-kv-spike] [data-action=delete-cone]')
      .click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => !window.model.agent.list().some((agent) => agent.id === 'cone-kv-spike'));
  const stored = () => window.model.agent.frozen().filter((cone) => !cone.live).length;
  const before = await page.evaluate(stored);
  await page.press('2', 'alt');
  await page.insert('/freeze');
  await page.press('Escape');
  await page.press('Enter');
  await page.until(
    (count) => window.model.agent.frozen().filter((cone) => !cone.live).length === count + 1,
    before
  );
  assert.deepEqual(page.errors, []);
});

test('the monitor keeps its cards and the list in place whatever values they show', async (t) => {
  const page = await open(t, { monitor: 'agent', delay: '0' });
  await page.evaluate(() => window.app.show('monitor'));
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('monitor')?.shadowRoot.querySelectorAll('.vital')
        .length > 0
  );
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const measure = (variant, width) =>
    page.evaluate(
      async ({ variant, width }) => {
        const host = window.$('slicc-app', 'slicc-dock').content('monitor');
        const monitor = window.model.monitor;
        window.monitorBase ??= monitor.snapshot();
        const wave = (seed) =>
          Array.from({ length: 24 }, (_, i) => 40 + 25 * Math.sin((i + seed) / 3));
        const values = {
          short: [
            {
              id: 'budget',
              label: 'Budget (weekly)',
              value: '0%',
              unit: 'resets in 4 days',
              ratio: 0,
            },
            { id: 'spend', label: 'Spend', value: '$0.00', unit: '0 tokens' },
            { id: 'agents', label: 'Active agents', value: '1', unit: 'of 1', series: [1] },
            { id: 'tasks', label: 'Running', value: '0', unit: 'tools · 0 tasks' },
            { id: 'processes', label: 'Processes', value: '…', unit: 'checking' },
            { id: 'memory', label: 'Process memory', value: '0 B', unit: '0 B by agents' },
            { id: 'context', label: 'Fullest context', value: '0%', ratio: 0 },
          ],
          missing: [
            { id: 'budget', label: 'Budget (weekly)', value: '7%', ratio: 0.07 },
            { id: 'spend', label: 'Spend', value: '<$0.01', unit: '12 tokens' },
            { id: 'agents', label: 'Active agents', value: '0', unit: 'of 1' },
            { id: 'tasks', label: 'Running', value: '0', unit: 'tools · 1 task' },
            { id: 'processes', label: 'Processes', value: '—', unit: 'kernel not reachable' },
            {
              id: 'memory',
              label: 'Process memory',
              value: '17 MiB',
              unit: '0 B by agents',
              series: [17, 17],
            },
            { id: 'context', label: 'Fullest context', value: '15%', ratio: 0.15 },
          ],
          long: [
            {
              id: 'budget',
              label: 'Budget (weekly)',
              value: '100%',
              unit: 'resets 2026-10-14 00:00 UTC',
              ratio: 1,
            },
            {
              id: 'spend',
              label: 'Spend',
              value: '$12,345.67',
              unit: '10.5M tokens',
              delta: '$123.45/h',
              series: wave(1),
            },
            { id: 'agents', label: 'Active agents', value: '12', unit: 'of 30', series: wave(2) },
            { id: 'tasks', label: 'Running', value: '12', unit: 'tools · 128 tasks' },
            {
              id: 'processes',
              label: 'Processes',
              value: '1,024',
              unit: '996 by agents',
              series: wave(3),
            },
            {
              id: 'memory',
              label: 'Process memory',
              value: '1023.9 MiB',
              unit: '1023.9 MiB by agents',
              series: wave(4),
            },
            { id: 'context', label: 'Fullest context', value: '100%', ratio: 1 },
          ],
        }[variant];
        monitor.snapshot = () => ({
          ...window.monitorBase,
          updatedAt: 0,
          alerts: [],
          vitals: values,
        });
        host.style.width = `${width}px`;
        host.shadowRoot.querySelector('.bar swc-action-button').click();
        await host.updateComplete;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const root = host.shadowRoot;
        const origin = root.querySelector('.body').getBoundingClientRect();
        const box = (node) => {
          const rect = node.getBoundingClientRect();
          return [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height].map(
            (n) => Math.round(n)
          );
        };
        const cards = [...root.querySelectorAll('.vital')];
        return {
          cards: cards.map(box),
          inside: cards.every((card) => {
            const line = card.querySelector('.reading')?.getBoundingClientRect();
            return [...card.querySelectorAll('.reading > *')]
              .filter((part) => !line || part.getBoundingClientRect().top < line.bottom - 0.5)
              .every(
                (part) =>
                  part.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5
              );
          }),
          lines: [...root.querySelectorAll('.section > .line')].map(box),
          nums: [...root.querySelectorAll('.line .num')].map((num) =>
            Math.round(num.getBoundingClientRect().right)
          ),
          list: box(root.querySelector('.sections')),
        };
      },
      { variant, width }
    );
  for (const width of [200, 340, 420, 640, 960]) {
    const [short, missing, long] = [
      await measure('short', width),
      await measure('missing', width),
      await measure('long', width),
    ];
    assert.equal(short.inside && missing.inside && long.inside, true, `${width}px`);
    assert.deepEqual(missing, short, `${width}px, missing data`);
    assert.deepEqual(long, short, `${width}px, long values`);
    assert.equal(new Set(short.nums).size, 1, `${width}px, counts line up`);
    assert.equal(new Set(short.cards.map((card) => card[3])).size <= 2, true, `${width}px`);
  }
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock').content('monitor').style.width = '';
  });
});

test('SLICC sprinkles run sandboxed with Lucide icons and lick their cone, and the tray shows its status', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.welcome = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        .shadowRoot.querySelector('slicc-sprinkle[inline]');
    return true;
  });
  await page.until(() => !!window.welcome()?.shadowRoot.querySelector('iframe'));
  await page.until(() => window.welcome().height !== 160);
  assert.equal(
    await page.evaluate(() =>
      window.welcome().shadowRoot.querySelector('iframe').getAttribute('sandbox')
    ),
    'allow-scripts'
  );
  assert.equal(
    await page.evaluate(
      () => !!window.$('slicc-app', '.rail.right [data-surface="sprinkle:welcome"]')
    ),
    false
  );
  await page.until(
    () =>
      !!window
        .$('slicc-app', '.rail.right [data-surface="sprinkle:suggestions"] slicc-lucide')
        ?.shadowRoot.querySelector('svg.lucide-ice-cream-cone')
  );
  await page.evaluate(() =>
    window.$('slicc-app', '.rail.right [data-surface="sprinkle:suggestions"]').click()
  );
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('sprinkle:suggestions')
        ?.shadowRoot.querySelector('iframe')
  );
  await shot(page, 'sprinkle-light');
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'slicc-lick',
          action: 'onboarding-complete',
          data: { name: 'Robin' },
        },
        source: window.welcome().shadowRoot.querySelector('iframe').contentWindow,
      })
    );
  });
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some((message) => message.channel === 'sprinkle' && message.text === 'onboarding-complete')
  );

  await page.evaluate(() => window.$('slicc-app', 'slicc-tray', '.chip').click());
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-network', 'section[aria-labelledby=sync]')
  );
  assert.match(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'slicc-dock', 'slicc-network', 'section[aria-labelledby=sync]')
          .textContent
    ),
    /leader/
  );
  await shot(page, 'tray-light');
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-network', '[data-action=tray-disconnect]').click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-tray', '.chip swc-status-light').getAttribute('variant') ===
      'neutral'
  );
  assert.deepEqual(page.errors, []);
});

test('an inline sprinkle that loads out of view still sizes its frame to its content', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    let tall = 40;
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () => [
      ...list(),
      {
        id: 'below',
        name: 'below',
        title: 'Below',
        icon: 'hand',
        agentId: 'cone-sliccy',
        html: `<!DOCTYPE html><html><head></head><body style="margin:0"><div style="height:${tall}px"></div><div hidden>${'<i></i>'.repeat(40000)}</div></body></html>`,
      },
    ];
    window.grow = (height) => {
      tall = height;
      window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
      return true;
    };
    const element = document.createElement('slicc-sprinkle');
    element.setAttribute('inline', '');
    element.style.cssText = `position:absolute;top:${innerHeight * 4}px;left:0;width:400px`;
    element.sprinkle = 'below';
    element.model = window.model;
    window.below = () => element.shadowRoot.querySelector('iframe');
    window.loads = 0;
    addEventListener('message', (event) => {
      if (event.data?.type === 'slicc-ready' && event.source === window.below()?.contentWindow)
        window.loads += 1;
    });
    document.body.append(element);
    return true;
  });
  await page.until(() => window.loads === 1);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
      )
  );
  for (const [round, height] of [50, 70, 90].entries()) {
    await page.evaluate((height) => window.grow(height), height);
    await page.until((loads) => window.loads === loads, round + 2);
    await page.until((height) => window.below().getBoundingClientRect().height === height, height);
  }
  assert.ok(await page.evaluate(() => window.below().getBoundingClientRect().top > innerHeight));
  assert.deepEqual(page.errors, []);
});

test('sprinkle frames resolve the host Gen2 tokens and follow the theme without reloading', async (t) => {
  const page = await open(t);
  const pairs = [
    ['--s2-gray-800', '--swc-gray-800', 'color'],
    ['--s2-bg-layer-1', '--swc-background-layer-1-color', 'background-color'],
    ['--s2-bg-elevated', '--swc-background-elevated-color', 'background-color'],
    ['--s2-content-default', '--swc-neutral-content-color-default', 'color'],
    ['--s2-content-secondary', '--swc-neutral-subdued-content-color-default', 'color'],
    ['--s2-content-positive', '--swc-positive-color-900', 'color'],
    ['--s2-accent', '--swc-accent-background-color-default', 'background-color'],
    ['--s2-negative', '--swc-negative-background-color-default', 'background-color'],
    ['--s2-border-focus', '--swc-focus-indicator-color', 'color'],
    [
      '--uxc-positive-subtle-bg',
      '--swc-positive-subtle-background-color-default',
      'background-color',
    ],
    ['--uxc-positive-subtle-text', '--swc-positive-color-1000', 'color'],
    ['--s2-shadow-elevated', '--swc-drop-shadow-elevated', 'box-shadow'],
    ['--s2-font-size-100', '--swc-font-size-100', 'font-size'],
    ['--s2-radius-default', '--swc-corner-radius-medium-default', 'border-top-left-radius'],
    ['--s2-spacing-100', '--swc-spacing-100', 'padding-top'],
    ['--s2-font-family', '--swc-sans-font-family-stack', 'font-family'],
  ];
  await page.evaluate(() => {
    const probe = `<!DOCTYPE html><html><head></head><body><button class="sprinkle-btn sprinkle-btn--primary">Go</button><script>
      const loaded = Math.random();
      addEventListener('message', (event) => {
        if (event.data?.type !== 'probe') return;
        const values = event.data.pairs.map(([name, , property]) => {
          const node = document.createElement('div');
          node.style.setProperty(property, 'var(' + name + ')');
          document.body.append(node);
          const value = getComputedStyle(node).getPropertyValue(property);
          node.remove();
          return property === 'font-family' ? [...new Set(value.split(',').map((family) => family.trim()))].join(', ') : value;
        });
        const root = document.documentElement;
        parent.postMessage({ type: 'probe-result', loaded, values, light: root.classList.contains('theme-light'), scheme: getComputedStyle(root).colorScheme, outline: getComputedStyle(document.querySelector('button')).outlineColor }, '*');
      });
    </script></body></html>`;
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () => [
      ...list(),
      {
        id: 'probe',
        name: 'probe',
        title: 'Probe',
        icon: 'hand',
        agentId: 'cone-sliccy',
        html: probe,
      },
    ];
    const element = document.createElement('slicc-sprinkle');
    element.setAttribute('inline', '');
    element.sprinkle = 'probe';
    element.model = window.model;
    document.body.append(element);
    window.probe = (pairs) =>
      new Promise((resolve) => {
        const frame = element.shadowRoot.querySelector('iframe');
        const timer = setInterval(
          () => frame.contentWindow.postMessage({ type: 'probe', pairs }, '*'),
          50
        );
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== 'probe-result') return;
          clearInterval(timer);
          removeEventListener('message', listen);
          resolve(event.data);
        };
        addEventListener('message', listen);
      });
    window.host = (pairs) => {
      const theme = window.$('slicc-app', '.swc-theme');
      return pairs.map(([, name, property]) => {
        const node = document.createElement('div');
        node.style.setProperty(property, `var(${name})`);
        theme.append(node);
        const value = getComputedStyle(node).getPropertyValue(property);
        node.remove();
        return value;
      });
    };
    return true;
  });

  const light = await page.evaluate((pairs) => window.probe(pairs), pairs);
  assert.equal(light.light, true);
  assert.equal(light.scheme, 'light');
  assert.deepEqual(light.values, await page.evaluate((pairs) => window.host(pairs), pairs));
  assert.notEqual(light.values[0], '');

  await page.evaluate(() => window.model.settings.update({ color: 'dark' }));
  await page.until(() => window.$('slicc-app', '.swc-theme').classList.contains('swc-theme--dark'));
  let dark;
  for (let i = 0; i < 50; i++) {
    dark = await page.evaluate((pairs) => window.probe(pairs), pairs);
    if (!dark.light) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(dark.light, false);
  assert.equal(dark.scheme, 'dark');
  assert.equal(dark.loaded, light.loaded);
  assert.deepEqual(dark.values, await page.evaluate((pairs) => window.host(pairs), pairs));
  assert.notDeepEqual(dark.values, light.values);
  assert.deepEqual(page.errors, []);
});

test('the Suggestions sprinkle reads its stream through the bridge, and the welcome still starts', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const probe = `<script>addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.type !== 'probe-text') return;
      parent.postMessage({ type: 'probe-text', text: document.body.innerText }, '*');
    });</script>`;
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () =>
      list().map((item) => ({ ...item, html: item.html.replace('</body>', `${probe}</body>`) }));
    window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
    window.frameText = (element) =>
      new Promise((resolve) => {
        const frame = element?.shadowRoot.querySelector('iframe');
        if (!frame) return resolve('');
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== 'probe-text') return;
          removeEventListener('message', listen);
          resolve(event.data.text);
        };
        addEventListener('message', listen);
        frame.contentWindow.postMessage({ type: 'probe-text' }, '*');
        setTimeout(() => resolve(''), 200);
      });
    window.app.show('sprinkle:suggestions');
    return true;
  });
  await page.until(async () => {
    const text = await window.frameText(
      window.$('slicc-app', 'slicc-dock').content('sprinkle:suggestions')
    );
    return /Unit conversions/.test(text) && /Release notes from the week/.test(text);
  });
  const text = await page.evaluate(() =>
    window.frameText(window.$('slicc-app', 'slicc-dock').content('sprinkle:suggestions'))
  );
  assert.match(text, /Name your cache keys/);
  assert.match(
    text,
    /Installs unit-converter from raw\.githubusercontent\.com\/example\/skills\/main\/unit-converter\/SKILL\.md/
  );
  assert.doesNotMatch(text, /Nothing here yet/);
  await shot(page, 'sprinkle-suggestions-light');
  await page.until(async () =>
    /What brings you here\?/.test(
      await window.frameText(
        window
          .$('slicc-app', 'slicc-dock')
          .content('chat:cone-sliccy')
          .shadowRoot.querySelector('slicc-sprinkle[inline]')
      )
    )
  );
  assert.deepEqual(page.errors, []);
});

test('an inline sprinkle keeps its frame and its step while the chat updates around it', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const probe = `<script>
      const loaded = Math.random();
      addEventListener('message', (event) => {
        if (event.source !== parent || event.data?.type !== 'probe-step') return;
        if (event.data.click) document.querySelector(event.data.click)?.click();
        if (event.data.save) slicc.setState(event.data.save);
        parent.postMessage({ type: 'probe-step', loaded, step: document.querySelector('.step.active')?.id ?? null, state: slicc.getState() }, '*');
      });
    </script>`;
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () =>
      list().map((item) =>
        item.id === 'welcome'
          ? { ...item, html: item.html.replace('</body>', `${probe}</body>`) }
          : item
      );
    window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
    window.welcome = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('slicc-sprinkle[inline]')
        ?.shadowRoot.querySelector('iframe') ?? null;
    window.step = (message = {}) =>
      new Promise((resolve) => {
        const frame = window.welcome();
        if (!frame) return resolve(null);
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== 'probe-step') return;
          removeEventListener('message', listen);
          const { loaded, step, state } = event.data;
          resolve({ loaded, step, state });
        };
        addEventListener('message', listen);
        frame.contentWindow.postMessage({ type: 'probe-step', ...message }, '*');
        setTimeout(() => resolve(null), 200);
      });
    window.kept = async () => ({
      same: window.welcome() === window.frame,
      loads: window.loads,
      ...(await window.step()),
    });
    return true;
  });
  await page.until(async () => (await window.step())?.step === 's1');
  const first = await page.evaluate(async () => {
    window.frame = window.welcome();
    window.loads = 0;
    window.frame.addEventListener('load', () => window.loads++);
    return window.step({ save: { seen: 1 } });
  });
  await page.evaluate(() => window.step({ click: '#purposePills .pill' }));
  await page.until(async () => (await window.step())?.step === 's2');
  await page.until(async () => (await window.step({ click: '#skipBtn' }))?.step === 'sDone');
  await page.until(() =>
    window.model.agent
      .messages('cone-sliccy')
      .some((message) => message.channel === 'sprinkle' && message.text === 'onboarding-complete')
  );
  const done = { same: true, loads: 0, loaded: first.loaded, step: 'sDone', state: { seen: 1 } };
  assert.deepEqual(await page.evaluate(() => window.kept()), done);

  const before = await page.evaluate(() => window.model.agent.messages('cone-sliccy').length);
  await page.evaluate(() => void window.model.agent.send('cone-sliccy', 'What comes next?'));
  await page.until(
    (count) =>
      window.model.agent.messages('cone-sliccy').length > count + 1 &&
      !window.model.agent.busy('cone-sliccy'),
    before
  );
  assert.deepEqual(await page.evaluate(() => window.kept()), done);

  await page.evaluate(() => {
    const agent = window.model.agent;
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => {
      const list = messages(id);
      if (id !== 'cone-sliccy') return list;
      const at = list[0].createdAt - 60_000;
      return [
        { id: 'm-older', role: 'user', text: 'Hello?', createdAt: at },
        { id: 'm-yesterday', role: 'user', text: 'Anyone there?', createdAt: at - 86_400_000 },
        ...list,
      ];
    };
    agent.emit('messages', 'cone-sliccy');
    window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
    window.model.settings.update({ showThinking: !window.model.settings.get().showThinking });
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        .shadowRoot.querySelector('[data-id="m-yesterday"]')
  );
  assert.deepEqual(await page.evaluate(() => window.kept()), done);

  await page.evaluate(() => window.model.agent.select('cone-harbor'));
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:cone-harbor'));
  await page.until(() => !window.welcome()?.isConnected);
  await page.evaluate(() => window.model.agent.select('cone-sliccy'));
  await page.until(async () => {
    const now = await window.step();
    return !!now?.step && now.state?.seen === 1;
  });

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    window.frame = window.welcome();
    dock.api.addFloatingGroup(dock.api.getPanel('chat:cone-sliccy'));
    return true;
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').api.getPanel('chat:cone-sliccy').group.api.location
        .type === 'floating'
  );
  await page.until(async () => {
    const now = await window.step();
    return window.welcome() !== window.frame && !!now?.step && now.state?.seen === 1;
  });
  assert.deepEqual(page.errors, []);
});

test('state a sprinkle saves survives closing and reopening its panel', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const keeper = `<!DOCTYPE html><html><head></head><body><script>
      addEventListener('message', (event) => {
        if (event.source !== parent) return;
        const message = event.data || {};
        if (message.type === 'keep') slicc.setState(message.value).then(() => parent.postMessage({ type: 'kept' }, '*'));
        if (message.type === 'kept?') parent.postMessage({ type: 'kept-state', state: slicc.getState(), exec: typeof slicc.exec }, '*');
      });
    </script></body></html>`;
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () => [
      ...list(),
      {
        id: 'keeper',
        name: 'keeper',
        title: 'Keeper',
        icon: 'archive',
        agentId: 'cone-sliccy',
        html: keeper,
      },
    ];
    window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
    window.ask = (type, value, answer) =>
      new Promise((resolve) => {
        const frame = window
          .$('slicc-app', 'slicc-dock')
          .content('sprinkle:keeper')
          .shadowRoot.querySelector('iframe');
        const timer = setInterval(() => frame.contentWindow.postMessage({ type, value }, '*'), 50);
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== answer) return;
          clearInterval(timer);
          removeEventListener('message', listen);
          resolve(event.data);
        };
        addEventListener('message', listen);
      });
    window.app.show('sprinkle:keeper');
    return true;
  });
  const frame = () =>
    !!window
      .$('slicc-app', 'slicc-dock')
      .content('sprinkle:keeper')
      ?.shadowRoot.querySelector('iframe');
  await page.until(frame);
  assert.deepEqual(await page.evaluate(() => window.ask('kept?', null, 'kept-state')), {
    type: 'kept-state',
    state: null,
    exec: 'undefined',
  });
  const value = { count: 3, note: '</script><b>kept</b>' };
  await page.evaluate((value) => window.ask('keep', value, 'kept'), value);
  assert.deepEqual(
    await page.evaluate(() => window.model.sprinkles.call('keeper', 'getState', [])),
    value
  );
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('sprinkle:keeper'));
  await page.until(() => !window.$('slicc-app', 'slicc-dock').has('sprinkle:keeper'));
  await page.evaluate(() => window.app.show('sprinkle:keeper'));
  await page.until(frame);
  assert.deepEqual(
    (await page.evaluate(() => window.ask('kept?', null, 'kept-state'))).state,
    value
  );
  assert.deepEqual(page.errors, []);
});

test('new surfaces in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  for (const id of ['memory', 'freezer', 'monitor', 'sprinkle:suggestions']) {
    await page.evaluate((id) => window.app.show(id), id);
  }
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('monitor')?.shadowRoot.querySelectorAll('.vital')
        .length === 6
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.getPanel('memory').api.setActive()
  );
  await shot(page, 'memory-dark');
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.getPanel('freezer').api.setActive()
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.getPanel('monitor').api.setActive()
  );
  await shot(page, 'freezer-dark');
  await shot(page, 'monitor-dark');
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.getPanel('sprinkle:suggestions').api.setActive()
  );
  await page.evaluate(() => window.$('slicc-app', 'slicc-tray', '.chip').click());
  await shot(page, 'sprinkle-dark');
  await shot(page, 'tray-dark');
  assert.deepEqual(page.errors, []);
});

test('a language outside dist loads from the local grammar base first', async (t) => {
  const page = await open(t, { grammars: '/node_modules/@shikijs/' });
  await page.evaluate(() =>
    window.model.files
      .write('/workspace/harbor/tools/check.rs', 'fn main() {\n    println!("ok");\n}\n')
      .then(() => true)
  );
  await page.evaluate(() => {
    window.app.open('file', '/workspace/harbor/tools/check.rs');
    return true;
  });
  await page.until(() => window.code('file:/workspace/harbor/tools/check.rs').includes('println'));
  const deadline = Date.now() + 10_000;
  while (!chrome.requests.includes('/node_modules/@shikijs/langs/dist/rust.mjs')) {
    assert.ok(Date.now() < deadline, chrome.requests.join());
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.until(() => {
    const view = window
      .$('slicc-app', 'slicc-dock')
      .content('file:/workspace/harbor/tools/check.rs')
      .shadowRoot.querySelector('slicc-code-view');
    const root = view.shadowRoot.querySelector('diffs-container').shadowRoot;
    return [...root.querySelectorAll('span')].some(
      (span) => span.textContent === 'fn' && span.getAttribute('style')?.includes('--diffs')
    );
  });
  assert.deepEqual(page.errors, []);
});

test('each thread opens in its own chat tab next to the others', async (t) => {
  const page = await open(t);
  const groups = () =>
    window
      .$('slicc-app', 'slicc-dock')
      .api.groups.map((group) => group.panels.map((panel) => panel.id));
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-agents', 'li[data-id=cone-harbor]').click();
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:cone-harbor'));
  await page.evaluate(() => {
    window.model.agent.select('scoop-otter');
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:scoop-otter'));
  const chatGroup = (await page.evaluate(groups)).find((ids) => ids.includes('chat:cone-sliccy'));
  assert.deepEqual(chatGroup, ['chat:cone-sliccy', 'chat:cone-harbor', 'chat:scoop-otter']);
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:scoop-otter')
        ?.shadowRoot.querySelector('header swc-meter')
        ?.getAttribute('value') === '12'
  );
  await shot(page, 'threads-light');

  await page.evaluate(() => {
    window.model.agent.select('cone-harbor');
    return true;
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').api.getPanel('chat:cone-harbor').api.isVisible === true
  );
  assert.equal(
    (await page.evaluate(groups)).flat().filter((id) => id.startsWith('chat:')).length,
    3
  );

  await page.evaluate(() => {
    [...window.$('slicc-app', 'slicc-dock').shadowRoot.querySelectorAll('.dv-tab')]
      .find((el) => el.textContent.trim() === 'sliccy')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return true;
  });
  await page.until(() => window.model.agent.active() === 'cone-sliccy');

  await page.evaluate(() => {
    window.model.agent.freeze('cone-harbor');
    return true;
  });
  await page.until(
    () =>
      !window.$('slicc-app', 'slicc-dock').has('chat:cone-harbor') &&
      !window.$('slicc-app', 'slicc-dock').has('chat:scoop-otter')
  );
  assert.deepEqual(page.errors, []);
});

test('thread tabs in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.evaluate(() => {
    window.model.agent.select('cone-kitchen');
    window.model.agent.select('cone-release');
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:cone-release'));
  await shot(page, 'threads-dark');
  assert.deepEqual(page.errors, []);
});

test('a watch-only follower has no Delete cone or Drop, and its inline sprinkle licks nothing', async (t) => {
  const page = await open(t, { follow: 'watch' });
  await page.evaluate(() => {
    window.welcome = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('slicc-sprinkle[inline]');
    window.agentsRow = () => window.$('slicc-app', 'slicc-dock').content('agents')?.shadowRoot;
    window.lickWelcome = () =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'slicc-lick', action: 'onboarding-complete', data: { name: 'Robin' } },
          source: window.welcome().shadowRoot.querySelector('iframe').contentWindow,
        })
      );
    window.licked = () =>
      window.model.agent
        .messages('cone-sliccy')
        .some(
          (message) => message.channel === 'sprinkle' && message.text === 'onboarding-complete'
        );
    return true;
  });
  await page.until(() => window.agentsRow()?.querySelectorAll('li').length > 0);
  assert.equal(
    await page.evaluate(
      () =>
        window.agentsRow().querySelectorAll('[data-action=delete-cone], [data-action=drop]').length
    ),
    0
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!window.$(
          'slicc-app',
          'header sp-menu-item[data-action=delete-cone], header sp-menu-item[data-action=new-cone]'
        )
    ),
    false
  );
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('[data-follow=watch]')
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        .shadowRoot.querySelector('[data-follow=watch]')
        .textContent.trim()
    ),
    'Watch only. To send prompts from this device, allow Control for it on SLICC on quay-studio.'
  );
  await page.until(() => !!window.welcome()?.shadowRoot.querySelector('iframe'));
  assert.equal(await page.evaluate(() => window.welcome().hasAttribute('readonly')), true);
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.welcome().shadowRoot;
      return [
        root.querySelector('iframe').inert,
        root.querySelector('.handle [data-view-only]')?.textContent.trim(),
      ];
    }),
    [true, 'View only on this device']
  );
  await page.evaluate(() => {
    window.lickWelcome();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await page.evaluate(() => window.licked()), false);
  await page.evaluate(() => {
    window.model.follow.setScenario('control');
    return true;
  });
  await page.until(
    () =>
      window.agentsRow().querySelectorAll('[data-action=delete-cone], [data-action=drop]').length >
      0
  );
  await page.until(() => !window.welcome()?.hasAttribute('readonly'));
  await page.until(() => !window.welcome().shadowRoot.querySelector('iframe').inert);
  assert.equal(
    await page.evaluate(() => !!window.welcome().shadowRoot.querySelector('[data-view-only]')),
    false
  );
  await page.evaluate(() => {
    window.lickWelcome();
    return true;
  });
  await page.until(() => window.licked());
  assert.deepEqual(page.errors, []);
});

test('a read-only agent port shows its line, a notice without a close button, an inert sprinkle, and no composer, New cone or Changes actions', async (t) => {
  const page = await open(t, { readonly: 'version' });
  await page.evaluate(() => {
    window.chat = () => window.$('slicc-app', 'slicc-dock').content('chat:cone-sliccy')?.shadowRoot;
    window.agentsRow = () => window.$('slicc-app', 'slicc-dock').content('agents')?.shadowRoot;
    window.changes = () => window.$('slicc-app', 'slicc-dock').content('changes')?.shadowRoot;
    window.sprinkle = () => window.chat()?.querySelector('slicc-sprinkle[inline]');
    window.notice = () =>
      window
        .chat()
        ?.querySelector('slicc-notices')
        ?.shadowRoot.querySelector('[data-notice=readonly]');
    return true;
  });
  await page.until(() => !!window.chat()?.querySelector('[data-follow=watch]'));
  await page.until(() => !!window.notice());
  await page.until(() => window.agentsRow()?.querySelectorAll('li').length > 0);
  await page.until(() => window.changes()?.querySelectorAll('li[data-path]').length > 0);
  await page.until(() => !!window.sprinkle()?.shadowRoot.querySelector('iframe'));
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.changes().querySelector('[data-action=accept-all], [data-action=revert-all]'),
      !!window.changes().querySelector('li[data-path] .actions'),
      window.sprinkle().hasAttribute('readonly'),
      window.sprinkle().shadowRoot.querySelector('iframe').inert,
      window.sprinkle().shadowRoot.querySelector('[data-view-only]')?.textContent.trim(),
    ]),
    [false, false, true, true, 'View only on this device']
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.chat().querySelector('[data-follow=watch]').textContent.trim(),
      !!window.chat().querySelector('slicc-composer'),
      !!window.agentsRow().querySelector('[data-action=new-cone]'),
      !!window.$('slicc-app', 'header sp-menu-item[data-action=new-cone]'),
      !!window.notice().querySelector('[data-dismiss]'),
      window.notice().getAttribute('role'),
    ]),
    [
      'Watch only. The SLICC you follow runs a newer version. Update this one to send prompts.',
      false,
      false,
      false,
      false,
      'status',
    ]
  );
  await page.evaluate(() => {
    window.model.agent.setReadOnly(null);
    return true;
  });
  await page.until(() => !!window.chat().querySelector('slicc-composer'));
  await page.until(() => !!window.agentsRow().querySelector('[data-action=new-cone]'));
  await page.until(() => !!window.changes().querySelector('[data-action=accept-all]'));
  await page.until(() => !!window.changes().querySelector('[data-action=revert-all]'));
  await page.until(() => !window.sprinkle().shadowRoot.querySelector('iframe').inert);
  await page.until(() => !window.notice());
  assert.equal(
    await page.evaluate(() => !!window.chat().querySelector('[data-follow=watch]')),
    false
  );
  await page.evaluate(() => {
    window.model.agent.setReadOnly('Watch only.');
    return true;
  });
  await page.until(() => !!window.notice() && !window.notice().querySelector('[data-dismiss]'));
  assert.deepEqual(page.errors, []);
});

for (const [name, options, end, start] of [
  [
    'following without Control',
    { follow: 'watch', surfaces: 'all' },
    () => window.model.follow.setScenario('control'),
    () => window.model.follow.setScenario('watch'),
  ],
  [
    'the agent port is read-only',
    { readonly: 'version' },
    () => window.model.agent.setReadOnly(null),
    () => window.model.agent.setReadOnly('Watch only.'),
  ],
]) {
  test(`watch-only notes stand in for Accept and Revert, and the empty chat asks nothing, while ${name}`, async (t) => {
    const page = await open(t, options);
    const viewport = (width) =>
      page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 860,
        deviceScaleFactor: 1,
        mobile: false,
      });
    t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
    await viewport(1280);
    const path = '/workspace/harbor/src/lib/cache.ts';
    await page.evaluate((path) => {
      window.part = (id) => window.$('slicc-app', 'slicc-dock').content(id)?.shadowRoot;
      window.diffId = `diff:${path}`;
      window.fits = (root) => {
        const bar = root.querySelector('.bar');
        const note = bar.querySelector('[data-watch-note]');
        const outer = bar.getBoundingClientRect();
        const inner = note.getBoundingClientRect();
        return {
          text: note.textContent.trim(),
          inside: inner.left >= outer.left && inner.right <= outer.right + 0.5,
          oneLine: inner.height < outer.height,
          overflow: bar.scrollWidth > bar.clientWidth,
        };
      };
      window.model.agent.clear('cone-sliccy');
      window.app.show('changes');
      window.app.open('diff', path);
      return true;
    }, path);
    await page.until(() => window.part('changes')?.querySelectorAll('li[data-path]').length > 0);
    await page.until(() => !!window.part(window.diffId)?.querySelector('[data-watch-note]'));
    await page.until(() => !!window.part('chat:cone-sliccy')?.querySelector('.empty'));
    for (const width of [1280, 420]) {
      await viewport(width);
      if (width === 420)
        await page.until(() => document.querySelector('slicc-app').screen === 'phone');
      for (const id of ['changes', 'diff']) {
        await page.evaluate((id) => {
          window.app.show(id === 'diff' ? window.diffId : id);
          return true;
        }, id);
        await page.until(
          (id) =>
            window.part(id === 'diff' ? window.diffId : id)?.querySelector('.bar').clientWidth > 0,
          id
        );
        const fit = await page.evaluate(
          (id) => window.fits(window.part(id === 'diff' ? window.diffId : id)),
          id
        );
        assert.deepEqual(
          fit,
          { text: 'Watch only', inside: true, oneLine: true, overflow: false },
          `${id} at ${width}`
        );
      }
      const path = await page.evaluate(() => {
        const span = window.part(window.diffId).querySelector('.bar .path');
        return [getComputedStyle(span).textOverflow, span.scrollWidth > span.clientWidth];
      });
      assert.equal(path[0], 'ellipsis');
      if (width === 420) assert.equal(path[1], true);
      await page.evaluate(() => {
        window.app.show('chat:cone-sliccy');
        return true;
      });
      await page.until(
        () => window.part('chat:cone-sliccy')?.querySelector('.empty').clientWidth > 0
      );
      assert.deepEqual(
        await page.evaluate(() => {
          const empty = window.part('chat:cone-sliccy').querySelector('.empty');
          return [empty.textContent.trim(), empty.scrollWidth <= empty.clientWidth];
        }),
        ['No messages yet.', true]
      );
    }
    await viewport(1280);
    await page.evaluate(end);
    await page.until(() => !window.part('changes').querySelector('[data-watch-note]'));
    await page.until(() => !window.part(window.diffId).querySelector('[data-watch-note]'));
    assert.deepEqual(
      await page.evaluate(() => [
        !!window.part('changes').querySelector('[data-action=accept-all]'),
        !!window.part(window.diffId).querySelector('[data-action=accept]'),
        window.part('chat:cone-sliccy').querySelector('.empty').textContent.trim(),
      ]),
      [true, true, 'No messages yet. Ask sliccy something.']
    );
    await page.evaluate(() => {
      window.part('changes').querySelector('[data-action=accept-all]').click();
      return true;
    });
    await page.until(() => !!window.part('changes').querySelector('.note'));
    const note = () => window.part('changes').querySelector('.note').textContent.trim();
    assert.equal(
      await page.evaluate(note),
      'No pending changes. Edits by agents show up here for review.'
    );
    await page.evaluate(start);
    await page.until(() => !!window.part('chat:cone-sliccy').querySelector('[data-follow=watch]'));
    assert.deepEqual(
      await page.evaluate(() => [
        window.part('changes').querySelector('.note').textContent.trim(),
        !!window.part('changes').querySelector('[data-watch-note]'),
      ]),
      ['No pending changes.', false]
    );
    assert.deepEqual(page.errors, []);
  });
}

test('an agent port without readOnly, whose on() rejects unknown events, still binds', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const real = window.model.agent;
    const agent = new Proxy(real, {
      get(target, key) {
        if (key === 'readOnly') return undefined;
        if (key === 'on')
          return (type, listener) => {
            if (type === 'readOnly') throw new Error('unknown event: readOnly');
            return target.on(type, listener);
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      has(target, key) {
        return key !== 'readOnly' && key in target;
      },
    });
    window.app.model = { ...window.model, agent };
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('slicc-composer')
  );
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('agents')
        ?.shadowRoot.querySelector('[data-action=new-cone]')
  );
  assert.deepEqual(page.errors, []);
});

test('a dip drags out of the chat into the dock and lives on as a panel', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.dip = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        .shadowRoot.querySelector('slicc-sprinkle[inline]');
    return true;
  });
  await page.until(() => !!window.dip()?.shadowRoot.querySelector('.handle[draggable=true]'));
  assert.match(
    await page.evaluate(() => window.dip().shadowRoot.querySelector('.handle').textContent),
    /Welcome/
  );
  await shot(page, 'dip-handle-light');
  await page.evaluate(() =>
    window
      .drag(
        window.dip().shadowRoot.querySelector('.handle'),
        window
          .$('slicc-app', 'slicc-dock')
          .api.getPanel('changes')
          .group.element.querySelector('.dv-content-container'),
        0.5,
        0.5
      )
      .then(() => true)
  );
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('sprinkle:welcome'));
  assert.equal(
    await page.evaluate(() => {
      const dock = window.$('slicc-app', 'slicc-dock');
      return dock.api.getPanel('sprinkle:welcome').group === dock.api.getPanel('changes').group;
    }),
    true
  );
  await page.until(() => !!window.dip()?.shadowRoot.querySelector('.moved'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('sprinkle:welcome')
        ?.shadowRoot.querySelector('iframe')
  );
  await shot(page, 'dip-panel-light');

  await page.evaluate(() => {
    window.dip().shadowRoot.querySelector('.moved sp-action-button').click();
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('sprinkle:welcome'));

  await page.reload();
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('sprinkle:welcome'));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('slicc-ui.dips'))), [
    'welcome',
  ]);

  await page.evaluate(() => {
    window.dip = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('slicc-sprinkle[inline]');
    window.$('slicc-app', 'slicc-dock').close('sprinkle:welcome');
    return true;
  });
  await page.until(() => !!window.dip()?.shadowRoot.querySelector('.handle'));
  assert.deepEqual(
    await page.evaluate(() => [
      JSON.parse(localStorage.getItem('slicc-ui.dips')),
      !!window.dip().shadowRoot.querySelector('.moved'),
      !!window.$('slicc-app', '.rail.right [data-surface="sprinkle:welcome"]'),
    ]),
    [[], false, false]
  );
  assert.deepEqual(page.errors, []);
});

test('a dip dropped on a rail waits there, and its button opens it as a panel', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.evaluate(() => {
    window.dip = () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        .shadowRoot.querySelector('slicc-sprinkle[inline]');
    return true;
  });
  await page.until(() => !!window.dip()?.shadowRoot.querySelector('.handle'));
  await shot(page, 'dip-handle-dark');
  await page.evaluate(() =>
    window
      .drag(
        window.dip().shadowRoot.querySelector('.handle'),
        window.$('slicc-app', '.rail.right'),
        0.5,
        0.9
      )
      .then(() => true)
  );
  await page.until(() => !!window.$('slicc-app', '.rail.right [data-surface="sprinkle:welcome"]'));
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'slicc-dock').has('sprinkle:welcome')),
    false
  );
  await page.until(() => !!window.dip()?.shadowRoot.querySelector('.moved'));
  await page.evaluate(() => {
    window.$('slicc-app', '.rail.right [data-surface="sprinkle:welcome"]').click();
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('sprinkle:welcome')
        ?.shadowRoot.querySelector('iframe')
  );
  await shot(page, 'dip-panel-dark');
  assert.deepEqual(page.errors, []);
});

test('status items sit in the header on one line, and nothing sits under it', async (t) => {
  const page = await open(t);
  const width = () => window.$('slicc-app', 'header .status').getBoundingClientRect().width;
  assert.equal(await page.evaluate(() => window.$('slicc-app', '.notices')), null);
  assert.equal(await page.evaluate(width), 0);
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'header .status').getAttribute('role')),
    'status'
  );
  const below = () =>
    Math.round(window.$('slicc-app', 'header').getBoundingClientRect().bottom) ===
    Math.round(window.$('slicc-app', 'main').getBoundingClientRect().top);
  assert.equal(await page.evaluate(below), true);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = 'slicc-app > [slot="status"] { color: rgb(1, 2, 3); }';
    document.head.append(style);
    const note = document.createElement('span');
    note.slot = 'status';
    note.id = 'note';
    note.textContent =
      'installing the agent, downloading 38 of 97 files from the mirror on the far side of the harbor';
    window.app.append(note);
    return true;
  });
  await page.until(() => window.$('slicc-app', 'header .status').getBoundingClientRect().width > 0);
  assert.deepEqual(
    await page.evaluate(() => {
      const note = document.getElementById('note');
      const header = window.$('slicc-app', 'header').getBoundingClientRect();
      const box = note.getBoundingClientRect();
      const network = window.$('slicc-app', 'header [data-network]').getBoundingClientRect();
      const style = getComputedStyle(note);
      return [
        style.color,
        box.top >= header.top && box.bottom <= header.bottom,
        box.right <= network.left,
        style.whiteSpace,
        style.textOverflow,
        note.scrollWidth > note.clientWidth,
      ];
    }),
    ['rgb(1, 2, 3)', true, true, 'nowrap', 'ellipsis', true]
  );
  assert.equal(await page.evaluate(below), true);
  await shot(page, 'notice-light');
  await page.evaluate(() => {
    document.getElementById('note').hidden = true;
    return true;
  });
  await page.until(
    () => window.$('slicc-app', 'header .status').getBoundingClientRect().width === 0
  );
  await page.evaluate(() => {
    document.getElementById('note').hidden = false;
    document.querySelector('slicc-app').style.width = '390px';
    return true;
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  assert.equal(
    await page.evaluate(() => getComputedStyle(window.$('slicc-app', 'header .status')).display),
    'none'
  );
  assert.deepEqual(page.errors, []);
});

test('the network indicator shows the health and opens the Network panel', async (t) => {
  const page = await open(t);
  const indicator = () => {
    const button = window.$('slicc-app', 'header [data-network]');
    return [
      button.dataset.health,
      button.getAttribute('accessible-label'),
      button.querySelector('swc-status-light')?.getAttribute('variant') ?? null,
      button.textContent.replace(/\s+/g, ' ').trim(),
    ];
  };
  assert.deepEqual(await page.evaluate(indicator), [
    'limited',
    'Network: limited',
    'notice',
    'Network limited',
  ]);
  await page.evaluate(() => window.$('slicc-app', 'header [data-network]').click());
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'network');
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('network')
        ?.shadowRoot?.querySelector('[data-route]')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
      return [
        root.querySelector('[data-route]').dataset.route,
        root.querySelector('[data-action=install-extension]').getAttribute('href'),
        [...root.querySelectorAll('section[aria-labelledby=whole] [data-command]')].map(
          (item) => item.dataset.command
        ),
        root.querySelector('[data-command] [data-action=copy-command]').closest('[data-command]')
          .dataset.command,
        root.querySelectorAll('li[data-url]').length,
        !!root.querySelector('[data-action=check]'),
        /\u2014/.test(root.textContent),
        root.querySelector('[data-browser]').dataset.browser,
      ];
    }),
    [
      'page',
      'https://extensions.example/slicc',
      ['curl -fsSL https://get.sliccy.ai/slicc | sh', 'slicc', 'npx sliccy@next'],
      'curl -fsSL https://get.sliccy.ai/slicc | sh',
      2,
      true,
      false,
      'none',
    ]
  );
  await shot(page, 'network-light');
  await page.evaluate(() => {
    window.app.model.network.setScenario('failing');
    return true;
  });
  await page.until(
    () => window.$('slicc-app', 'header [data-network]').dataset.health === 'failing'
  );
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', 'header [data-network] swc-status-light').getAttribute('variant')
    ),
    'negative'
  );
  await page.evaluate(() => {
    window.app.model.network.setScenario('ok');
    return true;
  });
  await page.until(
    () =>
      !!window.$('slicc-app', 'slicc-dock').content('network')?.shadowRoot?.querySelector('details')
  );
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', 'header [data-network]').textContent.replace(/\s+/g, ' ').trim()
    ),
    'Network'
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
      return [
        root.querySelector('[data-route]').dataset.route,
        root.querySelector('[data-route]').textContent.trim(),
        root.querySelector('[data-browser]').dataset.browser,
        root.querySelector('[data-browser]').textContent.trim(),
      ];
    }),
    [
      'link',
      'Through slicc on this computer, which reaches every site.',
      'link',
      'Browser automation: through slicc on this computer.',
    ]
  );
  await shot(page, 'network-ok');
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '390px';
    return true;
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.until(
    () => !!window.$('slicc-app', 'header [data-network] swc-icon-cloud-state-online')
  );
  assert.deepEqual(page.errors, []);
});

test('Tailscale signs in with an auth key, picks an exit node and signs out', async (t) => {
  const page = await open(t, { network: 'ok', tailnet: 'needs-login' });
  await page.evaluate(() => window.app.show('network'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('network')
        ?.shadowRoot?.querySelector('[data-form=auth-key] sp-textfield')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const shadow = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
      const input = shadow
        .querySelector('[data-form=auth-key] sp-textfield')
        .shadowRoot.querySelector('input');
      return [
        input.type,
        input.hasAttribute('name'),
        shadow.querySelector('[data-action=tailnet-sign-in]').getAttribute('target'),
      ];
    }),
    ['password', false, '_blank']
  );
  await shot(page, 'tailnet-sign-in');
  await page.evaluate(() => {
    const shadow = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
    shadow.querySelector('[data-form=auth-key] sp-textfield').value = 'tskey-auth-k1';
    shadow.querySelector('[data-action=submit-auth-key]').click();
  });
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('network')
        .shadowRoot.querySelector('section[data-tailnet]').dataset.tailnet === 'running'
  );
  assert.equal(
    await page.evaluate(() =>
      /tskey-auth-k1/.test(
        window
          .$('slicc-app', 'slicc-dock')
          .content('network')
          .shadowRoot.querySelector('[data-form=auth-key]')?.innerHTML ?? ''
      )
    ),
    false
  );
  await page.until(() =>
    /Tailscale is connected/.test(
      window.$('slicc-app', 'header swc-tooltip[for=network]').textContent
    )
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const shadow = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
      return [
        shadow.querySelector('[data-copy=name] code').textContent.trim(),
        shadow.querySelector('[data-copy=address] code').textContent.trim(),
        shadow.querySelector('sp-picker[data-action=exit-node]').value,
      ];
    }),
    ['slicc-harbor', '100.64.12.7', 'none']
  );
  await page.evaluate(() => {
    const picker = window
      .$('slicc-app', 'slicc-dock')
      .content('network')
      .shadowRoot.querySelector('sp-picker[data-action=exit-node]');
    picker.value = 'auto';
    picker.dispatchEvent(new Event('change'));
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('network').shadowRoot.querySelector('[data-exit]')
        .dataset.exit === 'node'
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('network')
        .shadowRoot.querySelector('[data-exit]')
        .textContent.trim()
    ),
    'Internet through the exit node keel-router.'
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const shadow = window.$('slicc-app', 'slicc-dock').content('network').shadowRoot;
      return [
        shadow.querySelector('[data-route]').dataset.route,
        shadow.querySelector('[data-route]').textContent.trim(),
        window.$('slicc-app', 'header [data-network]').dataset.health,
      ];
    }),
    ['tailnet', 'Through the Tailscale exit node keel-router, which reaches every site.', 'ok']
  );
  await shot(page, 'tailnet-running');
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('network')
      .shadowRoot.querySelector('[data-action=tailnet-sign-out]')
      .click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock')
        .content('network')
        .shadowRoot.querySelector('section[data-tailnet]').dataset.tailnet === 'needs-login'
  );
  assert.deepEqual(page.errors, []);
});

test('linked devices pick the exit, unlink, and retry local network access', async (t) => {
  const page = await open(t, { network: 'ok', tailnet: 'running', links: 'exit' });
  await page.evaluate(() => window.app.show('network'));
  await page.evaluate(() => {
    window.netPanel = () => window.$('slicc-app', 'slicc-dock').content('network')?.shadowRoot;
  });
  await page.until(() => !!window.netPanel()?.querySelector('section[data-links]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const shadow = window.netPanel();
      return [
        shadow.querySelector('section[data-links]').dataset.links,
        shadow.querySelector('sp-picker[data-action=exit]').value,
        shadow.querySelector('[data-route]').dataset.route,
        !!shadow.querySelector('[data-exit]'),
        shadow.querySelector('[data-device=link-quay] [data-exit-badge]').textContent.trim(),
        !!shadow.querySelector('[data-action=exit-node]'),
      ];
    }),
    ['linked', 'link:link-quay', 'link', false, 'Exit', false]
  );
  await shot(page, 'links-exit');
  await page.evaluate(() => {
    const picker = window.netPanel().querySelector('sp-picker[data-action=exit]');
    picker.value = 'tailnet:auto';
    picker.dispatchEvent(new Event('change'));
  });
  await page.until(
    () => window.netPanel().querySelector('[data-route]').dataset.route === 'tailnet'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.netPanel().querySelector('[data-route]').textContent.trim(),
      !!window.netPanel().querySelector('[data-exit]'),
    ]),
    ['Through the Tailscale exit node keel-router, which reaches every site.', false]
  );
  await page.evaluate(() =>
    window.netPanel().querySelector('[data-device=link-dock] [data-action=unlink]').click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => !window.netPanel().querySelector('[data-device=link-dock]'));
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock').content('network').style.width = '420px';
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await page.evaluate(() => {
      const host = window.$('slicc-app', 'slicc-dock').content('network');
      const edge = host.getBoundingClientRect().right;
      return [...host.shadowRoot.querySelectorAll('li.device > *, sp-picker, .command')]
        .filter((element) => element.getBoundingClientRect().right > edge + 0.5)
        .map((element) => element.className || element.localName);
    }),
    []
  );
  await page.evaluate(() => window.app.model.network.setLinks('denied'));
  await page.until(() => !!window.netPanel().querySelector('[data-link-permission=denied]'));
  await shot(page, 'links-denied');
  await page.evaluate(() => window.netPanel().querySelector('[data-action=retry-links]').click());
  await page.until(
    () => window.netPanel().querySelector('section[data-links]').dataset.links === 'linked'
  );
  assert.deepEqual(page.errors, []);
});

test('leaders disconnect without a confirm, reconnect, and forget through one', async (t) => {
  const page = await open(t, { leaders: 'two' });
  await page.evaluate(() => window.app.show('network'));
  await page.evaluate(() => {
    window.netPanel = () => window.$('slicc-app', 'slicc-dock').content('network')?.shadowRoot;
    window.leaderRow = (id) => window.netPanel().querySelector(`li[data-leader="${id}"]`);
    window.leaderLight = (id) =>
      window.leaderRow(id).querySelector('swc-status-light').textContent.trim();
  });
  await page.until(() => !!window.netPanel()?.querySelector('section[data-leaders]'));
  const cove = 'https://hub.cove-studio.example';
  const marsh = 'https://tray.marsh-desk.example';
  assert.deepEqual(
    await page.evaluate(
      ([a, b]) => [window.leaderRow(a).dataset.state, window.leaderRow(b).dataset.state],
      [cove, marsh]
    ),
    ['connected', 'failed']
  );
  await shot(page, 'leaders-two');
  await page.evaluate(
    (id) => window.leaderRow(id).querySelector('[data-action=disconnect-leader]').click(),
    cove
  );
  await page.until((id) => window.leaderRow(id)?.dataset.state === 'disconnected', cove);
  assert.equal(
    await page.evaluate(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]')),
    false
  );
  assert.deepEqual(
    await page.evaluate(
      (id) => [
        window.leaderLight(id),
        [...window.leaderRow(id).querySelectorAll('[data-action]')].map((b) => b.dataset.action),
      ],
      cove
    ),
    ['Disconnected', ['reconnect-leader', 'forget-leader']]
  );
  await page.evaluate(
    (id) => window.leaderRow(id).querySelector('[data-action=reconnect-leader]').click(),
    cove
  );
  await page.until((id) => window.leaderRow(id)?.dataset.state === 'connected', cove);
  assert.equal(await page.evaluate((id) => window.leaderLight(id), cove), 'Connected');
  await page.evaluate(
    (id) => window.leaderRow(id).querySelector('[data-action=forget-leader]').click(),
    marsh
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const button = window.$('slicc-app', 'slicc-confirm', '[data-action]');
      return [button.textContent.trim(), button.getAttribute('variant')];
    }),
    ['Forget', 'negative']
  );
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until((id) => !window.leaderRow(id), marsh);
  assert.ok(await page.evaluate((id) => !!window.leaderRow(id), cove));
  assert.deepEqual(page.errors, []);
});

test('without a network port there is no indicator and no Network panel', async (t) => {
  const page = await open(t, { network: 'off' });
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.$('slicc-app', '[data-network]'),
      !!window.$('slicc-app', '[data-surface=network]'),
    ]),
    [false, false]
  );
  assert.deepEqual(page.errors, []);
});

test('a mount point that needs a folder gets one through Insert folder', async (t) => {
  const page = await open(t, { mounts: 'needs' });
  await page.evaluate(() => window.app.show('files'));
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('files')
        ?.shadowRoot?.querySelector('[data-action=insert-folder]')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const button = window
        .$('slicc-app', 'slicc-dock')
        .content('files')
        .shadowRoot.querySelector('[data-action=insert-folder]');
      return [button.dataset.id, button.getAttribute('accessible-label')];
    }),
    ['/mnt/photos', 'Insert folder at /mnt/photos']
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock')
      .content('files')
      .shadowRoot.querySelector('[data-action=insert-folder]')
      .click()
  );
  await page.until(
    () =>
      !window
        .$('slicc-app', 'slicc-dock')
        .content('files')
        ?.shadowRoot?.querySelector('[data-action=insert-folder]')
  );
  assert.deepEqual(await page.evaluate(() => window.app.model.files.mounts()), ['/mnt/photos']);
  assert.deepEqual(page.errors, []);
});

test('the agent picker lists cones and opens the agents panel for the rest', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  assert.deepEqual(
    await page
      .evaluate(() =>
        [...window.$('slicc-app', 'header sp-picker').querySelectorAll('sp-menu-item')].map(
          (item) => [
            item.value,
            [...item.childNodes]
              .filter((node) => node.nodeType === 3)
              .map((node) => node.textContent)
              .join('')
              .trim(),
          ]
        )
      )
      .then((items) => [
        items.slice(0, -3).every(([value]) => value.startsWith('cone-')),
        items.length > 4,
        items.at(-3),
        items.at(-2),
        items.at(-1),
      ]),
    [
      true,
      true,
      ['slicc:new-cone', 'New cone'],
      ['slicc:delete-cone', 'Delete cone'],
      ['slicc:all-agents', 'Show all agents'],
    ]
  );
  await page.evaluate(() => {
    const picker = window.$('slicc-app', 'header sp-picker');
    picker.value = 'slicc:all-agents';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'agents');
  assert.deepEqual(
    await page.evaluate(() => {
      const picker = window.$('slicc-app', 'header sp-picker');
      return [picker.value, picker.open, window.model.agent.active()];
    }),
    ['cone-sliccy', false, 'cone-sliccy']
  );
  await page.evaluate(() => {
    window.model.agent.select('scoop-otter');
    return true;
  });
  await page.until(() => window.$('slicc-app', 'header sp-picker').value === 'cone-harbor');
  assert.deepEqual(page.errors, []);
});

test('the chat header lists chat models with their provider and starts a new chat', async (t) => {
  const page = await open(t);
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window
          .$('slicc-app', 'slicc-dock', 'slicc-chat')
          .shadowRoot.querySelectorAll('header sp-picker[label=Model] sp-menu-item'),
      ].map((item) => [item.value, item.querySelector('[slot=description]').textContent])
    ),
    [
      ['claude-opus-5-5', 'Anthropic'],
      ['claude-sonnet-5-5', 'Anthropic'],
      ['claude-haiku-4-5', 'Anthropic'],
      ['local-small', 'This browser'],
    ]
  );
  await page.evaluate(() => {
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('header sp-picker[label=Model]').open = true;
    return true;
  });
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelector('header sp-picker[label=Model]').open === true
  );
  await shot(page, 'model-picker');
  await page.evaluate(() => {
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('header sp-picker[label=Model]').open = false;
    return true;
  });
  await shot(page, 'before-new-chat');
  const id = await page.evaluate(() => window.model.agent.active());
  assert.ok(await page.evaluate((id) => window.model.agent.messages(id).length > 0, id));
  const frozen = await page.evaluate(() => window.model.agent.frozen().length);
  assert.equal(
    await page.evaluate(
      () =>
        window
          .$('slicc-app', 'slicc-dock', 'slicc-chat')
          .shadowRoot.querySelector('header swc-tooltip[for=new-chat]').textContent
    ),
    'Start a new conversation. This one stays in the Freezer.'
  );
  await page.evaluate(() => {
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('header [data-action=new-chat]')
      .click();
    return true;
  });
  await page.until((id) => window.model.agent.messages(id).length === 0, id);
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('header [data-action=new-chat]')
      .hasAttribute('disabled')
  );
  await shot(page, 'after-new-chat');
  assert.deepEqual(
    await page.evaluate((id) => {
      const [entry] = window.model.agent.frozen().filter((cone) => !cone.live);
      return [window.model.agent.frozen().length, entry.id.startsWith(`${id}-chat-`)];
    }, id),
    [frozen + 1, true]
  );
  assert.deepEqual(page.errors, []);
});

test('the chat header refreshes its models once the first provider connects, on one row at 1280 and 420', async (t) => {
  const page = await open(t, { providers: 'none' });
  const viewport = (width) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await viewport(1280);
  const header = () => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const head = root.querySelector('header');
    const picker = head.querySelector('sp-picker[label=Model]');
    const tops = [...head.children]
      .filter(
        (child) => child.localName !== 'swc-tooltip' && child.getBoundingClientRect().height > 0
      )
      .map((child) =>
        Math.round(child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2)
      );
    const button = head.querySelector('[data-action=new-chat]');
    return {
      setUp: !!head.querySelector('[data-action=set-up-model]'),
      options: picker ? [...picker.querySelectorAll('sp-menu-item')].map((item) => item.value) : [],
      value: picker?.value ?? null,
      rows: Math.max(...tops) - Math.min(...tops) < 12 ? 1 : 2,
      label: button.textContent.trim(),
      name: button.getAttribute('accessible-label'),
    };
  };
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat')?.shadowRoot.querySelector('header')
  );
  assert.deepEqual(await page.evaluate(header), {
    setUp: true,
    options: [],
    value: null,
    rows: 1,
    label: 'New conversation',
    name: null,
  });
  await shot(page, 'models-before-provider');
  await page.evaluate(() =>
    window.model.settings.connect('openai', 'sk-invented-key').then(() => true)
  );
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelector('header sp-picker[label=Model]')?.value === 'gpt-6-mini'
  );
  assert.deepEqual(await page.evaluate(header), {
    setUp: false,
    options: ['gpt-6', 'gpt-6-mini'],
    value: 'gpt-6-mini',
    rows: 1,
    label: 'New conversation',
    name: null,
  });
  assert.equal(await page.evaluate(() => window.model.settings.get().model), 'gpt-6-mini');
  await shot(page, 'models-after-provider');
  await viewport(420);
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        ?.shadowRoot.querySelector('header[data-compact] [data-action=new-chat]')
  );
  assert.deepEqual(await page.evaluate(header), {
    setUp: false,
    options: ['gpt-6', 'gpt-6-mini'],
    value: 'gpt-6-mini',
    rows: 1,
    label: '',
    name: 'New conversation',
  });
  await shot(page, 'chat-header-420');
  assert.deepEqual(page.errors, []);
});

test('chat stays pinned to the bottom while content grows after render', async (t) => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
    const column = log.querySelector('.column');
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const gap = () => log.scrollHeight - log.scrollTop - log.clientHeight;
    const grow = async (px) => {
      const block = document.createElement('div');
      block.style.height = `${px}px`;
      column.append(block);
      await frame();
      await frame();
    };
    await grow(log.clientHeight * 2);
    const pinned = gap();
    await new Promise((resolve) => setTimeout(resolve));
    log.scrollTop -= 30;
    await grow(log.clientHeight * 2);
    const stale = gap();
    log.dispatchEvent(new WheelEvent('wheel', { deltaY: -log.scrollTop }));
    log.scrollTop = 0;
    await frame();
    await grow(300);
    window.model.agent.emit('messages', window.model.agent.active());
    await frame();
    await grow(300);
    const reading = log.scrollTop;
    log.scrollTop = log.scrollHeight;
    await frame();
    await grow(300);
    return { pinned, stale, reading, back: gap() };
  });
  assert.ok(result.pinned <= 1, JSON.stringify(result));
  assert.ok(result.stale <= 1, JSON.stringify(result));
  assert.equal(result.reading, 0);
  assert.ok(result.back <= 1, JSON.stringify(result));
});

test('chat lets the reader scroll up by wheel or keyboard while content streams in', async (t) => {
  const page = await open(t);
  const center = await page.evaluate(() => {
    const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
    const column = log.querySelector('.column');
    window.chatGap = () => log.scrollHeight - log.scrollTop - log.clientHeight;
    window.streaming = setInterval(() => {
      const block = document.createElement('div');
      block.style.height = '20px';
      column.append(block);
    }, 16);
    const box = log.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  const held = () =>
    page.evaluate(async () => {
      const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let top = -1;
      while (top !== log.scrollTop) {
        top = log.scrollTop;
        await wait(150);
      }
      await wait(300);
      return { top, after: log.scrollTop, gap: window.chatGap() };
    });
  await page.until(() => {
    const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
    return log.scrollHeight > log.clientHeight * 3 && window.chatGap() <= 21;
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    ...center,
    deltaX: 0,
    deltaY: -400,
  });
  await page.until(() => window.chatGap() > 300);
  const wheel = await held();
  await page.evaluate(() => {
    const log = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log');
    log.scrollTop = log.scrollHeight;
  });
  await page.until(() => window.chatGap() <= 21);
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.log').focus());
  await page.press('PageUp');
  await page.until(() => window.chatGap() > 200);
  const key = await held();
  await page.evaluate(() => clearInterval(window.streaming));
  for (const result of [wheel, key]) {
    assert.equal(result.after, result.top, JSON.stringify(result));
    assert.ok(result.gap > 200, JSON.stringify(result));
  }
  assert.deepEqual(page.errors, []);
});

test('the composer floats clear of the log, describes its keys and shows what you and the agent are doing', async (t) => {
  const page = await open(t, { delay: '40', speech: 'dummy' });
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
  await page.evaluate(() => {
    const chat = () => window.$('slicc-app', 'slicc-dock', 'slicc-chat');
    const field = () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field');
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.composerProbe = async () => {
      await frame();
      const log = chat().shadowRoot.querySelector('.log');
      log.scrollTop = log.scrollHeight;
      await frame();
      const thread = log.querySelector('swc-conversation-thread');
      const composer = chat().shadowRoot.querySelector('slicc-composer');
      return {
        last: thread.lastElementChild.getBoundingClientRect().bottom,
        top: composer.getBoundingClientRect().top,
        height: composer.getBoundingClientRect().height,
        gap: log.scrollHeight - log.scrollTop - log.clientHeight,
      };
    };
    window.composerValue = () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').value;
    window.composerIcon = () => {
      const loader = field().shadowRoot.querySelector('swc-pixel-loader');
      return [
        field().getAttribute('loader'),
        loader.getAttribute('icon'),
        loader.closest('[aria-hidden=true]') !== null,
      ];
    };
    window.statusIcon = () =>
      [...chat().shadowRoot.querySelectorAll('swc-response-status[slot=status][status=active]')]
        .at(-1)
        ?.getAttribute('loader') ?? null;
    window.seenIcons = [];
    setInterval(() => {
      const icon = window.statusIcon();
      if (icon && window.seenIcons.at(-1) !== icon) window.seenIcons.push(icon);
    }, 10);
  });

  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').shadowRoot;
      return [root.querySelectorAll('.hint, kbd').length, getComputedStyle(root.host).position];
    }),
    [0, 'absolute']
  );

  const description = async () => {
    const { result } = await page.send('Runtime.evaluate', {
      expression:
        "window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field').shadowRoot.querySelector('textarea')",
    });
    const { nodes } = await page.send('Accessibility.getPartialAXTree', {
      objectId: result.objectId,
      fetchRelatives: false,
    });
    return [nodes[0].name?.value, nodes[0].description?.value];
  };
  assert.deepEqual(await description(), [
    'Message',
    'Enter sends, Shift+Enter adds a new line, / lists commands, @ mentions.',
  ]);

  const rest = await page.evaluate(() => window.composerProbe());
  assert.ok(rest.gap <= 1, JSON.stringify(rest));
  assert.ok(rest.last <= rest.top, JSON.stringify(rest));
  assert.deepEqual(await page.evaluate(() => window.composerIcon()), ['aiLogo', 'aiLogo', true]);

  await page.insert('First line');
  await page.until(() => window.composerIcon()[0] === 'pencil');
  assert.deepEqual(await page.evaluate(() => window.composerIcon()), ['pencil', 'pencil', true]);
  await page.press('Enter', 'shift');
  await page.insert('Second line');
  await page.press('Enter', 'shift');
  await page.insert('Third line');
  await page.until((height) => {
    const box = window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer')
      .getBoundingClientRect();
    return box.height > height + 20;
  }, rest.height);
  const draft = await page.evaluate(() => window.composerProbe());
  assert.ok(draft.height > rest.height, JSON.stringify({ rest, draft }));
  assert.ok(draft.gap <= 1, JSON.stringify(draft));
  assert.ok(draft.last <= draft.top, JSON.stringify(draft));
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer')
      .addFiles([new File(['Porto, 21 C'], 'porto.txt', { type: 'text/plain' })])
  );
  await page.until(
    (height) =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').getBoundingClientRect()
        .height >
      height + 20,
    draft.height
  );
  const attached = await page.evaluate(() => window.composerProbe());
  assert.ok(attached.last <= attached.top, JSON.stringify(attached));

  await page.press('Backspace');
  assert.equal(await page.evaluate(() => window.composerIcon()[0]), 'brush');
  await page.until(() => window.composerIcon()[0] === 'pencil');
  await page.press('Delete');
  assert.equal(await page.evaluate(() => window.composerIcon()[0]), 'brush');

  await page.evaluate(() => {
    const composer = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer');
    composer.value = '';
    composer.attachments = [];
  });
  await page.until(() => window.composerIcon()[0] === 'aiLogo');
  await page.evaluate(() => {
    window.speechText = 'Search for the cache TTL';
    window.model.settings.update({ pushToTalk: true });
  });
  await altM(page, 'keyDown');
  await page.until(() => window.composerIcon()[0] === 'microphone');
  await page.until(() => window.composerValue() === 'Search for the cache TTL');
  await altM(page, 'keyUp');
  await page.until(() => window.composerIcon()[0] === 'pencil');
  await page.evaluate(() => window.model.settings.update({ pushToTalk: false }));

  await page.press('Enter');
  await page.until(() => window.statusIcon() === 'mag');
  assert.deepEqual(
    await page.evaluate(() => [window.composerIcon()[0], window.composerIcon()[1]]),
    ['aiLogo', 'aiLogo']
  );
  await page.insert('More');
  assert.equal(await page.evaluate(() => window.composerIcon()[0]), 'aiLogo');
  assert.deepEqual(await description(), [
    'Message',
    'Enter steers, Ctrl+Enter queues, Escape stops, Shift+Enter adds a new line, / lists commands, @ mentions.',
  ]);
  await page.press('Enter', 'ctrl');
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.queued')
  );
  const queued = await page.evaluate(() => window.composerProbe());
  assert.ok(queued.height > rest.height, JSON.stringify({ rest, queued }));
  assert.ok(queued.last <= queued.top, JSON.stringify(queued));
  await page.until(
    () => !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.queued')
  );
  await page.until(() => !window.model.agent.busy('cone-sliccy'));

  for (const [prompt, icons] of [
    ['Add a Kelvin helper', ['aiLogo', 'page', 'pencil', 'aiLogo']],
    ['Run the tests', ['aiLogo', 'hourglass', 'aiLogo']],
    ['Open the docs', ['eye', 'aiLogo']],
  ]) {
    await page.evaluate((text) => {
      window.seenIcons = [];
      void window.model.agent.send('cone-sliccy', text);
    }, prompt);
    await page.until(() => window.model.agent.busy('cone-sliccy'));
    await page.until(() => !window.model.agent.busy('cone-sliccy'));
    assert.deepEqual(await page.evaluate(() => window.seenIcons), icons, prompt);
  }

  const focus = await page.evaluate(async () => {
    const chat = window.$('slicc-app', 'slicc-dock', 'slicc-chat');
    const log = chat.shadowRoot.querySelector('.log');
    const composer = chat.shadowRoot.querySelector('slicc-composer');
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const strips = [...log.querySelectorAll('summary')];
    const target = strips[Math.floor(strips.length / 2)];
    log.scrollTop = 0;
    await frame();
    log.scrollTop += target.getBoundingClientRect().top - composer.getBoundingClientRect().top + 4;
    await frame();
    const hidden = target.getBoundingClientRect().bottom > composer.getBoundingClientRect().top;
    target.focus();
    await frame();
    return {
      strips: strips.length,
      hidden,
      focused: chat.shadowRoot.activeElement === target,
      bottom: target.getBoundingClientRect().bottom,
      top: composer.getBoundingClientRect().top,
    };
  });
  assert.ok(focus.strips > 1 && focus.hidden && focus.focused, JSON.stringify(focus));
  assert.ok(focus.bottom <= focus.top, JSON.stringify(focus));

  const frost = (features) =>
    page.send('Emulation.setEmulatedMedia', { features }).then(() =>
      page.evaluate(() => {
        const style = getComputedStyle(
          window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer'),
          '::before'
        );
        return [style.backdropFilter, style.maskImage, style.borderTopStyle];
      })
    );
  t.after(() => page.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {}));
  const blurred = await frost([]);
  assert.notEqual(blurred[0], 'none');
  assert.notEqual(blurred[1], 'none');
  assert.deepEqual(await frost([{ name: 'prefers-reduced-transparency', value: 'reduce' }]), [
    'none',
    'none',
    'none',
  ]);
  assert.deepEqual(await frost([{ name: 'forced-colors', value: 'active' }]), [
    'none',
    'none',
    'solid',
  ]);
  assert.deepEqual(page.errors, []);
});

test('push to talk turns on from the + menu or Settings, dictates while Alt+M is held, and stops on release or blur', async (t) => {
  const page = await open(t, { delay: '40', speech: 'dummy' });
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
  await page.evaluate(() => {
    const composer = () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer');
    window.talk = () => {
      const field = composer().shadowRoot.querySelector('swc-prompt-field');
      return {
        value: composer().value,
        icon: field.getAttribute('loader'),
        log: window.speechLog.join(','),
      };
    };
    window.talkItem = () => composer().shadowRoot.querySelector('sp-menu-item[value=push-to-talk]');
  });
  const description = async () => {
    const { result } = await page.send('Runtime.evaluate', {
      expression:
        "window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field').shadowRoot.querySelector('textarea')",
    });
    const { nodes } = await page.send('Accessibility.getPartialAXTree', {
      objectId: result.objectId,
      fetchRelatives: false,
    });
    return nodes[0].description?.value;
  };
  const release = (key) =>
    page.send(
      'Input.dispatchKeyEvent',
      key === 'Alt'
        ? { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 }
        : { type: 'keyUp', key: 'µ', code: 'KeyM', windowsVirtualKeyCode: 77, modifiers: 1 }
    );
  const reset = () =>
    page.evaluate(() => {
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').value = '';
      window.speechLog.length = 0;
    });

  assert.equal(await page.evaluate(() => window.model.settings.get().pushToTalk), false);
  assert.doesNotMatch(await description(), /Alt\+M/);
  await altM(page, 'keyDown');
  await release('M');
  await page.until(() => window.talk().value === 'µ');
  assert.equal(await page.evaluate(() => window.talk().log), '');
  await reset();

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field')
      .shadowRoot.querySelector('.swc-PromptField-upload')
      .click()
  );
  await page.until(
    () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover')?.open
  );
  const item = () =>
    page.evaluate(() => {
      const element = window.talkItem();
      return [
        element.getAttribute('role'),
        element.getAttribute('aria-checked'),
        element.querySelector('[slot=description]').textContent,
      ];
    });
  assert.deepEqual(await item(), ['menuitemcheckbox', 'false', 'Hold Alt+M to dictate']);
  await page.evaluate(() => window.talkItem().click());
  await page.until(() => window.model.settings.get().pushToTalk === true);
  await page.until(() => window.talkItem().getAttribute('aria-checked') === 'true');
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover').open
    ),
    true
  );
  await shot(page, 'push-to-talk-menu-on');
  await page.evaluate(() => window.talkItem().click());
  await page.until(() => window.model.settings.get().pushToTalk === false);
  await page.until(() => window.talkItem().getAttribute('aria-checked') === 'false');
  await page.evaluate(() => window.talkItem().click());
  await page.until(() => window.model.settings.get().pushToTalk === true);
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover').open = false;
  });
  await page.until(
    () => !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-popover').open
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field')
      .shadowRoot.querySelector('textarea')
      .focus()
  );
  assert.match(await description(), /, hold Alt\+M to dictate\.$/);

  await altM(page, 'keyDown');
  await page.until(() => window.talk().icon === 'microphone');
  await page.until(() => window.talk().value === 'Check the Porto forecast');
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'µ',
    code: 'KeyM',
    windowsVirtualKeyCode: 77,
    modifiers: 1,
    autoRepeat: true,
    text: 'µ',
  });
  assert.deepEqual(await page.evaluate(() => window.talk()), {
    value: 'Check the Porto forecast',
    icon: 'microphone',
    log: 'start',
  });
  await release('M');
  await page.until(() => window.talk().log === 'start,stop');
  await page.until(() => window.talk().icon === 'pencil');
  await release('Alt');

  await reset();
  await altM(page, 'keyDown');
  await page.until(() => window.talk().icon === 'microphone');
  await release('Alt');
  await page.until(() => window.talk().log === 'start,stop');
  await release('M');

  await reset();
  await altM(page, 'keyDown');
  await page.until(() => window.talk().icon === 'microphone');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.until(() => window.talk().log === 'start,stop');
  await release('M');
  await release('Alt');
  assert.equal(await page.evaluate(() => window.talk().value.includes('µ')), false);

  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(() => !!window.settingsPart('sp-switch[data-setting=pushToTalk]'));
  assert.equal(
    await page.evaluate(() => window.settingsPart('sp-switch[data-setting=pushToTalk]').checked),
    true
  );
  await page.evaluate(() => window.settingsPart('sp-switch[data-setting=pushToTalk]').click());
  await page.until(() => window.model.settings.get().pushToTalk === false);
  assert.deepEqual(page.errors, []);
});

test('without speech recognition there is no push to talk, and Alt+M types as usual', async (t) => {
  const page = await open(t, { speech: 'none' });
  await page.evaluate(() => window.model.settings.update({ pushToTalk: true }));
  await page.press('2', 'alt');
  await page.until(() => /slicc-composer > swc-prompt-field > textarea/.test(window.focused()));
  assert.equal(
    await page.evaluate(
      () =>
        !!window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'sp-menu-item[value=push-to-talk]'
        )
    ),
    false
  );
  await altM(page, 'keyDown');
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'µ',
    code: 'KeyM',
    windowsVirtualKeyCode: 77,
    modifiers: 1,
  });
  await page.until(
    () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').value === 'µ'
  );
  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(() => !!window.settingsPart('sp-switch[data-setting=sendOnEnter]'));
  assert.equal(
    await page.evaluate(() => !!window.settingsPart('sp-switch[data-setting=pushToTalk]')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('the composer turns dark with the rest of the app when the theme switches', async (t) => {
  const page = await open(t);
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field')
        ?.shadowRoot?.querySelector('.swc-PromptField-box')
  );
  const probe = () => {
    const box = window
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'swc-prompt-field')
      .shadowRoot.querySelector('.swc-PromptField-box');
    const stop = getComputedStyle(box).getPropertyValue('--_swc-prompt-field-bg-stop-3');
    const lightness = Number(stop.match(/oklch\(([\d.]+)/)?.[1] ?? Number.NaN);
    return [lightness, box.getAnimations().length];
  };
  const [light] = await page.evaluate(probe);
  assert.ok(light > 0.8, `light stop ${light}`);
  await page.evaluate(() => {
    document.querySelector('slicc-app').toggleColor();
    return document
      .querySelector('slicc-app')
      .updateComplete.then(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve(true)))
      );
  });
  const [dark, running] = await page.evaluate(probe);
  assert.ok(dark < 0.4, `dark stop ${dark}`);
  assert.equal(running, 0);
  await shot(page, 'composer-after-toggle-dark');
  assert.deepEqual(page.errors, []);
});

test('the file tree follows the app theme, not the system one', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=files]').click());
  await page.until(() => !!window.row('workspace/harbor/src/lib/units.ts'));
  const theme = () => {
    const tree = window.row('workspace/harbor/src/lib/units.ts').getRootNode().host;
    const light = (color) => {
      const [r, g, b] = color.match(/\d+/g).map(Number);
      return (r + g + b) / 3 > 128;
    };
    return [
      getComputedStyle(tree).colorScheme,
      light(getComputedStyle(window.row('workspace/harbor/src/lib/units.ts')).color),
      light(
        getComputedStyle(window.filesPart('sp-search').shadowRoot.querySelector('input')).color
      ),
    ];
  };
  const toggle = () => window.$('slicc-app', 'header swc-action-button#theme').click();
  assert.deepEqual(await page.evaluate(theme), ['light', false, false]);
  await page.evaluate(toggle);
  await page.until(
    () =>
      getComputedStyle(window.row('workspace/harbor/src/lib/units.ts').getRootNode().host)
        .colorScheme === 'dark'
  );
  assert.deepEqual(await page.evaluate(theme), ['dark', true, true]);
  await shot(page, 'tree-dark');
  assert.deepEqual(page.errors, []);
});

test('the conversation runs on the AI toolkit and keeps its keys, suggestions and delegations', async (t) => {
  const page = await open(t, { delay: '0' });
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
      const thread = root.querySelector('.log .column swc-conversation-thread');
      const turns = [...thread.children];
      return [
        turns.every((turn) => turn.localName === 'swc-conversation-turn' || turn.matches('.day')),
        turns.some((turn) => turn.getAttribute('type') === 'user'),
        turns.some((turn) => turn.getAttribute('type') === 'system'),
        !!root.querySelector('.message.assistant swc-system-message'),
        !!root.querySelector('.message.user swc-user-message.body'),
      ];
    }),
    [true, true, true, true, true]
  );

  const kept = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const turn = root.querySelector('swc-conversation-turn.assistant');
    const input = document.createElement('input');
    input.className = 'probe';
    turn.querySelector('.reply').append(input);
    input.focus();
    return root.activeElement === input;
  });
  assert.equal(kept, true);
  for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) await page.press(key);
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot.activeElement?.className
    ),
    'probe'
  );
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.probe').remove();
    return true;
  });

  await page.evaluate(() => void window.model.agent.send('cone-sliccy', { text: 'Run the tests' }));
  await page.until(
    () =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'swc-suggestion-item[data-action=suggestion]'
      )
  );
  const suggestion = await page.evaluate(() => {
    const item = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'swc-suggestion-item');
    const text = item.textContent.trim();
    item.shadowRoot.querySelector('swc-button').click();
    return text;
  });
  await page.until(
    (text) =>
      window.model.agent
        .messages('cone-sliccy')
        .filter((message) => message.role === 'user')
        .at(-1)?.text === text,
    suggestion
  );

  await page.evaluate(() => window.model.agent.select('cone-harbor'));
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-action=open-scoop]')
  );
  assert.equal(
    await page.evaluate(() => {
      const button = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-action=open-scoop]');
      button.click();
      return button.dataset.target;
    }),
    'scoop-otter'
  );
  await page.until(
    () => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat:scoop-otter'
  );
  assert.deepEqual(page.errors, []);
});

for (const color of ['light', 'dark']) {
  test(`only other agents get the indigo bubble and the robot pill, subtle and readable in ${color}`, async (t) => {
    const page = await open(t, { delay: '0', color });
    await page.evaluate(() => {
      const agent = window.model.agent;
      const messages = agent.messages.bind(agent);
      const at = Date.now() - 60_000;
      const user = (id, extra) => ({
        id,
        role: 'user',
        text: `Message ${id}`,
        createdAt: at,
        ...extra,
      });
      agent.messages = (id) =>
        id !== 'cone-sliccy'
          ? messages(id)
          : [
              user('rm-own', {}),
              user('rm-cone', { from: 'harbor' }),
              user('rm-request', { origin: 'agent', from: 'harbor' }),
              user('rm-follower', { origin: 'follower', from: 'pier-nuc' }),
              user('rm-guest', { origin: 'guest', from: 'Ada' }),
              {
                id: 'rm-lick',
                role: 'lick',
                channel: 'cron',
                title: 'Nightly',
                text: 'ran',
                createdAt: at,
              },
            ];
      agent.emit('messages', 'cone-sliccy');
      return true;
    });
    await page.until(() => !!window.chatPart('[data-id=rm-lick]'));
    const seen = await page.evaluate(() => {
      const root = window.chatPart().shadowRoot;
      const rgb = (value) => {
        const parts = value.match(/[\d.]+/g).map(Number);
        return value.startsWith('color(')
          ? parts.slice(0, 3).map((part) => part * 255)
          : parts.slice(0, 3);
      };
      const lum = (value) => {
        const [r, g, b] = rgb(value).map((part) => {
          const c = part / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const body = (id) => root.querySelector(`[data-id=${id}] swc-user-message.body`);
      const own = rgb(getComputedStyle(body('rm-own')).backgroundColor);
      const tint = getComputedStyle(body('rm-cone')).backgroundColor;
      const text = getComputedStyle(body('rm-cone').querySelector('.text')).color;
      const [hi, lo] = [lum(tint), lum(text)].sort((a, b) => b - a);
      return {
        remote: [...root.querySelectorAll('[data-remote]')].map((node) => node.dataset.id),
        pills: [...root.querySelectorAll('.message.user .reaction')].map((pill) => [
          pill.closest('[data-id]').dataset.id,
          pill.getAttribute('aria-hidden'),
          pill.textContent,
        ]),
        names: [...root.querySelectorAll('[data-remote]')].map((node) =>
          node.getAttribute('aria-label')
        ),
        contrast: (hi + 0.05) / (lo + 0.05) >= 4.5,
        subtle: Math.hypot(...rgb(tint).map((part, i) => part - own[i])) <= 30,
      };
    });
    assert.deepEqual(seen, {
      remote: ['rm-cone', 'rm-request'],
      pills: [
        ['rm-cone', 'true', '🤖'],
        ['rm-request', 'true', '🤖'],
      ],
      names: ['Message from harbor', 'Request from harbor'],
      contrast: true,
      subtle: true,
    });
    await shot(page, `chat-remote-${color}`);
  });
}

test('agent requests, frozen cones and long lick bodies render as their own kind', async (t) => {
  const page = await open(t, { delay: '0' });
  await page.evaluate(() => window.model.agent.select('scoop-otter'));
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-id=m-o1]'));
  const request = await page.evaluate(() => {
    const turn = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-id=m-o1]');
    const bubble = turn.querySelector('.bubble');
    return [
      turn.dataset.origin,
      turn.querySelector('.who').textContent,
      turn.querySelector('.meta swc-badge')?.textContent.trim(),
      getComputedStyle(bubble).alignSelf,
      [...turn.querySelector('.meta').children].map((child) =>
        child.matches('.who') ? 'name' : child.matches('swc-badge') ? 'badge' : 'time'
      ),
    ];
  });
  assert.deepEqual(request, ['agent', 'harbor', 'Agent', 'flex-start', ['name', 'time', 'badge']]);
  await shot(page, 'chat-agent-request');

  await page.evaluate(() => window.model.agent.select('cone-tides'));
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-action=thaw]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
      return [!!root.querySelector('slicc-composer'), !!root.querySelector('sp-picker')];
    }),
    [false, false]
  );
  await shot(page, 'chat-frozen');
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-chat', '[data-action=thaw]').click()
  );
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer'));
  assert.equal(
    await page.evaluate(
      () => window.model.agent.list().find((agent) => agent.id === 'cone-tides').frozen
    ),
    undefined
  );

  await page.evaluate(() => window.model.agent.select('cone-release'));
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.lick[data-id=m-r5]')
  );
  const wrap = await page.evaluate(() => {
    const lick = window.$('slicc-app', 'slicc-dock', 'slicc-chat', '.lick[data-id=m-r5]');
    lick.open = true;
    lick.style.maxInlineSize = '320px';
    const pre = lick.querySelector('pre');
    const style = getComputedStyle(pre);
    return [style.whiteSpace, style.overflowWrap, pre.scrollWidth <= pre.clientWidth];
  });
  assert.deepEqual(wrap, ['pre-wrap', 'anywhere', true]);
  assert.deepEqual(page.errors, []);
});

test('the files panel mounts a folder, shows it as mounted, and ejects it', async (t) => {
  const page = await open(t, { mounts: 'mount' });
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=files]').click());
  await page.until(() => !!window.row('workspace/harbor/README.md'));
  await page.until(
    () => !!window.filesPart('.bar [data-action="mount-folder"]', '.swc-ActionButton-label')
  );
  assert.equal(
    await page.evaluate(() =>
      window.filesPart('.bar [data-action="mount-folder"]').textContent.trim()
    ),
    'Mount a folder…'
  );
  await shot(page, 'files-mount-light');

  await page.evaluate(() => window.filesPart('[data-action="mount-folder"]').click());
  await page.until(() => window.row('mnt/photos/')?.getAttribute('aria-selected') === 'true');
  await page.until(() => !!window.row('mnt/photos/README.md'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.row('mnt/photos/').getAttribute('aria-expanded'),
      [...filesPart('.mounts').querySelectorAll('li')].map((row) => [
        row.querySelector('.path').textContent,
        row.querySelector('[data-action="eject"]').dataset.path,
      ]),
      window.filesPart('.mounts .heading').textContent,
    ]),
    ['true', [['/mnt/photos', '/mnt/photos']], 'Mounted']
  );
  await shot(page, 'files-mounted-light');

  await page.evaluate(() =>
    window.filesPart('[data-action="eject"][data-path="/mnt/photos"]').click()
  );
  await page.until(() => !window.filesPart('.mounts') && !window.row('mnt/photos/'));

  await page.evaluate(() => window.model.files.mountFolder());
  await page.until(() => !!window.filesPart('.mounts') && !!window.row('mnt/photos/'));
  await page.evaluate(() => window.model.files.eject('/mnt/photos'));
  await page.until(() => !window.filesPart('.mounts') && !window.row('mnt/photos/'));

  await page.evaluate(() => {
    window.model.files.mount.scenario = 'fail';
    window.filesPart('[data-action="mount-folder"]').click();
  });
  await page.until(
    () => window.filesPart('.error')?.textContent.trim() === 'The folder couldn’t be mounted.'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.filesPart('.error').getAttribute('role'),
      window.filesPart('.error').getAttribute('aria-live'),
      !!window.filesPart('.error swc-icon-alert-diamond'),
    ]),
    ['status', 'polite', true]
  );
  await shot(page, 'files-mount-error-light');
  await page.evaluate(() => {
    window.model.files.mount.scenario = 'cancel';
    window.filesPart('[data-action="mount-folder"]').click();
  });
  await page.until(() => window.filesPart('.error').textContent.trim() === '');
  assert.deepEqual(page.errors, []);
});

async function mountedOnPhone(t, color) {
  const page = await open(t, { mounts: 'mount', color });
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '390px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.evaluate(() => window.$('slicc-app', '.rail [data-surface=files]').click());
  await page.until(() => !!window.row('workspace/harbor/README.md'));
  await page.until(() => !!window.filesPart('[data-action="mount-folder"]'));
  await page.evaluate(() => window.model.files.mountFolder());
  await page.until(() => !!window.filesPart('.mounts'));
  await page.evaluate(() => {
    window.model.files.mount.scenario = 'fail';
    window.filesPart('[data-action="mount-folder"]').click();
  });
  await page.until(() => window.filesPart('.error')?.textContent.trim() !== '');
  await shot(page, `files-mount-phone-${color}`);
  return page;
}

test('the mount button, mounted strip and error line on a phone in light', async (t) => {
  const page = await mountedOnPhone(t, 'light');
  assert.deepEqual(page.errors, []);
});

test('the mount button, mounted strip and error line in dark, on a phone and on a desktop', async (t) => {
  const page = await mountedOnPhone(t, 'dark');
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'desktop');
  await page.until(() => !!window.$('slicc-app', '.rail.left [data-surface=files]'));
  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=files]').click());
  await page.until(() => !!window.filesPart('.mounts'));
  await shot(page, 'files-mount-dark');
  const styles = () => {
    const button = window.filesPart('[data-action="mount-folder"]');
    const tip = window.filesPart('swc-tooltip[for="mount"]');
    tip.open = true;
    return new Promise((resolve) =>
      requestAnimationFrame(() =>
        resolve([
          getComputedStyle(button.querySelector('.label')).display,
          getComputedStyle(tip).display,
          button.getAttribute('accessible-label'),
        ])
      )
    );
  };
  assert.deepEqual(await page.evaluate(styles), ['inline', 'none', 'Mount a folder…']);
  await page.evaluate(() => {
    window.filesPart('swc-tooltip[for="mount"]').open = false;
    window.$('slicc-app', 'slicc-dock', 'slicc-files').style.width = '200px';
  });
  await page.until(
    () =>
      getComputedStyle(window.filesPart('[data-action="mount-folder"] .label')).display === 'none'
  );
  assert.deepEqual(await page.evaluate(styles), ['none', 'block', 'Mount a folder…']);
  await shot(page, 'files-mount-narrow-dark');
  assert.deepEqual(page.errors, []);
});

test('a panel taller than its group never scrolls the group or its tab strip away', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/ui/?delay=5');
  await page.until(() => window.ready === true);
  const moved = await page.evaluate(async () => {
    const dock = window.$('slicc-app', 'slicc-dock').shadowRoot;
    const boxes = [
      ...dock.querySelectorAll('.dv-groupview, .dv-view, .dv-split-view-container, .panel'),
    ];
    const panel = window.$('slicc-app', 'slicc-dock', 'slicc-chat').closest('.panel');
    panel.style.height = '2000px';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    panel
      .querySelector('slicc-chat')
      .shadowRoot.querySelector('.log')
      .lastElementChild.scrollIntoView({ block: 'end' });
    for (const box of boxes) box.scrollTop = 200;
    return boxes.filter((box) => box.scrollTop > 0).length;
  });
  assert.equal(moved, 0);
});

async function sized(page, width, height = 1800) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function shown(page, surface, ready) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await page.evaluate((id) => {
      window.app.show(id);
      return true;
    }, surface);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (await page.evaluate(ready)) return;
  }
  await page.until(ready);
}

async function secretsPage(t, params) {
  const page = await open(t, { links: 'linked', ...params });
  await sized(page, 1280);
  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(() => !!window.settingsPart('slicc-secrets', 'section[data-vault]'));
  await page.until(() =>
    [
      ...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('slicc-vault-button'),
    ].every((button) => !!button.shadowRoot.querySelector('swc-button'))
  );
  return page;
}

const sample = 'tide-sample-value-0042';

const valueRules = (value) => {
  const roots = [document];
  const fields = [];
  const leaks = [];
  const shownProxy = [];
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
      if (node.localName === 'iframe' && node.contentDocument) roots.push(node.contentDocument);
      for (const attr of node.attributes) {
        if (value && attr.value.includes(value)) leaks.push(`${node.localName}[${attr.name}]`);
      }
      if (node.localName === 'input') {
        const field = node.dataset.field ?? node.name ?? '';
        if (/^(value|password|passphrase|repeat)$/.test(field) || node.type === 'password')
          fields.push({
            field,
            type: node.type,
            value: node.value,
            autocomplete: node.getAttribute('autocomplete'),
            toggle: !!node
              .closest('label, .field, form, [data-form], dialog')
              ?.querySelector('[data-action*=reveal], [data-action*=show], [aria-label*=Show i]'),
          });
        if (value && node.value.includes(value))
          leaks.push(`input[${node.dataset.field ?? node.name}]`);
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (value && text.textContent.includes(value)) leaks.push('text');
      if (/fnox_proxy_/.test(text.textContent) && text.parentElement?.localName !== 'script')
        shownProxy.push(text.textContent.trim().slice(0, 60));
    }
  }
  return {
    masked: fields.every((field) => field.type === 'password' && field.autocomplete === 'off'),
    toggles: fields.filter((field) => field.toggle).length,
    filled: fields.filter((field) => field.value !== '').map((field) => field.field),
    leaks,
    proxy: shownProxy,
    console: window.consoleLog.filter((line) => value && line.includes(value)).length,
  };
};

async function clean(page, value = sample) {
  const rules = await page.evaluate(valueRules, value);
  assert.deepEqual(rules, {
    masked: true,
    toggles: 0,
    filled: [],
    leaks: [],
    proxy: [],
    console: 0,
  });
  assert.equal(
    page.errors.some((error) => error.includes(value)),
    false
  );
}

const part = (selector) => window.settingsPart('slicc-secrets', selector);

async function fill(page, selector, text) {
  await page.evaluate((target) => {
    const input = window.settingsPart('slicc-secrets', target);
    input.focus();
    return true;
  }, selector);
  await page.insert(text);
}

async function views(page, name, target, setup) {
  for (const [suffix, color, width, height] of [
    ['420-light', 'light', 420, 860],
    ['1280-dark', 'dark', 1280, 1800],
    ['1280-light', 'light', 1280, 1800],
  ]) {
    await page.evaluate((value) => {
      window.model.settings.update({ color: value });
      return true;
    }, color);
    await sized(page, width, height);
    await shown(
      page,
      'settings',
      () => !!window.settingsPart('slicc-secrets', 'section[data-vault]')
    );
    if (setup) await setup();
    await page.evaluate((selector) => {
      const host = window.settingsPart('slicc-secrets');
      (selector ? host.shadowRoot.querySelector(selector) : host).scrollIntoView({
        block: 'start',
      });
      return true;
    }, target);
    await shot(page, `${name}-${suffix}`);
  }
}

test('settings list the secrets by name, with rules, exits and reveals, but no values', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('[data-secret]')].map(
        (row) => [row.dataset.secret, row.dataset.state]
      )
    ),
    [
      ['HARBOR_API_KEY', 'active'],
      ['PIER_PUBLISH_TOKEN', 'active'],
      ['REEF_DEPLOY_KEY', 'inert'],
      ['TIDE_MAIL', 'active'],
      ['BUOY_OLD_TOKEN', 'removed'],
    ]
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('.head [data-action]'),
      ].map((node) => node.dataset.action)
    ),
    ['lock', 'protect']
  );
  await clean(page);
  await views(page, 'secrets-list');
  await views(page, 'secrets-removed', 'details[data-removed]', () =>
    page.evaluate(() => {
      window.settingsPart('slicc-secrets', 'details[data-removed]').open = true;
      return true;
    })
  );
  assert.deepEqual(page.errors, []);
});

async function form(page, action, kind) {
  await page.evaluate(
    (button, name) => {
      if (!window.settingsPart('slicc-secrets', `[data-form=${name}]`))
        window.settingsPart('slicc-secrets', button).click();
      return true;
    },
    action,
    kind
  );
  await page.until(
    (name) => !!window.settingsPart('slicc-secrets', `[data-form=${name}] input`),
    kind
  );
}

async function save(page, name, value, fail) {
  await form(page, '[data-action=add-secret]', 'add');
  await page.evaluate(() => {
    window.settingsPart('slicc-secrets', '[data-form=add] [data-field=name]').value = '';
    return true;
  });
  await fill(page, '[data-form=add] [data-field=name]', name);
  await fill(page, '[data-form=add] [data-field=value]', value);
  await page.evaluate((code) => {
    if (code) window.model.vault.fail(code, 'vault is locked');
    window.settingsPart('slicc-secrets', '[data-form] [data-action=save]').click();
    return true;
  }, fail);
  await page.until(
    () =>
      !!window.settingsPart('slicc-secrets', '[data-error=form]') ||
      !!window.settingsPart('slicc-secrets', '[data-said=saved]')
  );
}

const said = (selector) =>
  window.settingsPart('slicc-secrets', selector)?.textContent.replace(/\s+/g, ' ').trim();

test('a locked Secrets form unlocks in place with the vault button and keeps what was typed', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  await page.evaluate(() => {
    window.model.vault.lock();
    return true;
  });
  await page.until(() => window.model.vault.status().locked);
  await views(page, 'secrets-locked-form', '[data-tools]', async () => {
    await form(page, '[data-action=add-secret]', 'add');
    await page.until(
      () =>
        !!window
          .settingsPart('slicc-secrets', '[data-form] slicc-vault-button[data-action=unlock]')
          ?.shadowRoot?.querySelector('swc-button')
    );
  });
  assert.deepEqual(
    await page.evaluate(() => {
      const line = window.settingsPart('slicc-secrets', '[data-form=add] p[data-locked]');
      const button = window.settingsPart(
        'slicc-secrets',
        '[data-form=add] slicc-vault-button[data-action=unlock]'
      );
      const [a, b] = [line, button].map((node) => node.getBoundingClientRect());
      return [
        line.textContent,
        button.config.size,
        Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 4,
        window.settingsPart('slicc-secrets', '[data-form=add] [data-action=save]').disabled,
      ];
    }),
    ['Unlock the vault first', 's', true, true]
  );
  await fill(page, '[data-form=add] [data-field=name]', 'tide_token');
  await fill(page, '[data-form=add] [data-field=value]', sample);
  await page.evaluate(() => {
    window
      .settingsPart('slicc-secrets', '[data-form] slicc-vault-button[data-action=unlock]')
      .shadowRoot.querySelector('swc-button')
      .click();
    return true;
  });
  await page.until(() => !window.model.vault.status().locked);
  await page.until(() => !window.settingsPart('slicc-secrets', '[data-form] [data-locked]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.settingsPart('slicc-secrets', '[data-form=add] [data-field=name]').value,
      window.settingsPart('slicc-secrets', '[data-form=add] [data-field=value]').value.length,
      window.settingsPart('slicc-secrets', '[data-form=add] [data-action=save]').disabled,
    ]),
    ['TIDE_TOKEN', sample.length, false]
  );
  await page.evaluate(() => {
    window.settingsPart('slicc-secrets', '[data-form] [data-action=save]').click();
    return true;
  });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-said=saved]'));
  assert.equal(await page.evaluate(said, '[data-said=saved]'), 'Saved TIDE_TOKEN in the vault');
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('Add secret refuses a short value, saves a real one and never shows it', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  await form(page, '[data-action=add-secret]', 'add');
  await clean(page);
  await views(page, 'secrets-add', '.head', () => form(page, '[data-action=add-secret]', 'add'));
  await views(page, 'secrets-short-value', '.head', () => save(page, 'tide_token', 'tide42'));
  assert.equal(
    await page.evaluate(said, '[data-error=form]'),
    "Values shorter than 8 bytes can't be protected from the model"
  );
  await clean(page, 'tide42');
  assert.deepEqual(
    await page.evaluate(() => {
      const input = window.settingsPart('slicc-secrets', '[data-form=add] [data-field=value]');
      const error = window.settingsPart(
        'slicc-secrets',
        `#${input.getAttribute('aria-describedby')}`
      );
      return [
        input.getAttribute('aria-invalid'),
        error?.dataset.error,
        /slicc-secrets > input$/.test(window.focused()),
      ];
    }),
    ['true', 'form', true]
  );
  await views(page, 'secrets-vault-error', '.head', () =>
    save(page, 'tide_token', sample, 'EACCES')
  );
  assert.equal(await page.evaluate(said, '[data-error=form]'), 'Unlock the vault first');
  await clean(page);
  await sized(page, 1280);
  await save(page, 'tide_token', sample);
  assert.equal(await page.evaluate(said, '[data-said=saved]'), 'Saved TIDE_TOKEN in the vault');
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts), [{ name: 'TIDE_TOKEN' }]);
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('Replace value rotates a secret in place, with the narrow layout tidy', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  const open = () => form(page, '[data-secret=HARBOR_API_KEY] [data-action=replace]', 'replace');
  let narrow = null;
  await views(page, 'secrets-replace', '[data-secret=HARBOR_API_KEY]', async () => {
    await open();
    const measured = await page.evaluate(() => {
      const row = window.settingsPart('slicc-secrets', '[data-secret=HARBOR_API_KEY]');
      const box = row.querySelector('[data-form]').getBoundingClientRect();
      const whole = row.getBoundingClientRect();
      return innerWidth > 480
        ? null
        : { full: Math.abs(box.width - whole.width) < 2, inside: box.right <= innerWidth };
    });
    narrow ??= measured;
  });
  assert.deepEqual(narrow, { full: true, inside: true });
  await sized(page, 1280);
  await open();
  await fill(page, '[data-form=replace] [data-field=value]', sample);
  await page.evaluate(() =>
    window.settingsPart('slicc-secrets', '[data-form] [data-action=save]').click()
  );
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-said=saved]'));
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts), [
    { name: 'HARBOR_API_KEY' },
  ]);
  await clean(page);
  assert.deepEqual(page.errors, []);
});

async function picked(page) {
  await form(page, '[data-action=import]', 'import');
  await page.evaluate(() => {
    if (window.settingsPart('slicc-secrets', '[data-picks]')) return true;
    const data = new DataTransfer();
    data.items.add(new File(['invented bundle bytes'], 'harbor.slicc-vault'));
    const input = window.settingsPart('slicc-secrets', '[data-form=import] [data-field=file]');
    input.files = data.files;
    input.dispatchEvent(new Event('change'));
    window.settingsPart('slicc-secrets', '[data-form] [data-action=read]').click();
    return true;
  });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-picks]'));
}

const passes = [
  ['1280-light', 'light', 1280, 1800],
  ['1280-dark', 'dark', 1280, 1800],
  ['420-light', 'light', 420, 860],
];

async function at(t, params, color, width, height) {
  const page = await secretsPage(t, params);
  await page.evaluate((value) => {
    window.model.settings.update({ color: value });
    return true;
  }, color);
  await sized(page, width, height);
  await shown(
    page,
    'settings',
    () => !!window.settingsPart('slicc-secrets', 'section[data-vault]')
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  return page;
}

const activity = () =>
  [...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('ol.audit li')]
    .slice(0, 6)
    .map((row) => row.querySelector('.what').textContent.replace(/\s+/g, ' ').trim());

test('Import offers a pick of what the file holds, with its rules as untrusted text', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  await picked(page);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('[data-candidate]')].map(
        (row) => [row.dataset.candidate, row.querySelector('input').checked]
      )
    ),
    [
      ['LAGOON_API_KEY', true],
      ['HARBOR_API_KEY', true],
      ['KELP_WEBHOOK_SECRET', true],
      ['LAGOON_MODEL_KEY', true],
      ['MOORING_TOKEN', false],
    ]
  );
  assert.equal(
    await page.evaluate(said, '[data-rules-note]'),
    "Rules from the file aren't applied. Add them with sudo."
  );
  await views(page, 'secrets-import-pick', '[data-form=import]', () => picked(page));
  assert.deepEqual(page.errors, []);
});

for (const [suffix, color, width, height] of passes) {
  test(`one import writes one audit entry per imported secret, by you, ${suffix}`, async (t) => {
    const page = await at(t, { vault: 'secrets' }, color, width, height);
    await picked(page);
    await page.evaluate(() =>
      window.settingsPart('slicc-secrets', '[data-action=import-picked]').click()
    );
    await page.until(() => !!window.settingsPart('slicc-secrets', '[data-said=imported]'));
    assert.deepEqual(
      await page.evaluate(() =>
        [
          ...window
            .settingsPart('slicc-secrets')
            .shadowRoot.querySelectorAll('[data-said=imported] p'),
        ].map((line) => line.textContent.replace(/\s+/g, ' ').trim())
      ),
      [
        'Imported 4',
        'Skipped MOORING_TOKEN: another app that uses this vault already has this secret; use it there, or add it here by hand',
      ]
    );
    const seals = await page.evaluate(() =>
      window.model.vault
        .list()
        .audit.filter((entry) => entry.type === 'seal' && entry.source.startsWith('import:'))
        .map((entry) => [entry.name, entry.uid, entry.tag])
        .sort()
    );
    assert.deepEqual(seals, [
      ['HARBOR_API_KEY', null, null],
      ['KELP_WEBHOOK_SECRET', null, null],
      ['LAGOON_API_KEY', null, null],
      ['LAGOON_MODEL_KEY', null, null],
    ]);
    assert.ok((await page.evaluate(activity)).slice(0, 4).every((line) => line.endsWith('by you')));
    assert.deepEqual(
      await page.evaluate(() =>
        [
          ...window
            .settingsPart('slicc-secrets')
            .shadowRoot.querySelectorAll('ul.secrets[aria-labelledby=secrets] > li'),
        ].map((row) => row.dataset.secret)
      ),
      [
        'HARBOR_API_KEY',
        'KELP_WEBHOOK_SECRET',
        'LAGOON_API_KEY',
        'LAGOON_MODEL_KEY',
        'PIER_PUBLISH_TOKEN',
        'REEF_DEPLOY_KEY',
        'TIDE_MAIL',
      ]
    );
    await clean(page);
    await page.evaluate(() => {
      window.settingsPart('slicc-secrets').scrollIntoView({ block: 'start' });
      return true;
    });
    await shot(page, `secrets-import-done-${suffix}`);
    assert.deepEqual(page.errors, []);
  });

  test(`what the person does in Settings reads by you in Activity, ${suffix}`, async (t) => {
    const page = await at(t, { vault: 'secrets' }, color, width, height);
    await save(page, 'tide_token', sample);
    await form(page, '[data-secret=REEF_DEPLOY_KEY] [data-action=replace]', 'replace');
    await fill(page, '[data-form=replace] [data-field=value]', 'another-sample-value-7');
    await page.evaluate(() =>
      window.settingsPart('slicc-secrets', '[data-form] [data-action=save]').click()
    );
    await page.until(() => !window.settingsPart('slicc-secrets', '[data-form]'));
    const lines = await page.evaluate(activity);
    assert.deepEqual(lines.slice(0, 2), [
      'REEF_DEPLOY_KEY · Value replaced by you',
      'TIDE_TOKEN · Value saved by you',
    ]);
    assert.equal(
      lines[2],
      'HARBOR_API_KEY · Sent to api.harbor.example: GET /v2/ships, through slicc on this computer by cone'
    );
    await clean(page);
    await clean(page, 'another-sample-value-7');
    await page.evaluate(() => {
      window.settingsPart('slicc-secrets', '.audit-head').scrollIntoView({ block: 'start' });
      return true;
    });
    await shot(page, `secrets-by-you-${suffix}`);
    assert.deepEqual(page.errors, []);
  });
}

test('Export asks for a passphrase twice and confirms before it downloads', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  const open = () => form(page, '[data-tools] [data-action=export]', 'export');
  await views(page, 'secrets-export', '[data-form=export]', open);
  await sized(page, 1280);
  await page.evaluate(() => {
    window.model.settings.update({ color: 'light' });
    return true;
  });
  await open();
  await fill(page, '[data-form=export] [data-field=passphrase]', sample);
  await fill(page, '[data-form=export] [data-field=repeat]', sample);
  await page.evaluate(() =>
    window.settingsPart('slicc-secrets', '[data-form] [data-action=download]').click()
  );
  await page.until(() => !!window.deep('slicc-confirm'));
  await clean(page);
  assert.match(
    await page.evaluate(() =>
      window.deep('slicc-confirm').shadowRoot.textContent.replace(/\s+/g, ' ')
    ),
    /Export your secrets\? The file holds every value, encrypted with your passphrase\. Keep it somewhere safe\./
  );
  await shot(page, 'secrets-export-confirm-1280-light');
  await page.evaluate(() =>
    window.deep('slicc-confirm').shadowRoot.querySelector('[data-cancel]').click()
  );
  await page.until(() => !window.deep('slicc-confirm'));
  assert.equal(await page.evaluate(() => window.model.vault.exported), 0);
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('refused rules and policy changes show in Secrets and its activity log', async (t) => {
  const page = await secretsPage(t, { vault: 'policy' });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-refused]'));
  await clean(page);
  await views(page, 'secrets-refused', '#secrets-refused');
  await views(page, 'secrets-policy-log', '.audit-head');
  assert.equal(
    await page.evaluate(
      () =>
        window
          .settingsPart('slicc-secrets')
          .shadowRoot.querySelectorAll('.audit li[data-type=policy] [data-change]').length
    ),
    3
  );
  assert.deepEqual(page.errors, []);
});

test('the secrets activity log lists uses and reveals, pages back and filters to reveals', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets' });
  const seqs = () =>
    [...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('ol.audit li')].map(
      (row) => `${row.dataset.seq}:${row.dataset.type}`
    );
  const before = await page.evaluate(seqs);
  assert.equal(before[0].startsWith('12:'), true);
  await page.evaluate(() => window.settingsPart('slicc-secrets', '[data-action=older]').click());
  await page.until(() => !window.settingsPart('slicc-secrets', '[data-action=older]'));
  const all = await page.evaluate(seqs);
  assert.equal(all.length > before.length, true);
  assert.equal(all.at(-1), '2:mcp');
  assert.match(
    await page.evaluate(
      () => window.settingsPart('slicc-secrets', 'ol.audit li[data-type=mcp]').textContent
    ),
    /Sent to the MCP server docs at docs\.example/
  );
  await page.evaluate(() => {
    window.settingsPart('slicc-secrets', '[data-action=reveals]').click();
    return true;
  });
  await page.until(() =>
    [...window.settingsPart('slicc-secrets').shadowRoot.querySelectorAll('ol.audit li')].every(
      (row) => row.dataset.type === 'materialize'
    )
  );
  assert.ok((await page.evaluate(seqs)).length > 0);
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('with no secrets yet, settings say how secrets arrive', async (t) => {
  const page = await secretsPage(t, { vault: 'empty' });
  assert.equal(
    await page.evaluate(() => !!window.settingsPart('slicc-secrets', '[data-empty]')),
    true
  );
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('Secrets says it waits for the vault until the vault answers', async (t) => {
  const page = await secretsPage(t, { vault: 'waiting' });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-availability=waiting]'));
  await views(page, 'secrets-waiting');
  await page.evaluate(() => {
    window.model.vault.arrive();
    return true;
  });
  await page.until(() => !window.settingsPart('slicc-secrets', '[data-availability]'));
  assert.deepEqual(page.errors, []);
});

test('a due backup reminder offers Export backup and Not now', async (t) => {
  const page = await secretsPage(t, { vault: 'backup' });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-backup]'));
  await views(page, 'secrets-backup');
  await page.evaluate(() =>
    window.settingsPart('slicc-secrets', '[data-action=dismiss-backup]').click()
  );
  await page.until(() => !window.settingsPart('slicc-secrets', '[data-backup]'));
  assert.equal(await page.evaluate(() => window.model.vault.status().backupReminder), 'dismissed');
  assert.deepEqual(page.errors, []);
});

test('a locked vault offers Unlock, says to unlock to continue and shows requests as untrusted text', async (t) => {
  const page = await secretsPage(t, { vault: 'locked' });
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-value-request').later('request-reef');
    return true;
  });
  await page.until(() => !!window.settingsPart('slicc-secrets', '[data-request]'));
  assert.equal(
    await page.evaluate(() => window.settingsPart('slicc-secrets', 'section').dataset.vault),
    'locked'
  );
  assert.match(
    await page.evaluate(() =>
      window.settingsPart('slicc-secrets', '[data-prompt]').textContent.replace(/\s+/g, ' ').trim()
    ),
    /^From the agent, not checked by SLICC: /
  );
  assert.equal(
    await page.evaluate(() =>
      window.settingsPart('slicc-secrets', '[data-availability=unlock]').textContent.trim()
    ),
    'Unlock the vault to continue'
  );
  await clean(page);
  await views(page, 'secrets-locked');
  await page.evaluate(() => {
    window.model.settings.update({ color: 'light' });
    return true;
  });
  await page.evaluate(() =>
    window.settingsPart('slicc-secrets', '.head slicc-vault-button', 'swc-button').click()
  );
  await page.until(
    () => window.settingsPart('slicc-secrets', 'section').dataset.vault === 'unlocked'
  );
  await clean(page);
  assert.deepEqual(page.errors, []);
});

async function valueDialog(t, color, width) {
  const page = await open(t, { vault: 'request', color });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: width ?? 1280,
    height: width ? 860 : 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => !!window.$('slicc-app', 'slicc-value-request', 'dialog[data-request]'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const shown = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-value-request').shadowRoot;
    const box = root.querySelector('dialog').getBoundingClientRect();
    return {
      title: root.querySelector('#title').textContent.replace(/\s+/g, ' ').trim(),
      asked: root.querySelector('[data-asked]').textContent.trim(),
      actions: [...root.querySelectorAll('swc-button')].map((button) => button.dataset.action),
      inside: box.left >= 0 && box.right <= innerWidth,
    };
  });
  assert.deepEqual(shown, {
    title: 'Enter a value for TIDE_STATION_TOKEN',
    asked: 'docs-pass asks for TIDE_STATION_TOKEN',
    actions: ['later', 'cancel-request', 'save'],
    inside: true,
  });
  await shot(page, `value-request-${width ?? 1280}-${color}`);
  await page.until(() => /slicc-value-request > input/.test(window.focused()));
  await page.insert('tide42');
  await page.press('Enter');
  await page.until(() => !!window.$('slicc-app', 'slicc-value-request', '[data-error]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-value-request').shadowRoot;
      const input = root.querySelector('input[data-field=value]');
      return [
        input.getAttribute('aria-invalid'),
        input.getAttribute('aria-describedby'),
        root.querySelector('#error-request').textContent.trim(),
        input.value,
      ];
    }),
    ['true', 'error-request', "Values shorter than 8 bytes can't be protected from the model", '']
  );
  await clean(page, 'tide42');
  await shot(page, `value-request-refusal-${width ?? 1280}-${color}`);
  return page;
}

test('fnox set asks for the value in a dialog, in light', async (t) => {
  const page = await valueDialog(t, 'light');
  await page.evaluate(() => {
    const vault = window.model.vault;
    const status = vault.status();
    status.waiting.push({
      id: 'request-kelp',
      kind: 'value',
      name: 'KELP_WEBHOOK_SECRET',
      uid: 1001,
      tag: null,
      createdAt: Date.now() + 1,
      expiresAt: Date.now() + 240_000,
    });
    vault.emit('status', status);
    return true;
  });
  await page.until(() => !!window.$('slicc-app', 'slicc-value-request', '[data-more]'));
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', 'slicc-value-request', '[data-more]').textContent.trim()
    ),
    '1 more waiting'
  );
  await shot(page, 'value-request-more-1280-light');
  const focus = await page.evaluate(() => window.focused());
  assert.match(focus, /slicc-value-request > input/, focus);
  await page.insert(sample);
  await page.press('Enter');
  await page.until(
    () => window.$('slicc-app', 'slicc-value-request', 'dialog')?.dataset.request === 'request-kelp'
  );
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts), [
    { name: 'TIDE_STATION_TOKEN', request: 'request-tide' },
  ]);
  await clean(page);
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-value-request', '[data-action=later]').click()
  );
  await page.until(() => !window.$('slicc-app', 'slicc-value-request', 'dialog'));
  await clean(page);
  assert.deepEqual(page.errors, []);
});

test('fnox set asks for the value in a dialog, in dark', async (t) => {
  const page = await valueDialog(t, 'dark');
  assert.deepEqual(page.errors, []);
});

test('the fnox set dialog fits a narrow window', async (t) => {
  const page = await valueDialog(t, 'light', 420);
  assert.deepEqual(page.errors, []);
});

async function shareSecret(t, vault, color, width) {
  const page = await open(t, { vault, color });
  if (width) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.until(() => window.app.getAttribute('screen') === 'phone');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer'));
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer').openPopup('secret');
    return true;
  });
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', 'form.secret')
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  await shot(
    page,
    `composer-secret-${vault === 'off' ? 'no-vault' : 'vault'}-${width ?? 1280}-${color}`
  );
  return page;
}

for (const [color, width] of [['light'], ['dark'], ['light', 420]]) {
  test(`share a secret without a vault attaches the name only, ${color}${width ? ` at ${width}` : ''}`, async (t) => {
    const page = await shareSecret(t, 'off', color, width);
    assert.equal(
      await page.evaluate(
        () =>
          !!window.$(
            'slicc-app',
            'slicc-dock',
            'slicc-chat',
            'slicc-composer',
            'form.secret input[type=password]'
          )
      ),
      false
    );
    assert.deepEqual(page.errors, []);
  });

  test(`share a secret with a vault puts the value in the vault, ${color}${width ? ` at ${width}` : ''}`, async (t) => {
    const page = await shareSecret(t, 'secrets', color, width);
    await page.evaluate(() => {
      window
        .$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'form.secret input[name=name]'
        )
        .focus();
      return true;
    });
    await page.insert('tide token');
    await page.evaluate(() => {
      window
        .$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'form.secret input[name=value]'
        )
        .focus();
      return true;
    });
    await page.insert(sample);
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '[data-action=share-secret]')
        .click()
    );
    await page.until(
      () =>
        window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'swc-upload-attachment[data-kind=secret] [slot=title]'
        )?.textContent === 'TIDE_TOKEN'
    );
    assert.deepEqual(await page.evaluate(() => window.model.vault.puts), [{ name: 'TIDE_TOKEN' }]);
    await clean(page);
    assert.deepEqual(page.errors, []);
  });
}

async function secretRulesDialog(t, color, width) {
  const page = await open(t, { approvals: 'secrets', color });
  if (width)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', '[data-secret-rules]'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const dialog = await page.evaluate(() => {
    const root = window.$('slicc-app', 'slicc-approvals').shadowRoot;
    const box = root.querySelector('[data-secret-rules]').getBoundingClientRect();
    return {
      notice: root.querySelector('[data-secret-rules]').dataset.secretRules,
      always: window.model.approvals.list()[0].always,
      actions: [...root.querySelectorAll('swc-button')].map((button) => button.dataset.action),
      inside: box.left >= 0 && box.right <= innerWidth,
    };
  });
  assert.deepEqual(dialog, {
    notice: '/etc/fnox/config.toml',
    always: true,
    actions: ['deny', 'once'],
    inside: true,
  });
  await shot(page, `sudo-secret-rules-${color}${width ? `-${width}` : ''}`);
  assert.deepEqual(page.errors, []);
}

test('a sudo request that changes secret rules is flagged, in light', async (t) => {
  await secretRulesDialog(t, 'light');
});

test('a sudo request that changes secret rules is flagged, in dark', async (t) => {
  await secretRulesDialog(t, 'dark');
});

test('the secret rules flag fits a narrow window', async (t) => {
  await secretRulesDialog(t, 'light', 420);
});

async function sudoFromTerminal(t) {
  const page = await open(t, { approvals: 'none' });
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=terminal]').click());
  await page.until(() => window.screen().includes('user@slicc:/workspace/harbor$'));
  await page.evaluate(() => window.terminal().focus());
  await page.until(() => window.activated().terminal);
  let count = 0;
  const raise = async () => {
    const id = `sudo-${++count}`;
    await page.evaluate((id) => {
      const now = Date.now();
      window.model.approvals.raise({
        id,
        kind: 'sudo',
        requester: { kind: 'user', name: 'cone', where: 'Terminal 1' },
        command: 'apt install jq',
        createdAt: now,
        expiresAt: now + 300_000,
        always: true,
      });
    }, id);
    await page.until(
      (id) =>
        window.$('slicc-app', 'slicc-approvals', 'dialog')?.dataset.approval === id &&
        window.focused().includes('swc-button'),
      id
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    return id;
  };
  const click = async (action) => {
    const { x, y } = await page.evaluate((action) => {
      const box = window
        .$('slicc-app', 'slicc-approvals', `[data-action=${action}]`)
        .getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, action);
    for (const type of ['mousePressed', 'mouseReleased'])
      await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const back = async (line) => {
    await page.until(() => !window.$('slicc-app', 'slicc-approvals', 'dialog'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(await page.evaluate(() => window.activated().terminal), true);
    await page.type(line);
    await page.press('Enter');
    await page.until((line) => window.screen().replace(/\n/g, '').includes(`$ ${line}`), line);
  };
  return { page, raise, click, back };
}

test('focus goes back to the terminal after each sudo decision', async (t) => {
  const { page, raise, click, back } = await sudoFromTerminal(t);
  for (const action of ['deny', 'always', 'once']) {
    await raise();
    await click(action);
    await back(`echo ${action}`);
  }
  await raise();
  await page.press('Escape');
  await back('echo escape');
  assert.deepEqual(
    (await page.evaluate(() => window.model.approvals.decisions)).map(([, decision]) => decision),
    ['deny', 'always', 'once', 'deny']
  );
  assert.deepEqual(page.errors, []);
});

test('focus goes back to the terminal after a sudo decision, even when its panel moved meanwhile', async (t) => {
  const { page, raise, click, back } = await sudoFromTerminal(t);
  await raise();
  await page.evaluate(() =>
    window
      .dock()
      .api.getPanel('terminal:term-1')
      .api.moveTo({
        group: window.dock().api.getPanel('chat:cone-sliccy').api.group,
        position: 'bottom',
      })
  );
  await page.until(
    () =>
      window.dock().api.getPanel('terminal:term-1').api.group !==
        window.dock().api.getPanel('chat:cone-sliccy').api.group &&
      window.screen().includes('user@slicc:/workspace/harbor$')
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  await click('once');
  await back('echo moved');
  await raise();
  await page.evaluate(() =>
    window
      .dock()
      .api.getPanel('terminal:term-1')
      .api.moveTo({
        group: window.dock().api.getPanel('chat:cone-sliccy').api.group,
        position: 'right',
      })
  );
  await page.press('Escape');
  await back('echo raced');
  assert.deepEqual(page.errors, []);
});

test('focus goes back to the terminal after a sudo request answered elsewhere', async (t) => {
  const { page, raise, click, back } = await sudoFromTerminal(t);
  const first = await raise();
  await page.evaluate((id) => window.model.approvals.end(id, 'answered'), first);
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', 'dialog[data-gone]'));
  await page.until(() => window.focused().includes('swc-button'));
  await click('close');
  await back('echo closed');
  const second = await raise();
  await page.evaluate((id) => window.model.approvals.end(id, 'answered'), second);
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', 'dialog[data-gone]'));
  await page.until(() => window.focused().includes('swc-button'));
  await page.press('Escape');
  await back('echo escaped');
  assert.deepEqual(page.errors, []);
});

test('a guest message is asked as plain text, Deny is focused, and a rejected decide shows inline', async (t) => {
  const page = await open(t, { approvals: 'guest' });
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    return true;
  });
  const ask = async (id) => {
    await page.until(
      (id) =>
        window.approvals().querySelector('dialog')?.dataset.approval === id &&
        window.focused().includes('swc-button'),
      id
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
  };
  const click = async (action) => {
    const { x, y } = await page.evaluate((action) => {
      const box = window
        .approvals()
        .querySelector(`[data-action=${action}]`)
        .getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, action);
    for (const type of ['mousePressed', 'mouseReleased'])
      await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  await ask('guest-note');
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.approvals();
      const text = root.querySelector('[data-guest-text]');
      return {
        kind: root.querySelector('[data-approval-kind]').dataset.approvalKind,
        title: root.querySelector('h2').textContent,
        text: text.textContent,
        markup: text.children.length,
        files: root.querySelectorAll('[data-attachments] li').length,
        verdict: root.querySelector('[data-verdict]').textContent,
        actions: [...root.querySelectorAll('swc-button')].map((button) => button.dataset.action),
        focused: root.activeElement?.dataset.action,
      };
    }),
    {
      kind: 'guest-message',
      title: 'Allow a guest’s message?',
      text: 'Could you tidy the harbor schedule?\nKeep <b>Tuesday</b> as it is and **skip** the ferry rows.',
      markup: 0,
      files: 2,
      verdict:
        'The automatic check would allow this: it asks for an edit inside the shared folder.',
      actions: ['deny', 'once'],
      focused: 'deny',
    }
  );
  await click('deny');
  await ask('guest-fetch');
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('[data-verdict]').dataset.verdict),
    'deny'
  );
  await click('once');
  await ask('guest-late');
  await click('once');
  await page.until(() => !!window.approvals().querySelector('[data-error]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.approvals().querySelector('[data-error]').textContent.trim(),
      window.approvals().querySelector('dialog').dataset.approval,
      window.model.approvals.decisions,
    ]),
    [
      'Someone else already answered this.',
      'guest-late',
      [
        ['guest-note', 'deny'],
        ['guest-fetch', 'once'],
      ],
    ]
  );
  await page.evaluate(() => window.model.approvals.end('guest-late', 'withdrawn'));
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(page.errors, []);
});

test('a rejected decide leaves only Close, which moves on, and the body fills the dialog at 420', async (t) => {
  const page = await open(t, { approvals: 'guest' });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    window.span = () => {
      const dialog = window.approvals().querySelector('dialog').getBoundingClientRect();
      const alert = window.approvals().querySelector('sp-alert-dialog');
      const style = getComputedStyle(alert);
      return [...alert.shadowRoot.querySelectorAll('.grid, .header, .content, .button-group')].map(
        (part) => {
          const box = part.getBoundingClientRect();
          return [
            part.className,
            Math.round(box.left - dialog.left - Number.parseFloat(style.paddingLeft)),
            Math.round(dialog.right - Number.parseFloat(style.paddingRight) - box.right),
          ];
        }
      );
    };
    return true;
  });
  const ask = async (id) => {
    await page.until(
      (id) =>
        window.approvals().querySelector('dialog')?.dataset.approval === id &&
        window.focused().includes('swc-button'),
      id
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
  };
  const flush = [
    ['grid', 0, 0],
    ['header', 0, 0],
    ['content', 0, 0],
    ['button-group', 0, 0],
  ];
  await ask('guest-note');
  assert.deepEqual(await page.evaluate(() => window.span()), flush);
  await page.evaluate(() => {
    window.model.approvals.end('guest-note', 'withdrawn');
    window.model.approvals.end('guest-fetch', 'withdrawn');
    return true;
  });
  await ask('guest-late');
  assert.deepEqual(await page.evaluate(() => window.span()), flush);
  await page.evaluate(() => {
    window.approvals().querySelector('[data-action=once]').click();
    return true;
  });
  await page.until(() => window.approvals().activeElement?.dataset.action === 'close');
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.approvals();
      return {
        approval: root.querySelector('dialog').dataset.approval,
        error: root.querySelector('[data-error]').textContent.trim(),
        actions: [...root.querySelectorAll('swc-button')].map((button) => button.dataset.action),
        timer: !!root.querySelector('[data-timer]'),
        countdown: root.textContent.includes('Denied automatically'),
      };
    }),
    {
      approval: 'guest-late',
      error: 'Someone else already answered this.',
      actions: ['close'],
      timer: false,
      countdown: false,
    }
  );
  await page.evaluate(() => {
    const now = Date.now();
    window.model.approvals.raise({
      id: 'guest-thanks',
      kind: 'guest-message',
      requester: { kind: 'guest', name: 'Seat 4 (Tove)' },
      agentId: 'cone-sliccy',
      text: 'Thanks, that is all for today.',
      createdAt: now,
      expiresAt: now + 300_000,
      always: false,
    });
    return true;
  });
  await page.press('Enter');
  await ask('guest-thanks');
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.approvals();
      return [
        [...root.querySelectorAll('swc-button')].map((button) => button.dataset.action),
        !!root.querySelector('[data-error]'),
        !!root.querySelector('[data-timer]'),
        root.activeElement?.dataset.action,
      ];
    }),
    [['deny', 'once'], false, true, 'deny']
  );
  await page.press('Enter');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['guest-thanks', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('without decide, guest requests wait as notices for the device in control', async (t) => {
  const page = await open(t, { approvals: 'guest-follower' });
  await page.evaluate(() => {
    window.notes = () => [
      ...(window
        .$('slicc-app', 'slicc-dock')
        .content('chat:cone-sliccy')
        ?.shadowRoot.querySelector('slicc-notices')
        ?.shadowRoot.querySelectorAll('[data-approval-notice]') ?? []),
    ];
    return true;
  });
  await page.until(() => window.notes().length === 3);
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.$('slicc-app', 'slicc-approvals', 'dialog'),
      ...window
        .notes()
        .map((note) => [note.dataset.approvalKind, note.querySelector('p').textContent]),
    ]),
    [
      false,
      [
        'guest-message',
        "Seat 2 (Mara)'s message to sliccy waits for approval on the device in control.",
      ],
      [
        'guest-tool',
        'docs-pass wants to run fetch for Seat 2 (Mara), which waits for approval on the device in control.',
      ],
      [
        'guest-message',
        "Seat 3 (Ilse)'s message to this cone waits for approval on the device in control.",
      ],
    ]
  );
  assert.deepEqual(page.errors, []);
});

async function vaultHold(t, hold, color, width) {
  const page = await open(t, { hold, vault: hold === 'locked' ? 'locked' : 'off', color });
  if (width)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.hold')
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  const shown = await page.evaluate(() => {
    const element = window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.hold');
    const box = element.getBoundingClientRect();
    const button = element.querySelector('slicc-vault-button');
    const field = element.parentElement.querySelector('swc-prompt-field');
    return {
      hold: element.dataset.hold,
      role: element.getAttribute('role'),
      text: element.querySelector('.text').textContent.trim(),
      button: button?.dataset.action ?? null,
      above: box.bottom <= field.getBoundingClientRect().top,
      inside: box.left >= 0 && box.right <= innerWidth,
    };
  });
  assert.deepEqual(shown, {
    hold,
    role: 'status',
    text: `${hold === 'locked' ? 'Unlock the vault to continue' : 'Waiting for the vault'} · 2 tool results held`,
    button: hold === 'locked' ? 'unlock-vault' : null,
    above: true,
    inside: true,
  });
  await shot(page, `vault-hold-${hold}-${color}${width ? `-${width}` : ''}`);
  return page;
}

test('a vault hold waits above the composer', async (t) => {
  const page = await vaultHold(t, 'waiting', 'light');
  assert.deepEqual(page.errors, []);
});

test('a locked vault hold offers Unlock above the composer, in light', async (t) => {
  const page = await vaultHold(t, 'locked', 'light');
  assert.deepEqual(page.errors, []);
});

test('a locked vault hold offers Unlock above the composer, in dark', async (t) => {
  const page = await vaultHold(t, 'locked', 'dark');
  assert.deepEqual(page.errors, []);
});

test('a locked vault hold fits a narrow window and clears once unlocked', async (t) => {
  const page = await vaultHold(t, 'locked', 'light', 420);
  await page.evaluate(() => window.model.vault.answer({ kind: 'unlock' }).then(() => true));
  await page.until(
    () => !window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.hold')
  );
  assert.equal(await page.evaluate(() => window.model.agent.hold()), null);
  assert.deepEqual(page.errors, []);
});

test('a terminal remounted after a phone round trip lays out its history at the fitted width', async (t) => {
  const page = await open(t);
  const viewport = (width) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await viewport(1280);
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=terminal]').click());
  await page.until(() => window.screen().includes('user@slicc:/workspace/harbor$'));
  const words = Array.from({ length: 24 }, (_, i) => `w${String(i).padStart(2, '0')}`).join(' ');
  await page.evaluate(() => window.terminal().focus());
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.insert(`echo ${words}`);
  await page.press('Enter');
  await page.until(
    () =>
      window
        .screen()
        .split('\n')
        .filter((row) => row.endsWith('w23')).length === 2
  );
  await page.evaluate(() => {
    window.laid = (text) => {
      const cols = window.terminal().screen.cols;
      const rows = window.screen().split('\n');
      const chunk = (line) =>
        Array.from({ length: Math.ceil(line.length / cols) }, (_, i) =>
          line.slice(i * cols, (i + 1) * cols).trimEnd()
        );
      const want = [...chunk(`user@slicc:/workspace/harbor$ echo ${text}`), ...chunk(text)];
      const at = rows.indexOf(want[0]);
      return { cols, ok: at >= 0 && want.every((row, i) => rows[at + i] === row), rows };
    };
  });
  assert.equal(await page.evaluate((text) => window.laid(text).ok, words), true);
  for (let round = 0; round < 2; round++) {
    await viewport(420);
    await page.until(() => document.querySelector('slicc-app').screen === 'phone');
    await page.until(() => !window.terminal());
    await viewport(1280);
    await page.until(() => document.querySelector('slicc-app').screen === 'desktop');
    await page.until(() => window.terminal()?.screen?.cols > 20);
    const after = await page
      .within(3000, (text) => window.laid(text).ok, words)
      .catch(() => page.evaluate((text) => window.laid(text), words));
    assert.equal(after, true, `round ${round + 1}: ${JSON.stringify(after)}`);
  }
  assert.deepEqual(page.errors, []);
});

async function accountKey(page, id, value) {
  await page.evaluate((account) => {
    if (!window.settingsPart(`form.key[data-id="${account}"]`))
      window.settingsPart(`.account[data-id="${account}"] swc-button[data-action=connect]`).click();
    return true;
  }, id);
  await page.until(
    (account) => !!window.settingsPart(`form.key[data-id="${account}"] input[data-field=value]`),
    id
  );
  if (value === undefined) return;
  await page.evaluate((account) => {
    window.settingsPart(`form.key[data-id="${account}"] input[data-field=value]`).focus();
    return true;
  }, id);
  await page.insert(value);
}

async function accountViews(page, name, target, setup) {
  for (const [suffix, color, width, height] of [
    ['420-light', 'light', 420, 860],
    ['1280-dark', 'dark', 1280, 1100],
    ['1280-light', 'light', 1280, 1100],
  ]) {
    await page.evaluate((value) => {
      window.model.settings.update({ color: value });
      return true;
    }, color);
    await sized(page, width, height);
    await shown(page, 'settings', () => !!window.settingsPart('.accounts'));
    if (setup) await setup();
    await page.evaluate((selector) => {
      window.settingsPart(selector).scrollIntoView({ block: 'start' });
      return true;
    }, target);
    await shot(page, `${name}-${suffix}`);
  }
}

test('Accounts keeps a vault-backed key in the vault and never shows it', async (t) => {
  const page = await secretsPage(t, { vault: 'secrets', accounts: 'vault' });
  const sent = await page.evaluate(() => {
    window.sentToSettings = [];
    const connect = window.model.settings.connect.bind(window.model.settings);
    window.model.settings.connect = (...args) => {
      window.sentToSettings.push(JSON.stringify(args));
      return connect(...args);
    };
    return true;
  });
  assert.equal(sent, true);
  assert.match(
    await page.evaluate(
      () => window.settingsPart('.account[data-id=github] .identity').textContent
    ),
    /Kept in the vault/
  );
  assert.match(
    await page.evaluate(
      () => window.settingsPart('.account[data-id="mcp:docs"] .identity').textContent
    ),
    /Token kept in the vault/
  );
  await accountKey(page, 'openai');
  assert.deepEqual(
    await page.evaluate(() => {
      const input = window.settingsPart('form.key[data-id=openai] input[data-field=value]');
      return [input.type, input.getAttribute('autocomplete'), input.getAttribute('spellcheck')];
    }),
    ['password', 'off', 'false']
  );
  await clean(page);
  await accountViews(page, 'accounts-vault-key', 'h2:nth-of-type(3)', () =>
    accountKey(page, 'openai')
  );
  const short = async () => {
    await accountKey(page, 'openai', 'tide42');
    await page.evaluate(() => {
      window.settingsPart('form.key[data-id=openai] swc-button[data-action=save]').click();
      return true;
    });
    await page.until(() => !!window.settingsPart('form.key[data-id=openai] .problem'));
  };
  await short();
  assert.equal(
    await page.evaluate(() =>
      window.settingsPart('form.key[data-id=openai] .problem').textContent.trim()
    ),
    "Values shorter than 8 bytes can't be protected from the model"
  );
  assert.equal(
    await page.evaluate(() =>
      window
        .settingsPart('form.key[data-id=openai] input[data-field=value]')
        .getAttribute('aria-describedby')
    ),
    'key-problem'
  );
  await clean(page, 'tide42');
  await accountViews(page, 'accounts-vault-short-key', 'h2:nth-of-type(3)', short);
  await clean(page, 'tide42');
  await accountKey(page, 'openai', sample);
  await page.evaluate(() => {
    window.settingsPart('form.key[data-id=openai] swc-button[data-action=save]').click();
    return true;
  });
  await page.until(() =>
    window
      .settingsPart('.account[data-id=openai] .identity')
      ?.textContent.includes('Key kept in the vault')
  );
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts), [
    { name: 'OPENAI_API_KEY', options: { kind: 'model', provider: 'openai' } },
  ]);
  assert.deepEqual(await page.evaluate(() => window.sentToSettings), ['["openai"]']);
  await clean(page);
  await accountViews(page, 'accounts-vault-connected', 'h2:nth-of-type(3)');

  await accountKey(page, 'mcp:tickets');
  await accountViews(page, 'accounts-vault-mcp-token', '[data-group=mcp]', () =>
    accountKey(page, 'mcp:tickets')
  );
  await accountKey(page, 'mcp:tickets', sample);
  await page.evaluate(() => {
    window.settingsPart('form.key[data-id="mcp:tickets"] swc-button[data-action=save]').click();
    return true;
  });
  await page.until(() =>
    window
      .settingsPart('.account[data-id="mcp:tickets"] .identity')
      ?.textContent.includes('Token kept')
  );
  assert.deepEqual(await page.evaluate(() => window.model.vault.puts.at(-1)), {
    name: 'MCP_TICKETS_TOKEN',
    options: { kind: 'mcp', server: 'tickets' },
  });
  assert.equal(
    await page.evaluate(
      (value) => window.sentToSettings.some((args) => args.includes(value)),
      sample
    ),
    false
  );
  await clean(page);
  await page.until(
    () =>
      !!window.settingsPart('slicc-secrets', '[data-secret=OPENAI_API_KEY] [data-provider]') &&
      !!window.settingsPart('slicc-secrets', '[data-secret=MCP_DOCS_TOKEN] [data-server]')
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.settingsPart('slicc-secrets', '[data-secret=OPENAI_API_KEY] [data-used-for]')
          ?.textContent
    ),
    'Model requests to OpenAI, by the agent'
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.settingsPart('slicc-secrets', '[data-secret=MCP_TICKETS_TOKEN] [data-used-for]')
          ?.textContent
    ),
    'Requests to the MCP server tickets, by the agent'
  );
  await views(page, 'secrets-model-and-mcp', '[data-secret=MCP_DOCS_TOKEN]');

  await page.evaluate(() => {
    window.model.vault.lock();
    return true;
  });
  await page.until(() => window.model.vault.status().locked);
  await page.evaluate(() => {
    window.model.settings.disconnect('openai');
    return true;
  });
  await page.until(
    () => !!window.settingsPart('.account[data-id=openai] swc-button[data-action=connect]')
  );
  await accountKey(page, 'openai');
  await page.until(
    () => !!window.settingsPart('form.key[data-id=openai] [data-locked] slicc-vault-button')
  );
  await accountViews(page, 'accounts-vault-locked', 'h2:nth-of-type(3)', () =>
    accountKey(page, 'openai')
  );
  await clean(page);
  assert.deepEqual(page.errors, []);
});
