import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { clickApproval, waitApprovalArmed } from './approval-click.mjs';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(t, approvals, width = 1440) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?delay=0&color=light&approvals=${approvals}`);
  await page.until(() => window.ready === true);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
      )
  );
  await page.evaluate(() => {
    window.element = () => window.$('slicc-app', 'slicc-approvals');
    window.approvals = () => window.element().shadowRoot;
    window.actions = () =>
      [...window.approvals().querySelectorAll('[slot=button][data-action]')].map((button) => [
        button.dataset.action,
        button.textContent.trim(),
        button.hasAttribute('disabled'),
      ]);
    window.where = () =>
      Object.fromEntries(
        [...window.approvals().querySelectorAll('[slot=button][data-action]')].map((button) => {
          const box = button.getBoundingClientRect();
          return [button.dataset.action, [Math.round(box.left), Math.round(box.top)]];
        })
      );
    window.frame = () => {
      const box = window.approvals().querySelector('dialog').getBoundingClientRect();
      return [Math.round(box.top), Math.round(box.height)];
    };
    window.ask = (id, patch = {}) => {
      const now = Date.now();
      window.created = { ...window.created, [id]: window.created?.[id] ?? now };
      window.model.approvals.raise({
        id,
        kind: 'sudo',
        requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
        command: `du -sh /var/lib/slicc/${id}/*`,
        cwd: '/var/lib/slicc',
        createdAt: window.created[id],
        expiresAt: now + 5 * 60_000,
        always: true,
        ...patch,
      });
      return true;
    };
    window.seen = [];
    const look = () => {
      const dialog = window.approvals()?.querySelector('dialog');
      const shown = dialog ? `${dialog.dataset.approval}:${dialog.dataset.gone ?? ''}` : '';
      if (window.seen.at(-1) !== shown) window.seen.push(shown);
    };
    new MutationObserver(look).observe(window.approvals(), {
      subtree: true,
      childList: true,
      attributes: true,
    });
    look();
    return true;
  });
  return page;
}

const shown = (page, id) =>
  page.until(
    (id) =>
      window.approvals().querySelector('dialog')?.dataset.approval === id &&
      window.approvals().activeElement?.dataset.action === 'deny',
    id
  );

test('Deny and stop denies the request and the agent’s other requests close without a word', async (t) => {
  const page = await open(t, 'stop');
  await shown(page, 'sudo-jq');
  assert.deepEqual(await page.evaluate(() => window.actions()), [
    ['deny', 'Deny', false],
    ['stop', 'Deny and stop', false],
    ['always', 'Always allow', false],
    ['once', 'Allow once', false],
  ]);
  assert.deepEqual(
    await page.evaluate(() => {
      const stop = window.approvals().querySelector('[data-action=stop]');
      return [stop.getAttribute('variant'), stop.getAttribute('fill-style')];
    }),
    ['secondary', 'outline']
  );
  await clickApproval(page, 'stop');
  await shown(page, 'sudo-chown');
  await settle(300);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-jq', 'stop'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.seen), ['sudo-jq:', 'sudo-chown:']);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.list().map(({ id }) => id)), [
    'sudo-chown',
    'sudo-cache',
  ]);
  assert.deepEqual(await page.evaluate(() => window.actions().map(([action]) => action)), [
    'deny',
    'always',
    'once',
  ]);
  await page.press('Escape');
  await shown(page, 'sudo-cache');
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-jq', 'stop'],
    ['sudo-chown', 'deny'],
  ]);
  assert.deepEqual(await page.evaluate(() => window.actions().map(([action]) => action)), [
    'deny',
    'stop',
    'once',
  ]);
  await page.press('Escape');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions.at(-1)), [
    'sudo-cache',
    'deny',
  ]);
  assert.deepEqual(page.errors, []);
});

test('a stop answered in another tab says so once, and the withdrawn requests never show', async (t) => {
  const page = await open(t, 'stop');
  await shown(page, 'sudo-jq');
  await page.evaluate(() => {
    window.model.approvals.end('sudo-jq', 'answered');
    window.model.approvals.end('sudo-docs-build', 'withdrawn');
    return true;
  });
  await page.until(() => window.approvals().querySelector('dialog')?.dataset.gone === 'elsewhere');
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('h2').textContent),
    'Answered in another tab'
  );
  await page.press('Escape');
  await shown(page, 'sudo-chown');
  assert.deepEqual(await page.evaluate(() => window.seen), [
    'sudo-jq:',
    'sudo-jq:elsewhere',
    'sudo-chown:',
  ]);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  assert.deepEqual(page.errors, []);
});

test('Deny and stop needs neither the arming delay nor the end of the command in view', async (t) => {
  const page = await open(t, 'none');
  const command = Array.from({ length: 60 }, (_, i) => `echo step-${i}`).join(' && \\\n');
  await page.evaluate((command) => {
    window.element().arming = 60_000;
    return window.ask('sudo-long', { command, stoppable: true });
  }, command);
  await shown(page, 'sudo-long');
  await settle(200);
  assert.deepEqual(await page.evaluate(() => window.actions()), [
    ['deny', 'Deny', false],
    ['stop', 'Deny and stop', false],
    ['once', 'Allow once', true],
  ]);
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('[data-allow-hint]')?.textContent),
    'Scroll to the end of the command to allow it.'
  );
  await page.evaluate(async () => {
    const element = window.element();
    const [item] = window.model.approvals.list();
    await element.decide(item, 'once');
    await element.decide(item, 'always');
    await element.decide(item, 'stop');
    return true;
  });
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-long', 'stop'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('Deny and stop waits while another answer is being sent', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() => {
    const port = window.model.approvals;
    const decide = port.decide;
    window.sent = [];
    port.decide = (id, decision) => {
      window.sent.push([id, decision]);
      return new Promise((resolve) => {
        window.release = () => resolve(decide(id, decision));
      });
    };
    return window.ask('sudo-busy', { stoppable: true });
  });
  await shown(page, 'sudo-busy');
  await clickApproval(page, 'deny');
  await page.until(() =>
    window.approvals().querySelector('[data-action=deny]').hasAttribute('pending')
  );
  assert.equal(
    await page.evaluate(() =>
      window.approvals().querySelector('[data-action=stop]').hasAttribute('disabled')
    ),
    true
  );
  await page.evaluate(async () => {
    await window.element().decide(window.model.approvals.list()[0], 'stop');
    return true;
  });
  assert.deepEqual(await page.evaluate(() => window.sent), [['sudo-busy', 'deny']]);
  await page.evaluate(() => window.release());
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-busy', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a terminal user’s request never offers Deny and stop, even when it says stoppable', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() =>
    window.ask('sudo-user', {
      requester: { kind: 'user', name: 'cone', where: 'Terminal 2' },
      stoppable: true,
      verdict: { level: 1, reason: 'It reads sizes.' },
    })
  );
  await shown(page, 'sudo-user');
  assert.deepEqual(await page.evaluate(() => window.actions().map(([action]) => action)), [
    'deny',
    'always',
    'once',
  ]);
  const where = await page.evaluate(() => window.where());
  assert.equal(where.deny[1], where.once[1]);
  assert.deepEqual(page.errors, []);
});

const boxes = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...window.approvals().querySelectorAll('[slot=button][data-action]')].map((button) => {
        const { left, top, right, bottom } = button.getBoundingClientRect();
        return [button.dataset.action, [left, top, right, bottom].map(Math.round)];
      })
    )
  );

const resize = async (page, width) => {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until((width) => window.innerWidth === width, width);
};

const ruledOut = {
  judging: false,
  always: false,
  verdict: { level: 3, aligned: false, reason: 'It changes permissions on system files.' },
};

for (const width of [1280, 420]) {
  for (const scope of [{}, { alwaysScope: 'cwd' }]) {
    const label = scope.alwaysScope ? ' in this directory' : '';
    const rows = width === 420 || scope.alwaysScope ? 2 : 1;
    test(`a stoppable request keeps every button in place from Checking to Always allow${label} at ${width}, on ${rows} row${rows === 1 ? '' : 's'}`, async (t) => {
      const page = await open(t, 'none', width);
      await page.evaluate(
        (scope) => window.ask('sudo-du', { judging: true, stoppable: true, ...scope }),
        scope
      );
      await shown(page, 'sudo-du');
      await waitApprovalArmed(page);
      const first = await page.evaluate(() => [window.where(), window.frame()]);
      assert.deepEqual(Object.keys(first[0]), ['deny', 'stop', 'once']);
      await page.evaluate(
        (scope) =>
          window.ask('sudo-du', {
            judging: false,
            stoppable: true,
            verdict: { level: 1, reason: 'It reads sizes.' },
            ...scope,
          }),
        scope
      );
      await page.until(() => !!window.approvals().querySelector('[data-action=always]'));
      await settle(300);
      const [buttons, frame] = await page.evaluate(() => [window.where(), window.frame()]);
      assert.deepEqual(frame, first[1]);
      for (const action of ['deny', 'stop', 'once'])
        assert.deepEqual(buttons[action], first[0][action]);
      const box = await boxes(page);
      const gap = box.stop[0] - box.deny[2];
      assert.ok(gap > 0);
      assert.equal(box.always[1], box.once[1]);
      assert.equal(box.once[0] - box.always[2], gap);
      if (rows === 1) {
        assert.equal(box.once[1], box.deny[1]);
        assert.ok(box.always[0] > box.stop[2]);
      } else {
        assert.equal(box.once[1] - box.deny[3], gap);
        assert.equal(box.stop[1], box.deny[1]);
      }
      assert.deepEqual(page.errors, []);
    });
  }
}

for (const width of [1280, 420]) {
  test(`a stoppable request without Always allow lays out one row at ${width}`, async (t) => {
    const page = await open(t, 'none', width);
    await page.evaluate(
      (ruledOut) => window.ask('sudo-chmod', { stoppable: true, ...ruledOut }),
      ruledOut
    );
    await shown(page, 'sudo-chmod');
    await waitApprovalArmed(page);
    assert.deepEqual(await page.evaluate(() => window.actions().map(([action]) => action)), [
      'deny',
      'stop',
      'once',
    ]);
    const box = await boxes(page);
    assert.equal(box.stop[1], box.deny[1]);
    assert.equal(box.once[1], box.deny[1]);
    assert.ok(box.once[0] > box.stop[2]);
    assert.equal(
      await page.evaluate(() => window.approvals().querySelectorAll('.break, .room').length),
      0
    );
    assert.deepEqual(page.errors, []);
  });
}

test('Allow once comes up to the first row when the verdict rules Always allow out, and waits again', async (t) => {
  const page = await open(t, 'none', 420);
  await page.evaluate(() => window.ask('sudo-chmod', { judging: true, stoppable: true }));
  await shown(page, 'sudo-chmod');
  await waitApprovalArmed(page);
  const before = await boxes(page);
  assert.ok(before.once[1] > before.deny[3]);
  await page.evaluate(() => {
    window.element().arming = 2000;
    return true;
  });
  await page.evaluate(
    (ruledOut) => window.ask('sudo-chmod', { stoppable: true, ...ruledOut }),
    ruledOut
  );
  await page.until(() => !window.approvals().querySelector('.break'));
  await settle(100);
  const after = await boxes(page);
  assert.equal(after.once[1], after.deny[1]);
  const once = await page.evaluate(() => {
    const box = window.approvals().querySelector('[data-action=once]').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, ...once, button: 'left', clickCount: 1 });
  await settle(300);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await clickApproval(page, 'once');
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-chmod', 'once'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a stoppable request wraps when the window narrows and goes back to one row when it widens', async (t) => {
  const page = await open(t, 'none', 1280);
  await page.evaluate(() =>
    window.ask('sudo-du', { stoppable: true, verdict: { level: 1, reason: 'It reads sizes.' } })
  );
  await shown(page, 'sudo-du');
  await waitApprovalArmed(page);
  const wide = await boxes(page);
  assert.equal(wide.once[1], wide.deny[1]);
  await resize(page, 420);
  await page.until(() => !!window.approvals().querySelector('.break'));
  await waitApprovalArmed(page);
  const narrow = await boxes(page);
  assert.equal(narrow.once[1] - narrow.deny[3], narrow.stop[0] - narrow.deny[2]);
  assert.equal(narrow.always[1], narrow.once[1]);
  await resize(page, 1280);
  await page.until(() => !window.approvals().querySelector('.break'));
  await waitApprovalArmed(page);
  assert.deepEqual(await boxes(page), wide);
  assert.deepEqual(page.errors, []);
});

test('a sudo request from a cone without stoppable keeps one row, as from an older agent', async (t) => {
  const page = await open(t, 'none');
  await page.evaluate(() =>
    window.ask('sudo-old', { verdict: { level: 1, reason: 'It reads sizes.' } })
  );
  await shown(page, 'sudo-old');
  assert.deepEqual(await page.evaluate(() => window.actions().map(([action]) => action)), [
    'deny',
    'always',
    'once',
  ]);
  assert.equal(await page.evaluate(() => !!window.approvals().querySelector('.break')), false);
  const where = await page.evaluate(() => window.where());
  assert.equal(where.deny[1], where.once[1]);
  assert.equal(where.always[1], where.once[1]);
  assert.deepEqual(page.errors, []);
});
