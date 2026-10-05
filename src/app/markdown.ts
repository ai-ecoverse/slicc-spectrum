import { html, nothing, type TemplateResult } from 'lit';

type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'paragraph'; text: string };

const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text: string): TemplateResult[] {
  return text.split(inlinePattern).map((token) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 1) {
      return html`<code>${token.slice(1, -1)}</code>`;
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return html`<strong>${token.slice(2, -2)}</strong>`;
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^https?:\/\//.test(link[2])) {
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

const bullet = /^\s*[-*]\s+/;
const numbered = /^\s*\d+\.\s+/;

function block(lines: string[], i: number): [Block | null, number] {
  const line = lines[i];
  if (line.startsWith('```')) return fence(lines, i);
  const heading = line.match(/^(#{1,4})\s+(.*)$/);
  if (heading) return [{ type: 'heading', level: heading[1].length, text: heading[2] }, i + 1];
  if (line.trim().startsWith('|')) {
    const end = run(lines, i, (l) => l.trim().startsWith('|'));
    const rows = lines.slice(i, end).filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    return [{ type: 'table', rows: rows.map(cells) }, end];
  }
  for (const [pattern, ordered] of [
    [bullet, false],
    [numbered, true],
  ] as const) {
    if (pattern.test(line)) {
      const end = run(lines, i, (l) => pattern.test(l));
      const items = lines.slice(i, end).map((l) => l.replace(pattern, ''));
      return [{ type: 'list', ordered, items }, end];
    }
  }
  if (!line.trim()) return [null, i + 1];
  const end = run(
    lines,
    i,
    (l) =>
      l.trim() !== '' && !/^(```|#{1,4}\s|\s*\|)/.test(l) && !bullet.test(l) && !numbered.test(l)
  );
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

function render(item: Block): TemplateResult {
  switch (item.type) {
    case 'code':
      return html`<pre class="code" data-lang=${item.lang || nothing}><code>${item.text}</code></pre>`;
    case 'heading':
      return html`<p class="heading" role="heading" aria-level=${item.level + 2}>${inline(item.text)}</p>`;
    case 'list': {
      const items = item.items.map((entry) => html`<li>${inline(entry)}</li>`);
      return item.ordered ? html`<ol>${items}</ol>` : html`<ul>${items}</ul>`;
    }
    case 'table': {
      const [head, ...body] = item.rows;
      return html`<table>
        <thead><tr>${head.map((cell) => html`<th>${inline(cell)}</th>`)}</tr></thead>
        <tbody>${body.map((row) => html`<tr>${row.map((cell) => html`<td>${inline(cell)}</td>`)}</tr>`)}</tbody>
      </table>`;
    }
    default:
      return html`<p>${inline(item.text)}</p>`;
  }
}

export function markdown(text: string): TemplateResult {
  return html`${parse(text).map(render)}`;
}
