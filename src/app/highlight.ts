import type { Theme, ThemedToken } from '@pierre/highlights';
import { html, noChange, type TemplateResult } from 'lit';
import { AsyncDirective, directive } from 'lit/async-directive.js';
import { codeTheme } from '../components/code-theme.ts';

type Highlights = typeof import('@pierre/highlights');

interface Painter {
  highlights: Highlights;
  themes: { light: Theme; dark: Theme };
}

const longest = 100_000;
const plain = /^(plain|plaintext|text|txt)$/i;
const styles = new WeakMap<Record<string, string>, string>();
let painter: Painter | null = null;
let loading: Promise<Painter> | null = null;

function load(): Promise<Painter> {
  loading ??= Promise.all([
    import('@pierre/highlights'),
    codeTheme('light'),
    codeTheme('dark'),
  ]).then(
    ([highlights, light, dark]) => {
      painter = { highlights, themes: { light, dark } };
      return painter;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    }
  );
  return loading;
}

function style(token: ThemedToken): string {
  const map = token.htmlStyle!;
  let value = styles.get(map);
  if (value === undefined) {
    value = Object.entries(map)
      .map(([key, entry]) => `${key}:${entry}`)
      .join(';');
    styles.set(map, value);
  }
  return value;
}

function paint(
  { highlights, themes }: Painter,
  code: string,
  lang: string
): string | (string | TemplateResult)[] {
  if (code.length > longest || plain.test(lang) || !highlights.isSupportedLanguage(lang))
    return code;
  const { tokens } = highlights.codeToTokens(code, {
    lang,
    themes,
    defaultColor: 'light-dark()',
    tokenizeMaxLineLength: 1000,
  });
  const out: (string | TemplateResult)[] = [];
  let at = 0;
  for (const token of tokens.flat()) {
    out.push(
      code.slice(at, token.offset),
      html`<span style=${style(token)}>${token.content}</span>`
    );
    at = token.offset + token.content.length;
  }
  out.push(code.slice(at));
  return out;
}

class Highlight extends AsyncDirective {
  #code: string | null = null;
  #lang = '';

  render(code: string, lang: string): unknown {
    if (code === this.#code && lang === this.#lang) return noChange;
    this.#code = code;
    this.#lang = lang;
    if (painter) return paint(painter, code, lang);
    load().then(
      (ready) => this.setValue(paint(ready, this.#code!, this.#lang)),
      () => undefined
    );
    return code;
  }
}

export const highlight = directive(Highlight);
