import { html, nothing, type TemplateResult } from 'lit';

export interface ListItem {
  text: string;
  task: boolean | null;
  children: Block | null;
}

export type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'rule' }
  | { type: 'paragraph'; text: string };

const inlinePattern =
  /(`[^`]+`|!\[[^\]]*\]\([^)\s]+\)|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;

function safeUrl(url: string, images = false): boolean {
  return (
    /^https?:\/\//.test(url) ||
    (images && /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/.test(url))
  );
}

function wrapped(token: string, open: string, close = open): string | null {
  return token.length > open.length + close.length &&
    token.startsWith(open) &&
    token.endsWith(close)
    ? token.slice(open.length, -close.length)
    : null;
}

export function inline(text: string): TemplateResult[] {
  return text.split(inlinePattern).map((token) => {
    const code = wrapped(token, '`');
    if (code !== null) return html`<code>${code}</code>`;
    const image = token.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image)
      return safeUrl(image[2], true)
        ? html`<img src=${image[2]} alt=${image[1]} />`
        : html`${image[1]}`;
    const strong = wrapped(token, '**');
    if (strong !== null) return html`<strong>${strong}</strong>`;
    const strike = wrapped(token, '~~');
    if (strike !== null) return html`<s>${strike}</s>`;
    const em = wrapped(token, '*');
    if (em !== null) return html`<em>${em}</em>`;
    const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && safeUrl(link[2])) {
      return html`<a href=${link[2]} target="_blank" rel="noopener noreferrer">${link[1]}</a>`;
    }
    return html`${link ? link[1] : token}`;
  });
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function fence(lines: string[], start: number): [Block, number] {
  const lang = lines[start].slice(3).trim();
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('```')) end++;
  return [{ type: 'code', lang, text: lines.slice(start + 1, end).join('\n') }, end + 1];
}

function run(lines: string[], start: number, test: (line: string) => boolean): number {
  let end = start;
  while (end < lines.length && test(lines[end])) end++;
  return end;
}

const itemPattern = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function indent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function list(lines: string[]): Block {
  const base = indent(lines[0]);
  const ordered = /^\s*\d+\./.test(lines[0]);
  const items: ListItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(itemPattern);
    if (!match) {
      const last = items.at(-1);
      if (last) last.text += ` ${lines[i].trim()}`;
      i++;
      continue;
    }
    const end = run(lines, i + 1, (line) => indent(line) > base);
    let child = i + 1;
    let text = match[3];
    while (child < end && !itemPattern.test(lines[child])) text += ` ${lines[child++].trim()}`;
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    items.push({
      text: task ? task[2] : text,
      task: task ? task[1] !== ' ' : null,
      children: child < end ? list(lines.slice(child, end)) : null,
    });
    i = end;
  }
  return { type: 'list', ordered, items };
}

const starts = /^(```|#{1,4}\s|\s*\||>\s?|---\s*$)/;

function block(lines: string[], i: number): [Block | null, number] {
  const line = lines[i];
  if (line.startsWith('```')) return fence(lines, i);
  const heading = line.match(/^(#{1,4})\s+(.*)$/);
  if (heading) return [{ type: 'heading', level: heading[1].length, text: heading[2] }, i + 1];
  if (/^---\s*$/.test(line)) return [{ type: 'rule' }, i + 1];
  if (line.trim().startsWith('|')) {
    const end = run(lines, i, (l) => l.trim().startsWith('|'));
    const rows = lines.slice(i, end).filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    return [{ type: 'table', rows: rows.map(cells) }, end];
  }
  if (/^>\s?/.test(line)) {
    const end = run(lines, i, (l) => /^>\s?/.test(l));
    return [
      {
        type: 'quote',
        text: lines
          .slice(i, end)
          .map((l) => l.replace(/^>\s?/, ''))
          .join(' '),
      },
      end,
    ];
  }
  if (itemPattern.test(line)) {
    const end = run(
      lines,
      i,
      (l) => itemPattern.test(l) || (l.trim() !== '' && indent(l) > indent(line))
    );
    return [list(lines.slice(i, end)), end];
  }
  if (!line.trim()) return [null, i + 1];
  const end = run(lines, i, (l) => l.trim() !== '' && !starts.test(l) && !itemPattern.test(l));
  return [{ type: 'paragraph', text: lines.slice(i, end).join(' ') }, end];
}

export function parse(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const [next, end] = block(lines, i);
    if (next) blocks.push(next);
    i = end;
  }
  return blocks;
}

function item(entry: ListItem): TemplateResult {
  const box =
    entry.task === null
      ? nothing
      : html`<span class="task" data-done=${entry.task ? 'true' : 'false'} aria-label=${entry.task ? 'done' : 'open'}>${entry.task ? '☑' : '☐'}</span> `;
  return html`<li>${box}${inline(entry.text)}${entry.children ? render(entry.children) : nothing}</li>`;
}

function render(entry: Block): TemplateResult {
  switch (entry.type) {
    case 'code':
      return html`<pre class="code" data-lang=${entry.lang || nothing}><code>${entry.text}</code></pre>`;
    case 'heading':
      return html`<p class="heading" role="heading" aria-level=${entry.level + 2}>${inline(entry.text)}</p>`;
    case 'list': {
      const items = entry.items.map(item);
      return entry.ordered ? html`<ol>${items}</ol>` : html`<ul>${items}</ul>`;
    }
    case 'table': {
      const [head, ...body] = entry.rows;
      return html`<div class="table"><table>
        <thead><tr>${head.map((cell) => html`<th>${inline(cell)}</th>`)}</tr></thead>
        <tbody>${body.map((row) => html`<tr>${row.map((cell) => html`<td>${inline(cell)}</td>`)}</tr>`)}</tbody>
      </table></div>`;
    }
    case 'quote':
      return html`<blockquote>${inline(entry.text)}</blockquote>`;
    case 'rule':
      return html`<hr />`;
    default:
      return html`<p>${inline(entry.text)}</p>`;
  }
}

export function markdown(text: string): TemplateResult {
  return html`${parse(text).map(render)}`;
}
