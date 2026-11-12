import assert from 'node:assert/strict';
import { clickApproval } from './approval-click.mjs';

export async function open(chrome, t, approvals = 'history', extra = '') {
  const page = await chrome.page(t);
  await page.goto(`/ui/?delay=0&color=light&approvals=${approvals}${extra}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  await page.evaluate(() => {
    window.panel = () => window.$('slicc-app', 'slicc-dock', 'slicc-approvals-panel');
    window.part = (selector) => window.panel()?.shadowRoot.querySelector(selector);
    window.row = (id) => window.part(`.row[data-id="${id}"]`);
    window.inRow = (id, selector) => window.row(id)?.querySelector(selector);
    window.ids = () =>
      [...window.panel().shadowRoot.querySelectorAll('.row[data-id]')].map((row) => row.dataset.id);
    window.dialog = () =>
      window.$('slicc-app', 'slicc-approvals')?.shadowRoot.querySelector('dialog');
    window.command = async (...args) => {
      const { panelCommand } = await import('/dist/slicc-ui.js');
      return panelCommand(window.app, ['panel', ...args], { agentId: null });
    };
    return true;
  });
  return page;
}

export async function press(page, find, ...args) {
  await page.until(
    (source, args) => !!new Function(`return (${source})`)()(...args),
    String(find),
    args
  );
  const point = await page.evaluate(
    (source, args) => {
      const element = new Function(`return (${source})`)()(...args);
      element.scrollIntoView({ block: 'center' });
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    },
    String(find),
    args
  );
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
}

export async function armed(page, selector) {
  await page.evaluate(
    (selector) =>
      new Promise((resolve) => {
        const host = window.panel();
        const sig = () =>
          JSON.stringify(
            [...host.shadowRoot.querySelectorAll(selector)].map((node) => {
              const box = node.getBoundingClientRect();
              return [box.left, box.top, box.width, box.height].map(Math.round);
            })
          );
        let last = sig();
        let since = performance.now();
        const tick = () => {
          const next = sig();
          if (next !== last) {
            last = next;
            since = performance.now();
          }
          if (performance.now() - since > host.arming + 100) resolve(true);
          else setTimeout(tick, 25);
        };
        tick();
      }),
    selector
  );
}

export async function answerDialog(page) {
  await page.until(() => window.dialog()?.dataset.approval === 'apr-open');
  await clickApproval(page, 'deny');
  await page.until(() => !window.dialog());
}

export async function showPanel(page) {
  const result = await page.evaluate(() => window.command('open', 'approvals'));
  assert.equal(result.code, 0, result.stderr);
  await page.until(() => !!window.part('.bar[data-surface=approvals]'));
}

export async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.screenshot(new URL(`${name}.png`, page.dir));
}

export const filter = (page, name) =>
  press(page, (name) => window.part(`[data-filter="${name}"]`), name);
