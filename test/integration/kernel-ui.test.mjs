import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function boot(page) {
  await page.goto('/kernel-ui/');
  await page.until(() => typeof window.boot === 'function');
  await page.evaluate(() => window.boot());
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => window.screen().includes('slicc:~$'));
}

async function run(page, command, expected) {
  await page.evaluate(() => window.$('slicc-app', 'slicc-dock', 'slicc-terminals').focus());
  await page.type(command);
  await page.press('Enter');
  await page.until((text) => window.screen().includes(text), expected);
}

test('terminals and files run on slicc-kernel and OPFS, and keep across a reload', async (t) => {
  const page = await chrome.page(t);
  await boot(page);

  const panels = await page.evaluate(() =>
    window.$('slicc-app', 'slicc-dock').api.panels.map((panel) => panel.id)
  );
  assert.deepEqual(panels.sort(), ['files', 'terminal']);
  assert.equal(await page.evaluate(() => window.$('slicc-app', 'sp-picker')), null);
  assert.equal(await page.evaluate(() => window.$('slicc-app', 'slicc-tray')), null);
  assert.equal(
    await page.evaluate(
      () => window.$('slicc-app', 'footer slot[name=status]').assignedElements()[0].textContent
    ),
    'network: test'
  );

  await run(page, 'echo "sum $((6 * 7))" > notes.txt; cat notes.txt', 'sum 42');
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .paths.includes('home/notes.txt')
  );
  await page.evaluate(() => {
    const tree = window.$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree');
    tree.tree.getItem('home/').expand();
    tree.reveal('home/notes.txt');
  });
  await page.until(() => !!window.row('home/notes.txt'));
  await page.evaluate(() => window.row('home/notes.txt').click());
  await page.until(() => window.code('file:/home/notes.txt').includes('sum 42'));

  await page.evaluate(() => {
    const view = window.content('file:/home/notes.txt');
    [...view.shadowRoot.querySelectorAll('sp-action-button')]
      .find((button) => button.textContent.trim() === 'Edit')
      .click();
  });
  await page.until(
    () => !!window.content('file:/home/notes.txt').shadowRoot.querySelector('textarea')
  );
  await page.evaluate(() => {
    const area = window.content('file:/home/notes.txt').shadowRoot.querySelector('textarea');
    area.value = 'edited in a tab\n';
    area.dispatchEvent(new Event('input'));
    area.focus();
  });
  await page.press('s', 'ctrl');
  await page.until(() => window.code('file:/home/notes.txt').includes('edited in a tab'));
  await run(page, 'cat notes.txt', 'edited in a tab');

  await run(page, 'echo "from bash" >> notes.txt; echo appended', 'appended');
  await page.until(() => window.code('file:/home/notes.txt').includes('from bash'));
  await page.screenshot(new URL('kernel-ui.png', page.dir));

  await page.evaluate(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-terminals')
      .shadowRoot.querySelector('[label="New terminal"]')
      .click()
  );
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock', 'slicc-terminals').shadowRoot.querySelectorAll('.tab')
        .length === 2
  );
  await page.until(() => window.screen().includes('slicc:~$'));
  await run(page, 'echo "second $((1 + 1))"', 'second 2');

  await boot(page);
  await page.until(() => window.code('file:/home/notes.txt').includes('from bash'));
  await run(page, 'cat notes.txt', 'edited in a tab');
  assert.deepEqual(page.errors, []);
});
