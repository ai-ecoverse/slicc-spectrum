import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, color = 'light') {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.agents = () => window.$('slicc-app', 'slicc-dock', 'slicc-agents');
    window.agentRow = (id) => window.agents()?.shadowRoot.querySelector(`li[data-id="${id}"]`);
    window.dropButton = (id) => window.agentRow(id)?.querySelector('[data-action=drop]') ?? null;
    window.confirmShown = () =>
      window.$('slicc-app', 'slicc-confirm')?.shadowRoot.querySelector('dialog')?.open ?? false;
    window.answer = (ok) =>
      window
        .$('slicc-app', 'slicc-confirm')
        .shadowRoot.querySelector(ok ? '[data-action]' : '[data-cancel]')
        .click();
    window.promptRoot = () => window.$('slicc-app', 'slicc-prompt')?.shadowRoot ?? null;
    window.pick = (value) => {
      const picker = window.$('slicc-app', 'header sp-picker');
      picker.value = value;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.spoken = (node) =>
      [...node.childNodes]
        .map((child) =>
          child.nodeType === Node.TEXT_NODE
            ? child.textContent
            : child.nodeType !== Node.ELEMENT_NODE || child.getAttribute('aria-hidden') === 'true'
              ? ''
              : window.spoken(child)
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    return true;
  });
  return page;
}

async function chatLick(page, id) {
  await page.evaluate(() => {
    window.model.agent.select('cone-release');
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:cone-release'));
  await page.until(
    (lick) =>
      Boolean(
        window
          .$('slicc-app', 'slicc-dock')
          .content('chat:cone-release')
          ?.shadowRoot.querySelector(`.lick[data-id="${lick}"]`)
      ),
    id
  );
}

const lickInfo = (id) => {
  const lick = window
    .$('slicc-app', 'slicc-dock')
    .content('chat:cone-release')
    .shadowRoot.querySelector(`.lick[data-id="${id}"]`);
  const turn = lick.closest('.lick-turn');
  const head = lick.querySelector('.lick-head');
  const cue = turn.querySelector('.meta .severity-icon');
  const style = getComputedStyle(lick);
  const hidden = head.querySelector('.sr');
  const sr = hidden ? getComputedStyle(hidden) : { display: 'none' };
  return {
    tag: lick.localName,
    severity: lick.dataset.severity,
    icon: cue?.firstElementChild?.localName,
    iconHidden: cue?.firstElementChild?.getAttribute('aria-hidden'),
    iconColored: cue ? getComputedStyle(cue).color === style.borderInlineStartColor : null,
    turn: turn.getAttribute('aria-label'),
    name: window.spoken(head),
    edge: style.borderInlineStartWidth,
    edgeColor: style.borderInlineStartColor !== style.borderTopColor,
    srVisible: sr.display !== 'none' && sr.visibility !== 'hidden',
  };
};

test('error and warning licks get a severity icon in the byline, an edge and a prefix', async (t) => {
  const page = await open(t);
  await chatLick(page, 'm-r3');
  const error = await page.evaluate(lickInfo, 'm-r3');
  assert.deepEqual(
    { ...error, name: error.name.slice(0, 32) },
    {
      tag: 'details',
      severity: 'error',
      icon: 'swc-icon-alert-diamond',
      iconHidden: 'true',
      iconColored: true,
      turn: 'Error: Schedule event',
      name: 'Error: Crontab line 3 is invalid',
      edge: '4px',
      edgeColor: true,
      srVisible: true,
    }
  );
  const warn = await page.evaluate(lickInfo, 'm-r4');
  assert.deepEqual(
    { ...warn, name: warn.name.slice(0, 54) },
    {
      tag: 'div',
      severity: 'warn',
      icon: 'swc-icon-alert-triangle',
      iconHidden: 'true',
      iconColored: true,
      turn: 'Warning: File watch event',
      name: 'Warning: File watch on /workspace/notes stopped; retry',
      edge: '4px',
      edgeColor: true,
      srVisible: true,
    }
  );
  const plain = await page.evaluate(lickInfo, 'm-r1');
  assert.deepEqual(
    [plain.severity, plain.icon, plain.turn],
    [undefined, undefined, 'Schedule event']
  );
  assert.deepEqual(page.errors, []);
});

test('Drop asks first; cancel keeps the scoop, confirm removes it, closes its chat and selects the cone', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-harbor')));
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  assert.deepEqual(
    await page.evaluate(() => [
      Boolean(window.dropButton('scoop-otter')),
      Boolean(window.dropButton('scoop-heron')),
      window.dropButton('cone-harbor'),
      window.dropButton('cone-sliccy'),
      window.dropButton('scoop-otter').getAttribute('accessible-label'),
      Math.round(window.dropButton('scoop-otter').getBoundingClientRect().height),
      getComputedStyle(window.dropButton('scoop-heron').parentElement).opacity ===
        (matchMedia('(hover: none), (pointer: coarse)').matches ? '1' : '0'),
    ]),
    [true, true, null, null, 'Drop scoop quiet-otter', 40, true]
  );
  await page.evaluate(() => {
    window.model.agent.select('scoop-otter');
    return true;
  });
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:scoop-otter'));
  await page.evaluate(() => {
    window.agents().focus();
    return true;
  });
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(window.dropButton('scoop-otter').parentElement).opacity
    ),
    '1'
  );

  await page.evaluate(() => window.dropButton('scoop-otter').click());
  await page.until(() => window.confirmShown());
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-confirm').shadowRoot;
      return [
        root.querySelector('h2').textContent,
        root.querySelector('p').textContent,
        root.querySelector('[data-action]').textContent.trim(),
        root.querySelector('[data-action]').getAttribute('variant'),
      ];
    }),
    [
      'Drop scoop quiet-otter?',
      'It stops, and its working folder is deleted. Its conversation and reports are kept. You can’t undo this.',
      'Drop',
      'negative',
    ]
  );
  await page.evaluate(() => window.answer(false));
  await page.until(() => !window.$('slicc-app', 'slicc-confirm'));
  assert.ok(await page.evaluate(() => Boolean(window.agentRow('scoop-otter'))));
  assert.equal(await page.evaluate(() => window.model.agent.active()), 'scoop-otter');

  await page.evaluate(() => window.dropButton('scoop-otter').click());
  await page.until(() => window.confirmShown());
  await page.evaluate(() => window.answer(true));
  await page.until(() => !window.agentRow('scoop-otter'));
  await page.until(() => !window.$('slicc-app', 'slicc-dock').has('chat:scoop-otter'));
  assert.equal(await page.evaluate(() => window.model.agent.active()), 'cone-harbor');
  await page.until(() => /slicc-agents > li#cone-harbor$/.test(window.focused()));
  assert.deepEqual(page.errors, []);
});

test('Delete on a focused scoop row drops it, and a rejected drop shows its error in place', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.drop = async () => {
      throw new Error('The scoop is busy');
    };
    window.model.agent.select('scoop-heron');
    return true;
  });
  await page.until(() => window.agentRow('scoop-heron')?.getAttribute('tabindex') === '0');
  await page.evaluate(() => {
    window.agents().focus();
    return true;
  });
  await page.press('Delete');
  await page.until(() => window.confirmShown());
  await page.evaluate(() => window.answer(true));
  await page.until(() => Boolean(window.agentRow('scoop-heron')?.querySelector('.error')));
  assert.deepEqual(
    await page.evaluate(() => {
      const error = window.agentRow('scoop-heron').querySelector('.error');
      return [
        error.textContent,
        getComputedStyle(error).color === getComputedStyle(window.agentRow('scoop-heron')).color,
        window.agents().shadowRoot.querySelector('[role=status]').textContent,
        window.model.agent.active(),
      ];
    }),
    [
      'Couldn’t drop amber-heron: The scoop is busy',
      false,
      'Couldn’t drop amber-heron: The scoop is busy',
      'scoop-heron',
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('A drop button clicked with the pointer hides again once the pointer leaves the row', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-harbor')));
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.dropButton('scoop-otter')));
  const point = await page.evaluate(() => {
    const box = window.dropButton('scoop-otter').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  const mouse = (type, extra = {}) =>
    page.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
      ...extra,
    });
  await mouse('mouseMoved');
  await page.until(
    () => getComputedStyle(window.dropButton('scoop-otter').parentElement).opacity === '1'
  );
  await mouse('mousePressed');
  await mouse('mouseReleased');
  await page.until(() => window.confirmShown());
  await page.evaluate(() => window.answer(false));
  await page.until(() => !window.$('slicc-app', 'slicc-confirm'));
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
  await page.until(
    () =>
      getComputedStyle(window.dropButton('scoop-otter').parentElement).opacity ===
      (matchMedia('(hover: none), (pointer: coarse)').matches ? '1' : '0')
  );
  assert.deepEqual(page.errors, []);
});

test('The drop strip covers the whole row height, and the context fill stays on top of it', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-release')));
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.agentRow('cone-release');
      const cell = row.querySelector('.drop-cell');
      cell.style.opacity = '1';
      const box = row.getBoundingClientRect();
      const strip = cell.getBoundingClientRect();
      const fill = row.querySelector('.fill').getBoundingClientRect();
      const root = window.agents().shadowRoot;
      const top = root.elementFromPoint(fill.left + fill.width / 2, fill.top + fill.height / 2);
      const bottom = root.elementFromPoint(strip.left + strip.width / 2, box.bottom - 2);
      cell.style.opacity = '';
      return [
        Math.round(strip.height) === Math.round(box.height),
        Math.round(strip.top) === Math.round(box.top),
        top?.classList.contains('fill'),
        bottom?.closest('li')?.dataset.id,
      ];
    }),
    [true, true, true, 'cone-release']
  );
  assert.deepEqual(page.errors, []);
});

test('An unread count takes the status circle, at the same size, and replaces the dot', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-release')));
  assert.deepEqual(
    await page.evaluate(() => {
      const unread = window.agentRow('cone-release').querySelector('.marker');
      const dot = window.agentRow('cone-sliccy').querySelector('.marker');
      const size = (node) => {
        const box = node.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
      };
      return [
        unread.classList.contains('unread'),
        unread.textContent.trim(),
        window.agentRow('cone-release').querySelector('.status'),
        dot.classList.contains('status'),
        size(unread),
        size(dot),
      ];
    }),
    [true, '1', null, true, [12, 12], [12, 12]]
  );
  assert.deepEqual(page.errors, []);
});

test('Drop is hidden when the port has no drop', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.select('scoop-otter');
    return true;
  });
  await page.until(() => Boolean(window.dropButton('scoop-otter')));
  await page.evaluate(() => {
    window.model.agent.drop = undefined;
    window.model.agent.select('cone-harbor');
    return true;
  });
  await page.until(() => !window.agents().shadowRoot.querySelector('[data-action=drop]'));
  assert.deepEqual(page.errors, []);
});

test('Cones start collapsed; a click expands only that cone, its scoops show a ribbon, rows share one height', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-harbor')));
  await page.evaluate(() => {
    window.ids = () =>
      [...window.agents().shadowRoot.querySelectorAll('li')].map((li) => li.dataset.id);
    return true;
  });
  assert.deepEqual(
    await page.evaluate(() => window.ids().filter((id) => id.startsWith('scoop-'))),
    []
  );
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  assert.deepEqual(
    await page.evaluate(() => {
      const ids = window.ids();
      const harbor = ids.indexOf('cone-harbor');
      return [
        ids[harbor + 1],
        ids[harbor + 2],
        window.agentRow('cone-harbor').querySelectorAll('.segment').length,
        window.agentRow('cone-sliccy').getAttribute('aria-expanded'),
        window.agentRow('cone-harbor').getAttribute('aria-expanded'),
        window.agentRow('cone-harbor').getAttribute('aria-selected'),
      ];
    }),
    ['scoop-otter', 'scoop-heron', 2, 'false', 'true', 'true']
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const heights = [...window.agents().shadowRoot.querySelectorAll('li')].map((li) =>
        Math.round(li.getBoundingClientRect().height)
      );
      return new Set(heights).size;
    }),
    1
  );
  await page.evaluate(() => window.agentRow('cone-sliccy').click());
  await page.until(() => !window.agentRow('scoop-otter'));
  assert.equal(await page.evaluate(() => window.model.agent.active()), 'cone-sliccy');
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => !window.agentRow('scoop-otter'));
  assert.deepEqual(
    await page.evaluate(() => {
      const actions = window.agents().shadowRoot.querySelector('[data-action=new-cone]');
      const last = window.agents().shadowRoot.querySelector('li:last-of-type');
      return actions.getBoundingClientRect().top >= last.getBoundingClientRect().bottom;
    }),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('Rows carry a colour dot, a description for every agent, the fill in the corner, and the drop overlays the text', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-release')));
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  assert.deepEqual(
    await page.evaluate(() => {
      const otter = window.agentRow('scoop-otter');
      const head = otter.querySelector('.head').textContent.trim();
      const dot = otter.querySelector('.status');
      return [
        /Working|Idle/.test(head),
        dot.getAttribute('data-status'),
        getComputedStyle(dot).backgroundColor ===
          getComputedStyle(
            window.agentRow('cone-harbor').querySelector('.segment[data-status=working]')
          ).backgroundColor,
        otter.querySelector('.title').textContent.trim().length > 0,
      ];
    }),
    [false, 'working', true, true]
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.agentRow('cone-release');
      const fill = row.querySelector('.fill').getBoundingClientRect();
      const box = row.getBoundingClientRect();
      const name = row.querySelector('.name').getBoundingClientRect();
      return [fill.top - box.top < 12, box.right - fill.right < 24, fill.left > name.right - 1];
    }),
    [true, true, true]
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.agentRow('scoop-otter');
      const title = row.querySelector('.title').getBoundingClientRect();
      const button = window.dropButton('scoop-otter').getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return [
        title.right > box.right - 24,
        button.right <= box.right,
        button.left < title.right && button.right > title.left,
      ];
    }),
    [true, true, true]
  );
  assert.deepEqual(page.errors, []);
});

test('New cone opens a name dialog: empty disables Create, Escape cancels, a rejection shows, success selects', async (t) => {
  const page = await open(t);
  const before = await page.evaluate(() => window.model.agent.list().length);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app', 'header sp-picker').children]
        .slice(-5)
        .map((item) => item.getAttribute('value') ?? item.localName)
    ),
    [
      'sp-menu-divider',
      'slicc:new-cone',
      'slicc:delete-cone',
      'sp-menu-divider',
      'slicc:all-agents',
    ]
  );

  await page.evaluate(() => window.pick('slicc:new-cone'));
  await page.until(() => window.promptRoot()?.querySelector('dialog')?.open);
  await page.until(() => /slicc-prompt > sp-textfield > input$/.test(window.focused()));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.promptRoot();
      return [
        root.querySelector('h2').textContent,
        root.querySelector('sp-field-label').textContent,
        root.querySelector('[data-action]').textContent.trim(),
        root.querySelector('[data-action]').disabled,
        root.querySelector('dialog').matches(':modal'),
        window.$('slicc-app', 'header sp-picker').value,
      ];
    }),
    ['New cone', 'Name', 'Create', true, true, 'cone-sliccy']
  );
  await page.press('Enter');
  await page.type('   ');
  assert.equal(
    await page.evaluate(() => window.promptRoot().querySelector('[data-action]').disabled),
    true
  );
  await page.press('Escape');
  await page.until(() => !window.$('slicc-app', 'slicc-prompt'));
  assert.equal(await page.evaluate(() => window.model.agent.list().length), before);

  await page.evaluate(() => window.pick('slicc:new-cone'));
  await page.until(() => /slicc-prompt > sp-textfield > input$/.test(window.focused()));
  await page.type('harbor');
  assert.equal(
    await page.evaluate(() => window.promptRoot().querySelector('[data-action]').disabled),
    false
  );
  await page.press('Enter');
  await page.until(() => Boolean(window.promptRoot()?.querySelector('sp-help-text')));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.promptRoot();
      return [
        root.querySelector('sp-help-text').textContent.trim(),
        root.querySelector('sp-textfield').invalid,
        root.querySelector('dialog').open,
      ];
    }),
    ['A cone named harbor already exists', true, true]
  );
  for (let i = 0; i < 6; i++) await page.press('Backspace');
  await page.type('scratchpad');
  await page.evaluate(() => window.promptRoot().querySelector('[data-action]').click());
  await page.until(() => !window.$('slicc-app', 'slicc-prompt'));
  await page.until(() => window.model.agent.active() === 'cone-1');
  assert.equal(
    await page.evaluate(
      () => window.model.agent.list().find((agent) => agent.id === 'cone-1').name
    ),
    'scratchpad'
  );
  await page.until(() => window.$('slicc-app', 'header sp-picker').value === 'cone-1');
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('chat:cone-1'));
  await page.until(() => window.$('slicc-app', 'header sp-picker').matches(':focus-within'));
  assert.deepEqual(page.errors, []);
});

test('New cone in the Agents panel creates a cone and selects it', async (t) => {
  const page = await open(t);
  await page.until(() =>
    Boolean(window.agents()?.shadowRoot.querySelector('[data-action=new-cone]'))
  );
  await page.evaluate(() =>
    window.agents().shadowRoot.querySelector('[data-action=new-cone]').click()
  );
  await page.until(() => /slicc-prompt > sp-textfield > input$/.test(window.focused()));
  await page.type('scratchpad');
  await page.press('Enter');
  await page.until(() => !window.$('slicc-app', 'slicc-prompt'));
  await page.until(() => window.model.agent.active() === 'cone-1');
  await page.until(() => window.agentRow('cone-1')?.getAttribute('aria-selected') === 'true');
  await page.until(() => /slicc-agents > li#cone-1$/.test(window.focused()));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.match(await page.evaluate(() => window.focused()), /slicc-agents > li#cone-1$/);
  assert.equal(
    await page.evaluate(() => window.agentRow('cone-1').querySelector('.name').textContent),
    'scratchpad'
  );
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'header sp-picker').value),
    'cone-1'
  );
  assert.deepEqual(page.errors, []);
});

test('New cone is hidden when the port has no createCone', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.createCone = undefined;
    window.model.agent.select('cone-harbor');
    return true;
  });
  await page.until(() => !window.$('slicc-app', 'header [data-action=new-cone]'));
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'header sp-picker').querySelectorAll('sp-menu-divider').length
    ),
    2
  );
  assert.equal(
    await page.evaluate(() => !!window.$('slicc-app', 'header [data-action=delete-cone]')),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('A cone is a disclosure in a tree: keys expand and collapse it, one cone at a time, and its ribbon matches its scoops', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('cone-sliccy')));
  await page.evaluate(() => {
    window.state = () => {
      const root = window.agents().shadowRoot;
      return {
        tree: root.querySelector('ul').getAttribute('role'),
        rows: [...root.querySelectorAll('li')].map((li) => [
          li.dataset.id,
          li.getAttribute('role'),
          li.getAttribute('aria-level'),
          li.getAttribute('aria-expanded'),
        ]),
        controls: [...root.querySelectorAll('li[aria-controls]')].map((li) => [
          li.dataset.id,
          li
            .getAttribute('aria-controls')
            .split(' ')
            .map((id) => root.getElementById(id)?.dataset.id),
        ]),
      };
    };
    return true;
  });
  const start = await page.evaluate(() => window.state());
  assert.equal(start.tree, 'tree');
  assert.deepEqual(start.controls, []);
  assert.deepEqual(
    start.rows.map(([id, role, level, expanded]) => [id, role, level, expanded]),
    [
      ['cone-sliccy', 'treeitem', '1', 'false'],
      ['cone-kitchen', 'treeitem', '1', null],
      ['cone-harbor', 'treeitem', '1', 'false'],
      ['cone-release', 'treeitem', '1', null],
      ['cone-triage', 'treeitem', '1', null],
      ['cone-tides', 'treeitem', '1', null],
    ]
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.model.agent
        .list()
        .filter((agent) => agent.kind === 'cone')
        .map((cone) => [
          window.agentRow(cone.id).querySelectorAll('.segment').length,
          window.model.agent.list().filter((agent) => agent.parentId === cone.id).length,
          window.agentRow(cone.id).querySelector('.ribbon')?.getAttribute('aria-hidden') ?? null,
          window.agentRow(cone.id).getAttribute('aria-description'),
        ])
    ),
    [
      [1, 1, 'true', '1 scoop: 1 idle'],
      [0, 0, null, null],
      [2, 2, 'true', '2 scoops: 1 working, 1 idle'],
      [0, 0, null, null],
      [0, 0, null, null],
      [0, 0, null, null],
    ]
  );

  await page.press('1', 'alt');
  await page.until(() => /slicc-agents > li#cone-sliccy$/.test(window.focused()));
  await page.press('Enter');
  await page.until(() => Boolean(window.agentRow('scoop-wren')));
  assert.deepEqual((await page.evaluate(() => window.state())).controls, [
    ['cone-sliccy', ['scoop-wren']],
  ]);
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  await page.until(() => /li#cone-harbor$/.test(window.focused()));
  await page.press(' ');
  await page.until(() => Boolean(window.agentRow('scoop-otter')) && !window.agentRow('scoop-wren'));
  assert.deepEqual(await page.evaluate(() => window.state()), {
    tree: 'tree',
    rows: [
      ['cone-sliccy', 'treeitem', '1', 'false'],
      ['cone-kitchen', 'treeitem', '1', null],
      ['cone-harbor', 'treeitem', '1', 'true'],
      ['scoop-otter', 'treeitem', '2', null],
      ['scoop-heron', 'treeitem', '2', null],
      ['cone-release', 'treeitem', '1', null],
      ['cone-triage', 'treeitem', '1', null],
      ['cone-tides', 'treeitem', '1', null],
    ],
    controls: [['cone-harbor', ['scoop-otter', 'scoop-heron']]],
  });
  await page.press('ArrowRight');
  await page.until(() => /li#scoop-otter$/.test(window.focused()));
  await page.press('ArrowLeft');
  await page.until(() => /li#cone-harbor$/.test(window.focused()));
  await page.press('ArrowLeft');
  await page.until(() => !window.agentRow('scoop-otter'));
  assert.equal(
    await page.evaluate(() => window.agentRow('cone-harbor').getAttribute('aria-expanded')),
    'false'
  );
  await page.press('ArrowRight');
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  await page.press('Enter');
  await page.until(() => !window.agentRow('scoop-otter'));
  assert.equal(await page.evaluate(() => window.model.agent.active()), 'cone-harbor');

  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.evaluate(() => window.agentRow('cone-harbor').click());
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  assert.deepEqual(
    await page.evaluate(
      () =>
        [...window.agents().shadowRoot.querySelectorAll('li, li *')]
          .map((node) => getComputedStyle(node))
          .filter((style) => style.animationName !== 'none' || style.transitionDuration !== '0s')
          .length
    ),
    0
  );
  assert.deepEqual(page.errors, []);
});

for (const color of ['light', 'dark']) {
  test(`An unread count never hides the status: the word stays on the row and in its name, ${color}`, async (t) => {
    const page = await open(t, color);
    await page.until(() => Boolean(window.agentRow('cone-release')?.querySelector('.unread')));
    const result = await page.evaluate(() => {
      const row = window.agentRow('cone-release');
      const marker = row.querySelector('.marker');
      const state = row.querySelector('.state');
      const box = state.getBoundingClientRect();
      const rgb = (value) =>
        value
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const lum = (value) => {
        const [r, g, b] = rgb(value).map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const style = getComputedStyle(marker);
      const [a, b] = [lum(style.color), lum(style.backgroundColor)].sort((x, y) => y - x);
      return {
        count: marker.textContent.trim(),
        dot: row.querySelector('.status'),
        word: state.textContent,
        shown: box.width > 0 && box.height > 0 && getComputedStyle(state).visibility === 'visible',
        label: row.getAttribute('aria-label'),
        contrast: (a + 0.05) / (b + 0.05) >= 4.5,
      };
    });
    assert.deepEqual(result, {
      count: '1',
      dot: null,
      word: 'Idle',
      shown: true,
      label: 'release-notes: Idle, 70% context, 1 unread',
      contrast: true,
    });
    assert.deepEqual(page.errors, []);
  });
}

test('The drop strip is reachable by keyboard: Tab from the selected row shows it, and Shift+Tab goes back', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.agent.select('scoop-otter');
    return true;
  });
  await page.until(() => window.agentRow('scoop-otter')?.getAttribute('tabindex') === '0');
  const strip = () => getComputedStyle(window.dropButton('scoop-otter').parentElement).opacity;
  await page.press('1', 'alt');
  await page.until(() => /slicc-agents > li#scoop-otter$/.test(window.focused()));
  assert.equal(await page.evaluate(strip), '1');
  await page.press('Tab');
  await page.until(() => /slicc-agents > swc-action-button > button$/.test(window.focused()));
  assert.deepEqual(
    await page.evaluate(() => [
      getComputedStyle(window.dropButton('scoop-otter').parentElement).opacity,
      window.agents().shadowRoot.activeElement.dataset.action,
      window.agents().shadowRoot.activeElement.closest('li').dataset.id,
    ]),
    ['1', 'drop', 'scoop-otter']
  );
  await page.press('Enter');
  await page.until(() => window.confirmShown());
  await page.press('Escape');
  await page.until(() => !window.$('slicc-app', 'slicc-confirm'));
  await page.until(() => /slicc-agents > swc-action-button > button$/.test(window.focused()));
  assert.equal(await page.evaluate(strip), '1');
  await page.press('Tab', 'shift');
  await page.until(() => /slicc-agents > li#scoop-otter$/.test(window.focused()));
  await page.press('ArrowDown');
  await page.until(() => /li#scoop-heron$/.test(window.focused()));
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(window.dropButton('scoop-heron').parentElement).opacity
    ),
    '1'
  );
  assert.ok(
    await page.evaluate(() => window.model.agent.list().some((a) => a.id === 'scoop-otter'))
  );
  assert.deepEqual(page.errors, []);
});
