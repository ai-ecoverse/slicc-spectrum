import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { clickApproval } from './approval-click.mjs';
import { open } from './approvals-page.mjs';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

test('a sudo request that times out offers Run now in Approvals from the dialog', async (t) => {
  const page = await open(chrome, t);
  await page.until(() => window.dialog()?.dataset.approval === 'apr-open');
  await page.evaluate(() => {
    window.model.approvals.end('apr-open', 'expired');
    return true;
  });
  await page.until(() => window.dialog()?.dataset.gone === 'expired');
  assert.equal(
    await page.evaluate(() => window.dialog().querySelector('[data-run-later]').textContent),
    'Timed out: Run now in Approvals'
  );
  await clickApproval(page, 'open-approvals');
  await page.until(() => window.row('apr-open')?.hasAttribute('data-highlight'));
  assert.equal(await page.evaluate(() => !!window.dialog()), false);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('[data-filter].selected').dataset.filter,
      window.inRow('apr-open', '[data-badge]').textContent.trim(),
      window.inRow('apr-open', '[data-action=run-now]').hasAttribute('disabled'),
    ]),
    ['timed-out', 'Timed out', false]
  );
  assert.deepEqual(page.errors, []);
});

test('the dialog says nothing about Run now without a run method', async (t) => {
  const page = await open(chrome, t, 'soon');
  await page.until(() => window.dialog()?.dataset.approval === 'sudo-jq');
  await page.evaluate(() => {
    window.model.approvals.end('sudo-jq', 'expired');
    return true;
  });
  await page.until(() => window.dialog()?.dataset.gone === 'expired');
  assert.equal(
    await page.evaluate(() => !!window.dialog().querySelector('[data-run-later]')),
    false
  );
  assert.deepEqual(page.errors, []);
});
