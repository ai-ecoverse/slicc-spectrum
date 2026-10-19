import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, links, width = 1280, height = 1000) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', links })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.net = () => window.$('slicc-app', 'slicc-dock').content('network')?.shadowRoot;
    window.pairing = () => window.net()?.querySelector('[data-pairing]');
    window.pairState = () => window.pairing()?.dataset.pairing;
    window.deep = () => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active;
    };
    window.focusedIn = (selector) => {
      const target = window.net()?.querySelector(selector);
      const active = window.deep();
      return !!target && (target === active || target.shadowRoot?.contains(active) === true);
    };
    window.inView = (node) => {
      const host = window.$('slicc-app', 'slicc-dock').content('network');
      const box = host.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      return rect.height > 0 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1;
    };
    window.fill = (value) => {
      const field = window.net().querySelector('#pair-url');
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return true;
    };
    return true;
  });
  return page;
}

async function network(page) {
  await page.evaluate(() => window.app.show('network'));
  await page.until(() => !!window.pairing());
}

const live = () => window.net().querySelector('[data-pairing-status]').textContent.trim();

test('pairing runs from the link through confirm and linking to linked, then Done', async (t) => {
  const page = await open(t, 'pairing');
  await network(page);
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelector('details').open,
      window.pairState(),
      window.net().querySelector('[data-action=pair]').disabled,
      window.net().querySelector('[data-device=link-quay]') === null,
    ]),
    [false, 'idle', true, true]
  );
  await page.evaluate(() => {
    window.net().querySelector('details').open = true;
    return true;
  });
  await page.evaluate(() => window.fill('https://example.com/pair'));
  await page.until(() => !window.net().querySelector('[data-action=pair]').disabled);
  await page.evaluate(() => {
    window.net().querySelector('[data-action=pair]').click();
    return true;
  });
  await page.until(() => !!window.net().querySelector('[data-error=pairing]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelector('[data-error=pairing]').textContent.trim(),
      window.net().querySelector('#pair-url').value,
      window.pairState(),
    ]),
    ['That isn’t a pairing link from slicc pair.', 'https://example.com/pair', 'idle']
  );
  await page.evaluate(() => {
    window.fill('');
    window.net().querySelector('#pair-url').focus();
    return true;
  });
  await page.until(() => window.focusedIn('#pair-url'));
  await page.insert('http://127.0.0.1:7801/p/9k');
  await page.until(() => !window.net().querySelector('[data-action=pair]').disabled);
  await page.enter();
  await page.until(() => window.pairState() === 'confirm');
  await page.until(() => window.focusedIn('#pairing'));
  await page.until(() => window.inView(window.pairing()));
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelector('#pairing').textContent.trim(),
      window.pairing().querySelector('code').textContent,
      !!window.net().querySelector('[data-error=pairing]'),
    ]),
    ['Link SLICC on this computer?', 'ab12…ef', false]
  );
  assert.equal(await page.evaluate(live), 'Link SLICC on this computer? Code ab12…ef.');
  await page.evaluate(() => {
    window.net().querySelector('[data-action=confirm-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'linking');
  assert.deepEqual(
    await page.evaluate(() => [
      window.pairing().querySelector('swc-progress-circle').getAttribute('label'),
      !!window.pairing().querySelector('[data-action=cancel-pairing]'),
    ]),
    ['Linking', true]
  );
  await page.until(() => window.pairState() === 'linked');
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.net().querySelector('[data-device=link-quay]');
      return [
        window.pairing().querySelector('[data-paired]').getAttribute('variant'),
        window.pairing().querySelector('[data-paired]').textContent.replace(/\s+/g, ' ').trim(),
        row.dataset.mode,
        row.dataset.kind,
        row.querySelectorAll('sp-switch, [data-access], [data-control]').length,
      ];
    }),
    ['positive', 'Linked SLICC on quay-studio (ab12…ef).', 'local', 'cli', 0]
  );
  assert.equal(await page.evaluate(live), 'Linked SLICC on quay-studio.');
  await page.evaluate(() => {
    window.net().querySelector('[data-action=done-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'idle');
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelector('#pair-url').value,
      window.net().querySelector('[data-action=pair]').disabled,
      !!window.net().querySelector('[data-device=link-quay]'),
    ]),
    ['', true, true]
  );
  assert.deepEqual(page.errors, []);
});

test('a pairing that reaches confirm unfolds itself, scrolls into view, and cancels', async (t) => {
  const page = await open(t, 'pairing');
  await network(page);
  assert.equal(await page.evaluate(() => window.net().querySelector('details').open), false);
  await page.evaluate(() => window.model.network.pairComputer('http://127.0.0.1:7801/p/9k'));
  await page.until(() => window.pairState() === 'confirm');
  await page.until(() => window.net().querySelector('details').open);
  await page.until(() => window.inView(window.pairing()));
  await page.until(() => window.focusedIn('#pairing'));
  await page.evaluate(() => {
    window.net().querySelector('[data-action=cancel-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'idle');
  await page.until(() => window.focusedIn('#pairing'));
  assert.equal(
    await page.evaluate(() => !!window.net().querySelector('[data-device=link-quay]')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('a confirm that rejects after Cancel leaves no stale error under the field', async (t) => {
  const page = await open(t, 'pairing');
  await network(page);
  await page.evaluate(() => {
    const port = window.model.network;
    const confirm = port.confirmPairing;
    port.confirmPairing = async () => {
      confirm();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => {
        window.rejectConfirm = resolve;
      });
      throw new Error('Pairing was cancelled.');
    };
    return port.pairComputer('http://127.0.0.1:7801/p/9k');
  });
  await page.until(() => window.pairState() === 'confirm');
  await page.evaluate(() => {
    window.net().querySelector('[data-action=confirm-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'linking' && !!window.rejectConfirm);
  await page.evaluate(() => {
    window.net().querySelector('[data-action=cancel-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'idle');
  await page.evaluate(() => {
    window.rejectConfirm();
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelector('[data-error=pairing]'),
      window.net().querySelector('#pair-url').invalid,
    ]),
    [null, false]
  );
  assert.deepEqual(page.errors, []);
});

test('a failed pairing tries again with the field focused, or dismisses', async (t) => {
  const page = await open(t, 'pairing');
  await network(page);
  const fail = async () => {
    await page.evaluate(() => window.fill('http://127.0.0.1:7801/fail'));
    await page.evaluate(() => {
      window.net().querySelector('[data-action=pair]').click();
      return true;
    });
    await page.until(() => window.pairState() === 'confirm');
    await page.evaluate(() => {
      window.net().querySelector('[data-action=confirm-pairing]').click();
      return true;
    });
    await page.until(() => window.pairState() === 'failed');
  };
  await fail();
  assert.deepEqual(
    await page.evaluate(() => [
      window.pairing().querySelector('.error').textContent.replace(/\s+/g, ' ').trim(),
      window.net().querySelector('[data-pairing-status]').textContent.trim(),
    ]),
    [
      'Error: slicc on this computer stopped answering. Run slicc pair again.',
      'Error: slicc on this computer stopped answering. Run slicc pair again.',
    ]
  );
  await page.evaluate(() => {
    window.net().querySelector('[data-action=retry-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'idle');
  await page.until(() => window.focusedIn('#pair-url'));
  await fail();
  await page.evaluate(() => {
    window.net().querySelector('[data-action=dismiss-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'idle');
  assert.equal(await page.evaluate(() => !!window.pairing().querySelector('.error')), false);
  assert.deepEqual(page.errors, []);
});

test('a pairing already in confirm opens unfolded and focused when the panel opens', async (t) => {
  const page = await open(t, 'pairing');
  await page.evaluate(() => window.model.network.pairComputer('http://127.0.0.1:7801/p/9k'));
  await page.evaluate(() => window.app.show('network'));
  await page.until(() => window.pairState() === 'confirm');
  await page.until(() => window.focusedIn('#pairing'));
  await page.until(() => window.inView(window.pairing()));
  assert.equal(await page.evaluate(() => window.net().querySelector('details').open), true);
  assert.deepEqual(page.errors, []);
});

test('without a tray the join part hides and pairing stays; a null join still prepares', async (t) => {
  const page = await open(t, 'pairing-notray');
  await network(page);
  await page.evaluate(() => {
    window.net().querySelector('details').open = true;
    return true;
  });
  assert.deepEqual(
    await page.evaluate(() => [
      window.net().querySelectorAll('[data-join]').length,
      window.net().querySelector('[data-action=rotate-join-url]'),
      window.pairState(),
      window.net().querySelectorAll('li[data-device]').length > 0,
    ]),
    [0, null, 'idle', true]
  );
  await page.evaluate(() => {
    window.model.network.setLinks('preparing');
    return true;
  });
  await page.until(() => !!window.net().querySelector('[data-join=preparing]'));
  assert.equal(
    await page.evaluate(() => window.net().querySelector('[data-join=preparing]').textContent),
    'Preparing a join URL…'
  );
  assert.deepEqual(page.errors, []);
});

test('a forgotten device shows its note with an icon', async (t) => {
  const page = await open(t, 'forgotten');
  await network(page);
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.net().querySelector('[data-device=link-quay]');
      const note = row.querySelector('[data-note]');
      return [
        window.net().querySelector('details').open,
        row.dataset.state,
        note.textContent.replace(/\s+/g, ' ').trim(),
        !!note.querySelector('swc-icon-alert-triangle'),
        row.querySelectorAll('sp-switch, [data-access], [data-control]').length,
      ];
    }),
    [
      true,
      'offline',
      'Warning: SLICC on quay-studio no longer knows this seven. Pair it again.',
      true,
      0,
    ]
  );
  assert.deepEqual(page.errors, []);
});

test('pairing fits a phone at 420 without horizontal overflow in every state', async (t) => {
  const page = await open(t, 'pairing', 420, 860);
  await page.until(() => window.app.screen === 'phone');
  await network(page);
  const fits = () => {
    const host = window.$('slicc-app', 'slicc-dock').content('network');
    const edge = host.getBoundingClientRect().right;
    if (edge > innerWidth) return null;
    const over = [...window.pairing().querySelectorAll('*')]
      .filter((node) => node.getBoundingClientRect().right > edge + 0.5)
      .map((node) => node.localName);
    return { over, scroll: host.scrollWidth - host.clientWidth };
  };
  await page.evaluate(() => {
    window.net().querySelector('details').open = true;
    window.fill('http://127.0.0.1:7801/p/9k');
    return true;
  });
  await page.until(fits);
  assert.deepEqual(await page.evaluate(fits), { over: [], scroll: 0 });
  await page.evaluate(() => {
    window.net().querySelector('[data-action=pair]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'confirm');
  assert.deepEqual(await page.evaluate(fits), { over: [], scroll: 0 });
  await page.evaluate(() => {
    window.net().querySelector('[data-action=confirm-pairing]').click();
    return true;
  });
  await page.until(() => window.pairState() === 'linked');
  assert.deepEqual(await page.evaluate(fits), { over: [], scroll: 0 });
  assert.deepEqual(page.errors, []);
});
