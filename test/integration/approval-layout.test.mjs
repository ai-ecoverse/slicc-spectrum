import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const reason =
  'It lists how much space each directory under the old profile takes and changes nothing on disk. The owner asked for a cleanup of what the upgrade left behind, and this only reads sizes, so it fits that request.';

async function open(t, width) {
  const page = await chrome.page(t);
  await page.goto('/ui/?delay=0&color=light&approvals=none');
  await page.until(() => window.ready === true);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    window.ask = (id, patch = {}) => {
      const now = Date.now();
      window.model.approvals.raise({
        id,
        kind: 'sudo',
        requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
        command: `du -sh /var/lib/slicc/${id}/*`,
        cwd: '/var/lib/slicc',
        createdAt: window.created?.[id] ?? now,
        expiresAt: now + 5 * 60_000,
        always: true,
        ...patch,
      });
      window.created = { ...window.created, [id]: window.created?.[id] ?? now };
      return true;
    };
    window.where = () =>
      [...window.approvals().querySelectorAll('[slot=button]')].map((button) => {
        const box = button.getBoundingClientRect();
        return [button.dataset.action, Math.round(box.left), Math.round(box.top)];
      });
    window.frame = () => {
      const box = window.approvals().querySelector('dialog').getBoundingClientRect();
      return [Math.round(box.top), Math.round(box.height)];
    };
    window.center = (action) => {
      const box = window
        .approvals()
        .querySelector(`[data-action=${action}]`)
        .getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    return true;
  });
  return page;
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mouse = (page, type, { x, y }) =>
  page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });

for (const width of [1440, 420]) {
  test(`Deny and Allow once stay put while the verdict streams in at ${width}`, async (t) => {
    const page = await open(t, width);
    await page.evaluate(() => window.ask('sudo-du', { judging: true }));
    await page.until(() => !!window.approvals().querySelector('[data-verdict=checking]'));
    await settle(700);
    const first = await page.evaluate(() => [window.where(), window.frame()]);
    const steps = [
      { verdict: { level: 1, reason: '' } },
      { verdict: { level: 1, reason } },
      { verdict: { level: 1, aligned: true, reason } },
      { verdict: { level: 2, aligned: true, reason } },
      { verdictError: 'The check didn’t answer in time.' },
    ];
    const seen = [];
    for (const patch of steps) {
      await page.evaluate((patch) => window.ask('sudo-du', patch), patch);
      await settle(300);
      seen.push(await page.evaluate(() => [window.where(), window.frame()]));
    }
    await page.evaluate(() => window.ask('sudo-next'));
    await settle(300);
    seen.push(await page.evaluate(() => [window.where(), window.frame()]));
    const fixed = ([buttons, frame]) => [buttons.filter(([action]) => action !== 'always'), frame];
    for (const step of seen) assert.deepEqual(fixed(step), fixed(first), JSON.stringify(seen));
    assert.deepEqual(
      seen.map(([buttons]) => buttons.map(([action]) => action)),
      [
        ['deny', 'always', 'once'],
        ['deny', 'always', 'once'],
        ['deny', 'always', 'once'],
        ['deny', 'always', 'once'],
        ['deny', 'once'],
        ['deny', 'once'],
      ]
    );
    assert.equal(
      await page.evaluate(() => window.approvals().querySelector('[data-more]')?.textContent),
      '1 more request is waiting.'
    );
    assert.deepEqual(page.errors, []);
  });
}

const arm = (page, ms) =>
  page.evaluate((ms) => {
    window.$('slicc-app', 'slicc-approvals').arming = ms;
    return true;
  }, ms);

test('a press that started before Always allow appeared does not count', async (t) => {
  const page = await open(t, 1440);
  await arm(page, 1000);
  await page.evaluate(() => window.ask('sudo-du', { judging: true }));
  await page.until(() => !!window.approvals().querySelector('[data-verdict=checking]'));
  await settle(1100);
  const deny = await page.evaluate(() => window.center('deny'));
  await mouse(page, 'mousePressed', deny);
  await page.evaluate((reason) => window.ask('sudo-du', { verdict: { level: 1, reason } }), reason);
  await page.until(() => !!window.approvals().querySelector('[data-action=always]'));
  await mouse(page, 'mouseReleased', deny);
  await settle(300);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  const always = await page.evaluate(() => window.center('always'));
  await mouse(page, 'mousePressed', always);
  await mouse(page, 'mouseReleased', always);
  await settle(300);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await settle(1200);
  await mouse(page, 'mousePressed', always);
  await mouse(page, 'mouseReleased', always);
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-du', 'always'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('the next request inherits no click, from the mouse or the keyboard', async (t) => {
  const page = await open(t, 1440);
  await arm(page, 1500);
  await page.evaluate(() => {
    window.ask('sudo-one', { verdict: { level: 1, reason: 'It reads sizes.' } });
    window.ask('sudo-two', { verdict: { level: 1, reason: 'It reads sizes.' } });
    return true;
  });
  await page.until(() => !!window.approvals().querySelector('dialog[data-approval=sudo-one]'));
  await settle(1600);
  const once = await page.evaluate(() => window.center('once'));
  await mouse(page, 'mousePressed', once);
  await mouse(page, 'mouseReleased', once);
  await page.until(() => !!window.approvals().querySelector('dialog[data-approval=sudo-two]'));
  await page.until(() => window.approvals().activeElement?.dataset.action === 'deny');
  await page.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.center('once')), once);
  await mouse(page, 'mousePressed', once);
  await mouse(page, 'mouseReleased', once);
  await settle(300);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-one', 'once'],
  ]);
  await mouse(page, 'mousePressed', once);
  await page.evaluate(() => {
    window.model.approvals.end('sudo-two', 'withdrawn');
    window.ask('sudo-three', { verdict: { level: 1, reason: 'It reads sizes.' } });
    return true;
  });
  await page.until(() => !!window.approvals().querySelector('dialog[data-approval=sudo-three]'));
  await settle(1600);
  await mouse(page, 'mouseReleased', once);
  await settle(300);
  await page.until(() => window.approvals().activeElement?.dataset.action === 'deny');
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-one', 'once'],
  ]);
  await page.press('Enter');
  await page.until(() => window.model.approvals.decisions.length === 2);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-one', 'once'],
    ['sudo-three', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});
