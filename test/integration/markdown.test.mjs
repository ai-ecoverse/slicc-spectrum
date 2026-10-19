import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

async function open(t) {
  const page = await chrome.page(t);
  await page.goto(`/ui/?${new URLSearchParams({ delay: '5', color: 'light' })}`);
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  await page.until(() => !!window.chatPart());
  await page.evaluate(() => {
    const agent = window.model.agent;
    const messages = agent.messages.bind(agent);
    window.posted = [];
    agent.messages = (id) =>
      id === 'cone-sliccy' ? [...messages(id), ...window.posted] : messages(id);
    window.post = async (id, text, status = 'done') => {
      const message = {
        id,
        role: 'assistant',
        status,
        parts: [{ type: 'text', text }],
        createdAt: Date.now(),
        model: 'dummy',
      };
      window.posted.push(message);
      agent.emit('messages', 'cone-sliccy');
      await window.chatPart().updateComplete;
      return message;
    };
    window.rendered = (id) => window.chatPart(`[data-id=${id}] .text`);
    return true;
  });
  return page;
}

test('chat markdown nests code and links inside emphasis', async (t) => {
  const page = await open(t);
  await page.evaluate(() =>
    window
      .post(
        'md-nest',
        'Or **`curlwright`**, **[the docs](https://example.com/docs)**, *`x`* and ~~**old**~~.'
      )
      .then(() => true)
  );
  await page.until(() => !!window.rendered('md-nest'));
  assert.deepEqual(
    await page.evaluate(() => {
      const text = window.rendered('md-nest');
      const link = text.querySelector('strong > a');
      return {
        code: text.querySelector('strong > code')?.textContent,
        link: [link?.textContent, link?.getAttribute('href'), link?.getAttribute('target')],
        em: text.querySelector('em > code')?.textContent,
        struck: text.querySelector('s > strong')?.textContent,
        ticks: text.textContent.includes('`'),
        smaller:
          Number.parseFloat(getComputedStyle(text.querySelector('strong > code')).fontSize) <
          Number.parseFloat(getComputedStyle(text.querySelector('p')).fontSize),
      };
    }),
    {
      code: 'curlwright',
      link: ['the docs', 'https://example.com/docs', '_blank'],
      em: 'x',
      struck: 'old',
      ticks: false,
      smaller: true,
    }
  );
  assert.deepEqual(page.errors, []);
});

test('chat markdown spaces loose lists, aligns table columns and keeps quote paragraphs', async (t) => {
  const page = await open(t);
  await page.evaluate(() =>
    window
      .post(
        'md-blocks',
        'Setext\n===\n\n- one\n\n  more\n- [x] two\n\n| left | mid | right |\n| --- | :-: | --: |\n| a | b | c |\n\n> said\n>\n> twice\n\n1. step\n   - sub\n\n###### deep'
      )
      .then(() => true)
  );
  await page.until(() => !!window.rendered('md-blocks')?.querySelector('table'));
  assert.deepEqual(
    await page.evaluate(() => {
      const text = window.rendered('md-blocks');
      const cells = [...text.querySelectorAll('td')];
      return {
        headings: [...text.querySelectorAll('[role=heading]')].map((heading) => [
          heading.textContent,
          heading.getAttribute('aria-level'),
        ]),
        items: [...text.querySelectorAll('li')].map(
          (item) => item.querySelectorAll(':scope > p').length
        ),
        task: text.querySelector('li > p:first-child > .task')?.dataset.done,
        aligned: (() => {
          const [first, task] = [...text.querySelectorAll('ul > li')];
          return (
            Math.abs(first.getBoundingClientRect().left - task.getBoundingClientRect().left) < 1
          );
        })(),
        nested:
          Number.parseFloat(getComputedStyle(text.querySelector('ol ul')).marginBlockStart) > 0,
        bullet: getComputedStyle(text.querySelectorAll('li')[1]).listStyleType,
        align: [...text.querySelectorAll('th')].map((cell) => cell.dataset.align ?? null),
        textAlign: cells.map((cell) => getComputedStyle(cell).textAlign),
        quote: [...text.querySelectorAll('blockquote > p')].map((p) => p.textContent),
      };
    }),
    {
      headings: [
        ['Setext', '3'],
        ['deep', '6'],
      ],
      items: [2, 1, 0, 0],
      task: 'true',
      aligned: true,
      nested: true,
      bullet: 'none',
      align: [null, 'center', 'right'],
      textAlign: ['start', 'center', 'right'],
      quote: ['said', 'twice'],
    }
  );
  assert.deepEqual(page.errors, []);
});

test('chat markdown shows raw HTML as text and never links javascript URLs', async (t) => {
  const page = await open(t);
  await page.evaluate(() =>
    window
      .post(
        'md-unsafe',
        '<script>window.pwned = 1</script>\n\nHi <img src=x onerror="window.pwned = 2"> [click](javascript:window.pwned=3) <a href="javascript:alert(1)">raw</a> ![pic](javascript:x)'
      )
      .then(() => true)
  );
  await page.until(() => !!window.rendered('md-unsafe'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(
    await page.evaluate(() => {
      const text = window.rendered('md-unsafe');
      return {
        elements: text.querySelectorAll('script, img, a').length,
        shown: [
          '<script>',
          '<img src=x onerror=',
          'click',
          '<a href="javascript:alert(1)">',
          'pic',
        ].every((part) => text.textContent.includes(part)),
        pwned: window.pwned ?? null,
      };
    }),
    { elements: 0, shown: true, pwned: null }
  );
  assert.deepEqual(page.errors, []);
});

test('a streaming reply renders like the finished text and keeps the DOM of its earlier blocks', async (t) => {
  const page = await open(t);
  const result = await page.evaluate(async () => {
    const text =
      '# Plan\n\nFirst **bold `code`** line\nwith a soft break.\n\nintro\n\n  - a\n\n      b\n\n\t- tabbed\n\n\t  more\n\n- one\n- two\n\n  loose\n\n| a | b |\n| - | -: |\n| 1 | 2 |\n\n```ts\nconst a = 1;\n```\n\n> quote\nlazy\n\nSetext\n---\n\n1. x\n2. y\n\nSee [the docs][d].\n\n[d]: https://example.com/docs\n\ndone';
    const clean = (element) => element.innerHTML.replace(/<!--[^>]*-->/g, '');
    const stream = await window.post('md-stream', '', 'streaming');
    const reference = await window.post('md-reference', '');
    const mismatches = [];
    let heading = null;
    let kept = true;
    for (let end = 1; end <= text.length; end += 7) {
      stream.parts[0].text = text.slice(0, end);
      reference.parts[0].text = `${'\n'.repeat((end % 9) + 1)}${text.slice(0, end)}`;
      window.model.agent.emit('message', { agentId: 'cone-sliccy', message: stream });
      await window.chatPart().updateComplete;
      const streamed = window.rendered('md-stream');
      if (clean(streamed) !== clean(window.rendered('md-reference')))
        mismatches.push(text.slice(0, end));
      const first = streamed.querySelector('[role=heading]');
      if (heading && first !== heading) kept = false;
      heading ??= first;
    }
    const interrupted = [
      'Intro\n***',
      'Intro\n***bold*** text',
      'Intro\n***bold*** text\n\nUse\n#',
      'Intro\n***bold*** text\n\nUse\n#include x',
    ];
    const lazy = await window.post('md-lazy', '', 'streaming');
    for (const [index, prefix] of interrupted.entries()) {
      lazy.parts[0].text = prefix;
      reference.parts[0].text = `${'\n'.repeat(index + 11)}${prefix}`;
      window.model.agent.emit('message', { agentId: 'cone-sliccy', message: lazy });
      await window.chatPart().updateComplete;
      if (clean(window.rendered('md-lazy')) !== clean(window.rendered('md-reference')))
        mismatches.push(prefix);
    }
    stream.parts[0].text = text;
    stream.status = 'done';
    reference.parts[0].text = `\n${text}`;
    window.model.agent.emit('message', { agentId: 'cone-sliccy', message: stream });
    await window.chatPart().updateComplete;
    const streamed = window.rendered('md-stream');
    return {
      mismatches,
      kept: kept && streamed.querySelector('[role=heading]') === heading,
      same: clean(streamed) === clean(window.rendered('md-reference')),
      link: streamed.querySelector('a')?.getAttribute('href'),
    };
  });
  assert.deepEqual(result, {
    mismatches: [],
    kept: true,
    same: true,
    link: 'https://example.com/docs',
  });
  assert.deepEqual(page.errors, []);
});

test('memory entries render the same markdown as the chat', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    window.model.memory.save({
      id: 'md-memory',
      scope: 'global',
      section: 'Tools',
      title: 'Fetching inside a tab',
      body: 'Use **`curlwright`** for a fetch inside the tab.\n\n- Open the site first\n- Then fetch\n\n| tool | when |\n| --- | --: |\n| `curlwright` | logged in |',
      tag: null,
    });
    window.$('slicc-app', '.rail.left [data-surface=memory]').click();
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('memory')
        ?.shadowRoot.querySelector('[data-id=md-memory] .head')
  );
  await page.evaluate(() => {
    window
      .$('slicc-app', 'slicc-dock')
      .content('memory')
      .shadowRoot.querySelector('[data-id=md-memory] .head')
      .click();
    return true;
  });
  await page.until(
    () =>
      !!window
        .$('slicc-app', 'slicc-dock')
        .content('memory')
        .shadowRoot.querySelector('[data-id=md-memory] .body table')
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const body = window
        .$('slicc-app', 'slicc-dock')
        .content('memory')
        .shadowRoot.querySelector('[data-id=md-memory] .body');
      const list = body.querySelector('ul');
      const cells = [...body.querySelectorAll('td')].map((cell) => getComputedStyle(cell));
      return {
        code: body.querySelector('strong > code')?.textContent,
        bullets: [
          getComputedStyle(list).listStyleType,
          getComputedStyle(list.querySelector('li')).display,
        ],
        borders: cells.map((cell) => [
          cell.borderTopStyle,
          Number.parseFloat(cell.borderTopWidth) > 0,
        ]),
        align: [...body.querySelectorAll('td')].map((cell) => cell.dataset.align ?? null),
        textAlign: cells.map((cell) => cell.textAlign),
        whole: getComputedStyle(body.querySelector('td code')).overflowWrap,
        smaller:
          Number.parseFloat(getComputedStyle(body.querySelector('p code')).fontSize) <
          Number.parseFloat(getComputedStyle(body.querySelector('p')).fontSize),
      };
    }),
    {
      code: 'curlwright',
      bullets: ['disc', 'list-item'],
      borders: [
        ['solid', true],
        ['solid', true],
      ],
      align: [null, 'right'],
      textAlign: ['start', 'right'],
      whole: 'normal',
      smaller: true,
    }
  );
  assert.deepEqual(page.errors, []);
});
