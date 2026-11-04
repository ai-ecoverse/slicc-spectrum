import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('the installed vault contract fits the public spectrum model types', {
  timeout: 60000,
}, () => {
  const run = spawnSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'compat', '--noEmit'],
    { encoding: 'utf8', timeout: 55000 }
  );
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});
