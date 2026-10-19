import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`);
  await page.until(() => window.ready === true && window.app.dock.api.panels.length > 0);
  t.after(() => page.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {}));
  await page.evaluate(() => {
    window.part = (selector) =>
      window.$('slicc-app', 'slicc-dock').content('memory')?.shadowRoot.querySelector(selector);
    window.parts = (selector) => [
      ...(window
        .$('slicc-app', 'slicc-dock')
        .content('memory')
        ?.shadowRoot.querySelectorAll(selector) ?? []),
    ];
    window.app.show('memory');
    return true;
  });
  await page.until(() => {
    const head = window.part('.row[data-id=mem-6] .head');
    return !!head && head.getBoundingClientRect().width > 0;
  });
  return page;
}

async function measure(page, id) {
  return page.evaluate((id) => {
    const row = window.part(`.row[data-id=${id}]`);
    const rect = (node) => {
      const at = node.getBoundingClientRect();
      return [at.left, at.top, at.width, at.height].map((value) => Math.round(value * 2) / 2);
    };
    return {
      head: rect(row.querySelector('.head')),
      title: rect(row.querySelector('.title')),
      scope: rect(row.querySelector('[data-scope]')),
      height: row.getBoundingClientRect().height,
    };
  }, id);
}

const settled = (id) =>
  window
    .part(`.row[data-id=${id}]`)
    .getAnimations({ subtree: true })
    .every((animation) => animation.playState !== 'running');

test('a memory opens in place: its title and scope stay put and it only grows below', async (t) => {
  const page = await open(t);
  const before = await measure(page, 'mem-6');
  const running = await page.evaluate(async () => {
    window.part('.row[data-id=mem-6] .head').click();
    await window.$('slicc-app', 'slicc-dock').content('memory').updateComplete;
    return window
      .part('.row[data-id=mem-6]')
      .getAnimations({ subtree: true })
      .map((animation) => animation.transitionProperty);
  });
  assert.ok(running.includes('height') && running.includes('transform'), running.join());
  await page.until(settled, 'mem-6');
  const opened = await measure(page, 'mem-6');
  assert.deepEqual(
    [opened.head, opened.title, opened.scope],
    [before.head, before.title, before.scope]
  );
  assert.ok(opened.height > before.height + 20, `${before.height} → ${opened.height}`);
  assert.equal(
    await page.evaluate(() =>
      window.part('.row[data-id=mem-6] .head').getAttribute('aria-expanded')
    ),
    'true'
  );
  await page.evaluate(() => {
    window.part('.row[data-id=mem-6] .head').click();
    return true;
  });
  await page.until(() => !window.part('.row[data-open]'));
  await page.until(settled, 'mem-6');
  assert.deepEqual(await measure(page, 'mem-6'), before);
  assert.deepEqual(page.errors, []);
});

test('a memory opens without animating under reduced motion', async (t) => {
  const page = await open(t);
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const before = await measure(page, 'mem-6');
  const running = await page.evaluate(async () => {
    window.part('.row[data-id=mem-6] .head').click();
    await window.$('slicc-app', 'slicc-dock').content('memory').updateComplete;
    const row = window.part('.row[data-id=mem-6]');
    return [
      row.getAnimations({ subtree: true }).length,
      getComputedStyle(row.querySelector('.content')).transitionDuration,
      getComputedStyle(row.querySelector('.chevron')).transitionDuration,
    ];
  });
  assert.deepEqual(running, [0, '0s', '0s']);
  const opened = await measure(page, 'mem-6');
  assert.deepEqual([opened.title, opened.scope], [before.title, before.scope]);
  assert.ok(opened.height > before.height + 20);
  assert.deepEqual(page.errors, []);
});

test('rows under a heading that names their tag carry no tag, others show it as a labelled icon', async (t) => {
  const page = await open(t);
  const tags = () =>
    window.parts('section').map((section) => [
      section.querySelector('h3').textContent,
      [...section.querySelectorAll('.row')].map((row) => {
        const tag = row.querySelector('[data-tag]');
        return tag ? [tag.dataset.tag, tag.getAttribute('aria-label')] : null;
      }),
    ]);
  const seen = await page.evaluate(tags);
  assert.deepEqual(
    seen.find(([heading]) => heading === 'Projects'),
    ['Projects', [null, null]]
  );
  assert.deepEqual(
    seen.find(([heading]) => heading === 'Preferences'),
    [
      'Preferences',
      [
        ['feedback', 'Feedback'],
        ['feedback', 'Feedback'],
      ],
    ]
  );
  assert.equal(await page.evaluate(() => window.parts('swc-badge').length), 0);
  await page.evaluate(() => {
    const picker = window.part('.tools sp-picker[label=Tag]');
    picker.value = 'feedback';
    picker.dispatchEvent(new Event('change'));
    return true;
  });
  await page.until(() => /4 of 10 memories/.test(window.part('.bar').textContent));
  assert.equal(await page.evaluate(() => window.parts('[data-tag]').length), 0);
  assert.deepEqual(page.errors, []);
});

test('the scope is an icon with an accessible name', async (t) => {
  const page = await open(t);
  const name = async (selector) => {
    const { result } = await page.send('Runtime.evaluate', {
      expression: `window.part(${JSON.stringify(selector)})`,
    });
    const { nodes } = await page.send('Accessibility.getPartialAXTree', {
      objectId: result.objectId,
      fetchRelatives: false,
    });
    return [nodes[0].role?.value, nodes[0].name?.value];
  };
  assert.deepEqual(await name('.row[data-id=mem-1] [data-scope]'), ['image', 'Shared']);
  assert.deepEqual(await name('.row[data-id=mem-6] [data-scope]'), ['image', 'harbor only']);
  assert.deepEqual(
    await page.evaluate(() => [
      window.part('.row[data-id=mem-6] [data-scope]').textContent.trim(),
      !!window.part('.row[data-id=mem-6] [data-scope] swc-icon-user'),
    ]),
    ['', true]
  );
  assert.deepEqual(page.errors, []);
});

test('Edit and Forget sit at the trailing end, and Forget asks first', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.part('.row[data-id=mem-6] .head').click();
    return true;
  });
  await page.until(() => !!window.part('.row[data-id=mem-6] [data-action=forget]'));
  await page.until(settled, 'mem-6');
  const [content, edit, forget] = await page.evaluate(() =>
    [
      '.row[data-id=mem-6] .content',
      '.row[data-id=mem-6] [data-action=edit]',
      '.row[data-id=mem-6] [data-action=forget]',
    ].map((selector) => {
      const rect = window.part(selector).getBoundingClientRect();
      return [rect.left, rect.right];
    })
  );
  assert.ok(Math.abs(forget[1] - content[1]) <= 1, `${forget} in ${content}`);
  assert.ok(edit[1] <= forget[0], `${edit} before ${forget}`);
  const count = await page.evaluate(() => window.model.memory.list().length);
  await page.evaluate(() => {
    window.part('.row[data-id=mem-6] [data-action=forget]').click();
    return true;
  });
  await page.until(
    () => window.$('slicc-app', 'slicc-confirm')?.shadowRoot.querySelector('dialog')?.open
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const confirm = window.$('slicc-app', 'slicc-confirm').shadowRoot;
      return [
        confirm.querySelector('h2').textContent,
        confirm.querySelector('sp-alert-dialog').getAttribute('variant'),
        window.model.memory.list().length,
      ];
    }),
    ['Forget “Cache keys”?', 'destructive', count]
  );
  await page.evaluate(() => {
    window.$('slicc-app', 'slicc-confirm').shadowRoot.querySelector('[data-cancel]').click();
    return true;
  });
  await page.until(() => !window.$('slicc-app', 'slicc-confirm'));
  assert.equal(await page.evaluate(() => window.model.memory.list().length), count);
  assert.ok(await page.evaluate(() => !!window.part('.row[data-id=mem-6]')));
  assert.deepEqual(page.errors, []);
});

test('an open memory names its tag and scope in words next to their icons, a closed one shows only the icons', async (t) => {
  const page = await open(t);
  const labels = (id) =>
    window.parts(`.row[data-id=${id}] [data-label]`).map((label) => {
      const icon = label.querySelector('[aria-hidden=true]').getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(label);
      const words = [...text.getClientRects()].at(-1);
      return [
        label.dataset.label,
        label.innerText.trim(),
        icon.width > 0 && words.left >= icon.right && words.left - icon.right < 16,
      ];
    });
  assert.deepEqual(await page.evaluate(labels, 'mem-6'), []);
  const marks = (id) =>
    window.parts(`.row[data-id=${id}] .head .mark`).map((mark) => {
      const box = mark.getBoundingClientRect();
      return [
        mark.dataset.tag ?? mark.dataset.scope,
        getComputedStyle(mark).visibility,
        [box.left, box.top, box.width],
      ];
    });
  const closed = await page.evaluate(marks, 'mem-6');
  assert.deepEqual(
    closed.map(([name, seen]) => [name, seen]),
    [
      ['project', 'visible'],
      ['cone-harbor', 'visible'],
    ]
  );
  for (const [id, expected] of [
    [
      'mem-6',
      [
        ['tag', 'Project', true],
        ['scope', 'harbor only', true],
      ],
    ],
    [
      'mem-1',
      [
        ['tag', 'Feedback', true],
        ['scope', 'Shared', true],
      ],
    ],
  ]) {
    await page.evaluate((id) => {
      window.part(`.row[data-id=${id}] .head`).click();
      return true;
    }, id);
    await page.until((id) => !!window.part(`.row[data-id=${id}][data-open]`), id);
    await page.until(settled, id);
    assert.deepEqual(await page.evaluate(labels, id), expected);
    const shown = await page.evaluate(marks, id);
    assert.deepEqual(
      shown.map(([, seen]) => seen),
      ['hidden', 'hidden']
    );
    if (id === 'mem-6')
      assert.deepEqual(
        shown.map(([, , box]) => box),
        closed.map(([, , box]) => box)
      );
    assert.equal(await page.evaluate(() => window.parts('[data-label]').length), expected.length);
  }
  assert.deepEqual(page.errors, []);
});

async function rules(page) {
  return page.evaluate(() =>
    window.parts('li.row + li.row').map((row) => {
      const line = getComputedStyle(row, '::before');
      const own = getComputedStyle(row);
      const drawn = line.content === 'none' ? own : line;
      const box = row.getBoundingClientRect();
      return {
        id: row.dataset.id,
        radius: [drawn.borderTopLeftRadius, drawn.borderTopRightRadius],
        thickness: line.content === 'none' ? own.borderTopWidth : line.height,
        spans: line.content === 'none' || Math.abs(parseFloat(line.width) - box.width) < 0.5,
        top: line.content === 'none' || line.top === '0px',
      };
    })
  );
}

for (const width of [1280, 420]) {
  test(`memory rows are divided by one straight hairline each, open or closed, at ${width}`, async (t) => {
    const page = await open(t);
    if (width === 420) {
      t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 860,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.until(() => window.app.screen === 'phone');
      await page.evaluate(() => {
        window.app.show('memory');
        return true;
      });
      await page.until(() => {
        const row = window.part('.row[data-id=mem-2]');
        return !!row && row.getBoundingClientRect().right <= innerWidth;
      });
    }
    await page.evaluate(() => {
      window.part('.row[data-id=mem-1] .head').click();
      return true;
    });
    await page.until(() => !!window.part('.row[data-id=mem-1][data-open]'));
    await page.until(settled, 'mem-1');
    const seen = await rules(page);
    assert.ok(seen.length >= 4, JSON.stringify(seen));
    assert.ok(
      seen.some((rule) => rule.id === 'mem-2'),
      JSON.stringify(seen)
    );
    for (const rule of seen)
      assert.deepEqual(
        rule,
        { id: rule.id, radius: ['0px', '0px'], thickness: '1px', spans: true, top: true },
        rule.id
      );
    assert.deepEqual(page.errors, []);
  });
}

for (const width of [1280, 420]) {
  test(`a closed memory shows two whole lines, nothing half-cut under the clamp, and they stay put when it opens, at ${width}`, async (t) => {
    const page = await open(t);
    if (width === 420) {
      t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 860,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.until(() => window.app.screen === 'phone');
      await page.evaluate(() => {
        window.app.show('memory');
        return true;
      });
      await page.until(() => {
        const row = window.part('.row[data-id=mem-6]');
        return !!row && row.getBoundingClientRect().right <= innerWidth;
      });
    }
    const cut = () =>
      window.parts('.row:not([data-open])').flatMap((row) => {
        const box = row.querySelector('.content').getBoundingClientRect();
        const walker = document.createTreeWalker(row.querySelector('.body'), NodeFilter.SHOW_TEXT);
        const lines = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects())
            if (rect.height && rect.top < box.bottom - 0.5 && rect.bottom > box.bottom + 0.5)
              lines.push([row.dataset.id, node.textContent.slice(0, 20), rect.top, box.bottom]);
        }
        return lines;
      });
    const lines = () => {
      const row = window.part('.row[data-id=mem-6]');
      const box = row.querySelector('.content').getBoundingClientRect();
      const walker = document.createTreeWalker(row.querySelector('.body'), NodeFilter.SHOW_TEXT);
      const seen = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.height && rect.bottom <= box.bottom + 0.5)
            seen.push(Math.round(rect.top * 2) / 2);
      }
      return seen
        .sort((a, b) => a - b)
        .filter((top, index, all) => index === 0 || top - all[index - 1] > 4);
    };
    for (const body of [null, 'Short one.\n\nSecond short.\n\nThird.']) {
      if (body) {
        await page.evaluate((body) => {
          const memory = window.model.memory.list().find((item) => item.id === 'mem-6');
          window.model.memory.save({ ...memory, body });
          return true;
        }, body);
        await page.until(
          (body) =>
            window.part('.row[data-id=mem-6] .body')?.textContent.startsWith(body.slice(0, 9)),
          body
        );
        await page.until(settled, 'mem-6');
      }
      assert.deepEqual(await page.evaluate(cut), []);
      const before = await page.evaluate(lines);
      assert.equal(before.length, 2, JSON.stringify(before));
      await page.evaluate(() => {
        window.part('.row[data-id=mem-6] .head').click();
        return true;
      });
      await page.until(() => !!window.part('.row[data-id=mem-6][data-open]'));
      await page.until(settled, 'mem-6');
      assert.deepEqual((await page.evaluate(lines)).slice(0, 2), before, body ?? 'mem-6');
      await page.evaluate(() => {
        window.part('.row[data-id=mem-6] .head').click();
        return true;
      });
      await page.until(() => !window.part('.row[data-id=mem-6][data-open]'));
      await page.until(settled, 'mem-6');
    }
    assert.deepEqual(page.errors, []);
  });
}
