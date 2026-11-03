import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, approvals) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '0', color: 'light', approvals })}`);
  await page.until(() => window.ready === true);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    return true;
  });
  await page.until(() => !!window.approvals().querySelector('dialog[open] pre.command'));
  await page.until(
    () => !!window.approvals().querySelector('[data-action=always], [data-action=full-command]')
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  return page;
}

for (const [scenario, control, shown] of [
  ['controls-cr', '\r', '␍'],
  ['controls-lf', '\n', '␊\n'],
]) {
  test(`control characters in the command are shown for ${scenario}`, async (t) => {
    const page = await open(t, scenario);
    const command = `printf '%s' 'harbor${control}schedule'`;
    assert.deepEqual(
      await page.evaluate(() => ({
        text: window.approvals().querySelector('pre.command').textContent,
        command: window.model.approvals.list()[0].command,
        hint: window.approvals().querySelector('.hint:not([data-allow-hint])')?.textContent,
      })),
      {
        text: `sudo printf '%s' 'harbor${shown}schedule'`,
        command,
        hint: 'Always allow lets docs-pass run exactly this command with sudo without asking again.',
      }
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const chip = window.approvals().querySelector('pre.command .control');
        return [
          chip.textContent,
          chip.getAttribute('role'),
          chip.getAttribute('aria-label'),
          chip.title,
          getComputedStyle(chip, '::after').content,
        ];
      }),
      [
        shown.trimEnd(),
        'img',
        scenario === 'controls-cr' ? 'carriage return (U+000D)' : 'line feed (U+000A)',
        scenario === 'controls-cr' ? 'carriage return (U+000D)' : 'line feed (U+000A)',
        scenario === 'controls-cr' ? '"CR"' : '"LF"',
      ]
    );
    await page.until(() => !!window.approvals().querySelector('[data-action=always]'));
    await page.evaluate(() => {
      const port = window.model.approvals;
      const decide = port.decide.bind(port);
      port.decide = (id, decision) => {
        window.offered = { command: port.list().find((item) => item.id === id).command, decision };
        return decide(id, decision);
      };
      window.approvals().querySelector('[data-action=always]').click();
      return true;
    });
    await page.until(() => window.model.approvals.decisions.length === 1);
    assert.deepEqual(await page.evaluate(() => window.offered), { command, decision: 'always' });
    assert.deepEqual(page.errors, []);
  });
}

test('control characters in a full command are shown', async (t) => {
  const page = await open(t, 'long');
  await page.evaluate(() => {
    const port = window.model.approvals;
    const original = port.list()[0];
    port.end(original.id, 'withdrawn');
    window.originalCommand = `${original.command}\nprintf '%s' 'harbor\r\t\u0085\u200b\u2028\u2029\u202e\u2066\ufeffschedule'`;
    port.raise({ ...original, id: 'sudo-controls', command: window.originalCommand });
    return true;
  });
  await page.until(
    () =>
      !!window.approvals().querySelector('[data-approval=sudo-controls] [data-action=full-command]')
  );
  const expected = await page.evaluate(() =>
    window.originalCommand
      .replace(/\n/g, '␊\n')
      .replace(/\r/g, '␍')
      .replace(/\t/g, '␉')
      .replace(/\u0085/g, 'U+0085')
      .replace(/\u200b/g, 'U+200B')
      .replace(/\u2028/g, 'U+2028')
      .replace(/\u2029/g, 'U+2029')
      .replace(/\u202e/g, 'U+202E')
      .replace(/\u2066/g, 'U+2066')
      .replace(/\ufeff/g, 'U+FEFF')
  );
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('pre.command').textContent),
    `sudo ${expected}`
  );
  await page.until(() => window.approvals().querySelector('dialog').getAnimations().length === 0);
  const { x, y } = await page.evaluate(() => {
    const box = window
      .approvals()
      .querySelector('[data-action=full-command]')
      .getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await page.until(
    () =>
      window
        .approvals()
        .querySelector('[data-action=full-command]')
        ?.getAttribute('aria-expanded') === 'true'
  );
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('pre.command').textContent),
    `sudo ${expected}`
  );
  assert.equal(
    await page.evaluate(() => window.model.approvals.list()[0].command === window.originalCommand),
    true
  );
  assert.deepEqual(page.errors, []);
});

for (const scenario of ['agent', 'long']) {
  test(`the command is shown for ${scenario}`, async (t) => {
    const page = await open(t, scenario);
    assert.equal(
      await page.evaluate(() => window.approvals().querySelector('pre.command').textContent),
      await page.evaluate(
        () => `sudo ${window.model.approvals.list()[0].command.replace(/\n/g, '␊\n')}`
      )
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const pre = window.approvals().querySelector('pre.command');
        return [getComputedStyle(pre).whiteSpace, !!pre.querySelector('[data-clamp]')];
      }),
      ['pre-wrap', true]
    );
    assert.deepEqual(page.errors, []);
  });
}

for (const scenario of ['controls-place', 'controls-cwd']) {
  test(`control characters are shown for ${scenario}`, async (t) => {
    const page = await open(t, scenario);
    const result = await page.evaluate(() => {
      const root = window.approvals();
      const approval = window.model.approvals.list()[0];
      return {
        asking: root.querySelector('#asking').textContent,
        command: root.querySelector('pre.command').textContent,
        cwd: root.querySelector('.cwd')?.textContent,
        hint: root.querySelector('.hint:not([data-allow-hint])')?.textContent,
        labels: [...root.querySelectorAll('.control')].map((chip) =>
          chip.getAttribute('aria-label')
        ),
        original: [
          approval.requester.name,
          approval.requester.where,
          approval.cwd,
          approval.target,
        ],
      };
    });
    if (scenario === 'controls-place') {
      assert.equal(result.asking, 'docs␍pass wants to run this with sudo in harbor␍terminal␊seat:');
      assert.equal(result.command, 'sudo -u harbor␍user apt install jq');
      assert.equal(
        result.hint,
        'Always allow lets docs␍pass run exactly this command with sudo without asking again.'
      );
      assert.deepEqual(result.original, [
        'docs\rpass',
        'harbor\rterminal\nseat',
        '/home/cone/harbor',
        'harbor\ruser',
      ]);
    } else {
      assert.equal(result.asking, 'You ran this with sudo in harbor␍terminal␊seat (as co␍ne):');
      assert.equal(result.cwd, 'In /home/cone/harbor␍ferry␊schedule');
      assert.equal(
        result.hint,
        'Always allow lets co␍ne run exactly this command with sudo, in /home/cone/harbor␍ferry␊schedule, without asking again.'
      );
      assert.deepEqual(result.original, [
        'co\rne',
        'harbor\rterminal\nseat',
        '/home/cone/harbor\rferry\nschedule',
        null,
      ]);
    }
    assert.ok(result.labels.includes('carriage return (U+000D)'));
    assert.ok(result.labels.includes('line feed (U+000A)'));
    assert.deepEqual(page.errors, []);
  });
}
