import { css, html, type TemplateResult } from 'lit';
import type { SliccModel, Sprinkle } from '../model/types.ts';
import { ThemedElement } from './base.ts';
import { type FontFile, installedFonts } from './fonts.ts';
import { icons } from './lucide.ts';
import theme from './sprinkle-theme.css';

export const bridge = `(() => {
  const post = (message) => parent.postMessage(message, '*');
  window.slicc = {
    name: document.currentScript.dataset.name,
    lick(event) {
      const value = typeof event === 'string' ? { action: event } : event || {};
      post({ type: 'slicc-lick', action: String(value.action || ''), data: value.data ?? null, target: value.target ?? null });
    },
  };
  const wanted = new Set();
  let timer = 0;
  window.LucideIcons = {
    render() {
      for (const node of document.querySelectorAll('i[data-lucide]')) wanted.add(node.dataset.lucide);
      clearTimeout(timer);
      timer = setTimeout(() => post({ type: 'slicc-icons', names: [...wanted] }));
    },
  };
  const swap = (found) => {
    for (const node of document.querySelectorAll('i[data-lucide]')) {
      const markup = found[node.dataset.lucide];
      if (!markup) continue;
      const template = document.createElement('template');
      template.innerHTML = markup;
      const svg = template.content.firstElementChild;
      for (const { name, value } of node.attributes) {
        if (name === 'class') svg.setAttribute('class', svg.getAttribute('class') + ' ' + value);
        else if (name !== 'data-lucide') svg.setAttribute(name, value);
      }
      node.replaceWith(svg);
    }
  };
  const fonts = (list) => {
    for (const font of list) {
      const face = new FontFace(font.family, font.data, { weight: String(font.weight) });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  };
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const message = event.data || {};
    if (message.type === 'slicc-icons') swap(message.icons);
    if (message.type === 'slicc-fonts') fonts(message.fonts);
  });
  const size = () => {
    const style = getComputedStyle(document.body);
    post({ type: 'slicc-size', height: Math.ceil(document.body.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom)) });
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.LucideIcons.render();
    new ResizeObserver(size).observe(document.body);
  });
  post({ type: 'slicc-ready' });
})();`;

export function frameDocument(source: string, color: 'light' | 'dark', name: string): string {
  const scheme = `<style>:root{color-scheme:${color};}${theme}</style>`;
  const light = `<script>document.documentElement.classList.toggle('theme-light', ${color === 'light'});</script>`;
  const script = `<script data-name="${name.replace(/"/g, '&quot;')}">${bridge}</script>`;
  const injection = light + scheme + script;
  const head = source.match(/<head\b[^>]*>/i);
  if (!head || head.index === undefined) return injection + source;
  const at = head.index + head[0].length;
  return source.slice(0, at) + injection + source.slice(at);
}

const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

export function fontData(url: string): Promise<ArrayBuffer | null> {
  let found = fontCache.get(url);
  if (!found) {
    found = fetch(url).then(
      (response) => (response.ok ? response.arrayBuffer() : null),
      () => null
    );
    fontCache.set(url, found);
  }
  return found;
}

export async function frameFonts(
  files: readonly FontFile[],
  base: string
): Promise<Array<{ family: string; weight: number; data: ArrayBuffer }>> {
  const loaded = await Promise.all(
    files.map(async (file) => ({
      family: file.family,
      weight: file.weight,
      data: await fontData(new URL(file.url, base).href),
    }))
  );
  return loaded.filter((font): font is { family: string; weight: number; data: ArrayBuffer } =>
    Boolean(font.data)
  );
}

interface FrameMessage {
  type?: string;
  action?: string;
  data?: unknown;
  target?: string | null;
  names?: unknown;
  height?: unknown;
}

export class SliccSprinkle extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    sprinkle: {},
    inline: { type: Boolean, reflect: true },
    height: { state: true },
  };
  declare sprinkle: string;
  declare inline: boolean;
  declare height: number;

  constructor() {
    super();
    this.sprinkle = '';
    this.inline = false;
    this.height = 160;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--spectrum-background-layer-2-color);
    }
    :host([inline]) {
      height: auto;
      background: none;
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

  #message = async (event: MessageEvent) => {
    const frame = this.renderRoot.querySelector('iframe');
    if (!frame || event.source !== frame.contentWindow) return;
    const source = event.source as Window;
    const data = (event.data ?? {}) as FrameMessage;
    if (data.type === 'slicc-lick') {
      this.model?.sprinkles.send(this.sprinkle, {
        action: data.action,
        data: data.data,
        target: data.target,
      });
    } else if (data.type === 'slicc-icons' && Array.isArray(data.names)) {
      source.postMessage({ type: 'slicc-icons', icons: await icons(data.names) }, '*');
    } else if (data.type === 'slicc-ready') {
      const fonts = await frameFonts(installedFonts(), document.baseURI);
      source.postMessage({ type: 'slicc-fonts', fonts }, '*');
    } else if (data.type === 'slicc-size' && typeof data.height === 'number') {
      this.height = data.height;
    }
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
    const style = `color-scheme:${this.color};${this.inline ? `height:${this.height}px;` : ''}`;
    return html`<iframe title=${data.title} sandbox="allow-scripts" style=${style} .srcdoc=${frameDocument(data.html, this.color, data.name)}></iframe>`;
  }
}
