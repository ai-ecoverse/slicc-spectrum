import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const gate = (kind, command) => {
  const run = spawnSync('node', ['.github/scripts/gate.mjs', kind, command], { encoding: 'utf8' });
  return { code: run.status, verdict: run.stdout.trim().split('\n').at(-1) };
};

test('the lint gate passes only on slicc-lint PASS, so silence never reads as a pass', () => {
  assert.deepEqual(gate('lint', "echo 'slicc-lint: PASS'"), {
    code: 0,
    verdict: 'lint: PASS every slicc-lint step',
  });
  assert.deepEqual(gate('lint', "echo 'slicc-lint-comments: PASS no comments'"), {
    code: 1,
    verdict: 'lint: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('lint', 'exit 0'), {
    code: 1,
    verdict: 'lint: FAIL no verdict in the output',
  });
  assert.deepEqual(gate('lint', "echo 'slicc-lint: PASS'; exit 2"), {
    code: 1,
    verdict: 'lint: FAIL exit 2',
  });
  assert.deepEqual(gate('lint', "echo 'slicc-lint: PASS' | cat; false | cat"), {
    code: 1,
    verdict: 'lint: FAIL exit 1',
  });
});

test('the gate knows lint only, since the pipeline judges the integration tests itself', () => {
  for (const kind of ['integration', 'nope']) {
    assert.deepEqual(gate(kind, 'true'), {
      code: 1,
      verdict: `${kind}: FAIL usage: gate.mjs lint "<command>"`,
    });
  }
});
