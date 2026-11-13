import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, { width = 1280, browser = 'idle', focus = 'tab-preview' } = {}) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', browser })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    window.inBrowser = (selector) => window.$('slicc-app', 'slicc-dock', 'slicc-browser', selector);
    window.text = (node) => node?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    window.drive = (draft) =>
      window.model.browser.record({ tabId: 'tab-preview', agentId: 'cone-harbor', ...draft });
    window.app.show('browser');
    return document.fonts.ready.then(() => true);
  });
  if (focus) {
    await page.until((id) => !!window.inBrowser(`li[data-id=${id}] .window`), focus);
    await page.evaluate((id) => window.inBrowser(`li[data-id=${id}] .window`).click(), focus);
    await page.until(() => !!window.inBrowser('.focused .driving'));
  }
  return page;
}

test('the driving row, the feed and the tab card show the stated intent', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const first = window.drive({
      kind: 'click',
      target: 'textbox "Name"',
      intent: 'Filling the order form',
    });
    window.model.browser.finish(first);
    window.drive({
      kind: 'type',
      target: 'textbox "Name"',
      length: 6,
      intent: 'Filling the order form',
    });
    return true;
  });
  await page.until(() => !!window.inBrowser('.driving .intent'));
  assert.deepEqual(
    await page.evaluate(() => {
      const row = window.inBrowser('.actions > li');
      return {
        driving: window.text(window.inBrowser('.driving swc-status-light')),
        title: window.inBrowser('.driving swc-status-light').title,
        said: window.text(window.inBrowser('[data-intent-announce]')),
        live: window.inBrowser('[data-intent-announce]').getAttribute('aria-live'),
        intent: row.hasAttribute('data-intent'),
        status: row.dataset.status,
        kind: row.dataset.kind,
        primary: window.text(row.querySelector('.what > .intent')),
        steps: [...row.querySelectorAll('.step')].map(window.text),
        group: row.hasAttribute('data-group'),
      };
    }),
    {
      driving: 'Watching harbor · Filling the order form',
      title: 'Watching harbor · Filling the order form',
      said: 'Filling the order form',
      live: 'polite',
      intent: true,
      status: 'running',
      kind: 'type',
      primary: 'Filling the order form',
      steps: ['Typed 6 characters into textbox "Name"', 'Clicked textbox "Name"'],
      group: false,
    }
  );
  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .intent'));
  assert.deepEqual(
    await page.evaluate(() => ({
      card: window.text(window.inBrowser('li[data-id=tab-preview] .intent')),
      under:
        window.inBrowser('li[data-id=tab-preview] .intent').previousElementSibling.className ===
        'driving',
      others: [...window.inBrowser('.cards').querySelectorAll('.intent')].length,
    })),
    { card: 'Filling the order form', under: true, others: 1 }
  );
  assert.deepEqual(page.errors, []);
});

test('consecutive actions with one intent group under it, and identical ones fold inside', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const done = (draft) => window.model.browser.finish(window.drive(draft));
    window.drive({ kind: 'click', target: 'button "Old"', status: 'failed', error: 'Gone' });
    done({ kind: 'goto', value: 'https://shop.example.com/menu', intent: 'Reading the menu' });
    window.drive({
      kind: 'click',
      target: 'button "Menu"',
      intent: 'Reading the menu',
      status: 'failed',
    });
    done({ kind: 'scroll', intent: 'Reading the menu' });
    done({ kind: 'scroll', intent: 'Reading the menu' });
    done({ kind: 'scroll', intent: 'Reading the menu' });
    done({ kind: 'click', target: 'button "Soup"', intent: 'Choosing a dish' });
    done({ kind: 'snapshot' });
    done({ kind: 'snapshot' });
    const failed = window.drive({
      kind: 'click',
      target: 'button "Order"',
      intent: 'Placing the order',
    });
    window.model.browser.finish(failed, 'No element matches button "Order".');
    return true;
  });
  await page.until(() => window.inBrowser('.actions > li')?.dataset.status === 'failed');
  const rows = await page.evaluate(() =>
    [...window.inBrowser('.actions').children].slice(0, 4).map((row) => ({
      intent: window.text(row.querySelector('.what > .intent')),
      steps: [...row.querySelectorAll('.step')].map(window.text),
      what: row.hasAttribute('data-intent') ? null : window.text(row.querySelector('.what')),
      group: row.hasAttribute('data-group'),
      status: row.dataset.status,
    }))
  );
  assert.deepEqual(rows, [
    {
      intent: 'Placing the order',
      steps: ['Clicked button "Order"No element matches button "Order".'],
      what: null,
      group: false,
      status: 'failed',
    },
    { intent: null, steps: [], what: 'Read the page×2', group: true, status: 'done' },
    {
      intent: 'Choosing a dish',
      steps: ['Clicked button "Soup"'],
      what: null,
      group: false,
      status: 'done',
    },
    {
      intent: 'Reading the menu',
      steps: ['Scrolled×3', 'Clicked button "Menu"Failed', 'Went to shop.example.com/menu'],
      what: null,
      group: false,
      status: 'done',
    },
  ]);
  assert.deepEqual(
    await page.evaluate(() => {
      const rows = [...window.inBrowser('.actions').children];
      const mark = (step) => {
        const icon = step.querySelector('.failure swc-icon-alert-triangle');
        return icon ? [icon.getAttribute('aria-label'), icon.getAttribute('aria-hidden')] : null;
      };
      return {
        newest: rows[0].firstElementChild.firstElementChild.localName,
        older: rows[3].firstElementChild.firstElementChild.localName,
        marks: [rows[0], rows[3]].flatMap((row) => [...row.querySelectorAll('.step')].map(mark)),
        plain: ((icon) => [icon.getAttribute('role'), icon.getAttribute('aria-label')])(
          window.inBrowser('.actions > li:not([data-intent]) swc-icon-alert-triangle')
        ),
      };
    }),
    {
      newest: 'swc-icon-cursor-click',
      older: 'swc-icon-hand',
      marks: [['Failed', null], null, [null, 'true'], null],
      plain: ['img', 'Failed'],
    }
  );
  assert.equal(
    await page.evaluate(() =>
      window.inBrowser('.actions > li .step[data-kind=goto]').getAttribute('title')
    ),
    'https://shop.example.com/menu'
  );
  await page.evaluate(() =>
    window.inBrowser('.actions > li .step[data-kind=goto] [data-action=action-url]').click()
  );
  await page.until(() => !!window.inBrowser('.actions > li .step[data-kind=goto] .full'));
  assert.equal(
    await page.evaluate(() => window.text(window.inBrowser('.step[data-kind=goto] .full'))),
    'https://shop.example.com/menu'
  );
  assert.deepEqual(page.errors, []);
});

test('the driving row holds each intent for a second, and announces only what it shows', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.seen = [];
    window.said = [];
    const watch = () => {
      const shown = window.text(window.inBrowser('.driving .intent'));
      if (shown !== (window.seen.at(-1)?.text ?? null))
        window.seen.push({ text: shown, at: performance.now() });
      const said = window.text(window.inBrowser('[data-intent-announce]'));
      if (said !== (window.said.at(-1) ?? '')) window.said.push(said);
    };
    new MutationObserver(watch).observe(
      window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot,
      { subtree: true, childList: true, characterData: true }
    );
    window.drive({ kind: 'snapshot', intent: 'Reading the menu' });
    return true;
  });
  await page.until(() => window.seen.at(-1)?.text === 'Reading the menu');
  await page.evaluate(async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 40));
    const step = async (draft) => {
      const running = window.model.browser
        .actions('tab-preview')
        .findLast((a) => a.status === 'running');
      window.model.browser.finish(running.id);
      window.drive(draft);
      await wait();
    };
    await step({ kind: 'click', target: 'button "Soup"', intent: 'Choosing a dish' });
    await step({ kind: 'scroll', intent: 'Reading the menu' });
    await step({ kind: 'click', target: 'button "Tea"', intent: 'Choosing a drink' });
    await step({ kind: 'click', target: 'button "Order"', intent: 'Placing the order' });
    return true;
  });
  assert.equal(
    await page.evaluate(() => window.text(window.inBrowser('.driving .intent'))),
    'Reading the menu'
  );
  await page.until(() => window.seen.at(-1)?.text === 'Placing the order');
  const { seen, said } = await page.evaluate(() => ({ seen: window.seen, said: window.said }));
  assert.deepEqual(
    seen.map((entry) => entry.text),
    ['Reading the menu', 'Placing the order']
  );
  assert.ok(seen[1].at - seen[0].at >= 950, `${seen[1].at - seen[0].at} ms`);
  assert.deepEqual(said, ['Reading the menu', 'Placing the order']);
  await page.evaluate(() => window.inBrowser('.driving [data-action=stop-agent]').click());
  await page.until(() => window.inBrowser('.driving')?.dataset.driving === 'none');
  assert.deepEqual(
    await page.evaluate(() => ({
      intent: !!window.inBrowser('.driving .intent'),
      said: window.text(window.inBrowser('[data-intent-announce]')),
    })),
    { intent: false, said: '' }
  );
  assert.deepEqual(page.errors, []);
});

for (const width of [1280, 420]) {
  test(`an action without an intent leaves the row, the feed and the card as they were at ${width} px`, async (t) => {
    const page = await open(t, { width });
    const measure = () =>
      page.evaluate(() => ({
        figure: Math.round(window.inBrowser('figure').getBoundingClientRect().top),
        height: Math.round(window.inBrowser('.driving').getBoundingClientRect().height),
      }));
    const before = await measure();
    await page.evaluate(() => window.drive({ kind: 'scroll' }));
    await page.until(() => !!window.inBrowser('.driving [data-action=stop-agent]'));
    assert.deepEqual(
      await page.evaluate(() => ({
        light: window.inBrowser('.driving swc-status-light').innerHTML.replace(/<!--.*?-->/g, ''),
        intent: !!window.inBrowser('.driving .intent'),
        said: window.text(window.inBrowser('[data-intent-announce]')),
        row: window.inBrowser('.actions > li').hasAttribute('data-intent'),
        what: window.text(window.inBrowser('.actions > li .what')),
        steps: !!window.inBrowser('.actions > li:first-child .steps'),
      })),
      {
        light: 'Watching harbor',
        intent: false,
        said: '',
        row: false,
        what: 'Scrolled',
        steps: false,
      }
    );
    assert.deepEqual(await measure(), before);
    await page.evaluate(() => {
      const running = window.model.browser
        .actions('tab-preview')
        .findLast((a) => a.status === 'running');
      window.model.browser.finish(running.id);
      window.drive({
        kind: 'click',
        target: 'button "Compare ports"',
        intent: 'Comparing the port forecasts for the whole coast this week',
      });
      return true;
    });
    await page.until(() => !!window.inBrowser('.driving .intent'));
    assert.deepEqual(await measure(), before);
    await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
    await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .intent'));
    assert.equal(await page.evaluate(() => window.inBrowser('li[data-id=tab-pull] .intent')), null);
    assert.deepEqual(page.errors, []);
  });
}

test('intents are text only, cut at secret-shaped words and kept short', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const done = (draft) => window.model.browser.finish(window.drive(draft));
    done({ kind: 'eval', intent: '<img src=x onerror="window.pwned=1">Checking the page' });
    done({
      kind: 'fill',
      target: 'textbox "Key"',
      length: 40,
      intent: 'Pasting the key sk-live0123456789abcdef into the form',
    });
    done({ kind: 'snapshot', intent: `Reading ${'every forecast '.repeat(12)}` });
    window.drive({
      kind: 'type',
      target: 'textbox "Token"',
      intent: 'Entering token: hunter2 in the field',
    });
    return true;
  });
  await page.until(() => window.inBrowser('.actions > li')?.dataset.kind === 'type');
  await page.until(() => window.text(window.inBrowser('.driving .intent')) === 'Entering token: …');
  const shown = await page.evaluate(() => ({
    rows: [...window.inBrowser('.actions').children]
      .slice(0, 4)
      .map((row) => window.text(row.querySelector('.what > .intent'))),
    images: window.inBrowser('.actions').querySelectorAll('img').length,
    pwned: window.pwned ?? null,
    said: window.text(window.inBrowser('[data-intent-announce]')),
  }));
  assert.equal(shown.rows[0], 'Entering token: …');
  assert.ok(shown.rows[1].endsWith(' …') && shown.rows[1].length <= 80, shown.rows[1]);
  assert.equal(shown.rows[2], 'Pasting the key …');
  assert.equal(shown.rows[3], '<img src=x onerror="window.pwned=1">Checking the page');
  assert.equal(shown.images, 0);
  assert.equal(shown.pwned, null);
  assert.equal(shown.said, 'Entering token: …');
  assert.deepEqual(page.errors, []);
});

test('the dummy browser shows intents while harbor and otter drive', async (t) => {
  const page = await open(t, { browser: 'driving', focus: null });
  await page.until(() => !!window.inBrowser('.focused .driving .intent'));
  assert.equal(
    await page.evaluate(() => window.text(window.inBrowser('.driving swc-status-light'))),
    'Watching harbor · Comparing the port forecasts'
  );
  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(() => !!window.inBrowser('li[data-id=tab-pull] .intent'));
  assert.deepEqual(
    await page.evaluate(() => ({
      pull: window.text(window.inBrowser('li[data-id=tab-pull] .intent')),
      preview: window.text(window.inBrowser('li[data-id=tab-preview] .intent')),
      docs: window.inBrowser('li[data-id=tab-docs] .intent'),
    })),
    {
      pull: 'Reviewing the tide pull request',
      preview: 'Comparing the port forecasts',
      docs: null,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('bidi and other format controls in an intent show as visible chips, not reordered text', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.drive({
      kind: 'click',
      target: 'button "Pay"',
      intent: 'Paying \u202Eredro eht\u202C and \u2066isolated\u2069 text',
    });
    return true;
  });
  await page.until(() => !!window.inBrowser('.driving .intent .control'));
  const raw = /[\u202A-\u202E\u2066-\u2069]/;
  const read = () =>
    page.evaluate(() => {
      const chips = (node) =>
        [...node.querySelectorAll('.control')].map((chip) => [
          chip.getAttribute('role'),
          chip.getAttribute('aria-label'),
          chip.textContent,
        ]);
      const driving = window.inBrowser('.driving .intent');
      const row = window.inBrowser('.actions > li .what > .intent');
      const said = window.inBrowser('[data-intent-announce]');
      const card = window.inBrowser('li[data-id=tab-preview] .intent');
      return {
        text: [driving, row, said, card].filter(Boolean).map((node) => node.textContent),
        chips: [driving, row, said, card].filter(Boolean).map(chips),
        titles: [window.inBrowser('.driving swc-status-light')?.title, card?.title].filter(Boolean),
      };
    });
  const chips = [
    ['img', 'U+202E', 'U+202E'],
    ['img', 'U+202C', 'U+202C'],
    ['img', 'U+2066', 'U+2066'],
    ['img', 'U+2069', 'U+2069'],
  ];
  const shown = 'Paying U+202Eredro ehtU+202C and U+2066isolatedU+2069 text';
  const focused = await read();
  assert.deepEqual(focused.chips, [chips, chips, chips]);
  assert.deepEqual(focused.text, [shown, shown, shown]);
  assert.deepEqual(focused.titles, [`Watching harbor · ${shown}`]);
  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .intent .control'));
  const cards = await read();
  assert.deepEqual(cards.chips, [chips]);
  assert.deepEqual(cards.text, [shown]);
  assert.deepEqual(cards.titles, ['harbor is using this tab', shown]);
  for (const value of [...focused.text, ...focused.titles, ...cards.text, ...cards.titles])
    assert.ok(!raw.test(value), JSON.stringify(value));
  assert.deepEqual(page.errors, []);
});

test('a secret-shaped word split by invisible characters is still cut', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.browser.finish(
      window.drive({
        kind: 'fill',
        target: 'textbox "Key"',
        intent: 'Pasting the key \uFF53\uFF4B-live0123456789abcdef in',
      })
    );
    window.drive({
      kind: 'type',
      target: 'textbox "Token"',
      intent: 'Entering tok\u200Ben: hunter2 in the field',
    });
    return true;
  });
  await page.until(() => window.inBrowser('.actions > li')?.dataset.kind === 'type');
  await page.until(() => window.inBrowser('.driving .intent')?.textContent === 'Entering token: …');
  const focused = await page.evaluate(() => ({
    driving: window.inBrowser('.driving .intent').textContent,
    title: window.inBrowser('.driving swc-status-light').title,
    said: window.inBrowser('[data-intent-announce]').textContent,
    rows: [...window.inBrowser('.actions').children]
      .slice(0, 2)
      .map((row) => row.querySelector('.what > .intent').textContent),
    chips: window.inBrowser('.actions').querySelectorAll('.what > .intent .control').length,
  }));
  assert.deepEqual(focused, {
    driving: 'Entering token: …',
    title: 'Watching harbor · Entering token: …',
    said: 'Entering token: …',
    rows: ['Entering token: …', 'Pasting the key …'],
    chips: 0,
  });
  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .intent'));
  assert.equal(
    await page.evaluate(() => window.inBrowser('li[data-id=tab-preview] .intent').textContent),
    'Entering token: …'
  );
  const html = await page.evaluate(
    () => window.$('slicc-app', 'slicc-dock', 'slicc-browser').shadowRoot.innerHTML
  );
  assert.ok(!html.includes('hunter2') && !html.includes('0123456789abcdef'));
  assert.deepEqual(page.errors, []);
});

test('another agent taking the tab during the hold shows its own intent, not the old one', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.drive({ kind: 'snapshot', intent: 'Reading the menu' });
    return true;
  });
  await page.until(() => window.text(window.inBrowser('.driving .intent')) === 'Reading the menu');
  const shown = await page.evaluate(async () => {
    const running = window.model.browser
      .actions('tab-preview')
      .findLast((a) => a.status === 'running');
    window.model.browser.finish(running.id);
    window.model.browser.record({
      tabId: 'tab-preview',
      agentId: 'scoop-otter',
      kind: 'click',
      target: 'button "Tea"',
      intent: 'Choosing a drink',
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const first = window.text(window.inBrowser('.driving swc-status-light'));
    const said = window.text(window.inBrowser('[data-intent-announce]'));
    window.model.browser.record({ tabId: 'tab-preview', agentId: 'cone-harbor', kind: 'scroll' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      first,
      said,
      plain: window.text(window.inBrowser('.driving swc-status-light')),
      none: !window.inBrowser('.driving .intent'),
    };
  });
  assert.deepEqual(shown, {
    first: 'Watching quiet-otter · Choosing a drink',
    said: 'Choosing a drink',
    plain: 'Watching harbor',
    none: true,
  });
  assert.deepEqual(page.errors, []);
});

test('a long intent is cut between characters, never inside an emoji', async (t) => {
  const page = await open(t);
  const intent = `${'a'.repeat(77)}\u{1F600} and more words after it`;
  await page.evaluate((value) => {
    window.drive({ kind: 'scroll', intent: value });
    return true;
  }, intent);
  await page.until(() => !!window.inBrowser('.driving .intent'));
  const shown = await page.evaluate(() => ({
    driving: window.inBrowser('.driving .intent').textContent,
    row: window.inBrowser('.actions > li .what > .intent').textContent,
  }));
  assert.deepEqual(shown, { driving: `${'a'.repeat(77)} …`, row: `${'a'.repeat(77)} …` });
  assert.ok(shown.driving.isWellFormed() && shown.row.isWellFormed());
  assert.deepEqual(page.errors, []);
});

test('a takeover while the old agent’s action still runs shows the new driver’s intent', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.drive({ kind: 'snapshot', intent: 'Reading the menu' });
    return true;
  });
  await page.until(() => window.text(window.inBrowser('.driving .intent')) === 'Reading the menu');
  await page.evaluate(() => {
    const id = window.model.browser.record({
      tabId: 'tab-preview',
      agentId: 'scoop-otter',
      kind: 'click',
      target: 'button "Tea"',
      intent: 'Choosing a drink',
    });
    window.model.browser.finish(id);
    return true;
  });
  await page.until(() =>
    window.text(window.inBrowser('.driving swc-status-light'))?.startsWith('Watching quiet-otter')
  );
  const focused = await page.evaluate(() => ({
    running: window.model.browser
      .actions('tab-preview')
      .some((a) => a.agentId === 'cone-harbor' && a.status === 'running'),
    driving: window.text(window.inBrowser('.driving swc-status-light')),
    said: window.text(window.inBrowser('[data-intent-announce]')),
  }));
  assert.deepEqual(focused, {
    running: true,
    driving: 'Watching quiet-otter · Choosing a drink',
    said: 'Choosing a drink',
  });
  await page.evaluate(() => window.inBrowser('[data-action=all-tabs]').click());
  await page.until(() => !!window.inBrowser('li[data-id=tab-preview] .intent'));
  assert.equal(
    await page.evaluate(() => window.text(window.inBrowser('li[data-id=tab-preview] .intent'))),
    'Choosing a drink'
  );
  assert.deepEqual(page.errors, []);
});
