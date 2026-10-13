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
  assert.equal(rows.length, 9);
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
  assert.match(reply, /Run the tests bash Done/);
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
    ['pnpm add -g @ai-ecoverse/wasm-git', 'git init']
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
  await page.until(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-chat')?.shadowRoot?.querySelector('details.cluster')
  );
  const cards = await page.evaluate(async () => {
    const root = window.$('slicc-app', 'slicc-dock', 'slicc-chat').shadowRoot;
    const cluster = root.querySelector('details.cluster');
    cluster.open = true;
    const all = [...cluster.querySelectorAll('details.tool')];
    for (const card of all) card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const card of all) card.open = card.dataset.tool !== 'read_file';
    window.clusterSummary = cluster
      .querySelector('summary')
      .textContent.replace(/\s+/g, ' ')
      .trim();
    return [...cluster.querySelectorAll('details.tool')].map((card) => ({
      name: card.dataset.tool,
      meta: card.querySelector('.tool-meta')?.textContent ?? null,
      input: card.querySelector('pre.input')?.textContent ?? null,
      diff: card.querySelector('slicc-diff-view')?.getAttribute('path') ?? null,
    }));
  });
  assert.equal(
    await page.evaluate(() => window.clusterSummary),
    '4 tools · 2 commands, 1 read, 1 edit Done'
  );
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
      .shadowRoot.querySelector('details.tool slicc-diff-view')
      ?.shadowRoot?.querySelector('diffs-container')
      ?.shadowRoot?.textContent.includes('dayOf')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-chat')
      .shadowRoot.querySelector('details.tool[data-tool="edit_file"]')
      .scrollIntoView({ block: 'start' })
  );
  await shot(page, 'tool-cards-light');
  await page.evaluate(() => window.model.settings.update({ color: 'dark' }));
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelector('details.tool slicc-diff-view')
        ?.getAttribute('color') === 'dark'
  );
  await shot(page, 'tool-cards-dark');
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
      cluster: count('details.cluster'),
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
    user: 5,
    steered: 1,
    assistant: 7,
    tool: 1,
    cluster: 1,
    markers: 2,
    errors: 3,
    notices: 1,
    days: 2,
    attachments: 5,
    media: 5,
    cards: 3,
    plan: 1,
    check: 4,
    diff: 1,
    questions: 3,
    delegations: 4,
    links: 1,
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
        detail: card.querySelector('.detail')?.textContent.trim() ?? null,
        oneLine: !button || button.getBoundingClientRect().height < 34,
        inside:
          !button ||
          button.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5,
      };
    });
  });
  assert.ok(
    cards.every((card) => card.oneLine && card.inside),
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
        .shadowRoot.querySelectorAll('.pending swc-button'),
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
  assert.match(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer', '.hint').textContent
    ),
    /Enter\s*steer\s*Ctrl\+Enter\s*queue\s*Esc\s*stop/
  );
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
  const tags = await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock', 'slicc-chat')
        .shadowRoot.querySelectorAll('.message.user[data-delivered] .tag'),
    ].map((tag) => tag.textContent)
  );
  assert.deepEqual([...new Set(tags)].sort(), ['Follow-up', 'Steered']);
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
  await page.until(() => !!window.memoryPart('.row[data-id=mem-10] .from'));
  assert.equal(
    await page.evaluate(() => window.memoryPart('.tools sp-picker[label=Scope]').value),
    'role:reviewer'
  );
  await shot(page, 'memory-role-notes');

  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=monitor]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('monitor')?.shadowRoot.querySelectorAll('.vital')
        .length === 4
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
        .length === 4
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
    window.$('slicc-app', 'slicc-dock').close('sprinkle:welcome');
    return true;
  });
  await page.until(() => !!window.$('slicc-app', '.rail.right [data-surface="sprinkle:welcome"]'));
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
        root.querySelector('section[aria-labelledby=whole] code').textContent.trim(),
        root.querySelectorAll('li[data-url]').length,
        !!root.querySelector('[data-action=check]'),
        /\u2014/.test(root.textContent),
        root.querySelector('[data-browser]').dataset.browser,
      ];
    }),
    [
      'page',
      'https://extensions.example/slicc',
      'npx @ai-ecoverse/slicc-node',
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
  assert.equal(
    await page.evaluate(
      () =>
        window
          .$('slicc-app', 'slicc-dock')
          .content('network')
          .shadowRoot.querySelector('[data-browser]').dataset.browser
    ),
    'proxy'
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
    return { pinned, reading, back: gap() };
  });
  assert.ok(result.pinned <= 1, JSON.stringify(result));
  assert.equal(result.reading, 0);
  assert.ok(result.back <= 1, JSON.stringify(result));
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
      light(getComputedStyle(tree.shadowRoot.querySelector('input')).backgroundColor),
    ];
  };
  const toggle = () => window.$('slicc-app', 'header swc-action-button#theme').click();
  assert.deepEqual(await page.evaluate(theme), ['light', false, true]);
  await page.evaluate(toggle);
  await page.until(
    () =>
      getComputedStyle(window.row('workspace/harbor/src/lib/units.ts').getRootNode().host)
        .colorScheme === 'dark'
  );
  assert.deepEqual(await page.evaluate(theme), ['dark', true, false]);
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
      'HARBOR_API_KEY · Sent to api.harbor.example: GET /v2/ships, through Local proxy by cone'
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
