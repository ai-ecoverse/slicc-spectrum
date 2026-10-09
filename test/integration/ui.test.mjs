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
    ['files', 'memory', 'freezer', 'settings', 'updates']
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
        item.textContent.trim()
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
    };
  };
  assert.deepEqual(await page.evaluate(state), {
    screen: 'desktop',
    panels: ['agents', 'changes', 'chat:cone-sliccy'],
    rails: [
      'files',
      'memory',
      'freezer',
      'settings',
      'updates',
      'sprinkle:suggestions',
      'terminal',
      'browser',
      'monitor',
      'network',
    ],
  });

  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  await page.until(() => !!window.$('slicc-app', '.rail.left [data-surface=agents]'));
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
    rails: ['agents', 'files', 'changes', 'terminal', 'browser'],
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
  });
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  await page.until(() => !!window.$('slicc-app', '.rail.left [data-surface=agents]'));

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
        .length === 0
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

test('the browser lists its windows with thumbnails, and follows agents', async (t) => {
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
  assert.match(first, /harbor · localhost localhost:8787 Loaded Active Driven by harbor/);
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
  await page.until(() => window.model.browser.active() === 'tab-docs');
  await page.until(
    () =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-docs] .window')
        .getAttribute('aria-current') === 'true'
  );
  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'li[data-id=tab-pull] .window').click()
  );
  await page.until(() => window.model.browser.active() === 'tab-pull');

  await page.press('6', 'alt');
  await page.until(() => /slicc-browser > button$/.test(window.focused()));
  assert.equal(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock', 'slicc-browser', '.window[aria-current=true]')
        .closest('li')
        .getAttribute('data-id')
    ),
    'tab-pull'
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

  await page.evaluate(() => window.$('slicc-app', '.rail.left [data-surface=freezer]').click());
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').content('freezer')?.shadowRoot.querySelectorAll('.card')
        .length === 3
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
  await page.evaluate(() =>
    [
      ...window
        .$('slicc-app', 'slicc-dock')
        .content('freezer')
        .shadowRoot.querySelectorAll('.bar swc-action-button'),
    ]
      .find((button) => /Freeze kv-spike/.test(button.textContent))
      .click()
  );
  await page.until(() => !window.model.agent.list().some((agent) => agent.id === 'cone-kv-spike'));
  await page.press('2', 'alt');
  await page.insert('/freeze');
  await page.press('Escape');
  await page.press('Enter');
  await page.until(() => window.model.agent.frozen().length === 4);
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
  await page.until(() => window.$('slicc-app', 'slicc-tray', 'swc-popover').open === true);
  assert.match(
    await page.evaluate(() => window.$('slicc-app', 'slicc-tray', '.panel').textContent),
    /leader/
  );
  await shot(page, 'tray-light');
  await page.evaluate(() =>
    [...window.$('slicc-app', 'slicc-tray').shadowRoot.querySelectorAll('.panel swc-action-button')]
      .find((button) => button.textContent.trim() === 'Disconnect')
      .click()
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
        root.querySelector('code').textContent.trim(),
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
          (item) => [item.value, item.textContent.trim()]
        )
      )
      .then((items) => [
        items.slice(0, -2).every(([value]) => value.startsWith('cone-')),
        items.length > 3,
        items.at(-2),
        items.at(-1),
      ]),
    [true, true, ['slicc:new-cone', 'New cone'], ['slicc:all-agents', 'Show all agents']]
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
    'Freeze this chat and start a new one'
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
      const [entry] = window.model.agent.frozen();
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
