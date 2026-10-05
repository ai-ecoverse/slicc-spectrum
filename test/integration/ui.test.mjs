import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
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

  assert.deepEqual(Object.keys(panels).sort(), ['agents', 'chat']);
  assert.ok(panels.agents.box[0] < panels.chat.box[0], JSON.stringify(panels));
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
    () => window.ready === true && window.$('slicc-app', 'slicc-dock')?.api.panels.length === 2
  );
  await page.until(
    (expected) => JSON.stringify(window.layout()) === expected,
    JSON.stringify(panels)
  );

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

  await page.evaluate(() => window.$('slicc-app', 'header sp-action-button').click());
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
  await page.until(() => /slicc-chat/.test(window.focused()));
  await page.press('F6');
  await page.until(() => /slicc-agents/.test(window.focused()));

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
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.groups.length === 1);
  await page.press('2', 'alt');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat');
  await page.press(']', 'ctrl');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'agents');
  await page.press('[', 'ctrl');
  await page.until(() => window.$('slicc-app', 'slicc-dock').api.activePanel?.id === 'chat');
  assert.deepEqual(page.errors, []);
});
