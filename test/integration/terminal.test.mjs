import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function mounted(t, options = {}, attributes = {}) {
  const page = await chrome.page(t);
  await page.goto('/');
  await page.until(() => typeof window.mount === 'function');
  const size = await page.evaluate((o, a) => window.mount(o, a), options, attributes);
  return { page, size };
}

const screen = () => document.querySelector('slicc-terminal .term-grid')?.textContent ?? '';
const received = () => window.backend.text();

test('the element mounts and renders the prompt from the backend', async (t) => {
  const { page, size } = await mounted(t);
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid')?.textContent.includes('fake:~$')
  );

  assert.ok(size.cols > 40 && size.rows > 10, JSON.stringify(size));
  assert.ok(chrome.requests.includes('/dist/wterm.wasm'), chrome.requests.join());
  assert.deepEqual(
    chrome.requests.filter((path) => path.startsWith('/node_modules/')),
    []
  );
  assert.deepEqual(await page.evaluate(() => window.backend.sizes), [size]);
  assert.equal(await page.evaluate(() => window.backend.opened), 1);
  const prompt = await page.evaluate(() =>
    [...document.querySelector('slicc-terminal .term-row').querySelectorAll('span')]
      .slice(0, 3)
      .map((span) => [
        span.textContent,
        getComputedStyle(span).color,
        getComputedStyle(span).fontWeight,
      ])
  );
  assert.deepEqual(prompt, [
    ['fake', 'rgb(106, 153, 85)', '700'],
    [':', 'rgb(212, 212, 212)', '400'],
    ['~', 'rgb(86, 156, 214)', '700'],
  ]);
  assert.deepEqual(page.errors, []);
});

test('typed keys reach the backend as bytes, including control keys and paste', async (t) => {
  const { page } = await mounted(t, { echo: true });
  await page.evaluate(() => window.terminal.focus());
  await page.type('ls -la');
  await page.press('Enter');
  await page.press('ArrowUp');
  await page.press('ArrowLeft');
  await page.press('Tab');
  await page.press('Backspace');
  await page.press('Escape');
  await page.press('d', 'ctrl');
  await page.press('l', 'ctrl');
  await page.insert('grüß 🖖');
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'pasted\ntext');
    const target = document.querySelector('slicc-terminal textarea');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  });
  await page.until(() => window.backend.text().endsWith('text'));

  assert.equal(
    await page.evaluate(received),
    'ls -la\r\x1b[A\x1b[D\t\x7f\x1b\x04\x0cgrüß 🖖pasted\ntext'
  );
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('fake:~$ ls -la')
  );
  await page.evaluate(() => window.backend.emit('\x1b[?2004h'));
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'bracketed');
    const target = document.querySelector('slicc-terminal textarea');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  });
  await page.until(() => window.backend.text().endsWith('\x1b[201~'));
  assert.ok((await page.evaluate(received)).endsWith('\x1b[200~bracketed\x1b[201~'));
  assert.deepEqual(page.errors, []);
});

test('backend output with colors and cursor movement renders', async (t) => {
  const { page } = await mounted(t, {}, { cols: '60', rows: '12' });
  await page.evaluate(() => {
    const out = [
      '\x1b[2J\x1b[H',
      '\x1b[31mred\x1b[0m \x1b[1;32mbold green\x1b[0m \x1b[4;34munderlined blue\x1b[0m',
      '\x1b[5;20H\x1b[38;2;255;128;0mtruecolor at 5,20\x1b[0m',
      '\x1b[3;1H\x1b[7m reverse \x1b[0m \x1b[48;5;22m 256-color bg \x1b[0m',
      '\x1b[5;1Hleft\x1b[5;20H',
      '\x1b[10;1Habcdef\x1b[3D\x1b[KXY',
    ];
    window.backend.emit(out.join(''));
  });
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('abcXY')
  );

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('slicc-terminal .term-row')].map((row) =>
      row.textContent.trimEnd()
    )
  );
  assert.equal(rows.length, 12);
  assert.equal(rows[0], 'red bold green underlined blue');
  assert.equal(rows[2], ' reverse   256-color bg');
  assert.equal(rows[4], `left${' '.repeat(15)}truecolor at 5,20`);
  assert.equal(rows[9], 'abcXY');

  const styles = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('slicc-terminal .term-row span')];
    const style = (text) => {
      const span = spans.find((s) => s.textContent === text);
      const computed = getComputedStyle(span);
      return {
        color: computed.color,
        background: computed.backgroundColor,
        weight: computed.fontWeight,
        decoration: computed.textDecorationLine,
      };
    };
    return {
      red: style('red'),
      green: style('bold green'),
      blue: style('underlined blue'),
      truecolor: style('truecolor at 5,20'),
      bg: style(' 256-color bg '),
    };
  });
  assert.equal(styles.red.color, 'rgb(244, 71, 71)');
  assert.deepEqual([styles.green.color, styles.green.weight], ['rgb(106, 153, 85)', '700']);
  assert.deepEqual([styles.blue.color, styles.blue.decoration], ['rgb(86, 156, 214)', 'underline']);
  assert.equal(styles.truecolor.color, 'rgb(255, 153, 0)');
  assert.equal(styles.bg.background, 'rgb(0, 51, 0)');

  const cursor = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('slicc-terminal .term-row')];
    const row = rows.findIndex((r) => r.querySelector('.term-cursor'));
    const before = [...rows[row].querySelector('.term-cursor').parentNode.childNodes];
    const index = before.indexOf(rows[row].querySelector('.term-cursor'));
    const col = before.slice(0, index).reduce((sum, node) => sum + node.textContent.length, 0);
    return { row, col };
  });
  assert.deepEqual(cursor, { row: 9, col: 5 });
  await page.screenshot(new URL('colors.png', page.dir));
  assert.deepEqual(page.errors, []);
});

test('resize propagates rows and cols to the backend', async (t) => {
  const { page, size } = await mounted(t);
  await page.evaluate(() => {
    document.querySelector('slicc-terminal').style.height = '200px';
    document.getElementById('stage').style.width = '400px';
  });
  await page.until((initial) => {
    const last = window.backend.sizes.at(-1);
    return last.cols < initial.cols && last.rows < initial.rows;
  }, size);
  const auto = await page.evaluate(() => window.backend.sizes.at(-1));
  assert.deepEqual(
    auto,
    await page.evaluate(() => ({ cols: window.terminal.cols, rows: window.terminal.rows }))
  );

  const events = await page.evaluate(async () => {
    const seen = [];
    window.terminal.addEventListener('resize', ({ detail }) => seen.push(detail));
    window.terminal.resize(100, 30);
    await new Promise(requestAnimationFrame);
    return seen;
  });
  assert.deepEqual(events, [{ cols: 100, rows: 30 }]);
  assert.deepEqual(await page.evaluate(() => window.backend.sizes.at(-1)), { cols: 100, rows: 30 });
  assert.equal(
    await page.evaluate(() => document.querySelectorAll('slicc-terminal .term-row').length),
    30
  );

  await page.evaluate(() => {
    window.terminal.style.height = '';
    window.terminal.setAttribute('rows', '10');
  });
  assert.deepEqual(await page.evaluate(() => window.backend.sizes.at(-1)), { cols: 100, rows: 10 });
  await page.until(() => document.querySelectorAll('slicc-terminal .term-row').length === 10);
  const height = await page.evaluate(() => window.terminal.getBoundingClientRect().height);
  assert.ok(height < 200, `fixed 10 rows should shrink the element, got ${height}px`);

  await page.evaluate(() => {
    window.terminal.style.height = '200px';
    window.terminal.fit();
  });
  await page.until((fitted) => {
    const last = window.backend.sizes.at(-1);
    return last.cols === fitted.cols && last.rows === fitted.rows;
  }, auto);
  assert.deepEqual(page.errors, []);
});

test('^C reaches the backend from the keyboard and through signal()', async (t) => {
  const { page } = await mounted(t);
  await page.evaluate(() => window.terminal.focus());
  await page.type('sleep 100');
  await page.press('Enter');
  await page.press('c', 'ctrl');
  await page.press('z', 'ctrl');
  await page.press('\\', 'ctrl');
  await page.until(() => window.backend.text().endsWith('\x1c'));
  assert.equal(await page.evaluate(received), 'sleep 100\r\x03\x1a\x1c');

  await page.evaluate(() => window.terminal.signal('SIGINT'));
  await page.evaluate(() => window.terminal.signal('SIGTSTP'));
  assert.deepEqual(await page.evaluate(() => window.backend.signals), ['SIGINT', 'SIGTSTP']);
  assert.deepEqual(page.errors, []);
});

test('signal() falls back to control bytes when the backend has no signal method', async (t) => {
  const { page } = await mounted(t, { signals: false });
  await page.evaluate(() => {
    for (const name of ['SIGINT', 'SIGTSTP', 'SIGQUIT', 'SIGHUP']) window.terminal.signal(name);
  });
  assert.equal(await page.evaluate(received), '\x03\x1a\x1c');
  assert.deepEqual(page.errors, []);
});

test('the session follows the element: exit, backend swap, removal and reattach', async (t) => {
  const { page } = await mounted(t);
  const exit = await page.evaluate(async () => {
    const status = new Promise((resolve) =>
      window.terminal.addEventListener('exit', ({ detail }) => resolve(detail.status), {
        once: true,
      })
    );
    window.backend.exit(130);
    window.terminal.send('after exit');
    return status;
  });
  assert.equal(exit, 130);
  assert.equal(await page.evaluate(received), '');

  const swapped = await page.evaluate(async () => {
    const first = window.backend;
    const second = new window.FakeBackend();
    const ready = new Promise((resolve) =>
      window.terminal.addEventListener('ready', ({ detail }) => resolve(detail), { once: true })
    );
    window.terminal.backend = second;
    const detail = await ready;
    window.terminal.send('to second');
    window.backend = second;
    return { detail, first: first.closed, second: second.text(), opened: second.opened };
  });
  assert.equal(swapped.second, 'to second');
  assert.equal(swapped.opened, 1);
  assert.equal(typeof swapped.detail.cols, 'number');

  const lifecycle = await page.evaluate(async () => {
    const terminal = window.terminal;
    const stage = document.getElementById('stage');
    terminal.remove();
    const closed = window.backend.closed;
    const empty = terminal.childElementCount;
    stage.append(terminal);
    await terminal.ready;
    return { closed, empty, opened: window.backend.opened, text: await terminal.readText() };
  });
  assert.deepEqual(
    { closed: lifecycle.closed, empty: lifecycle.empty, opened: lifecycle.opened },
    { closed: 1, empty: 0, opened: 2 }
  );
  assert.match(lifecycle.text, /fake:~\$/);
  assert.deepEqual(page.errors, []);
});

test('custom properties theme the terminal, and it works inside a shadow root', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/');
  await page.until(() => typeof window.mount === 'function');
  const themed = await page.evaluate(async () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const terminal = document.createElement('slicc-terminal');
    terminal.style.setProperty('--slicc-terminal-background', 'rgb(0, 0, 80)');
    terminal.style.setProperty('--slicc-terminal-color-2', 'rgb(0, 255, 0)');
    terminal.setAttribute('rows', '4');
    terminal.backend = new window.FakeBackend();
    root.append(terminal);
    document.getElementById('stage').replaceChildren(host);
    await terminal.ready;
    await new Promise(requestAnimationFrame);
    const screen = terminal.querySelector('.wterm');
    const prompt = terminal.querySelector('.term-row span');
    return {
      sheets: root.adoptedStyleSheets.length,
      background: getComputedStyle(screen).backgroundColor,
      prompt: getComputedStyle(prompt).color,
      rows: terminal.rows,
    };
  });
  assert.deepEqual(themed, {
    sheets: 1,
    background: 'rgb(0, 0, 80)',
    prompt: 'rgb(0, 255, 0)',
    rows: 4,
  });
  assert.deepEqual(page.errors, []);
});

test('an element without a backend still mounts and accepts local writes', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/');
  await page.until(() => typeof window.mount === 'function');
  const text = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('cols', '40');
    terminal.setAttribute('rows', '5');
    document.getElementById('stage').replaceChildren(terminal);
    await terminal.ready;
    terminal.write('local \x1b[33mwrite\x1b[0m');
    terminal.send('ignored');
    terminal.signal('SIGINT');
    return { text: await terminal.readText(), cols: terminal.cols, rows: terminal.rows };
  });
  assert.deepEqual({ cols: text.cols, rows: text.rows }, { cols: 40, rows: 5 });
  assert.match(text.text, /^local write/);
  assert.equal(await page.evaluate(screen).then((s) => s.startsWith('local write')), true);
  assert.deepEqual(page.errors, []);
});

test('output split inside UTF-8 and escape sequences renders whole', async (t) => {
  const { page } = await mounted(t, { echo: false }, { cols: '40', rows: '4' });
  const rows = await page.evaluate(async () => {
    const bytes = new TextEncoder().encode('\x1b[2J\x1b[Hgrüß \x1b[31m🖖\x1b[0m done');
    for (const byte of bytes) window.backend.sink.output(Uint8Array.of(byte));
    await new Promise(requestAnimationFrame);
    const spans = [...document.querySelectorAll('slicc-terminal .term-row span')];
    const red = spans.find((span) => span.textContent === '🖖');
    return {
      text: document.querySelector('slicc-terminal .term-row').textContent.trimEnd(),
      red: red && getComputedStyle(red).color,
    };
  });
  assert.deepEqual(rows, { text: 'grüß 🖖 done', red: 'rgb(244, 71, 71)' });
  assert.deepEqual(page.errors, []);
});

async function blank(t) {
  const page = await chrome.page(t);
  await page.goto('/');
  await page.until(() => typeof window.DeferredBackend === 'function');
  return page;
}

test('a superseded pending backend cannot write into the terminal', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const first = new window.DeferredBackend();
    terminal.backend = first;
    document.getElementById('stage').replaceChildren(terminal);
    while (first.pending.length === 0) await new Promise(requestAnimationFrame);
    const second = new window.DeferredBackend();
    terminal.backend = second;
    first.pending[0].sink.output(new TextEncoder().encode('STALE OUTPUT'));
    first.pending[0].sink.exit(9);
    second.settle();
    await terminal.ready;
    first.settle();
    await new Promise(requestAnimationFrame);
    return {
      text: await terminal.readText(),
      firstClosed: first.closed,
      secondOpened: second.opened,
    };
  });
  assert.doesNotMatch(result.text, /STALE/);
  assert.match(result.text, /fake:~\$/);
  assert.deepEqual(
    { closed: result.firstClosed, opened: result.secondOpened },
    { closed: 1, opened: 1 }
  );
  assert.deepEqual(page.errors, []);
});

test('a resize while the backend is opening reaches the session once it opens', async (t) => {
  const page = await blank(t);
  const sizes = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.resize(50, 8);
    const backend = new window.DeferredBackend();
    terminal.backend = backend;
    document.getElementById('stage').replaceChildren(terminal);
    while (backend.pending.length === 0) await new Promise(requestAnimationFrame);
    terminal.resize(70, 15);
    backend.settle();
    await terminal.ready;
    return {
      opened: backend.pending[0].size,
      sizes: backend.sizes,
      grid: [terminal.cols, terminal.rows],
    };
  });
  assert.deepEqual(sizes.opened, { cols: 50, rows: 8 });
  assert.deepEqual(sizes.grid, [70, 15]);
  assert.deepEqual(sizes.sizes.at(-1), { cols: 70, rows: 15 });
  assert.deepEqual(page.errors, []);
});

test('a superseded backend that fails does not reject ready or emit an error', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const errors = [];
    terminal.addEventListener('error', ({ detail }) => errors.push(detail.error.message));
    const first = new window.DeferredBackend();
    terminal.backend = first;
    document.getElementById('stage').replaceChildren(terminal);
    while (first.pending.length === 0) await new Promise(requestAnimationFrame);
    const second = new window.DeferredBackend();
    terminal.backend = second;
    first.fail(0, 'superseded failure');
    await new Promise(requestAnimationFrame);
    second.settle();
    const ready = await terminal.ready.then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
    terminal.send('ok');
    return { ready, errors, sent: second.text() };
  });
  assert.deepEqual(result, { ready: 'resolved', errors: [], sent: 'ok' });
  assert.deepEqual(page.errors, []);
});

test('ready is renewed when a replacement backend opens', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    terminal.backend = {
      open() {
        throw new Error('first backend down');
      },
    };
    document.getElementById('stage').replaceChildren(terminal);
    const first = await terminal.ready.then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
    terminal.backend = new window.FakeBackend();
    const second = await terminal.ready.then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
    const deferred = new window.DeferredBackend();
    terminal.backend = deferred;
    let settled = false;
    const third = terminal.ready.then(() => {
      settled = true;
    });
    await new Promise(requestAnimationFrame);
    const early = settled;
    deferred.settle();
    await third;
    return { first, second, early, late: settled, opened: deferred.opened };
  });
  assert.deepEqual(result, {
    first: 'rejected: first backend down',
    second: 'resolved',
    early: false,
    late: true,
    opened: 1,
  });
  assert.deepEqual(page.errors, []);
});

test('a session that calls back synchronously from close() cannot reach the terminal', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const exits = [];
    terminal.addEventListener('exit', ({ detail }) => exits.push(detail.status));
    terminal.backend = {
      open(sink) {
        return {
          write() {},
          resize() {},
          close() {
            sink.output(new TextEncoder().encode('STALE ON CLOSE'));
            sink.exit(1);
          },
        };
      },
    };
    document.getElementById('stage').replaceChildren(terminal);
    await terminal.ready;
    terminal.backend = new window.FakeBackend();
    await terminal.ready;
    await new Promise(requestAnimationFrame);
    return { text: await terminal.readText(), exits };
  });
  assert.doesNotMatch(result.text, /STALE/);
  assert.match(result.text, /fake:~\$/);
  assert.deepEqual(result.exits, []);
  assert.deepEqual(page.errors, []);
});

test('a terminal moved into an iframe adopts a stylesheet from that document', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    terminal.backend = new window.FakeBackend();
    document.getElementById('stage').replaceChildren(terminal);
    await terminal.ready;
    const frame = document.createElement('iframe');
    frame.srcdoc = '<!doctype html><body></body>';
    document.body.append(frame);
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    const inner = frame.contentDocument;
    const errors = [];
    terminal.addEventListener('error', ({ detail }) => errors.push(String(detail.error)));
    inner.body.append(terminal);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('not ready')), 5000)
    );
    await Promise.race([terminal.ready, timeout]).catch((error) => errors.push(error.message));
    await new Promise(requestAnimationFrame);
    const sheet = inner.adoptedStyleSheets[0];
    return {
      errors,
      sheets: inner.adoptedStyleSheets.length,
      distinct: sheet !== document.adoptedStyleSheets[0],
      background: frame.contentWindow.getComputedStyle(terminal.querySelector('.wterm'))
        .backgroundColor,
      text: await terminal.readText(),
    };
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sheets, 1);
  assert.equal(result.distinct, true);
  assert.equal(result.background, 'rgb(29, 29, 29)');
  assert.match(result.text, /fake:~\$/);
  assert.deepEqual(page.errors, []);
});

test('size attributes changed while wterm initializes are applied before the session opens', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('cols', '40');
    terminal.setAttribute('rows', '4');
    const backend = new window.FakeBackend();
    terminal.backend = backend;
    document.getElementById('stage').replaceChildren(terminal);
    terminal.setAttribute('cols', '60');
    terminal.setAttribute('rows', '6');
    await terminal.ready;
    await new Promise(requestAnimationFrame);
    return {
      grid: [terminal.cols, terminal.rows],
      opened: backend.sizes[0],
      rows: terminal.querySelectorAll('.term-row').length,
    };
  });
  assert.deepEqual(result, { grid: [60, 6], opened: { cols: 60, rows: 6 }, rows: 6 });
  assert.deepEqual(page.errors, []);
});

test('a mount that fails after the element was removed does not poison the next mount', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const Terminal = customElements.get('slicc-terminal');
    const wasm = Terminal.wasmUrl;
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const errors = [];
    terminal.addEventListener('error', ({ detail }) => errors.push(String(detail.error)));
    Terminal.wasmUrl = new URL('/missing/wterm.wasm', location.href).href;
    const stage = document.getElementById('stage');
    stage.replaceChildren(terminal);
    terminal.remove();
    Terminal.wasmUrl = wasm;
    await new Promise((resolve) => setTimeout(resolve, 500));
    terminal.backend = new window.FakeBackend();
    stage.append(terminal);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('not ready')), 5000)
    );
    const ready = await Promise.race([terminal.ready, timeout]).then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
    return { ready, errors, text: await terminal.readText() };
  });
  assert.deepEqual(
    { ready: result.ready, errors: result.errors },
    { ready: 'resolved', errors: [] }
  );
  assert.match(result.text, /fake:~\$/);
  assert.deepEqual(page.errors, []);
});
