import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function boot(t) {
  const page = await chrome.page(t);
  await page.goto('/kernel.html');
  await page.evaluate(async () => {
    const { KernelFiles } = await import('/dist/slicc-kernel-model.js');
    const root = await navigator.storage.getDirectory();
    for (const name of ['notices', 'first.txt'])
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    window.files = new KernelFiles(root);
    window.notices = [];
    window.noticeChannel = new BroadcastChannel('slicc-kernel-dirs:slicc-kernel');
    window.noticeChannel.onmessage = ({ data }) => window.notices.push(data);
  });
  return page;
}

async function notices(page, expected) {
  await page.until((count) => window.notices.length >= count, expected.length);
  assert.deepEqual(await page.evaluate(() => window.notices), expected);
  await page.evaluate(() => {
    window.notices.length = 0;
  });
}

test('kernel files post committed creates, saves and file or recursive directory removals', async (t) => {
  const page = await boot(t);
  await page.evaluate(() => window.files.write('notices//nested/first.txt', 'first'));
  await notices(page, [
    { paths: ['/notices', '/'], trees: [] },
    { paths: ['/notices/nested', '/notices'], trees: [] },
    { paths: ['/notices/nested/first.txt', '/notices/nested'], trees: [] },
  ]);
  assert.equal(await page.evaluate(() => window.files.read('/notices/nested/first.txt')), 'first');
  await page.evaluate(() => window.files.write('/notices/nested/first.txt', 'saved'));
  await notices(page, [{ paths: ['/notices/nested/first.txt'], trees: [] }]);
  assert.equal(await page.evaluate(() => window.files.read('/notices/nested/first.txt')), 'saved');
  await page.evaluate(() => window.files.remove('/notices/nested/first.txt'));
  await notices(page, [{ paths: ['/notices/nested/first.txt', '/notices/nested'], trees: [] }]);
  await page.evaluate(() => window.files.write('/notices/nested/child.txt', 'child'));
  await notices(page, [{ paths: ['/notices/nested/child.txt', '/notices/nested'], trees: [] }]);
  await page.evaluate(() => window.files.remove('notices//nested/'));
  await notices(page, [{ paths: ['/notices/nested', '/notices'], trees: ['/notices/nested'] }]);
  assert.deepEqual(
    await page.evaluate(async () =>
      (await window.files.list()).filter(({ path }) => path.startsWith('/notices'))
    ),
    [{ path: '/notices', kind: 'directory', size: 0, modified: 0 }]
  );
  await page.evaluate(() => window.files.write('/first.txt', 'root'));
  await notices(page, [{ paths: ['/first.txt', '/'], trees: [] }]);
  await page.evaluate(() => window.files.remove('/first.txt'));
  await notices(page, [{ paths: ['/first.txt', '/'], trees: [] }]);
  assert.deepEqual(page.errors, []);
});

test('kernel files post no notice for failed mutations', async (t) => {
  const page = await boot(t);
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('notices', { create: true });
    const handle = await dir.getFileHandle('locked.txt', { create: true });
    const lock = await handle.createWritable({ mode: 'exclusive' });
    const failures = [];
    try {
      for (const operation of [
        () => window.files.write('/notices/locked.txt', 'blocked'),
        () => window.files.remove('/notices/locked.txt'),
        () => window.files.write('/notices/locked.txt/child', 'blocked'),
        () => window.files.remove('/notices/missing'),
      ]) {
        failures.push(
          await operation().then(
            () => false,
            () => true
          )
        );
      }
    } finally {
      await lock.abort();
    }
    return failures;
  });
  assert.deepEqual(result, [true, true, true, true]);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const barrier = new BroadcastChannel('slicc-kernel-dirs:slicc-kernel');
        window.noticeChannel.addEventListener(
          'message',
          ({ data }) => {
            if (data.barrier) {
              barrier.close();
              resolve();
            }
          },
          { once: true }
        );
        barrier.postMessage({ barrier: true });
      })
  );
  assert.deepEqual(await page.evaluate(() => window.notices), [{ barrier: true }]);
  assert.deepEqual(page.errors, []);
});

test('kernel file operations survive a throwing notice channel', async (t) => {
  const page = await boot(t);
  const result = await page.evaluate(async () => {
    const post = BroadcastChannel.prototype.postMessage;
    let attempts = 0;
    BroadcastChannel.prototype.postMessage = function (message) {
      if (this.name === 'slicc-kernel-dirs:slicc-kernel') {
        attempts += 1;
        throw new Error('notice unavailable');
      }
      return post.call(this, message);
    };
    try {
      await window.files.write('/notices/nested/first.txt', 'created');
      await window.files.write('/notices/nested/first.txt', 'saved');
      const text = await window.files.read('/notices/nested/first.txt');
      await window.files.remove('/notices/nested/first.txt');
      await window.files.remove('/notices');
      const listed = (await window.files.list()).filter(({ path }) => path.startsWith('/notices'));
      return { text, listed, attempts };
    } finally {
      BroadcastChannel.prototype.postMessage = post;
    }
  });
  assert.deepEqual(result, { text: 'saved', listed: [], attempts: 6 });
  assert.deepEqual(page.errors, []);
});
