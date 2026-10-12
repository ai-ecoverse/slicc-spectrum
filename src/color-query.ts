const query = /\x1b\](1[01])((?:;\?)+)(\x07|\x1b\\)/g;
const partial = /\x1b(?:\](?:1(?:[01](?:;\?)*;?\x1b?)?)?)?$/;
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

const hex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .repeat(2);

export function channels(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase();
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short)
    return [short[1], short[2], short[3]].map((digit) => Number.parseInt(digit.repeat(2), 16)) as [
      number,
      number,
      number,
    ];
  const long = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/);
  if (long)
    return [long[1], long[2], long[3]].map((pair) => Number.parseInt(pair, 16)) as [
      number,
      number,
      number,
    ];
  const number = String.raw`(-?[\d.]+(?:e-?\d+)?)`;
  const srgb = value.match(new RegExp(String.raw`^color\(srgb ${number} ${number} ${number}`));
  if (srgb)
    return [srgb[1], srgb[2], srgb[3]].map((part) => Number(part) * 255) as [
      number,
      number,
      number,
    ];
  const rgb = value.match(new RegExp(String.raw`^rgba?\(${number}[ ,]+${number}[ ,]+${number}`));
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
  return null;
}

let painter: OffscreenCanvasRenderingContext2D | null | undefined;

export function painted(color: string): [number, number, number] | null {
  painter ??=
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })
      : null;
  if (!painter) return null;
  painter.clearRect(0, 0, 1, 1);
  painter.fillStyle = color;
  painter.fillRect(0, 0, 1, 1);
  const [red, green, blue] = painter.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

export function colorReply(code: number, color: string, end: string): string | null {
  const rgb = channels(color) ?? painted(color);
  return rgb ? `\x1b]${code};rgb:${rgb.map(hex).join('/')}${end}` : null;
}
