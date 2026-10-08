import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { BrowserTab, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';
import { agentName } from './files.ts';

export function normalize(input: string): string {
  const text = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  return `https://${text}`;
}

export function host(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export const refresh = 10_000;

export class SliccBrowser extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    address: { state: true },
  };
  declare address: string;
  #shots = new Map<string, { key: string; src: string }>();
  #queue = new Set<string>();
  #running = false;

  constructor() {
    super();
    this.address = '';
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--swc-background-layer-2-color);
      color: var(--swc-neutral-content-color-default);
      font-family: var(--swc-sans-font-family-stack);
      font-size: var(--swc-font-size-75);
    }
    form {
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-200);
      flex: none;
      padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-100) var(--swc-spacing-300);
      border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      background: var(--swc-background-layer-1-color);
    }
    sp-textfield {
      flex: 1;
      width: auto;
      min-width: 0;
    }
    .scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      container-type: inline-size;
    }
    ul {
      display: grid;
      gap: var(--swc-spacing-200);
      margin: 0;
      padding: var(--swc-spacing-300);
      list-style: none;
    }
    li {
      position: relative;
    }
    .window {
      display: grid;
      grid-template-columns: var(--slicc-browser-thumb, var(--swc-spacing-1000)) minmax(0, 1fr);
      align-items: center;
      gap: var(--swc-spacing-300);
      width: 100%;
      padding: var(--swc-spacing-200);
      padding-inline-end: calc(var(--swc-component-height-100) + var(--swc-spacing-200));
      box-sizing: border-box;
      border: var(--swc-border-width-100) solid var(--swc-gray-200);
      border-radius: var(--swc-corner-radius-medium-default);
      background: var(--swc-background-layer-1-color);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .window:hover {
      background: var(--swc-gray-100);
    }
    .window:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: var(--swc-focus-ring-gap);
    }
    .window[aria-current='true'] {
      border-color: var(--swc-accent-visual-color);
      box-shadow: inset 0 0 0 var(--swc-border-width-100) var(--swc-accent-visual-color);
    }
    .thumb {
      display: grid;
      place-items: center;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      border-radius: var(--swc-corner-radius-75);
      background: var(--swc-card-background-well-color);
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
    }
    .meta {
      display: flex;
      flex-direction: column;
      gap: var(--swc-spacing-75);
      min-width: 0;
    }
    .title {
      font-size: var(--swc-font-size-100);
      font-weight: var(--swc-bold-font-weight);
    }
    .title,
    .host,
    .driver {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .host,
    .driver {
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .state {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--swc-spacing-100) var(--swc-spacing-200);
    }
    swc-close-button {
      position: absolute;
      inset-block-start: var(--swc-spacing-100);
      inset-inline-end: var(--swc-spacing-100);
      border-radius: var(--swc-corner-radius-medium-default);
      background: var(--swc-background-layer-1-color);
    }
    .note {
      padding: var(--swc-spacing-400);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    @container (min-width: 480px) {
      ul {
        grid-template-columns: repeat(auto-fill, minmax(var(--swc-card-default-width-small), 1fr));
        gap: var(--swc-spacing-300);
      }
      .window {
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        align-content: start;
        height: 100%;
        padding: var(--swc-spacing-200);
      }
    }
  `;

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => {
      this.#stale();
      this.requestUpdate();
    };
    this.#shots.clear();
    this.#stale();
    const timer = setInterval(() => this.#tick(), refresh);
    return [
      model.browser.on('tabs', update),
      model.browser.on('active', (id) => {
        if (id) this.#request(id);
        this.requestUpdate();
      }),
      () => clearInterval(timer),
    ];
  }

  focus(): void {
    void this.updateComplete.then(() =>
      this.focusOn(
        this.renderRoot.querySelector('.window[aria-current="true"]')
          ? '.window[aria-current="true"]'
          : '.window'
      )
    );
  }

  #key(tab: BrowserTab): string {
    return `${tab.url} ${tab.status}`;
  }

  #stale(): void {
    const tabs = this.model?.browser.list() ?? [];
    const live = new Set(tabs.map((tab) => tab.id));
    for (const id of this.#shots.keys()) if (!live.has(id)) this.#shots.delete(id);
    for (const tab of tabs)
      if (this.#shots.get(tab.id)?.key !== this.#key(tab)) this.#request(tab.id);
  }

  #visible(): boolean {
    return !document.hidden && this.isConnected && this.checkVisibility?.() !== false;
  }

  #tick(): void {
    if (this.#running || !this.#visible()) return;
    for (const tab of this.model?.browser.list() ?? []) this.#request(tab.id);
  }

  #request(id: string): void {
    this.#queue.add(id);
    if (!this.#running) void this.#drain();
  }

  async #drain(): Promise<void> {
    this.#running = true;
    while (this.#queue.size > 0) {
      const id = this.#queue.values().next().value as string;
      this.#queue.delete(id);
      const model = this.model;
      const tab = model?.browser.list().find((candidate) => candidate.id === id);
      if (!model || !tab) continue;
      const key = this.#key(tab);
      try {
        const src = await model.browser.screenshot(id);
        const now = model.browser.list().find((candidate) => candidate.id === id);
        if (this.model === model && now && this.#key(now) === key) {
          this.#shots.set(id, { key, src });
          this.requestUpdate();
        }
      } catch {}
    }
    this.#running = false;
  }

  #open(): void {
    const url = normalize(this.address);
    if (!this.model || url === 'https://') return;
    this.model.browser.open(url);
    this.address = '';
  }

  #submit(event: Event): void {
    event.preventDefault();
    this.#open();
  }

  #keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#submit(event);
  }

  #window(tab: BrowserTab, active: string | null): TemplateResult {
    const model = this.model as SliccModel;
    const shot = this.#shots.get(tab.id)?.src;
    const current = tab.id === active;
    const loading = tab.status === 'loading';
    return html`<li data-id=${tab.id}>
      <button
        class="window"
        aria-current=${current ? 'true' : 'false'}
        title=${tab.url}
        @click=${() => model.browser.activate(tab.id)}
      >
        <span class="thumb">
          ${
            shot
              ? html`<img src=${shot} alt="" />`
              : html`<swc-progress-circle size="s" label="Loading preview"></swc-progress-circle>`
          }
        </span>
        <span class="meta">
          <span class="title">${tab.title}</span>
          <span class="host">${host(tab.url)}</span>
          <span class="state">
            <swc-status-light size="s" variant=${loading ? 'notice' : 'positive'}>${loading ? 'Loading' : 'Loaded'}</swc-status-light>
            ${current ? html`<swc-badge size="s" variant="accent" subtle>Active</swc-badge>` : nothing}
          </span>
          ${tab.agentId ? html`<span class="driver">Driven by ${agentName(model, tab.agentId)}</span>` : nothing}
        </span>
      </button>
      <swc-close-button
        size="m"
        accessible-label=${`Close ${tab.title}`}
        @click=${() => model.browser.close(tab.id)}
      ></swc-close-button>
    </li>`;
  }

  render(): TemplateResult {
    const tabs = this.model?.browser.list() ?? [];
    const active = this.model?.browser.active() ?? null;
    return html`<form @submit=${this.#submit}>
        <sp-textfield
          size="s"
          label="Open URL"
          placeholder="Open a URL"
          .value=${this.address}
          @input=${(event: Event) => {
            this.address = (event.target as HTMLInputElement).value;
          }}
          @keydown=${this.#keydown}
        ></sp-textfield>
        <swc-button size="s" variant="secondary" @click=${() => this.#open()}>Open</swc-button>
      </form>
      <div class="scroll">
        ${
          tabs.length
            ? html`<ul aria-label="Browser windows">${tabs.map((tab) => this.#window(tab, active))}</ul>`
            : html`<div class="note">No browser windows open.</div>`
        }
      </div>`;
  }
}
