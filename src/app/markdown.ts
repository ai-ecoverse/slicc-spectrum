import { css, html, nothing, type TemplateResult } from 'lit';
import type {
  AlignType,
  Definition,
  ImageReference,
  List,
  ListItem,
  Nodes,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast';
import { fromMarkdown, type Options } from 'mdast-util-from-markdown';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';

type Output = TemplateResult | string | typeof nothing;
type Definitions = Map<string, Definition>;

interface Context {
  definitions: Definitions;
  strict: boolean;
  level: number | null;
}

export interface MarkdownOptions {
  strict?: boolean;
  level?: number;
}

interface Parsed {
  text: string;
  blocks: RootContent[];
  starts: number[];
  keep: number;
  definitions: Definitions;
}

const options: Options = {
  extensions: [
    gfmAutolinkLiteral(),
    gfmStrikethrough({ singleTilde: false }),
    gfmTable(),
    gfmTaskListItem(),
  ],
  mdastExtensions: [
    gfmAutolinkLiteralFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  ],
};

const empty: Parsed = { text: '', blocks: [], starts: [], keep: 0, definitions: new Map() };
const cache = new Map<string, Parsed>();
const streams: Parsed[] = [];
const rendered = new Map<string, WeakMap<RootContent, Output>>();

function collect(nodes: Nodes[], found: Definitions): Definitions {
  for (const node of nodes) {
    if (node.type === 'definition' && !found.has(node.identifier)) found.set(node.identifier, node);
    if ('children' in node) collect(node.children, found);
  }
  return found;
}

function blankBefore(text: string, start: number): boolean {
  return !text.slice(text.lastIndexOf('\n', start - 2) + 1, start - 1).trim();
}

function parse(text: string): Parsed {
  const hit = cache.get(text);
  if (hit) return hit;
  const base =
    (text.includes(']:') ? undefined : streams.find((entry) => text.startsWith(entry.text))) ??
    empty;
  const tail = base.starts[base.keep] ?? 0;
  const tree = fromMarkdown(text.slice(tail), options);
  const blocks = [...base.blocks.slice(0, base.keep), ...tree.children];
  const starts = [
    ...base.starts.slice(0, base.keep),
    ...tree.children.map(
      (node) => text.lastIndexOf('\n', tail + node.position!.start.offset! - 1) + 1
    ),
  ];
  let keep = Math.max(blocks.length - 1, 0);
  while (keep > 0 && !blankBefore(text, starts[keep]!)) keep--;
  const parsed: Parsed = {
    text,
    blocks,
    starts,
    keep,
    definitions: collect(tree.children, new Map()),
  };
  cache.delete(base.text);
  cache.set(text, parsed);
  if (cache.size > 512) cache.delete(cache.keys().next().value!);
  streams.unshift(parsed);
  streams.length = Math.min(streams.length, 8);
  return parsed;
}

function inert(value: string, strict: boolean): string {
  return strict ? value.replace(/<[^>]*>/g, '') : value;
}

function safeUrl(url: string, images = false, strict = false): boolean {
  if (strict) return /^https:\/\//i.test(url);
  return (
    /^https?:\/\//.test(url) ||
    (!images && /^mailto:/.test(url)) ||
    (images && /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/.test(url))
  );
}

function link(
  url: string,
  title: string | null | undefined,
  label: Output[] | string,
  strict: boolean
): Output {
  return safeUrl(url, false, strict)
    ? html`<a href=${url} title=${title ?? nothing} target="_blank" rel="noopener noreferrer">${label}</a>`
    : html`${label}`;
}

function image(
  url: string,
  title: string | null | undefined,
  alt: string,
  strict: boolean
): Output {
  if (strict) return link(url, title, alt || url, true);
  return safeUrl(url, true) ? html`<img src=${url} alt=${alt} title=${title ?? nothing} />` : alt;
}

function inline(node: { children: PhrasingContent[] }, context: Context): Output[] {
  return node.children.map((child) => phrasing(child, context));
}

function phrasing(node: PhrasingContent, context: Context): Output {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'html':
      return inert(node.value, context.strict);
    case 'inlineCode':
      return html`<code>${node.value}</code>`;
    case 'strong':
      return html`<strong>${inline(node, context)}</strong>`;
    case 'emphasis':
      return html`<em>${inline(node, context)}</em>`;
    case 'delete':
      return html`<s>${inline(node, context)}</s>`;
    case 'break':
      return html`<br />`;
    case 'link':
      return link(node.url, node.title, inline(node, context), context.strict);
    case 'linkReference': {
      const target = context.definitions.get(node.identifier)!;
      return link(target.url, target.title, inline(node, context), context.strict);
    }
    case 'image':
      return image(node.url, node.title, node.alt!, context.strict);
    default: {
      const target = context.definitions.get((node as ImageReference).identifier)!;
      return image(target.url, target.title, (node as ImageReference).alt!, context.strict);
    }
  }
}

function paragraph(node: Paragraph, context: Context, tight: boolean, lead: Output): Output {
  const content = inline(node, context);
  return tight ? html`${lead}${content}` : html`<p>${lead}${content}</p>`;
}

function item(node: ListItem, context: Context, tight: boolean): TemplateResult {
  const box =
    typeof node.checked === 'boolean'
      ? html`<span class="task" data-done=${node.checked ? 'true' : 'false'} aria-label=${node.checked ? 'done' : 'open'}>${node.checked ? '☑' : '☐'}</span> `
      : nothing;
  return html`<li>${node.children.map((child, index) =>
    child.type === 'paragraph'
      ? paragraph(child, context, tight, index ? nothing : box)
      : flow(child, context)
  )}</li>`;
}

function list(node: List, context: Context): TemplateResult {
  const tight = !node.spread && !node.children.some((entry) => entry.spread);
  const items = node.children.map((entry) => item(entry, context, tight));
  return node.ordered
    ? html`<ol start=${node.start === 1 ? nothing : node.start!}>${items}</ol>`
    : html`<ul>${items}</ul>`;
}

function table(node: Table, context: Context): TemplateResult {
  const [head, ...body] = node.children;
  const align = (index: number) => (node.align as AlignType[])[index] ?? nothing;
  return html`<div class="table"><table>
    <thead><tr>${head.children.map((cell, index) => html`<th data-align=${align(index)}>${inline(cell, context)}</th>`)}</tr></thead>
    <tbody>${body.map((row) => html`<tr>${row.children.map((cell, index) => html`<td data-align=${align(index)}>${inline(cell, context)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

function flow(node: RootContent, context: Context): Output {
  switch (node.type) {
    case 'paragraph':
      return paragraph(node, context, false, nothing);
    case 'heading':
      return html`<p class="heading" role="heading" aria-level=${Math.min(context.level === null ? node.depth + 2 : context.level + 1, 6)}>${inline(node, context)}</p>`;
    case 'code':
      return html`<pre class="code" data-lang=${node.lang || nothing}><code>${node.value}</code></pre>`;
    case 'list':
      return list(node, context);
    case 'table':
      return table(node, context);
    case 'blockquote':
      return html`<blockquote>${node.children.map((child) => flow(child, context))}</blockquote>`;
    case 'thematicBreak':
      return html`<hr />`;
    case 'html': {
      const text = inert(node.value, context.strict).trim();
      return text ? html`<p>${text}</p>` : nothing;
    }
    default:
      return nothing;
  }
}

function block(node: RootContent, context: Context): Output {
  const key = `${context.strict}:${context.level}`;
  const cache = rendered.get(key) ?? new WeakMap<RootContent, Output>();
  rendered.set(key, cache);
  let output = cache.get(node);
  if (output === undefined) {
    output = flow(node, context);
    cache.set(node, output);
  }
  return output;
}

export function markdown(text: string, options: MarkdownOptions = {}): TemplateResult {
  const { blocks, definitions } = parse(text);
  const context = { definitions, strict: options.strict === true, level: options.level ?? null };
  return html`${blocks.map((node) => block(node, context))}`;
}

export const markdownCss = css`
  .markdown :is(p, ul, ol, .table, pre, blockquote) {
    margin: var(--swc-spacing-200) 0;
  }
  .markdown :is(ul, ol) {
    display: block;
    padding-inline-start: var(--swc-spacing-400);
  }
  .markdown ul {
    list-style-type: disc;
  }
  .markdown ol {
    list-style-type: decimal;
  }
  .markdown li ul {
    list-style-type: circle;
  }
  .markdown li + li,
  .markdown li > :is(ul, ol) {
    margin-block-start: var(--swc-spacing-75);
  }
  .markdown li > :is(ul, ol) {
    margin-block-end: 0;
  }
  .markdown .heading {
    font-weight: 700;
    line-height: var(--swc-line-height-100);
    margin: var(--swc-spacing-400) 0 var(--swc-spacing-100);
  }
  .markdown .heading[aria-level='3'] {
    font-size: var(--swc-font-size-400);
  }
  .markdown .heading[aria-level='4'] {
    font-size: var(--swc-font-size-300);
  }
  .markdown .heading[aria-level='5'] {
    font-size: var(--swc-font-size-200);
  }
  .markdown .heading[aria-level='6'] {
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .markdown > :first-child,
  .markdown blockquote > :first-child,
  .markdown li > p:first-child {
    margin-block-start: 0;
  }
  .markdown > :last-child,
  .markdown :is(blockquote, li) > :last-child {
    margin-block-end: 0;
  }
  .markdown img {
    max-inline-size: 100%;
    border-radius: var(--swc-corner-radius-100);
  }
  .markdown blockquote {
    border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
    padding-inline-start: var(--swc-spacing-200);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .markdown hr {
    border: 0;
    border-block-start: var(--swc-border-width-100) solid var(--swc-gray-200);
  }
  .markdown li:has(> .task, > p:first-child > .task:first-child) {
    list-style: none;
  }
  .markdown .task {
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .markdown .task[data-done='true'] {
    color: var(--swc-positive-color-1000);
  }
  .markdown :is(code, pre) {
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-100);
  }
  .markdown :not(pre) > code {
    font-size: 0.9em;
    background: var(--swc-gray-100);
    border-radius: var(--swc-corner-radius-75);
    padding: 0 var(--swc-spacing-50);
    overflow-wrap: anywhere;
  }
  .markdown pre {
    background: var(--swc-background-layer-1-color);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
    line-height: var(--swc-line-height-200);
    overflow-x: auto;
    white-space: pre;
  }
  .markdown .table {
    overflow-x: auto;
  }
  .markdown table {
    border-collapse: collapse;
    font-size: var(--swc-font-size-100);
  }
  .markdown :is(th, td) {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    padding: var(--swc-spacing-75) var(--swc-spacing-200);
    text-align: start;
  }
  .markdown :is(th, td) code {
    overflow-wrap: normal;
  }
  .markdown :is(th, td)[data-align='left'] {
    text-align: left;
  }
  .markdown :is(th, td)[data-align='center'] {
    text-align: center;
  }
  .markdown :is(th, td)[data-align='right'] {
    text-align: right;
  }
  .markdown th {
    background: var(--swc-background-layer-1-color);
  }
  .markdown a {
    color: var(--swc-accent-content-color-default);
  }
`;
