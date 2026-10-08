import { css, html, nothing, type TemplateResult } from 'lit';
import type { SliccModel, TrayConnection } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';

export const connectionVariant: Record<TrayConnection, string> = {
  live: 'positive',
  connecting: 'info',
  reconnecting: 'info',
  stalled: 'notice',
  offline: 'neutral',
  error: 'negative',
};

export class SliccTray extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    open: { state: true },
    copied: { state: true },
  };
  declare open: boolean;
  declare copied: boolean;

  constructor() {
    super();
    this.open = false;
    this.copied = false;
  }

  static styles = [
    shared,
    css`
      :host {
        position: relative;
        display: inline-block;
        font-size: var(--spectrum-font-size-75);
      }
      .chip {
        all: unset;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 8px;
        border-radius: 12px;
        border: 1px solid var(--spectrum-gray-300);
        cursor: pointer;
        white-space: nowrap;
      }
      .chip:hover {
        background: var(--spectrum-gray-100);
      }
      :host([compact]) .chip > span:not(.dot) {
        display: none;
      }
      .chip:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
      }
      .muted {
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .followers {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .dot[data-variant='positive'] {
        background: var(--spectrum-positive-visual-color);
      }
      .panel {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        z-index: 10;
        width: 280px;
        padding: 10px 12px;
        border: 1px solid var(--spectrum-gray-300);
        border-radius: var(--spectrum-corner-radius-100);
        background: var(--spectrum-background-elevated-color, var(--spectrum-background-layer-2-color));
        box-shadow: 0 6px 18px var(--spectrum-drop-shadow-color);
        display: grid;
        gap: 8px;
      }
      dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2px 12px;
        margin: 0;
      }
      dt {
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      dd {
        margin: 0;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .budget {
        height: 4px;
        border-radius: 2px;
        background: var(--spectrum-gray-200);
        overflow: hidden;
      }
      .budget > span {
        display: block;
        height: 100%;
        background: var(--spectrum-accent-visual-color);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.tray.on('status', () => this.requestUpdate())];
  }

  #keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.open) {
      this.open = false;
      this.renderRoot.querySelector<HTMLElement>('.chip')?.focus();
    }
  };

  async #disconnect(name: string): Promise<void> {
    const body = 'This SLICC stops syncing with the tray until you reconnect.';
    if (await confirm({ title: `Disconnect from ${name}?`, body, action: 'Disconnect' }))
      this.model?.tray.disconnect();
  }

  async copy(): Promise<void> {
    const url = this.model?.tray.status().joinUrl ?? '';
    await globalThis.navigator?.clipboard?.writeText(url).catch(() => {});
    this.copied = true;
  }

  render(): TemplateResult {
    const model = this.model;
    if (!model) return html``;
    const status = model.tray.status();
    return html`<button
        class="chip"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-label=${`Tray ${status.name}: ${status.connection}, ${status.followers.length} followers, ${status.budget.percent}% of budget`}
        @click=${() => {
          this.open = !this.open;
          this.copied = false;
        }}
      >
        <span class="dot" data-variant=${connectionVariant[status.connection]}></span>
        <span>${status.name}</span>
        <span class="muted followers"><swc-icon-user-group size="xs"></swc-icon-user-group>${status.followers.length}</span>
        <span class="muted">${status.budget.percent}%</span>
      </button>
      ${
        this.open
          ? html`<div class="panel" role="dialog" aria-label="Tray" @keydown=${this.#keydown}>
              <dl>
                <dt>Connection</dt><dd>${status.connection}</dd>
                <dt>Role</dt><dd>${status.role}</dd>
                <dt>Runs in</dt><dd>${status.kind}</dd>
                <dt>Spent</dt><dd>$${status.spent.toFixed(2)} · $${status.rate.toFixed(2)}/h</dd>
                <dt>Budget</dt><dd>${status.budget.percent}% ${status.budget.window}, ${status.budget.resets}</dd>
              </dl>
              <div class="budget" role="meter" aria-label="Budget" aria-valuenow=${status.budget.percent} aria-valuemin="0" aria-valuemax="100"><span style=${`width: ${status.budget.percent}%`}></span></div>
              <div>
                <strong>Followers</strong>
                ${
                  status.followers.length
                    ? html`<ul>${status.followers.map((follower) => html`<li>${follower.name} <span class="muted">${follower.device}</span></li>`)}</ul>`
                    : html`<div class="muted">No one else is connected.</div>`
                }
              </div>
              <div class="actions">
                <sp-action-button size="s" quiet @click=${() => this.copy()}>${this.copied ? 'Copied' : 'Copy join link'}</sp-action-button>
                ${
                  status.connection === 'offline'
                    ? html`<sp-action-button size="s" quiet @click=${() => model.tray.reconnect()}>Reconnect</sp-action-button>`
                    : html`<sp-action-button size="s" quiet @click=${() => this.#disconnect(status.name)}>Disconnect</sp-action-button>`
                }
              </div>
            </div>`
          : nothing
      }`;
  }
}
