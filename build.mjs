import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { env } from 'node:process';
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

const bundledLanguages = new Set([
  'css',
  'diff',
  'html',
  'javascript',
  'json',
  'jsonc',
  'jsx',
  'markdown',
  'python',
  'shellscript',
  'sql',
  'toml',
  'tsx',
  'typescript',
  'xml',
  'yaml',
]);

const grammarBase = env.SLICC_GRAMMAR_BASE ?? 'https://cdn.jsdelivr.net/npm/@shikijs/';
const shikiVersions = {
  langs: JSON.parse(
    await readFile(new URL('./node_modules/@shikijs/langs/package.json', import.meta.url))
  ).version,
  themes: JSON.parse(
    await readFile(new URL('./node_modules/@shikijs/themes/package.json', import.meta.url))
  ).version,
};

const grammarLoader = fileURLToPath(new URL('./src/app/grammars.ts', import.meta.url));
const peers = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url))
).peerDependencies;
for (const kind of ['langs', 'themes']) {
  if (peers[`@shikijs/${kind}`] !== shikiVersions[kind]) {
    throw new Error(
      `peerDependencies @shikijs/${kind} is ${peers[`@shikijs/${kind}`]}, but ${shikiVersions[kind]} is installed`
    );
  }
}
const grammarImport = /import\((["'])@shikijs\/(langs|themes)\/([\w.-]+)\1\)/g;

const grammars = {
  name: 'grammars-on-demand',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/].+\.m?js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      if (!/import\(["']@shikijs\//.test(source)) return undefined;
      const contents = source.replace(grammarImport, (call, _quote, kind, name) =>
        kind === 'langs' && bundledLanguages.has(name)
          ? call
          : `__sliccGrammar(${JSON.stringify(kind)}, ${JSON.stringify(name)})`
      );
      const header = `import { grammar as __sliccLoad } from ${JSON.stringify(grammarLoader)};\nconst __sliccGrammar = (kind, name) => __sliccLoad(kind, name, ${JSON.stringify(shikiVersions)}[kind], ${JSON.stringify(grammarBase)});\n`;
      return { contents: header + contents, loader: 'js' };
    });
    build.onResolve({ filter: /^@shikijs\/(langs|themes)\/[\w.-]+$/ }, (args) => {
      const [, kind, name] = args.path.match(/^@shikijs\/(langs|themes)\/([\w.-]+)$/);
      if (kind === 'langs' && bundledLanguages.has(name)) return undefined;
      return {
        path: `${grammarBase}${kind}@${shikiVersions[kind]}/dist/${name}.mjs`,
        external: true,
      };
    });
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
    'slicc-kernel-model': 'src/kernel.ts',
  },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  chunkNames: 'chunk-[hash]',
  format: 'esm',
  platform: 'browser',
  target: 'es2024',
  sourcemap: 'linked',
  loader: { '.css': 'text', '.shtml': 'text' },
  plugins: [inline, dockviewCss, grammars],
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
