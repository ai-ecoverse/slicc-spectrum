import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
import '@spectrum-web-components/picker/sp-picker.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type {
  AuditEntry,
  ButtonConfig,
  ImportCandidate,
  ImportKind,
  ImportResult,
  LinkedDevice,
  PendingRequest,
  PolicyEntry,
  RefusedRule,
  RevealEntry,
  SecretView,
  SliccModel,
  VaultList,
  VaultPort,
  VaultStatus,
} from '../model/types.ts';
import { isVaultFailure, nameProblem, valueProblem } from '../model/values.ts';
import { ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { since } from './network.ts';
import {
  away,
  changeLine,
  clearValues,
  deviceName,
  devicesOf,
  execLine,
  exitLabel,
  failureText,
  fieldOf,
  fieldStyles,
  list,
  type PopupDetail,
  ruleLine,
  take,
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
  if (entry.uid === null) return 'you';
  return entry.uid === 0 ? 'root' : `uid ${entry.uid}`;
}

export function asker(request: PendingRequest): string {
  if (request.tag) return request.tag;
  return request.uid === 0
    ? 'A program running as root'
    : `A program running as uid ${request.uid}`;
}

export function asking(request: PendingRequest): TemplateResult {
  const by = asker(request);
  if (request.kind === 'oauth') return html`${by} asks you to sign in to ${request.provider}`;
  if (request.kind === 'jerk-seal')
    return html`${by} asks for a jerk lease for ${request.provider}`;
  return request.name
    ? html`${by} asks for <code>${request.name}</code>`
    : html`${by} asks for a value`;
}

export function byName(a: SecretView, b: SecretView): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function sourceLine(secret: SecretView, devices: readonly LinkedDevice[]): string {
  const on = secret.sourceDevice ? ` on ${deviceName(secret.sourceDevice, devices)}` : '';
  const [kind, detail = ''] = secret.source.split(/:(.*)/s);
  if (kind === 'settings') return `Entered in SLICC${on}`;
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

export function changes(entry: PolicyEntry, devices: readonly LinkedDevice[]): string[][] {
  if (entry.changes)
    return entry.changes.map((change) => [change.kind, changeLine(change, devices)]);
  return (entry.widened ?? []).map((change) => [change.kind, widening(change, devices)]);
}

export function auditLine(entry: AuditEntry, devices: readonly LinkedDevice[]): TemplateResult {
  switch (entry.type) {
    case 'inject':
    case 'forward':
      return html`Sent to ${entry.domain}: <code>${entry.method} ${entry.path}</code>, through ${exitLabel(entry.exit, devices)}`;
    case 'materialize':
      return html`Revealed to <code>${entry.argv}</code> in <code>${entry.cwd}</code>`;
    case 'seal':
      return html`${entry.rotated ? 'Value replaced' : 'Value saved'}`;
    case 'remove':
      return html`Removed`;
    case 'restore':
      return html`Restored`;
    case 'refresh':
      return entry.grant
        ? html`Refreshed automatically with the sign-in <code>${entry.grant}</code>`
        : html`Refreshed automatically`;
    default:
      return html`<code>${entry.file}</code> ${entry.accepted ? 'changed' : 'changed and was refused'}${changes(entry, devices).map(([kind, line]) => html`<span class="change" data-change=${kind}>${line}</span>`)}${entry.warning ? html`<span class="warning" data-warning>${entry.warning}</span>` : nothing}${entry.accepted ? html`<span class="hint" data-hint>If you didn’t mean this, change the file back with sudo.</span>` : nothing}`;
  }
}

export function merged(...pages: ReadonlyArray<readonly AuditEntry[]>): AuditEntry[] {
  const bySeq = new Map<number, AuditEntry>();
  for (const page of pages) for (const entry of page) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq);
}

export function replaceable(secret: SecretView): boolean {
  return (
    secret.state !== 'removed' &&
    secret.kind !== 'grant' &&
    (secret.source === 'settings' ||
      secret.source === 'process' ||
      secret.source.startsWith('import:'))
  );
}

export function filename(now = Date.now()): string {
  const date = new Date(now);
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `slicc-secrets-${day}.slicc-vault`;
}

export function download(bytes: Uint8Array, name: string, root: Node): void {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  (root as ParentNode).append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type SecretForm =
  | { kind: 'add' }
  | { kind: 'replace'; name: string }
  | { kind: 'import' }
  | { kind: 'export' };

export type Said =
  | { kind: 'saved'; name: string }
  | { kind: 'imported'; imported: number; skipped: { name: string; reason?: string }[] }
  | { kind: 'exported'; file: string };

const importKinds: Record<ImportKind, string> = {
  bundle: 'Bundle',
  keepass: 'KeePass (.kdbx)',
  six: 'six',
};

export function exported(at: number | null | undefined): TemplateResult | typeof nothing {
  if (at === undefined) return nothing;
  const when =
    at === null
      ? 'Never exported'
      : `Last exported ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(at)}`;
  return html`<span class="muted" data-exported>${when}</span>`;
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
    failure: { state: true },
    form: { state: true },
    busy: { state: true },
    problem: { state: true },
    invalid: { state: true },
    said: { state: true },
    acting: { state: true },
    importKind: { state: true },
    candidates: { state: true },
    picked: { state: true },
    again: { state: true },
  };
  declare older: readonly AuditEntry[];
  declare more: boolean | null;
  declare loading: boolean;
  declare reveals: boolean;
  declare popup: PopupDetail | null;
  declare failure: string | null;
  declare form: SecretForm | null;
  declare busy: boolean;
  declare problem: string | null;
  declare invalid: string | null;
  declare said: Said | null;
  declare acting: ReadonlySet<string>;
  declare importKind: ImportKind;
  declare candidates: readonly ImportCandidate[] | null;
  declare picked: ReadonlySet<string>;
  declare again: boolean;
  #tick: ReturnType<typeof setTimeout> | undefined;
  #offline = false;

  constructor() {
    super();
    this.older = [];
    this.more = null;
    this.loading = false;
    this.reveals = false;
    this.popup = null;
    this.failure = null;
    this.form = null;
    this.busy = false;
    this.problem = null;
    this.invalid = null;
    this.said = null;
    this.acting = new Set();
    this.importKind = 'bundle';
    this.candidates = null;
    this.picked = new Set();
    this.again = false;
  }

  static styles = [
    fieldStyles,
    css`
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
      .head .controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-200);
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
      .box.info {
        border-color: var(--swc-informative-visual-color);
        --swc-icon-color: var(--swc-informative-visual-color);
      }
      .availability {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .box .title {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        font-weight: var(--swc-bold-font-weight);
      }
      .box .actions,
      .buttons {
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
      .form {
        display: grid;
        gap: var(--swc-spacing-200);
        max-inline-size: 32rem;
        padding: var(--swc-spacing-300);
        margin: var(--swc-spacing-200) 0;
        border-radius: var(--swc-corner-radius-100);
        border: var(--swc-border-width-100) solid var(--swc-gray-300);
        background: var(--swc-background-layer-1-color);
      }
      .form strong {
        font-weight: var(--swc-bold-font-weight);
      }
      .form sp-picker {
        inline-size: 100%;
      }
      .picks {
        display: grid;
        gap: var(--swc-spacing-100);
        margin: 0;
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border: var(--swc-border-width-100) solid var(--swc-gray-200);
        border-radius: var(--swc-corner-radius-100);
      }
      .picks legend {
        padding: 0 var(--swc-spacing-75);
        font-size: var(--swc-font-size-75);
      }
      .picks label {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: start;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
      }
      .picks input {
        margin: 0.2em 0 0;
        accent-color: var(--swc-accent-background-color-default);
      }
      .picks .about {
        display: grid;
        gap: var(--swc-spacing-50);
        min-width: 0;
      }
      .picks .suggested {
        font-size: var(--swc-font-size-75);
        overflow-wrap: anywhere;
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
      .secret .form {
        grid-column: 1 / -1;
      }
      .secret .buttons {
        align-self: start;
        justify-content: flex-end;
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
      .removed {
        margin-top: var(--swc-spacing-200);
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
        padding-top: var(--swc-spacing-200);
      }
      .removed summary {
        cursor: pointer;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .removed .secret dl,
      .removed .secret .name code {
        color: var(--swc-neutral-subdued-content-color-default);
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
      .refused li {
        display: grid;
        gap: var(--swc-spacing-50);
        padding: var(--swc-spacing-100) 0;
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
        font-size: var(--swc-font-size-75);
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
      .audit .by,
      .audit .hint {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .audit .change::before {
        content: '• ' / '';
      }
      .audit .change,
      .audit .warning,
      .audit .hint {
        display: block;
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
        margin: 0;
        color: var(--swc-negative-content-color-default);
        font-size: var(--swc-font-size-75);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      @container (max-width: 480px) {
        .secret {
          grid-template-columns: minmax(0, 1fr);
        }
        .secret .buttons {
          order: 1;
          justify-content: flex-start;
        }
        .secret .form {
          order: 2;
        }
        .form {
          max-inline-size: none;
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
    `,
  ];

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#tick);
    clearValues(this.renderRoot);
    this.older = [];
    this.more = null;
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const before = changed.get('model') as SliccModel | null | undefined;
    if (!changed.has('model') || before?.vault === this.model?.vault) return;
    clearValues(this.renderRoot);
    this.older = [];
    this.more = null;
    this.loading = false;
    this.popup = null;
    this.failure = null;
    this.form = null;
    this.busy = false;
    this.problem = null;
    this.invalid = null;
    this.said = null;
    this.acting = new Set();
    this.candidates = null;
  }

  protected updated(): void {
    clearTimeout(this.#tick);
    if (!this.isConnected) return;
    const now = Date.now();
    const vault = this.model?.vault;
    const next = Math.min(
      now + 60_000,
      ...[
        ...(vault?.list()?.secrets ?? []).map((secret) => secret.expiresAt),
        ...(vault?.status()?.waiting ?? []).map((request) => request.expiresAt),
      ]
        .map((at) => at ?? Number.POSITIVE_INFINITY)
        .filter((at) => at > now)
    );
    this.#tick = setTimeout(() => this.requestUpdate(), next - now);
  }

  #listed(vault: VaultPort): void {
    const head = vault.list()?.audit ?? [];
    const last = head[head.length - 1];
    if (this.older.length && (!last || last.seq > this.older[0].seq + 1)) {
      this.older = [];
      this.more = null;
    }
    this.requestUpdate();
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      ...super.subscribe(model),
      ...(model.vault
        ? [
            model.vault.on('status', update),
            model.vault.on('availability', update),
            model.vault.on('list', () => this.#listed(model.vault as VaultPort)),
          ]
        : []),
      ...(model.network ? [model.network.on('network', update)] : []),
    ];
  }

  #button(config: ButtonConfig, action: string): TemplateResult {
    const theme = this.color;
    return html`<slicc-vault-button
      data-action=${action}
      .vault=${this.model?.vault}
      .config=${{ size: 'm', variant: 'secondary', ...config, theme }}
      @vault-popup=${(event: CustomEvent<PopupDetail>) => this.#popup(event.detail)}
    ></slicc-vault-button>`;
  }

  #popup(detail: PopupDetail): void {
    this.popup = detail;
  }

  open(form: SecretForm | null): void {
    if (form && this.busy) return;
    clearValues(this.renderRoot);
    this.form = form;
    this.problem = null;
    this.invalid = null;
    this.said = null;
    this.candidates = null;
    this.again = false;
    if (form?.kind === 'import') this.importKind = 'bundle';
    if (form) void this.updateComplete.then(() => this.#focus());
  }

  #refuse(text: string | null, field: string | null = null, focus = false): void {
    this.problem = text;
    this.invalid = text ? field : null;
    if (focus && text && field) void this.updateComplete.then(() => this.#field(field)?.focus());
  }

  #typed(): void {
    this.invalid = null;
  }

  #bad(field: string): string | typeof nothing {
    return this.invalid === field ? 'true' : nothing;
  }

  #described(field: string): string | typeof nothing {
    return this.invalid === field ? 'error-form' : nothing;
  }

  #focus(): void {
    this.renderRoot.querySelector<HTMLElement>('[data-form] input, [data-form] sp-picker')?.focus();
  }

  #field(name: string): HTMLInputElement {
    return this.renderRoot.querySelector(
      `[data-form] input[data-field=${name}]`
    ) as HTMLInputElement;
  }

  #same(vault: VaultPort, form: SecretForm | null, kind: ImportKind, file: File): boolean {
    return (
      this.#mine(vault, form) &&
      this.importKind === kind &&
      this.#field('file')?.files?.[0] === file
    );
  }

  #shut(vault: VaultPort): boolean {
    if (!vault.status()?.locked) return false;
    this.#refuse('Unlock the vault first');
    return true;
  }

  #mine(vault: VaultPort, form?: SecretForm | null): boolean {
    return (
      this.model?.vault === vault &&
      this.isConnected &&
      !away(vault) &&
      (form === undefined || this.form === form)
    );
  }

  async save(vault: VaultPort): Promise<void> {
    const form = this.form as SecretForm;
    if (this.busy) return;
    const value = take(this.#field('value'));
    const name = form.kind === 'replace' ? form.name : this.#field('name').value.trim();
    const bad = nameProblem(name);
    const problem = bad ?? valueProblem(value);
    this.#refuse(problem, bad ? 'name' : 'value', true);
    if (problem) return;
    if (form.kind === 'add' && vault.list()?.secrets.some((secret) => secret.name === name)) {
      this.busy = true;
      const sure = await confirm({
        title: `Replace ${name}?`,
        body: 'A secret with this name exists. Saving replaces its value, and its placeholder stays.',
        action: 'Replace',
        variant: 'confirmation',
      });
      if (this.model?.vault === vault) this.busy = false;
      if (!sure || !this.#mine(vault, form) || this.#shut(vault)) return;
    }
    this.busy = true;
    try {
      await vault.put?.(name, value);
      if (!this.#mine(vault, form)) return;
      this.form = null;
      this.said = { kind: 'saved', name };
    } catch (error) {
      if (this.#mine(vault, form)) this.#refuse(failureText(error), fieldOf(error, 'value'));
    } finally {
      if (this.model?.vault === vault) this.busy = false;
    }
  }

  async #act(
    vault: VaultPort,
    key: string,
    run: () => Promise<unknown>,
    missing = ''
  ): Promise<void> {
    if (this.acting.has(key)) return;
    this.acting = new Set([...this.acting, key]);
    this.failure = null;
    try {
      await run();
    } catch (error) {
      if (this.#mine(vault))
        this.failure =
          missing && isVaultFailure(error) && error.code === 'ENOENT'
            ? missing
            : failureText(error);
    } finally {
      if (this.model?.vault === vault)
        this.acting = new Set([...this.acting].filter((item) => item !== key));
    }
  }

  async removeSecret(
    vault: VaultPort,
    secret: SecretView,
    trigger: HTMLElement | null = null
  ): Promise<void> {
    const { name, kind } = secret;
    const sure = await confirm({
      title: `Remove ${name}?`,
      body: 'Agents and programs can no longer use it. You can restore it from Removed.',
      action: 'Remove',
      variant: 'confirmation',
      trigger,
    });
    if (!sure || !this.#mine(vault)) return;
    if (this.form?.kind === 'replace' && this.form.name === name) this.open(null);
    await this.#act(vault, `remove:${name}`, async () => vault.remove?.(name, kind));
  }

  restoreSecret(vault: VaultPort, secret: SecretView): Promise<void> {
    const { name, kind } = secret;
    return this.#act(
      vault,
      `restore:${name}`,
      async () => vault.restore?.(name, kind),
      'Removed too long ago to restore'
    );
  }

  cancelRequest(vault: VaultPort, id: string): Promise<void> {
    return this.#act(vault, `cancel:${id}`, async () => vault.cancel?.(id));
  }

  lockVault(vault: VaultPort): Promise<void> {
    return this.#act(vault, 'lock', async () => vault.lock?.());
  }

  dismissBackup(vault: VaultPort): Promise<void> {
    return this.#act(vault, 'backup', async () => vault.dismissBackupReminder?.());
  }

  answer(id: string): void {
    const vault = this.model?.vault;
    this.dispatchEvent(
      new CustomEvent('value-request', { detail: { id, vault }, bubbles: true, composed: true })
    );
  }

  #kind(event: Event): void {
    this.importKind = (event.currentTarget as HTMLInputElement).value as ImportKind;
    this.candidates = null;
    this.#refuse(null);
  }

  #reset(): void {
    this.candidates = null;
    this.#refuse(null);
  }

  async read(vault: VaultPort): Promise<void> {
    const form = this.form;
    const kind = this.importKind;
    if (this.busy) return;
    const password = take(this.#field('password'));
    const file = this.#field('file').files?.[0];
    if (!file) {
      this.#refuse('Choose a file to import', 'file', true);
      return;
    }
    const pick = this.candidates
      ?.filter((item) => this.picked.has(item.name))
      .map((item) =>
        item.kind && item.kind !== 'secret' ? { name: item.name, kind: item.kind } : item.name
      );
    if (pick && !pick.length) {
      this.#refuse('Choose at least one secret to import');
      return;
    }
    this.busy = true;
    this.#refuse(null);
    try {
      let bytes: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
      if (!this.#same(vault, form, kind, file) || this.#shut(vault)) return;
      const call = vault.import?.(kind, bytes, {
        ...(password ? { password } : {}),
        ...(pick ? { pick } : {}),
      });
      bytes = null;
      const result = (await call) as ImportResult;
      if (!this.#same(vault, form, kind, file)) return;
      if (result.stage === 'pick') {
        this.candidates = result.candidates;
        this.picked = new Set(
          result.candidates.filter((item) => !item.refused).map((item) => item.name)
        );
        this.again = !!password;
        return;
      }
      this.form = null;
      this.candidates = null;
      this.said = {
        kind: 'imported',
        imported: result.imported.length,
        skipped: result.skipped.map((name) => {
          const reason = result.reasons?.[name];
          return reason ? { name, reason } : { name };
        }),
      };
    } catch (error) {
      if (this.#mine(vault, form))
        this.#refuse(failureText(error), fieldOf(error, password ? 'password' : 'file'));
    } finally {
      if (this.model?.vault === vault) this.busy = false;
    }
  }

  #pick(name: string, event: Event): void {
    const on = (event.currentTarget as HTMLInputElement).checked;
    this.picked = new Set(
      on ? [...this.picked, name] : [...this.picked].filter((item) => item !== name)
    );
  }

  async exportAll(vault: VaultPort, trigger: HTMLElement | null = null): Promise<void> {
    const form = this.form;
    if (this.busy) return;
    const passphrase = take(this.#field('passphrase'));
    const repeat = take(this.#field('repeat'));
    const short = new TextEncoder().encode(passphrase).length < 8;
    const problem = short
      ? 'Passphrases need at least 8 bytes'
      : passphrase !== repeat
        ? "The passphrases don't match"
        : null;
    this.#refuse(problem, short ? 'passphrase' : 'repeat', true);
    if (problem) return;
    const sure = await confirm({
      title: 'Export your secrets?',
      body: 'The file holds every value, encrypted with your passphrase. Keep it somewhere safe.',
      action: 'Export',
      variant: 'confirmation',
      trigger,
    });
    if (!sure || !this.#mine(vault, form) || this.#shut(vault)) return;
    this.busy = true;
    try {
      const bytes = (await vault.export?.(passphrase)) as Uint8Array;
      if (!this.#mine(vault, form)) return;
      const file = filename();
      download(bytes, file, this.renderRoot);
      this.form = null;
      this.said = { kind: 'exported', file };
    } catch (error) {
      if (this.#mine(vault, form)) this.#refuse(failureText(error), fieldOf(error, 'passphrase'));
    } finally {
      if (this.model?.vault === vault) this.busy = false;
    }
  }

  async showOlder(vault: VaultPort, entries: readonly AuditEntry[]): Promise<void> {
    this.loading = true;
    this.failure = null;
    try {
      const before = entries[entries.length - 1]?.seq;
      const page = await vault.audit(before);
      if (this.model?.vault !== vault || !this.isConnected) return;
      const shown = merged(vault.list()?.audit ?? [], this.older);
      if (shown[shown.length - 1]?.seq !== before) return;
      this.older = merged(this.older, page.audit);
      this.more = page.more;
    } catch (error) {
      if (this.#mine(vault)) this.failure = (error as Error).message;
    } finally {
      if (this.model?.vault === vault) this.loading = false;
    }
  }

  #error(text: string, id: string): TemplateResult {
    return html`<p class="error" role="alert" id=${`error-${id}`} data-error=${id}><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${text}</span></p>`;
  }

  #enter(event: KeyboardEvent, run: () => unknown, locked: boolean): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.open(null);
      return;
    }
    if (event.key !== 'Enter' || (event.target as HTMLElement).localName !== 'input') return;
    event.preventDefault();
    if (!locked && !this.busy) void run();
  }

  #value(label: string, field = 'value'): TemplateResult {
    return html`<label class="field"><span>${label}</span><input type="password" autocomplete="off" spellcheck="false" data-field=${field} aria-invalid=${this.#bad(field)} aria-describedby=${this.#described(field)} /></label>`;
  }

  #actions(locked: boolean, label: string, action: string, run: () => unknown): TemplateResult {
    return html`<div class="buttons">
      <swc-button size="m" variant="accent" data-action=${action} ?pending=${this.busy} ?disabled=${locked} @click=${run}>${label}</swc-button>
      <swc-button size="m" variant="secondary" fill-style="outline" data-action="cancel" @click=${() => this.open(null)}>Cancel</swc-button>
    </div>`;
  }

  #locked(locked: boolean): TemplateResult | typeof nothing {
    return locked ? html`<p class="muted" data-locked>Unlock the vault first</p>` : nothing;
  }

  #valueForm(vault: VaultPort, form: SecretForm, locked: boolean): TemplateResult {
    const save = () => this.save(vault);
    const add = form.kind === 'add';
    return html`<div class="form" data-form=${form.kind} @input=${() => this.#typed()} @keydown=${(event: KeyboardEvent) => this.#enter(event, save, locked)}>
      <strong>${add ? 'Add a secret' : html`Replace the value of <code>${(form as { name: string }).name}</code>`}</strong>
      ${add ? html`<label class="field"><span>Name</span><input type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" data-field="name" placeholder="API_TOKEN" aria-invalid=${this.#bad('name')} aria-describedby=${this.#described('name')} @input=${(event: Event) => this.#upper(event)} /></label>` : nothing}
      ${this.#value(add ? 'Value' : 'New value')}
      ${this.#locked(locked)}
      ${this.problem ? this.#error(this.problem, 'form') : nothing}
      ${this.#actions(locked, 'Save', 'save', save)}
    </div>`;
  }

  #upper(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.toUpperCase();
  }

  #importForm(vault: VaultPort, locked: boolean): TemplateResult {
    const read = () => this.read(vault);
    const candidates = this.candidates;
    return html`<div class="form" data-form="import" @input=${() => this.#typed()} @keydown=${(event: KeyboardEvent) => this.#enter(event, read, locked)}>
      <strong>Import secrets</strong>
      <label class="field"><span id="import-kind">Kind</span>
        <sp-picker size="m" label="Kind" aria-labelledby="import-kind" data-field="kind" value=${this.importKind} @change=${(event: Event) => this.#kind(event)}>
          ${Object.entries(importKinds).map(([value, label]) => html`<sp-menu-item value=${value}>${label}</sp-menu-item>`)}
        </sp-picker>
      </label>
      <label class="field"><span>File</span><input type="file" data-field="file" aria-invalid=${this.#bad('file')} aria-describedby=${this.#described('file')} @change=${() => this.#reset()} /></label>
      <label class="field"><span>${this.again ? 'Password, once more to import' : 'Password, if the file has one'}</span><input type="password" autocomplete="off" spellcheck="false" data-field="password" aria-invalid=${this.#bad('password')} aria-describedby=${this.#described('password')} /></label>
      ${
        candidates
          ? html`<fieldset class="picks" data-picks>
              <legend class="muted">Choose what to import</legend>
              <p class="muted" data-rules-note>Rules from the file aren't applied. Add them with sudo.</p>
              ${candidates.map(
                (item) => html`<label data-candidate=${item.name}>
                  <input type="checkbox" data-pick=${item.name} .checked=${this.picked.has(item.name)} ?disabled=${!!item.refused} @change=${(event: Event) => this.#pick(item.name, event)} />
                  <span class="about">
                    <span><code>${item.name}</code>${item.exists ? html` <swc-badge size="s" variant="notice" subtle>Replaces a secret</swc-badge>` : nothing}</span>
                    ${item.refused ? html`<span class="muted" data-refused-reason>Can't be imported: ${item.refused}</span>` : nothing}
                    ${item.suggestedRules ? html`<span class="suggested" data-suggested><span class="from">From the file, not checked by SLICC:</span> <span class="said">${prompt(item.suggestedRules)}</span></span>` : nothing}
                  </span>
                </label>`
              )}
            </fieldset>`
          : nothing
      }
      ${this.#locked(locked)}
      ${this.problem ? this.#error(this.problem, 'form') : nothing}
      ${
        candidates
          ? this.#actions(
              locked || !this.picked.size,
              `Import ${this.picked.size}`,
              'import-picked',
              read
            )
          : this.#actions(locked, 'Continue', 'read', read)
      }
    </div>`;
  }

  #exportForm(vault: VaultPort, locked: boolean): TemplateResult {
    const run = () => this.exportAll(vault);
    return html`<div class="form" data-form="export" @input=${() => this.#typed()} @keydown=${(event: KeyboardEvent) => this.#enter(event, run, locked)}>
      <strong>Export secrets</strong>
      <span class="muted">The file is sealed with this passphrase. You need it to import the file again.</span>
      ${this.#value('Passphrase', 'passphrase')}
      ${this.#value('Passphrase again', 'repeat')}
      ${exported(this.model?.vault?.status()?.exportedAt)}
      ${this.#locked(locked)}
      ${this.problem ? this.#error(this.problem, 'form') : nothing}
      ${this.#actions(locked, 'Export', 'download', run)}
    </div>`;
  }

  #request(vault: VaultPort, request: PendingRequest): TemplateResult {
    const what = asking(request);
    return html`<div class="box" data-request=${request.id}>
      <span class="title">${what}</span>
      ${
        request.prompt
          ? html`<p class="prompt" data-prompt><span class="from">From the agent, not checked by SLICC:</span> <span class="said">${prompt(request.prompt)}</span></p>`
          : nothing
      }
      <div class="actions">
        ${request.kind === 'value' && vault.put && !this.#offline ? html`<swc-button size="m" variant="accent" data-action="answer" @click=${() => this.answer(request.id)}>Enter value</swc-button>` : nothing}
        ${vault.cancel && !this.#offline ? html`<swc-button size="m" variant="secondary" fill-style="outline" data-action="cancel-request" ?pending=${this.acting.has(`cancel:${request.id}`)} @click=${() => this.cancelRequest(vault, request.id)}>Cancel request</swc-button>` : nothing}
        <span class="muted">Expires ${until(request.expiresAt)}</span>
      </div>
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

  #controls(vault: VaultPort, secret: SecretView): TemplateResult | typeof nothing {
    if (this.#offline) return nothing;
    const { name } = secret;
    if (secret.state === 'removed')
      return vault.restore
        ? html`<div class="buttons"><swc-button size="s" variant="secondary" data-action="restore" ?pending=${this.acting.has(`restore:${name}`)} @click=${() => this.restoreSecret(vault, secret)}>Restore</swc-button></div>`
        : nothing;
    const replace = vault.put && replaceable(secret);
    if (!replace && !vault.remove) return nothing;
    return html`<div class="buttons">
      ${replace ? html`<swc-button size="s" variant="secondary" data-action="replace" @click=${() => this.open({ kind: 'replace', name })}>Replace value</swc-button>` : nothing}
      ${vault.remove ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="remove" ?pending=${this.acting.has(`remove:${name}`)} @click=${(event: Event) => this.removeSecret(vault, secret, event.currentTarget as HTMLElement)}>Remove</swc-button>` : nothing}
    </div>`;
  }

  #secret(
    vault: VaultPort,
    secret: SecretView,
    entries: readonly AuditEntry[],
    devices: readonly LinkedDevice[],
    more: boolean,
    locked: boolean
  ): TemplateResult {
    const kind = kinds[secret.kind];
    const reveal = revealed(secret.name, entries, Date.now(), more);
    const exec = execLine(secret.exec, secret.execArgv);
    const gone = secret.state === 'removed';
    const form = this.#offline ? null : this.form;
    return html`<li class="secret" data-secret=${secret.name} data-state=${secret.state}>
      <div class="name">
        <code>${secret.name}</code>
        ${kind ? html`<swc-badge size="s" variant="neutral" subtle>${kind}</swc-badge>` : nothing}
        ${this.#state(secret)}
      </div>
      ${this.#controls(vault, secret)}
      <dl>
        <dt>${gone ? 'Was sent to' : 'Sent to'}</dt>
        <dd data-rules>${secret.rules.length ? secret.rules.map((rule, index) => html`${index ? html`<br />` : nothing}${ruleLine(rule)}`) : 'Nowhere yet: no rule names it'}</dd>
        ${secret.exits ? html`<dt>${gone ? 'Left through' : 'Leaves through'}</dt><dd data-exits>${secret.exits.length ? list(secret.exits.map((exit) => exitLabel(exit, devices))) : 'No exit'}</dd>` : nothing}
        ${exec || reveal ? html`<dt>Programs</dt><dd data-exec>${exec}${exec && reveal ? html`<br />` : nothing}${reveal}</dd>` : nothing}
        <dt>From</dt>
        <dd data-source>${sourceLine(secret, devices)}</dd>
        ${secret.usedAt ? html`<dt>Last used</dt><dd data-used>${since(secret.usedAt)}</dd>` : nothing}
        ${secret.expiresAt ? html`<dt>Expires</dt><dd data-expires>${until(secret.expiresAt)}</dd>` : nothing}
        ${secret.removedAt ? html`<dt>Removed</dt><dd>${since(secret.removedAt)}</dd>` : nothing}
      </dl>
      ${form?.kind === 'replace' && form.name === secret.name ? this.#valueForm(vault, form, locked) : nothing}
    </li>`;
  }

  #secrets(
    vault: VaultPort,
    list: VaultList,
    entries: readonly AuditEntry[],
    devices: readonly LinkedDevice[],
    locked: boolean
  ): TemplateResult {
    const more = this.more ?? list.auditMore;
    const row = (secret: SecretView) => this.#secret(vault, secret, entries, devices, more, locked);
    const sorted = [...list.secrets].sort(byName);
    const live = sorted.filter((secret) => secret.state !== 'removed');
    const removed = sorted.filter((secret) => secret.state === 'removed');
    return html`${live.length ? html`<ul class="secrets" aria-labelledby="secrets">${live.map(row)}</ul>` : nothing}
      ${
        removed.length
          ? html`<details class="removed" data-removed>
              <summary>Removed (${removed.length})</summary>
              <ul class="secrets">${removed.map(row)}</ul>
            </details>`
          : nothing
      }`;
  }

  #refused(refused: readonly RefusedRule[]): TemplateResult | typeof nothing {
    if (!refused.length) return nothing;
    return html`<h3 id="secrets-refused">Rules SLICC refused</h3>
      <ul class="refused" aria-labelledby="secrets-refused" data-refused>
        ${refused.map((item) => html`<li data-refused-secret=${item.secret}><span><code>${item.secret}</code> to ${ruleLine(item.rule)}</span><span class="muted">${item.reason}</span></li>`)}
      </ul>`;
  }

  #entry(entry: AuditEntry, devices: readonly LinkedDevice[]): TemplateResult {
    const date = new Date(entry.at);
    const name = entry.type === 'policy' ? null : entry.name;
    return html`<li data-seq=${entry.seq} data-type=${entry.type}>
      <time datetime=${date.toISOString()} title=${date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}>${since(entry.at)}</time>
      <span class="what">${name ? html`<code>${name}</code> · ` : nothing}${auditLine(entry, devices)}${entry.type === 'policy' || entry.type === 'refresh' ? nothing : html` <span class="by">by ${who(entry)}</span>`}</span>
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
          : html`<p class="muted" data-audit-empty>${this.reveals ? (more ? 'No reveals in the activity loaded so far.' : 'No program has been given a secret.') : 'Nothing has used a secret yet.'}</p>`
      }
      ${
        more
          ? html`<div class="row"><swc-button size="s" variant="secondary" fill-style="outline" data-action="older" ?pending=${this.loading} @click=${() => this.showOlder(vault, entries)}>Show older</swc-button></div>`
          : nothing
      }`;
  }

  #feedback(): TemplateResult | typeof nothing {
    const said = this.said;
    if (this.popup?.state === 'blocked')
      return html`<div class="error" role="alert" data-popup="blocked"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>The browser blocked the vault window. Allow pop-ups for this site, then try again.</span></div>`;
    if (!said) return nothing;
    if (said.kind === 'saved')
      return html`<p role="status" data-said="saved">Saved <code>${said.name}</code> in the vault</p>`;
    if (said.kind === 'imported')
      return html`<div role="status" data-said="imported"><p>Imported ${said.imported}</p>${said.skipped.map((item) => html`<p class="skipped" data-skipped=${item.name}>Skipped <code>${item.name}</code>${item.reason ? html`: <span class="said">${item.reason}</span>` : nothing}</p>`)}</div>`;
    return html`<p role="status" data-said="exported">Exported to <code>${said.file}</code></p>`;
  }

  #availability(): TemplateResult | typeof nothing {
    if (this.#offline)
      return html`<p class="availability" role="status" data-availability="waiting"><swc-progress-circle size="s" indeterminate label="Waiting for the vault" aria-hidden="true"></swc-progress-circle><span>Waiting for the vault</span></p>`;
    return nothing;
  }

  #backup(vault: VaultPort, status: VaultStatus | null): TemplateResult | typeof nothing {
    if (status?.backupReminder !== 'due' || this.#offline) return nothing;
    return html`<div class="box info" role="region" aria-labelledby="secrets-backup" data-backup>
      <span class="title" id="secrets-backup"><swc-icon-info-circle size="s" aria-hidden="true"></swc-icon-info-circle><span>Export a backup of your secrets. Clearing this site's data loses every value.</span></span>
      <div class="actions">
        ${vault.export ? html`<swc-button size="m" variant="accent" data-action="export" @click=${() => this.open({ kind: 'export' })}>Export backup</swc-button>` : nothing}
        ${vault.dismissBackupReminder ? html`<swc-button size="m" variant="secondary" fill-style="outline" data-action="dismiss-backup" ?pending=${this.acting.has('backup')} @click=${() => this.dismissBackup(vault)}>Not now</swc-button>` : nothing}
      </div>
    </div>`;
  }

  #header(vault: VaultPort, status: VaultStatus | null): TemplateResult | typeof nothing {
    if (!status) return nothing;
    if (this.#offline)
      return html`<swc-status-light size="m" variant="neutral">Waiting</swc-status-light>`;
    return html`<swc-status-light size="m" variant=${status.locked ? 'notice' : 'positive'}>${status.locked ? 'Locked' : 'Unlocked'}</swc-status-light><span class="muted">${lockModes[status.lock]}</span>
      <span class="controls">${
        status.locked
          ? html`${status.scrub?.needed && !status.scrub.ready ? html`<span class="availability" role="status" data-availability="unlock"><swc-icon-info-circle size="s" aria-hidden="true"></swc-icon-info-circle><span>Unlock the vault to continue</span></span>` : nothing}${this.#button({ intent: { kind: 'unlock' }, label: 'Unlock', variant: 'accent' }, 'unlock')}`
          : html`${vault.lock ? html`<swc-button size="m" variant="secondary" fill-style="outline" data-action="lock" ?pending=${this.acting.has('lock')} @click=${() => this.lockVault(vault)}>Lock</swc-button>` : nothing}
            ${this.#button({ intent: { kind: 'protect' }, label: status.lock === 'auto' ? 'Protect with a passkey' : 'Change protection' }, 'protect')}`
      }</span>`;
  }

  #tools(vault: VaultPort, locked: boolean): TemplateResult | typeof nothing {
    if (this.#offline) return nothing;
    const form = this.form;
    const tool = (kind: SecretForm['kind'], label: string, variant = 'secondary') =>
      html`<swc-button size="m" variant=${variant} data-action=${kind === 'add' ? 'add-secret' : kind} aria-expanded=${form?.kind === kind ? 'true' : 'false'} @click=${() => this.open(form?.kind === kind ? null : ({ kind } as SecretForm))}>${label}</swc-button>`;
    return html`${
      vault.put || vault.import || vault.export
        ? html`<div class="row" data-tools>
            ${vault.put ? tool('add', 'Add secret', 'accent') : nothing}
            ${vault.import ? tool('import', 'Import…') : nothing}
            ${vault.export ? tool('export', 'Export…') : nothing}
          </div>`
        : nothing
    }
      ${form?.kind === 'add' ? this.#valueForm(vault, form, locked) : nothing}
      ${form?.kind === 'import' ? this.#importForm(vault, locked) : nothing}
      ${form?.kind === 'export' ? this.#exportForm(vault, locked) : nothing}`;
  }

  render(): TemplateResult | typeof nothing {
    const vault = this.model?.vault;
    if (!vault) return nothing;
    const status: VaultStatus | null = vault.status();
    const current = vault.list();
    const devices = devicesOf(this.model);
    const entries = merged(current?.audit ?? [], this.older);
    const locked = !!status?.locked;
    this.#offline = away(vault);
    if (this.#offline && this.form) clearValues(this.renderRoot);
    const now = Date.now();
    const waiting = (status?.waiting ?? []).filter((request) => request.expiresAt > now);
    return html`<section aria-labelledby="secrets" data-vault=${status ? (status.locked ? 'locked' : 'unlocked') : 'loading'}>
      <div class="head">
        <h2 id="secrets">Secrets</h2>
        ${this.#header(vault, status)}
      </div>
      <p class="muted">Agents and programs use secrets by name. SLICC sends each value only where its rules allow, so agents never see it.</p>
      ${this.#availability()}
      ${this.#feedback()}
      ${this.failure ? this.#error(this.failure, 'vault') : nothing}
      ${waiting.length ? html`<h3>Waiting for you</h3>${waiting.map((request) => this.#request(vault, request))}` : nothing}
      ${this.#backup(vault, status)}
      ${this.#tools(vault, locked)}
      ${
        !current
          ? this.#offline
            ? nothing
            : html`<p class="muted" data-loading>Loading secrets…</p>`
          : current.secrets.length
            ? this.#secrets(vault, current, entries, devices, locked)
            : html`<p data-empty>No secrets yet. Add one here, or enter the value when an agent or program asks for one.</p>`
      }
      ${this.#refused(current?.refused ?? [])}
      <p class="muted" data-policy>Rules live in <code>/etc/fnox/config.toml</code> and <code>/etc/slicc/secrets-policy.toml</code>. Change them with sudo; SLICC asks you before every change.</p>
      ${current ? this.#audit(vault, current, entries, devices) : nothing}
    </section>`;
  }
}
