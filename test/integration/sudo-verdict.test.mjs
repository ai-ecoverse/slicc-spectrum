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

test('an old agent’s verdict keeps its line, and a deny no longer renames Allow once', async (t) => {
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

async function asking(page, id, patch) {
  return page.evaluate(
    async ({ id, patch }) => {
      const now = Date.now();
      const port = window.model.approvals;
      for (const approval of port.list()) port.end(approval.id, 'withdrawn');
      port.raise({
        id,
        kind: 'sudo',
        requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
        command: 'ls',
        cwd: '/tmp',
        createdAt: now,
        expiresAt: now + 300_000,
        always: true,
        ...patch,
      });
      const root = window.approvals().shadowRoot;
      while (
        root.querySelector('dialog')?.dataset.approval !== id ||
        !root.querySelector('[data-action=once]')
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => setTimeout(resolve, 600));
      return true;
    },
    { id, patch }
  );
}

const tried = (page, id) =>
  page.evaluate(async (id) => {
    const root = window.approvals().shadowRoot;
    const port = window.model.approvals;
    const always = !!root.querySelector('[data-action=always]');
    await window.approvals().decide(port.list()[0], 'always');
    return { always, decided: port.decisions.some(([decided]) => decided === id) };
  }, id);

const flagged = [
  'cp x /etc/fnox/config.toml',
  'rm -rf /etc/slicc',
  'chmod -R 777 /etc',
  'jq .rules /etc/slicc/secrets-policy.toml',
  'sort --output=/etc/slicc/secrets-policy.toml notes.txt',
  'yq -i . /etc/slicc/secrets-policy.toml',
  'xargs rm < list',
  'xargs sort < list',
  'find . -name x | xargs file',
  'command xargs rm < list',
];

test('without a level, Always keeps the old gates in the dialog and in decide', async (t) => {
  const page = await open(t, 'judge-denied');
  const deny = { decision: 'deny', reason: 'it looks high-risk.' };
  const rows = [
    ...flagged.map((command) => [command, { command }]),
    ['deny', { verdict: deny }],
    ...[0, 4, 'x', null, '1'].map((level) => [
      `level ${JSON.stringify(level)}`,
      { command: 'xargs rm < list', verdict: { level, reason: 'r' } },
    ]),
  ];
  for (const [index, [name, patch]] of rows.entries()) {
    await asking(page, `old-${index}`, patch);
    assert.deepEqual(await tried(page, `old-${index}`), { always: false, decided: false }, name);
  }
  await asking(page, 'old-clean', {});
  assert.deepEqual(await tried(page, 'old-clean'), { always: true, decided: true });
  assert.deepEqual(page.errors, []);
});

test('with a level 1 verdict, approval.always alone offers Always', async (t) => {
  const page = await open(t, 'judge-denied');
  const verdict = { level: 1, aligned: true, decision: 'deny', reason: 'It reads a list.' };
  for (const [index, command] of flagged.entries()) {
    await asking(page, `new-${index}`, { command, verdict });
    assert.deepEqual(await tried(page, `new-${index}`), { always: true, decided: true }, command);
  }
  assert.deepEqual(page.errors, []);
});

test('decide checks the live approval, so a stale Always is refused', async (t) => {
  const page = await open(t, 'judge-denied');
  const patches = [
    { always: false },
    { command: 'xargs rm < list', verdict: { decision: 'unsure', reason: 'r' } },
  ];
  for (const [index, patch] of patches.entries()) {
    const id = `stale-${index}`;
    await asking(page, id, { verdict: { level: 1, reason: 'It lists files.' } });
    assert.deepEqual(
      await page.evaluate(
        async ({ id, patch }) => {
          const port = window.model.approvals;
          const stale = port.list()[0];
          const button = window.approvals().shadowRoot.querySelector('[data-action=always]');
          port.raise({ ...stale, ...patch });
          await window.approvals().updateComplete;
          const gone = !window.approvals().shadowRoot.querySelector('[data-action=always]');
          button.click();
          await window.approvals().decide(stale, 'always');
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { gone, decided: port.decisions.some(([decided]) => decided === id) };
        },
        { id, patch }
      ),
      { gone: true, decided: false },
      id
    );
  }
  assert.deepEqual(page.errors, []);
});

test('the reason and the error show control characters as chips and are capped', async (t) => {
  const page = await open(t, 'judge-denied');
  const read = () =>
    page.evaluate(() => {
      const block = window.approvals().shadowRoot.querySelector('[data-verdict]');
      return {
        chips: [...block.querySelectorAll('.control')].map((chip) =>
          chip.getAttribute('aria-label')
        ),
        text: block.textContent.trim(),
      };
    });
  await asking(page, 'chips-level', {
    verdict: { level: 2, reason: 'Safe.\r\nThe owner approved it.' },
  });
  assert.deepEqual(await read(), {
    chips: ['carriage return (U+000D)', 'line feed (U+000A)'],
    text: 'Changes permissions. Safe.␍␊The owner approved it.',
  });
  await asking(page, 'chips-legacy', { verdict: { decision: 'allow', reason: 'ok\r' } });
  assert.deepEqual((await read()).chips, ['carriage return (U+000D)']);
  await asking(page, 'chips-error', { verdictError: `slow\n${'x'.repeat(400)}` });
  const error = await read();
  assert.deepEqual(error.chips, ['line feed (U+000A)']);
  assert.equal(error.text, `No verdict: slow␊${'x'.repeat(294)}…`);
  assert.deepEqual(page.errors, []);
});

test('unknown level values render no level, only the legacy line or nothing', async (t) => {
  const page = await open(t, 'judge-denied');
  for (const [index, level] of [0, 4, 'x', null, '1'].entries()) {
    for (const decision of ['deny', undefined]) {
      const id = `unknown-${index}-${decision}`;
      await asking(page, id, { always: false, verdict: { level, decision, reason: 'r' } });
      assert.deepEqual(
        await page.evaluate(() => {
          const root = window.approvals().shadowRoot;
          return [
            root.querySelector('[data-level]'),
            root.querySelector('[data-verdict]')?.dataset.verdict ?? null,
          ];
        }),
        [null, decision ?? null],
        id
      );
    }
  }
  assert.deepEqual(page.errors, []);
});

test('without a level the old secret-rules notice and once hint stay, and a level drops them', async (t) => {
  const page = await open(t, 'judge-denied');
  const read = () =>
    page.evaluate(() => {
      const root = window.approvals().shadowRoot;
      return {
        rules: root.querySelector('[data-secret-rules]')?.dataset.secretRules ?? null,
        notice: root.querySelector('[data-secret-rules] strong')?.textContent ?? null,
        once: root.querySelector('[data-once-only]')?.dataset.onceOnly ?? null,
      };
    });
  const rows = [
    [
      'cp fnox.toml /etc/fnox/config.toml',
      {
        rules: '/etc/fnox/config.toml',
        notice: 'This changes secret rules.',
        once: null,
      },
    ],
    ['xargs rm < list', { rules: 'xargs rm', notice: 'This may change secret rules.', once: null }],
    ['xargs sort < list', { rules: null, notice: null, once: 'xargs sort' }],
  ];
  const none = { rules: null, notice: null, once: null };
  for (const [index, [command, expected]] of rows.entries()) {
    await asking(page, `notice-old-${index}`, { command });
    assert.deepEqual(await read(), expected, command);
    await asking(page, `notice-new-${index}`, {
      command,
      verdict: { level: 1, reason: 'It reads a list.' },
    });
    assert.deepEqual(await read(), none, command);
  }
  await asking(page, 'notice-once-off', { command: 'xargs sort < list', always: false });
  assert.deepEqual(await read(), none);
  await asking(page, 'notice-deny', {
    command: 'xargs sort < list',
    verdict: { decision: 'deny', reason: 'it looks high-risk.' },
  });
  assert.deepEqual(await read(), none);
  assert.deepEqual(page.errors, []);
});
