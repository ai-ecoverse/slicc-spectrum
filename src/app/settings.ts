import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type {
  Account,
  AccountField,
  RecordKind,
  Settings,
  SliccModel,
  VaultPort,
} from '../model/types.ts';
import { isVaultFailure, valueProblem } from '../model/values.ts';
import { chatModels, speech, ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { forgetSwitch, modelSwitch, settleModels } from './models.ts';
import { recordKind, recordName, serverOf, upper as upperName } from './records.ts';
import { clearValues, failureText, fieldStyles, type PopupDetail, take } from './vault.ts';
import { ViewScroll } from './view-state.ts';

const accountStatus = {
  connected: ['positive', 'Connected'],
  expired: ['notice', 'Expired'],
  disconnected: ['neutral', 'Not connected'],
  'signing-in': ['info', 'Signing in…'],
  rejected: ['notice', 'Rejected'],
  'needs-sign-in': ['neutral', 'Needs sign-in'],
  'sign-in-expired': ['notice', 'Sign-in expired'],
} as const;

const popup = (account: Account) => account.group === 'mcp' && account.auth === 'oauth';

const secretNames = { 'api-key': 'API key', token: 'token' } as const;
const rejectedNames = { 'api-key': 'API key rejected', token: 'Token rejected' } as const;
const keptNames = { 'api-key': 'Key kept in the vault', token: 'Token kept in the vault' } as const;

const kept = (account: Account) =>
  account.auth === 'api-key' ? keptNames[account.secret ?? 'api-key'] : 'Kept in the vault';

async function gone(vault: VaultPort, name: string, kind: RecordKind): Promise<void> {
  try {
    await vault.remove?.(name, kind);
  } catch (error) {
    if (!isVaultFailure(error) || error.code !== 'ENOENT') throw error;
  }
}

export class SliccSettings extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    pending: { state: true },
    entering: { state: true },
    failure: { state: true },
    problem: { state: true },
    blocked: { state: true },
  };
  declare pending: ReadonlySet<string>;
  declare entering: string | null;
  declare failure: { id: string; message: string } | null;
  declare problem: { id: string; field: string; message: string } | null;
  declare blocked: boolean;
  #scroll = new ViewScroll(this, 'settings:scroll', { scroller: () => this, rows: '[data-id]' });

  constructor() {
    super();
    this.pending = new Set();
    this.entering = null;
    this.failure = null;
    this.problem = null;
    this.blocked = false;
  }

  static styles = [
    fieldStyles,
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
      .key.stacked {
        display: grid;
        gap: var(--swc-spacing-200);
        max-width: 420px;
      }
      .buttons,
      .locked {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .hint {
        margin: 0;
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .switched {
        grid-column: 2;
      }
      .failure,
      .problem {
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
        .switched {
          grid-column: 1;
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
    const settle = () => {
      settleModels(model);
      update();
    };
    queueMicrotask(() => settleModels(model));
    return [
      ...super.subscribe(model),
      model.settings.on('settings', settle),
      model.settings.on('accounts', settle),
      ...(model.vault ? [model.vault.on('status', update)] : []),
    ];
  }

  focus(): void {
    this.focusOn('sp-picker');
  }

  reveal(section: string): void {
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const row = root.querySelector<HTMLElement>(`.account[data-id="${CSS.escape(section)}"]`);
      const target = row ?? root.querySelector<HTMLElement>('h2[data-section=accounts]');
      row?.querySelector<HTMLElement>('swc-button')?.focus();
      target?.scrollIntoView({ block: 'start' });
    });
  }

  #update(patch: Partial<Settings>): void {
    this.model?.settings.update(patch);
  }

  #pickModel(event: Event): void {
    forgetSwitch(this.model as SliccModel);
    this.#update({ model: this.#value(event) });
  }

  #switched(current: string): TemplateResult | typeof nothing {
    const note = modelSwitch(this.model as SliccModel);
    if (note?.to.id !== current) return nothing;
    return html`<p class="hint switched" role="status" data-switched>Switched to ${note.to.label} because the previous model's provider isn't set up.</p>`;
  }

  #value(event: Event): string {
    return (event.target as HTMLElement & { value: string }).value;
  }

  #checked(event: Event): boolean {
    return (event.target as HTMLElement & { checked: boolean }).checked;
  }

  #cancelled = new Set<string>();

  #busy(id: string, on: boolean): void {
    const rest = [...this.pending].filter((candidate) => candidate !== id);
    this.pending = new Set(on ? [...rest, id] : rest);
  }

  async connect(id: string, secret?: string, fields?: Record<string, string>): Promise<void> {
    this.#busy(id, true);
    this.failure = null;
    this.#cancelled.delete(id);
    const settings = this.model?.settings;
    try {
      await (fields
        ? settings?.connect(id, secret, fields)
        : secret === undefined
          ? settings?.connect(id)
          : settings?.connect(id, secret));
      if (this.entering === id) this.entering = null;
    } catch (error) {
      if (!this.#cancelled.has(id)) this.failure = { id, message: (error as Error).message };
    } finally {
      this.#cancelled.delete(id);
      this.#busy(id, false);
    }
  }

  #vault(account: Account): VaultPort | null {
    const vault = this.model?.vault;
    return account.auth === 'api-key' && account.store === 'vault' && vault?.put ? vault : null;
  }

  async keep(account: Account, value: string, fields?: Record<string, string>): Promise<void> {
    const model = this.model;
    const vault = this.#vault(account) as VaultPort;
    const { id } = account;
    const problem = valueProblem(value);
    if (problem) {
      this.#refuse(id, 'value', problem);
      return;
    }
    if (vault.status()?.locked) return;
    const options =
      account.group === 'mcp'
        ? { kind: 'mcp' as const, server: serverOf(account) }
        : { kind: 'model' as const, provider: account.id };
    this.#busy(id, true);
    this.failure = null;
    try {
      await vault.put?.(recordName(account), value, undefined, options);
    } catch (error) {
      this.#busy(id, false);
      if (this.model === model) this.#refuse(id, 'value', failureText(error));
      return;
    }
    if (this.model !== model || this.entering !== id) {
      this.#busy(id, false);
      return;
    }
    await this.connect(id, undefined, fields);
  }

  #refuse(id: string, field: string, message: string): void {
    this.problem = { id, field, message };
    void this.updateComplete.then(() =>
      this.renderRoot
        .querySelector<HTMLElement>(
          field === 'value'
            ? '.key input[data-field=value]'
            : `.key [data-account-field="${field}"]`
        )
        ?.focus()
    );
  }

  #fields(form: HTMLElement, account: Account): Record<string, string> | null | undefined {
    if (!account.fields?.length) return undefined;
    const values: Record<string, string> = {};
    for (const field of account.fields) {
      const input = form.querySelector(`[data-account-field="${field.name}"]`) as
        | HTMLInputElement
        | HTMLSelectElement;
      const value = input.value.trim();
      if (value) values[field.name] = value;
      else if (field.required) {
        this.#refuse(account.id, field.name, `${field.label} can’t be empty`);
        return null;
      }
    }
    return values;
  }

  #start(account: Account): void {
    if (account.auth !== 'api-key') {
      void this.connect(account.id);
      return;
    }
    this.failure = null;
    this.problem = null;
    this.entering = account.id;
    void this.updateComplete.then(() => this.focusOn('.key sp-textfield', '.key input'));
  }

  #submit(event: Event, account: Account): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLElement;
    this.problem = null;
    if (this.#vault(account)) {
      const value = take(form.querySelector('input[data-field=value]') as HTMLInputElement);
      const fields = this.#fields(form, account);
      if (fields !== null && !this.pending.has(account.id)) void this.keep(account, value, fields);
      return;
    }
    const field = form.querySelector('sp-textfield') as HTMLElement & {
      value: string;
    };
    const secret = field.value.trim();
    field.value = '';
    const fields = this.#fields(form, account);
    if (secret && fields !== null) void this.connect(account.id, secret, fields);
  }

  #submitOnEnter(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || target.localName !== 'input') return;
    event.preventDefault();
    this.#send(event);
  }

  #send(event: Event): void {
    (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
  }

  #enter(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#send(event);
  }

  #cancel(): void {
    clearValues(this.renderRoot);
    this.entering = null;
    this.failure = null;
    this.problem = null;
  }

  #problem(account: Account, field: string): TemplateResult | typeof nothing {
    const problem = this.problem;
    if (problem?.id !== account.id || problem.field !== field) return nothing;
    return html`<div class="problem" id="key-problem" role="alert">
      <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
      <span>${problem.message}</span>
    </div>`;
  }

  #described(account: Account, field: string): string | typeof nothing {
    return this.problem?.id === account.id && this.problem.field === field
      ? 'key-problem'
      : nothing;
  }

  #invalid(account: Account, field: string): string | typeof nothing {
    return this.#described(account, field) === nothing ? nothing : 'true';
  }

  #extra(account: Account): TemplateResult[] {
    return (account.fields ?? []).map(
      (field) => html`<label class="field">
          <span>${field.label}</span>${this.#control(account, field)}
        </label>
        ${this.#problem(account, field.name)}`
    );
  }

  #control(account: Account, field: AccountField): TemplateResult {
    if (field.options) {
      const chosen = field.value ?? field.options[0]?.value;
      return html`<select
          data-account-field=${field.name}
          ?disabled=${!field.options.length}
          aria-required=${field.required ? 'true' : nothing}
          aria-invalid=${this.#invalid(account, field.name)}
          aria-describedby=${this.#described(account, field.name)}
        >
          ${field.options.map((option) => html`<option value=${option.value} ?selected=${option.value === chosen}>${option.label}</option>`)}
        </select>`;
    }
    return html`<input
          type="text"
          autocomplete="off"
          spellcheck="false"
          data-account-field=${field.name}
          aria-required=${field.required ? 'true' : nothing}
          aria-invalid=${this.#invalid(account, field.name)}
          aria-describedby=${this.#described(account, field.name)}
        />`;
  }

  #unlock(vault: VaultPort): TemplateResult {
    return html`<div class="locked" data-locked>
      <span>Unlock the vault first</span>
      <slicc-vault-button
        data-action="unlock"
        .vault=${vault}
        .config=${{ intent: { kind: 'unlock' }, label: 'Unlock', size: 'm', variant: 'accent', theme: this.color }}
        @vault-popup=${(event: CustomEvent<PopupDetail>) => {
          this.blocked = event.detail.state === 'blocked';
        }}
      ></slicc-vault-button>
    </div>
    ${this.blocked ? html`<div class="problem" role="alert" data-popup="blocked"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>The browser blocked the vault window. Allow pop-ups for this site, then try again.</span></div>` : nothing}`;
  }

  #kept(account: Account, vault: VaultPort): TemplateResult {
    const busy = this.pending.has(account.id);
    const locked = !!vault.status()?.locked;
    const name = secretNames[account.secret ?? 'api-key'];
    return html`<form class="key stacked" data-id=${account.id} data-store="vault" @submit=${(event: Event) => this.#submit(event, account)} @keydown=${(event: KeyboardEvent) => this.#submitOnEnter(event)}>
        <label class="field"><span>${account.provider} ${name}</span><input
          type="password"
          autocomplete="off"
          spellcheck="false"
          data-field="value"
          placeholder=${`Paste the ${name}`}
          aria-invalid=${this.#invalid(account, 'value')}
          aria-describedby=${this.#described(account, 'value')}
        /></label>
        ${this.#problem(account, 'value')}
        ${this.#extra(account)}
        ${locked ? this.#unlock(vault) : html`<p class="hint">Saved in the vault</p>`}
        <div class="buttons">
          <swc-button size="m" variant="accent" data-action="save" ?pending=${busy} ?disabled=${locked} @click=${(event: Event) => this.#send(event)}>Save</swc-button>
          <swc-button size="m" variant="secondary" data-action="cancel" @click=${() => this.#cancel()}>Cancel</swc-button>
        </div>
      </form>`;
  }

  #key(account: Account): TemplateResult | typeof nothing {
    if (this.entering !== account.id) return nothing;
    const vault = this.#vault(account);
    if (vault) return this.#kept(account, vault);
    const busy = this.pending.has(account.id);
    const extra = account.fields?.length;
    return html`<form class=${extra ? 'key stacked' : 'key'} data-id=${account.id} @submit=${(event: Event) => this.#submit(event, account)} @keydown=${(event: KeyboardEvent) => this.#submitOnEnter(event)}>
        <sp-textfield
          size="m"
          type="password"
          autocomplete="off"
          label=${`${account.provider} ${secretNames[account.secret ?? 'api-key']}`}
          placeholder=${`Paste the ${secretNames[account.secret ?? 'api-key']}`}
          @keydown=${(event: KeyboardEvent) => this.#enter(event)}
        ></sp-textfield>
        ${extra ? this.#extra(account) : nothing}
        ${extra ? html`<div class="buttons">${this.#buttons(busy)}</div>` : this.#buttons(busy)}
      </form>`;
  }

  #buttons(busy: boolean): TemplateResult {
    return html`<swc-button size="m" variant="accent" data-action="save" ?pending=${busy} @click=${(event: Event) => this.#send(event)}>Save</swc-button>
        <swc-button size="m" variant="secondary" data-action="cancel" @click=${() => this.#cancel()}>Cancel</swc-button>`;
  }

  #inVault(account: Account): boolean {
    const vault = this.model?.vault;
    if (account.store !== 'vault' || account.status !== 'connected' || !vault) return false;
    return account.auth !== 'api-key' || !!vault.put;
  }

  #records(account: Account, vault: VaultPort): Array<[string, RecordKind]> {
    if (account.auth === 'api-key') return [[recordName(account), recordKind(account)]];
    const server = serverOf(account);
    const names = (vault.list()?.secrets ?? [])
      .filter(
        (secret) => secret.kind === 'mcp' && secret.server === server && secret.state !== 'removed'
      )
      .map((secret) => secret.name);
    const tokens = names.length ? names : [`${upperName(server)}_ACCESS_TOKEN`];
    return tokens.map((name): [string, RecordKind] => [name, 'mcp']);
  }

  async #disconnect(account: Account): Promise<void> {
    const model = this.model;
    const vault = model?.vault;
    const vaulted = account.store === 'vault' && !!vault?.remove;
    const key = vaulted && account.auth === 'api-key';
    const signIn = vaulted && account.auth !== 'api-key' && account.group === 'mcp';
    const stored = key || signIn ? vault : undefined;
    const body = `Agents can’t use ${account.provider} until you connect it again.${key ? ' You can restore its key from Removed in Secrets for 30 days.' : ''}`;
    const title = `Disconnect ${account.provider}?`;
    if (!(await confirm({ title, body, action: 'Disconnect', variant: 'confirmation' }))) return;
    clearValues(this.renderRoot);
    if (this.model !== model) return;
    if (stored && !(await this.#forget(account, stored))) return;
    if (this.model === model) model?.settings.disconnect(account.id);
  }

  async #forget(account: Account, vault: VaultPort): Promise<boolean> {
    this.#busy(account.id, true);
    this.failure = null;
    try {
      for (const [name, kind] of this.#records(account, vault)) await gone(vault, name, kind);
      return true;
    } catch (error) {
      if (this.model?.vault === vault)
        this.failure = { id: account.id, message: failureText(error) };
      return false;
    } finally {
      this.#busy(account.id, false);
    }
  }

  #stopSigningIn(account: Account): void {
    this.#cancelled.add(account.id);
    this.model?.settings.cancel?.(account.id);
  }

  get busyReason(): string | null {
    const accounts = this.model?.settings.accounts() ?? [];
    if (accounts.some((account) => this.#signingIn(account))) return 'signing in';
    return this.entering === null ? null : 'a key is being entered';
  }

  #signingIn(account: Account): boolean {
    return (
      account.status === 'signing-in' ||
      (account.auth !== 'api-key' && account.status !== 'connected' && this.pending.has(account.id))
    );
  }

  #action(account: Account): TemplateResult {
    if (this.#signingIn(account) && this.model?.settings.cancel) {
      return html`<swc-button
        size="m"
        variant="secondary"
        data-action="cancel-sign-in"
        accessible-label=${`Cancel signing in to ${account.provider}`}
        @click=${() => this.#stopSigningIn(account)}
      >Cancel</swc-button>`;
    }
    if (account.status === 'connected') {
      return html`<swc-button
        size="m"
        variant="secondary"
        data-action="disconnect"
        accessible-label=${`Disconnect ${account.provider}`}
        ?pending=${this.pending.has(account.id)}
        @click=${() => this.#disconnect(account)}
      >Disconnect</swc-button>`;
    }
    const label = popup(account)
      ? 'Sign in'
      : account.status === 'expired'
        ? 'Reconnect'
        : 'Connect';
    const entering = this.entering === account.id;
    const busy = this.#signingIn(account) || (!entering && this.pending.has(account.id));
    return html`<swc-button
      size="m"
      variant="secondary"
      data-action="connect"
      accessible-label=${popup(account) ? `Sign in to ${account.provider}` : `${label} ${account.provider}`}
      ?pending=${busy}
      ?disabled=${entering}
      @click=${() => this.#start(account)}
    >${label}</swc-button>`;
  }

  #status(account: Account): keyof typeof accountStatus {
    if (this.#signingIn(account)) return 'signing-in';
    if (account.status === 'expired' && account.auth === 'api-key') return 'rejected';
    if (popup(account) && account.status === 'disconnected') return 'needs-sign-in';
    if (popup(account) && account.status === 'expired') return 'sign-in-expired';
    return account.status;
  }

  #account(account: Account): TemplateResult {
    const status = this.#status(account);
    const [variant, generic] = accountStatus[status];
    const label = status === 'rejected' ? rejectedNames[account.secret ?? 'api-key'] : generic;
    const failure =
      this.failure?.id === account.id
        ? html`<div class="failure" role="alert">
            <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
            <span>${this.failure.message}</span>
          </div>`
        : nothing;
    return html`<div class="account" data-id=${account.id}>
      <span class="provider">${account.provider}</span>
      <span class="identity">${account.identity}${
        this.#inVault(account)
          ? html`<span class="kept" data-store="vault">${account.identity ? ' · ' : ''}${kept(account)}</span>`
          : nothing
      }</span>
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
    const accounts = settings.accounts();
    const providers = accounts.filter((account) => account.group !== 'mcp');
    const servers = accounts.filter((account) => account.group === 'mcp');
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
        <sp-picker size="m" label="Model" aria-labelledby="model" value=${value.model} @change=${(e: Event) => this.#pickModel(e)}>
          ${chatModels(settings.models()).map((option) => html`<sp-menu-item value=${option.id}>${option.label}<span slot="description">${option.provider}</span></sp-menu-item>`)}
        </sp-picker>
        ${this.#switched(value.model)}
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
          ${speech() ? html`<sp-switch ?checked=${value.pushToTalk ?? false} data-setting="pushToTalk" @change=${(e: Event) => this.#update({ pushToTalk: this.#checked(e) })}>Push to talk: hold Alt+M to dictate</sp-switch>` : nothing}
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
      <h2 data-section="accounts">Accounts</h2>
      <div class="accounts">${providers.map((account) => this.#account(account))}</div>
      ${
        servers.length
          ? html`<h2>MCP servers</h2>
              <div class="accounts" data-group="mcp">${servers.map((account) => this.#account(account))}</div>`
          : nothing
      }
      ${this.model?.vault ? html`<slicc-secrets .model=${this.model}></slicc-secrets>` : nothing}
    </div>`;
  }
}
