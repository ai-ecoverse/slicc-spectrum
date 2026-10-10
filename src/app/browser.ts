import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc/components/illustrated-message/swc-illustrated-message.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-camera.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-down.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-left.js';
import '@adobe/spectrum-wc-icons/swc-icon-close.js';
import '@adobe/spectrum-wc-icons/swc-icon-code.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import '@adobe/spectrum-wc-icons/swc-icon-cursor-click.js';
import '@adobe/spectrum-wc-icons/swc-icon-globe-grid.js';
import '@adobe/spectrum-wc-icons/swc-icon-keyboard.js';
import '@adobe/spectrum-wc-icons/swc-icon-link.js';
import '@adobe/spectrum-wc-icons/swc-icon-open-in.js';
import '@adobe/spectrum-wc-icons/swc-icon-refresh.js';
import '@adobe/spectrum-wc-icons/swc-icon-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-undo.js';
import '@adobe/spectrum-wc-icons/swc-icon-visibility.js';
import '@adobe/spectrum-wc-icons/swc-icon-web-page.js';
import link from '@adobe/spectrum-wc/link.css';
import { css, html, nothing, type TemplateResult, unsafeCSS } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  BrowserAction,
  BrowserActionKind,
  BrowserFrame,
  BrowserTab,
  SliccModel,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { agentName } from './files.ts';
import { time } from './messages.ts';
import { command, copyText, reach, reachStyles } from './reach.ts';

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

export function place(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return host ? `${host}${pathname === '/' ? '' : pathname}` : url;
  } catch {
    return url;
  }
}

export function since(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `Updated ${seconds} s ago`;
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)} min ago`;
  return `Updated at ${time(at)}`;
}

function called(value = ''): string {
  const url = value.split(' ').at(-1) as string;
  try {
    const { origin, pathname } = new URL(url);
    return `Called ${origin}${pathname}`;
  } catch {
    return `Called ${url}`.trim();
  }
}

function typed(action: BrowserAction): string {
  const count =
    action.length === undefined
      ? ''
      : ` ${action.length} ${action.length === 1 ? 'character' : 'characters'}`;
  return `Typed${count}${action.target ? ` into ${action.target}` : ''}`;
}

const verbs: Record<BrowserActionKind, (action: BrowserAction) => string> = {
  open: (action) => `Opened ${place(action.value ?? '')}`.trim(),
  goto: (action) => `Went to ${place(action.value ?? '')}`.trim(),
  back: () => 'Went back',
  reload: () => 'Reloaded',
  close: () => 'Closed tab',
  select: () => 'Switched tab',
  snapshot: () => 'Read the page',
  screenshot: () => 'Took a screenshot',
  eval: () => 'Ran a script',
  click: (action) => `Clicked${action.target ? ` ${action.target}` : ''}`,
  fill: typed,
  type: typed,
  press: (action) => `Pressed${action.value ? ` ${action.value}` : ''}`,
  scroll: () => 'Scrolled',
  request: (action) => called(action.value),
};

export function describe(action: BrowserAction): string {
  return verbs[action.kind](action);
}

const icons: Record<BrowserActionKind, TemplateResult> = {
  open: html`<swc-icon-open-in size="s"></swc-icon-open-in>`,
  goto: html`<swc-icon-link size="s"></swc-icon-link>`,
  back: html`<swc-icon-undo size="s"></swc-icon-undo>`,
  reload: html`<swc-icon-refresh size="s"></swc-icon-refresh>`,
  close: html`<swc-icon-close size="s"></swc-icon-close>`,
  select: html`<swc-icon-web-page size="s"></swc-icon-web-page>`,
  snapshot: html`<swc-icon-visibility size="s"></swc-icon-visibility>`,
  screenshot: html`<swc-icon-camera size="s"></swc-icon-camera>`,
  eval: html`<swc-icon-code size="s"></swc-icon-code>`,
  click: html`<swc-icon-cursor-click size="s"></swc-icon-cursor-click>`,
  fill: html`<swc-icon-text size="s"></swc-icon-text>`,
  type: html`<swc-icon-text size="s"></swc-icon-text>`,
  press: html`<swc-icon-keyboard size="s"></swc-icon-keyboard>`,
  scroll: html`<swc-icon-chevron-down size="s"></swc-icon-chevron-down>`,
  request: html`<swc-icon-globe-grid size="s"></swc-icon-globe-grid>`,
};

export const refresh = 10_000;
export const fresh = 3_000;
const narrowWidth = 480;
const wideWidth = 720;

const offline = html`<svg viewBox="0 0 96 72" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="84" height="56" rx="6"/><path d="M6 22h84"/><circle cx="16" cy="15" r="1.5"/><circle cx="24" cy="15" r="1.5"/><path d="M38 34l20 20M58 34L38 54"/></svg>`;

interface Image {
  src: string;
  at: number;
}

export class SliccBrowser extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    address: { state: true },
  };
  declare address: string;
  #shots = new Map<string, Image & { key: string }>();
  #frames = new Map<string, BrowserFrame>();
  #queue = new Set<string>();
  #running = false;
  #focus: string | null = null;
  #driven = new Set<string>();
  #pulse = new Set<string>();
  #watching: { tabId: string; size: string; stop: () => void } | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #width = 0;
  #copied: 'url' | 'failed' | null = null;
  #command: boolean | null = null;
  #count = 0;

  constructor() {
    super();
    this.address = '';
  }

  static styles = [
    unsafeCSS(link),
    reachStyles,
    css`
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
      ul,
      ol {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .cards {
        display: grid;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-300);
      }
      .cards > li {
        position: relative;
        display: flex;
        flex-direction: column;
        border: var(--swc-border-width-100) solid var(--swc-gray-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
      }
      .cards > li:has(.window[aria-current='true']) {
        border-color: var(--swc-accent-visual-color);
        box-shadow: inset 0 0 0 var(--swc-border-width-100) var(--swc-accent-visual-color);
      }
      [data-pulse] {
        animation: pulse 1.2s ease-in-out 3;
      }
      @keyframes pulse {
        50% {
          box-shadow: 0 0 0 var(--swc-spacing-75) var(--swc-informative-subtle-background-color-default);
          border-color: var(--swc-informative-visual-color);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-pulse] {
          animation: none;
          border-color: var(--swc-informative-visual-color);
        }
      }
      .window {
        display: grid;
        grid-template-columns: var(--slicc-browser-thumb, 96px) minmax(0, 1fr);
        align-items: center;
        gap: var(--swc-spacing-300);
        width: 100%;
        padding: var(--swc-spacing-200);
        padding-inline-end: calc(var(--swc-component-height-100) + var(--swc-spacing-200));
        box-sizing: border-box;
        border: 0;
        border-radius: var(--swc-corner-radius-medium-default);
        background: none;
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .window:hover {
        background: var(--swc-gray-100);
      }
      .window:focus-visible,
      .tabs button:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
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
      .driver,
      .url {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .host,
      .driver,
      .muted,
      figcaption,
      .who {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .state {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
      }
      .cards .driving,
      .cards .driver {
        padding: 0 var(--swc-spacing-200) var(--swc-spacing-200);
      }
      .driving {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
        min-width: 0;
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
      .focused {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-300);
      }
      .focused.wide {
        grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
        align-items: start;
      }
      .detail {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-200);
        min-width: 0;
      }
      .bar,
      .address {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-width: 0;
      }
      .bar sp-picker {
        flex: 1;
        min-width: 0;
        max-width: 100%;
      }
      .url {
        flex: 1;
        min-width: 0;
        font-family: var(--swc-code-font-family-stack);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .narrow .driving swc-button {
        flex: 1 0 100%;
      }
      .swc-Link {
        font-size: inherit;
      }
      .tabs {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
      }
      .tabs button {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0 var(--swc-spacing-100);
        width: 100%;
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border: var(--swc-border-width-100) solid transparent;
        border-radius: var(--swc-corner-radius-medium-default);
        background: none;
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .tabs button:hover {
        background: var(--swc-gray-100);
      }
      .tabs button[aria-current='true'] {
        background: var(--swc-gray-200);
        font-weight: var(--swc-bold-font-weight);
      }
      .tabs .title {
        font-size: var(--swc-font-size-75);
      }
      .tabs .host {
        grid-column: 1;
        font-weight: normal;
      }
      .dot {
        display: inline-block;
        width: var(--swc-spacing-100);
        height: var(--swc-spacing-100);
        border-radius: 50%;
        background: var(--swc-informative-visual-color);
        font-size: 0;
      }
      figure {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-75);
        margin: 0;
      }
      .frame {
        display: grid;
        place-items: center;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        border: var(--swc-border-width-100) solid var(--swc-gray-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-card-background-well-color);
      }
      .wide .frame {
        max-height: 50vh;
      }
      .frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
      }
      figcaption {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--swc-spacing-200);
      }
      h3,
      summary {
        margin: var(--swc-spacing-200) 0 var(--swc-spacing-75);
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-heading-color);
      }
      summary {
        cursor: pointer;
      }
      .actions {
        display: flex;
        flex-direction: column;
        max-height: 20rem;
        overflow: auto;
      }
      .actions li {
        display: grid;
        grid-template-columns: var(--swc-spacing-400) minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-75) 0;
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        --swc-icon-color: var(--swc-neutral-subdued-content-color-default);
      }
      .actions li > :first-child {
        display: grid;
        place-items: center;
        min-height: var(--swc-line-height-200);
      }
      .what {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .last .what {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .actions .failure {
        color: var(--swc-negative-content-color-default);
      }
      [data-status='failed'] {
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      .who {
        white-space: nowrap;
      }
      .offline {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-500) var(--swc-spacing-400);
      }
      .offline svg {
        width: 96px;
        fill: none;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .reach {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-200);
        max-width: 28rem;
      }
      .reach p {
        margin: 0;
      }
      .error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-negative-subtle-background-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      @container (min-width: 480px) {
        .cards {
          grid-template-columns: repeat(auto-fill, minmax(var(--swc-card-default-width-small), 1fr));
          gap: var(--swc-spacing-300);
        }
        .cards .window {
          grid-template-columns: minmax(0, 1fr);
          align-items: start;
          align-content: start;
          height: 100%;
          padding: var(--swc-spacing-200);
        }
        .cards > li {
          justify-content: space-between;
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#shots.clear();
    this.#frames.clear();
    this.#pulse.clear();
    const tabs = model.browser.list();
    this.#driven = new Set(tabs.filter((tab) => tab.controlled).map((tab) => tab.id));
    this.#focus = this.#latest(model, tabs);
    this.#stale();
    const timer = setInterval(() => this.#tick(), refresh);
    const resize = new ResizeObserver(([entry]) => {
      this.#width = entry?.contentRect.width ?? 0;
      this.requestUpdate();
    });
    resize.observe(this);
    const visibility = () => this.requestUpdate();
    document.addEventListener('visibilitychange', visibility);
    return [
      model.browser.on('tabs', () => this.#tabs()),
      model.browser.on('active', (id) => {
        if (id) this.#request(id);
        this.requestUpdate();
      }),
      model.browser.on('action', (event) => {
        const action = event as BrowserAction;
        if (action.tabId && action.status !== 'running') this.#request(action.tabId);
        this.requestUpdate();
      }),
      model.browser.on('frame', (event) => {
        const frame = event as BrowserFrame;
        this.#frames.set(frame.tabId, frame);
        this.requestUpdate();
      }),
      ...(model.network ? [model.network.on('network', () => this.requestUpdate())] : []),
      () => clearInterval(timer),
      () => resize.disconnect(),
      () => document.removeEventListener('visibilitychange', visibility),
      () => this.#settle(null),
      () => this.#still(),
    ];
  }

  focus(): void {
    void this.updateComplete.then(() =>
      this.focusOn(
        '[data-action="stop-agent"]',
        '[data-action="all-tabs"]',
        '.window[aria-current="true"]',
        '.window',
        'form swc-button',
        '[data-action="copy-command"]'
      )
    );
  }

  #latest(model: SliccModel, tabs: readonly BrowserTab[]): string | null {
    const driven = tabs.filter((tab) => tab.controlled);
    const at = (tab: BrowserTab) =>
      Math.max(-1, ...(model.browser.actions?.(tab.id) ?? []).map((action) => action.at));
    return driven.sort((a, b) => at(b) - at(a))[0]?.id ?? null;
  }

  #tabs(): void {
    const tabs = this.model?.browser.list() ?? [];
    const driven = new Set(tabs.filter((tab) => tab.controlled).map((tab) => tab.id));
    for (const id of driven) if (!this.#driven.has(id) && id !== this.#focus) this.#pulse.add(id);
    for (const id of this.#pulse) if (!driven.has(id)) this.#pulse.delete(id);
    this.#driven = driven;
    const ids = new Set(tabs.map((tab) => tab.id));
    for (const id of this.#frames.keys()) if (!ids.has(id)) this.#frames.delete(id);
    if (this.#focus && !ids.has(this.#focus)) this.#show(null);
    this.#stale();
    this.requestUpdate();
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
    return !document.hidden && this.isConnected && this.#width > 0;
  }

  #tick(): void {
    if (this.#running || !this.#visible()) return;
    for (const tab of this.model?.browser.list() ?? []) this.#request(tab.id);
  }

  #request(id: string): void {
    if (this.#watching?.tabId === id) return;
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
          this.#shots.set(id, { key, src, at: Date.now() });
          this.requestUpdate();
        }
      } catch {}
    }
    this.#running = false;
  }

  #image(id: string): Image | null {
    const frame = this.#frames.get(id);
    const shot = this.#shots.get(id);
    if (frame && (!shot || frame.at >= shot.at)) return frame;
    return shot ?? null;
  }

  #show(id: string | null): void {
    this.#focus = id;
    this.#copied = null;
    if (id) this.#pulse.delete(id);
    this.requestUpdate();
  }

  #focused(): BrowserTab | undefined {
    return this.model?.browser.list().find((tab) => tab.id === this.#focus);
  }

  protected updated(): void {
    const tab = this.#focused();
    const visible = this.#visible();
    this.#settle(visible && tab?.controlled && this.model?.browser.watch ? tab.id : null);
    if (visible && tab && !this.#ticker)
      this.#ticker = setInterval(() => this.requestUpdate(), 1000);
    if (!(visible && tab)) this.#still();
    const list = this.renderRoot.querySelector('.actions:not(.last)');
    const count = list?.childElementCount ?? 0;
    if (list && count !== this.#count) list.scrollTop = list.scrollHeight;
    this.#count = count;
  }

  #still(): void {
    if (this.#ticker) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  #settle(id: string | null): void {
    const box = id ? this.renderRoot.querySelector('.frame')?.getBoundingClientRect() : undefined;
    const size = box?.width
      ? { width: Math.round(box.width), height: Math.round(box.height) }
      : undefined;
    const key = size ? `${size.width}x${size.height}` : '';
    if (this.#watching?.tabId === id && this.#watching?.size === key) return;
    this.#watching?.stop();
    this.#watching = null;
    if (!id) return;
    this.#watching = {
      tabId: id,
      size: key,
      stop: (this.model as SliccModel).browser.watch?.(id, size) as () => void,
    };
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

  #stop(agentId: string, refocus: string): void {
    this.model?.agent.stop(agentId);
    void this.updateComplete.then(() => this.focusOn(refocus, '[data-action="all-tabs"]'));
  }

  async #copy(url: string): Promise<void> {
    this.#copied = (await copyText(url)) ? 'url' : 'failed';
    this.requestUpdate();
  }

  async #copyCommand(text: string): Promise<void> {
    this.#command = await copyText(text);
    this.requestUpdate();
  }

  #who(tab: BrowserTab): string {
    return tab.agentId
      ? `${agentName(this.model as SliccModel, tab.agentId)} is using this tab`
      : 'In use';
  }

  #stopButton(
    tab: BrowserTab,
    refocus: string,
    justified = false
  ): TemplateResult | typeof nothing {
    if (!tab.agentId) return nothing;
    const agentId = tab.agentId;
    return html`<swc-button size="s" variant="secondary" ?justified=${justified} data-action="stop-agent" @click=${() => this.#stop(agentId, refocus)}>Stop ${agentName(this.model as SliccModel, agentId)}</swc-button>`;
  }

  #card(tab: BrowserTab, active: string | null): TemplateResult {
    const model = this.model as SliccModel;
    const shot = this.#image(tab.id)?.src;
    const current = tab.id === active;
    const loading = tab.status === 'loading';
    return html`<li data-id=${tab.id} ?data-controlled=${tab.controlled} ?data-pulse=${this.#pulse.has(tab.id)}>
      <button class="window" aria-current=${current ? 'true' : 'false'} title=${tab.url} @click=${() => this.#show(tab.id)}>
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
        </span>
      </button>
      ${
        tab.controlled
          ? html`<div class="driving"><swc-status-light size="s" variant="info">${this.#who(tab)}</swc-status-light>${this.#stopButton(tab, `li[data-id="${tab.id}"] .window`)}</div>`
          : tab.agentId
            ? html`<span class="driver">Last used by ${agentName(model, tab.agentId)}</span>`
            : nothing
      }
      <swc-close-button size="m" accessible-label=${`Close ${tab.title}`} @click=${() => model.browser.close(tab.id)}></swc-close-button>
    </li>`;
  }

  #overview(tabs: readonly BrowserTab[]): TemplateResult {
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
            ? html`<ul class="cards" aria-label="Browser tabs">${tabs.map((tab) => this.#card(tab, active))}</ul>`
            : html`<div class="note">No browser tabs open.</div>`
        }
      </div>`;
  }

  #picker(tabs: readonly BrowserTab[], tab: BrowserTab): TemplateResult {
    return html`<sp-picker size="s" label="Tab" .value=${live(tab.id)} @change=${(event: Event) => this.#show((event.target as HTMLElement & { value: string }).value)}>
      ${tabs.map(
        (item) => html`<sp-menu-item value=${item.id}>
          <swc-icon-globe-grid slot="icon"></swc-icon-globe-grid>${item.title}<span slot="description">${host(item.url)}</span>${
            item.controlled
              ? html`<span slot="value" class="dot" data-driven>In use</span>`
              : nothing
          }
        </sp-menu-item>`
      )}
    </sp-picker>`;
  }

  #list(tabs: readonly BrowserTab[], tab: BrowserTab): TemplateResult {
    return html`<ul class="tabs" aria-label="Browser tabs">
      ${tabs.map(
        (
          item
        ) => html`<li data-id=${item.id} ?data-controlled=${item.controlled} ?data-pulse=${this.#pulse.has(item.id)}>
          <button aria-current=${item.id === tab.id ? 'true' : 'false'} title=${item.url} @click=${() => this.#show(item.id)}>
            <span class="title">${item.title}</span>${item.controlled ? html`<span class="dot" data-driven>In use</span>` : nothing}
            <span class="host">${host(item.url)}</span>
          </button>
        </li>`
      )}
    </ul>`;
  }

  #view(tab: BrowserTab): TemplateResult {
    const image = this.#image(tab.id);
    const now = Date.now();
    const view = !image
      ? 'none'
      : this.#watching?.tabId === tab.id &&
          this.#frames.get(tab.id) === image &&
          now - image.at < fresh
        ? 'live'
        : 'shot';
    return html`<figure data-view=${view}>
      <div class="frame">
        ${
          image
            ? html`<img src=${image.src} alt=${`${tab.title}, as the agent sees it`} draggable="false" />`
            : html`<swc-progress-circle size="m" label="Loading preview"></swc-progress-circle>`
        }
      </div>
      <figcaption>
        ${
          view === 'live'
            ? html`<swc-status-light size="s" variant="positive">Live</swc-status-light>`
            : html`<span>${image ? since(image.at, now) : 'No preview yet'}</span>`
        }
        <span>View only</span>
      </figcaption>
    </figure>`;
  }

  #row(action: BrowserAction): TemplateResult {
    const failed = action.status === 'failed';
    return html`<li data-action-id=${action.id} data-kind=${action.kind} data-status=${action.status} title=${action.kind === 'request' ? (action.value ?? '') : nothing}>
      <span>${
        action.status === 'running'
          ? html`<swc-progress-circle size="s" indeterminate label="Running"></swc-progress-circle>`
          : failed
            ? html`<swc-icon-alert-triangle size="s" aria-label="Failed"></swc-icon-alert-triangle>`
            : icons[action.kind]
      }</span>
      <span class="what"><span>${describe(action)}</span>${failed && action.error ? html`<span class="failure">${action.error}</span>` : nothing}</span>
      <span class="who">${agentName(this.model as SliccModel, action.agentId)} ${time(action.at)}</span>
    </li>`;
  }

  #actions(tab: BrowserTab): TemplateResult | typeof nothing {
    const port = (this.model as SliccModel).browser;
    if (!port.actions) return nothing;
    const actions = port
      .actions()
      .filter(
        (action) =>
          action.tabId === tab.id ||
          (action.tabId === null && action.agentId !== null && action.agentId === tab.agentId)
      )
      .slice(-50);
    if (!actions.length)
      return html`<h3>Recent actions</h3><p class="muted" data-actions="none">No actions yet.</p>`;
    if (this.#width >= narrowWidth)
      return html`<h3>Recent actions</h3><ol class="actions" aria-label="Recent actions">${actions.map((action) => this.#row(action))}</ol>`;
    const last = actions.at(-1) as BrowserAction;
    return html`<details>
        <summary>Recent actions (${actions.length})</summary>
        <ol class="actions" aria-label="Earlier actions">${actions.slice(0, -1).map((action) => this.#row(action))}</ol>
      </details>
      <ol class="actions last" aria-label="Last action">${this.#row(last)}</ol>`;
  }

  #detail(tabs: readonly BrowserTab[], tab: BrowserTab): TemplateResult {
    const narrow = this.#width < narrowWidth;
    const wide = this.#width >= wideWidth;
    const copy =
      this.#copied === 'url' ? 'Copied' : this.#copied === 'failed' ? 'Couldn’t copy' : 'Copy';
    return html`<div class=${`focused${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}`}>
      ${wide ? this.#list(tabs, tab) : nothing}
      <section class="detail" aria-label=${tab.title}>
        <div class="bar">
          <swc-action-button size="s" quiet data-action="all-tabs" @click=${() => {
            this.#show(null);
            void this.updateComplete.then(() => this.focusOn('.window'));
          }}><swc-icon-chevron-left slot="icon"></swc-icon-chevron-left>All tabs (${tabs.length})</swc-action-button>
          ${wide ? nothing : this.#picker(tabs, tab)}
        </div>
        <div class="address">
          <span class="url" title=${tab.url}>${narrow ? place(tab.url) : tab.url}</span>
          <swc-action-button size="s" quiet data-action="copy-url" accessible-label=${copy === 'Copy' ? 'Copy URL' : copy} @click=${() => this.#copy(tab.url)}><swc-icon-copy slot="icon"></swc-icon-copy>${narrow ? nothing : copy}</swc-action-button>
          <swc-action-button size="s" quiet data-action="open-tab" accessible-label="Show in the browser" @click=${() => this.model?.browser.activate(tab.id)}><swc-icon-open-in slot="icon"></swc-icon-open-in>${narrow ? nothing : 'Open'}</swc-action-button>
        </div>
        <div class="driving" data-driving=${tab.controlled ? (tab.agentId ? 'agent' : 'user') : 'none'}>
          <swc-status-light size="m" variant=${tab.controlled ? 'info' : 'neutral'}>${tab.controlled ? this.#who(tab) : 'No agent is using this tab'}</swc-status-light>
          ${tab.controlled ? this.#stopButton(tab, '[data-action="all-tabs"]', narrow) : nothing}
        </div>
        ${this.#view(tab)}
        ${this.#actions(tab)}
      </section>
    </div>`;
  }

  #offline(): TemplateResult {
    const status = this.model?.network?.status();
    return html`<div class="scroll"><div class="offline" data-browser="none">
      <swc-illustrated-message>
        ${offline}
        <h2 slot="heading">Browser control isn’t connected</h2>
        <span slot="description">Agents can’t open or use browser tabs yet.</span>
      </swc-illustrated-message>
      <div class="reach">${reach({
        intro:
          'Install the SLICC Chrome extension, or run slicc-node on this computer. Either one lets agents use this browser.',
        extensionUrl: status?.extensionUrl,
        copied: this.#command === true,
        uncopied: this.#command === false,
        copy: () => this.#copyCommand(command),
      })}</div>
    </div></div>`;
  }

  render(): TemplateResult {
    const tabs = this.model?.browser.list() ?? [];
    if (!tabs.length && this.model?.network?.status().browser?.via === null) return this.#offline();
    const tab = tabs.find((candidate) => candidate.id === this.#focus);
    return tab ? html`<div class="scroll">${this.#detail(tabs, tab)}</div>` : this.#overview(tabs);
  }
}
