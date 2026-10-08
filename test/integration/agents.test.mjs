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
  const head = lick.querySelector('.lick-head');
  const badge = head.querySelector('swc-badge.severity');
  const style = getComputedStyle(lick);
  const hidden = head.querySelector('.sr');
  const sr = hidden ? getComputedStyle(hidden) : { display: 'none' };
  return {
    tag: lick.localName,
    severity: lick.dataset.severity,
    variant: badge?.getAttribute('variant'),
    icon: badge?.querySelector('[slot=icon]')?.localName,
    name: window.spoken(head),
    edge: style.borderInlineStartWidth,
    edgeColor: style.borderInlineStartColor !== style.borderTopColor,
    srVisible: sr.display !== 'none' && sr.visibility !== 'hidden',
  };
};

test('error and warning licks get a severity badge, an icon, an edge and a prefix', async (t) => {
  const page = await open(t);
  await chatLick(page, 'm-r3');
  const error = await page.evaluate(lickInfo, 'm-r3');
  assert.deepEqual(
    { ...error, name: error.name.slice(0, 49) },
    {
      tag: 'details',
      severity: 'error',
      variant: 'negative',
      icon: 'swc-icon-alert-diamond',
      name: 'Error: Schedule Crontab Crontab line 3 is invalid',
      edge: '4px',
      edgeColor: true,
      srVisible: true,
    }
  );
  const warn = await page.evaluate(lickInfo, 'm-r4');
  assert.deepEqual(
    { ...warn, name: warn.name.slice(0, 85) },
    {
      tag: 'div',
      severity: 'warn',
      variant: 'notice',
      icon: 'swc-icon-alert-triangle',
      name: 'Warning: File watch /workspace/notes File watch on /workspace/notes stopped; retrying',
      edge: '4px',
      edgeColor: true,
      srVisible: true,
    }
  );
  assert.equal(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-dock').content('chat:cone-release').shadowRoot;
      const pending = document.createElement('div');
      pending.className = 'pending';
      pending.append(root.querySelector('.lick[data-id="m-r3"]').cloneNode(true));
      root.append(pending);
      const width = getComputedStyle(pending.firstChild).borderInlineStartWidth;
      pending.remove();
      return width;
    }),
    '4px'
  );
  const plain = await page.evaluate(lickInfo, 'm-r1');
  assert.deepEqual(
    [plain.severity, plain.variant, plain.name.slice(0, 18)],
    [undefined, undefined, 'Schedule Every Fri']
  );
  assert.deepEqual(page.errors, []);
});

test('Drop asks first; cancel keeps the scoop, confirm removes it, closes its chat and selects the cone', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.agentRow('scoop-otter')));
  assert.deepEqual(
    await page.evaluate(() => [
      Boolean(window.dropButton('scoop-otter')),
      Boolean(window.dropButton('scoop-heron')),
      window.dropButton('cone-harbor'),
      window.dropButton('cone-sliccy'),
      window.dropButton('scoop-otter').getAttribute('accessible-label'),
      Math.round(window.dropButton('scoop-otter').getBoundingClientRect().height),
      getComputedStyle(window.dropButton('scoop-heron')).visibility ===
        (matchMedia('(hover: none), (pointer: coarse)').matches ? 'visible' : 'hidden'),
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
    await page.evaluate(() => getComputedStyle(window.dropButton('scoop-otter')).visibility),
    'visible'
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
    ['Drop scoop quiet-otter?', 'It stops working. Its files stay.', 'Drop', 'negative']
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
  await page.until(() => Boolean(window.agentRow('scoop-heron')));
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

test('Drop is hidden when the port has no drop', async (t) => {
  const page = await open(t);
  await page.until(() => Boolean(window.dropButton('scoop-otter')));
  await page.evaluate(() => {
    window.model.agent.drop = undefined;
    window.model.agent.select('cone-harbor');
    return true;
  });
  await page.until(() => !window.agents().shadowRoot.querySelector('[data-action=drop]'));
  assert.deepEqual(page.errors, []);
});

test('New cone opens a name dialog: empty disables Create, Escape cancels, a rejection shows, success selects', async (t) => {
  const page = await open(t);
  const before = await page.evaluate(() => window.model.agent.list().length);
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.$('slicc-app', 'header sp-picker').children]
        .slice(-4)
        .map((item) => item.getAttribute('value') ?? item.localName)
    ),
    ['sp-menu-divider', 'slicc:new-cone', 'sp-menu-divider', 'slicc:all-agents']
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
    1
  );
  assert.deepEqual(page.errors, []);
});
