import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { LiveItem, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function liveLine(item: LiveItem, now: number): string {
  const tail = item.endedAt != null ? 'Ended' : elapsed(now - item.since);
  return [item.label, item.what, item.asker, tail].filter(Boolean).join(' · ');
}

export class SliccLive extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    compact: { type: Boolean, reflect: true },
    now: { state: true },
  };
  declare compact: boolean;
  declare now: number;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.compact = false;
    this.now = Date.now();
  }

  static styles = css`
    :host {
      display: block;
    }
    .live {
      display: flex;
      flex-direction: column;
      gap: var(--swc-spacing-50);
      padding: var(--swc-spacing-75) var(--swc-spacing-200);
      border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      background: var(--swc-background-layer-1-color);
      font-size: var(--swc-font-size-75);
      color: var(--swc-neutral-content-color-default);
    }
    .chip {
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-100);
      min-width: 0;
    }
    .dot {
      flex: none;
      inline-size: var(--swc-spacing-100);
      block-size: var(--swc-spacing-100);
      border-radius: 50%;
      background: var(--swc-negative-visual-color);
    }
    .chip[data-ended] .dot {
      background: var(--swc-neutral-visual-color);
    }
    .text {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-variant-numeric: tabular-nums;
    }
    .label {
      font-weight: var(--swc-bold-font-weight);
    }
    :host([compact]) .detail {
      display: none;
    }
    swc-action-button {
      flex: none;
    }
  `;

  protected subscribe(model: SliccModel): Array<() => void> {
    return model.live
      ? [
          model.live.on('items', () => {
            this.now = Date.now();
            this.requestUpdate();
          }),
        ]
      : [];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#tick(false);
  }

  #items(): readonly LiveItem[] {
    return this.model?.live?.items() ?? [];
  }

  #live(): boolean {
    return this.#items().some((item) => item.endedAt == null);
  }

  #tick(on: boolean): void {
    if (on && !this.#timer) this.#timer = setInterval(() => (this.now = Date.now()), 1000);
    if (!on && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.#tick(this.isConnected && this.#live());
  }

  #chip(item: LiveItem): TemplateResult {
    const ended = item.endedAt != null;
    const rest = [item.what, item.asker].filter(Boolean).join(' · ');
    const stamp = ended ? null : elapsed(this.now - item.since);
    return html`<div class="chip" role="listitem" data-id=${item.id} data-kind=${item.kind} ?data-ended=${ended}>
      <span class="dot" aria-hidden="true"></span>
      <span class="text" title=${liveLine(item, this.now)}
        ><span class="label">${item.label}</span>${
          rest ? html`<span class="detail"> · ${rest}</span>` : nothing
        }${
          ended
            ? html`<span class="ended"> · Ended</span>`
            : html`<span class="detail"> · ${stamp}</span>`
        }</span
      >
      <swc-action-button size="s" quiet data-action="live-act" accessible-label=${`${item.action.label}: ${item.label}`} @click=${() => this.model?.live?.act(item.id)}>${item.action.label}</swc-action-button>
    </div>`;
  }

  render(): TemplateResult | typeof nothing {
    const items = this.#items();
    if (!items.length) return nothing;
    return html`<div class="live" role="list" aria-label="Live now" data-surface="live">${repeat(
      items,
      (item) => item.id,
      (item) => this.#chip(item)
    )}</div>`;
  }
}
