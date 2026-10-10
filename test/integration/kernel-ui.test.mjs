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
  await page.evaluate(() => window.terminal().focus());
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
  assert.deepEqual(panels.sort(), ['files', 'terminal:term-1']);
  assert.equal(await page.evaluate(() => window.$('slicc-app', 'sp-picker')), null);
  assert.equal(await page.evaluate(() => window.$('slicc-app', 'slicc-tray')), null);
  assert.equal(
    await page.evaluate(
      () =>
        window.$('slicc-app', 'header .status slot[name=status]').assignedElements()[0].textContent
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
    [...view.shadowRoot.querySelectorAll('swc-action-button, swc-button')]
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
    window.terminal().shadowRoot.querySelector('swc-action-button').click()
  );
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('terminal:term-2'));
  await page.until(() => window.terminal() === window.content('terminal:term-2'));
  await page.until(() => window.screen().includes('slicc:~$'));
  await run(page, 'echo "second $((1 + 1))"', 'second 2');

  await boot(page);
  await page.until(() => window.code('file:/home/notes.txt').includes('from bash'));
  assert.deepEqual(
    await page.evaluate(() =>
      window
        .$('slicc-app', 'slicc-dock')
        .api.panels.map((panel) => panel.id)
        .sort()
    ),
    ['file:/home/notes.txt', 'files', 'terminal:term-1']
  );
  await run(page, 'cat notes.txt', 'edited in a tab');
  assert.deepEqual(page.errors, []);
});

test('moving or floating a terminal panel keeps its bash session', async (t) => {
  const page = await chrome.page(t);
  await boot(page);
  await run(page, 'mkdir -p /tmp; cd /tmp; X=1; echo "set $((40 + 2))"', 'set 42');
  await page.until(
    () => window.terminal().shadowRoot.querySelector('.cwd')?.textContent === '/tmp'
  );
  const lines = () => window.screen().split('\n');

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    const panel = dock.api.getPanel('terminal:term-1');
    const files = dock.api.getPanel('files');
    panel.api.moveTo({ group: files.api.group, position: 'bottom' });
  });
  await page.until(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    return dock.api.getPanel('terminal:term-1').api.group !== dock.api.getPanel('files').api.group;
  });
  await page.until(() => window.screen().includes('set 42'));
  await run(page, 'pwd', 'slicc:/tmp$ pwd');
  await page.until(() => window.screen().split('\n').includes('/tmp'));
  await run(page, 'echo "x=$X"', 'x=1');

  await page.evaluate(() => {
    const dock = window.$('slicc-app', 'slicc-dock');
    dock.api.addFloatingGroup(dock.api.getPanel('terminal:term-1'), {
      x: 80,
      y: 80,
      width: 720,
      height: 360,
    });
  });
  await page.until(
    () =>
      window.$('slicc-app', 'slicc-dock').api.getPanel('terminal:term-1').api.location.type ===
      'floating'
  );
  await page.until(() => window.screen().split('\n').includes('slicc:/tmp$ echo "x=$X"'));
  await page.evaluate(() => window.terminal().focus());
  await page.type('echo "still $X in $(pwd)"');
  await page.press('Enter');
  await page.until(() => window.screen().replace(/\n/g, '').includes('still 1 in /tmp'));
  assert.equal(await page.evaluate(() => window.model.terminals.list().length), 1);
  assert.ok((await page.evaluate(lines)).some((line) => line.includes('x=1')));

  await page.evaluate(() => window.$('slicc-app', 'slicc-dock').close('terminal:term-1'));
  await page.until(() => !!window.$('slicc-app', 'slicc-confirm', '[data-action]'));
  await page.evaluate(() => window.$('slicc-app', 'slicc-confirm', '[data-action]').click());
  await page.until(() => window.model.terminals.list().length === 0);
  await page.evaluate(() => window.app.show('terminal'));
  await page.until(() => window.$('slicc-app', 'slicc-dock').has('terminal:term-2'));
  await page.until(() => window.screen().includes('slicc:~$'));
  await run(page, 'echo "fresh [$X]"', 'fresh []');
  assert.deepEqual(page.errors, []);
});
