import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dist = new URL('./dist/', import.meta.url);
const wasm = new URL('./node_modules/@wterm/core/wasm/wterm.wasm', import.meta.url);
const dockview = new URL('./node_modules/dockview-core/dist/dockview-core.js', import.meta.url);

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

const dockviewCss = {
  name: 'dockview-css',
  setup(build) {
    build.onResolve({ filter: /^dockview-core\/css$/ }, () => ({
      path: 'dockview-core/css',
      namespace: 'dockview-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'dockview-css' }, async () => {
      const umd = await readFile(dockview, 'utf8');
      const css = JSON.parse(umd.match(/s\.textContent = (".*");/)[1]);
      return { contents: `export default ${JSON.stringify(css)};`, loader: 'js' };
    });
  },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(wasm, new URL('wterm.wasm', dist));
await mkdir(new URL('fonts/', dist), { recursive: true });
for (const weight of [400, 600]) {
  const name = `source-code-pro-latin-${weight}-normal.woff2`;
  await copyFile(
    new URL(`./node_modules/@fontsource/source-code-pro/files/${name}`, import.meta.url),
    new URL(`fonts/${name}`, dist)
  );
}
const { metafile } = await build({
  entryPoints: {
    'slicc-terminal': 'src/index.ts',
    'slicc-ui': 'src/ui.ts',
    'slicc-dummy': 'src/dummy.ts',
  },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  chunkNames: 'chunk-[hash]',
  format: 'esm',
  platform: 'browser',
  target: 'es2024',
  sourcemap: 'linked',
  loader: { '.css': 'text' },
  plugins: [inline, dockviewCss],
  logLevel: 'warning',
  metafile: true,
});
const react = Object.keys(metafile.inputs).filter((input) =>
  /node_modules\/react(-dom)?\//.test(input)
);
if (react.length > 0) throw new Error(`React must not be bundled: ${react.join(', ')}`);

const tsc = fileURLToPath(new URL('./node_modules/.bin/tsc', import.meta.url));
execFileSync(tsc, ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const types = new URL('types/', dist);
for (const name of await readdir(types, { recursive: true })) {
  if (!name.endsWith('.d.ts')) continue;
  const file = new URL(name, types);
  const source = await readFile(file, 'utf8');
  await writeFile(file, source.replace(/((?:from|import\() '\.\.?\/[^']+)\.ts'/g, "$1.js'"));
}
