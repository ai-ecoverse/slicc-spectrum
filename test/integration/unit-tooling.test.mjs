import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const env = () => {
  const copy = { ...process.env };
  delete copy.NODE_TEST_CONTEXT;
  delete copy.NODE_V8_COVERAGE;
  delete copy.NODE_OPTIONS;
  return copy;
};

test('a fresh unit test can import src modules that load css and shtml, under happy-dom', () => {
  const script = [
    "const { theme } = await import('./src/app/theme.ts');",
    "await import('./src/ui.ts');",
    "await import('./src/dummy.ts');",
    "const el = document.createElement('slicc-secrets');",
    'document.body.append(el);',
    'await el.updateComplete;',
    "console.log('result ' + JSON.stringify({ css: theme.cssText.includes('--swc-'), shadow: el.shadowRoot !== null }));",
    'process.exit(0);',
  ].join('\n');
  const run = spawnSync(
    'node',
    ['--import', './unit-setup.mjs', '--input-type=module', '-e', script],
    { cwd: root, env: env(), encoding: 'utf8', timeout: 120_000 }
  );
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').find((l) => l.startsWith('result '));
  assert.deepEqual(JSON.parse(line.slice('result '.length)), { css: true, shadow: true });
});

test('test:unit reports src files no unit test ran as uncovered, even under a dot directory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '.slicc-unit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const file of ['package.json', 'mcr.config.mjs', 'unit-setup.mjs']) {
    cpSync(join(root, file), join(dir, file));
  }
  cpSync(join(root, 'src/model'), join(dir, 'src/model'), { recursive: true });
  mkdirSync(join(dir, 'test/unit'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  const run = spawnSync('npm', ['run', '--silent', 'test:unit'], {
    cwd: dir,
    env: { ...env(), SLICC_UNIT_TESTS: '' },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr);
  const lcov = readFileSync(join(dir, 'coverage/unit/lcov.info'), 'utf8');
  const record = lcov.split('end_of_record').find((r) => r.includes('SF:src/model/emitter.ts'));
  assert.ok(record, lcov);
  assert.match(record, /\nLH:0\n/);
});
