import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, accounts) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  if (accounts) {
    await page.evaluate((source) => {
      const settings = window.model.settings;
      const original = settings.accounts.bind(settings);
      const change = new Function(`return ${source}`)();
      settings.accounts = () => original().map(change);
      return true;
    }, accounts.toString());
  }
  await page.evaluate(() => window.$('slicc-app', 'header swc-action-button#settings').click());
  await page.until(
    () => !!window.settingsPart('.account[data-id=amazon-bedrock] swc-button[data-action=connect]')
  );
  await page.evaluate(() =>
    window.settingsPart('.account[data-id=amazon-bedrock] swc-button[data-action=connect]').click()
  );
  await page.until(() => !!window.settingsPart('form.key[data-id=amazon-bedrock] sp-textfield'));
  await page.evaluate(() => {
    window.bedrock = (selector) =>
      window.settingsPart(`form.key[data-id=amazon-bedrock] ${selector}`);
    return true;
  });
  return page;
}

async function save(page) {
  await page.evaluate(() => {
    window.bedrock('sp-textfield').value = 'dummy-key-0000';
    window.bedrock('swc-button[data-action=save]').click();
    return true;
  });
  await page.until(() =>
    window.settingsPart('.account[data-id=amazon-bedrock]').textContent.includes('Connected')
  );
  return page.evaluate(() =>
    window.model.settings.connects
      .filter((call) => call.id === 'amazon-bedrock')
      .map((call) => call.fields)
  );
}

test('a field with options is a dropdown preselected by its value, and the chosen one goes to connect', async (t) => {
  const page = await open(t);
  assert.deepEqual(
    await page.evaluate(() => {
      const select = window.bedrock('select[data-account-field=region]');
      return {
        inputs: !!window.bedrock('input[data-account-field]'),
        label: select.closest('label').querySelector('span').textContent.trim(),
        required: select.getAttribute('aria-required'),
        value: select.value,
        options: [...select.options].map((option) => [option.value, option.textContent.trim()]),
      };
    }),
    {
      inputs: false,
      label: 'Region',
      required: 'true',
      value: 'us-west-2',
      options: [
        ['us-east-1', 'US East (N. Virginia)'],
        ['us-west-2', 'US West (Oregon)'],
        ['eu-central-1', 'Europe (Frankfurt)'],
        ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
      ],
    }
  );
  await page.evaluate(() => {
    const select = window.bedrock('select[data-account-field=region]');
    select.value = 'eu-central-1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  assert.deepEqual(await save(page), [{ region: 'eu-central-1' }]);
  assert.deepEqual(page.errors, []);
});

test('without a value the first option is chosen, and a field without options stays a text input', async (t) => {
  const page = await open(t, (account) =>
    account.id === 'amazon-bedrock'
      ? {
          ...account,
          fields: [
            { ...account.fields[0], value: undefined },
            { name: 'profile', label: 'Profile' },
          ],
        }
      : account
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.bedrock('select[data-account-field=region]').value,
      window.bedrock('input[data-account-field=profile]')?.type,
      !!window.bedrock('select[data-account-field=profile]'),
    ]),
    ['us-east-1', 'text', false]
  );
  await page.evaluate(() => {
    window.bedrock('input[data-account-field=profile]').value = 'harbor';
    return true;
  });
  assert.deepEqual(await save(page), [{ region: 'us-east-1', profile: 'harbor' }]);
  assert.deepEqual(page.errors, []);
});
