import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Account, Settings, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';
import { confirm } from './confirm.ts';

const accountStatus = {
  connected: ['positive', 'Connected'],
  expired: ['notice', 'Expired'],
  disconnected: ['neutral', 'Not connected'],
} as const;

export class SliccSettings extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    pending: { state: true },
    entering: { state: true },
    failure: { state: true },
  };
  declare pending: ReadonlySet<string>;
  declare entering: string | null;
  declare failure: { id: string; message: string } | null;

  constructor() {
    super();
    this.pending = new Set();
    this.entering = null;
    this.failure = null;
  }

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
        container-type: inline-size;
        background: var(--swc-background-layer-2-color);
        color: var(--swc-neutral-content-color-default);
        font-size: var(--swc-font-size-100);
        line-height: var(--swc-line-height-100);
      }
      .page {
        max-width: 640px;
        padding: var(--swc-spacing-300) var(--swc-spacing-400) var(--swc-spacing-500);
      }
      h2 {
        font-size: var(--swc-heading-size-xs);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-heading-line-height);
        color: var(--swc-heading-color);
        margin: var(--swc-spacing-500) 0 var(--swc-spacing-200);
      }
      h2:first-child {
        margin-top: var(--swc-spacing-200);
      }
      .rows {
        display: grid;
        row-gap: var(--swc-spacing-200);
      }
      .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
        align-items: center;
        gap: var(--swc-spacing-200);
        min-height: var(--swc-component-height-200);
      }
      .switches {
        display: flex;
        flex-wrap: wrap;
        column-gap: var(--swc-spacing-400);
      }
      sp-picker {
        width: 240px;
        max-width: 100%;
      }
      .accounts {
        display: grid;
        grid-template-columns: minmax(0, max-content) minmax(0, 1fr) max-content max-content;
        align-items: center;
        gap: var(--swc-spacing-300) var(--swc-spacing-400);
      }
      .account,
      .key,
      .failure {
        grid-column: 1 / -1;
      }
      .account {
        display: grid;
        grid-template-columns: subgrid;
        align-items: center;
        min-height: var(--swc-component-height-200);
      }
      .state {
        align-self: center;
      }
      .provider {
        font-weight: var(--swc-bold-font-weight);
      }
      .identity {
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
      }
      .key {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .key sp-textfield {
        flex: 1 1 auto;
      }
      .failure {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        color: var(--swc-negative-content-color-default);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      @container (max-width: 480px) {
        .page {
          padding-inline: var(--swc-spacing-300);
        }
        .row {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--swc-spacing-75);
        }
        .accounts {
          grid-template-columns: minmax(0, 1fr) max-content;
          row-gap: var(--swc-spacing-400);
        }
        .account {
          grid-template-columns: minmax(0, 1fr) max-content;
          grid-template-areas: 'provider action' 'identity action' 'state action';
          column-gap: var(--swc-spacing-300);
          row-gap: var(--swc-spacing-50);
        }
        .provider {
          grid-area: provider;
        }
        .identity {
          grid-area: identity;
        }
        .state {
          grid-area: state;
        }
        .account swc-button {
          grid-area: action;
        }
        .key sp-textfield {
          flex-basis: 100%;
        }
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

  async connect(id: string, secret?: string): Promise<void> {
    this.pending = new Set([...this.pending, id]);
    this.failure = null;
    try {
      await this.model?.settings.connect(id, secret);
      if (this.entering === id) this.entering = null;
    } catch (error) {
      this.failure = { id, message: (error as Error).message };
    } finally {
      this.pending = new Set([...this.pending].filter((candidate) => candidate !== id));
    }
  }

  #start(account: Account): void {
    if (account.auth !== 'api-key') {
      void this.connect(account.id);
      return;
    }
    this.failure = null;
    this.entering = account.id;
    void this.updateComplete.then(() => this.focusOn('.key sp-textfield'));
  }

  #submit(event: Event, id: string): void {
    event.preventDefault();
    const field = (event.currentTarget as HTMLElement).querySelector(
      'sp-textfield'
    ) as HTMLElement & {
      value: string;
    };
    const secret = field.value.trim();
    field.value = '';
    if (secret) void this.connect(id, secret);
  }

  #send(event: Event): void {
    (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
  }

  #enter(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#send(event);
  }

  #cancel(): void {
    this.entering = null;
    this.failure = null;
  }

  #key(account: Account): TemplateResult | typeof nothing {
    if (this.entering !== account.id) return nothing;
    const busy = this.pending.has(account.id);
    return html`<form class="key" data-id=${account.id} @submit=${(event: Event) => this.#submit(event, account.id)}>
        <sp-textfield
          size="m"
          type="password"
          autocomplete="off"
          label=${`${account.provider} API key`}
          placeholder="Paste the API key"
          @keydown=${(event: KeyboardEvent) => this.#enter(event)}
        ></sp-textfield>
        <swc-button size="m" variant="accent" data-action="save" ?pending=${busy} @click=${(event: Event) => this.#send(event)}>Save</swc-button>
        <swc-button size="m" variant="secondary" data-action="cancel" @click=${() => this.#cancel()}>Cancel</swc-button>
      </form>`;
  }

  async #disconnect(account: Account): Promise<void> {
    const body = `Agents can’t use ${account.provider} until you connect it again.`;
    const title = `Disconnect ${account.provider}?`;
    if (await confirm({ title, body, action: 'Disconnect', variant: 'confirmation' }))
      this.model?.settings.disconnect(account.id);
  }

  #action(account: Account): TemplateResult {
    if (account.status === 'connected') {
      return html`<swc-button
        size="m"
        variant="secondary"
        data-action="disconnect"
        accessible-label=${`Disconnect ${account.provider}`}
        @click=${() => this.#disconnect(account)}
      >Disconnect</swc-button>`;
    }
    const label = account.status === 'expired' ? 'Reconnect' : 'Connect';
    const entering = this.entering === account.id;
    return html`<swc-button
      size="m"
      variant="secondary"
      data-action="connect"
      accessible-label=${`${label} ${account.provider}`}
      ?pending=${!entering && this.pending.has(account.id)}
      ?disabled=${entering}
      @click=${() => this.#start(account)}
    >${label}</swc-button>`;
  }

  #account(account: Account): TemplateResult {
    const [variant, label] = accountStatus[account.status];
    const failure =
      this.failure?.id === account.id
        ? html`<div class="failure" role="alert">
            <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
            <span>${this.failure.message}</span>
          </div>`
        : nothing;
    return html`<div class="account" data-id=${account.id}>
      <span class="provider">${account.provider}</span>
      <span class="identity">${account.identity}</span>
      <swc-status-light class="state" variant=${variant}>${label}</swc-status-light>
      ${this.#action(account)}
    </div>
    ${this.#key(account)}
    ${failure}`;
  }

  render(): TemplateResult {
    const settings = this.model?.settings;
    const value = settings?.get();
    if (!(settings && value)) return html`<div class="page">No settings.</div>`;
    return html`<div class="page">
      <h2>Appearance</h2>
      <div class="rows">
      <div class="row">
        <span class="label" id="theme">Theme</span>
        <sp-picker size="m" label="Theme" aria-labelledby="theme" value=${value.color} @change=${(e: Event) => this.#update({ color: this.#value(e) as Settings['color'] })}>
          <sp-menu-item value="system">Same as the system</sp-menu-item>
          <sp-menu-item value="light">Light</sp-menu-item>
          <sp-menu-item value="dark">Dark</sp-menu-item>
        </sp-picker>
      </div>
      </div>
      <h2>Agent</h2>
      <div class="rows">
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
        <div class="switches">
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
      </div>
      <h2>Accounts</h2>
      <div class="accounts">${settings.accounts().map((account) => this.#account(account))}</div>
    </div>`;
  }
}
