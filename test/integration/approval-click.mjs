export async function waitApprovalArmed(page) {
  await page.evaluate(async () => {
    const host = window.$('slicc-app', 'slicc-approvals');
    const root = host.shadowRoot;
    const ms = () => host.arming;
    const sig = () => {
      const dialog = root.querySelector('dialog');
      const buttons = [...root.querySelectorAll('[slot=button]')];
      return JSON.stringify([
        dialog?.dataset.approval,
        dialog?.dataset.gone,
        null,
        buttons.map((button) => {
          const { left, top, width, height } = button.getBoundingClientRect();
          return [
            button.closest('[data-id]')?.dataset.id ?? null,
            button.dataset.action,
            button.textContent,
            button.hasAttribute('disabled'),
            button.hasAttribute('pending'),
            ...(width || height ? [left, top, width, height].map(Math.round) : []),
          ];
        }),
      ]);
    };
    let last = sig();
    let changed = performance.now();
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      if (performance.now() - changed >= ms()) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
      const next = sig();
      if (next !== last) {
        last = next;
        changed = performance.now();
      }
    }
    throw new Error('approval buttons never stayed still for arming');
  });
}

export async function clickApproval(page, action) {
  const selector = action.startsWith('[') ? action : `[data-action=${action}]`;
  await waitApprovalArmed(page);
  const point = await page.evaluate((selector) => {
    const box = window
      .$('slicc-app', 'slicc-approvals')
      .shadowRoot.querySelector(selector)
      .getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, selector);
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
}
