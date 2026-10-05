import { css, html, type TemplateResult } from 'lit';
import type { SliccModel, Sprinkle } from '../model/types.ts';
import { ThemedElement } from './base.ts';

const palettes = {
  light: {
    bg: '#ffffff',
    fg: '#292929',
    muted: '#717171',
    line: '#e1e1e1',
    accent: '#3b63fb',
    positive: '#079355',
  },
  dark: {
    bg: '#1d1d1d',
    fg: '#ebebeb',
    muted: '#9a9a9a',
    line: '#3a3a3a',
    accent: '#5b84ff',
    positive: '#2fbf71',
  },
};

export function themed(source: string, color: 'light' | 'dark'): string {
  const vars = Object.entries(palettes[color])
    .map(([name, value]) => `--${name}:${value};`)
    .join('');
  const style = `<style>:root{color-scheme:${color};${vars}--font:"Adobe Clean",adobe-clean,system-ui,sans-serif;}</style>`;
  return source.includes('<head>') ? source.replace('<head>', `<head>${style}`) : style + source;
}

export class SliccSprinkle extends ThemedElement {
  static properties = { ...ThemedElement.properties, sprinkle: {} };
  declare sprinkle: string;

  constructor() {
    super();
    this.sprinkle = '';
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--spectrum-background-layer-2-color);
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .note {
      padding: 24px;
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
  `;

  #message = (event: MessageEvent) => {
    const frame = this.renderRoot.querySelector('iframe');
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { type?: string } | null;
    if (data?.type === 'sprinkle-event') this.model?.sprinkles.send(this.sprinkle, data);
  };

  protected subscribe(model: SliccModel): Array<() => void> {
    globalThis.addEventListener('message', this.#message);
    return [
      ...super.subscribe(model),
      () => globalThis.removeEventListener('message', this.#message),
      model.sprinkles.on('sprinkles', () => this.requestUpdate()),
    ];
  }

  get #data(): Sprinkle | undefined {
    return this.model?.sprinkles.list().find((candidate) => candidate.id === this.sprinkle);
  }

  render(): TemplateResult {
    const data = this.#data;
    if (!data) return html`<div class="note">This sprinkle is gone.</div>`;
    return html`<iframe title=${data.title} sandbox="allow-scripts" .srcdoc=${themed(data.html, this.color)}></iframe>`;
  }
}
