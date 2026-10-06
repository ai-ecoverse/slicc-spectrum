import { css, html, type TemplateResult } from 'lit';
import type { Account, Settings, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';

const accountStatus = {
  connected: ['positive', 'Connected'],
  expired: ['notice', 'Expired'],
  disconnected: ['neutral', 'Not connected'],
} as const;

export class SliccSettings extends ModelElement {
  static properties = { ...ModelElement.properties, pending: { state: true } };
  declare pending: ReadonlySet<string>;

  constructor() {
    super();
    this.pending = new Set();
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
        background: var(--spectrum-background-layer-2-color);
        color: var(--spectrum-neutral-content-color-default);
        font-size: var(--spectrum-font-size-100);
      }
      .page {
        max-width: 640px;
        padding: 16px 24px 32px;
      }
      h2 {
        font-size: var(--spectrum-font-size-75);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--spectrum-neutral-subdued-content-color-default);
        margin: 24px 0 8px;
        font-weight: 700;
      }
      .row {
        display: grid;
        grid-template-columns: 200px 1fr;
        align-items: center;
        gap: 12px;
        min-height: 40px;
        border-bottom: 1px solid var(--spectrum-gray-200);
      }
      .row label,
      .row .label {
        color: var(--spectrum-neutral-content-color-default);
      }
      sp-picker {
        width: 240px;
      }
      .account {
        display: grid;
        grid-template-columns: 120px 1fr auto auto;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        border-bottom: 1px solid var(--spectrum-gray-200);
      }
      .identity {
        color: var(--spectrum-neutral-subdued-content-color-default);
        font-size: var(--spectrum-font-size-75);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .state {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--spectrum-font-size-75);
      }
      .state .dot[data-variant='positive'] {
        background: var(--spectrum-positive-visual-color);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [model.settings.on('settings', update), model.settings.on('accounts', update)];
  }

  focus(): void {
    this.focusOn('sp-picker');
  }

  #update(patch: Partial<Settings>): void {
    this.model?.settings.update(patch);
  }

  #value(event: Event): string {
    return (event.target as HTMLElement & { value: string }).value;
  }

  #checked(event: Event): boolean {
    return (event.target as HTMLElement & { checked: boolean }).checked;
  }

  async connect(id: string): Promise<void> {
    this.pending = new Set([...this.pending, id]);
    try {
      await this.model?.settings.connect(id);
    } finally {
      this.pending = new Set([...this.pending].filter((candidate) => candidate !== id));
    }
  }

  #account(account: Account): TemplateResult {
    const [variant, label] = accountStatus[account.status];
    const busy = this.pending.has(account.id);
    const action =
      account.status === 'connected'
        ? html`<sp-button size="s" variant="secondary" treatment="outline" @click=${() => this.model?.settings.disconnect(account.id)}
            >Disconnect</sp-button
          >`
        : html`<sp-button size="s" variant="secondary" ?pending=${busy} @click=${() => this.connect(account.id)}
            >${account.status === 'expired' ? 'Reconnect' : 'Connect'}</sp-button
          >`;
    return html`<div class="account" data-id=${account.id}>
      <strong>${account.provider}</strong>
      <span class="identity">${account.identity || '—'}</span>
      <span class="state"><span class="dot" data-variant=${variant}></span>${label}</span>
      ${action}
    </div>`;
  }

  render(): TemplateResult {
    const settings = this.model?.settings;
    const value = settings?.get();
    if (!(settings && value)) return html`<div class="page">No settings.</div>`;
    return html`<div class="page">
      <h2>Appearance</h2>
      <div class="row">
        <span class="label" id="theme">Theme</span>
        <sp-picker size="m" label="Theme" aria-labelledby="theme" value=${value.color} @change=${(e: Event) => this.#update({ color: this.#value(e) as Settings['color'] })}>
          <sp-menu-item value="system">Same as the system</sp-menu-item>
          <sp-menu-item value="light">Light</sp-menu-item>
          <sp-menu-item value="dark">Dark</sp-menu-item>
        </sp-picker>
      </div>
      <h2>Agent</h2>
      <div class="row">
        <span class="label" id="model">Model for new cones</span>
        <sp-picker size="m" label="Model" aria-labelledby="model" value=${value.model} @change=${(e: Event) => this.#update({ model: this.#value(e) })}>
          ${settings.models().map((option) => html`<sp-menu-item value=${option.id}>${option.label}<span slot="description">${option.provider}</span></sp-menu-item>`)}
        </sp-picker>
      </div>
      <div class="row">
        <span class="label" id="thinking">Thinking</span>
        <sp-picker size="m" label="Thinking" aria-labelledby="thinking" value=${value.thinking} @change=${(e: Event) => this.#update({ thinking: this.#value(e) as Settings['thinking'] })}>
          <sp-menu-item value="off">Off</sp-menu-item>
          <sp-menu-item value="low">Low</sp-menu-item>
          <sp-menu-item value="medium">Medium</sp-menu-item>
          <sp-menu-item value="high">High</sp-menu-item>
        </sp-picker>
      </div>
      <div class="row">
        <span class="label">Chat</span>
        <div>
          <sp-switch ?checked=${value.sendOnEnter} data-setting="sendOnEnter" @change=${(e: Event) => this.#update({ sendOnEnter: this.#checked(e) })}>Enter sends, Shift+Enter adds a line</sp-switch>
          <sp-switch ?checked=${value.showThinking} data-setting="showThinking" @change=${(e: Event) => this.#update({ showThinking: this.#checked(e) })}>Show thinking</sp-switch>
        </div>
      </div>
      <div class="row">
        <span class="label" id="diffs">Diffs</span>
        <sp-picker size="m" label="Diffs" aria-labelledby="diffs" value=${value.diffStyle} @change=${(e: Event) => this.#update({ diffStyle: this.#value(e) as Settings['diffStyle'] })}>
          <sp-menu-item value="unified">Unified</sp-menu-item>
          <sp-menu-item value="split">Split</sp-menu-item>
        </sp-picker>
      </div>
      <h2>Accounts</h2>
      ${settings.accounts().map((account) => this.#account(account))}
    </div>`;
  }
}
