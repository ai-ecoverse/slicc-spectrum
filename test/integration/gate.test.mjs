import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const gate = (kind, command) => {
  const run = spawnSync('node', ['.github/scripts/gate.mjs', kind, command], { encoding: 'utf8' });
  return { code: run.status, verdict: run.stdout.trim().split('\n').at(-1) };
};
const summary = (tests, pass, fail) =>
  `printf 'ℹ tests ${tests}\\nℹ pass ${pass}\\nℹ fail ${fail}\\n'`;

test('the CI gate passes only on an explicit verdict, so silence never reads as a pass', () => {
  assert.deepEqual(gate('integration', summary(3, 3, 0)), {
    code: 0,
    verdict: 'integration: PASS 3 of 3 tests',
  });
  assert.deepEqual(gate('integration', "printf '# tests 2\\n# pass 2\\n# fail 0\\n'"), {
    code: 0,
    verdict: 'integration: PASS 2 of 2 tests',
  });
  assert.deepEqual(gate('integration', 'true'), {
    code: 1,
    verdict: 'integration: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('integration', summary(0, 0, 0)), {
    code: 1,
    verdict: 'integration: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('integration', summary(3, 2, 1)), {
    code: 1,
    verdict: 'integration: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('integration', `${summary(3, 3, 0)}; exit 2`), {
    code: 1,
    verdict: 'integration: FAIL exit 2',
  });
  assert.deepEqual(gate('integration', `${summary(3, 3, 0)} | cat; false | cat`), {
    code: 1,
    verdict: 'integration: FAIL exit 1',
  });
  assert.deepEqual(gate('lint', "echo 'ok: no comments besides # renovate: annotations'"), {
    code: 0,
    verdict: 'lint: PASS comments, biome and the repo rules',
  });
  assert.deepEqual(gate('lint', 'exit 0'), {
    code: 1,
    verdict: 'lint: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('nope', 'true'), {
    code: 1,
    verdict: 'nope: FAIL usage: gate.mjs lint|integration "<command>"',
  });
});
