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
  assert.ok(chrome.requests.includes('/dist/ghostty-vt.wasm'), chrome.requests.join());
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
    data.setData('text/plain', 'pasted\nwindows\r\ntext');
    const target = document.querySelector('slicc-terminal textarea');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  });
  await page.until(() => window.backend.text().endsWith('text'));

  assert.equal(
    await page.evaluate(received),
    'ls -la\r\x1b[A\x1b[D\t\x7f\x1b\x04\x0cgrüß 🖖pasted\rwindows\rtext'
  );
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('fake:~$ ls -la')
  );
  await page.evaluate(() => window.backend.emit('\x1b[?2004h'));
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'brack\neted\r\n');
    const target = document.querySelector('slicc-terminal textarea');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
  });
  await page.until(() => window.backend.text().endsWith('\x1b[201~'));
  assert.ok((await page.evaluate(received)).endsWith('\x1b[200~brack\reted\r\x1b[201~'));
  await page.type('x');
  await page.press('Enter');
  assert.ok((await page.evaluate(received)).endsWith('\x1b[201~x\r'));
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
  assert.equal(styles.truecolor.color, 'rgb(255, 128, 0)');
  assert.equal(styles.bg.background, 'rgb(0, 95, 0)');

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

test('OSC 10 and 11 color queries are answered from the current theme, before later replies', async (t) => {
  const { page } = await mounted(t);
  await page.until(
    () => window.backend.text !== undefined && window.terminal.querySelector('.wterm')
  );
  const ask = (text) =>
    page.evaluate(async (query) => {
      const before = window.backend.bytes.length;
      window.backend.emit(query);
      await new Promise(requestAnimationFrame);
      return new TextDecoder().decode(Uint8Array.from(window.backend.bytes.slice(before)));
    }, text);
  const replies = await ask('\x1b]11;?\x1b\\\x1b[c');
  assert.match(replies, /^\x1b\]11;rgb:1d1d\/1d1d\/1d1d\x1b\\\x1b\[\?/);
  assert.equal(
    await ask('\x1b]10;?;?\x07'),
    '\x1b]10;rgb:d4d4/d4d4/d4d4\x07\x1b]11;rgb:1d1d/1d1d/1d1d\x07'
  );
  await page.evaluate(() => {
    window.terminal.style.setProperty('--slicc-terminal-background', 'rgb(248, 248, 248)');
    window.terminal.style.setProperty('--slicc-terminal-foreground', 'oklch(0.3 0 0)');
  });
  await page.evaluate(() => window.backend.emit('\x1b]1'));
  assert.equal(await ask('1;?\x07'), '\x1b]11;rgb:f8f8/f8f8/f8f8\x07');
  assert.match(await ask('\x1b]10;?\x07'), /^\x1b\]10;rgb:([0-9a-f]{4})\/\1\/\1\x07$/);
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
    Terminal.wasmUrl = new URL('/missing/ghostty-vt.wasm', location.href).href;
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

test('a backend that throws synchronously and is replaced in the same turn does not fail the replacement', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    document.getElementById('stage').replaceChildren(terminal);
    await terminal.ready;
    const errors = [];
    terminal.addEventListener('error', ({ detail }) => errors.push(detail.error.message));
    terminal.backend = {
      open() {
        throw new Error('sync failure');
      },
    };
    const backend = new window.FakeBackend();
    terminal.backend = backend;
    const ready = await terminal.ready.then(
      () => 'resolved',
      (error) => `rejected: ${error.message}`
    );
    await new Promise(requestAnimationFrame);
    terminal.send('ok');
    return { ready, errors, sent: backend.text() };
  });
  assert.deepEqual(result, { ready: 'resolved', errors: [], sent: 'ok' });
  assert.deepEqual(page.errors, []);
});

test('a session that exits after opening is closed', async (t) => {
  const { page } = await mounted(t, {}, { rows: '4' });
  const result = await page.evaluate(async () => {
    const backend = window.backend;
    backend.exit(0);
    const afterExit = backend.closed;
    window.terminal.backend = new window.FakeBackend();
    await window.terminal.ready;
    return { afterExit, afterSwap: backend.closed };
  });
  assert.deepEqual(result, { afterExit: 1, afterSwap: 1 });
  assert.deepEqual(page.errors, []);
});

test('a caller awaiting ready across a removal and reattachment is released', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    terminal.backend = new window.FakeBackend();
    const stage = document.getElementById('stage');
    stage.replaceChildren(terminal);
    const captured = terminal.ready;
    terminal.remove();
    stage.append(terminal);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('still waiting')), 5000)
    );
    const outcome = await Promise.race([captured, timeout]).then(
      (value) =>
        value === terminal ? 'resolved with the element' : 'resolved with something else',
      (error) => `rejected: ${error.message}`
    );
    return { outcome, text: await terminal.readText() };
  });
  assert.equal(result.outcome, 'resolved with the element');
  assert.match(result.text, /fake:~\$/);
  assert.deepEqual(page.errors, []);
});

test('input made while the backend is opening is flushed in order once it opens', async (t) => {
  const page = await blank(t);
  await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const backend = new window.DeferredBackend();
    terminal.backend = backend;
    document.getElementById('stage').replaceChildren(terminal);
    while (backend.pending.length === 0) await new Promise(requestAnimationFrame);
    window.terminal = terminal;
    window.backend = backend;
    terminal.focus();
  });
  await page.evaluate(() => window.terminal.send('ab'));
  await page.evaluate(() =>
    window.backend.pending[0].sink.output(new TextEncoder().encode('\x1b[c'))
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.type('cd');
  await page.press('c', 'ctrl');
  const before = await page.evaluate(() => window.backend.bytes.length);
  await page.evaluate(async () => {
    window.backend.settle();
    await window.terminal.ready;
  });
  const text = await page.evaluate(() => window.backend.text());
  assert.equal(before, 0);
  const reply = text.slice(2, -3);
  assert.deepEqual([text.slice(0, 2), text.slice(-3)], ['ab', 'cd\x03']);
  assert.equal(reply.charCodeAt(0), 0x1b);
  assert.match(reply.slice(1), /^\[\?[\d;]+c$/);
  assert.deepEqual(page.errors, []);
});

test('input buffered for an open that is superseded or fails is dropped', async (t) => {
  const page = await blank(t);
  const result = await page.evaluate(async () => {
    const terminal = document.createElement('slicc-terminal');
    terminal.setAttribute('rows', '4');
    const first = new window.DeferredBackend();
    terminal.backend = first;
    document.getElementById('stage').replaceChildren(terminal);
    while (first.pending.length === 0) await new Promise(requestAnimationFrame);
    terminal.send('for the first');
    const second = new window.DeferredBackend();
    terminal.backend = second;
    terminal.send('for the second');
    second.fail(0, 'second down');
    await terminal.ready.catch(() => {});
    terminal.send('nowhere');
    const third = new window.FakeBackend();
    terminal.backend = third;
    await terminal.ready;
    first.settle();
    await new Promise(requestAnimationFrame);
    terminal.send('live');
    return { first: first.text(), second: second.text(), third: third.text() };
  });
  assert.deepEqual(result, { first: '', second: '', third: 'live' });
  assert.deepEqual(page.errors, []);
});

test('soft-wrapped output reflows when the terminal widens and re-wraps when it narrows', async (t) => {
  const { page } = await mounted(t, {}, { cols: '45', rows: '8' });
  const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => `/${c.repeat(10)}`);
  const line = segments.join('');
  const colored = `${segments.slice(0, 3).join('')}\x1b[1;31m${segments.slice(3, 5).join('')}\x1b[0m${segments.slice(5).join('')}`;
  await page.evaluate((text) => {
    window.backend.emit(`\x1b[2J\x1b[H${text}\r\nnext`);
  }, colored);
  const state = () =>
    page.evaluate(async () => ({
      text: await window.terminal.readText(),
      rows: [...document.querySelectorAll('slicc-terminal .term-row')].map((row) =>
        row.textContent.trimEnd()
      ),
      cols: window.terminal.cols,
    }));
  const style = () =>
    page.evaluate(() => {
      const span = [...document.querySelectorAll('slicc-terminal .term-row span')].find((s) =>
        s.textContent.startsWith('/dddddddddd')
      );
      const computed = getComputedStyle(span);
      return [span.textContent, computed.color, computed.fontWeight];
    });
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('next')
  );
  const narrow = await state();
  assert.equal(narrow.cols, 45);
  assert.deepEqual(narrow.rows.slice(0, 3), [line.slice(0, 45), line.slice(45), 'next']);
  assert.equal(narrow.text.split('\n')[0], line);

  await page.evaluate(() => window.terminal.resize(120, 8));
  await page.until(
    (text) => document.querySelector('slicc-terminal .term-row')?.textContent.trimEnd() === text,
    line
  );
  const wide = await state();
  assert.equal(wide.cols, 120);
  assert.deepEqual(wide.rows.slice(0, 2), [line, 'next']);
  assert.deepEqual(wide.text.split('\n').slice(0, 2), [line, 'next']);
  assert.deepEqual(await style(), ['/dddddddddd/eeeeeeeeee', 'rgb(244, 71, 71)', '700']);

  await page.evaluate(() => window.terminal.resize(45, 8));
  await page.until(
    (text) => document.querySelector('slicc-terminal .term-row')?.textContent.trimEnd() === text,
    line.slice(0, 45)
  );
  const again = await state();
  assert.deepEqual(again.rows.slice(0, 3), [line.slice(0, 45), line.slice(45), 'next']);
  assert.equal(again.text.split('\n')[0], line);

  await page.evaluate(() => {
    document.getElementById('stage').style.width = '1400px';
    window.terminal.fit();
  });
  await page.until(
    (text) => document.querySelector('slicc-terminal .term-row')?.textContent.trimEnd() === text,
    line
  );
  const fitted = await state();
  assert.ok(fitted.cols > 88, `fit() should widen past 88 columns, got ${fitted.cols}`);
  assert.deepEqual(fitted.rows.slice(0, 2), [line, 'next']);
  assert.deepEqual(fitted.text.split('\n').slice(0, 2), [line, 'next']);
  assert.deepEqual(await style(), ['/dddddddddd/eeeeeeeeee', 'rgb(244, 71, 71)', '700']);
  assert.deepEqual(page.errors, []);
});

test('palette colours follow custom properties changed after the output, in history too', async (t) => {
  const { page } = await mounted(t, {}, { cols: '40', rows: '4' });
  await page.evaluate(() =>
    window.backend.emit(
      '\x1b[2J\x1b[H\x1b[31mold red\x1b[0m\r\n\x1b[38;5;196mcube\x1b[0m\r\n\r\n\r\n\r\n\x1b[41m back \x1b[0m'
    )
  );
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('back')
  );
  const colors = () =>
    page.evaluate(() => {
      const spans = [...document.querySelectorAll('slicc-terminal .term-row span')];
      const pick = (text, prop) => {
        const span = spans.find((s) => s.textContent === text);
        return span ? getComputedStyle(span)[prop] : null;
      };
      return { cube: pick('cube', 'color'), back: pick(' back ', 'backgroundColor') };
    });
  assert.deepEqual(await colors(), { cube: 'rgb(255, 0, 0)', back: 'rgb(244, 71, 71)' });
  await page.evaluate(() => {
    window.terminal.style.setProperty('--slicc-terminal-color-1', 'rgb(1, 2, 3)');
  });
  assert.deepEqual(await colors(), { cube: 'rgb(255, 0, 0)', back: 'rgb(1, 2, 3)' });
  await page.evaluate(() => window.backend.emit('\x1b]4;1;?\x07'));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(received), '');
  const red = await page.evaluate(() => {
    const span = [...document.querySelectorAll('slicc-terminal .term-row span')].find(
      (s) => s.textContent === 'old red'
    );
    return span && getComputedStyle(span).color;
  });
  assert.equal(red, 'rgb(1, 2, 3)');
  assert.deepEqual(page.errors, []);
});

test('copying a soft-wrapped line gives one line, and wide terminals keep 1000 lines of history', async (t) => {
  const { page } = await mounted(t, {}, { cols: '20', rows: '4' });
  const line = 'abcdefghij'.repeat(3);
  await page.evaluate((text) => window.backend.emit(`\x1b[2J\x1b[H${text}\r\nend`), line);
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('end')
  );
  const copied = await page.evaluate(() => {
    const rows = document.querySelectorAll('slicc-terminal .term-row');
    const range = document.createRange();
    range.setStart(rows[0], 0);
    range.setEnd(rows[1], rows[1].childNodes.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const data = new DataTransfer();
    document.dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
    );
    return data.getData('text/plain');
  });
  assert.equal(copied.trimEnd(), line);

  await page.evaluate(() => window.terminal.resize(200, 24));
  const history = await page.evaluate(async () => {
    let text = '';
    for (let i = 0; i < 3000; i++) text += `line ${i}\r\n`;
    window.terminal.write(text);
    await new Promise(requestAnimationFrame);
    return (await window.terminal.readText()).split('\n');
  });
  assert.ok(history.length >= 1000, `kept ${history.length} lines`);
  assert.deepEqual(page.errors, []);
});
