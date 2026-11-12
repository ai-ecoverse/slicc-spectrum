import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

const where = () =>
  window.app.dock.api.panels
    .filter((panel) => panel.id.startsWith('chat'))
    .map((panel) => {
      const rect = panel.group.element.getBoundingClientRect();
      return [panel.id, Math.round(rect.left), Math.round(rect.width)];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

async function arranged(t, agent = 'waiting') {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`);
  await page.until(() => window.ready === true && window.app.dock.has('chat:cone-sliccy'));
  await page.evaluate(() => {
    window.app.dock.open({
      id: 'chat:cone-harbor',
      component: 'chat',
      title: 'harbor',
      params: { agent: 'cone-harbor' },
      position: { referencePanel: 'chat:cone-sliccy', direction: 'within' },
    });
    window.app.dock.open({
      id: 'files',
      component: 'files',
      title: 'Files',
      position: { referencePanel: 'chat:cone-sliccy', direction: 'right' },
    });
    return true;
  });
  await page.until(() => window.app.dock.has('chat:cone-harbor') && window.app.dock.has('files'));
  await settle();
  const before = await page.evaluate(where);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await settle();
  return { page, before };
}

const shown = () => {
  const root = (id) => window.app.dock.content(id)?.shadowRoot ?? null;
  const text = (node) => node?.textContent.trim() ?? null;
  return {
    chat: text(root('chat:cone-harbor')?.querySelector('[data-loading=starting]')),
    agents: text(root('agents')?.querySelector('[data-empty=starting]')),
    freezer: text(root('freezer')?.querySelector('[data-empty=starting]')),
    bar: text(root('freezer')?.querySelector('.bar > span')),
  };
};

test('a reload while the agent starts keeps the chat tabs where they were, and they stay there once it arrives', async (t) => {
  const { page, before } = await arranged(t);
  assert.equal(before.length, 2);
  assert.deepEqual(await page.evaluate(where), before);
  assert.equal(await page.evaluate(() => window.app.dock.has('chat')), false);
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  await settle();
  assert.deepEqual(await page.evaluate(where), before);
  assert.deepEqual(page.errors, []);
});

test('while the agent starts, a kept chat, Agents and the Freezer say so, and the notes go once it arrives', async (t) => {
  const { page } = await arranged(t);
  await page.evaluate(() => {
    window.app.show('freezer');
    return true;
  });
  await page.until(() => !!window.app.dock.content('freezer')?.shadowRoot);
  await page.until(() => window.app.dock.api.getPanel('chat:cone-harbor').api.isVisible);
  assert.deepEqual(await page.evaluate(shown), {
    chat: 'The conversation shows up here once the agent starts.',
    agents: 'The agent shows up here once it starts.',
    freezer: 'Conversations show up here once the agent starts.',
    bar: 'Starting…',
  });
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  const gone = (ids) =>
    !ids.some(
      (id) =>
        !!window.app.dock
          .content(id)
          ?.shadowRoot?.querySelector('[data-loading=starting], [data-empty=starting]')
    );
  await page.until(gone, ['chat:cone-harbor', 'freezer']);
  await page.evaluate(() => {
    window.app.show('agents');
    return true;
  });
  await page.until(gone, ['agents']);
  assert.deepEqual(page.errors, []);
});

test('chat tabs of agents that are gone close once the line clears', async (t) => {
  const { page } = await arranged(t);
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(() => !window.app.dock.api.panels.some((panel) => panel.id.startsWith('chat:')));
  assert.deepEqual(page.errors, []);
});

test('a boot where the agent only starts leaves Install / Update closed and says Starting in the header', async (t) => {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', updates: 'starting' })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await settle();
  assert.deepEqual(
    await page.evaluate(() => [
      window.model.updates.ready(),
      window.model.updates.opensAtBoot(),
      window.app.dock.has('updates'),
      window
        .$('slicc-app', '[data-updates]')
        ?.getAttribute('accessible-label')
        ?.replace('Install / Update: ', ''),
    ]),
    [false, false, false, 'starting']
  );
  assert.deepEqual(page.errors, []);
});
