import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type {
  AuditEntry,
  ButtonConfig,
  LinkedDevice,
  PendingRequest,
  PolicyNotice,
  RevealEntry,
  SecretView,
  SliccModel,
  VaultList,
  VaultPort,
  VaultStatus,
} from '../model/types.ts';
import { ThemedElement } from './base.ts';
import { since } from './network.ts';
import {
  deviceName,
  devicesOf,
  execLine,
  exitLabel,
  list,
  type PopupDetail,
  ruleLine,
  widening,
} from './vault.ts';

const kinds = { secret: null, grant: 'Sign-in', model: 'Model key', mcp: 'MCP server' } as const;

const lockModes = {
  auto: 'Unlocks with this browser',
  passkey: 'Unlocks with a passkey',
  passphrase: 'Unlocks with a passphrase',
} as const;

export function until(at: number, now = Date.now()): string {
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return 'expired';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function who(entry: { uid: number | null; tag: string | null }): string {
  if (entry.tag) return entry.tag;
  if (entry.uid === null) return 'the vault';
  return entry.uid === 0 ? 'root' : `uid ${entry.uid}`;
}

export function sourceLine(secret: SecretView, devices: readonly LinkedDevice[]): string {
  const on = secret.sourceDevice ? ` on ${deviceName(secret.sourceDevice, devices)}` : '';
  const [kind, detail = ''] = secret.source.split(/:(.*)/s);
  if (kind === 'popup') return `Entered in the vault${on}`;
  if (kind === 'process') return `Saved by a program${on}`;
  if (kind === 'import') return `Imported from ${detail}`;
  if (kind === 'oauth') {
    const as = secret.account ? ` as ${secret.account}` : '';
    return `Signed in to ${secret.provider ?? detail}${as}`;
  }
  return `A jerk lease for ${detail.split('@')[0]}${on}`;
}

function startOfDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function revealed(
  name: string,
  entries: readonly AuditEntry[],
  now = Date.now(),
  more = false
): TemplateResult | null {
  const reveals = entries.filter(
    (entry): entry is RevealEntry => entry.type === 'materialize' && entry.name === name
  );
  if (!reveals.length) return null;
  const [last] = reveals;
  const start = startOfDay(now);
  const today = reveals.filter((entry) => entry.at >= start).length;
  const partial = more && (entries[entries.length - 1]?.at ?? 0) >= start;
  const when = today
    ? `${partial ? 'at least ' : ''}${today} ${today === 1 ? 'time' : 'times'} today`
    : since(last.at, now);
  return html`Revealed to programs ${when}, last by ${who(last)} with <code>${last.argv}</code>`;
}

export function auditLine(entry: AuditEntry, devices: readonly LinkedDevice[]): TemplateResult {
  switch (entry.type) {
    case 'inject':
    case 'forward':
      return html`${entry.type === 'inject' ? 'Sent to' : 'Forwarded to'} ${entry.domain}: <code>${entry.method} ${entry.path}</code>, through ${exitLabel(entry.exit, devices)}`;
    case 'materialize':
      return html`Revealed to <code>${entry.argv}</code> in <code>${entry.cwd}</code>`;
    case 'seal':
      return html`${entry.rotated ? 'Value replaced' : 'Value saved'}`;
    case 'remove':
      return html`Removed`;
    case 'restore':
      return html`Restored`;
    default: {
      const count = entry.widened.length;
      const widened = count ? `, widening ${count} ${count === 1 ? 'rule' : 'rules'}` : '';
      return html`<code>${entry.file}</code> ${entry.accepted ? `changed${widened}` : 'changed and was refused'}${entry.warning ? html`. ${entry.warning}` : nothing}`;
    }
  }
}

export function merged(...pages: ReadonlyArray<readonly AuditEntry[]>): AuditEntry[] {
  const bySeq = new Map<number, AuditEntry>();
  for (const page of pages) for (const entry of page) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq);
}

export function prompt(text: string): string {
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

export class SliccSecrets extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    older: { state: true },
    more: { state: true },
    loading: { state: true },
    reveals: { state: true },
    popup: { state: true },
    acking: { state: true },
    failure: { state: true },
  };
  declare older: readonly AuditEntry[];
  declare more: boolean | null;
  declare loading: boolean;
  declare reveals: boolean;
  declare popup: PopupDetail | null;
  declare acking: string | null;
  declare failure: string | null;

  constructor() {
    super();
    this.older = [];
    this.more = null;
    this.loading = false;
    this.reveals = false;
    this.popup = null;
    this.acking = null;
    this.failure = null;
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    h2 {
      font-size: var(--swc-heading-size-xs);
      font-weight: var(--swc-bold-font-weight);
      line-height: var(--swc-heading-line-height);
      color: var(--swc-heading-color);
      margin: 0;
    }
    h3 {
      font-size: var(--swc-font-size-100);
      font-weight: var(--swc-bold-font-weight);
      color: var(--swc-heading-color);
      margin: var(--swc-spacing-400) 0 var(--swc-spacing-100);
    }
    p {
      margin: var(--swc-spacing-100) 0;
    }
    ul,
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    code {
      font-family: var(--swc-code-font-family, ui-monospace, monospace);
      font-size: 0.9em;
      overflow-wrap: anywhere;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--swc-spacing-200) var(--swc-spacing-300);
      margin: var(--swc-spacing-500) 0 var(--swc-spacing-200);
    }
    .head slicc-vault-button {
      align-self: center;
      margin-inline-start: auto;
    }
    .muted {
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .box {
      display: grid;
      gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-200) var(--swc-spacing-300);
      margin: var(--swc-spacing-200) 0;
      border-radius: var(--swc-corner-radius-100);
      border: var(--swc-border-width-100) solid var(--swc-gray-200);
      background: var(--swc-background-layer-1-color);
    }
    .box.notice {
      border-color: var(--swc-notice-visual-color);
      --swc-icon-color: var(--swc-notice-visual-color);
    }
    .box .title {
      display: flex;
      align-items: flex-start;
      gap: var(--swc-spacing-100);
      font-weight: var(--swc-bold-font-weight);
    }
    .box ul {
      list-style: disc;
      padding-inline-start: var(--swc-spacing-400);
    }
    .box .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--swc-spacing-200);
    }
    .prompt {
      margin: 0;
      padding-inline-start: var(--swc-spacing-200);
      border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
      overflow-wrap: anywhere;
    }
    .said {
      white-space: pre-wrap;
    }
    .from {
      display: block;
      font-size: var(--swc-font-size-75);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .secrets {
      display: grid;
      gap: var(--swc-spacing-200);
    }
    .secret {
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      gap: var(--swc-spacing-100) var(--swc-spacing-300);
      padding: var(--swc-spacing-200) 0;
      border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
    }
    .secret:first-child {
      border-top: 0;
    }
    .name {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--swc-spacing-100) var(--swc-spacing-200);
      min-width: 0;
    }
    .name code {
      font-size: var(--swc-font-size-100);
      font-weight: var(--swc-bold-font-weight);
    }
    .secret slicc-vault-button {
      align-self: start;
    }
    dl {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--swc-spacing-50) var(--swc-spacing-300);
      margin: 0;
      font-size: var(--swc-font-size-75);
      line-height: var(--swc-line-height-200);
    }
    dt {
      color: var(--swc-neutral-subdued-content-color-default);
    }
    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .audit-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--swc-spacing-200);
      margin: var(--swc-spacing-400) 0 var(--swc-spacing-100);
    }
    .audit-head h3 {
      margin-block: 0;
    }
    .audit li {
      display: grid;
      grid-template-columns: 7em minmax(0, 1fr);
      gap: var(--swc-spacing-50) var(--swc-spacing-300);
      padding: var(--swc-spacing-100) 0;
      border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
      font-size: var(--swc-font-size-75);
      line-height: var(--swc-line-height-200);
    }
    .audit time {
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .audit .what {
      overflow-wrap: anywhere;
    }
    .audit .by {
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--swc-spacing-200);
      margin-top: var(--swc-spacing-200);
    }
    .error {
      display: flex;
      align-items: flex-start;
      gap: var(--swc-spacing-100);
      color: var(--swc-negative-content-color-default);
      font-size: var(--swc-font-size-75);
      --swc-icon-color: var(--swc-negative-content-color-default);
    }
    @container (max-width: 480px) {
      .secret {
        grid-template-columns: minmax(0, 1fr);
      }
      dl {
        grid-template-columns: minmax(0, 1fr);
      }
      dd {
        margin-bottom: var(--swc-spacing-75);
      }
      .audit li {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      ...super.subscribe(model),
      ...(model.vault ? [model.vault.on('status', update), model.vault.on('list', update)] : []),
      ...(model.network ? [model.network.on('network', update)] : []),
    ];
  }

  #button(config: ButtonConfig): TemplateResult {
    const theme = this.color;
    return html`<slicc-vault-button
      .vault=${this.model?.vault}
      .config=${{ size: 'm', variant: 'secondary', ...config, theme }}
      @vault-popup=${(event: CustomEvent<PopupDetail>) => this.#popup(event.detail)}
    ></slicc-vault-button>`;
  }

  #popup(detail: PopupDetail): void {
    this.popup = detail;
  }

  async showOlder(vault: VaultPort, entries: readonly AuditEntry[]): Promise<void> {
    this.loading = true;
    this.failure = null;
    try {
      const page = await vault.audit(entries[entries.length - 1]?.seq);
      this.older = merged(this.older, page.audit);
      this.more = page.more;
    } catch (error) {
      this.failure = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async acknowledge(vault: VaultPort, notice: PolicyNotice): Promise<void> {
    this.acking = notice.id;
    this.failure = null;
    try {
      await vault.acknowledge(notice.id);
    } catch (error) {
      this.failure = (error as Error).message;
    } finally {
      this.acking = null;
    }
  }

  #request(request: PendingRequest): TemplateResult {
    const asker = who(request);
    const what =
      request.kind === 'value'
        ? html`${asker} asks for <code>${request.name}</code>`
        : request.kind === 'oauth'
          ? html`${asker} asks you to sign in to ${request.provider}`
          : html`${asker} asks for a jerk lease for ${request.provider}`;
    return html`<div class="box" data-request=${request.id}>
      <span class="title">${what}</span>
      ${
        request.prompt
          ? html`<p class="prompt" data-prompt><span class="from">From the agent, not checked by SLICC:</span> <span class="said">${prompt(request.prompt)}</span></p>`
          : nothing
      }
      <div class="actions">
        ${this.#button({ intent: { kind: 'request', request: request.id }, label: 'Answer in the vault', variant: 'accent' })}
        <span class="muted">Expires ${until(request.expiresAt)}</span>
      </div>
    </div>`;
  }

  #notice(
    vault: VaultPort,
    notice: PolicyNotice,
    devices: readonly LinkedDevice[]
  ): TemplateResult {
    return html`<div class="box notice" role="alert" data-notice=${notice.id}>
      <span class="title"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>Rules widened in <code>${notice.file}</code> ${since(notice.at)}</span></span>
      <ul>${notice.widened.map((change) => html`<li>${widening(change, devices)}</li>`)}</ul>
      <span>If you didn’t mean this, change the file back with sudo.</span>
      <div class="actions"><swc-button size="s" variant="secondary" data-action="acknowledge" ?pending=${this.acking === notice.id} @click=${() => this.acknowledge(vault, notice)}>Acknowledge</swc-button></div>
    </div>`;
  }

  #state(secret: SecretView): TemplateResult {
    const [variant, label] =
      secret.state === 'removed'
        ? ['neutral', 'Removed']
        : secret.expiresAt !== undefined && secret.expiresAt <= Date.now()
          ? ['notice', 'Expired']
          : secret.state === 'inert'
            ? ['neutral', 'No rule yet']
            : ['positive', 'Active'];
    return html`<swc-status-light size="s" variant=${variant}>${label}</swc-status-light>`;
  }

  #action(secret: SecretView): TemplateResult {
    if (secret.state === 'removed')
      return this.#button({
        intent: { kind: 'manage', name: secret.name },
        label: 'Manage',
        size: 's',
      });
    if (secret.source.startsWith('oauth:'))
      return this.#button({
        intent: { kind: 'signin', provider: secret.source.slice('oauth:'.length) },
        label: 'Sign in again',
        size: 's',
      });
    return this.#button({
      intent: { kind: 'enter', name: secret.name },
      label: 'Replace value',
      size: 's',
    });
  }

  #secret(
    secret: SecretView,
    entries: readonly AuditEntry[],
    devices: readonly LinkedDevice[],
    more: boolean
  ): TemplateResult {
    const kind = kinds[secret.kind];
    const reveal = revealed(secret.name, entries, Date.now(), more);
    return html`<li class="secret" data-secret=${secret.name} data-state=${secret.state}>
      <div class="name">
        <code>${secret.name}</code>
        ${kind ? html`<swc-badge size="s" variant="neutral" subtle>${kind}</swc-badge>` : nothing}
        ${this.#state(secret)}
      </div>
      ${this.#action(secret)}
      <dl>
        <dt>Sent to</dt>
        <dd data-rules>${secret.rules.length ? secret.rules.map((rule, index) => html`${index ? html`<br />` : nothing}${ruleLine(rule)}`) : 'Nowhere yet: no rule names it'}</dd>
        <dt>Leaves through</dt>
        <dd data-exits>${list(secret.exits.map((exit) => exitLabel(exit, devices)))}</dd>
        <dt>Programs</dt>
        <dd data-exec>${execLine(secret.exec)}${reveal ? html`<br />${reveal}` : nothing}</dd>
        <dt>From</dt>
        <dd data-source>${sourceLine(secret, devices)}</dd>
        ${secret.usedAt ? html`<dt>Last used</dt><dd data-used>${since(secret.usedAt)}</dd>` : nothing}
        ${secret.expiresAt ? html`<dt>Expires</dt><dd data-expires>${until(secret.expiresAt)}</dd>` : nothing}
        ${secret.removedAt ? html`<dt>Removed</dt><dd>${since(secret.removedAt)}</dd>` : nothing}
      </dl>
    </li>`;
  }

  #entry(entry: AuditEntry, devices: readonly LinkedDevice[]): TemplateResult {
    const date = new Date(entry.at);
    const name = entry.type === 'policy' ? null : entry.name;
    return html`<li data-seq=${entry.seq} data-type=${entry.type}>
      <time datetime=${date.toISOString()} title=${date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}>${since(entry.at)}</time>
      <span class="what">${name ? html`<code>${name}</code> · ` : nothing}${auditLine(entry, devices)}${entry.type === 'policy' ? nothing : html` <span class="by">by ${who(entry)}</span>`}</span>
    </li>`;
  }

  #audit(
    vault: VaultPort,
    list: VaultList,
    entries: readonly AuditEntry[],
    devices: readonly LinkedDevice[]
  ): TemplateResult {
    const shown = this.reveals ? entries.filter((entry) => entry.type === 'materialize') : entries;
    const more = this.more ?? list.auditMore;
    return html`<div class="audit-head">
        <h3 id="secrets-audit">Activity</h3>
        <sp-switch size="s" data-action="reveals" .checked=${this.reveals} @change=${(
          event: Event
        ) => {
          this.reveals = (event.target as HTMLElement & { checked: boolean }).checked;
        }}>Only reveals to programs</sp-switch>
      </div>
      ${
        shown.length
          ? html`<ol class="audit" aria-labelledby="secrets-audit">${shown.map((entry) => this.#entry(entry, devices))}</ol>`
          : html`<p class="muted" data-audit-empty>${this.reveals ? 'No program has been given a secret.' : 'Nothing has used a secret yet.'}</p>`
      }
      ${
        more
          ? html`<div class="row"><swc-button size="s" variant="secondary" fill-style="outline" data-action="older" ?pending=${this.loading} @click=${() => this.showOlder(vault, entries)}>Show older</swc-button></div>`
          : nothing
      }`;
  }

  #feedback(): TemplateResult | typeof nothing {
    if (this.popup?.state === 'blocked')
      return html`<div class="error" role="alert" data-popup="blocked"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>The browser blocked the vault window. Allow pop-ups for this site, then try again.</span></div>`;
    if (this.popup?.state === 'done' && this.popup.result)
      return html`<p role="status" data-popup="done">Saved <code>${this.popup.result.name}</code> in the vault.</p>`;
    return nothing;
  }

  render(): TemplateResult | typeof nothing {
    const vault = this.model?.vault;
    if (!vault) return nothing;
    const status: VaultStatus | null = vault.status();
    const current = vault.list();
    const devices = devicesOf(this.model);
    const entries = merged(current?.audit ?? [], this.older);
    const notices = current?.notices.filter((notice) => !notice.acknowledged) ?? [];
    return html`<section aria-labelledby="secrets" data-vault=${status ? (status.locked ? 'locked' : 'unlocked') : 'loading'}>
      <div class="head">
        <h2 id="secrets">Secrets</h2>
        ${status ? html`<swc-status-light size="m" variant=${status.locked ? 'notice' : 'positive'}>${status.locked ? 'Locked' : 'Unlocked'}</swc-status-light><span class="muted">${lockModes[status.lock]}</span>` : nothing}
        ${status?.locked ? this.#button({ intent: { kind: 'unlock' }, label: 'Unlock', variant: 'accent' }) : this.#button({ intent: { kind: 'manage' }, label: 'Open the vault' })}
      </div>
      <p class="muted">Agents and programs use secrets by name. The values stay in the vault, so SLICC never sees or shows them.</p>
      ${this.#feedback()}
      ${
        this.failure
          ? html`<div class="error" role="alert" data-error="vault"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.failure}</span></div>`
          : nothing
      }
      ${status?.waiting.length ? html`<h3>Waiting for you</h3>${status.waiting.map((request) => this.#request(request))}` : nothing}
      ${notices.map((notice) => this.#notice(vault, notice, devices))}
      ${
        !current
          ? html`<p class="muted" data-loading>Loading secrets…</p>`
          : current.secrets.length
            ? html`<ul class="secrets" aria-labelledby="secrets">${current.secrets.map((secret) => this.#secret(secret, entries, devices, this.more ?? current.auditMore))}</ul>`
            : html`<p data-empty>No secrets yet. When an agent or program needs one, it asks here, and you enter the value in the vault.</p>`
      }
      <p class="muted" data-policy>Rules live in <code>/etc/fnox/config.toml</code> and <code>/etc/slicc/secrets-policy.toml</code>. Change them with sudo; SLICC asks you before every change.</p>
      <div class="row">
        ${this.#button({ intent: { kind: 'import' }, label: 'Import…', size: 's' })}
        ${this.#button({ intent: { kind: 'export' }, label: 'Export…', size: 's' })}
      </div>
      ${current ? this.#audit(vault, current, entries, devices) : nothing}
    </section>`;
  }
}
