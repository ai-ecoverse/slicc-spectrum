import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', older: 'paged' })}`);
  await page.until(() => window.ready && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.agents = () => window.$('slicc-app', 'slicc-dock', 'slicc-agents');
    window.titles = (id) => [
      window.agents()?.shadowRoot.querySelector(`li[data-id="${id}"] .title`)?.textContent ?? null,
      window
        .$('slicc-app', 'header sp-picker')
        ?.querySelector(`sp-menu-item[value="${id}"] [slot=description]`)?.textContent ?? null,
    ];
    window.same = (id, title) =>
      JSON.stringify(window.titles(id)) === JSON.stringify([title, title]);
    return true;
  });
  await page.until(() => !!window.agents()?.shadowRoot.querySelector('li[data-id="cone-tides"]'));
  return page;
}

test('a paged cone whose window holds only verdicts or no prompt never reads No messages yet', async (t) => {
  const page = await open(t);
  assert.notEqual(await page.evaluate(() => window.model.agent.active()), 'cone-tides');
  const first = await page.evaluate(() => {
    const agent = window.model.agent;
    agent.paginate(Number.MAX_SAFE_INTEGER, 4, ['cone-tides']);
    const user = agent.messages('cone-tides').find((message) => message.role === 'user');
    agent.paginate(0, 4, ['cone-tides']);
    return user.text.trim().split('\n')[0].trim();
  });
  await page.until(() => window.model.agent.messages('cone-tides').length === 0);
  await page.until(() => window.same('cone-tides', 'Earlier messages'));

  const kept = await page.evaluate(() => {
    const agent = window.model.agent;
    agent.paginate(Number.MAX_SAFE_INTEGER, 4, ['cone-tides']);
    const all = agent.messages('cone-tides');
    const last = all.findLastIndex((message) => message.role === 'user');
    const keep = all.length - 1 - last;
    agent.paginate(keep, 4, ['cone-tides']);
    return keep;
  });
  assert.ok(kept > 0, String(kept));
  await page.until(
    (keep) =>
      window.model.agent.messages('cone-tides').length === keep &&
      window.model.agent.hasOlder('cone-tides'),
    kept
  );
  await page.until(() => window.same('cone-tides', 'Earlier messages'));

  await page.evaluate(async () => {
    const agent = window.model.agent;
    while (agent.hasOlder('cone-tides')) await agent.older('cone-tides');
    return true;
  });
  await page.until((title) => window.same('cone-tides', title), first);

  const [lone, empty] = await page.evaluate(async () => {
    const agent = window.model.agent;
    const lone = await agent.createCone('lick-only');
    agent.lick(lone.id, 'webhook', 'Deploy hook', 'Build 412 finished');
    const empty = await agent.createCone('brand-new');
    return [lone.id, empty.id];
  });
  await page.until((id) => window.same(id, 'Untitled chat'), lone);
  await page.until((id) => window.same(id, 'No messages yet'), empty);
  assert.deepEqual(page.errors, []);
});
