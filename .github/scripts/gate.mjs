import { spawn } from 'node:child_process';

const [name, command] = process.argv.slice(2);
const kinds = {
  lint: (output) => (/^slicc-lint: PASS$/m.test(output) ? 'every slicc-lint step' : null),
};

const check = kinds[name];
if (!check || !command) {
  console.log(
    `${name ?? 'gate'}: FAIL usage: gate.mjs ${Object.keys(kinds).join('|')} "<command>"`
  );
  process.exit(1);
}

let output = '';
const child = spawn('bash', ['-o', 'pipefail', '-c', command], {
  stdio: ['inherit', 'pipe', 'pipe'],
});
for (const [from, to] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  from.on('data', (chunk) => {
    output += chunk;
    to.write(chunk);
  });
}
child.on('close', (code, signal) => {
  const verdict = code === 0 ? check(output) : null;
  if (verdict) {
    console.log(`${name}: PASS ${verdict}`);
    return;
  }
  const why = code !== 0 ? `exit ${code ?? signal}` : 'no verdict in the output';
  console.log(`${name}: FAIL ${why}`);
  process.exit(1);
});
