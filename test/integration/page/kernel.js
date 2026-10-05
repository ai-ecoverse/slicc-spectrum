import { kernelBackend } from '/dist/slicc-terminal.js';
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
      const response = await fetch(`/${dir}${name}`);
      if (!response.ok) throw new Error(`${response.status} ${response.url}`);
      const parts = (dir + name).split('/');
      const file = parts.pop();
      const handle = await (await walk(parts.join('/'), true)).getFileHandle(file, {
        create: true,
      });
      await response.body.pipeTo(await handle.createWritable());
    }
  }
  const home = await walk('home', true);
  const notes = await (await home.getFileHandle('notes.txt', { create: true })).createWritable();
  await notes.write('hello from OPFS\n');
  await notes.close();
}

window.boot = async () => {
  await install();
  window.kernel = await createKernel({ root: await navigator.storage.getDirectory() });
  const terminal = document.querySelector('slicc-terminal');
  window.statuses = [];
  terminal.addEventListener('exit', ({ detail }) => window.statuses.push(detail.status));
  await terminal.ready;
  const opened = new Promise((resolve) =>
    terminal.addEventListener('ready', resolve, { once: true })
  );
  terminal.backend = kernelBackend(window.kernel, { cwd: '/home', env: { PS1: 'slicc:\\w\\$ ' } });
  await opened;
  window.terminal = terminal;
  terminal.focus();
  return true;
};

window.missing = async () => {
  const terminal = document.createElement('slicc-terminal');
  terminal.setAttribute('rows', '4');
  const errors = [];
  terminal.addEventListener('error', ({ detail }) => errors.push(detail.error.message));
  terminal.backend = kernelBackend(window.kernel, { argv: ['no-such-command'] });
  document.getElementById('stage').append(terminal);
  const ready = await terminal.ready.then(
    () => 'resolved',
    (error) => `rejected: ${error.message}`
  );
  return { ready, errors };
};
