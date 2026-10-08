import swc from '@adobe/spectrum-wc/swc.css';
import gen2 from '@adobe/spectrum-wc/tokens.css';
import theme from './sprinkle-theme.css';

const reference = /--swc-[\w-]+/g;
const lightSelector = ':root.theme-light,:root:where(:has(body[data-theme="light"]))';

export function declarations(...sheets: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const sheet of sheets) {
    const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name, value] of text.matchAll(/(--swc-[\w-]+)\s*:\s*([^;{}]*);/g)) {
      if (!found.has(name)) found.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }
  return found;
}

export function closure(found: Map<string, string>, source: string): Map<string, string> {
  const used = new Map<string, string>();
  const queue: string[] = [...(source.match(reference) ?? [])];
  while (queue.length) {
    const name = queue.pop() as string;
    const value = found.get(name);
    if (value === undefined || used.has(name)) continue;
    used.set(name, value);
    queue.push(...(value.match(reference) ?? []));
  }
  return used;
}

function args(value: string, start: number): [string[], number] {
  const parts: string[] = [];
  let depth = 0;
  let from = start;
  let at = start;
  for (; at < value.length; at++) {
    const char = value[at];
    if (char === '(') depth++;
    else if (char === ')' && depth === 0) break;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(value.slice(from, at));
  return [parts, at];
}

export function branch(value: string, side: 0 | 1): string {
  const at = value.indexOf('light-dark(');
  if (at < 0) return value;
  const [parts, end] = args(value, at + 'light-dark('.length);
  const picked = branch((parts[side] ?? '').trim(), side);
  return value.slice(0, at) + picked + branch(value.slice(end + 1), side);
}

export function frameTokens(found: Map<string, string>): string {
  const entries = [...found];
  const dark = entries.map(([name, value]) => `${name}:${branch(value, 1)};`).join('');
  const light = entries
    .filter(([, value]) => value.includes('light-dark('))
    .map(([name, value]) => `${name}:${branch(value, 0)};`)
    .join('');
  return `:root{${dark}}${lightSelector}{${light}}`;
}

export const sprinkleTokens: string = frameTokens(closure(declarations(gen2, swc), theme));
