import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

test('the test page is cross-origin isolated and allows eval', async (t) => {
  const page = await chrome.page(t);
  await page.goto('/');
  await page.until(() => typeof window.probe === 'function');
  assert.deepEqual(await page.evaluate(() => window.probe()), {
    isolated: true,
    shared: true,
    evaluates: true,
  });
  assert.deepEqual(page.errors, []);
});
