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

async function click(page, selector) {
  const { x, y } = await page.evaluate((selector) => {
    const box = window.bedrock(selector).getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
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

test('a field with options is a Spectrum picker preselected by its value, and the chosen one goes to connect and stays', async (t) => {
  const page = await open(t);
  assert.deepEqual(
    await page.evaluate(() => {
      const picker = window.bedrock('sp-picker[data-account-field=region]');
      const key = window.bedrock('sp-textfield');
      return {
        native: !!window.bedrock('input[data-account-field], select'),
        labels: [...window.bedrock('').querySelectorAll('.field > sp-field-label')].map((label) =>
          label.textContent.trim()
        ),
        labelledBy: picker
          .getRootNode()
          .querySelector(`sp-field-label[for="${picker.id}"]`)
          .textContent.trim(),
        required: picker.getAttribute('aria-required'),
        value: picker.value,
        shown: picker.selectedItem?.textContent.trim(),
        options: [...picker.querySelectorAll('sp-menu-item')].map((item) => [
          item.value,
          item.textContent.trim(),
        ]),
        aligned: key.getBoundingClientRect().width === picker.getBoundingClientRect().width,
      };
    }),
    {
      native: false,
      labels: ['Amazon Bedrock API key', 'Region'],
      labelledBy: 'Region',
      required: 'true',
      value: 'us-west-2',
      shown: 'US West (Oregon)',
      options: [
        ['us-east-1', 'US East (N. Virginia)'],
        ['us-west-2', 'US West (Oregon)'],
        ['eu-central-1', 'Europe (Frankfurt)'],
        ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
      ],
      aligned: true,
    }
  );
  await click(page, 'sp-field-label[for=field-region]');
  await page.until(() => {
    const picker = window.bedrock('sp-picker[data-account-field=region]');
    return picker.getRootNode().activeElement === picker;
  });
  await click(page, 'sp-picker[data-account-field=region]');
  await page.until(() => window.bedrock('sp-picker[data-account-field=region]').open === true);
  await page.until(
    () => window.bedrock('sp-menu-item[value=eu-central-1]').getBoundingClientRect().height > 0
  );
  await click(page, 'sp-menu-item[value=eu-central-1]');
  await page.until(
    () => window.bedrock('sp-picker[data-account-field=region]').value === 'eu-central-1'
  );
  assert.deepEqual(await save(page), [{ region: 'eu-central-1' }]);
  assert.equal(
    await page.evaluate(() =>
      window.settingsPart('.account[data-id=amazon-bedrock] .identity').textContent.trim()
    ),
    'API key · Europe (Frankfurt)'
  );
  await page.evaluate(() => {
    window.model.settings.disconnect('amazon-bedrock');
    return true;
  });
  await page.until(
    () => !!window.settingsPart('.account[data-id=amazon-bedrock] swc-button[data-action=connect]')
  );
  await page.evaluate(() =>
    window.settingsPart('.account[data-id=amazon-bedrock] swc-button[data-action=connect]').click()
  );
  await page.until(() => !!window.bedrock('sp-picker[data-account-field=region]'));
  assert.equal(
    await page.evaluate(() => window.bedrock('sp-picker[data-account-field=region]').value),
    'eu-central-1'
  );
  assert.deepEqual(page.errors, []);
});

test('without a value the first option is chosen, an empty list explains itself, and a field without options stays a text input', async (t) => {
  const page = await open(t, (account) =>
    account.id === 'amazon-bedrock'
      ? {
          ...account,
          fields: [
            { ...account.fields[0], value: undefined },
            { name: 'zone', label: 'Zone', required: true, options: [] },
            { name: 'profile', label: 'Profile' },
          ],
        }
      : account
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.bedrock('sp-picker[data-account-field=region]').value,
      window.bedrock('sp-picker[data-account-field=zone]').disabled,
      window.bedrock('[data-empty=zone]')?.textContent.trim(),
      window.bedrock('input[data-account-field=profile]')?.type,
      !!window.bedrock('sp-picker[data-account-field=profile]'),
    ]),
    ['us-east-1', true, 'Nothing to choose from yet. You can connect without it.', 'text', false]
  );
  await page.evaluate(() => {
    window.bedrock('input[data-account-field=profile]').value = 'harbor';
    return true;
  });
  assert.deepEqual(await save(page), [{ region: 'us-east-1', profile: 'harbor' }]);
  assert.deepEqual(page.errors, []);
});
