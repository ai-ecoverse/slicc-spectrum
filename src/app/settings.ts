import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-add.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-checkmark.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import link from '@adobe/spectrum-wc/link.css';
import '@spectrum-web-components/field-label/sp-field-label.js';
import { css, html, type LitElement, nothing, type TemplateResult, unsafeCSS } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import type {
  Account,
  AccountField,
  AccountFieldOption,
  AccountStatus,
  ConnectOptions,
  ProviderAuth,
  ProviderOption,
  RecordKind,
  SecretView,
  Settings,
  SliccModel,
  UpdatesPort,
  VaultEndpointChange,
  VaultPort,
} from '../model/types.ts';
import { isVaultFailure, valueProblem } from '../model/values.ts';
import { chatModels, speech, ThemedElement } from './base.ts';
import { confirm, dialogFrame } from './confirm.ts';
import { forgetSwitch, modelSwitch, settleModels } from './models.ts';
import { recordKind, recordName, serverOf, upper as upperName } from './records.ts';
import { search, searchCss } from './search.ts';
import { SignInCopies, SignInWaits, signInCss, signInDetails, signInText } from './sign-in.ts';
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
  unreachable: ['notice', 'Unreachable'],
} as const;

const authHints: Record<ProviderAuth, string> = {
  'api-key': 'API key',
  oauth: 'Sign in',
  fields: 'Endpoint and key',
  local: 'On this device',
};

const listOrder: Record<AccountStatus, number> = {
  connected: 0,
  expired: 1,
  'signing-in': 2,
  disconnected: 3,
};

const corsNotice = {
  short: 'Needs the SLICC extension or CLI',
  long: 'Needs the SLICC extension or CLI, because the browser blocks direct requests to it.',
};

const removeBodies: Partial<Record<string, string>> = {
  oauth: 'Its sign-in is deleted from the vault. Models from it stop working.',
  local: 'Models from it stop working.',
};

function draft(option: ProviderOption): Account {
  return {
    id: option.id,
    provider: option.name,
    identity: '',
    status: 'disconnected',
    group: 'providers',
    store: 'vault',
    auth: option.auth === 'fields' ? 'api-key' : option.auth,
    fields: option.fields,
    keyUrl: option.keyUrl,
    needs: option.needs,
    blocked: option.blocked,
    vaultName: option.vaultName,
  };
}

export function matchProviders(
  options: readonly ProviderOption[],
  query: string
): ProviderOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = `${option.name} ${option.id} ${option.description ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

interface BaseChange {
  field: string;
  url: string | undefined;
  old: string | undefined;
}

export const mcpRegistrations = 'slicc-spectrum.mcp-endpoints';

function registrations(): Record<string, string> {
  try {
    return JSON.parse(globalThis.localStorage.getItem(mcpRegistrations) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function register(server: string, url: string | undefined): void {
  const all = registrations();
  if (url) all[server] = url;
  else delete all[server];
  try {
    globalThis.localStorage.setItem(mcpRegistrations, JSON.stringify(all));
  } catch {}
}

function words(message: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[^a-z0-9 ]/gi, '\\$&')}\\b`, 'i').test(message);
}

const popup = (account: Account) => account.group === 'mcp' && account.auth === 'oauth';

const dual = (account: Account) => account.auth === 'oauth' && account.secret === 'api-key';

const signInMethod = (account: Account): ConnectOptions | undefined =>
  dual(account) ? { method: 'sign-in' } : undefined;

const start = (options: readonly AccountFieldOption[], value?: string) =>
  options.some((option) => option.value === value) ? value : (options[0]?.value ?? '');

const nothingToChoose = 'Nothing to choose from yet. You can connect without it.';

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
    picking: { state: true },
    adding: { state: true },
    query: { state: true },
    filled: { state: true },
    developing: { state: true },
    developerError: { state: true },
  };
  declare pending: ReadonlySet<string>;
  declare entering: string | null;
  declare failure: { id: string; message: string } | null;
  declare problem: { id: string; field: string; message: string } | null;
  declare blocked: boolean;
  declare picking: boolean;
  declare adding: ProviderOption | null;
  declare query: string;
  declare filled: ReadonlySet<string>;
  declare developing: boolean;
  declare developerError: string | null;
  #waits = new SignInWaits(() => this.requestUpdate());
  #copies = new SignInCopies(() => this.requestUpdate());
  #landing: string | null = null;
  #away = false;
  #bases = new Map<string, string>();
  #wanted: boolean | null = null;
  #developerPort: UpdatesPort | undefined;
  #call = 0;
  #scroll = new ViewScroll(this, 'settings:scroll', { scroller: () => this, rows: '[data-id]' });

  constructor() {
    super();
    this.pending = new Set();
    this.entering = null;
    this.failure = null;
    this.problem = null;
    this.blocked = false;
    this.picking = false;
    this.adding = null;
    this.query = '';
    this.filled = new Set();
    this.developing = false;
    this.developerError = null;
  }

  static styles = [
    fieldStyles,
    dialogFrame,
    searchCss,
    unsafeCSS(link),
    signInCss,
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
      .key.stacked sp-textfield,
      .field sp-picker {
        width: 100%;
      }
      .field sp-field-label {
        margin: 0;
        padding-block: 0;
      }
      .sr {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
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
      .sign-in .enter {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .sign-in .enter,
      .sign-in .swc-Link {
        font-size: var(--swc-font-size-75);
      }
      .switched {
        grid-column: 2;
      }
      .developer {
        display: grid;
        gap: var(--swc-spacing-75);
        padding-block: var(--swc-spacing-75);
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .developer .hint,
      .developer .failure {
        margin: 0;
        line-height: var(--swc-line-height-200);
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
      .actions {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      .notes {
        grid-column: 1 / -1;
        display: grid;
        gap: var(--swc-spacing-75);
        margin-block-start: calc(-1 * var(--swc-spacing-200));
      }
      .notice {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin: 0;
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
        --swc-icon-color: var(--swc-notice-visual-color);
      }
      .notice swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .other-way {
        justify-self: start;
        margin-inline-start: calc(-1 * var(--swc-spacing-100));
      }
      .add {
        margin-block-start: var(--swc-spacing-200);
        margin-inline-start: calc(-1 * var(--swc-spacing-100));
      }
      dialog.picker {
        inline-size: min(520px, calc(100vw - 2 * var(--swc-spacing-300)));
      }
      .picker .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-400) var(--swc-spacing-300) var(--swc-spacing-200) var(--swc-spacing-500);
      }
      .picker h2 {
        margin: 0;
        font-size: var(--swc-heading-size-s);
        overflow-wrap: anywhere;
      }
      .picker .find {
        display: flex;
        padding: var(--swc-spacing-100) var(--swc-spacing-500) var(--swc-spacing-200);
      }
      .picker .results {
        block-size: min(400px, calc(100dvh - 280px));
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: var(--swc-spacing-75) var(--swc-spacing-400);
        border-block: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      .options {
        display: grid;
        gap: var(--swc-spacing-50);
      }
      .option {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
        align-items: baseline;
        gap: var(--swc-spacing-50) var(--swc-spacing-300);
        padding: var(--swc-spacing-100) var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-medium-default);
        cursor: pointer;
      }
      .option:hover,
      .option:focus {
        background: var(--swc-gray-200);
      }
      .option:focus {
        outline: none;
      }
      .option:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .option[aria-disabled='true'] {
        cursor: default;
      }
      .option[aria-disabled='true']:hover {
        background: none;
      }
      .option .name {
        font-weight: var(--swc-bold-font-weight);
        overflow-wrap: anywhere;
      }
      .option[aria-disabled='true'] .name {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .option[data-blocked] .name,
      .option[data-blocked] .description {
        color: var(--swc-disabled-content-color);
      }
      .option .tag {
        justify-self: end;
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .added {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-50);
      }
      .option .description,
      .option .notice {
        grid-column: 1 / -1;
      }
      .option .description,
      .lead,
      .empty {
        margin: 0;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .empty {
        padding: var(--swc-spacing-200) var(--swc-spacing-100);
        overflow-wrap: anywhere;
      }
      .picker .end {
        justify-content: flex-end;
        padding: var(--swc-spacing-300) var(--swc-spacing-500) var(--swc-spacing-400);
      }
      .step {
        display: grid;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-100) var(--swc-spacing-500) var(--swc-spacing-500);
      }
      .step .key.stacked {
        max-width: none;
      }
      .step sp-textfield {
        inline-size: 100%;
      }
      .step .buttons {
        margin-block-start: var(--swc-spacing-200);
      }
      .get-key {
        justify-self: start;
        font-size: var(--swc-font-size-75);
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
        .account swc-button,
        .account .actions {
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
    if (model.updates !== this.#developerPort) {
      this.#developerPort = model.updates;
      this.#call += 1;
      this.developing = false;
      this.developerError = null;
      this.#wanted = null;
    }
    const developer = typeof model.updates?.setDeveloper === 'function';
    return [
      ...super.subscribe(model),
      ...(developer && model.updates ? [model.updates.on('items', update)] : []),
      model.settings.on('settings', settle),
      model.settings.on('accounts', settle),
      model.settings.on('providers', update),
      ...(model.vault ? [model.vault.on('status', update), model.vault.on('list', update)] : []),
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

  async #developer(event: Event): Promise<void> {
    const port = this.model?.updates;
    const on = this.#checked(event);
    const call = ++this.#call;
    this.#wanted = on;
    this.developing = true;
    this.developerError = null;
    try {
      await port?.setDeveloper?.(on);
    } catch (error) {
      if (call === this.#call) {
        this.developerError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (call === this.#call) {
        this.#wanted = null;
        this.developing = false;
      }
    }
  }

  #developerRow(): TemplateResult | typeof nothing {
    const port = this.model?.updates;
    if (typeof port?.setDeveloper !== 'function') return nothing;
    const on = port.developer?.() ?? false;
    return html`<div class="row">
      <span class="label">Updates</span>
      <div class="developer">
        <div class="toggle">
          <sp-switch .checked=${live(this.#wanted ?? on)} ?disabled=${this.developing} aria-busy=${this.developing ? 'true' : nothing} data-setting="developer" @change=${(event: Event) => void this.#developer(event)}>Developer mode</sp-switch>
          ${this.developing ? html`<swc-progress-circle size="s" indeterminate label="Saving developer mode" data-pending></swc-progress-circle>` : nothing}
        </div>
        <p class="hint">Check npm for newer releases that aren't certified yet, and offer them as betas in Install / Update.</p>
        ${this.developerError ? html`<p class="failure" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.developerError}</span></p>` : nothing}
      </div>
    </div>`;
  }

  #cancelled = new Set<string>();

  #busy(id: string, on: boolean): void {
    const rest = [...this.pending].filter((candidate) => candidate !== id);
    this.pending = new Set(on ? [...rest, id] : rest);
  }

  async connect(
    id: string,
    secret?: string,
    fields?: Record<string, string>,
    options?: ConnectOptions
  ): Promise<void> {
    this.#busy(id, true);
    this.failure = null;
    this.#cancelled.delete(id);
    const settings = this.model?.settings;
    try {
      await (options
        ? settings?.connect(id, secret, fields, options)
        : fields
          ? settings?.connect(id, secret, fields)
          : secret === undefined
            ? settings?.connect(id)
            : settings?.connect(id, secret));
      if (this.entering === id) this.entering = null;
      if (this.adding?.id === id && this.#added(id)?.status === 'connected') this.#finish(id);
    } catch (error) {
      if (!this.#cancelled.has(id)) this.failure = { id, message: (error as Error).message };
    } finally {
      this.#cancelled.delete(id);
      this.#busy(id, false);
    }
  }

  #vault(account: Account): VaultPort | null {
    const vault = this.model?.vault;
    const keyed = account.auth === 'api-key' || dual(account);
    return keyed && account.store === 'vault' && vault?.put ? vault : null;
  }

  async keep(account: Account, value: string, fields?: Record<string, string>): Promise<void> {
    const model = this.model;
    const vault = this.#vault(account) as VaultPort;
    const { id } = account;
    const keyed = value !== '' || !this.#keyOptional(account);
    const problem = keyed ? valueProblem(value) : null;
    if (problem) {
      this.#refuse(id, 'value', problem);
      return;
    }
    if (vault.status()?.locked) return;
    const settings = this.#settingsOf(account, fields);
    const options =
      account.group === 'mcp'
        ? { kind: 'mcp' as const, server: serverOf(account) }
        : { kind: 'model' as const, provider: account.id, ...(settings ? { settings } : {}) };
    this.#busy(id, true);
    this.failure = null;
    const url = this.#mcpUrl(account);
    const before = keyed ? undefined : this.#record(account)?.settings;
    try {
      if (keyed) await vault.put?.(recordName(account), value, undefined, options);
      else if (settings) await vault.settings?.(recordName(account), 'model', settings);
      if (url) {
        const server = serverOf(account);
        const old = registrations()[server];
        await vault.endpoints?.({
          ...(old && old !== url ? { remove: { mcp: [{ server, url: old }] } } : {}),
          add: { mcp: [{ server, url }] },
        });
        register(server, url);
      }
    } catch (error) {
      this.#busy(id, false);
      if (this.model === model) this.#refused(account, failureText(error), keyed);
      return;
    }
    if (this.model !== model || this.entering !== id) {
      this.#busy(id, false);
      return;
    }
    await this.#connectBases(account, undefined, fields, vault);
    const failed = [this.failure, this.problem].some((issue) => issue?.id === id);
    if (failed && settings && !keyed)
      await vault.settings?.(recordName(account), 'model', before ?? {}).catch(() => {});
  }

  #settingsOf(
    account: Account,
    fields: Record<string, string> | undefined
  ): Record<string, string> | undefined {
    const settable = (account.fields ?? []).filter((field) => field.vaultSetting);
    if (account.group === 'mcp' || !settable.length) return undefined;
    return Object.fromEntries(
      settable.flatMap((field) => {
        const value = fields?.[field.name];
        if (!value || (field.customBase && this.#baseOf(value))) return [];
        return [[field.vaultSetting as string, value]];
      })
    );
  }

  #record(account: Account): SecretView | undefined {
    const name = recordName(account);
    return this.model?.vault
      ?.list()
      ?.secrets.find(
        (secret) => secret.name === name && secret.kind === 'model' && secret.state !== 'removed'
      );
  }

  #keyOptional(account: Account): boolean {
    const vault = this.#vault(account);
    const fields = account.fields ?? [];
    if (!vault || !fields.some((field) => field.vaultSetting || field.customBase)) return false;
    if (fields.some((field) => field.vaultSetting) && !vault.settings) return false;
    return !!this.#record(account);
  }

  #refused(account: Account, message: string, keyed: boolean): void {
    const field = (account.fields ?? []).find((candidate) =>
      [candidate.vaultSetting, candidate.name, candidate.label].some(
        (word) => word && words(message, word)
      )
    );
    if (field) this.#refuse(account.id, field.name, message);
    else if (keyed) this.#refuse(account.id, 'value', message);
    else this.failure = { id: account.id, message };
  }

  #baseOf(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? '';
    try {
      return new URL(trimmed).protocol === 'https:' ? trimmed : undefined;
    } catch {
      return undefined;
    }
  }

  #oldBase(account: Account, field: AccountField): string | undefined {
    return this.#baseOf(field.value) ?? this.#bases.get(`${account.id} ${field.name}`);
  }

  #baseChanges(account: Account, fields: Record<string, string> | undefined): BaseChange[] {
    return (account.fields ?? [])
      .filter((field) => field.customBase)
      .map((field) => ({
        field: field.name,
        url: this.#baseOf(fields?.[field.name]),
        old: this.#oldBase(account, field),
      }))
      .filter((change) => change.url !== change.old);
  }

  #modelChange(
    name: string,
    changes: BaseChange[],
    from: 'url' | 'old',
    to: 'url' | 'old'
  ): VaultEndpointChange | null {
    const entries = (key: 'url' | 'old') =>
      changes.flatMap((change) => (change[key] ? [{ name, url: change[key] as string }] : []));
    const remove = entries(from);
    const add = entries(to);
    if (!remove.length && !add.length) return null;
    return {
      ...(remove.length ? { remove: { model: remove } } : {}),
      ...(add.length ? { add: { model: add } } : {}),
    };
  }

  async #connectBases(
    account: Account,
    secret: string | undefined,
    fields: Record<string, string> | undefined,
    vault: VaultPort | null = null
  ): Promise<void> {
    const model = this.model as SliccModel;
    const live = vault?.endpoints ? vault : null;
    const { id } = account;
    const name = recordName(account);
    const changes = this.#baseChanges(account, fields);
    const forward = live ? this.#modelChange(name, changes, 'old', 'url') : null;
    if (forward) {
      this.#busy(id, true);
      try {
        await live?.endpoints?.(forward);
      } catch (error) {
        this.#busy(id, false);
        const field = changes.find((change) => change.url) ?? changes[0];
        if (this.model === model) this.#refuse(id, field.field, failureText(error));
        return;
      }
      if (this.model !== model) {
        this.#busy(id, false);
        return;
      }
    }
    await this.connect(id, secret, fields, dual(account) ? { method: 'key' } : undefined);
    if (this.failure?.id === id) {
      this.#placeFailure(account, fields);
      const back = forward ? this.#modelChange(name, changes, 'url', 'old') : null;
      if (back) await live?.endpoints?.(back).catch(() => {});
      return;
    }
    for (const change of changes) {
      const key = `${id} ${change.field}`;
      if (change.url) this.#bases.set(key, change.url);
      else this.#bases.delete(key);
    }
  }

  #placeFailure(account: Account, fields: Record<string, string> | undefined): void {
    const message = (this.failure as { message: string }).message;
    const field = (account.fields ?? []).find(
      (candidate) =>
        candidate.customBase &&
        !!fields?.[candidate.name] &&
        [candidate.name, candidate.label, 'https', 'url', 'port', 'userinfo'].some((word) =>
          words(message, word)
        )
    );
    if (!field) return;
    this.failure = null;
    this.#refuse(account.id, field.name, message);
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
      const input = form.querySelector(`[data-account-field="${field.name}"]`) as HTMLElement & {
        value: string;
      };
      const value = input.value.trim();
      if (value) values[field.name] = value;
      else if (field.required && field.options?.length !== 0) {
        this.#refuse(
          account.id,
          field.name,
          field.options ? `Select a ${field.label.toLowerCase()}.` : `${field.label} can’t be empty`
        );
        return null;
      }
    }
    return values;
  }

  #added(id: string): Account | undefined {
    return this.model?.settings.accounts().find((account) => account.id === id);
  }

  #offered(): readonly ProviderOption[] | null {
    return this.model?.settings.providers?.() ?? null;
  }

  #start(account: Account): void {
    if (account.auth !== 'api-key') {
      void this.connect(account.id, undefined, undefined, signInMethod(account));
      return;
    }
    this.#enter(account);
  }

  #useSignIn(account: Account): void {
    this.#cancel();
    void this.updateComplete.then(() =>
      this.renderRoot
        .querySelector<HTMLElement>(
          `.account[data-id="${CSS.escape(account.id)}"] [data-action=connect]`
        )
        ?.focus()
    );
  }

  #otherWay(account: Account): TemplateResult | typeof nothing {
    if (!dual(account) || account.status === 'connected' || this.#signingIn(account))
      return nothing;
    const entering = this.entering === account.id;
    return html`<swc-action-button
      class="other-way"
      size="m"
      quiet
      data-action=${entering ? 'use-sign-in' : 'use-key'}
      @click=${() => (entering ? this.#useSignIn(account) : this.#enter(account))}
    >${entering ? 'Sign in instead' : 'Use an API key instead'}</swc-action-button>`;
  }

  #enter(account: Account): void {
    this.failure = null;
    this.problem = null;
    this.filled = new Set(
      (account.fields ?? [])
        .filter((field) => field.options || field.value?.trim())
        .map((field) => field.name)
    );
    this.entering = account.id;
    void this.updateComplete.then(() => this.focusOn('.key sp-textfield', '.key input'));
  }

  #submit(event: Event, account: Account): void {
    event.preventDefault();
    if (account.blocked) return;
    const form = event.currentTarget as HTMLElement;
    this.problem = null;
    this.filled = new Set([...this.filled].filter((name) => name !== 'value'));
    const url = this.#mcpUrl(account);
    if (this.#vault(account) && url) {
      void this.#confirmSubmit(form, account, url);
      return;
    }
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
    if (secret && fields !== null) void this.#connectBases(account, secret, fields);
  }

  async #confirmSubmit(form: HTMLElement, account: Account, url: string): Promise<void> {
    const input = form.querySelector('input[data-field=value]') as HTMLInputElement;
    const problem = valueProblem(input.value);
    if (problem) return this.#refuse(account.id, 'value', problem);
    const fields = this.#fields(form, account);
    if (fields === null || this.pending.has(account.id)) return;
    const model = this.model;
    if (!(await this.#confirmUrl(url))) return;
    if (!input.isConnected || this.model !== model) return;
    await this.keep(account, take(input), fields);
  }

  #confirmUrl(url: string): Promise<boolean> {
    return confirm({
      title: `Connect to ${url}?`,
      body: `SLICC sends this token only to ${url}.`,
      action: 'Connect',
      variant: 'confirmation',
    });
  }

  #mcpUrl(account: Account): string | null {
    if (account.group !== 'mcp' || !this.model?.vault?.endpoints) return null;
    return this.#baseOf(account.url) ?? null;
  }

  #pinned(account: Account): string | undefined {
    const server = serverOf(account);
    return this.model?.vault
      ?.list()
      ?.secrets.find(
        (secret) =>
          secret.kind === 'mcp' &&
          secret.server === server &&
          secret.state !== 'removed' &&
          secret.pinned
      )?.url;
  }

  #moved(account: Account): string | null {
    const url = this.#mcpUrl(account);
    const old = registrations()[serverOf(account)] ?? this.#pinned(account);
    return url && old && old !== url ? url : null;
  }

  async #reconnectMcp(account: Account, url: string): Promise<void> {
    const model = this.model as SliccModel;
    const server = serverOf(account);
    const old = registrations()[server];
    if (!(await this.#confirmUrl(url))) return;
    if (this.model !== model) return;
    this.#busy(account.id, true);
    this.failure = null;
    try {
      await model.vault?.endpoints?.({
        ...(old ? { remove: { mcp: [{ server, url: old }] } } : {}),
        add: { mcp: [{ server, url }] },
      });
      register(server, url);
    } catch (error) {
      if (this.model === model) this.failure = { id: account.id, message: failureText(error) };
      return;
    } finally {
      this.#busy(account.id, false);
    }
    if (this.model === model) await this.connect(account.id);
  }

  #movedNote(account: Account): TemplateResult | typeof nothing {
    const url = this.#moved(account);
    if (!url) return nothing;
    return html`<div class="notes"><p class="notice" data-notice="moved"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>The server moved to ${url}. Reconnect to send the token there.</span></p></div>`;
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

  #enterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#send(event);
  }

  #cancel(): void {
    clearValues(this.renderRoot);
    this.entering = null;
    this.failure = null;
    this.problem = null;
  }

  #problem(account: Account, field: string, icon = true): TemplateResult | typeof nothing {
    const problem = this.problem;
    if (problem?.id !== account.id || problem.field !== field) return nothing;
    return html`<div class="problem" id="key-problem" role="alert">
      ${icon ? html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>` : nothing}
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
    return (account.fields ?? []).map((field) =>
      field.options
        ? html`<div class="field">
              <sp-field-label for=${`field-${field.name}`} size="m">${field.label}</sp-field-label>${this.#control(account, field)}
              ${field.options.length ? nothing : html`<p class="hint" data-empty=${field.name}>${nothingToChoose}</p>`}
              ${field.help ? html`<p class="hint" id=${`help-${field.name}`}>${field.help}</p>` : nothing}
              ${this.#problem(account, field.name, false)}
            </div>`
        : html`<label class="field">
              <span>${field.label}</span>${this.#control(account, field)}
            </label>
            ${field.help ? html`<p class="hint" id=${`help-${field.name}`}>${field.help}</p>` : nothing}
            ${this.#problem(account, field.name)}`
    );
  }

  #describedBy(account: Account, field: AccountField): string | typeof nothing {
    const problem = this.#described(account, field.name);
    const ids = [problem === nothing ? '' : problem, field.help ? `help-${field.name}` : ''];
    return ids.filter(Boolean).join(' ') || nothing;
  }

  #control(account: Account, field: AccountField): TemplateResult {
    if (field.options) {
      const empty = !field.options.length;
      const described = this.problem?.id === account.id && this.problem.field === field.name;
      return html`<sp-picker
          size="m"
          data-account-field=${field.name}
          label=${empty ? 'None available' : field.label}
          id=${`field-${field.name}`}
          value=${start(field.options, field.value)}
          ?disabled=${empty}
          ?invalid=${described}
          aria-required=${field.required ? 'true' : nothing}
        >
          ${field.options.map((option) => html`<sp-menu-item value=${option.value}>${option.label}</sp-menu-item>`)}
          ${
            described || empty || field.help
              ? html`<span slot="description" class="sr">${described ? this.problem?.message : empty ? nothingToChoose : field.help}</span>`
              : nothing
          }
        </sp-picker>`;
    }
    return html`<input
          type="text"
          autocomplete="off"
          spellcheck="false"
          data-account-field=${field.name}
          value=${field.value ?? nothing}
          placeholder=${field.placeholder ?? nothing}
          aria-required=${field.required ? 'true' : nothing}
          aria-invalid=${this.#invalid(account, field.name)}
          aria-describedby=${this.#describedBy(account, field)}
        />`;
  }

  #getKey(account: Account): TemplateResult | typeof nothing {
    if (!account.keyUrl) return nothing;
    return html`<a class="swc-Link get-key" href=${account.keyUrl} target="_blank" rel="noopener noreferrer" data-action="get-key">Get a key</a>`;
  }

  #leave(account: Account): TemplateResult {
    const adding = this.adding?.id === account.id;
    return html`<swc-button size="m" variant="secondary" data-action=${adding ? 'back' : 'cancel'} @click=${() => (adding ? this.#back() : this.#cancel())}>${adding ? 'Back' : 'Cancel'}</swc-button>`;
  }

  #saveLabel(account: Account): string {
    return this.adding?.id === account.id ? 'Connect' : 'Save';
  }

  #ready(account: Account): boolean {
    if (account.blocked) return false;
    if (!this.#offered()) return true;
    const required = (account.fields ?? []).filter((field) => field.required && !field.options);
    const key = this.#keyOptional(account) ? [] : ['value'];
    return [...key, ...required.map((field) => field.name)].every((name) => this.filled.has(name));
  }

  #fill(event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.dataset.accountField ?? 'value';
    const rest = [...this.filled].filter((candidate) => candidate !== name);
    this.filled = new Set(input.value.trim() ? [...rest, name] : rest);
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
    return html`<form class="key stacked" data-id=${account.id} data-store="vault" @submit=${(event: Event) => this.#submit(event, account)} @keydown=${(event: KeyboardEvent) => this.#submitOnEnter(event)} @input=${(event: Event) => this.#fill(event)}>
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
        ${locked ? this.#unlock(vault) : html`<p class="hint">Saved in the vault</p>`}
        ${this.#getKey(account)}
        ${this.#extra(account)}
        <div class="buttons">
          <swc-button size="m" variant="accent" data-action="save" ?pending=${busy} ?disabled=${locked || (!busy && !this.#ready(account))} @click=${(event: Event) => this.#send(event)}>${this.#saveLabel(account)}</swc-button>
          ${this.#leave(account)}
        </div>
      </form>`;
  }

  #key(account: Account): TemplateResult | typeof nothing {
    if (this.entering !== account.id) return nothing;
    const vault = this.#vault(account);
    if (vault) return this.#kept(account, vault);
    const busy = this.pending.has(account.id);
    const extra = account.fields?.length || account.keyUrl;
    return html`<form class=${extra ? 'key stacked' : 'key'} data-id=${account.id} @submit=${(event: Event) => this.#submit(event, account)} @keydown=${(event: KeyboardEvent) => this.#submitOnEnter(event)} @input=${(event: Event) => this.#fill(event)}>
        ${extra ? html`<div class="field"><sp-field-label for="key-secret" size="m">${this.#secretLabel(account)}</sp-field-label>${this.#secret(account)}</div>` : this.#secret(account)}
        ${this.#getKey(account)}
        ${extra ? this.#extra(account) : nothing}
        ${extra ? html`<div class="buttons">${this.#buttons(account, busy)}</div>` : this.#buttons(account, busy)}
      </form>`;
  }

  #secretLabel(account: Account): string {
    return `${account.provider} ${secretNames[account.secret ?? 'api-key']}`;
  }

  #secret(account: Account): TemplateResult {
    return html`<sp-textfield
          size="m"
          type="password"
          autocomplete="off"
          id="key-secret"
          label=${this.#secretLabel(account)}
          placeholder=${`Paste the ${secretNames[account.secret ?? 'api-key']}`}
          @keydown=${(event: KeyboardEvent) => this.#enterKey(event)}
        ></sp-textfield>`;
  }

  #buttons(account: Account, busy: boolean): TemplateResult {
    return html`<swc-button size="m" variant="accent" data-action="save" ?pending=${busy} ?disabled=${!busy && !this.#ready(account)} @click=${(event: Event) => this.#send(event)}>${this.#saveLabel(account)}</swc-button>
        ${this.#leave(account)}`;
  }

  #inVault(account: Account): boolean {
    const vault = this.model?.vault;
    if (account.store !== 'vault' || account.status !== 'connected' || !vault) return false;
    return account.auth !== 'api-key' || !!vault.put;
  }

  #records(account: Account, vault: VaultPort): Array<[string, RecordKind]> {
    if (account.auth === 'api-key' || dual(account))
      return [[recordName(account), recordKind(account)]];
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
    const key = vaulted && (account.auth === 'api-key' || dual(account));
    const signIn = vaulted && account.auth !== 'api-key' && account.group === 'mcp';
    const stored = key || signIn ? vault : undefined;
    const body = `Agents can’t use ${account.provider} until you connect it again.${key ? ' You can restore its key from Removed in Secrets for 30 days.' : ''}`;
    const title = `Disconnect ${account.provider}?`;
    if (!(await confirm({ title, body, action: 'Disconnect', variant: 'confirmation' }))) return;
    clearValues(this.renderRoot);
    if (this.model !== model) return;
    const server = serverOf(account);
    const pinned = !!this.#pinned(account);
    const url =
      account.group === 'mcp'
        ? (registrations()[server] ?? (pinned ? null : this.#mcpUrl(account)))
        : null;
    if (stored && !(await this.#forget(account, stored))) return;
    if (this.model !== model) return;
    model?.settings.disconnect(account.id);
    if (!url || !stored?.endpoints) return;
    await stored
      .endpoints({ remove: { mcp: [{ server, url }] } })
      .then(() => register(server, undefined))
      .catch((error) => {
        if (this.model === model) this.failure = { id: account.id, message: failureText(error) };
      });
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
    if (this.entering !== null) return 'a key is being entered';
    return this.picking ? 'a provider is being added' : null;
  }

  #signingIn(account: Account): boolean {
    return (
      account.status === 'signing-in' ||
      (account.auth !== 'api-key' &&
        account.status !== 'connected' &&
        this.entering !== account.id &&
        this.pending.has(account.id))
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
    const signs = popup(account) || dual(account);
    const label = signs ? 'Sign in' : account.status === 'expired' ? 'Reconnect' : 'Connect';
    const entering = this.entering === account.id;
    const busy = this.#signingIn(account) || (!entering && this.pending.has(account.id));
    return html`<swc-button
      size="m"
      variant="secondary"
      data-action="connect"
      accessible-label=${signs ? `Sign in to ${account.provider}` : `${label} ${account.provider}`}
      ?pending=${busy}
      ?disabled=${entering || !!account.blocked}
      @click=${() => this.#start(account)}
    >${label}</swc-button>`;
  }

  #status(account: Account): keyof typeof accountStatus {
    if (this.#signingIn(account)) return 'signing-in';
    if (account.status === 'connected' && account.blocked) return 'unreachable';
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
      ${this.#actions(account)}
    </div>
    ${this.#rowNotes(account)}
    ${this.#movedNote(account)}
    ${this.adding?.id === account.id ? nothing : html`${this.#key(account)}${this.#otherKey(account)}${failure}`}`;
  }

  #otherKey(account: Account): TemplateResult | typeof nothing {
    if (this.entering !== account.id) return nothing;
    const other = this.#otherWay(account);
    return other === nothing ? nothing : html`<div class="notes">${other}</div>`;
  }

  #actions(account: Account): TemplateResult {
    const moved = account.status === 'connected' ? this.#moved(account) : null;
    if (moved)
      return html`<div class="actions"><swc-button
          size="m"
          variant="accent"
          data-action="reconnect-mcp"
          accessible-label=${`Reconnect ${account.provider}`}
          ?pending=${this.pending.has(account.id)}
          @click=${() => this.#reconnectMcp(account, moved)}
        >Reconnect</swc-button>${this.#action(account)}</div>`;
    if (this.#removable(account))
      return html`<div class="actions">${this.#action(account)}${this.#removeButton(account)}</div>`;
    return this.#action(account);
  }

  #removable(account: Account): boolean {
    return !!this.#offered() && !!this.model?.settings.remove && account.group !== 'mcp';
  }

  #removeButton(account: Account): TemplateResult {
    const id = `remove-${account.id}`;
    const label = `Remove ${account.provider}`;
    return html`<swc-action-button
        id=${id}
        size="m"
        quiet
        data-action="remove-account"
        accessible-label=${label}
        ?disabled=${this.pending.has(account.id)}
        @click=${() => this.#remove(account)}
        ><swc-icon-delete slot="icon"></swc-icon-delete></swc-action-button
      ><swc-tooltip for=${id} placement="top">${label}</swc-tooltip>`;
  }

  async #closeTip(id: string): Promise<void> {
    const tip = this.renderRoot.querySelector<LitElement & { open: boolean }>(
      `swc-tooltip[for="${CSS.escape(id)}"]`
    );
    if (!tip) return;
    tip.open = false;
    await tip.updateComplete;
  }

  async #remove(account: Account): Promise<void> {
    const model = this.model as SliccModel;
    const body =
      removeBodies[account.auth ?? ''] ??
      'Its key is deleted from the vault. Models from it stop working.';
    const title = `Remove ${account.provider}?`;
    if (!(await confirm({ title, body, action: 'Remove' }))) return;
    if (this.model !== model) return;
    clearValues(this.renderRoot);
    if (this.entering === account.id) this.entering = null;
    const vault = model.vault;
    const keyed = account.store === 'vault' && account.auth === 'api-key' && !!vault?.remove;
    if (keyed && !(await this.#forget(account, vault as VaultPort))) return;
    if (this.model !== model) return;
    await this.#closeTip(`remove-${account.id}`);
    this.#busy(account.id, true);
    this.failure = null;
    try {
      await model.settings.remove?.(account.id);
    } catch (error) {
      if (this.model === model) this.failure = { id: account.id, message: failureText(error) };
      return;
    } finally {
      this.#busy(account.id, false);
    }
    this.focusOn('[data-action=add-provider]');
    for (const field of account.fields ?? []) this.#bases.delete(`${account.id} ${field.name}`);
  }

  #notice(
    row: Account | ProviderOption,
    size: 'short' | 'long' = 'long'
  ): TemplateResult | typeof nothing {
    const needs = row.blocked;
    if (needs !== 'cors-free-transport') return nothing;
    return html`<p class="notice" data-notice=${needs} data-blocked><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${corsNotice[size]} <a class="swc-Link" href="#network" data-action="setup-network" aria-label="Set up the SLICC extension or CLI" @click=${(event: Event) => this.#setUp(event)}>Set up</a></span></p>`;
  }

  #setUp(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.picking) {
      this.#away = true;
      this.#closePicker();
    }
    this.dispatchEvent(
      new CustomEvent('show-surface', {
        detail: { id: 'network', section: 'whole' },
        bubbles: true,
        composed: true,
      })
    );
  }

  #signingNote(account: Account): TemplateResult | typeof nothing {
    const key = `settings:${account.id}`;
    if (account.auth !== 'oauth' || !this.#signingIn(account)) {
      this.#waits.done(key);
      return nothing;
    }
    return html`<p class="hint" role="status" data-signing>${signInText(this.#waits.waited(key))}</p>`;
  }

  #signInDetails(account: Account): TemplateResult | typeof nothing {
    if (account.status !== 'signing-in') return nothing;
    return signInDetails(account.signIn, this.#copies.state(account.id), (code) => {
      void this.#copies.copy(account.id, code);
    });
  }

  #rowNotes(account: Account): TemplateResult | typeof nothing {
    const offered = !!this.#offered();
    const adding = this.adding?.id === account.id;
    const notice = offered ? this.#notice(account) : nothing;
    const signing = offered && !adding ? this.#signingNote(account) : nothing;
    const details = adding ? nothing : this.#signInDetails(account);
    const other = this.entering === account.id ? nothing : this.#otherWay(account);
    if ([notice, signing, details, other].every((part) => part === nothing)) return nothing;
    return html`<div class="notes">${notice}${signing}${details}${other}</div>`;
  }

  #openPicker(): void {
    this.query = '';
    this.adding = null;
    this.picking = true;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const dialog = this.#dialog;
    if (!changed.has('picking') || !dialog || dialog.open) return;
    dialog.showModal();
    const field = this.renderRoot.querySelector('sp-search') as LitElement;
    void field.updateComplete.then(() => field.focus());
  }

  get #dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector<HTMLDialogElement>('dialog.picker');
  }

  #closePicker(): void {
    this.#dialog?.close();
  }

  #closed(): void {
    const id = this.adding?.id;
    if (id !== undefined && this.entering === id) {
      clearValues(this.renderRoot);
      this.entering = null;
      this.problem = null;
    }
    if (id !== undefined && this.failure?.id === id) this.failure = null;
    this.picking = false;
    this.adding = null;
    this.query = '';
    const landing = this.#landing;
    this.#landing = null;
    const away = this.#away;
    this.#away = false;
    if (away) return;
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const row = landing
        ? root.querySelector<HTMLElement>(`.account[data-id="${CSS.escape(landing)}"] swc-button`)
        : null;
      (row ?? root.querySelector<HTMLElement>('[data-action=add-provider]'))?.focus();
    });
  }

  #finish(id: string): void {
    this.#landing = id;
    this.#closePicker();
  }

  #choose(option: ProviderOption): void {
    if (option.blocked || this.#added(option.id)) return;
    this.adding = option;
    this.failure = null;
    if (option.auth === 'api-key' || option.auth === 'fields') {
      this.#enter(draft(option));
      return;
    }
    void this.updateComplete.then(() =>
      this.focusOn('[data-step] [data-action=sign-in]', '[data-step] [data-action=connect]')
    );
  }

  #back(): void {
    const id = (this.adding as ProviderOption).id;
    clearValues(this.renderRoot);
    if (this.entering === id) this.entering = null;
    if (this.failure?.id === id) this.failure = null;
    this.problem = null;
    this.adding = null;
    void this.updateComplete.then(() =>
      this.renderRoot
        .querySelector<HTMLElement>(`.option[data-provider="${CSS.escape(id)}"]`)
        ?.focus()
    );
  }

  #options(): HTMLElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLElement>('.option')];
  }

  #pickerKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.#closePicker();
  }

  #searchKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#options()[0]?.focus();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = matchProviders(this.#offered() ?? [], this.query).find(
      (option) => !option.blocked && !this.#added(option.id)
    );
    if (first) this.#choose(first);
  }

  #optionKey(event: KeyboardEvent, option: ProviderOption): void {
    const inner = event.target !== event.currentTarget;
    if (inner && (event.key === 'Enter' || event.key === ' ')) return;
    const options = this.#options();
    const at = options.indexOf(event.currentTarget as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: Math.min(at + 1, options.length - 1),
      ArrowUp: at - 1,
      Home: 0,
      End: options.length - 1,
    };
    const typed = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key in moves) {
      const to = moves[event.key];
      if (to < 0) this.focusOn('sp-search');
      else options[to].focus();
    } else if (event.key === 'Enter' || event.key === ' ') this.#choose(option);
    else if (typed || event.key === 'Backspace') {
      this.query = typed ? this.query + event.key : this.query.slice(0, -1);
      this.focusOn('sp-search');
    } else return;
    event.preventDefault();
  }

  #option(option: ProviderOption): TemplateResult {
    const added = !!this.#added(option.id);
    return html`<div
      class="option"
      role="option"
      tabindex="-1"
      data-provider=${option.id}
      data-auth=${option.auth}
      ?data-blocked=${!!option.blocked}
      aria-disabled=${added || option.blocked ? 'true' : 'false'}
      @click=${() => this.#choose(option)}
      @keydown=${(event: KeyboardEvent) => this.#optionKey(event, option)}
    >
      <span class="name">${option.name}</span>
      <span class="tag">${
        added
          ? html`<span class="added" data-added><swc-icon-checkmark size="s" aria-hidden="true"></swc-icon-checkmark>Added</span>`
          : authHints[option.auth]
      }</span>
      ${option.description ? html`<span class="description">${option.description}</span>` : nothing}
      ${this.#notice(option, 'short')}
    </div>`;
  }

  #pickStep(offered: readonly ProviderOption[]): TemplateResult {
    const matches = matchProviders(offered, this.query);
    return html`<div class="find">${search({
      label: 'Search providers',
      value: this.query,
      input: (value) => {
        this.query = value;
      },
      keydown: (event) => this.#searchKey(event),
    })}</div>
      <div class="results">${
        matches.length
          ? html`<div class="options" role="listbox" aria-label="Providers">${matches.map((option) => this.#option(option))}</div>`
          : html`<p class="empty" role="status">No provider matches “${this.query.trim()}”.</p>`
      }</div>
      <div class="buttons end">
        <swc-button size="m" variant="secondary" data-action="close" @click=${() => this.#closePicker()}>Cancel</swc-button>
      </div>`;
  }

  #signInStep(account: Account): TemplateResult {
    const signing = this.#signingIn(account);
    const cancel = signing && !!this.model?.settings.cancel;
    return html`<p class="hint">Sign in to ${account.provider} in a new window.</p>
      ${signing ? this.#signingNote(account) : nothing}
      ${this.#signInDetails(account)}
      <div class="buttons">
        ${
          cancel
            ? html`<swc-button size="m" variant="secondary" data-action="cancel-sign-in" @click=${() => this.#stopSigningIn(account)}>Cancel</swc-button>`
            : nothing
        }
        <swc-button size="m" variant="accent" data-action="sign-in" ?pending=${signing} ?disabled=${!!account.blocked} @click=${() => this.connect(account.id, undefined, undefined, signInMethod(account))}>${signing ? 'Signing in…' : 'Sign in'}</swc-button>
        ${signing ? nothing : this.#leave(account)}
      </div>`;
  }

  #localStep(account: Account): TemplateResult {
    return html`<p class="hint">SLICC connects to ${account.provider} on this device.</p>
      <div class="buttons">
        <swc-button size="m" variant="accent" data-action="connect" ?pending=${this.pending.has(account.id)} ?disabled=${!!account.blocked} @click=${() => this.connect(account.id)}>Connect</swc-button>
        ${this.#leave(account)}
      </div>`;
  }

  #connectStep(adding: ProviderOption): TemplateResult {
    const option = this.#offered()?.find((candidate) => candidate.id === adding.id) ?? adding;
    const account = this.#added(option.id) ?? draft(option);
    const step =
      option.auth === 'oauth'
        ? this.#signInStep(account)
        : option.auth === 'local'
          ? this.#localStep(account)
          : this.#key(account);
    return html`<div class="step" data-step=${option.auth} data-provider=${option.id}>
      ${option.description ? html`<p class="lead">${option.description}</p>` : nothing}
      ${this.#notice(option)}
      ${step}
      ${
        this.failure?.id === option.id
          ? html`<div class="failure" role="alert"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.failure.message}</span></div>`
          : nothing
      }
    </div>`;
  }

  #picker(offered: readonly ProviderOption[]): TemplateResult | typeof nothing {
    if (!this.picking) return nothing;
    const adding = this.adding;
    return html`<dialog class="picker" aria-labelledby="picker-title" data-picker=${adding ? 'connect' : 'pick'} @keydown=${(event: KeyboardEvent) => this.#pickerKey(event)} @close=${() => this.#closed()}>
      <div class="head">
        <h2 id="picker-title">${adding ? `Add ${adding.name}` : 'Add a provider'}</h2>
        <swc-close-button size="m" data-action="close" accessible-label="Close" @click=${() => this.#closePicker()}></swc-close-button>
      </div>
      ${adding ? this.#connectStep(adding) : this.#pickStep(offered)}
    </dialog>`;
  }

  #providerList(accounts: readonly Account[]): TemplateResult {
    const offered = this.#offered();
    if (!offered)
      return html`<div class="accounts">${accounts.map((account) => this.#account(account))}</div>`;
    const sorted = [...accounts].sort((a, b) => listOrder[a.status] - listOrder[b.status]);
    return html`<div class="accounts" data-group="providers">${repeat(
      sorted,
      (account) => account.id,
      (account) => this.#account(account)
    )}</div>
      <div class="add">
        <swc-action-button size="m" quiet data-action="add-provider" @click=${() => this.#openPicker()}>
          <swc-icon-add slot="icon"></swc-icon-add>Add a provider
        </swc-action-button>
      </div>
      ${this.#picker(offered)}`;
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
      ${this.#developerRow()}
      </div>
      <h2 data-section="accounts">Accounts</h2>
      ${this.#providerList(providers)}
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
