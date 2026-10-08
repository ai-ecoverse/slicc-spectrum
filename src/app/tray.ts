import { css, html, type TemplateResult } from 'lit';
import type { SliccModel, TrayConnection } from '../model/types.ts';
import { ModelElement, meterVariant, shared } from './base.ts';
import { confirm } from './confirm.ts';

export const connectionVariant: Record<TrayConnection, string> = {
  live: 'positive',
  connecting: 'info',
  reconnecting: 'info',
  stalled: 'notice',
  offline: 'neutral',
  error: 'negative',
};

export const connectionLabel: Record<TrayConnection, string> = {
  live: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  stalled: 'Stalled',
  offline: 'Offline',
  error: 'Error',
};

export class SliccTray extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    copied: { state: true },
  };
  declare copied: boolean;

  constructor() {
    super();
    this.copied = false;
  }

  static styles = [
    shared,
    css`
      :host {
        display: inline-block;
      }
      .chip > span {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      .chip swc-status-light {
        align-self: center;
      }
      :host([compact]) .chip .detail {
        display: none;
      }
      .muted {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .panel {
        display: grid;
        gap: var(--swc-spacing-200);
        width: calc(var(--swc-spacing-400) * 12);
        max-width: 100%;
        padding: var(--swc-spacing-300);
        box-sizing: border-box;
        font-size: var(--swc-font-size-100);
        color: var(--swc-neutral-content-color-default);
      }
      dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--swc-spacing-75) var(--swc-spacing-200);
        margin: 0;
      }
      dt {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      dd {
        margin: 0;
      }
      h3 {
        margin: 0 0 var(--swc-spacing-75);
        font-size: inherit;
        font-weight: var(--swc-bold-font-weight);
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      swc-meter {
        width: 100%;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.tray.on('status', () => this.requestUpdate())];
  }

  async #disconnect(name: string, trigger: HTMLElement): Promise<void> {
    const body = 'This SLICC stops syncing with the tray until you reconnect.';
    const title = `Disconnect from ${name}?`;
    if (await confirm({ title, body, action: 'Disconnect', variant: 'confirmation', trigger }))
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
    const connection = connectionLabel[status.connection];
    return html`<swc-action-button
        id="chip"
        class="chip"
        size="s"
        quiet
        accessible-label=${`Tray ${status.name}: ${connection}, ${status.followers.length} followers, ${status.budget.percent}% of budget`}
      >
        <span>
          <swc-status-light size="s" variant=${connectionVariant[status.connection]}>${connection}</swc-status-light>
          <span class="detail">${status.name}</span>
          <span class="detail muted"><swc-icon-user-group size="s"></swc-icon-user-group>${status.followers.length}</span>
          <span class="detail muted">${status.budget.percent}%</span>
        </span>
      </swc-action-button>
      <swc-popover for="chip" placement="bottom-end" accessible-label="Tray" @swc-open=${() => {
        this.copied = false;
      }}>
        <div class="panel">
          <dl>
            <dt>Name</dt><dd>${status.name}</dd>
            <dt>Connection</dt><dd>${connection}</dd>
            <dt>Role</dt><dd>${status.role}</dd>
            <dt>Runs in</dt><dd>${status.kind}</dd>
            <dt>Spent</dt><dd>$${status.spent.toFixed(2)} · $${status.rate.toFixed(2)}/h</dd>
          </dl>
          <swc-meter size="s" value=${status.budget.percent} variant=${meterVariant(status.budget.percent)}>
            <span slot="label">Budget (${status.budget.window})</span>
            <span slot="description">${status.budget.resets}</span>
          </swc-meter>
          <div>
            <h3>Followers</h3>
            ${
              status.followers.length
                ? html`<ul>${status.followers.map((follower) => html`<li>${follower.name} <span class="muted">${follower.device}</span></li>`)}</ul>`
                : html`<div class="muted">No one else is connected.</div>`
            }
          </div>
          <div class="actions">
            <swc-action-button size="s" @click=${() => this.copy()}>${this.copied ? 'Copied' : 'Copy join link'}</swc-action-button>
            ${
              status.connection === 'offline'
                ? html`<swc-action-button size="s" @click=${() => model.tray.reconnect()}>Reconnect</swc-action-button>`
                : html`<swc-action-button size="s" @click=${(event: Event) => this.#disconnect(status.name, event.currentTarget as HTMLElement)}>Disconnect</swc-action-button>`
            }
          </div>
        </div>
      </swc-popover>`;
  }
}
