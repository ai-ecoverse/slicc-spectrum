import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, execPath, exit } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { connect } from '@ai-ecoverse/slicc-cdp';

const ports = { head: 8301, base: 8302 };
const colors = { extension: 'light', cli: 'dark' };
const { SLICC_REVIEW_SIDE: side, SLICC_REVIEW_LINK: link, SLICC_REVIEW_CDP: cdp } = env;

const fail = (why) => {
  console.log(`review:browser: FAIL ${why}`);
  exit(1);
};

if (!Object.hasOwn(ports, side) || !Object.hasOwn(colors, link) || !cdp) {
  fail('usage: SLICC_REVIEW_SIDE=head|base SLICC_REVIEW_LINK=extension|cli SLICC_REVIEW_CDP=<url>');
}

const port = ports[side];
const origin = `http://127.0.0.1:${port}`;
const log = join(tmpdir(), `slicc-spectrum-review-${side}.log`);
const up = () =>
  fetch(`${origin}/ui/`)
    .then((response) => response.ok)
    .catch(() => false);

const until = async (what, check, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(250);
  }
  fail(`${what} after ${ms / 1000} s`);
};

const serve = async () => {
  if (!existsSync('dist/slicc-ui.js')) {
    const build = spawnSync('npm', ['run', 'build'], { stdio: ['ignore', 2, 2] });
    if (build.status !== 0) fail(`npm run build exited with ${build.status ?? build.signal}`);
  }
  const out = openSync(log, 'w');
  const server = spawn(execPath, ['test/integration/chrome.mjs'], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...env, PORT: String(port) },
  });
  server.unref();
  let ended = null;
  server.once('exit', (code, signal) => {
    ended = code ?? signal;
  });
  await until(
    `no test page on ${origin} (see ${log})`,
    () => {
      if (ended !== null)
        fail(`the test page server exited with ${ended}: ${readFileSync(log, 'utf8')}`);
      return readFileSync(log, 'utf8').includes('slicc-spectrum test page on');
    },
    120_000
  );
  return `server pid ${server.pid}, log ${log}`;
};

const server = (await up()) ? `reusing the server on ${origin}` : await serve();
const url = `${origin}/ui/?delay=0&color=${colors[link]}`;

const client = await connect({ url: cdp });
const { targetInfos } = await client.send('Target.getTargets');
const blank = targetInfos.find((target) => target.type === 'page');
const targetId = blank
  ? blank.targetId
  : (await client.send('Target.createTarget', { url: 'about:blank' })).targetId;
const session = await client.attach(targetId);
const { windowId } = await client.send('Browser.getWindowForTarget', { targetId });
await client.send('Browser.setWindowBounds', { windowId, bounds: { width: 1440, height: 900 } });
await client.send('Page.navigate', { url }, session);
const ready = `(async () => {
  const theme = document.querySelector('slicc-app')?.shadowRoot?.querySelector('sp-theme');
  if (document.readyState !== 'complete' || !theme) return false;
  await document.fonts.ready;
  return theme.getAttribute('color') === ${JSON.stringify(colors[link])};
})()`;
await until(
  `${url} never showed slicc-app`,
  async () => {
    const answer = await client
      .send(
        'Runtime.evaluate',
        { expression: ready, awaitPromise: true, returnByValue: true },
        session
      )
      .catch(() => null);
    return answer?.result?.value === true;
  },
  60_000
);
await client.send('Target.detachFromTarget', { sessionId: session });
client.close();
console.log(`review:browser: PASS ${side} ${link} shows ${url} (${server})`);
exit(0);
