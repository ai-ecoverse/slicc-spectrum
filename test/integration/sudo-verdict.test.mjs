import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, scenario) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?delay=0&color=light&approvals=${scenario}`);
  await page.until(() => window.ready === true);
  await page.evaluate(() => {
    window.approvals = () => window.$('slicc-app', 'slicc-approvals');
    window.card = () => {
      const root = window.approvals().shadowRoot;
      return {
        verdict: root.querySelector('[data-verdict]')?.textContent ?? null,
        decision: root.querySelector('[data-verdict]')?.dataset.verdict ?? null,
        actions: [...root.querySelectorAll('[slot=button]')].map((button) => [
          button.dataset.action,
          button.textContent.trim(),
        ]),
        hint: !!root.querySelector('.hint:not([data-allow-hint])'),
        rules: !!root.querySelector('[data-secret-rules]'),
      };
    };
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-action=once]'));
  await page.until(() => window.approvals().shadowRoot.activeElement?.dataset.action === 'deny');
  await new Promise((resolve) => setTimeout(resolve, 600));
  return page;
}

const denied = {
  verdict: 'The automatic check would deny this: it looks high-risk.',
  decision: 'deny',
  actions: [
    ['deny', 'Deny'],
    ['once', 'Allow anyway (once)'],
  ],
  hint: false,
  rules: false,
};

for (const always of [false, true]) {
  test(`judge-denied sudo offers one override and refuses always when always is ${always}`, async (t) => {
    const page = await open(t, 'judge-denied');
    if (always) {
      await page.evaluate(() => {
        const port = window.model.approvals;
        const approval = port.list()[0];
        port.end(approval.id, 'withdrawn');
        port.raise({ ...approval, id: 'sudo-denied-always', always: true });
        return true;
      });
      await page.until(
        () =>
          !!window
            .approvals()
            .shadowRoot.querySelector('[data-approval=sudo-denied-always] [data-action=once]')
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    assert.deepEqual(await page.evaluate(() => window.card()), denied);
    await page.evaluate(() =>
      window
        .approvals()
        .decide(window.model.approvals.list()[0], 'always')
        .then(() => true)
    );
    assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), []);
    await page.evaluate(() => {
      window.approvals().shadowRoot.querySelector('[data-action=once]').click();
      return true;
    });
    await page.until(() => window.model.approvals.decisions.length === 1);
    assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
      [always ? 'sudo-denied-always' : 'sudo-judge-denied', 'once'],
    ]);
    assert.deepEqual(page.errors, []);
  });
}

test('denied sudo keeps the secret-rules notice and denies normally', async (t) => {
  const page = await open(t, 'judge-denied');
  await page.evaluate(() => {
    const port = window.model.approvals;
    const approval = port.list()[0];
    port.end(approval.id, 'withdrawn');
    port.raise({
      ...approval,
      id: 'sudo-denied-rules',
      command: 'cp harbor.toml /etc/fnox/config.toml',
      always: true,
    });
    return true;
  });
  await page.until(() => !!window.approvals().shadowRoot.querySelector('[data-secret-rules]'));
  assert.deepEqual(await page.evaluate(() => window.card()), { ...denied, rules: true });
  await page.press('Escape');
  await page.until(() => window.model.approvals.decisions.length === 1);
  assert.deepEqual(await page.evaluate(() => window.model.approvals.decisions), [
    ['sudo-denied-rules', 'deny'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('normal sudo and guest verdict actions stay unchanged', async (t) => {
  const page = await open(t, 'agent');
  assert.deepEqual(await page.evaluate(() => window.card()), {
    verdict: null,
    decision: null,
    actions: [
      ['deny', 'Deny'],
      ['always', 'Always allow'],
      ['once', 'Allow once'],
    ],
    hint: true,
    rules: false,
  });
  await page.goto('/ui/?delay=0&color=light&approvals=guest');
  await page.until(() => window.ready === true);
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', '[data-verdict=allow]'));
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'slicc-approvals', '[data-verdict]').textContent
    ),
    'The automatic check would allow this: it asks for an edit inside the shared folder.'
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-approvals', '[data-action=deny]').click();
    return true;
  });
  await page.until(() => !!window.$('slicc-app', 'slicc-approvals', '[data-verdict=deny]'));
  assert.deepEqual(
    await page.evaluate(() => {
      const root = window.$('slicc-app', 'slicc-approvals').shadowRoot;
      return [
        root.querySelector('[data-verdict]').textContent,
        root.querySelector('[data-action=once]')?.textContent.trim(),
      ];
    }),
    [
      'The automatic check would deny this: guests may not reach hosts outside the session.',
      'Allow once',
    ]
  );
  assert.deepEqual(page.errors, []);
});
