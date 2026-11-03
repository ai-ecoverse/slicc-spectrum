import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function boot(page) {
  await page.goto('/kernel-ui/');
  await page.until(() => typeof window.boot === 'function');
  await page.evaluate(() => window.boot());
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(async () => {
    const { attachKernel } = await import('/node_modules/@ai-ecoverse/slicc-kernel/dist/index.js');
    window.client = await attachKernel(await window.kernel.connect());
  });
}

async function listen(page) {
  await page.evaluate(() => {
    const state = async (path) => {
      let dir = await navigator.storage.getDirectory();
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      try {
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        if (name === undefined) return 'dir';
        return await (await dir.getFileHandle(name)).getFile().then((file) => file.text());
      } catch (error) {
        if (error.name === 'TypeMismatchError') return 'dir';
        return null;
      }
    };
    window.notices = [];
    const channel = new BroadcastChannel('slicc-kernel-dirs:slicc-kernel');
    channel.onmessage = ({ data }) => {
      if (Array.isArray(data)) return;
      window.notices.push(
        Promise.all([...data.paths, ...data.trees].map(state)).then((seen) => ({
          paths: [...data.paths].sort(),
          trees: [...data.trees].sort(),
          seen: Object.fromEntries(
            [...data.paths, ...data.trees].map((path, i) => [path, seen[i]])
          ),
        }))
      );
    };
  });
}

const notices = (page, count) =>
  page.evaluate(async (n) => {
    const until = performance.now() + 5000;
    while (window.notices.length < n && performance.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const all = await Promise.all(window.notices);
    window.notices.length = 0;
    return all;
  }, count);

async function save(page, path, text) {
  const id = `file:${path}`;
  await page.evaluate((item) => {
    const tree = window.$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree');
    const parts = item.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++)
      tree.tree.getItem(`${parts.slice(0, i).join('/')}/`).expand();
    tree.reveal(item);
  }, path.slice(1));
  await page.until((item) => !!window.row(item), path.slice(1));
  await page.evaluate((item) => window.row(item).click(), path.slice(1));
  await page.until((panel) => !!window.content(panel)?.shadowRoot, id);
  await page.until(
    (panel) =>
      [...window.content(panel).shadowRoot.querySelectorAll('swc-action-button')].some(
        (button) => button.textContent.trim() === 'Edit' && !button.disabled
      ),
    id
  );
  await page.evaluate((panel) => {
    [...window.content(panel).shadowRoot.querySelectorAll('swc-action-button')]
      .find((button) => button.textContent.trim() === 'Edit')
      .click();
  }, id);
  await page.until((panel) => !!window.content(panel).shadowRoot.querySelector('textarea'), id);
  await page.evaluate(
    (panel, value) => {
      const area = window.content(panel).shadowRoot.querySelector('textarea');
      area.value = value;
      area.dispatchEvent(new Event('input'));
      area.focus();
    },
    id,
    text
  );
  await page.press('s', 'ctrl');
  await page.until((panel) => !window.content(panel).shadowRoot.querySelector('textarea'), id);
}

test('each Files panel change posts one fs notice, after it has committed, naming what changed', async (t) => {
  const page = await chrome.page(t);
  await boot(page);
  await page.evaluate(async () => {
    const { fs } = window.client;
    await fs.rm('/home/n', { force: true });
    await fs.mkdir('/home/n/dir/x');
    await fs.writeFile('/home/n/notes.txt', 'old\n');
    await fs.writeFile('/home/n/gone.txt', 'bye\n');
    await fs.writeFile('/home/n/dir/x/y.txt', 'y\n');
    await window.model.files.refresh();
  });
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      ?.paths.includes('home/n/notes.txt')
  );
  await listen(page);

  await save(page, '/home/n/notes.txt', 'edited in the panel\n');
  assert.deepEqual(await notices(page, 1), [
    {
      paths: ['/home/n/notes.txt'],
      trees: [],
      seen: { '/home/n/notes.txt': 'edited in the panel\n' },
    },
  ]);

  await page.evaluate(() => window.model.files.write('/home/n/a/b/new.md', 'new\n'));
  assert.deepEqual(await notices(page, 1), [
    {
      paths: ['/home/n', '/home/n/a', '/home/n/a/b', '/home/n/a/b/new.md'],
      trees: [],
      seen: {
        '/home/n': 'dir',
        '/home/n/a': 'dir',
        '/home/n/a/b': 'dir',
        '/home/n/a/b/new.md': 'new\n',
      },
    },
  ]);

  await page.evaluate(() => window.model.files.write('/top.txt', 'top\n'));
  assert.deepEqual(await notices(page, 1), [
    { paths: ['/', '/top.txt'], trees: [], seen: { '/': 'dir', '/top.txt': 'top\n' } },
  ]);

  await page.evaluate(() => window.model.files.remove('/home/n/gone.txt'));
  assert.deepEqual(await notices(page, 1), [
    {
      paths: ['/home/n', '/home/n/gone.txt'],
      trees: [],
      seen: { '/home/n': 'dir', '/home/n/gone.txt': null },
    },
  ]);

  await page.evaluate(() => window.model.files.remove('/home/n/dir'));
  assert.deepEqual(await notices(page, 1), [
    { paths: ['/home/n'], trees: ['/home/n/dir'], seen: { '/home/n': 'dir', '/home/n/dir': null } },
  ]);

  await page.evaluate(() => window.model.files.remove('/top.txt'));
  assert.deepEqual(await notices(page, 1), [
    { paths: ['/', '/top.txt'], trees: [], seen: { '/': 'dir', '/top.txt': null } },
  ]);
  assert.deepEqual(page.errors, []);
});

const WATCHER = `export default async function (ctx) {
  const [dir, want, ready] = ctx.argv.slice(1);
  const heard = [];
  let done;
  const finished = new Promise((resolve) => { done = resolve; });
  const watch = await ctx.fs.watch(dir, { recursive: true }, (event) => {
    heard.push(event.filename ?? JSON.stringify(event));
    if (heard.includes(want)) done();
  });
  await ctx.fs.writeFile(ready, 'ready');
  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 8000))]);
  watch.close();
  await ctx.write(1, JSON.stringify([...new Set(heard)].sort()) + '\\n');
}
`;

test('a program watching a folder hears what the Files panel saves, creates and removes in it', async (t) => {
  const page = await chrome.page(t);
  await boot(page);
  await page.evaluate(async (source) => {
    const { fs } = window.client;
    await fs.mkdir('/node_modules/notewatch');
    await fs.writeFile(
      '/node_modules/notewatch/package.json',
      JSON.stringify({
        name: 'notewatch',
        slicc: { commands: { notewatch: { abi: 'js', module: 'main.mjs' } } },
      })
    );
    await fs.writeFile('/node_modules/notewatch/main.mjs', source);
    await fs.rm('/home/w', { force: true });
    await fs.mkdir('/home/w');
    await fs.writeFile('/home/w/notes.txt', 'old\n');
  }, WATCHER);

  const run = async (want, change) =>
    page.evaluate(
      async (wanted, action) => {
        const { fs } = window.client;
        await fs.rm('/home/ready', { force: true });
        const watching = window.kernel.run(['notewatch', '/home/w', wanted, '/home/ready'], {
          cwd: '/',
        });
        while (!(await fs.exists('/home/ready')))
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (action === 'write') await window.model.files.write('/home/w/notes.txt', 'saved\n');
        if (action === 'create') await window.model.files.write('/home/w/sub/new.md', 'new\n');
        if (action === 'remove') await window.model.files.remove('/home/w/sub');
        const result = await watching;
        return { status: result.status, stderr: result.stderr, heard: JSON.parse(result.stdout) };
      },
      want,
      change
    );

  const saved = await run('notes.txt', 'write');
  assert.equal(saved.status, 0, saved.stderr);
  assert.ok(saved.heard.includes('notes.txt'), JSON.stringify(saved.heard));
  const created = await run('sub/new.md', 'create');
  assert.equal(created.status, 0, created.stderr);
  assert.ok(created.heard.includes('sub/new.md'), JSON.stringify(created.heard));
  const removed = await run('sub', 'remove');
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(removed.heard.includes('sub'), JSON.stringify(removed.heard));
  assert.deepEqual(page.errors, []);
});

test('a client watch on a folder hears what the Files panel saves, creates and removes in it', async (t) => {
  const page = await chrome.page(t);
  await boot(page);
  await page.evaluate(async () => {
    const { fs } = window.client;
    await fs.rm('/home/c', { force: true });
    await fs.mkdir('/home/c');
    await fs.writeFile('/home/c/notes.txt', 'old\n');
    await window.model.files.refresh();
    window.heard = [];
    await fs.watch(['/home/c'], { recursive: true }, (change) =>
      window.heard.push(...(change.paths ?? ['overflow']))
    );
  });
  const heard = (want) =>
    page.evaluate(async (wanted) => {
      const until = performance.now() + 3000;
      while (!wanted.every((path) => window.heard.includes(path)) && performance.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 20));
      const seen = [...new Set(window.heard)].sort();
      window.heard.length = 0;
      return seen;
    }, want);
  const peers = await page.evaluate(async () => {
    const { postFsNotice } = await import('/node_modules/@ai-ecoverse/slicc-kernel/dist/meta.js');
    postFsNotice({ paths: ['/home/c/probe'] });
    const until = performance.now() + 1000;
    while (!window.heard.includes('/home/c/probe') && performance.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 20));
    const found = window.heard.includes('/home/c/probe');
    window.heard.length = 0;
    return found;
  });
  if (!peers) {
    t.skip('this slicc-kernel predates #1746: client watches do not hear postFsNotice');
    return;
  }
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      ?.paths.includes('home/c/notes.txt')
  );

  await save(page, '/home/c/notes.txt', 'saved in the panel\n');
  assert.deepEqual(await heard(['/home/c/notes.txt']), ['/home/c/notes.txt']);
  await page.evaluate(() => window.model.files.write('/home/c/sub/new.md', 'new\n'));
  assert.deepEqual(await heard(['/home/c/sub', '/home/c/sub/new.md']), [
    '/home/c',
    '/home/c/sub',
    '/home/c/sub/new.md',
  ]);
  await page.evaluate(() => window.model.files.remove('/home/c/sub'));
  assert.deepEqual(await heard(['/home/c/sub']), ['/home/c', '/home/c/sub']);
  assert.deepEqual(page.errors, []);
});
