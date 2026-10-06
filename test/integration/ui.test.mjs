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

  assert.deepEqual(Object.keys(panels).sort(), ['agents', 'changes', 'chat']);
  assert.ok(panels.agents.box[0] < panels.chat.box[0], JSON.stringify(panels));
  assert.ok(panels.changes.box[0] > panels.chat.box[0]);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app', '.rail.left').querySelectorAll('[data-surface]')].map(
        (b) => b.dataset.surface
      )
    ),
    ['files', 'settings']
  );
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'sp-theme').getAttribute('system')),
    'spectrum-two'
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
  assert.equal(rows.length, 7);
  const status = await page.evaluate(() =>
    window.$('slicc-app', 'footer').textContent.replace(/\s+/g, ' ')
  );
  assert.match(status, /sliccy · idle Claude Sonnet 5\.5 Context 21% 4 changes/);
  assert.deepEqual(
    chrome.requests.filter((path) => path.startsWith('/node_modules/')),
    []
  );
  assert.deepEqual(page.errors, []);
  await shot(page, 'shell-light');
});

test('panels move, close, float and come back, and a reload keeps the layout', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
      el.textContent.includes('Agents')
    );
    const target = dock.api.getPanel('chat').group.element.querySelector('.dv-content-container');
    return window.drag(tab, target, 0.5, 0.95);
  });
  let panels = await page.evaluate(layout);
  assert.ok(panels.agents.box[1] > panels.chat.box[1], JSON.stringify(panels));
  assert.equal(panels.agents.box[0], panels.chat.box[0]);

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
      el.textContent.includes('Chat')
    );
    tab
      .querySelector('.dv-default-tab-action')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    tab.querySelector('.dv-default-tab-action').click();
  });
  await page.until(() => !window.$('slicc-app', 'slicc-dock').has('chat'));

  await page.evaluate(() => window.$('slicc-app', 'sp-action-menu').click());
  await page.until(() => window.$('slicc-app', 'sp-action-menu').open === true);
  await page.until(() => {
    window.$('slicc-app', 'sp-action-menu sp-menu-item[value=chat]').click();
    return window.$('slicc-app', 'slicc-dock').has('chat');
  });

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const tab = [...dock.shadowRoot.querySelectorAll('.dv-tab')].find((el) =>
      el.textContent.includes('Agents')
    );
    tab.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 })
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
  assert.ok(reset.agents.box[0] < reset.chat.box[0]);
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
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'sp-textfield').value === 'Run the tests'
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
  await shot(page, 'chat-streaming');
  assert.equal(
    await page.evaluate(() =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'sp-button').textContent.trim()
    ),
    'Stop'
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'article.assistant:last-of-type')?.dataset
        .status === 'done'
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
      .$('slicc-app', 'slicc-dock', 'slicc-chat', 'article.assistant:last-of-type')
      .textContent.replace(/\s+/g, ' ')
  );
  assert.match(reply, /bash Run the tests done/);
  assert.match(reply, /All 3 tests pass/);
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'sp-textfield').value
    ),
    ''
  );

  await page.evaluate(() => {
    window
      .$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'article.assistant:last-of-type details.tool summary'
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
          'article.assistant:last-of-type details.tool[open] .output'
        ).textContent
    ),
    /ℹ pass 3/
  );
  assert.deepEqual(page.errors, []);
  await shot(page, 'chat-light');
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
      window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'article.assistant:last-of-type')?.dataset
        .status === 'stopped'
  );
  assert.deepEqual(page.errors, []);
});

test('the theme switches between light and dark and survives a reload', async (t) => {
  const page = await open(t);
  const surface = () => [
    window.$('slicc-app', 'sp-theme').getAttribute('color'),
    getComputedStyle(window.$('slicc-app', 'slicc-dock', 'slicc-chat')).backgroundColor,
  ];
  const light = await page.evaluate(surface);
  assert.equal(light[0], 'light');

  await page.evaluate(() =>
    window.$('slicc-app', 'header sp-action-button[label^=Switch]').click()
  );
  await page.until(() => window.$('slicc-app', 'sp-theme').getAttribute('color') === 'dark');
  const dark = await page.evaluate(surface);
  assert.notEqual(dark[1], light[1]);
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

test('the keyboard reaches every panel, agent and tab', async (t) => {
  const page = await open(t);
  await page.press('1', 'alt');
  await page.until(() => /slicc-agents > li#cone-sliccy$/.test(window.focused()));
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  await page.until(() => /li#cone-harbor$/.test(window.focused()));
  await page.press('Enter');
  await page.until(() => window.model.agent.active() === 'cone-harbor');
  await page.press('ArrowUp');
  await page.press(' ');
  await page.until(() => window.model.agent.active() === 'scoop-wren');

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
        .api.getPanel('chat')
        .group.element.querySelector('.dv-content-container'),
      0.5,
      0.5
    )
  );
  await page.until(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    return dock.api.getPanel('agents').group === dock.api.getPanel('chat').group;
  });
  await page.press('2', 'alt');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat');
  await page.press(']', 'ctrl');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'agents');
  await page.press('[', 'ctrl');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat');
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
    panels: ['agents', 'changes', 'chat'],
    rails: ['files', 'settings', 'terminal', 'browser'],
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
    panels: ['chat'],
    rails: ['agents', 'files', 'changes', 'terminal', 'browser', 'settings'],
  });
  await shot(page, 'phone-light');

  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '900px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'tablet');
  assert.deepEqual(await page.evaluate(state), {
    screen: 'tablet',
    panels: ['agents', 'chat'],
    rails: ['files', 'settings', 'changes', 'terminal', 'browser'],
  });
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('agents'));
  await page.until(() => !!window.$('slicc-app', '.rail.left [data-surface=agents]'));

  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'desktop');
  assert.deepEqual((await page.evaluate(state)).panels, ['agents', 'changes', 'chat']);

  await page.goto('/ui/?delay=5');
  await page.until(() => window.ready === true);
  await page.evaluate(() => {
    document.querySelector('slicc-app').style.width = '900px';
  });
  await page.until(() => document.querySelector('slicc-app').screen === 'tablet');
  await page.until(() => document.querySelector('slicc-app').dock.api.panels.length === 1);
  assert.deepEqual(await page.evaluate(state), {
    screen: 'tablet',
    panels: ['chat'],
    rails: ['agents', 'files', 'settings', 'changes', 'terminal', 'browser'],
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
  await page.until(() => window.model.files.changes().length === 3);
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
        'li[data-path="/workspace/harbor/src/lib/retry.ts"] sp-action-button[label=Revert]'
      )
      .click()
  );
  await page.until(() => window.model.files.changes().length === 2);
  await page.until(() => window.row('workspace/harbor/src/lib/retry.ts') === null);
  assert.match(await page.evaluate(() => window.$('slicc-app', 'footer').textContent), /2 changes/);
  assert.deepEqual(page.errors, []);
});

test('an agent edit shows up in changes, in the tree and in the open file', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.app.show('files'));
  const id = 'file:/workspace/harbor/src/lib/units.ts';
  await page.evaluate(() => window.app.open('file', '/workspace/harbor/src/lib/units.ts'));
  await page.until((id) => window.code(id).includes('toFahrenheit'), id);
  await page.evaluate(() => window.model.agent.send('cone-sliccy', 'Add a Kelvin helper'));
  await page.until(() => window.model.files.changes().length === 5);
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
          .shadowRoot.querySelectorAll('sp-action-button'),
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

test('terminals run the fake shell, and open and close in tabs', async (t) => {
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

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-terminals', 'sp-action-button[label="New terminal"]')
      .click()
  );
  await page.until(() => window.model.terminals.list().length === 2);
  await page.until(
    () =>
      window.screen().includes('$') && !window.screen().replace(/\n/g, '').includes('git status')
  );
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.type('exit');
  await page.press('Enter');
  await page.until(() => window.model.terminals.list().length === 1);
  await page.until(() => window.screen().replace(/\n/g, '').includes('git status'));
  assert.deepEqual(page.errors, []);
});

test('the browser shows tabs, navigates, and follows agents', async (t) => {
  const page = await open(t);
  await page.evaluate(() => window.$('slicc-app', '.rail.right [data-surface=browser]').click());
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.tab'));
  const tabs = () =>
    [
      ...window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot.querySelectorAll('.tab'),
    ].map((tab) => `${tab.dataset.id}:${tab.getAttribute('aria-selected')}`);
  assert.deepEqual(await page.evaluate(tabs), [
    'tab-preview:true',
    'tab-docs:false',
    'tab-pull:false',
  ]);
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.viewport img'));
  await shot(page, 'browser-light');

  await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.tab[data-id=tab-docs]').click()
  );
  await page.until(() => window.model.browser.active() === 'tab-docs');
  await page.press('6', 'alt');
  await page.until(() => /slicc-browser > sp-textfield/.test(window.focused()));
  await page.evaluate(() => {
    const field = window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'sp-textfield');
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await page.insert('example.com/status');
  await page.press('Enter');
  await page.until(
    () =>
      window.model.browser.list().find((tab) => tab.id === 'tab-docs').url ===
      'https://example.com/status'
  );
  await page.until(
    () => window.model.browser.list().find((tab) => tab.id === 'tab-docs').status === 'complete'
  );
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-browser', '.viewport img')
      ?.alt.includes('example.com/status')
  );

  await page.evaluate(() => window.model.agent.send('cone-harbor', 'Open the units docs'));
  await page.until(() => window.model.browser.list().length === 4);
  await page.until(
    () => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.tab[aria-selected=true] .agent')
  );
  assert.match(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-dock', 'slicc-browser', 'form').textContent
    ),
    /Driven by harbor/
  );
  assert.deepEqual(page.errors, []);
});

test('settings change the theme and the composer, and connect accounts', async (t) => {
  const page = await open(t);
  await page.evaluate(() =>
    window.$('slicc-app', 'header sp-action-button[label=Settings]').click()
  );
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'settings');
  await page.until(
    () =>
      !!window.$('slicc-app', 'slicc-dock', 'slicc-settings', '.account[data-id=openai] sp-button')
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

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-settings', '.account[data-id=openai] sp-button')
      .click()
  );
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-settings', '.account[data-id=openai]')
      .textContent.includes('Connected')
  );
  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-settings', '.account[data-id=github] sp-button')
      .click()
  );
  await page.until(
    () =>
      window.model.settings.accounts().find((account) => account.id === 'github').status ===
      'disconnected'
  );
  await shot(page, 'settings-dark');
  assert.deepEqual(page.errors, []);
});

test('terminal and browser in dark', async (t) => {
  const page = await open(t, { color: 'dark' });
  await page.evaluate(() => window.app.show('browser'));
  await page.until(() => !!window.$('slicc-app', 'slicc-dock', 'slicc-browser', '.viewport img'));
  await shot(page, 'browser-dark');
  await page.press('5', 'alt');
  await page.until(() => /slicc-terminal/.test(window.focused()));
  await page.type('cat README.md');
  await page.press('Enter');
  await page.until(() => window.screen().includes('A small forecast API'));
  await shot(page, 'terminal-dark');
  assert.deepEqual(page.errors, []);
});
