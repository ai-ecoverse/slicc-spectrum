import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dist = new URL('./dist/', import.meta.url);
const wasm = new URL('./node_modules/@wterm/core/wasm/wterm.wasm', import.meta.url);

const inline = {
  name: 'no-inline-wasm',
  setup(build) {
    build.onResolve({ filter: /\/wasm-inline\.js$/ }, () => ({
      path: 'wasm-inline',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: "export const WASM_BASE64 = '';",
    }));
  },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(wasm, new URL('wterm.wasm', dist));
await build({
  entryPoints: { 'slicc-terminal': 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2024',
  sourcemap: 'linked',
  loader: { '.css': 'text' },
  plugins: [inline],
  logLevel: 'warning',
});

const tsc = fileURLToPath(new URL('./node_modules/.bin/tsc', import.meta.url));
execFileSync(tsc, ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const types = new URL('types/', dist);
for (const name of await readdir(types)) {
  const file = new URL(name, types);
  const source = await readFile(file, 'utf8');
  await writeFile(file, source.replace(/(from '\.\/[^']+)\.ts'/g, "$1.js'"));
}
