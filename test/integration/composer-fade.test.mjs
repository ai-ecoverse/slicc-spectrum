import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t, width, height) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto('/ui/?delay=5&color=light');
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  if (width === 420) await page.until(() => document.querySelector('slicc-app').screen === 'phone');
  await page.evaluate(() => {
    window.log = () => window.chatPart('.log');
    window.composer = () => window.chatPart('slicc-composer');
    window.field = () =>
      window.$(
        'slicc-app',
        'slicc-dock',
        'slicc-chat',
        'slicc-composer',
        'swc-prompt-field',
        'textarea'
      );
    window.clearance = () => {
      const log = window.log();
      const composer = window.composer();
      const last = window.chatPart('swc-conversation-thread').lastElementChild;
      const texts = [];
      const walk = (node) => {
        for (const child of [...(node.shadowRoot?.childNodes ?? []), ...node.childNodes]) {
          if (child.nodeType === Node.TEXT_NODE) {
            if (
              child.textContent.trim() &&
              child.parentElement.checkVisibility({ visibilityProperty: true })
            )
              texts.push(child);
          } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
        }
      };
      walk(last);
      let bottom = 0;
      for (const text of texts) {
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const box of range.getClientRects())
          if (box.height) bottom = Math.max(bottom, box.bottom);
      }
      const fade = -Number.parseFloat(getComputedStyle(composer, '::before').top);
      return {
        gap: log.scrollHeight - log.scrollTop - log.clientHeight,
        fade,
        lines: texts.length,
        clear: Math.round(composer.getBoundingClientRect().top - fade - bottom),
      };
    };
    return true;
  });
  await page.evaluate(() => window.model.agent.select('cone-kitchen'));
  await page.until(() => window.log().scrollHeight > window.log().clientHeight * 4);
  await page.until(() => window.composer().getBoundingClientRect().right <= innerWidth);
  return page;
}

async function bottom(page) {
  await page.until(() => {
    const log = window.log();
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 1;
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  return page.evaluate(() => window.clearance());
}

for (const [width, height] of [
  [1280, 800],
  [420, 860],
]) {
  test(`at the bottom of the transcript the last line clears the composer's glass at ${width} px`, async (t) => {
    const page = await open(t, width, height);
    const start = await bottom(page);
    assert.ok(start.fade > 0, JSON.stringify(start));
    assert.ok(start.lines > 0, JSON.stringify(start));
    assert.ok(start.clear >= 0, JSON.stringify(start));

    const before = await page.evaluate(() => window.composer().offsetHeight);
    await page.evaluate(() => {
      window.field().focus();
      return true;
    });
    for (const line of ['Check the pantry', 'then the oven', 'then the timers', 'and the bread']) {
      await page.insert(line);
      await page.press('Enter', 'shift');
    }
    await page.until((seen) => window.composer().offsetHeight > seen + 40, before);
    const grown = await bottom(page);
    assert.ok(grown.clear >= 0, JSON.stringify(grown));

    const lined = await page.evaluate(() => window.composer().offsetHeight);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(['flour 2 kg\n'], 'pantry.txt', { type: 'text/plain' }));
      window.field().dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          composed: true,
          cancelable: true,
        })
      );
      return true;
    });
    await page.until(
      () =>
        !!window.$(
          'slicc-app',
          'slicc-dock',
          'slicc-chat',
          'slicc-composer',
          'swc-upload-attachment'
        )
    );
    await page.until((seen) => window.composer().offsetHeight > seen, lined);
    const attached = await bottom(page);
    assert.ok(attached.clear >= 0, JSON.stringify(attached));
    assert.deepEqual(page.errors, []);
  });
}

for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
  test(`with ${feature} the glass starts at the composer and the transcript ends just above it`, async (t) => {
    const page = await open(t, 1280, 800);
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: feature, value: feature === 'forced-colors' ? 'active' : 'reduce' }],
    });
    t.after(() => page.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {}));
    await page.until(() => getComputedStyle(window.composer(), '::before').top === '0px');
    await page.evaluate(() => {
      window.log().scrollTop = window.log().scrollHeight;
      return true;
    });
    const seen = await bottom(page);
    assert.equal(seen.fade, 0);
    assert.ok(seen.clear >= 0 && seen.clear < 48, JSON.stringify(seen));
    assert.deepEqual(page.errors, []);
  });
}
