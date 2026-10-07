import { createKernelModel } from '/dist/slicc-kernel-model.js';
import { surfaces } from '/dist/slicc-ui.js';
import { createKernel } from '/node_modules/@ai-ecoverse/slicc-kernel/dist/index.js';

const packages = {
  'node_modules/@ai-ecoverse/wasm-bash/': ['package.json', 'bin/bash', 'bin/bash.wasm'],
  'node_modules/@ai-ecoverse/wasm-coreutils/': [
    'package.json',
    'bin/coreutils',
    'bin/coreutils.wasm',
  ],
};

async function walk(path, create = false) {
  let dir = await navigator.storage.getDirectory();
  for (const part of path.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function install() {
  for (const [dir, names] of Object.entries(packages)) {
    for (const name of names) {
      const parts = (dir + name).split('/');
      const file = parts.pop();
      const parent = await walk(parts.join('/'), true);
      if (
        await parent.getFileHandle(file).then(
          () => true,
          () => false
        )
      )
        continue;
      const response = await fetch(`/${dir}${name}`);
      if (!response.ok) throw new Error(`${response.status} ${response.url}`);
      const handle = await parent.getFileHandle(file, { create: true });
      await response.body.pipeTo(await handle.createWritable());
    }
  }
}

const open = { files: ['tablet', 'desktop'], terminal: ['phone', 'tablet', 'desktop'] };

window.boot = async () => {
  await install();
  const root = await navigator.storage.getDirectory();
  const kernel = await createKernel({ root });
  const model = createKernelModel({
    kernel,
    root,
    storage: localStorage,
    files: { skip: ['/node_modules'], interval: 500 },
    terminals: { env: { PS1: 'slicc:\\w\\$ ' } },
  });
  model.settings.update({ color: 'light' });
  const app = document.querySelector('slicc-app');
  app.layoutKey = 'slicc-kernel.layout';
  app.surfaces = surfaces
    .filter((item) => item.id in open)
    .map((item) => ({ ...item, open: open[item.id] }));
  app.model = model;
  window.model = model;
  window.app = app;
  await app.updateComplete;
  return true;
};

window.$ = (...path) => {
  let node = document;
  for (const selector of path) {
    node = (node.shadowRoot ?? node).querySelector(selector);
    if (!node) return null;
  }
  return node;
};

window.content = (id) => window.$('slicc-app', 'slicc-dock').content(id);

window.row = (path) =>
  window
    .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree', 'file-tree-container')
    ?.shadowRoot.querySelector(`[data-item-path="${path}"]`) ?? null;

window.code = (id) =>
  window
    .content(id)
    ?.shadowRoot.querySelector('slicc-code-view')
    ?.shadowRoot.querySelector('diffs-container')?.shadowRoot.textContent ?? '';

window.screen = () =>
  [
    ...(window
      .$('slicc-app', 'slicc-dock', 'slicc-terminals')
      ?.shadowRoot.querySelectorAll('slicc-terminal:not([hidden]) .term-row') ?? []),
  ]
    .map((row) => row.textContent.trimEnd())
    .join('\n');
