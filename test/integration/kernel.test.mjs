import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const screen = () => document.querySelector('slicc-terminal .term-grid').textContent;

async function booted(t) {
  const page = await chrome.page(t);
  await page.goto('/kernel.html');
  await page.until(() => typeof window.boot === 'function');
  await page.evaluate(() => window.boot());
  await page.until(() =>
    document.querySelector('slicc-terminal .term-grid').textContent.includes('slicc:~$')
  );
  return page;
}

async function shows(page, text) {
  await page.until(
    (needle) => document.querySelector('slicc-terminal .term-grid').textContent.includes(needle),
    text
  );
}

test('bash -i runs in the terminal against OPFS, with job control and resize', async (t) => {
  const page = await booted(t);

  await page.type('echo "sum $((6 * 7))"');
  await page.press('Enter');
  await shows(page, 'sum 42');

  await page.type('ls; cat notes.txt');
  await page.press('Enter');
  await shows(page, 'hello from OPFS');

  await page.type('printf "\\033[1;31mred\\033[0m\\n"');
  await page.press('Enter');
  await page.until(() =>
    [...document.querySelectorAll('slicc-terminal .term-row span')].some(
      (span) => span.textContent === 'red' && getComputedStyle(span).color === 'rgb(244, 71, 71)'
    )
  );

  await page.evaluate(() => window.terminal.resize(90, 20));
  await page.type('stty size');
  await page.press('Enter');
  await shows(page, '20 90');

  await page.type('sleep 30');
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.press('c', 'ctrl');
  await shows(page, '^C');
  await new Promise((resolve) => setTimeout(resolve, 100));
  await page.type('echo "rc $?"');
  await page.press('Enter');
  await shows(page, 'rc 130');

  await page.type('sleep 30');
  await page.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.press('z', 'ctrl');
  await shows(page, 'Stopped');
  await page.type('kill %1; jobs; echo listed');
  await page.press('Enter');
  await shows(page, 'listed');

  await page.type('exit 7');
  await page.press('Enter');
  await page.until(() => window.statuses.length === 1);
  assert.deepEqual(await page.evaluate(() => window.statuses), [7]);
  await page.screenshot(new URL('bash.png', page.dir));
  assert.deepEqual(page.errors, []);
  assert.ok((await page.evaluate(screen)).includes('sum 42'));
});

test('a missing command rejects ready and reports an error', async (t) => {
  const page = await booted(t);
  const result = await page.evaluate(() => window.missing());
  assert.deepEqual(result, {
    ready: 'rejected: no-such-command: command not found',
    errors: ['no-such-command: command not found'],
  });
  assert.deepEqual(page.errors, []);
});
