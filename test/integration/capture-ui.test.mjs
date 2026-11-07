import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals').shadowRoot;
    window.card = () => {
      const root = window.approvals();
      return {
        kind: root.querySelector('dialog')?.dataset.kind,
        variant: root.querySelector('sp-alert-dialog')?.getAttribute('variant'),
        icon: !!root.querySelector('sp-alert-dialog')?.shadowRoot?.querySelector('.icon'),
        title: root.querySelector('h2')?.textContent,
        body: root.querySelector('#asking')?.textContent,
        where: root.querySelector('[data-where]')?.textContent ?? null,
        capture: root.querySelector('[data-capture]')?.textContent ?? null,
        level: root.querySelector('.judged')?.dataset.level ?? null,
        verdict: root.querySelector('.judged strong')?.textContent ?? null,
        timer: root.querySelector('[data-timer]')?.textContent.replace(/\d+:\d\d/, 'm:ss'),
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => [
          button.dataset.action,
          button.textContent.trim(),
        ]),
        focused: root.activeElement?.dataset.action ?? null,
      };
    };
    window.live = () => window.$('slicc-app', 'slicc-live')?.shadowRoot;
    window.centerOf = (where, selector) => {
      const root = where === 'live' ? window.live() : window.approvals();
      const box = root.querySelector(selector).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    window.chips = () =>
      [...(window.live()?.querySelectorAll('[data-surface=live] [data-id]') ?? [])].map((chip) => ({
        id: chip.dataset.id,
        text: chip.querySelector('.text').innerText,
        button: chip.querySelector('[data-action=live-act]').textContent.trim(),
      }));
    return true;
  });
  return page;
}

async function ask(page, id) {
  await page.until(
    (id) =>
      window.approvals().querySelector('dialog')?.dataset.approval === id &&
      window.approvals().activeElement?.dataset.action === 'deny',
    id
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
}

async function press(page, where, selector) {
  const { x, y } = await page.evaluate(
    (where, selector) => window.centerOf(where, selector),
    where,
    selector
  );
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

const inDialog = (page, action) => press(page, 'dialog', `[data-action=${action}]`);

async function resize(page, width) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.until(
    (width) =>
      innerWidth === width &&
      window.$('slicc-app', 'header').getBoundingClientRect().width === width &&
      window.app.getAttribute('screen') ===
        (width < 640 ? 'phone' : width < 1200 ? 'tablet' : 'desktop'),
    width
  );
}

test('a click item here shows its title, body, Cancel and its action, and answers once', async (t) => {
  const page = await open(t, { approvals: 'click' });
  await ask(page, 'click-share');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'click',
    variant: 'information',
    icon: false,
    title: 'Share your screen?',
    body: 'media wants to record your screen for sliccy. Choose a screen, window or tab in Chrome’s picker.',
    where: null,
    capture: null,
    level: null,
    verdict: null,
    timer: 'Cancelled automatically in m:ss.',
    actions: [
      ['deny', 'Cancel'],
      ['once', 'Choose what to share'],
    ],
    focused: 'deny',
  });
  await inDialog(page, 'once');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['click-share', 'once'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a click item on another device says where to click and offers only Cancel', async (t) => {
  const page = await open(t, { approvals: 'click-remote' });
  await ask(page, 'click-share');
  const card = await page.evaluate(() => window.card());
  assert.equal(card.where, 'Click in seven’s tab on Studio Mac.');
  assert.deepEqual([card.variant, card.icon], ['information', false]);
  assert.deepEqual(card.actions, [['deny', 'Cancel']]);
  assert.equal(
    await page.evaluate(() => !!window.approvals().querySelector('[data-action=once]')),
    false
  );
  await page.evaluate(() => {
    const element = window.$('slicc-app', 'slicc-approvals');
    const [item] = window.model.approvals.list();
    return element.decide(item, 'once').then(() => true);
  });
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
  await inDialog(page, 'deny');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['click-share', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a guest capture item shows its line and level 2 verdict, and answers once', async (t) => {
  const page = await open(t, { approvals: 'capture' });
  await ask(page, 'capture-screen');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    kind: 'capture',
    variant: 'warning',
    icon: true,
    title: 'Allow a guest’s capture?',
    body: 'sliccy wants to use your screen for Seat 2 (Mara):',
    where: null,
    capture: 'Record your screen for up to 10 seconds, with your microphone · media',
    level: '2',
    verdict: 'Records what you share.',
    timer: 'Denied automatically in m:ss.',
    actions: [
      ['deny', 'Deny'],
      ['once', 'Allow once'],
    ],
    focused: 'deny',
  });
  await inDialog(page, 'once');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['capture-screen', 'once'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('a capture item offers Always allow when always is true, with its narrow hint', async (t) => {
  const page = await open(t, { approvals: 'none' });
  await page.evaluate(() => {
    const now = Date.now();
    window.model.approvals.raise({
      id: 'capture-camera',
      kind: 'capture',
      requester: { kind: 'guest', name: 'Seat 2 (Mara)' },
      agentName: 'sliccy',
      detail: { what: 'camera', mode: 'still', device: 'Desk camera', program: 'media' },
      createdAt: now,
      expiresAt: now + 300_000,
      always: true,
      verdict: { level: 1, aligned: true, reason: 'It takes one photo.' },
    });
    return true;
  });
  await ask(page, 'capture-camera');
  const card = await page.evaluate(() => window.card());
  assert.equal(card.capture, 'Take a photo with your camera (Desk camera) · media');
  assert.deepEqual(card.actions, [
    ['deny', 'Deny'],
    ['always', 'Always allow'],
    ['once', 'Allow once'],
  ]);
  assert.equal(
    await page.evaluate(() => window.approvals().querySelector('[data-always-hint]').textContent),
    'Always allow lets sliccy take photos with your camera for Seat 2 (Mara) without asking again.'
  );
  await inDialog(page, 'always');
  await page.until(() => !window.approvals().querySelector('dialog'));
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['capture-camera', 'always'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('live chips stack under the header, tick every second, and their button calls act', async (t) => {
  const page = await open(t, { live: 'both' });
  await page.until(() => window.chips().length === 2);
  const first = await page.evaluate(() => window.chips());
  assert.deepEqual(
    first.map(({ id, button }) => [id, button]),
    [
      ['live-screen', 'Stop'],
      ['live-microphone', 'Stop'],
    ]
  );
  assert.match(first[0].text, /^Recording screen · Entire screen · sliccy · 0:4\d$/);
  assert.match(
    first[1].text,
    /^Recording microphone · Desk microphone · Seat 2 \(Mara\) via docs-pass · 0:0\d$/
  );
  const layout = await page.evaluate(() => {
    const header = window.$('slicc-app', 'header').getBoundingClientRect();
    const [a, b] = [...window.live().querySelectorAll('[data-id]')].map((chip) =>
      chip.getBoundingClientRect()
    );
    const strip = window.$('slicc-app', 'slicc-live').getBoundingClientRect();
    return {
      below: Math.round(strip.top) === Math.round(header.bottom),
      stacked: b.top >= a.bottom,
    };
  });
  assert.deepEqual(layout, { below: true, stacked: true });
  const seconds = (text) => Number(text.split(':').at(-1));
  await page.until((before) => {
    const now = window.chips()[1]?.text.split(':').at(-1);
    return Number(now) > before;
  }, seconds(first[1].text));
  await press(page, 'live', '[data-id=live-screen] [data-action=live-act]');
  await page.until(() => window.chips().length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.live.acted), ['live-screen']);
  await page.evaluate(() => {
    window.model.live.act('live-microphone');
    return true;
  });
  await page.until(() => !window.live().querySelector('[data-surface=live]'));
  assert.equal(
    await page.evaluate(() => window.$('slicc-app', 'slicc-live').getBoundingClientRect().height),
    0
  );
  assert.deepEqual(page.errors, []);
});

test('a live item with no what leaves it out', async (t) => {
  const page = await open(t, { live: 'screen' });
  await page.until(() => window.chips().length === 1);
  await page.evaluate(() => {
    window.model.live.add({
      id: 'live-photo',
      kind: 'camera',
      label: 'Taking a photo',
      what: '',
      asker: 'sliccy',
      since: Date.now(),
      action: { label: 'Stop' },
    });
    return true;
  });
  await page.until(() => window.chips().length === 2);
  assert.match(
    (await page.evaluate(() => window.chips()))[1].text,
    /^Taking a photo · sliccy · 0:0\d$/
  );
  assert.deepEqual(page.errors, []);
});

test('at 420 px a chip keeps the dot, the label and the button, and fits the width', async (t) => {
  const page = await open(t, { live: 'both' });
  await resize(page, 420);
  await page.until(() => window.$('slicc-app', 'slicc-live')?.hasAttribute('compact') === true);
  const narrow = await page.evaluate(() =>
    [...window.live().querySelectorAll('[data-id]')].map((chip) => {
      const box = chip.getBoundingClientRect();
      const button = chip.querySelector('[data-action=live-act]').getBoundingClientRect();
      return {
        text: chip.querySelector('.text').innerText,
        dot: chip.querySelector('.dot').getBoundingClientRect().width > 0,
        fits: box.right <= innerWidth && button.right <= innerWidth && button.width > 0,
      };
    })
  );
  assert.deepEqual(narrow, [
    { text: 'Recording screen', dot: true, fits: true },
    { text: 'Recording microphone', dot: true, fits: true },
  ]);
  await resize(page, 1280);
  await page.until(() => window.$('slicc-app', 'slicc-live')?.hasAttribute('compact') === false);
  assert.match((await page.evaluate(() => window.chips()))[0].text, /Entire screen · sliccy/);
  assert.deepEqual(page.errors, []);
});

test('Settings lists the capture switches in order and each one calls set', async (t) => {
  const page = await open(t, { switches: 'capture' });
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.settingsPart('[data-surface=switches]'));
  const read = () =>
    page.evaluate(() => ({
      heading: window.settingsPart('h2[data-section=switches]').textContent,
      switches: [
        ...window.settingsPart('[data-surface=switches]').querySelectorAll('sp-switch'),
      ].map((item) => [item.dataset.id, item.textContent.trim(), item.checked]),
    }));
  assert.deepEqual(await read(), {
    heading: 'Capture and devices',
    switches: [
      ['camera', 'Camera', true],
      ['microphone', 'Microphone', true],
      ['screen', 'Screen', true],
    ],
  });
  await page.evaluate(() => {
    window.settingsPart('[data-surface=switches] sp-switch[data-id=microphone]').click();
    return true;
  });
  await page.until(() => window.model.switches.sets.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.switches.sets), [['microphone', false]]);
  assert.deepEqual((await read()).switches[1], ['microphone', 'Microphone', false]);
  assert.deepEqual(page.errors, []);
});

test('without the live and switches ports nothing new shows', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.app.show('settings');
    return true;
  });
  await page.until(() => !!window.settingsPart('h2[data-section=accounts]'));
  assert.deepEqual(
    await page.evaluate(() => ({
      live: !!window.$('slicc-app', 'slicc-live'),
      switches: !!window.settingsPart('[data-surface=switches]'),
    })),
    { live: false, switches: false }
  );
  assert.deepEqual(page.errors, []);
});

const refusals = [
  ['click', 'click-share', ['always'], 'once'],
  ['click-remote', 'click-share', ['once', 'always'], 'deny'],
  ['capture', 'capture-screen', ['always'], 'once'],
];

for (const [approvals, id, refused, allowed] of refusals) {
  test(`decide() refuses ${refused.join(' and ')} for the ${approvals} item and takes ${allowed}`, async (t) => {
    const page = await open(t, { approvals });
    await ask(page, id);
    for (const decision of refused) {
      await page.evaluate((decision) => {
        const element = window.$('slicc-app', 'slicc-approvals');
        const [item] = window.model.approvals.list();
        return element.decide(item, decision).then(() => true);
      }, decision);
    }
    assert.deepEqual(
      await page.evaluate(() => [
        window.model.approvals.decisions,
        window.approvals().querySelector('dialog')?.dataset.approval,
      ]),
      [[], id]
    );
    await page.evaluate((decision) => {
      const element = window.$('slicc-app', 'slicc-approvals');
      const [item] = window.model.approvals.list();
      return element.decide(item, decision).then(() => true);
    }, allowed);
    await page.until(() => !window.approvals().querySelector('dialog'));
    assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [[id, allowed]]);
    assert.deepEqual(page.errors, []);
  });
}

async function followerNotice(t, approval) {
  const page = await open(t, { approvals: 'none' });
  await page.evaluate((approval) => {
    window.model.approvals.decide = undefined;
    const now = Date.now();
    window.model.approvals.raise({ ...approval, createdAt: now, expiresAt: now + 300_000 });
    return true;
  }, approval);
  await page.until(
    (kind) =>
      !!window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-notices',
        `[data-approval-kind=${kind}]`
      ),
    approval.kind
  );
  const notice = await page.evaluate((kind) => {
    const notice = window.$(
      'slicc-app',
      'slicc-dock',
      'slicc-chat',
      'slicc-notices',
      `[data-approval-kind=${kind}]`
    );
    return [
      notice.dataset.approvalNotice,
      notice.querySelector('.title').textContent,
      ...[...notice.querySelectorAll('p')].map((p) =>
        p.textContent.replace(/at \d{1,2}:\d\d.*\./, 'at …')
      ),
    ];
  }, approval.kind);
  assert.equal(await page.evaluate(() => !!window.approvals().querySelector('dialog')), false);
  assert.deepEqual(page.errors, []);
  return notice;
}

test('without decide, a click item is a notice that says where to click, and no dialog shows', async (t) => {
  assert.deepEqual(
    await followerNotice(t, {
      id: 'click-share',
      kind: 'click',
      subject: 'capture',
      what: 'screen',
      program: 'media',
      requester: { kind: 'agent', name: 'sliccy' },
      title: 'Share your screen?',
      body: 'media wants to record your screen for sliccy.',
      action: 'Choose what to share',
      here: false,
      device: { id: 'device-studio', name: 'Studio Mac' },
    }),
    [
      'click-share',
      'Share your screen?',
      'media wants to record your screen for sliccy.',
      'Click in seven’s tab on Studio Mac. Cancelled automatically at …',
    ]
  );
});

test('without decide, a capture item is a notice with its capture line, and no dialog shows', async (t) => {
  assert.deepEqual(
    await followerNotice(t, {
      id: 'capture-mic',
      kind: 'capture',
      requester: { kind: 'guest', name: 'Seat 2 (Mara)' },
      agentName: 'sliccy',
      detail: { what: 'microphone', mode: 'audio', seconds: 30, program: 'media' },
      always: false,
    }),
    [
      'capture-mic',
      'Waiting for approval of a guest’s capture',
      "sliccy wants to use your microphone for Seat 2 (Mara), which waits for the owner's approval.",
      'Record your microphone for up to 30 seconds · media',
      'Denied automatically at …',
    ]
  );
});
