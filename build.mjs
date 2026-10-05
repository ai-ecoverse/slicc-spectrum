import { copyFile, mkdir, rm } from 'node:fs/promises';
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
