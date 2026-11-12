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
    'You can still run it from Approvals.'
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

test('the dialog says nothing about Approvals when the app doesn’t offer the panel', async (t) => {
  const page = await open(chrome, t);
  await page.until(() => window.dialog()?.dataset.approval === 'apr-open');
  await page.evaluate(async () => {
    const { surfaces } = await import('/dist/slicc-ui.js');
    window.app.surfaces = surfaces.filter((item) => item.id !== 'approvals');
    await window.app.updateComplete;
    window.model.approvals.end('apr-open', 'expired');
    return true;
  });
  await page.until(() => window.dialog()?.dataset.gone === 'expired');
  assert.deepEqual(
    await page.evaluate(() => [
      !!window.dialog().querySelector('[data-run-later]'),
      !!window.dialog().querySelector('[data-action=open-approvals]'),
      !!window.$('slicc-app', '[data-surface=approvals]'),
    ]),
    [false, false, false]
  );
  assert.deepEqual(page.errors, []);
});

test('the dialog promises Run now only while the request’s record is runnable', async (t) => {
  const page = await open(chrome, t);
  await page.until(() => window.dialog()?.dataset.approval === 'apr-open');
  await page.evaluate(() => {
    const port = window.model.approvals;
    const history = port.history;
    window.runnable = { reason: 'Thaw harbor first.' };
    port.history = () =>
      history().map((record) =>
        record.approval.id === 'apr-open' ? { ...record, runnable: window.runnable } : record
      );
    port.end('apr-open', 'expired');
    return true;
  });
  await page.until(() => window.dialog()?.dataset.gone === 'expired');
  const shown = () =>
    page.evaluate(() => [
      !!window.dialog().querySelector('[data-run-later]'),
      !!window.dialog().querySelector('[data-action=open-approvals]'),
    ]);
  assert.deepEqual(await shown(), [false, false]);
  await page.evaluate(() => {
    window.runnable = undefined;
    window.model.approvals.emit('history', window.model.approvals.history());
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(await shown(), [false, false]);
  await page.evaluate(() => {
    window.runnable = true;
    window.model.approvals.emit('history', window.model.approvals.history());
    return true;
  });
  await page.until(() => !!window.dialog().querySelector('[data-run-later]'));
  assert.deepEqual(await shown(), [true, true]);
  assert.deepEqual(page.errors, []);
});
