import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const laidOut = async () => {
  await window.app.updateComplete;
  const { dock } = window.app;
  const box = dock.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.right <= innerWidth &&
    Math.abs(dock.api.width - box.width) < 1 &&
    Math.abs(dock.api.height - box.height) < 1
  );
};

const saved = (ids) => {
  const layout = JSON.parse(localStorage.getItem(window.app.storageKey) ?? 'null');
  return ids.every((id) => id in (layout?.panels ?? {}));
};

const where = () =>
  window.app.dock.api.panels
    .filter((panel) => panel.id.startsWith('chat'))
    .map((panel) => {
      const rect = panel.group.element.getBoundingClientRect();
      return [panel.id, Math.round(rect.left), Math.round(rect.width)];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

async function arranged(t, agent = 'waiting', gone = false) {
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
  await page.until(laidOut);
  await page.until(saved, ['chat:cone-harbor', 'files']);
  if (gone) {
    const layout = await page.evaluate(() => {
      const key = window.app.storageKey;
      window.app.storage = null;
      const layout = JSON.parse(localStorage.getItem(key));
      const harbor = layout.panels['chat:cone-harbor'];
      layout.panels['chat:cone-gone'] = {
        ...harbor,
        id: 'chat:cone-gone',
        title: 'gone',
        params: { agent: 'cone-gone' },
      };
      const group = (node) =>
        node.type === 'leaf'
          ? node.data.views.includes('chat:cone-harbor')
            ? node.data
            : null
          : node.data.map(group).find(Boolean);
      group(layout.grid.root).views.push('chat:cone-gone');
      localStorage.setItem(key, JSON.stringify(layout));
      return Object.keys(layout.panels);
    });
    assert.ok(layout.includes('chat:cone-gone'));
  }
  const before = await page.evaluate(where);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.until(laidOut);
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
  await page.until(laidOut);
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

test('chat tabs stay once the line clears with no agent, and say they’re disconnected', async (t) => {
  const { page, before } = await arranged(t);
  await page.evaluate(() => {
    window.model.agent.setStarting(null);
    return true;
  });
  await page.until(() => window.app.dock.api.getPanel('chat:cone-harbor').api.isVisible);
  await page.until(
    () =>
      !!window.app.dock
        .content('chat:cone-harbor')
        ?.shadowRoot?.querySelector('[data-loading=disconnected]')
  );
  assert.deepEqual(await page.evaluate(where), before);
  assert.deepEqual(page.errors, []);
});

test('a boot where the agent only starts leaves Install / Update closed and says Starting in the header', async (t) => {
  const page = await chrome.page(t);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', updates: 'starting' })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.until(laidOut);
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

function helpers() {
  window.composerOf = (id) =>
    window.app.dock.content(id)?.shadowRoot?.querySelector('slicc-composer') ?? null;
  window.rowsIn = (id) =>
    [
      ...(window.composerOf(id)?.shadowRoot?.querySelectorAll('li.queued[data-mode=starting]') ??
        []),
    ].map((row) => row.querySelector('.text').textContent.trim());
  window.users = (id) =>
    window.model.agent
      .messages(id)
      .filter((message) => message.role === 'user')
      .map((message) => message.text);
  window.sendIn = (id, text) => {
    const composer = window.composerOf(id);
    composer.value = text;
    composer.send();
    return true;
  };
  window.reveal = (id) => {
    window.app.dock.api.getPanel(id).api.setActive();
    return true;
  };
  return true;
}

test('a prompt sent from a kept chat while the agent starts goes to that chat’s agent only', async (t) => {
  const { page } = await arranged(t);
  await page.evaluate(helpers);
  await page.evaluate(() => window.reveal('chat:cone-harbor'));
  await page.until(() => !!window.composerOf('chat:cone-harbor')?.hasUpdated);
  await page.evaluate(() => window.sendIn('chat:cone-harbor', 'Check the harbor tides'));
  await page.until(() => window.rowsIn('chat:cone-harbor').length === 1);
  await page.evaluate(() => window.reveal('chat:cone-sliccy'));
  await page.until(() => !!window.composerOf('chat:cone-sliccy')?.hasUpdated);
  assert.deepEqual(await page.evaluate(() => window.rowsIn('chat:cone-sliccy')), []);
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.users('cone-harbor').includes('Check the harbor tides'));
  assert.equal(
    await page.evaluate(() => window.users('cone-sliccy').includes('Check the harbor tides')),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('a prompt whose chat isn’t there once the agent starts is held with Put back, not sent elsewhere', async (t) => {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent: 'waiting' })}`);
  await page.until(() => window.ready === true && window.app.dock.has('chat'));
  await page.evaluate(helpers);
  await page.evaluate(() => {
    window.app.dock.open({
      id: 'chat:cone-gone',
      component: 'chat',
      title: 'gone',
      params: { agent: 'cone-gone' },
      position: { referencePanel: 'chat', direction: 'within' },
    });
    return true;
  });
  await page.until(() => !!window.composerOf('chat:cone-gone')?.hasUpdated);
  await page.evaluate(() => window.sendIn('chat:cone-gone', 'Ask the gone cone'));
  await page.until(() => window.rowsIn('chat:cone-gone').length === 1);
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  await page.until(
    () =>
      !!window
        .composerOf('chat:cone-sliccy')
        ?.shadowRoot?.querySelector('li.queued[data-held] [data-gone]')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const node = window
        .composerOf('chat:cone-sliccy')
        .shadowRoot.querySelector('li.queued[data-held]');
      return [
        node.querySelector('.text').textContent.trim(),
        node.querySelector('[data-gone]').textContent.trim(),
        !!node.querySelector('[data-action=restore-starting]'),
      ];
    }),
    ['Held: Ask the gone cone', ', Not sent: its conversation isn’t here anymore.', true]
  );
  await page.until(() => !window.app.dock.has('chat:cone-gone'));
  assert.equal(
    await page.evaluate(() =>
      window.model.agent
        .list()
        .some((agent) => window.users(agent.id).includes('Ask the gone cone'))
    ),
    false
  );
  assert.deepEqual(page.errors, []);
});

test('a chat tab whose cone is frozen while a starting line shows with cones listed closes', async (t) => {
  const page = await chrome.page(t);
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
    window.model.agent.setStarting('Seven is updating its agent.');
    return true;
  });
  await page.until(() => window.app.dock.has('chat:cone-harbor'));
  await page.evaluate(() => {
    window.model.agent.freeze('cone-harbor');
    return true;
  });
  await page.until(() => !window.app.dock.has('chat:cone-harbor'));
  assert.equal(await page.evaluate(() => window.app.dock.has('chat:cone-sliccy')), true);
  assert.deepEqual(page.errors, []);
});

test('a reload that only starts the agent closes the Install / Update panel a boot left in the saved layout', async (t) => {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', updates: 'boot' })}`);
  await page.until(
    () => window.ready === true && window.app.dock.api.getPanel('updates')?.params?.boot === true
  );
  await page.until(saved, ['updates']);
  await page.goto(
    `/ui/?${new URLSearchParams({ delay: '5', color: 'light', updates: 'starting' })}`
  );
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.until(() => !window.app.dock.has('updates'));
  await page.until(laidOut);
  assert.equal(await page.evaluate(() => window.app.dock.has('updates')), false);
  assert.deepEqual(page.errors, []);
});

test('Put back on a prompt held because its chat is gone brings back its text and its files', async (t) => {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', agent: 'waiting' })}`);
  await page.until(() => window.ready === true && window.app.dock.has('chat'));
  await page.evaluate(helpers);
  await page.evaluate(() => {
    window.app.dock.open({
      id: 'chat:cone-gone',
      component: 'chat',
      title: 'gone',
      params: { agent: 'cone-gone' },
      position: { referencePanel: 'chat', direction: 'within' },
    });
    return true;
  });
  await page.until(() => !!window.composerOf('chat:cone-gone')?.hasUpdated);
  await page.evaluate(() => {
    const composer = window.composerOf('chat:cone-gone');
    composer.attachments = [
      { id: 'g1', name: 'tides.csv', kind: 'text', mimeType: 'text/csv', size: 3, text: 'a,b' },
    ];
    window.sendIn('chat:cone-gone', 'Compare the tides');
    composer.attachments = [
      { id: 'g2', name: 'radar.txt', kind: 'text', mimeType: 'text/plain', size: 3, text: 'abc' },
    ];
    composer.send();
    return true;
  });
  await page.until(() => window.rowsIn('chat:cone-gone').length === 2);
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  const putBack = async (index) => {
    await page.until(
      (index) =>
        window
          .composerOf('chat:cone-sliccy')
          ?.shadowRoot?.querySelectorAll('li.queued[data-held] [data-action=restore-starting]')
          .length >
        1 - index,
      index
    );
    return page.evaluate(() => {
      const composer = window.composerOf('chat:cone-sliccy');
      composer.shadowRoot
        .querySelector('li.queued[data-held] [data-action=restore-starting]')
        .click();
      return [composer.value, composer.attachments.map((file) => [file.name, file.text])];
    });
  };
  assert.deepEqual(await putBack(0), ['Compare the tides', [['tides.csv', 'a,b']]]);
  assert.deepEqual(await putBack(1), [
    'Compare the tides',
    [
      ['tides.csv', 'a,b'],
      ['radar.txt', 'abc'],
    ],
  ]);
  assert.equal(
    await page.evaluate(
      () =>
        window
          .composerOf('chat:cone-sliccy')
          .shadowRoot.querySelectorAll('li.queued[data-mode=starting]').length
    ),
    0
  );
  assert.deepEqual(page.errors, []);
});

const disconnected = (id) => {
  const root = window.app.dock.content(id)?.shadowRoot;
  const field = root
    ?.querySelector('slicc-composer')
    ?.shadowRoot?.querySelector('swc-prompt-field');
  return {
    light: root?.querySelector('header [data-disconnected]')?.textContent.trim() ?? null,
    note: root?.querySelector('[data-loading=disconnected]')?.textContent.trim() ?? null,
    placeholder: field?.getAttribute('placeholder') ?? null,
    disabled: field?.hasAttribute('disabled') ?? null,
  };
};

test('a reload before the agent service lists anything keeps the chat tabs disconnected in place, and they connect where they are', async (t) => {
  const { page, before } = await arranged(t, 'disconnected');
  assert.equal(before.length, 2);
  assert.deepEqual(await page.evaluate(where), before);
  await page.evaluate(() => {
    window.app.dock.api.getPanel('chat:cone-harbor').api.setActive();
    return true;
  });
  await page.until(
    () =>
      !!window.app.dock
        .content('chat:cone-harbor')
        ?.shadowRoot?.querySelector('slicc-composer')
        ?.shadowRoot?.querySelector('swc-prompt-field')
  );
  assert.deepEqual(await page.evaluate(disconnected, 'chat:cone-harbor'), {
    light: 'Disconnected',
    note: 'The conversation shows up here once its agent connects.',
    placeholder: 'Waiting for the agent to connect…',
    disabled: true,
  });
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().length > 0);
  await page.until(laidOut);
  assert.deepEqual(await page.evaluate(where), before);
  await page.evaluate(() => {
    window.app.dock.api.getPanel('chat:cone-harbor').api.setActive();
    return true;
  });
  await page.until(
    () =>
      !window.app.dock
        .content('chat:cone-harbor')
        ?.shadowRoot?.querySelector('[data-disconnected], [data-loading=disconnected]')
  );
  assert.deepEqual(await page.evaluate(disconnected, 'chat:cone-harbor'), {
    light: null,
    note: null,
    placeholder: 'Message harbor',
    disabled: false,
  });
  assert.deepEqual(page.errors, []);
});

test('a chat tab whose agent comes up after the others stays disconnected until it does', async (t) => {
  const { page, before } = await arranged(t, 'disconnected');
  await page.evaluate(() => {
    window.model.agent.arrive('cone-sliccy');
    return true;
  });
  await page.until(() => window.model.agent.list().length === 1);
  await page.until(laidOut);
  assert.deepEqual(await page.evaluate(where), before);
  await page.evaluate(() => {
    window.app.dock.api.getPanel('chat:cone-harbor').api.setActive();
    return true;
  });
  await page.until(
    () =>
      !!window.app.dock
        .content('chat:cone-harbor')
        ?.shadowRoot?.querySelector('[data-loading=disconnected]')
  );
  await page.evaluate(() => {
    window.model.agent.arrive('cone-harbor');
    return true;
  });
  await page.until(
    () =>
      !window.app.dock
        .content('chat:cone-harbor')
        ?.shadowRoot?.querySelector('[data-loading=disconnected]')
  );
  assert.deepEqual(await page.evaluate(where), before);
  assert.deepEqual(page.errors, []);
});

const others = (list) => list.filter(([id]) => id !== 'chat:cone-gone');

for (const agent of ['waiting', 'disconnected']) {
  test(`a saved chat tab whose agent never comes closes once the ${agent} port is ready, and the ones that come stay`, async (t) => {
    const { page, before } = await arranged(t, agent, true);
    assert.deepEqual(
      before.map(([id]) => id),
      ['chat:cone-harbor', 'chat:cone-sliccy']
    );
    assert.deepEqual(
      (await page.evaluate(where)).map(([id]) => id),
      ['chat:cone-gone', 'chat:cone-harbor', 'chat:cone-sliccy']
    );
    await page.evaluate(() => {
      window.model.agent.arrive('cone-sliccy');
      return true;
    });
    await page.until(() => window.model.agent.list().length === 1);
    await page.until(laidOut);
    assert.deepEqual(
      await page.evaluate(() => [
        window.app.dock.has('chat:cone-gone'),
        window.app.dock.has('chat:cone-harbor'),
      ]),
      [true, true]
    );
    await page.evaluate(() => {
      window.model.agent.arrive('cone-harbor');
      return true;
    });
    await page.until(() => window.model.agent.list().length === 2);
    await page.evaluate(() => {
      window.app.dock.api.getPanel('chat:cone-harbor').api.setActive();
      return true;
    });
    await page.until(
      () =>
        !!window.app.dock
          .content('chat:cone-harbor')
          ?.shadowRoot?.querySelector('slicc-composer') &&
        !window.app.dock
          .content('chat:cone-harbor')
          .shadowRoot.querySelector('[data-loading=disconnected], [data-loading=starting]')
    );
    assert.equal(await page.evaluate(() => window.app.dock.has('chat:cone-gone')), true);
    await page.evaluate(() => {
      window.model.agent.arrive();
      return true;
    });
    await page.until(() => !window.app.dock.has('chat:cone-gone'));
    await page.until(laidOut);
    assert.deepEqual(others(await page.evaluate(where)), before);
    await page.until(
      () =>
        !('chat:cone-gone' in JSON.parse(localStorage.getItem(window.app.storageKey)).panels) &&
        'chat:cone-harbor' in JSON.parse(localStorage.getItem(window.app.storageKey)).panels
    );
    assert.deepEqual(page.errors, []);
  });
}

test('a chat tab closes when its agent, listed before, goes while others stay', async (t) => {
  const { page } = await arranged(t, 'disconnected');
  await page.evaluate(() => {
    window.model.agent.arrive();
    return true;
  });
  await page.until(() => window.model.agent.list().some((agent) => agent.id === 'cone-harbor'));
  await page.evaluate(() => {
    window.model.agent.freeze('cone-harbor');
    return true;
  });
  await page.until(() => !window.app.dock.has('chat:cone-harbor'));
  assert.equal(await page.evaluate(() => window.app.dock.has('chat:cone-sliccy')), true);
  assert.deepEqual(page.errors, []);
});
