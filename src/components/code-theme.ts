import { registerCustomTheme } from '@pierre/diffs';
import type { Theme } from '@pierre/highlights';

export const codeThemes = { light: 'slicc-light', dark: 'slicc-dark' } as const;

export const codeGrounds = {
  light: ['#ffffff', '#ffe8e4', '#e7f4ec', '#f9ccca', '#c8e7d8', '#f8f8f8'],
  dark: ['#222222', '#381917', '#182d22', '#5f1d1f', '#144b35', '#1b1b1b'],
} as const;

const minimum = 4.5;

function channels(hex: string): number[] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function weakest(color: string, grounds: readonly string[]): number {
  return Math.min(...grounds.map((ground) => contrast(color, ground)));
}

export function legible(color: string, grounds: readonly string[]): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const toward = luminance(grounds[0]) > 0.5 ? 0 : 255;
  const rgb = channels(color);
  let shade = color;
  for (let step = 0.02; weakest(shade, grounds) < minimum; step += 0.02) {
    const mixed = rgb.map((value) => Math.round(value + (toward - value) * Math.min(step, 1)));
    shade = `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  return shade;
}

export function accessible(theme: Theme, name: string, grounds: readonly string[]): Theme {
  const syntax = Object.fromEntries(
    Object.entries(theme.style.syntax ?? {}).map(([scope, value]) => [
      scope,
      typeof value === 'string'
        ? legible(value, grounds)
        : value.color
          ? { ...value, color: legible(value.color, grounds) }
          : value,
    ])
  );
  return { ...theme, name, style: { ...theme.style, syntax } };
}

const pierre = {
  light: () => import('@pierre/highlights/themes/pierre-light'),
  dark: () => import('@pierre/highlights/themes/pierre-dark'),
};
const loaded: Partial<Record<keyof typeof codeThemes, Promise<Theme>>> = {};

export function codeTheme(color: keyof typeof codeThemes): Promise<Theme> {
  loaded[color] ??= pierre[color]().then((module) =>
    accessible(module.default, codeThemes[color], codeGrounds[color])
  );
  return loaded[color];
}

registerCustomTheme(codeThemes.light, () => codeTheme('light'), 'zed');
registerCustomTheme(codeThemes.dark, () => codeTheme('dark'), 'zed');
