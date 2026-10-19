import { html, type TemplateResult, unsafeCSS } from 'lit';

export interface AnsiStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  fg: number | string | null;
  bg: number | string | null;
}

export interface AnsiRun {
  text: string;
  style: AnsiStyle;
}

const lightPalette = [
  'gray-800',
  'negative-color-900',
  'positive-color-900',
  'notice-color-1000',
  'informative-color-900',
  'purple-900',
  'cyan-1000',
  'gray-600',
  'gray-700',
  'negative-color-1000',
  'positive-color-1000',
  'notice-color-1100',
  'informative-color-1000',
  'purple-1000',
  'cyan-1100',
  'gray-800',
];

export const terminalPalette = unsafeCSS(
  lightPalette.map((token, n) => `--slicc-terminal-color-${n}: var(--swc-${token});`).join('\n')
);

const tints = [
  'gray-800',
  'negative-subtle-background-color-default',
  'positive-subtle-background-color-default',
  'notice-subtle-background-color-default',
  'informative-subtle-background-color-default',
  'purple-subtle-background-color-default',
  'cyan-subtle-background-color-default',
  'gray-subtle-background-color-default',
];

const greys = new Set([0, 7, 8, 15]);

const plain: AnsiStyle = {
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  fg: null,
  bg: null,
};

const levels = [0, 95, 135, 175, 215, 255];

function indexed(n: number): number | string | null {
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  if (n < 16) return n;
  if (n >= 232) {
    const grey = 8 + (n - 232) * 10;
    return `rgb(${grey}, ${grey}, ${grey})`;
  }
  const cube = n - 16;
  const [r, g, b] = [Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6].map(
    (level) => levels[level]
  );
  return `rgb(${r}, ${g}, ${b})`;
}

function channel(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

type Color = number | string | null;

function extended(params: number[], at: number): { color: Color; used: number } {
  const mode = params[at + 1];
  if (mode === 5) return { color: indexed(params[at + 2] as number), used: 2 };
  if (mode === 2) {
    const rgb = params.slice(at + 2, at + 5).map(channel);
    const ok = rgb.length === 3 && rgb.every((value) => value !== null);
    return { color: ok ? `rgb(${rgb.join(', ')})` : null, used: 4 };
  }
  return { color: null, used: 0 };
}

function numbers(text: string): number[] {
  return text.split(':').map((part) => (part === '' ? 0 : Number(part)));
}

const flags: Record<number, Partial<AnsiStyle>> = {
  0: plain,
  1: { bold: true },
  2: { dim: true },
  3: { italic: true },
  4: { underline: true },
  7: { inverse: true },
  22: { bold: false, dim: false },
  23: { italic: false },
  24: { underline: false },
  27: { inverse: false },
  39: { fg: null },
  49: { bg: null },
};

const ranges: Array<[number, 'fg' | 'bg', number]> = [
  [30, 'fg', 0],
  [40, 'bg', 0],
  [90, 'fg', 8],
  [100, 'bg', 8],
];

function simple(code: number): Partial<AnsiStyle> | null {
  const flag = flags[code];
  if (flag) return flag;
  const range = ranges.find(([start]) => code >= start && code < start + 8);
  return range ? { [range[1]]: code - range[0] + range[2] } : null;
}

function wide(groups: number[][], i: number): { color: Color; used: number } {
  const group = groups[i] as number[];
  if (group.length === 1)
    return extended(
      groups.slice(i).map((entry) => entry[0] as number),
      0
    );
  const spaced = group[1] === 2 && group.length > 5;
  return { color: extended(spaced ? [0, 2, ...group.slice(3)] : group, 0).color, used: 0 };
}

function sgr(style: AnsiStyle, body: string): AnsiStyle {
  const next = { ...style };
  const groups = body === '' ? [[0]] : body.split(';').map(numbers);
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i] as number[];
    const code = group[0] as number;
    if (code === 38 || code === 48) {
      const { color, used } = wide(groups, i);
      i += used;
      if (color !== null) next[code === 38 ? 'fg' : 'bg'] = color;
    } else if (code === 4 && group.length > 1) next.underline = group[1] !== 0;
    else Object.assign(next, simple(code));
  }
  return next;
}

function terminated(text: string, from: number, streaming: boolean): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\x07') return i + 1;
    if (text[i] === '\x1b' && text[i + 1] === '\\') return i + 2;
  }
  if (streaming) return -1;
  const line = text.indexOf('\n', from);
  return line === -1 ? text.length : line;
}

function csi(text: string, from: number): { end: number; body: string; final: string } | null {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      return { end: i + 1, body: text.slice(from, i), final: text[i] as string };
    }
    if (code < 0x20 || code > 0x3f) return { end: i, body: '', final: '' };
  }
  return null;
}

function escape(
  text: string,
  at: number,
  style: AnsiStyle,
  streaming: boolean
): { end: number; style: AnsiStyle } {
  const kind = text[at + 1];
  if (kind === undefined) return { end: -1, style };
  if (kind === '[') {
    const found = csi(text, at + 2);
    if (!found) return { end: -1, style };
    const styled = found.final === 'm' && /^[\d;:]*$/.test(found.body);
    return { end: found.end, style: styled ? sgr(style, found.body) : style };
  }
  if (']PX^_'.includes(kind)) return { end: terminated(text, at + 2, streaming), style };
  let i = at + 1;
  while (i < text.length && text.charCodeAt(i) >= 0x20 && text.charCodeAt(i) <= 0x2f) i++;
  if (i === text.length) return { end: -1, style };
  const final = text.charCodeAt(i);
  return { end: final >= 0x30 && final <= 0x7e ? i + 1 : at + 1, style };
}

export function parseAnsi(text: string, streaming = false): AnsiRun[] {
  const runs: AnsiRun[] = [];
  let style = plain;
  let start = 0;
  const push = (end: number) => {
    if (end <= start) return;
    const last = runs.at(-1);
    const piece = text.slice(start, end);
    if (last?.style === style) last.text += piece;
    else runs.push({ text: piece, style });
  };
  let i = text.indexOf('\x1b');
  while (i !== -1) {
    push(i);
    const found = escape(text, i, style, streaming);
    if (found.end === -1) return runs;
    style = found.style;
    start = found.end;
    i = text.indexOf('\x1b', start);
  }
  push(text.length);
  return runs;
}

export function stripAnsi(text: string): string {
  return parseAnsi(text)
    .map((run) => run.text)
    .join('');
}

function swatch(color: Color): string | null {
  if (color === null) return null;
  return typeof color === 'number' ? `var(--slicc-terminal-color-${color})` : color;
}

function paint(style: AnsiStyle): [string | null, string | null] {
  let { fg, bg } = style;
  if (style.inverse && fg === null && bg === null) {
    return ['var(--swc-background-layer-1-color)', 'var(--swc-neutral-content-color-default)'];
  }
  if (style.inverse) [fg, bg] = [bg, fg];
  if (style.dim && typeof fg === 'number' && fg >= 8) fg -= 8;
  if (style.dim && fg === null && bg === null) {
    return ['var(--swc-neutral-subdued-content-color-default)', null];
  }
  if (typeof bg !== 'number') return [swatch(fg), bg];
  const tint = `var(--swc-${bg === 8 ? 'gray-700' : tints[bg % 8]})`;
  if (bg % 8 === 0) return ['var(--swc-gray-25)', tint];
  return [typeof fg === 'number' && greys.has(fg) ? null : swatch(fg), tint];
}

function inline(style: AnsiStyle): string {
  const [fg, bg] = paint(style);
  return [
    fg ? `color: ${fg}` : '',
    bg ? `background: ${bg}` : '',
    style.bold ? 'font-weight: bold' : '',
    style.italic ? 'font-style: italic' : '',
    style.underline ? 'text-decoration: underline' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function ansi(text: string, streaming = false): Array<TemplateResult | string> {
  return parseAnsi(text, streaming).map((run) => {
    const style = inline(run.style);
    return style ? html`<span style=${style}>${run.text}</span>` : run.text;
  });
}
