import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const probeHtml = `<!DOCTYPE html><html><head></head><body>
<form id="add" action="cgi-bin/add?from=form" method="post"><input name="title" value="Ship it &amp; more"><button id="add-go">Add</button></form>
<form id="upload" action="cgi-bin/upload" method="post" enctype="multipart/form-data"><input name="note" value="tide"><button id="upload-go">Upload</button></form>
<form id="search" action="cgi-bin/search?old=1"><input name="q" value="high tide"><button id="search-go">Search</button></form>
<form id="plain" action="cgi-bin/plain" method="post" enctype="text/plain"><input name="line" value="ebb"><button id="plain-go">Plain</button></form>
<form id="away" action="https://example.invalid/away" method="post"><input name="x" value="1"><button id="away-go">Away</button></form>
<form id="mine" action="cgi-bin/mine" method="post" onsubmit="return false"><button id="mine-go">Mine</button></form>
<form id="delegated" action="cgi-bin/delegated" method="post"><button id="delegated-go">Delegated</button></form>
<form id="override" action="https://example.invalid/away"><button id="override-go" formaction="cgi-bin/override" formmethod="post">Override</button></form>
<script>
  window.loaded = Math.random().toString(36).slice(2);
  window.replies = [];
  document.addEventListener('slicc-cgi', async (event) => {
    const { response, error } = event.detail;
    replies.push({ form: event.target.id, status: response?.status ?? null, text: response ? await response.text() : null, error: error ? error.name : null });
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'delegated') event.preventDefault();
  });
  addEventListener('message', async (event) => {
    if (event.source !== parent || event.data?.type !== 'cgi-probe') return;
    let answer;
    try {
      answer = { value: await new Function('return (async () => {' + event.data.code + '})()')() };
    } catch (error) {
      answer = { error: error.name + ': ' + error.message };
    }
    parent.postMessage({ type: 'cgi-probe', key: event.data.key, ...answer }, '*');
  });
</script></body></html>`;

async function open(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.evaluate((html) => {
    const sprinkles = window.model.sprinkles;
    const list = sprinkles.list.bind(sprinkles);
    sprinkles.list = () => [
      ...list(),
      {
        id: 'cgi-probe',
        name: 'cgi-probe',
        title: 'Tide log',
        icon: 'hand',
        agentId: 'cone-sliccy',
        html,
      },
    ];
    window.b64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    window.unb64 = (text) =>
      text === null
        ? null
        : new TextDecoder().decode(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));
    const json = (status, value, more = []) => ({
      status,
      statusText: status === 200 ? 'OK' : '',
      headers: [['Content-Type', 'application/json'], ['X-Loose-Ends', '2'], ...more],
      body: window.b64(JSON.stringify(value)),
      done: true,
      stream: null,
    });
    const text = (status, body, more = []) => ({
      status,
      statusText: '',
      headers: [['Content-Type', 'text/plain'], ...more],
      body: window.b64(body),
      done: true,
      stream: null,
    });
    const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let streams = 0;
    window.cgiLog = [];
    window.cgiStreams = {};
    const opened = (head, reads, close) => {
      const stream = `stream-${++streams}`;
      window.cgiStreams[stream] = { reads, close };
      return { ...head, done: false, stream };
    };
    window.cgiScripts = {
      items: () =>
        opened(
          {
            status: 200,
            statusText: 'OK',
            headers: [
              ['Content-Type', 'application/json'],
              ['X-Loose-Ends', '2'],
            ],
            body: window.b64('{"ok":true,"updated":"t1",'),
          },
          [
            {
              body: window.b64('"tasks":[{"id":"le-ship","title":"Ship the panel"}]}\n'),
              done: true,
            },
          ]
        ),
      done: (request) =>
        json(200, { ok: true, updated: 't2', got: JSON.parse(window.unb64(request.body)) }),
      tick: () =>
        opened(
          { status: 200, statusText: 'OK', headers: [['Content-Type', 'text/plain']], body: '' },
          ['one\n', 'two\n', 'three\n'].map((part, index, all) => ({
            body: window.b64(part),
            done: index === all.length - 1,
          }))
        ),
      slow: () => {
        let release;
        const closed = new Promise((resolve) => {
          release = resolve;
        });
        return opened(
          {
            status: 200,
            statusText: 'OK',
            headers: [['Content-Type', 'text/plain']],
            body: window.b64('first'),
          },
          [closed.then(() => ({ body: '', done: true }))],
          release
        );
      },
      quiet: () => text(204, ''),
      moved: () => text(302, '', [['Location', 'items']]),
      odd: () => text(102, ''),
      broken: () => {
        throw new Error('the worker went away');
      },
      add: () => text(303, '', [['Location', '../']]),
      upload: () => text(200, 'stored'),
      search: () => text(200, 'found'),
      plain: () => text(200, 'noted'),
      override: () => text(200, 'overridden'),
    };
    const call = sprinkles.call.bind(sprinkles);
    sprinkles.call = async (id, method, args) => {
      if (!['cgi', 'cgiRead', 'cgiClose'].includes(method)) return call(id, method, args);
      window.cgiLog.push({ id, method, args: structuredClone(args) });
      const script = method === 'cgi' && window.cgiScripts[args[0].path.split('/')[0]];
      if (script) return script(args[0]);
      const stream = method !== 'cgi' && window.cgiStreams[args[0]];
      if (stream && method === 'cgiClose') {
        stream.close?.();
        return null;
      }
      if (stream) {
        await later(20);
        return stream.reads.shift();
      }
      return call(id, method, args);
    };
    window.mount = (patch = {}) => {
      const element = document.createElement('slicc-sprinkle');
      element.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:300px;z-index:9';
      element.sprinkle = 'cgi-probe';
      Object.assign(element, patch);
      if (!element.model) element.model = window.model;
      document.body.append(element);
      return element;
    };
    window.probe = (element, code) =>
      new Promise((resolve) => {
        const frame = element.shadowRoot?.querySelector('iframe');
        if (!frame?.contentWindow) return resolve(null);
        const key = Math.random();
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== 'cgi-probe') return;
          if (event.data.key !== key) return;
          removeEventListener('message', listen);
          resolve(event.data);
        };
        addEventListener('message', listen);
        frame.contentWindow.postMessage({ type: 'cgi-probe', key, code }, '*');
        setTimeout(() => {
          removeEventListener('message', listen);
          resolve(null);
        }, 2000);
      });
    window.probeElement = window.mount();
    return true;
  }, probeHtml);
  await page.until(async () => (await window.probe(window.probeElement, 'return 1'))?.value === 1);
  const run = async (code, element = 'probeElement') => {
    const answer = await page.evaluate(
      (code, element) => window.probe(window[element], code),
      code,
      element
    );
    assert.ok(answer, `no answer to ${code}`);
    if (answer.error) return { error: answer.error };
    return answer.value;
  };
  const log = (method) =>
    page.evaluate((method) => window.cgiLog.filter((entry) => entry.method === method), method);
  return { page, run, log };
}

test('a sprinkle fetches its own cgi-bin/ like the loose-ends panel, as a streamed Response', async (t) => {
  const { page, run, log } = await open(t);
  const listed = await run(`
    const res = await fetch('cgi-bin/items', { method: 'GET', cache: 'no-store' });
    return { status: res.status, ok: res.ok, header: res.headers.get('x-loose-ends'), type: res.headers.get('content-type'), url: res.url, data: await res.json() };`);
  assert.deepEqual(
    { ...listed, url: new URL(listed.url).pathname },
    {
      status: 200,
      ok: true,
      header: '2',
      type: 'application/json',
      url: '/ui/cgi-bin/items',
      data: { ok: true, updated: 't1', tasks: [{ id: 'le-ship', title: 'Ship the panel' }] },
    }
  );
  const done = await run(`
    const res = await fetch('cgi-bin/done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'le-ship' }), cache: 'no-store' });
    return { header: res.headers.get('x-loose-ends'), data: await res.json() };`);
  assert.deepEqual(done, {
    header: '2',
    data: { ok: true, updated: 't2', got: { id: 'le-ship' } },
  });
  const [get, post] = await log('cgi');
  assert.equal(get.id, 'cgi-probe');
  assert.deepEqual(
    { ...get.args[0], headers: Object.fromEntries(get.args[0].headers) },
    {
      method: 'GET',
      path: 'items',
      query: '',
      headers: {
        accept: '*/*',
        'accept-language': get.args[0].headers.find(([name]) => name === 'accept-language')?.[1],
      },
      body: null,
    }
  );
  assert.equal(post.args[0].method, 'POST');
  assert.equal(post.args[0].path, 'done');
  assert.ok(
    post.args[0].headers.some(
      ([name, value]) => name === 'content-type' && value === 'application/json'
    )
  );
  assert.equal(
    await page.evaluate((body) => window.unb64(body), post.args[0].body),
    '{"id":"le-ship"}'
  );
  assert.deepEqual(
    (await log('cgiRead')).map((entry) => [entry.id, entry.args]),
    [['cgi-probe', ['stream-1']]]
  );

  const canned = await run(`
    const res = await fetch('./cgi-bin/item/le%20foo?x=1&y=a%20b#top', { method: 'PUT', body: 'tide' });
    return { status: res.status, dummy: res.headers.get('x-slicc-cgi'), data: await res.json() };`);
  assert.deepEqual(canned, {
    status: 200,
    dummy: 'dummy',
    data: {
      ok: true,
      method: 'PUT',
      path: 'item/le%20foo',
      query: 'x=1&y=a%20b',
      type: 'text/plain;charset=UTF-8',
      body: 'tide',
    },
  });

  const parts = await run(`
    const reader = (await fetch('cgi-bin/tick')).body.getReader();
    const parts = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return parts;
      parts.push(new TextDecoder().decode(value));
    }`);
  assert.deepEqual(parts, ['one\n', 'two\n', 'three\n']);
  assert.equal(await run(`return (await fetch('cgi-bin/tick')).text();`), 'one\ntwo\nthree\n');

  const empty = await run(`
    const quiet = await fetch('cgi-bin/quiet', { method: 'DELETE' });
    const head = await fetch('cgi-bin/items', { method: 'HEAD' });
    return { quiet: [quiet.status, quiet.body], head: [head.status, head.body, head.headers.get('x-loose-ends')] };`);
  assert.deepEqual(empty, { quiet: [204, null], head: [200, null, '2'] });
  await page.until(() =>
    window.cgiLog.some((entry) => entry.method === 'cgiRead' && entry.args[0] === 'stream-4')
  );

  const moved = await run(`
    const followed = await fetch('cgi-bin/moved', { method: 'POST', body: 'x' });
    const manual = await fetch('cgi-bin/moved', { redirect: 'manual' });
    let refused;
    try {
      await fetch('cgi-bin/moved', { redirect: 'error' });
    } catch (error) {
      refused = error.name;
    }
    return { followed: [followed.status, followed.redirected, new URL(followed.url).pathname, (await followed.json()).ok], manual: [manual.status, manual.headers.get('location')], refused };`);
  assert.deepEqual(moved, {
    followed: [200, true, '/ui/cgi-bin/items', true],
    manual: [302, 'items'],
    refused: 'TypeError',
  });
  const again = (await log('cgi')).filter((entry) => entry.args[0].path === 'items').at(-1);
  assert.equal(again.args[0].method, 'GET');
  assert.equal(again.args[0].body, null);

  const failed = await run(`
    const name = (promise) => promise.then(() => 'resolved', (error) => error.name + ': ' + error.message);
    return { odd: await name(fetch('cgi-bin/odd')), broken: await name(fetch('cgi-bin/broken')), aborted: await name(fetch('cgi-bin/items', { signal: AbortSignal.abort() })) };`);
  assert.match(failed.odd, /^TypeError: /);
  assert.equal(failed.broken, 'TypeError: the worker went away');
  assert.match(failed.aborted, /^AbortError: /);

  const aborted = await run(`
    const controller = new AbortController();
    const reader = (await fetch('cgi-bin/slow', { signal: controller.signal })).body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    const after = await reader.read().then(() => 'read', (error) => error.name);
    const canceled = await fetch('cgi-bin/slow');
    await canceled.body.cancel();
    return { first, after };`);
  assert.deepEqual(aborted, { first: 'first', after: 'AbortError' });
  await page.until(() => window.cgiLog.filter((entry) => entry.method === 'cgiClose').length === 2);
  const closes = (await log('cgiClose')).map((entry) => [entry.id, entry.args[0]]);
  const slow = (await log('cgi')).filter((entry) => entry.args[0].path === 'slow').length;
  assert.equal(slow, 2);
  assert.deepEqual(
    closes.map(([id]) => id),
    ['cgi-probe', 'cgi-probe']
  );
  assert.equal(new Set(closes.map(([, stream]) => stream)).size, 2);

  const before = (await log('cgi')).length;
  const others = await run(`
    const blob = URL.createObjectURL(new Blob(['from a blob']));
    return [
      await (await fetch('data:text/plain,hello')).text(),
      await (await fetch(new Request('data:text/plain,request'))).text(),
      await (await fetch(blob)).text(),
      fetch.name,
    ];`);
  assert.deepEqual(others, ['hello', 'request', 'from a blob', 'fetch']);
  assert.equal((await log('cgi')).length, before);
  assert.deepEqual(page.errors, []);
});

test('forms under cgi-bin/ post through the bridge, and no form navigates the frame', async (t) => {
  const { page, run, log } = await open(t);
  assert.equal(
    await page.evaluate(() =>
      window.probeElement.shadowRoot.querySelector('iframe').getAttribute('sandbox')
    ),
    'allow-scripts allow-forms'
  );
  const loaded = await run('return window.loaded;');
  const request = async (path) => {
    await page.until((path) => window.cgiLog.some((entry) => entry.args[0].path === path), path);
    const entry = (await log('cgi')).find((item) => item.args[0].path === path);
    const type = entry.args[0].headers.find(([name]) => name === 'content-type')?.[1] ?? null;
    const body = await page.evaluate((body) => window.unb64(body), entry.args[0].body);
    return { method: entry.args[0].method, query: entry.args[0].query, type, body };
  };

  await run(`document.getElementById('upload-go').click();`);
  const upload = await request('upload');
  assert.equal(upload.method, 'POST');
  assert.match(upload.type, /^multipart\/form-data; boundary=/);
  assert.match(upload.body, /name="note"\r\n\r\ntide\r\n/);

  await run(`document.getElementById('search-go').click();`);
  assert.deepEqual(await request('search'), {
    method: 'GET',
    query: 'q=high+tide',
    type: null,
    body: null,
  });

  await run(`document.getElementById('plain-go').click();`);
  assert.deepEqual(await request('plain'), {
    method: 'POST',
    query: '',
    type: 'text/plain',
    body: 'line=ebb\r\n',
  });

  await run(`document.getElementById('override-go').click();`);
  assert.equal((await request('override')).method, 'POST');

  await run(`
    document.getElementById('away-go').click();
    document.getElementById('mine-go').click();
    document.getElementById('delegated-go').click();
    document.getElementById('away').submit();
    document.getElementById('search').querySelector('input').value = 'low tide';
    document.getElementById('search').submit();`);
  await page.until(
    () => window.cgiLog.filter((entry) => entry.args[0].path === 'search').length === 2
  );
  assert.equal(
    (await log('cgi')).filter((entry) => entry.args[0].path === 'search').at(-1).args[0].query,
    'q=low+tide'
  );
  await page.until(
    async () => (await window.probe(window.probeElement, 'return replies.length'))?.value === 5
  );
  const replies = await run('return replies;');
  assert.deepEqual(replies.map((reply) => [reply.form, reply.status, reply.text]).sort(), [
    ['override', 200, 'overridden'],
    ['plain', 200, 'noted'],
    ['search', 200, 'found'],
    ['search', 200, 'found'],
    ['upload', 200, 'stored'],
  ]);
  assert.equal(await run('return window.loaded;'), loaded);
  assert.deepEqual(
    (await log('cgi'))
      .map((entry) => entry.args[0].path)
      .filter((path) => ['mine', 'delegated', 'away'].includes(path)),
    []
  );

  const frame = await page.evaluate(() => {
    window.oldFrame = window.probeElement.shadowRoot.querySelector('iframe');
    return true;
  });
  assert.ok(frame);
  await run(`document.getElementById('add-go').click();`);
  assert.deepEqual(await request('add'), {
    method: 'POST',
    query: 'from=form',
    type: 'application/x-www-form-urlencoded',
    body: 'title=Ship+it+%26+more',
  });
  await page.until(
    () => window.probeElement.shadowRoot.querySelector('iframe') !== window.oldFrame
  );
  await page.until(async () => (await window.probe(window.probeElement, 'return 1'))?.value === 1);
  assert.notEqual(await run('return window.loaded;'), loaded);
  assert.deepEqual(page.errors, []);
});

async function readOnly(page, run, log, element) {
  const answer = await run(
    `
    const get = await fetch('cgi-bin/items');
    const head = await fetch('cgi-bin/items', { method: 'HEAD' });
    const post = await fetch('cgi-bin/done', { method: 'POST', body: '{}' });
    const form = document.getElementById('add');
    form.submit();
    await new Promise((resolve) => form.addEventListener('slicc-cgi', resolve, { once: true }));
    return { get: [get.status, (await get.json()).ok], head: head.status, post: [post.status, post.statusText, await post.text()], form: replies.at(-1) };`,
    element
  );
  assert.deepEqual(answer, {
    get: [200, true],
    head: 200,
    post: [
      403,
      'Forbidden',
      'This sprinkle is read-only here, so its cgi-bin/ only answers GET and HEAD.\n',
    ],
    form: {
      form: 'add',
      status: 403,
      text: 'This sprinkle is read-only here, so its cgi-bin/ only answers GET and HEAD.\n',
      error: null,
    },
  });
  assert.deepEqual(
    (await log('cgi')).map((entry) => [entry.id, entry.args[0].method, entry.args[0].path]),
    [
      ['cgi-probe', 'GET', 'items'],
      ['cgi-probe', 'HEAD', 'items'],
    ]
  );
  assert.deepEqual(page.errors, []);
}

test('a read-only frame only reads its cgi-bin/, and a guest seat gets none', async (t) => {
  const { page, run, log } = await open(t);
  await page.evaluate(() => {
    window.readOnly = window.mount({ readonly: true });
    const seat = { id: 'seat-1', agentId: 'cone-sliccy', label: 'Seat 1' };
    window.guest = window.mount({ model: Object.create(window.model, { seat: { value: seat } }) });
    return true;
  });
  await page.until(async () => (await window.probe(window.readOnly, 'return 1'))?.value === 1);
  await page.until(async () => (await window.probe(window.guest, 'return 1'))?.value === 1);
  await readOnly(page, run, log, 'readOnly');
  const guest = await run(
    `const res = await fetch('cgi-bin/items'); return [res.status, res.statusText, await res.text()];`,
    'guest'
  );
  assert.deepEqual(guest, [403, 'Forbidden', 'A guest seat has no cgi-bin/.\n']);
  assert.equal((await log('cgi')).length, 2);
});

test('a watch-only frame only reads its cgi-bin/', async (t) => {
  const { page, run, log } = await open(t, { readonly: 'version' });
  await readOnly(page, run, log, 'probeElement');
});
