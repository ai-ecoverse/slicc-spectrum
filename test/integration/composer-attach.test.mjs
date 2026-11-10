import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (char) => char.charCodeAt(0)
);

async function openUi(t, params = {}) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '0', color: 'light', ...params })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.evaluate(() => {
    const composer = () => window.$('slicc-app', 'slicc-dock', 'slicc-chat', 'slicc-composer');
    window.composer = composer;
    window.addButton = () =>
      composer()
        .shadowRoot.querySelector('swc-prompt-field')
        .shadowRoot.querySelector('.swc-PromptField-upload');
    window.addMenu = () => composer().shadowRoot.querySelector('swc-popover');
    window.popupValues = () => [...(composer().popup?.items ?? [])].map((item) => item.value);
    window.chips = () =>
      composer().attachments.map((attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        path: attachment.path,
        error: attachment.error ?? null,
      }));
  });
  return page;
}

async function openMenu(page) {
  await page.evaluate(() => window.addButton().click());
  await page.until(() => window.addMenu().open === true);
}

test('Attach a file from SLICC lists a file written after subscribe', async (t) => {
  const page = await openUi(t);
  await page.evaluate(() => window.model.files.write('/aaa-late-attach.txt', 'late'));
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=file]').click()
  );
  await page.until(() => window.composer().popup?.kind === 'file');
  await page.until(() => window.popupValues().includes('/aaa-late-attach.txt'));
  assert.ok((await page.evaluate(() => window.popupValues())).includes('/aaa-late-attach.txt'));
  assert.deepEqual(page.errors, []);
});

test('Attach a file from SLICC attaches a PNG as an image', async (t) => {
  const page = await openUi(t);
  await openMenu(page);
  await page.evaluate(() =>
    window.composer().shadowRoot.querySelector('sp-menu-item[value=file]').click()
  );
  await page.until(() => window.composer().popup?.kind === 'file');
  await page.evaluate(() =>
    window.composer().pick({
      value: '/workspace/harbor/static/radar.png',
      label: 'radar.png',
      detail: '/workspace/harbor/static/radar.png',
    })
  );
  await page.until(() => window.chips().some((chip) => chip.kind === 'image'));
  assert.deepEqual(await page.evaluate(() => window.chips()[0]), {
    kind: 'image',
    name: 'radar.png',
    mimeType: 'image/png',
    path: '/workspace/harbor/static/radar.png',
    error: null,
  });
  assert.deepEqual(page.errors, []);
});

test('the OS file picker keeps a PNG as an image', async (t) => {
  const page = await openUi(t);
  await page.evaluate(
    (bytes) => {
      const file = new File([new Uint8Array(bytes)], 'os-pick.png', { type: 'image/png' });
      return window.composer().addFiles([file]);
    },
    [...PNG]
  );
  await page.until(() => window.chips().some((chip) => chip.name === 'os-pick.png'));
  assert.deepEqual(
    await page.evaluate(() => {
      const chip = window.chips()[0];
      return { kind: chip.kind, name: chip.name, mimeType: chip.mimeType, error: chip.error };
    }),
    { kind: 'image', name: 'os-pick.png', mimeType: 'image/png', error: null }
  );
  assert.deepEqual(page.errors, []);
});

async function bootKernel(page) {
  await page.goto('/kernel-ui/');
  await page.until(() => typeof window.boot === 'function');
  await page.evaluate(() => window.boot());
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => window.screen().includes('slicc:~$'));
}

test('kernel-ui Attach from SLICC lists a new OPFS file and attaches text and PNG', async (t) => {
  const page = await chrome.page(t);
  await bootKernel(page);
  await page.evaluate(() => window.terminal().focus());
  await page.type('printf "kernel note\\n" > attach-me.txt');
  await page.press('Enter');
  await page.until(() =>
    window
      .$('slicc-app', 'slicc-dock', 'slicc-files', 'slicc-file-tree')
      .paths.includes('home/attach-me.txt')
  );
  await page.evaluate(
    async (bytes) => {
      const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('home', {
        create: true,
      });
      const handle = await home.getFileHandle('radar.png', { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(bytes));
      await writable.close();
      await window.model.files.refresh();
    },
    [...PNG]
  );
  await page.until(async () =>
    (await window.model.files.list()).some((entry) => entry.path === '/home/radar.png')
  );
  await page.evaluate(async () => {
    const host = document.createElement('slicc-composer');
    host.model = window.model;
    document.body.append(host);
    window.host = host;
    await host.updateComplete;
  });
  await page.until(() => !!window.host?.updateComplete);
  await page.evaluate(() => window.host.openPopup('file'));
  await page.until(() =>
    window.host.popup?.items.some((item) => item.value === '/home/attach-me.txt')
  );
  await page.until(() => window.host.popup?.items.some((item) => item.value === '/home/radar.png'));
  await page.evaluate(() => window.host.attachPath('/home/attach-me.txt'));
  await page.until(() => window.host.attachments.some((item) => item.name === 'attach-me.txt'));
  await page.evaluate(() => window.host.attachPath('/home/radar.png'));
  await page.until(() => window.host.attachments.some((item) => item.name === 'radar.png'));
  assert.deepEqual(
    await page.evaluate(() =>
      window.host.attachments.map((attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        path: attachment.path,
        error: attachment.error ?? null,
      }))
    ),
    [
      {
        kind: 'text',
        name: 'attach-me.txt',
        mimeType: 'text/plain',
        path: '/home/attach-me.txt',
        error: null,
      },
      {
        kind: 'image',
        name: 'radar.png',
        mimeType: 'image/png',
        path: '/home/radar.png',
        error: null,
      },
    ]
  );
  assert.deepEqual(page.errors, []);
});
