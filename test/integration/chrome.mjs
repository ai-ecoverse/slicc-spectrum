import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { artifacts, raw, slug, source } from './artifacts.mjs';
import { connect } from './cdp.mjs';
import { serve } from './server.mjs';

const profiled = new Set(['page', 'worker']);
const flags = [
  '--headless',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--hide-scrollbars',
  '--mute-audio',
  '--window-size=1280,800',
];

async function start(profile) {
  const args = [...flags, `--user-data-dir=${profile}`, 'about:blank'];
  const child = spawn(chromium.executablePath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  const url = await new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    child.once('exit', (code) => reject(new Error(`Chromium exited with ${code}\n${log}`)));
  });
  return { child, url };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const masks = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const keys = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9, text: '\t' },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Escape: { code: 'Escape', keyCode: 27 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
};

function page(cdp, sessionId, server) {
  const send = (method, params) => cdp.send(method, params, sessionId);
  const errors = [];
  const dispose = cdp.on(({ method, params, sessionId: from }) => {
    if (from !== sessionId) return;
    if (method === 'Runtime.exceptionThrown') {
      const { exception, text } = params.exceptionDetails;
      errors.push(exception?.description ?? text);
    }
  });

  async function evaluate(fn, ...args) {
    const expression = `(${fn})(...${JSON.stringify(args)})`;
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description);
    return result.value;
  }

  return {
    errors,
    dispose,
    evaluate,
    goto: (path) => send('Page.navigate', { url: new URL(path, server.url).href }),
    async until(fn, ...args) {
      const deadline = Date.now() + 30000;
      let last;
      while (Date.now() < deadline) {
        last = await evaluate(fn, ...args).catch((error) => error.message);
        if (last === true) return;
        await sleep(25);
      }
      throw new Error(`Timed out waiting for ${fn}\nlast result: ${JSON.stringify(last)}`);
    },
    async press(key, ...modifiers) {
      const bits = modifiers.reduce((sum, name) => sum | masks[name], 0);
      const named = keys[key];
      const code = named?.code ?? `Key${key.toUpperCase()}`;
      const keyCode = named?.keyCode ?? key.toUpperCase().charCodeAt(0);
      const text = bits & ~masks.shift ? undefined : (named?.text ?? (named ? undefined : key));
      const event = { key, code, windowsVirtualKeyCode: keyCode, modifiers: bits, text };
      await send('Input.dispatchKeyEvent', { ...event, type: text ? 'keyDown' : 'rawKeyDown' });
      await send('Input.dispatchKeyEvent', { ...event, type: 'keyUp', text: undefined });
    },
    async type(text) {
      for (const key of text) await this.press(key);
    },
    insert: (text) => send('Input.insertText', { text }),
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(file, Buffer.from(data, 'base64'));
    },
  };
}

export async function launch() {
  const server = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'slicc-spectrum-'));
  const { child, url } = await start(profile);
  const cdp = await connect(url);
  const sessions = new Map();
  const tabs = new Map();
  let run = null;

  function label(target) {
    return target.type === 'page' ? 'page' : basename(new URL(target.url).pathname, '.js');
  }

  async function dump(sessionId, target, restart) {
    const coverage = cdp.send('Profiler.takePreciseCoverage', {}, sessionId);
    const cpu = cdp.send('Profiler.stop', {}, sessionId);
    const [{ result }, { profile }] = await Promise.all([coverage, cpu]).catch(() => [{}, {}]);
    if (!result || !run) return;
    if (restart) cdp.send('Profiler.start', {}, sessionId).catch(() => {});
    const ours = (script) => script.url.startsWith(`${server.url}dist/`);
    run.scripts.push(...result.filter(ours));
    const name = `${String(++run.dumps).padStart(3, '0')}-${label(target)}.cpuprofile`;
    await writeFile(new URL(name, run.dir), JSON.stringify(profile));
  }

  async function checkpoint() {
    const current = [...sessions].filter(
      ([, target]) =>
        target.browserContextId === run?.context &&
        (target.type === 'page' || target.url.startsWith(`${server.url}dist/`))
    );
    await Promise.all(current.map(([sessionId, target]) => dump(sessionId, target, true)));
  }

  function attach({ sessionId, targetInfo, waitingForDebugger }) {
    const commands = [];
    if (profiled.has(targetInfo.type)) {
      sessions.set(sessionId, targetInfo);
      commands.push(
        ['Runtime.enable'],
        ['Profiler.enable'],
        ['Profiler.setSamplingInterval', { interval: 100 }],
        ['Profiler.startPreciseCoverage', { callCount: true, detailed: true }],
        ['Profiler.start'],
        ['Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }]
      );
    }
    if (targetInfo.type === 'page') {
      commands.push(
        ['Debugger.enable'],
        ['Page.enable'],
        [
          'Page.addScriptToEvaluateOnNewDocument',
          { source: "addEventListener('beforeunload', () => { debugger; })" },
        ]
      );
    }
    if (waitingForDebugger) commands.push(['Runtime.runIfWaitingForDebugger']);
    const ready = commands.reduce(
      (chain, [method, params]) =>
        chain.then(() => cdp.send(method, params, sessionId).catch(() => {})),
      Promise.resolve()
    );
    if (targetInfo.type === 'page') tab(targetInfo.targetId).resolve(ready.then(() => sessionId));
    return ready;
  }

  function tab(targetId) {
    if (!tabs.has(targetId)) {
      const slot = {};
      slot.session = new Promise((resolve) => {
        slot.resolve = resolve;
      });
      tabs.set(targetId, slot);
    }
    return tabs.get(targetId);
  }

  function log(sessionId, line) {
    const target = sessions.get(sessionId);
    if (!run || target?.browserContextId !== run.context) return;
    run.console.push(`${label(target)}: ${line}`);
  }

  async function paused(sessionId) {
    const target = sessions.get(sessionId);
    if (target?.type === 'worker') await dump(sessionId, target, false);
    else await checkpoint();
    await cdp.send('Debugger.resume', {}, sessionId).catch(() => {});
  }

  cdp.on(async ({ method, params, sessionId }) => {
    if (method === 'Target.attachedToTarget') await attach(params).catch(() => {});
    if (method === 'Target.detachedFromTarget') sessions.delete(params.sessionId);
    if (method === 'Runtime.consoleAPICalled') {
      const text = params.args.map((arg) => arg.value ?? arg.description).join(' ');
      log(sessionId, `${params.type} ${text}`);
    }
    if (method === 'Runtime.exceptionThrown') {
      const { exception, text } = params.exceptionDetails;
      log(sessionId, `uncaught ${exception?.description ?? text}`);
    }
    if (method === 'Debugger.paused') await paused(sessionId);
  });
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });

  async function open(browserContextId) {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    });
    const sessionId = await tab(targetId).session;
    tabs.delete(targetId);
    return page(cdp, sessionId, server);
  }

  async function finish(pages, browserContextId) {
    const shots = pages.map((opened, i) => opened.screenshot(new URL(`tab-${i + 1}.png`, run.dir)));
    await Promise.all(shots);
    await checkpoint();
    const entries = run.scripts.map(async (script) => {
      const file = source(script.url);
      const map = await readFile(`${file}.map`, 'utf8').catch(() => null);
      return {
        ...script,
        url: pathToFileURL(file).href,
        source: await readFile(file, 'utf8'),
        ...(map ? { sourceMap: JSON.parse(map) } : {}),
      };
    });
    await mkdir(raw, { recursive: true });
    await writeFile(new URL(`${run.name}.json`, raw), JSON.stringify(await Promise.all(entries)));
    await writeFile(
      new URL('console.log', run.dir),
      run.console.map((line) => `${line}\n`).join('')
    );
    for (const opened of pages) opened.dispose();
    run = null;
    await cdp.send('Target.disposeBrowserContext', { browserContextId });
  }

  return {
    requests: server.requests,
    async page(t) {
      const suite = slug(basename(t.filePath, '.test.mjs'));
      const dir = new URL(`${suite}/${slug(t.name)}/`, artifacts);
      await mkdir(dir, { recursive: true });
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      run = {
        dir,
        name: `${suite}-${slug(t.name)}`,
        context: browserContextId,
        scripts: [],
        console: [],
        dumps: 0,
      };
      server.requests.length = 0;
      const pages = [];
      t.after(() => finish(pages, browserContextId));
      const opened = await open(browserContextId);
      opened.dir = dir;
      pages.push(opened);
      return opened;
    },
    async close() {
      await cdp.send('Browser.close').catch(() => {});
      cdp.close();
      if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
      await rm(profile, { recursive: true, force: true });
      await server.close();
    },
  };
}
