import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.freezer = () => window.$('slicc-app', 'slicc-dock').content('freezer');
    window.inFreezer = (selector) => window.freezer()?.shadowRoot.querySelector(selector);
    window.importer = () => window.$('slicc-app', 'slicc-freezer-import');
    window.inImport = (selector) => window.importer()?.shadowRoot.querySelector(selector);
    window.stage = () => window.inImport('dialog')?.dataset.import ?? null;
    window.press = (action) => window.inImport(`[data-action=${action}]`).click();
    window.zip = (given) => {
      const name = given ?? 'slicc-profile.zip';
      const data = new DataTransfer();
      data.items.add(
        new File(['PK'], name, { type: name.endsWith('.zip') ? 'application/zip' : 'text/plain' })
      );
      return data;
    };
    window.pick = () => {
      const input = window.inFreezer('input[type=file]');
      input.files = window.zip().files;
      input.dispatchEvent(new Event('change'));
      return true;
    };
    window.app.show('freezer');
    return true;
  });
  await page.until(() => !!window.freezer()?.shadowRoot?.querySelector('.card'));
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

test('freezer import: pick, preview, import with progress, then done with badged rows and focus on the first', async (t) => {
  const page = await open(t, { import: 'v6', delay: '40' });
  assert.equal(
    await page.evaluate(() => window.inFreezer('[data-action=import-v6]').textContent.trim()),
    'Import from SLICC 6…'
  );
  assert.equal(
    await page.evaluate(() => window.inFreezer('input[type=file]').accept),
    '.zip,application/zip'
  );
  await page.evaluate(() => {
    window.seen = [];
    window.model.agent.on('importing', (progress) => window.seen.push(progress.phase));
    return window.pick();
  });
  await page.until(() => window.stage() === 'checking');
  assert.deepEqual(
    await page.evaluate(() => ({
      modal: window.inImport('dialog').matches(':modal'),
      text: window.inImport('[data-checking]').textContent.trim(),
      circle: !!window.inImport('[data-checking] swc-progress-circle[indeterminate]'),
      buttons: [...window.inImport('sp-alert-dialog').querySelectorAll('swc-button')].map(
        (b) => b.dataset.action
      ),
    })),
    { modal: true, text: 'Checking the profile…', circle: true, buttons: ['import-cancel'] }
  );
  await page.until(() => window.stage() === 'preview');
  assert.deepEqual(
    await page.evaluate(() => ({
      title: window.inImport('h2').textContent,
      text: window.inImport('[data-text]').textContent,
      summary: [...window.inImport('[data-summary]').children].map((item) => [
        item.querySelector('dt').textContent,
        item.querySelector('dd').textContent,
      ]),
      notes: [...window.inImport('.notes').children].map((note) => [
        note.dataset.note,
        note.textContent.trim(),
      ]),
      codes: [...window.inImport('[data-note=flagged]').querySelectorAll('code')].map(
        (code) => code.textContent
      ),
      icons: [...window.inImport('.notes').querySelectorAll('.icon')].map((icon) =>
        icon.getAttribute('aria-hidden')
      ),
      buttons: [...window.inImport('sp-alert-dialog').querySelectorAll('swc-button')].map((b) => [
        b.dataset.action,
        b.textContent.trim(),
        b.getAttribute('variant'),
      ]),
    })),
    {
      title: 'Import from SLICC 6?',
      text: 'This export from www.sliccy.ai has 3 cones with 14 scoops and 2 frozen conversations. They arrive frozen, so nothing runs until you thaw them.',
      summary: [
        ['Cones', '3'],
        ['Scoops', '14'],
        ['Frozen', '2'],
        ['Skills', '2'],
        ['Crons', '2'],
        ['Webhooks', '1'],
        ['Size', '4.6 MB'],
      ],
      notes: [
        ['providers', 'Sign in again in Settings: Anthropic, OpenAI.'],
        [
          'flagged',
          'Warning: 1 file looks like credentials. It is imported; review it afterwards: files/cones/cone/.env',
        ],
        ['mounts', 'Not imported: 2 mounted folders.'],
      ],
      codes: ['files/cones/cone/.env'],
      icons: ['true', 'true'],
      buttons: [
        ['import-cancel', 'Cancel', 'secondary'],
        ['import-confirm', 'Import', 'accent'],
      ],
    }
  );
  await shot(page, 'import-preview');
  await page.evaluate(() => window.press('import-confirm'));
  await page.until(() =>
    /^Importing \d+\/14$/.test(window.inImport('[data-progress] [slot=label]')?.textContent ?? '')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const bar = window.inImport('swc-progress-bar[data-progress]');
      return {
        max: bar.getAttribute('max-value'),
        determinate: !bar.hasAttribute('indeterminate'),
        announce: window.inImport('[data-announce]').textContent,
        live: window.inImport('[data-announce]').getAttribute('aria-live'),
      };
    }),
    { max: '14', determinate: true, announce: 'Importing the profile.', live: 'polite' }
  );
  await shot(page, 'import-progress');
  await page.until(() => window.stage() === 'done', { timeout: 15000 });
  assert.deepEqual(
    await page.evaluate(() => ({
      status: window.inImport('[data-status=done]').textContent.trim(),
      report: window.inImport('[data-report] code').textContent,
      copy: window.inImport('[data-action=copy-report]').textContent.trim(),
      announce: window.inImport('[data-announce]').textContent,
      phases: [...new Set(window.seen)],
    })),
    {
      status:
        'Imported 3 cones. Their scoops, skills and crons came along. Sign in to Anthropic and OpenAI again before you thaw them.',
      report: '/root/v6-import-2026-10-18.md',
      copy: 'Copy',
      announce: 'Imported 3 cones.',
      phases: ['checking', 'idle', 'writing', 'done'],
    }
  );
  await shot(page, 'import-done');
  await page.evaluate(() => window.press('import-done'));
  await page.until(() => !window.importer());
  await page.until(
    () => window.freezer().shadowRoot.activeElement?.dataset.id === 'cone-v6-lighthouse'
  );
  assert.deepEqual(
    await page.evaluate(() =>
      [...window.freezer().shadowRoot.querySelectorAll('.card[data-v6]')].map((card) => [
        card.dataset.id,
        card.querySelector('[data-badge=v6]').textContent,
        card.querySelector('[data-badge=v6]').getAttribute('variant'),
      ])
    ),
    [
      ['cone-v6-lighthouse', 'SLICC 6', 'neutral'],
      ['cone-v6-pantry', 'SLICC 6', 'neutral'],
      ['cone-v6-ferry', 'SLICC 6', 'neutral'],
    ]
  );
  await shot(page, 'import-rows');
});

test('freezer import: an earlier import offers Import again, which sends again', async (t) => {
  const page = await open(t, { import: 'again' });
  await page.evaluate(() => {
    window.calls = [];
    const port = window.model.agent.importProfile;
    window.model.agent.importProfile = (file, options) => {
      window.calls.push(options);
      return port(file, options);
    };
    return window.pick();
  });
  await page.until(() => window.stage() === 'preview');
  assert.match(
    await page.evaluate(() => window.inImport('[data-note=already]').textContent.trim()),
    /^You imported this export on \w{3} \d{1,2} \w{3}\. Import again to add fresh copies\.$/
  );
  assert.equal(
    await page.evaluate(() => window.inImport('[data-action=import-confirm]').textContent.trim()),
    'Import again'
  );
  await page.evaluate(() => window.press('import-confirm'));
  await page.until(() => window.stage() === 'done');
  assert.deepEqual(await page.evaluate(() => window.calls), [
    { preview: true },
    { preview: false, again: true },
  ]);
});

test('freezer import: Cancel while checking calls importCancel and puts focus back', async (t) => {
  const page = await open(t, { import: 'cancel-check' });
  await page.evaluate(() => {
    window.cancels = 0;
    const cancel = window.model.agent.importCancel;
    window.model.agent.importCancel = () => {
      window.cancels++;
      cancel();
    };
    window.inFreezer('[data-action=import-v6]').focus();
    return window.pick();
  });
  await page.until(() => window.stage() === 'checking');
  await page.evaluate(() => window.press('import-cancel'));
  await page.until(() => !window.importer());
  assert.equal(await page.evaluate(() => window.cancels), 1);
  await page.until(() => window.freezer().shadowRoot.activeElement?.dataset.action === 'import-v6');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(await page.evaluate(() => !!window.importer()), false);
});

test('freezer import: Cancel while importing calls importCancel and adds nothing', async (t) => {
  const late = await open(t, { import: 'v6', delay: '40' });
  await late.evaluate(() => {
    window.cancels = 0;
    const cancel = window.model.agent.importCancel;
    window.model.agent.importCancel = () => {
      window.cancels++;
      cancel();
    };
    return window.pick();
  });
  await late.until(() => window.stage() === 'preview');
  await late.evaluate(() => window.press('import-confirm'));
  await late.until(() => window.model.agent.importing().phase === 'writing');
  await late.evaluate(() => window.press('import-cancel'));
  await late.until(() => !window.importer());
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(
    await late.evaluate(() => [
      window.cancels,
      window.model.agent.frozen().filter((row) => row.v6).length,
      window.model.agent.importing().phase,
    ]),
    [1, 0, 'idle']
  );
});

test('freezer import: Escape while checking calls importCancel once and puts focus back', async (t) => {
  const page = await open(t, { import: 'cancel-check', delay: '40' });
  await page.evaluate(() => {
    window.cancels = 0;
    const cancel = window.model.agent.importCancel;
    window.model.agent.importCancel = () => {
      window.cancels++;
      cancel();
    };
    window.inFreezer('[data-action=import-v6]').focus();
    return window.pick();
  });
  await page.until(() => window.stage() === 'checking');
  await page.until(
    () => window.importer().shadowRoot.activeElement?.dataset.action === 'import-cancel'
  );
  await page.press('Escape');
  await page.until(() => !window.importer());
  await page.until(() => window.freezer().shadowRoot.activeElement?.dataset.action === 'import-v6');
  assert.equal(await page.evaluate(() => window.cancels), 1);
});

test('freezer import: Escape while importing calls importCancel once and adds nothing', async (t) => {
  const page = await open(t, { import: 'v6', delay: '40' });
  await page.evaluate(() => {
    window.cancels = 0;
    const cancel = window.model.agent.importCancel;
    window.model.agent.importCancel = () => {
      window.cancels++;
      cancel();
    };
    window.inFreezer('[data-action=import-v6]').focus();
    return window.pick();
  });
  await page.until(() => window.stage() === 'preview');
  await page.evaluate(() => window.press('import-confirm'));
  await page.until(() => window.model.agent.importing().phase === 'writing');
  await page.until(
    () => window.importer().shadowRoot.activeElement?.dataset.action === 'import-cancel'
  );
  await page.press('Escape');
  await page.until(() => !window.importer());
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(
    await page.evaluate(() => [
      window.cancels,
      window.model.agent.frozen().filter((row) => row.v6).length,
      window.freezer().shadowRoot.activeElement?.dataset.action,
    ]),
    [1, 0, 'import-v6']
  );
});

test('freezer import: many flagged files fold under a chevron, shown as code', async (t) => {
  const page = await open(t, { import: 'v6' });
  const flagged = [
    'files/cones/cone/.env',
    'files/cones/cone/.npmrc',
    'files/cones/pantry/.env',
    'files/scoops/ferry/.netrc',
  ];
  await page.evaluate((flagged) => {
    const port = window.model.agent.importProfile;
    window.model.agent.importProfile = async (file, options) => {
      const result = await port(file, options);
      return { ...result, preview: { ...result.preview, flagged } };
    };
    return window.pick();
  }, flagged);
  await page.until(() => window.stage() === 'preview');
  const folded = await page.evaluate(() => {
    const note = window.inImport('[data-note=flagged]');
    const details = note.querySelector('details[data-flagged]');
    const lead = note.textContent.split('Show the files')[0].trim();
    const before = details.open;
    note.querySelector('[data-action=import-flagged]').click();
    return {
      lead,
      before,
      after: details.open,
      codes: [...details.querySelectorAll('li code')].map((code) => code.textContent),
    };
  });
  assert.deepEqual(folded, {
    lead: 'Warning: 4 files look like credentials. They are imported; review them afterwards.',
    before: false,
    after: true,
    codes: flagged,
  });
});

test('freezer import: a check that returns no preview shows the error card', async (t) => {
  const page = await open(t, { import: 'v6' });
  await page.evaluate(() => {
    window.model.agent.importProfile = async () => ({
      preview: null,
      cones: [],
      report: null,
      text: '',
    });
    return window.pick();
  });
  await page.until(() => window.stage() === 'failed');
  assert.equal(
    await page.evaluate(() => window.inImport('[data-error=import]').textContent),
    'Error: Couldn’t read this export. Try another zip.'
  );
});

test('freezer import: no button when the port can’t cancel', async (t) => {
  const page = await open(t, { import: 'v6' });
  await page.evaluate(() => {
    window.model.agent.importCancel = undefined;
    window.freezer().requestUpdate();
    return window.freezer().updateComplete;
  });
  assert.equal(await page.evaluate(() => !!window.inFreezer('[data-action=import-v6]')), false);
});

test('freezer import: a rejection shows the error card, and Try again picks again', async (t) => {
  const page = await open(t, { import: 'fail' });
  await page.evaluate(() => window.pick());
  await page.until(() => window.stage() === 'failed');
  assert.deepEqual(
    await page.evaluate(() => ({
      role: window.inImport('[data-error=import]').getAttribute('role'),
      text: window.inImport('[data-error=import]').textContent,
      buttons: [...window.inImport('sp-alert-dialog').querySelectorAll('swc-button')].map((b) =>
        b.textContent.trim()
      ),
    })),
    {
      role: 'alert',
      text: 'Error: That zip isn’t a SLICC 6 profile export.',
      buttons: ['Close', 'Try again'],
    }
  );
  await shot(page, 'import-failed');
  await page.evaluate(() => {
    window.picks = 0;
    window.inFreezer('input[type=file]').addEventListener('click', () => window.picks++);
    return window.press('import-retry');
  });
  await page.until(() => !window.importer() && window.picks === 1);
  await page.evaluate(() => window.pick());
  await page.until(() => window.stage() === 'failed');
  await page.evaluate(() => window.press('import-close'));
  await page.until(() => !window.importer());
  assert.equal(await page.evaluate(() => window.picks), 1);
});

test('freezer import: dropping a zip on the Freezer opens the same flow', async (t) => {
  const page = await open(t, { import: 'v6' });
  const fire = (type, name) =>
    page.evaluate(
      ([type, name]) => {
        const event = new DragEvent(type, {
          bubbles: true,
          composed: true,
          cancelable: true,
          dataTransfer: window.zip(name),
        });
        window.inFreezer('.list').dispatchEvent(event);
        return event.defaultPrevented;
      },
      [type, name]
    );
  assert.equal(await fire('dragenter'), true);
  await page.until(() => !!window.inFreezer('swc-dropzone[dragged]'));
  assert.equal(
    await page.evaluate(() => window.inFreezer('swc-dropzone').textContent.trim()),
    'Drop to import'
  );
  await fire('drop', 'notes.txt');
  await page.until(() => !window.inFreezer('swc-dropzone'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await page.evaluate(() => !!window.importer()), false);
  await fire('dragover');
  await fire('drop');
  await page.until(() => window.stage() === 'preview');
});

test('freezer import: no button or drop on a guest seat', async (t) => {
  const page = await open(t, { import: 'v6' });
  assert.equal(await page.evaluate(() => !!window.inFreezer('[data-action=import-v6]')), true);
  const guest = await page.evaluate(async () => {
    const element = document.createElement('slicc-freezer');
    element.model = {
      ...window.model,
      seat: {
        id: 'seat-2',
        label: 'Seat 2 (Mara)',
        agentId: 'cone-sliccy',
        expiresAt: null,
        gates: { messages: 'user', tools: 'user' },
      },
    };
    document.body.append(element);
    await element.updateComplete;
    const event = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.zip(),
    });
    element.dispatchEvent(event);
    const result = {
      button: !!element.shadowRoot.querySelector('[data-action=import-v6]'),
      input: !!element.shadowRoot.querySelector('input[type=file]'),
      prevented: event.defaultPrevented,
      cards: element.shadowRoot.querySelectorAll('.card').length > 0,
    };
    element.remove();
    return result;
  });
  assert.deepEqual(guest, { button: false, input: false, prevented: false, cards: true });
});

test('freezer import: a page that turns watch-only while the preview is open imports nothing', async (t) => {
  const page = await open(t, { import: 'v6' });
  await page.evaluate(() => {
    window.calls = [];
    const port = window.model.agent.importProfile;
    window.model.agent.importProfile = (file, options) => {
      window.calls.push(options);
      return port(file, options);
    };
    return window.pick();
  });
  await page.until(() => window.stage() === 'preview');
  await page.evaluate(() => {
    window.model.agent.setReadOnly('Watch only.');
    return window.press('import-confirm');
  });
  await page.until(() => !window.importer());
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(
    await page.evaluate(() => [
      window.calls,
      window.model.agent.frozen().filter((row) => row.v6).length,
      !!window.inFreezer('[data-action=import-v6]'),
    ]),
    [[{ preview: true }], 0, false]
  );
});

test('freezer import: no button on a watch-only follower', async (t) => {
  const watch = await open(t, { import: 'v6', follow: 'watch', surfaces: 'all' });
  await watch.until(() => !!window.inFreezer('.bar'));
  assert.equal(await watch.evaluate(() => !!window.inFreezer('[data-action=import-v6]')), false);
});

test('freezer import: no button without importProfile', async (t) => {
  const plain = await open(t);
  assert.equal(await plain.evaluate(() => !!window.inFreezer('[data-action=import-v6]')), false);
});

test('freezer import: nothing overflows sideways at 420 px', async (t) => {
  const page = await open(t, { import: 'again' });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 420,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.evaluate(() => window.app.show('freezer'));
  await page.until(() => {
    const button = window.inFreezer('[data-action=import-v6]');
    const rect = button?.getBoundingClientRect();
    return !!rect && rect.width > 0 && rect.right <= innerWidth;
  });
  const fits = () => {
    const dialog = window.inImport('dialog');
    const rect = dialog.getBoundingClientRect();
    const content = window.inImport('.content');
    return {
      inside: rect.left >= 0 && rect.right <= innerWidth,
      scroll: dialog.scrollWidth <= dialog.clientWidth,
      content: content.scrollWidth <= content.clientWidth,
      page: document.documentElement.scrollWidth <= innerWidth,
      bar: window.inFreezer('.bar').scrollWidth <= window.inFreezer('.bar').clientWidth,
    };
  };
  const ok = { inside: true, scroll: true, content: true, page: true, bar: true };
  await page.evaluate(() => window.pick());
  await page.until(() => window.stage() === 'preview');
  await page.until(() => window.inImport('dialog').getAnimations().length === 0);
  assert.deepEqual(await page.evaluate(fits), ok);
  await shot(page, 'import-preview-420');
  await page.evaluate(() => window.press('import-confirm'));
  await page.until(() => window.stage() === 'done');
  assert.deepEqual(await page.evaluate(fits), ok);
  await shot(page, 'import-done-420');
});
