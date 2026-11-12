import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { clickApproval } from './approval-click.mjs';
import { answerDialog, open, press, shot } from './approvals-page.mjs';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

test('a sudo-run lick has the terminal icon, warns on a non-zero exit and links to its row', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('.lick[data-channel=sudo-run]'));
  const licks = await page.evaluate(() =>
    [...window.chatPart().shadowRoot.querySelectorAll('.lick[data-channel=sudo-run]')].map(
      (lick) => {
        const turn = lick.closest('.lick-turn');
        return [
          lick.dataset.severity ?? null,
          !!turn.querySelector('.reaction swc-icon-code'),
          turn.querySelector('[data-action=show-approval]')?.dataset.approval,
        ];
      }
    )
  );
  assert.deepEqual(licks, [
    [null, true, 'apr-exit'],
    ['warn', true, 'apr-exit'],
  ]);
  await press(page, () =>
    [...window.chatPart().shadowRoot.querySelectorAll('[data-action=show-approval]')].at(-1)
  );
  await page.until(() => window.row('apr-exit')?.hasAttribute('data-highlight'));
  await shot(page, 'approvals-lick');
  assert.equal(
    await page.evaluate(() => window.part('[data-filter].selected').dataset.filter),
    'timed-out'
  );
  assert.deepEqual(page.errors, []);
});

test('a sudo-run lick has no link without an Approvals panel', async (t) => {
  const page = await open(chrome, t, 'agent');
  await page.until(() => window.dialog()?.dataset.approval === 'sudo-jq');
  await clickApproval(page, 'deny');
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => !!window.chatPart('.lick[data-channel=sudo-run]'));
  assert.equal(await page.evaluate(() => !!window.chatPart('[data-action=show-approval]')), false);
  assert.deepEqual(page.errors, []);
});

test('a sudo-run lick has no link when the app doesn’t offer the Approvals panel', async (t) => {
  const page = await open(chrome, t);
  await answerDialog(page);
  await page.evaluate(async () => {
    const { surfaces } = await import('/dist/slicc-ui.js');
    window.app.surfaces = surfaces.filter((item) => item.id !== 'approvals');
    await window.app.updateComplete;
    window.model.agent.select('cone-kitchen');
    return true;
  });
  await page.until(() => !!window.chatPart('.lick[data-channel=sudo-run]'));
  assert.deepEqual(
    await page.evaluate(() => [
      window.chatPart().shadowRoot.querySelectorAll('.lick[data-channel=sudo-run]').length,
      !!window.chatPart('[data-action=show-approval]'),
    ]),
    [2, false]
  );
  assert.deepEqual(page.errors, []);
});
