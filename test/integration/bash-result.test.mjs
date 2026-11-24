import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, color = 'light') {
  const page = await chrome.page(t);
  const url = `/ui/?${new URLSearchParams({ delay: '5', color })}`;
  await page.goto(url);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('#run-k-t17') && !!window.chatPart('#run-k-r7'));
  return page;
}

async function expand(page, ids) {
  await page.evaluate(async (ids) => {
    for (const id of ids) {
      const status = window.chatPart(`#run-${id}`).closest('swc-response-status');
      if (!status.open)
        status.shadowRoot.querySelector('.swc-ResponseStatus-headerTrail--button').click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const step = window.chatPart(`#run-${id}`);
      if (!step.hasAttribute('data-open')) step.querySelector('.run-toggle').click();
    }
    return true;
  }, ids);
  await page.until((ids) => ids.every((id) => !window.chatPart(`#detail-${id}`).hidden), ids);
}

function install() {
  window.bashResult = (id) => {
    const detail = window.chatPart(`#detail-${id}`);
    const footer = detail.querySelector('.result');
    const badge = footer?.querySelector('swc-badge');
    const size = (element) => element && getComputedStyle(element).fontSize;
    return {
      last: detail.lastElementChild === footer,
      badge: badge
        ? [
            badge.textContent,
            badge.getAttribute('variant'),
            badge.hasAttribute('subtle'),
            badge.dataset.exit,
            badge.dataset.signal ?? null,
          ]
        : null,
      programs: [...detail.querySelectorAll('[data-program]')].map((item) => [
        item.dataset.program,
        item.textContent,
      ]),
      programText: detail.querySelector('.programs')?.textContent ?? null,
      meta: footer?.querySelector('.tool-meta')?.textContent ?? null,
      notes: [...detail.querySelectorAll('[data-note]')].map((note) => [
        note.dataset.severity,
        note.textContent,
      ]),
      sizes: [
        size(footer),
        size(detail.querySelector('.notes')),
        size(detail.querySelector('.tool-meta')),
      ],
    };
  };
  return true;
}

test('a bash step shows its exit status as a badge, the programs that failed, and its notes at the meta size', async (t) => {
  const page = await open(t);
  await expand(page, ['k-t16', 'k-t17', 'k-t18', 'k-r6', 'k-r7']);
  await page.evaluate(install);
  const [failed, inner, killed, passed, plain] = await page.evaluate(() =>
    ['k-t16', 'k-t17', 'k-t18', 'k-r6', 'k-r7'].map(window.bashResult)
  );
  assert.deepEqual(failed.badge, ['Exit 5', 'negative', true, '5', null]);
  assert.equal(failed.last, true);
  assert.equal(failed.meta, 'Ran wrangler · 1.8 s · timeout 60s');
  assert.deepEqual(failed.notes, [
    ['warn', 'Warning: Output truncated: 12 lines and 1,840 bytes dropped from the start'],
    ['info', 'Note: Full output in /tmp/pi-bash-7f3a.log'],
  ]);
  assert.equal(failed.sizes[1], failed.sizes[2]);
  assert.equal(failed.sizes[0], failed.sizes[2]);
  assert.deepEqual(inner.badge, ['Exit 0', 'positive', true, '0', null]);
  assert.deepEqual(inner.programs, [
    ['wrangler', 'wrangler exited 1'],
    ['timeout', 'timeout exited 1'],
  ]);
  assert.equal(inner.programText, 'wrangler exited 1, timeout exited 1');
  assert.deepEqual(killed.badge, ['Killed (SIGTERM)', 'negative', true, '143', 'SIGTERM']);
  assert.deepEqual(killed.programs, []);
  assert.equal(killed.meta, null);
  assert.deepEqual(passed.badge, ['Exit 0', 'positive', true, '0', null]);
  assert.equal(passed.meta, 'timeout 120s');
  assert.deepEqual(plain.badge, ['Exit 1', 'negative', true, '1', null]);
  assert.deepEqual(plain.notes, []);
  assert.deepEqual(page.errors, []);
});

test('a step with only an exit status still opens to show it', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const agent = window.model.agent;
    const call = {
      id: 'exit-only-t',
      name: 'bash',
      title: 'Probe the port',
      input: '',
      output: '',
      status: 'error',
      paths: [],
      exit: { code: 7 },
    };
    const added = {
      id: 'exit-only',
      role: 'assistant',
      status: 'done',
      createdAt: Date.now(),
      model: 'claude-opus-5-5',
      parts: [{ type: 'tool', tool: call }],
    };
    const messages = agent.messages.bind(agent);
    agent.messages = (id) => (id === 'cone-kitchen' ? [...messages(id), added] : messages(id));
    agent.emit('messages', 'cone-kitchen');
    return true;
  });
  await page.until(() => !!window.chatPart('#run-exit-only-t .run-toggle'));
  await expand(page, ['exit-only-t']);
  assert.equal(
    await page.evaluate(() => window.chatPart('#detail-exit-only-t swc-badge').textContent),
    'Exit 7'
  );
  assert.deepEqual(page.errors, []);
});

for (const color of ['light', 'dark']) {
  test(`bash results read in ${color}`, async (t) => {
    const page = await open(t, color);
    await expand(page, ['k-t16', 'k-t17']);
    await page.evaluate(() => {
      window.chatPart('#detail-k-t17 .result').scrollIntoView({ block: 'center' });
      return document.fonts.ready.then(() => true);
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await page.screenshot(new URL(`bash-result-${color}.png`, page.dir));
    assert.deepEqual(page.errors, []);
  });
}
