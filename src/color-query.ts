const query = /\x1b\](1[01])((?:;\?){1,10})(\x07|\x1b\\)/g;
const partial = /\x1b(?:\](?:1(?:[01](?:;\?){0,10};?\x1b?)?)?)?$/;
const latin1 = new TextDecoder('latin1');

export interface ColorQuery {
  at: number;
  codes: number[];
  end: string;
}

export class ColorQueries {
  #tail = '';

  scan(data: string | Uint8Array): ColorQuery[] {
    const chunk = typeof data === 'string' ? data : latin1.decode(data);
    if (!this.#tail && !chunk.includes('\x1b')) return [];
    const carried = this.#tail.length;
    const text = this.#tail + chunk;
    const found: ColorQuery[] = [];
    for (const match of text.matchAll(query)) {
      const first = Number(match[1]);
      const codes = Array.from({ length: match[2].length / 2 }, (_, index) => first + index);
      found.push({
        at: match.index + match[0].length - carried,
        codes: codes.filter((code) => code <= 11),
        end: match[3],
      });
    }
    const last = found.at(-1);
    const rest = last ? text.slice(last.at + carried) : text;
    this.#tail = rest.match(partial)?.[0] ?? '';
    return found;
  }
}

export type Rgba = [number, number, number, number];

const hex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .repeat(2);

const unit = (value: string | undefined) =>
  value === undefined ? 1 : value.endsWith('%') ? Number.parseFloat(value) / 100 : Number(value);

export function channels(color: string): Rgba | null {
  const value = color.trim().toLowerCase();
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short)
    return [
      ...[short[1], short[2], short[3]].map((digit) => Number.parseInt(digit.repeat(2), 16)),
      1,
    ] as Rgba;
  const long = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/);
  if (long)
    return [
      ...[long[1], long[2], long[3]].map((pair) => Number.parseInt(pair, 16)),
      long[4] ? Number.parseInt(long[4], 16) / 255 : 1,
    ] as Rgba;
  const number = String.raw`(-?[\d.]+(?:e-?\d+)?)`;
  const alpha = String.raw`(?:\s*[/,]\s*(-?[\d.]+(?:e-?\d+)?%?))?\s*\)`;
  const srgb = value.match(
    new RegExp(String.raw`^color\(srgb ${number} ${number} ${number}${alpha}`)
  );
  if (srgb)
    return [
      ...[srgb[1], srgb[2], srgb[3]].map((part) => Number(part) * 255),
      unit(srgb[4]),
    ] as Rgba;
  const rgb = value.match(
    new RegExp(String.raw`^rgba?\(${number}[ ,]+${number}[ ,]+${number}${alpha}`)
  );
  if (rgb) return [...[rgb[1], rgb[2], rgb[3]].map(Number), unit(rgb[4])] as Rgba;
  return null;
}

let painter: OffscreenCanvasRenderingContext2D | null | undefined;

export function painted(color: string): Rgba | null {
  painter ??=
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
      : null;
  if (!painter) return null;
  painter.clearRect(0, 0, 1, 1);
  painter.fillStyle = color;
  painter.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = painter.getImageData(0, 0, 1, 1).data;
  return [red, green, blue, alpha / 255];
}

export function over(top: Rgba, bottom: Rgba): Rgba {
  const lower = bottom[3] * (1 - top[3]);
  const alpha = top[3] + lower;
  if (!alpha) return [0, 0, 0, 0];
  return [
    ...[0, 1, 2].map((index) => (top[index] * top[3] + bottom[index] * lower) / alpha),
    alpha,
  ] as Rgba;
}

const read = (color: string) => channels(color) ?? painted(color);

const parentOf = (node: Element): Element | null =>
  node.parentElement ?? (node.getRootNode() as Partial<ShadowRoot>).host ?? null;

export function themeColors(element: Element): Partial<Record<number, Rgba>> {
  const style = getComputedStyle(element);
  let back: Rgba = [0, 0, 0, 0];
  for (let node: Element | null = element; node && back[3] < 1; node = parentOf(node)) {
    const layer = read(getComputedStyle(node).backgroundColor);
    if (layer) back = over(back, layer);
  }
  back = over(back, style.colorScheme === 'dark' ? [18, 18, 18, 1] : [255, 255, 255, 1]);
  const front = read(style.color);
  return front ? { 10: over(front, back), 11: back } : { 11: back };
}

export function colorReply(code: number, rgb: Rgba, end: string): string {
  return `\x1b]${code};rgb:${rgb.slice(0, 3).map(hex).join('/')}${end}`;
}
