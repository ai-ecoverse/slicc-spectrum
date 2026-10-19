import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function settled(page) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => window.ready === true).catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function open(t) {
  const page = await chrome.page(t);
  const url = `/ui/?${new URLSearchParams({ delay: '20', color: 'light' })}`;
  await page.goto(url);
  if (!(await settled(page))) await page.goto(url);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 860,
    deviceScaleFactor: 2,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.until(() => innerWidth === 1280 && innerHeight === 860 && !!window.chatPart('.log'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  return page;
}

async function film(page) {
  const dir = new URL('frames/', page.dir);
  await mkdir(dir, { recursive: true });
  const frames = [];
  const writes = [];
  const off = chrome.cdp.on(({ method, params }) => {
    if (method !== 'Page.screencastFrame') return;
    const file = `${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ file, at: params.metadata.timestamp * 1000 });
    writes.push(writeFile(new URL(file, dir), Buffer.from(params.data, 'base64')));
    page.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  return async () => {
    await page.send('Page.stopScreencast').catch(() => {});
    off();
    await Promise.all(writes);
    await writeFile(new URL('frames.json', page.dir), JSON.stringify(frames));
    return frames.length;
  };
}

function record() {
  const seen = {
    turns: new Set(),
    runs: 0,
    steps: [],
    labels: [],
    lines: {},
  };
  const known = new Map();
  const label = (status) => {
    const root = status.shadowRoot;
    const line =
      root?.querySelector('.swc-ResponseStatus-headerTrailLine--enter .swc-ResponseStatus-label') ??
      root?.querySelector('.swc-ResponseStatus-headerTrailLine--settled .swc-ResponseStatus-label');
    return line?.textContent.trim() ?? '';
  };
  const frame = (now) => {
    const log = window.chatPart('.log');
    if (log) {
      for (const turn of log.querySelectorAll('swc-conversation-turn[data-id]'))
        seen.turns.add(turn.dataset.id);
      seen.runs = Math.max(seen.runs, log.querySelectorAll('slicc-tool-runs, .runs').length);
      const messages = window.model.agent.messages('cone-sliccy');
      const calls = messages.flatMap((message) =>
        message.role === 'assistant'
          ? message.parts.filter((part) => part.type === 'tool').map((part) => part.tool.id)
          : message.role === 'tool'
            ? [message.tool.id]
            : []
      );
      const steps = [...log.querySelectorAll('swc-response-status-step[id^="run-"]')].map((step) =>
        step.id.slice(4)
      );
      const missing = calls.filter((id) => !steps.includes(id));
      const doubled = steps.filter((id, index) => steps.indexOf(id) !== index);
      if (missing.length || doubled.length)
        seen.steps.push({ at: Math.round(now), missing: missing.length, doubled: doubled.length });
      for (const status of log.querySelectorAll('swc-response-status')) {
        const turn = status.closest('swc-conversation-turn')?.dataset.id ?? '';
        const text = label(status);
        const state = status.getAttribute('status');
        const line = status.shadowRoot?.querySelector(
          '.swc-ResponseStatus-headerTrailLine--enter .swc-ResponseStatus-label, .swc-ResponseStatus-headerTrailLine--settled .swc-ResponseStatus-label'
        );
        if (state === 'active' && line) {
          const box = line.getBoundingClientRect();
          const top = status.getBoundingClientRect().top;
          const key = `${Math.round((box.top - top) * 100) / 100}+${Math.round(box.height * 100) / 100}`;
          seen.lines[key] = (seen.lines[key] ?? 0) + 1;
        }
        const last = known.get(turn);
        if (!last || last.text !== text || last.state !== state) {
          known.set(turn, { text, state });
          seen.labels.push({ at: Math.round(now), turn, state, text });
        }
      }
    }
    window.replayFrame = requestAnimationFrame(frame);
  };
  window.replaySeen = seen;
  window.replayFrame = requestAnimationFrame(frame);
  return true;
}

function results() {
  cancelAnimationFrame(window.replayFrame);
  const seen = window.replaySeen;
  return { ...seen, turns: [...seen.turns], origin: performance.timeOrigin };
}

async function replay(page) {
  const before = await page.evaluate(() => window.model.agent.messages('cone-sliccy').length);
  await page.evaluate(() => window.watchShifts());
  await page.evaluate(record);
  const started = await page.evaluate(() => {
    void window.model.agent.send('cone-sliccy', 'Replay the long tool calls');
    return performance.timeOrigin + performance.now();
  });
  await page.within(120000, () => {
    const last = window.model.agent.messages('cone-sliccy').at(-1);
    return (
      last?.role === 'assistant' &&
      last.status === 'done' &&
      last.parts.some((part) => part.type === 'text' && part.text.startsWith('Round two is done'))
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const shifts = await page.evaluate(() => window.stopShifts());
  const seen = await page.evaluate(results);
  const messages = await page.evaluate(
    (from) =>
      window.model.agent
        .messages('cone-sliccy')
        .slice(from)
        .map((message) => ({
          id: message.id,
          role: message.role,
          parts: (message.parts ?? []).map((part) => part.type),
          calls: (message.parts ?? [])
            .filter((part) => part.type === 'tool')
            .map((part) => part.tool.id),
        })),
    before
  );
  await writeFile(
    new URL('replay.json', page.dir),
    JSON.stringify({ origin: seen.origin, started, shifts, seen, messages }, null, 2)
  );
  return { shifts, seen, messages };
}

const owners = (messages) => {
  const out = new Map();
  let anchor = null;
  for (const message of messages) {
    if (message.role !== 'assistant') {
      anchor = null;
      continue;
    }
    const toolOnly = message.calls.length > 0 && message.parts.every((part) => part === 'tool');
    if (toolOnly && anchor) {
      out.set(message.id, anchor);
      continue;
    }
    anchor = message.calls.length ? message.id : null;
  }
  return out;
};

test('past messages never move down while a reply streams long tool calls', async (t) => {
  const page = await open(t);
  const stop = await film(page);
  const { shifts } = await replay(page);
  const frames = await stop();
  assert.ok(frames > 0, 'the screencast recorded frames');
  assert.ok(
    shifts.some((move) => move.up < 0),
    'the transcript scrolled up as the reply grew'
  );
  assert.deepEqual(
    shifts.filter((move) => move.down > 0).slice(0, 8),
    [],
    `${shifts.filter((move) => move.down > 0).length} frames moved past messages down`
  );
});

test('each tool call shows once, as a step of its reply’s response status', async (t) => {
  const page = await open(t);
  const { seen, messages } = await replay(page);
  assert.equal(seen.runs, 0, 'tool calls never render as separate tool cards or clusters');
  assert.deepEqual(seen.steps.slice(0, 5), [], 'every call has exactly one step, in every frame');
  const calls = messages.flatMap((message) => message.calls);
  assert.equal(calls.length, 9);
  const steps = await page.evaluate(() =>
    [...window.chatPart('.log').querySelectorAll('swc-response-status-step[id^="run-"]')].map(
      (step) => [
        step.id.slice(4),
        step.dataset.tool,
        step.dataset.status,
        step.getAttribute('status'),
      ]
    )
  );
  for (const id of calls) {
    const found = steps.filter(([step]) => step === id);
    assert.equal(found.length, 1, `call ${id} has one step`);
    assert.equal(found[0][2], 'done');
    assert.equal(found[0][3], 'complete');
  }
});

test('the response status stays after the reply as complete, with the run’s label', async (t) => {
  const page = await open(t);
  const { messages } = await replay(page);
  const merged = owners(messages);
  const anchors = messages.filter(
    (message) => message.role === 'assistant' && message.calls.length && !merged.has(message.id)
  );
  assert.equal(anchors.length, 3, 'three replies carry tool calls once tool-only follow-ups join');
  const statuses = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const turn = window.chatPart(`.log swc-conversation-turn[data-id="${id}"]`);
        const found = [...(turn?.querySelectorAll('swc-response-status') ?? [])];
        return found.map((status) => ({
          state: status.getAttribute('status'),
          slot: status.getAttribute('slot'),
          steps: status.querySelectorAll('swc-response-status-step').length,
          label: status.querySelector('[slot="label"]')?.textContent.trim() ?? '',
        }));
      }),
    anchors.map((message) => message.id)
  );
  assert.deepEqual(
    statuses.map((list) => list.map(({ state, slot, steps }) => [state, slot, steps])),
    [[['complete', 'status', 2]], [['complete', 'status', 2]], [['complete', 'status', 5]]]
  );
  assert.equal(statuses[2][0].label, 'Rebuild the cache-key fixtures for every city');
});

test('tool-only follow-ups join the open response status instead of starting a turn', async (t) => {
  const page = await open(t);
  const { seen, messages } = await replay(page);
  const merged = owners(messages);
  assert.equal(merged.size, 5);
  const shown = [...merged.keys()].filter((id) => seen.turns.includes(id));
  assert.deepEqual(shown, [], 'no tool-only follow-up ever rendered as its own turn');
});

test('the response status keeps each label readable for a second before replacing it', async (t) => {
  const page = await open(t);
  const { seen } = await replay(page);
  const active = new Map();
  for (const entry of seen.labels) {
    if (entry.state !== 'active') continue;
    active.set(entry.turn, [...(active.get(entry.turn) ?? []), entry]);
  }
  assert.ok(active.size > 0, 'a response status was active during the replay');
  const quick = [...active.values()].flatMap((entries) =>
    entries.slice(1).flatMap((entry, index) => {
      const gap = entry.at - entries[index].at;
      return gap < 950
        ? [{ gap, from: entries[index].text.slice(0, 60), to: entry.text.slice(0, 60) }]
        : [];
    })
  );
  assert.deepEqual(
    quick.slice(0, 5),
    [],
    `${quick.length} header labels were replaced within a second`
  );
});

test('the status header keeps its label line still while the label rolls', async (t) => {
  const page = await open(t);
  const { seen } = await replay(page);
  assert.equal(Object.keys(seen.lines).length, 1, JSON.stringify(seen.lines));
});
