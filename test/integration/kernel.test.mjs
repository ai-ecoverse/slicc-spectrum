import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const screen = () => document.querySelector('slicc-terminal .term-grid').textContent;

async function booted(t) {
  const page = await chrome.page(t);
  await page.goto('/kernel.html');
  await page.until(() => typeof window.boot === 'function');
  await page.evaluate(() => window.boot());
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('slicc:~$')
  );
  return page;
}

async function shows(page, text) {
  await page.until(
    (needle) => document.querySelector('slicc-terminal .term-grid').textContent.includes(needle),
    text
  );
}

test('bash -i runs in the terminal against OPFS, with job control and resize', async (t) => {
  const page = await booted(t);

  await page.type('echo "sum $((6 * 7))"');
  await page.press('Enter');
  await shows(page, 'sum 42');

  await page.type('ls; cat notes.txt');
  await page.press('Enter');
  await shows(page, 'hello from OPFS');

  await page.type('printf "\\033[1;31mred\\033[0m\\n"');
  await page.press('Enter');
  await page.until(() =>
    [...document.querySelectorAll('slicc-terminal .term-row span')].some(
      (span) => span.textContent === 'red' && getComputedStyle(span).color === 'rgb(244, 71, 71)'
    )
  );

  await page.evaluate(() => window.terminal.resize(90, 20));
  await page.type('stty size');
  await page.press('Enter');
  await shows(page, '20 90');

  await page.type('sleep 30');
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.press('c', 'ctrl');
  await shows(page, '^C');
  await new Promise((resolve) => setTimeout(resolve, 100));
  await page.type('echo "rc $?"');
  await page.press('Enter');
  await shows(page, 'rc 130');

  await page.type('sleep 30');
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.press('z', 'ctrl');
  await shows(page, 'Stopped');
  await page.type('kill %1; jobs; echo listed');
  await page.press('Enter');
  await shows(page, 'listed');

  await page.type('exit 7');
  await page.press('Enter');
  await page.until(() => window.statuses.length === 1);
  assert.deepEqual(await page.evaluate(() => window.statuses), [7]);
  await page.screenshot(new URL('bash.png', page.dir));
  assert.deepEqual(page.errors, []);
  assert.ok((await page.evaluate(screen)).includes('sum 42'));
});

test('a missing command rejects ready and reports an error', async (t) => {
  const page = await booted(t);
  const result = await page.evaluate(() => window.missing());
  assert.deepEqual(result, {
    ready: 'rejected: no-such-command: command not found',
    errors: ['no-such-command: command not found'],
  });
  assert.deepEqual(page.errors, []);
});

test('the files model rescans for a visible change at once and then once per interval, and not for changes under skipped or hidden folders', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/kernel.html');
  const result = await page.evaluate(async () => {
    const { KernelFiles } = await import('/dist/slicc-kernel-model.js');
    const opfs = await navigator.storage.getDirectory();
    await opfs.removeEntry('observed', { recursive: true }).catch(() => {});
    const root = await opfs.getDirectoryHandle('observed', { create: true });
    const dir = async (path) => {
      let at = root;
      for (const part of path.split('/').filter(Boolean))
        at = await at.getDirectoryHandle(part, { create: true });
      return at;
    };
    const write = async (path, text) => {
      const parts = path.split('/');
      const name = parts.pop();
      const writable = await (
        await (await dir(parts.join('/'))).getFileHandle(name, { create: true })
      ).createWritable();
      await writable.write(text);
      await writable.close();
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await dir('node_modules/pkg');
    await dir('.git');
    let scans = 0;
    const values = root.values.bind(root);
    root.values = () => {
      scans += 1;
      return values();
    };
    const files = new KernelFiles(root, {
      skip: ['/node_modules'],
      hide: ['/.git'],
      interval: 1500,
    });
    const seen = [];
    files.on('file', (path) => seen.push(path));
    await files.list();
    files.start();
    await sleep(300);
    const before = scans;
    for (let i = 0; i < 20; i++) {
      await write(`node_modules/pkg/file-${i}.js`, `${i}`);
      await write(`.git/object-${i}`, `${i}`);
    }
    await sleep(800);
    const hidden = { scans: scans - before, seen: [...seen] };
    const start = performance.now();
    await write('first.txt', 'one');
    while (!seen.includes('/first.txt') && performance.now() - start < 5000) await sleep(10);
    const first = performance.now() - start;
    const after = scans;
    for (let i = 0; i < 5; i++) await write('second.txt', `${i}`);
    await sleep(300);
    const throttled = scans - after;
    while (!seen.includes('/second.txt') && performance.now() - start < 6000) await sleep(10);
    const second = performance.now() - start;
    files.stop();
    await opfs.removeEntry('observed', { recursive: true });
    return {
      observer: typeof FileSystemObserver === 'function',
      hidden,
      first,
      throttled,
      second,
      listed: (await files.list()).map((entry) => entry.path),
    };
  });
  assert.equal(result.observer, true);
  assert.deepEqual(result.hidden, { scans: 0, seen: [] });
  assert.ok(result.first < 1000, `first visible change took ${result.first} ms`);
  assert.equal(result.throttled, 0);
  assert.ok(result.second >= 1000, `second change came after ${result.second} ms`);
  assert.ok(result.second < 4000, `second change took ${result.second} ms`);
  assert.deepEqual(result.listed, ['/first.txt', '/node_modules', '/second.txt']);
  assert.deepEqual(page.errors, []);
});
