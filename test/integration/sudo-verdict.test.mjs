import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, scenario) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?delay=0&color=light&approvals=${scenario}`);
  await page.until(() => window.ready === true);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals');
    window.tone = (token, selector = 'sp-alert-dialog') => {
      const root = window.approvals().shadowRoot;
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      root.querySelector(selector).append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    window.card = () => {
      const root = window.approvals().shadowRoot;
      const block = root.querySelector('[data-verdict]');
      return {
        verdict: block?.dataset.verdict ?? null,
        level: block?.dataset.level ?? null,
        text: block?.textContent.trim() ?? null,
        icon: !!block?.querySelector('swc-icon-alert-triangle'),
        note: root.querySelector('[data-verdict-note]')?.textContent ?? null,
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => [
          button.dataset.action,
          button.textContent.trim(),
        ]),
        rules: !!root.querySelector('[data-secret-rules], [data-once-only]'),
      };
    };
    window.colors = () => {
      const block = window.approvals().shadowRoot.querySelector('[data-verdict]');
      const style = getComputedStyle(block);
      return { background: style.backgroundColor, color: style.color };
    };
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-action=once]'));
  await page.until(() => window.approvals().shadowRoot.activeElement?.dataset.action === 'deny');
  await new Promise((resolve) => setTimeout(resolve, 600));
  return page;
}

const once = ['once', 'Allow once'];
const deny = ['deny', 'Deny'];
const always = ['always', 'Always allow'];

const levels = {
  'level-1': {
    verdict: 'routine',
    level: '1',
    text: 'Routine. It reads a file and changes nothing. It fits what you asked for.',
    icon: false,
    note: null,
    actions: [deny, always, once],
    rules: false,
  },
  'level-2': {
    verdict: 'permissions',
    level: '2',
    text: 'Changes permissions. It changes which secrets programs may use and where they may be sent. It fits what you asked for.',
    icon: false,
    note: 'Always allow isn’t offered for permission changes.',
    actions: [deny, once],
    rules: false,
  },
  'level-3': {
    verdict: 'harm',
    level: '3',
    text: 'Could harm the system. It deletes system files, and that is hard to undo. It isn’t clear it serves what you asked for.',
    icon: true,
    note: null,
    actions: [deny, once],
    rules: false,
  },
};

const tones = {
  'level-1': [
    '--swc-positive-subtle-background-color-default',
    '--swc-neutral-content-color-default',
  ],
  'level-2': [
    '--swc-notice-subtle-background-color-default',
    '--swc-neutral-content-color-default',
  ],
  'level-3': [
    '--swc-negative-subtle-background-color-default',
    '--swc-neutral-content-color-default',
  ],
};

for (const [scenario, card] of Object.entries(levels)) {
  test(`the ${scenario} verdict shows its label, reason and tone`, async (t) => {
    const page = await open(t, scenario);
    assert.deepEqual(await page.evaluate(() => window.card()), card);
    const [background, color] = tones[scenario];
    assert.deepEqual(await page.evaluate(() => window.colors()), {
      background: await page.evaluate((token) => window.tone(token), background),
      color: await page.evaluate((token) => window.tone(token), color),
    });
    assert.deepEqual(page.errors, []);
  });
}

test('a level 3 verdict warns in red and offers only Deny and Allow once', async (t) => {
  const page = await open(t, 'level-3');
  assert.equal(
    await page.evaluate(() => window.tone('--swc-icon-color', '[data-level="3"]')),
    await page.evaluate(() => window.tone('--swc-negative-visual-color'))
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.approvals().shadowRoot.querySelectorAll('.command, .cwd, .judge, .hint')].map(
        (node) => node.className
      )
    ),
    ['command', 'cwd', 'judge']
  );
  await page.evaluate(() =>
    window
      .approvals()
      .decide(window.model.approvals.list()[0], 'always')
      .then(() => true)
  );
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await page.evaluate(() => {
    window.approvals().shadowRoot.querySelector('[data-action=once]').click();
    return true;
  });
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-level-3', 'once'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('Checking shows until the verdict lands, then Always appears with it', async (t) => {
  const page = await open(t, 'checking');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'checking',
    level: null,
    text: 'Checking…',
    icon: false,
    note: null,
    actions: [deny, once],
    rules: false,
  });
  await page.evaluate(() => {
    const port = window.model.approvals;
    const approval = port.list()[0];
    port.raise({
      ...approval,
      judging: false,
      always: true,
      verdict: { level: 1, reason: 'It hands the owner their own files.' },
    });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-action=always]'));
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'routine',
    level: '1',
    text: 'Routine. It hands the owner their own files.',
    icon: false,
    note: null,
    actions: [deny, always, once],
    rules: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.evaluate(() => {
    window.approvals().shadowRoot.querySelector('[data-action=always]').click();
    return true;
  });
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-checking', 'always'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('no verdict shows why, with Deny and Allow once', async (t) => {
  const page = await open(t, 'no-verdict');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'none',
    level: null,
    text: 'No verdict: The check didn’t answer in time.',
    icon: false,
    note: 'Always allow appears only with a level 1 verdict.',
    actions: [deny, once],
    rules: false,
  });
  assert.deepEqual(page.errors, []);
});

test('Always allow shows exactly when the approval offers it', async (t) => {
  const page = await open(t, 'level-1');
  const swap = (patch, drop = []) =>
    page.evaluate(
      ({ patch, drop }) => {
        const port = window.model.approvals;
        const approval = { ...port.list()[0], ...patch };
        for (const key of drop) delete approval[key];
        port.raise(approval);
        return true;
      },
      { patch, drop }
    );
  const actions = () =>
    page.evaluate(() =>
      [...window.approvals().shadowRoot.querySelectorAll('[slot=button]')].map(
        (button) => button.dataset.action
      )
    );
  await swap({ always: false });
  await page.until(() => !window.approvals().shadowRoot.querySelector('[data-action=always]'));
  assert.deepEqual(await actions(), ['deny', 'once']);
  await page.evaluate(() =>
    window
      .approvals()
      .decide(window.model.approvals.list()[0], 'always')
      .then(() => true)
  );
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await swap({ always: true, verdict: { level: 3, decision: 'deny', reason: 'It wipes /.' } });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-action=always]'));
  assert.deepEqual(await actions(), ['deny', 'always', 'once']);
  await swap({ always: false }, ['verdict']);
  await page.until(() => !window.approvals().shadowRoot.querySelector('[data-action=always]'));
  assert.deepEqual(await page.evaluate(() => window.card().verdict), null);
  assert.deepEqual(await actions(), ['deny', 'once']);
  assert.deepEqual(page.errors, []);
});

test('reading the secret rules shows no secret-rules notice', async (t) => {
  const page = await open(t, 'level-1');
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.approvals().shadowRoot;
      return [
        root.querySelector('[data-command]').textContent,
        root.querySelector('.rules, [data-secret-rules], [data-once-only]'),
        root.querySelector('.hint').textContent,
      ];
    }),
    [
      'sudo jq .rules /etc/slicc/secrets-policy.toml',
      null,
      'Always allow lets docs-pass run exactly this command with sudo without asking again.',
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('an old agent’s verdict keeps its line, and a deny no longer hides Always or renames Allow once', async (t) => {
  const page = await open(t, 'judge-denied');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'deny',
    level: null,
    text: 'The automatic check would deny this: it looks high-risk.',
    icon: false,
    note: null,
    actions: [deny, once],
    rules: false,
  });
  await page.evaluate(() => {
    const port = window.model.approvals;
    port.raise({ ...port.list()[0], always: true });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-action=always]'));
  assert.deepEqual((await page.evaluate(() => window.card())).actions, [deny, always, once]);
  await page.goto('/ui/?delay=0&color=light&approvals=guest');
  await page.until(() => window.ready === true);
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', '[data-verdict=allow]'));
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-approvals', '[data-verdict]').textContent
    ),
    'The automatic check would allow this: it asks for an edit inside the shared folder.'
  );
  assert.deepEqual(page.errors, []);
});

test('guest approvals show the same verdict block', async (t) => {
  const page = await open(t, 'guest-always');
  await page.evaluate(() => {
    const port = window.model.approvals;
    port.raise({
      ...port.list()[0],
      verdict: { level: 2, aligned: false, reason: 'It changes who may read the folder.' },
    });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-level="2"]'));
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'permissions',
    level: '2',
    text: 'Changes permissions. It changes who may read the folder. It isn’t clear it serves what you asked for.',
    icon: false,
    note: null,
    actions: [deny, always, once],
    rules: false,
  });
  await page.evaluate(() => {
    const port = window.model.approvals;
    port.raise({ ...port.list()[0], always: false, verdict: undefined, judging: true });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-verdict=checking]'));
  await page.evaluate(() => {
    const port = window.model.approvals;
    port.raise({ ...port.list()[0], judging: false, verdictError: 'No judge model is set.' });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-verdict=none]'));
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: 'none',
    level: null,
    text: 'No verdict: No judge model is set.',
    icon: false,
    note: null,
    actions: [deny, once],
    rules: false,
  });
  assert.deepEqual(page.errors, []);
});
