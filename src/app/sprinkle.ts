import { css, html, type PropertyValues, svg, type TemplateResult } from 'lit';
import type { SliccModel, Sprinkle, SprinkleMethod, SprinklePort } from '../model/types.ts';
import { type Color, ThemedElement } from './base.ts';
import { Dips, dipsOf, dipType } from './dips.ts';
import { type FontFile, installedFonts } from './fonts.ts';
import { icons } from './lucide.ts';
import theme from './sprinkle-theme.css';
import { sprinkleTokens } from './sprinkle-tokens.ts';

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
    if (message.type === 'slicc-theme') document.documentElement.classList.toggle('theme-light', message.color === 'light');
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

export function literal(value: unknown): string {
  try {
    return JSON.stringify(value ?? null).replace(/</g, '\\u003c');
  } catch {
    return 'null';
  }
}

export function store(state: unknown): string {
  return `(() => {
  let state = ${literal(state)};
  const tag = Math.random().toString(36).slice(2);
  const pending = new Map();
  let next = 0;
  const call = (method, args) => new Promise((resolve, reject) => {
    const id = tag + ':' + ++next;
    pending.set(id, { resolve, reject });
    try {
      parent.postMessage({ type: 'slicc-call', id, method, args }, '*');
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const message = event.data || {};
    const waiting = message.type === 'slicc-result' && pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (typeof message.error === 'string') waiting.reject(new Error(message.error));
    else waiting.resolve(message.value);
  });
  Object.assign(window.slicc, {
    readFile: (path) => call('readFile', [path]),
    exists: (path) => call('exists', [path]),
    getState: () => state,
    setState(value) {
      try {
        state = JSON.parse(JSON.stringify(value === undefined ? null : value));
      } catch (error) {
        return Promise.reject(error);
      }
      return call('setState', [state]).then(() => undefined);
    },
  });
})();`;
}

export function frameDocument(
  source: string,
  color: Color,
  name: string,
  state?: { value: unknown }
): string {
  const scheme = `<style>${sprinkleTokens}${theme}</style>`;
  const light = `<script>document.documentElement.classList.toggle('theme-light', ${color === 'light'});</script>`;
  const script = `<script data-name="${name.replace(/"/g, '&quot;')}">${bridge}</script>`;
  const injection =
    light + scheme + script + (state ? `<script>${store(state.value)}</script>` : '');
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
): Promise<Array<{ family: string; weight: number | string; data: ArrayBuffer }>> {
  const loaded = await Promise.all(
    files.map(async (file) => ({
      family: file.family,
      weight: file.weight,
      data: await fontData(new URL(file.url, base).href),
    }))
  );
  return loaded.filter(
    (font): font is { family: string; weight: number | string; data: ArrayBuffer } =>
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
  id?: unknown;
  method?: unknown;
  args?: unknown;
}

export const sprinkleMethods: ReadonlySet<string> = new Set<SprinkleMethod>([
  'readFile',
  'exists',
  'getState',
  'setState',
]);

const grip = svg`<svg class="grip" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">${[2, 7, 12].flatMap((y) => [2, 6].map((x) => svg`<circle cx=${x} cy=${y} r="1.25"></circle>`))}</svg>`;

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
    iframe:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .frame {
      border: 1px solid var(--spectrum-gray-200);
      background: var(--spectrum-background-layer-1-color);
    }
    .handle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: max-content;
      max-width: 100%;
      box-sizing: border-box;
      height: 28px;
      padding: 0 4px 0 6px;
      border: 1px solid var(--spectrum-gray-200);
      border-bottom: 0;
      border-radius: 6px 6px 0 0;
      background: var(--spectrum-background-layer-1-color);
      color: var(--spectrum-neutral-subdued-content-color-default);
      font-size: var(--spectrum-font-size-75);
      cursor: grab;
      user-select: none;
    }
    .handle:active {
      cursor: grabbing;
    }
    .handle .grip {
      fill: currentColor;
    }
    .handle .name {
      color: var(--spectrum-neutral-content-color-default);
    }
    .moved {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px dashed var(--spectrum-gray-300);
      border-radius: 8px;
      color: var(--spectrum-neutral-subdued-content-color-default);
      font-size: var(--spectrum-font-size-75);
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
      source.postMessage({ type: 'slicc-theme', color: this.color }, '*');
      const fonts = await frameFonts(installedFonts(), document.baseURI);
      source.postMessage({ type: 'slicc-fonts', fonts }, '*');
    } else if (data.type === 'slicc-size' && typeof data.height === 'number') {
      this.height = data.height;
    } else if (data.type === 'slicc-call') {
      await this.#call(source, data);
    }
  };

  async #call(source: Window, data: FrameMessage): Promise<void> {
    const port = this.model?.sprinkles;
    if (!port?.call || typeof data.method !== 'string' || !sprinkleMethods.has(data.method)) return;
    const method = data.method as SprinkleMethod;
    const args = Array.isArray(data.args) ? data.args : [];
    if (method === 'setState') this.#held.value = args[0] ?? null;
    try {
      const value = await port.call(this.sprinkle, method, args);
      source.postMessage({ type: 'slicc-result', id: data.id, value }, '*');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      source.postMessage({ type: 'slicc-result', id: data.id, error: message }, '*');
    }
  }

  #held: { port: SprinklePort | null; id: string; ready: boolean; value: unknown } = {
    port: null,
    id: '',
    ready: false,
    value: null,
  };

  #hold(port: SprinklePort, ask: NonNullable<SprinklePort['call']>, id: string): void {
    const held = { port, id, ready: false, value: null as unknown };
    this.#held = held;
    this.#frame = { key: '', doc: '' };
    const settle = (value: unknown) => {
      held.value = value ?? null;
      held.ready = true;
      if (this.#held === held) this.requestUpdate();
    };
    ask.call(port, id, 'getState', []).then(settle, () => settle(null));
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const port = this.model?.sprinkles;
    if (port?.call && (this.#held.port !== port || this.#held.id !== this.sprinkle))
      this.#hold(port, port.call, this.sprinkle);
  }

  #dips = new Dips();

  #focusLater = false;

  focus(): void {
    if (this.model?.sprinkles.call && !this.#held.ready) this.#focusLater = true;
    else this.focusOn('iframe');
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#dips = dipsOf(this) ?? this.#dips;
    globalThis.addEventListener('message', this.#message);
    return [
      ...super.subscribe(model),
      () => globalThis.removeEventListener('message', this.#message),
      model.sprinkles.on('sprinkles', () => this.requestUpdate()),
      this.#dips.on('change', () => this.requestUpdate()),
    ];
  }

  #drag = (event: DragEvent) => {
    const data = this.#data;
    event.dataTransfer?.setData(dipType, this.sprinkle);
    event.dataTransfer?.setData('text/plain', data?.title ?? this.sprinkle);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };

  #send(type: string, id: string): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { id }, bubbles: true, composed: true }));
  }

  get #data(): Sprinkle | undefined {
    return this.model?.sprinkles.list().find((candidate) => candidate.id === this.sprinkle);
  }

  #frame = { key: '', doc: '' };

  #document(data: Sprinkle, state?: { value: unknown }): string {
    const key = `${!!state}\n${data.name}\n${data.html}`;
    if (this.#frame.key !== key)
      this.#frame = { key, doc: frameDocument(data.html, this.color, data.name, state) };
    return this.#frame.doc;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const frame = this.renderRoot.querySelector('iframe');
    frame?.contentWindow?.postMessage({ type: 'slicc-theme', color: this.color }, '*');
    if (frame && this.#focusLater) {
      this.#focusLater = false;
      frame.focus();
    }
  }

  render(): TemplateResult {
    const data = this.#data;
    if (!data) return html`<div class="note">This sprinkle is gone.</div>`;
    if (this.inline && this.#dips.has(data.id)) {
      return html`<div class="moved">
        <swc-icon-open-in size="s"></swc-icon-open-in>
        <span>${data.title} is open as a panel.</span>
        <sp-action-button size="s" quiet @click=${() => this.#send('show-surface', `sprinkle:${data.id}`)}>Show</sp-action-button>
      </div>`;
    }
    const bridged = !!this.model?.sprinkles.call;
    if (bridged && !this.#held.ready) return html``;
    const state = bridged ? this.#held : undefined;
    const style = `color-scheme:${this.color};${this.inline ? `height:${this.height}px;` : ''}`;
    const frame = html`<iframe title=${data.title} sandbox="allow-scripts" style=${style} .srcdoc=${this.#document(data, state)}></iframe>`;
    if (!this.inline) return frame;
    return html`<div class="handle" draggable="true" title="Drag into the dock or a rail to open as a panel" @dragstart=${this.#drag}>
        ${grip}
        <span class="name">${data.title}</span>
        <sp-action-button size="xs" quiet label=${`Open ${data.title} as a panel`} title="Open as a panel" @click=${() => this.#send('detach-sprinkle', data.id)}>
          <swc-icon-open-in slot="icon"></swc-icon-open-in>
        </sp-action-button>
      </div>
      <div class="frame">${frame}</div>`;
  }
}
