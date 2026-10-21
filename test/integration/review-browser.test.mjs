import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { connect, launchBrowser } from '@ai-ecoverse/slicc-cdp';

const root = resolve(import.meta.dirname, '../..');
const hook = (review) => {
  const env = { ...process.env, ...review };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS']) delete env[name];
  return new Promise((done) => {
    const child = spawn('npm', ['run', '--silent', 'review:browser'], { cwd: root, env });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      out += chunk;
    });
    child.on('close', (code) => done({ code, verdict: out.trim().split('\n').at(-1) }));
  });
};

const shown = async (cdp) => {
  const client = await connect({ url: cdp });
  try {
    const { targetInfos } = await client.send('Target.getTargets');
    const page = targetInfos.find((target) => target.type === 'page');
    const session = await client.attach(page.targetId);
    const { result } = await client.send(
      'Runtime.evaluate',
      {
        expression: `({
          url: location.pathname + location.search,
          color: document.querySelector('slicc-app').shadowRoot.querySelector('sp-theme').getAttribute('color'),
          width: outerWidth,
        })`,
        returnByValue: true,
      },
      session
    );
    return result.value;
  } finally {
    client.close();
  }
};

test('review:browser serves a side once and shows its UI page, light over the extension and dark over the cli', async (t) => {
  assert.deepEqual(await hook({ SLICC_REVIEW_SIDE: 'nope' }), {
    code: 1,
    verdict:
      'review:browser: FAIL usage: SLICC_REVIEW_SIDE=head|base SLICC_REVIEW_LINK=extension|cli SLICC_REVIEW_CDP=<url>',
  });
  const browsers = await Promise.all(
    ['extension', 'cli'].map(() =>
      launchBrowser({ headless: !process.env.CI, sandbox: process.platform !== 'linux' })
    )
  );
  let server;
  t.after(async () => {
    if (server) process.kill(-server, 'SIGKILL');
    await Promise.all(browsers.map((browser) => browser.close()));
  });
  const cdp = browsers.map((browser) => `http://127.0.0.1:${browser.port}`);
  const first = await hook({
    SLICC_REVIEW_SIDE: 'head',
    SLICC_REVIEW_LINK: 'extension',
    SLICC_REVIEW_CDP: cdp[0],
  });
  server = Number(/server pid (\d+)/.exec(first.verdict)?.[1]) || undefined;
  assert.equal(first.code, 0, first.verdict);
  assert.match(
    first.verdict,
    /^review:browser: PASS head extension shows http:\/\/127\.0\.0\.1:8301\/ui\/\?delay=0&color=light \(server pid \d+, log /
  );
  const second = await hook({
    SLICC_REVIEW_SIDE: 'head',
    SLICC_REVIEW_LINK: 'cli',
    SLICC_REVIEW_CDP: cdp[1],
  });
  assert.deepEqual(second, {
    code: 0,
    verdict:
      'review:browser: PASS head cli shows http://127.0.0.1:8301/ui/?delay=0&color=dark (reusing the server on http://127.0.0.1:8301)',
  });
  assert.deepEqual(await shown(cdp[0]), {
    url: '/ui/?delay=0&color=light',
    color: 'light',
    width: 1440,
  });
  assert.deepEqual(await shown(cdp[1]), {
    url: '/ui/?delay=0&color=dark',
    color: 'dark',
    width: 1440,
  });
});
