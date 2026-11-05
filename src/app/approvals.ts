import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type {
  Approval,
  ApprovalDecision,
  ApprovalEnd,
  ApprovalLevel,
  ApprovalsPort,
  GuestMessageApproval,
  GuestToolApproval,
  SliccModel,
  SudoApproval,
  TrayApproval,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { Cuts, clampCss, Ends, fullCommand, toScroll, toShow } from './command.ts';
import { commandText } from './command-display.ts';
import { dialogStyles, focused } from './confirm.ts';
import { size } from './messages.ts';

export { deadline } from './messages.ts';

export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function asking(approval: SudoApproval): string {
  const { kind, name, where } = approval.requester;
  const place = where ? ` in ${where}` : '';
  return kind === 'user'
    ? `You ran this with sudo${place} (as ${name})`
    : `${name} wants to run this with sudo${place}`;
}

export function sudo(approval: SudoApproval): string {
  const as = approval.target && approval.target !== 'root' ? `-u ${approval.target} ` : '';
  return `sudo ${as}${approval.command}`;
}

function origin(): HTMLElement | null {
  const active = focused();
  return (active?.closest('slicc-terminal') as HTMLElement | null) ?? active;
}

const inCwd = (approval: Approval): boolean =>
  approval.kind === 'sudo' && approval.alwaysScope === 'cwd' && !!approval.cwd;

export function alwaysHint(approval: SudoApproval): string {
  return inCwd(approval)
    ? `Always allow lets ${approval.requester.name} run exactly this command with sudo, in ${approval.cwd}, without asking again.`
    : `Always allow lets ${approval.requester.name} run exactly this command with sudo without asking again.`;
}

export function guestAlwaysHint(approval: GuestMessageApproval | GuestToolApproval): string {
  const agent = approval.agentName ?? 'this cone';
  return approval.kind === 'guest-message'
    ? `Always allow lets ${approval.requester.name} send messages to ${agent} without asking again.`
    : `Always allow lets ${agent} run exactly this ${approval.tool} call for ${approval.requester.name} without asking again.`;
}

export function guestAsking(approval: GuestMessageApproval | GuestToolApproval): string {
  return approval.kind === 'guest-message'
    ? `${approval.requester.name} wants to send this to ${approval.agentName ?? 'this cone'}:`
    : `${approval.agentName ?? 'This cone'} wants to run ${approval.tool} for ${approval.requester.name}:`;
}

export function trayTitle(approval: TrayApproval): string {
  if (approval.op === 'url') return 'Share this seven’s join URL?';
  if (approval.op === 'rotate') return 'Make a new join URL?';
  return approval.device ? `Unlink ${approval.device.name}?` : 'Unlink a device?';
}

export function trayAsking(approval: TrayApproval): string {
  const { name } = approval.requester;
  if (approval.op === 'url')
    return `${name} wants this seven’s join URL. Anyone with it can ask to link to this seven.`;
  if (approval.op === 'rotate')
    return `${name} wants a new join URL. Linked devices move to it, and the old one stops working.`;
  return `${name} wants to unlink ${approval.device?.name ?? 'a device'} from this seven.`;
}

export function approved(approval: Approval): string {
  if (approval.kind === 'sudo') return sudo(approval);
  if (approval.kind === 'guest-message' || approval.kind === 'tray') return '';
  if (approval.summary.trim()) return approval.summary;
  return approval.args?.trim() ? `${approval.tool}\n${approval.args}` : '';
}

export function truncated(approval: Approval): boolean {
  return approval.kind === 'guest-tool' && !approval.summary.trim() && !!approval.argsTruncated;
}

function hintOf(approval: Approval): string | Array<string | TemplateResult> {
  return approval.kind === 'sudo'
    ? commandText(alwaysHint(approval), false)
    : guestAlwaysHint(approval as GuestMessageApproval | GuestToolApproval);
}

const tooLong = 'This request is too long to show in full, so it can’t be allowed.';

export function guestWaiting(approval: GuestMessageApproval | GuestToolApproval): string {
  return approval.kind === 'guest-message'
    ? `${approval.requester.name}'s message to ${approval.agentName ?? 'this cone'} waits for the owner's approval.`
    : `${approval.agentName ?? 'This cone'} wants to run ${approval.tool} for ${approval.requester.name}, which waits for the owner's approval.`;
}

const levels: Record<ApprovalLevel, { name: string; label: string }> = {
  1: { name: 'routine', label: 'Routine.' },
  2: { name: 'permissions', label: 'Changes permissions.' },
  3: { name: 'harm', label: 'Could harm the system.' },
};

type Judged = GuestMessageApproval | GuestToolApproval | SudoApproval;

const fits = (aligned: boolean | undefined): string =>
  aligned === undefined
    ? ''
    : aligned
      ? ' It fits what you asked for.'
      : ' It isn’t clear it serves what you asked for.';

function leveled(approval: Judged): ApprovalLevel | null {
  const level = approval.verdict?.level;
  return level === 1 || level === 2 || level === 3 ? level : null;
}

export function offersAlways(approval: Approval): boolean {
  return (
    approval.kind !== 'tray' &&
    approval.always &&
    (approval.kind !== 'sudo' || leveled(approval) !== null)
  );
}

export function verdictNote(approval: Judged): string {
  if (approval.kind !== 'sudo' || offersAlways(approval)) return '';
  const level = leveled(approval);
  if (level === 2) return 'Always allow isn’t offered for permission changes.';
  if (!level && !approval.judging && !approval.verdict && approval.verdictError)
    return 'Always allow appears only with a level 1 verdict.';
  return '';
}

const shown = (text: string): Array<string | TemplateResult> => {
  const chars = Array.from(text);
  return commandText(chars.length > 300 ? `${chars.slice(0, 299).join('')}…` : text, false);
};

function judged(approval: Judged): TemplateResult | typeof nothing {
  const { verdict, judging, verdictError } = approval;
  const level = leveled(approval);
  if (verdict && level) {
    const { name, label } = levels[level];
    return html`<div class="judged" data-verdict=${name} data-level=${level}>${level === 3 ? html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>` : nothing}<p><strong>${label}</strong>${verdict.reason ? html` ${shown(verdict.reason)}` : ''}${fits(verdict.aligned)}</p></div>`;
  }
  if (judging) return html`<div class="judged" data-verdict="checking"><p>Checking…</p></div>`;
  if (verdict?.decision)
    return html`<p class="verdict" data-verdict=${verdict.decision}>${verdict.decision === 'unsure' ? 'The automatic check wasn’t sure' : `The automatic check would ${verdict.decision} this`}: ${shown(verdict.reason)}</p>`;
  if (verdictError)
    return html`<div class="judged" data-verdict="none"><p><strong>No verdict:</strong> ${shown(verdictError)}</p></div>`;
  return nothing;
}

export function waiting(model: SliccModel | null, now: number): Approval[] {
  return [...(model?.approvals?.list() ?? [])]
    .filter((approval) => approval.expiresAt > now && Object.hasOwn(titles, approval.kind))
    .sort((a, b) => a.createdAt - b.createdAt);
}

const titles: Record<Approval['kind'], Record<'ask' | 'elsewhere' | 'expired', string>> = {
  sudo: {
    ask: 'Allow sudo?',
    elsewhere: 'Answered in another tab',
    expired: 'Sudo request timed out',
  },
  'guest-message': {
    ask: 'Allow a guest’s message?',
    elsewhere: 'Answered elsewhere',
    expired: 'Guest message timed out',
  },
  'guest-tool': {
    ask: 'Allow a guest’s tool call?',
    elsewhere: 'Answered elsewhere',
    expired: 'Guest tool call timed out',
  },
  tray: {
    ask: '',
    elsewhere: 'Answered in another tab',
    expired: 'Tray request timed out',
  },
};

function title(approval: Approval): string {
  return approval.kind === 'tray' ? trayTitle(approval) : titles[approval.kind].ask;
}

function gone(reason: ApprovalEnd): 'elsewhere' | 'expired' {
  return reason === 'expired' ? 'expired' : 'elsewhere';
}

export class SliccApprovals extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    now: { state: true },
    busy: { state: true },
    failure: { state: true },
    gone: { state: true },
  };
  declare now: number;
  declare busy: ApprovalDecision | '';
  declare failure: { id: string; message: string } | null;
  declare gone: { approval: Approval; reason: 'elsewhere' | 'expired' } | null;
  arming = 500;
  #armed = false;
  #arming: ReturnType<typeof setTimeout> | undefined;
  #showing: Approval | null = null;
  #pending = new Set<string>();
  #done = new Set<string>();
  #closed = new Set<string>();
  #port: ApprovalsPort | undefined;
  #ended = new Map<string, ApprovalEnd>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #shown = '';
  #trigger: HTMLElement | null = null;
  #full = new Set<string>();
  #cuts = new Cuts(
    () => this.renderRoot,
    () => this.requestUpdate()
  );
  #ends = new Ends(
    () => this.renderRoot,
    () => this.requestUpdate()
  );

  constructor() {
    super();
    this.now = Date.now();
    this.busy = '';
    this.failure = null;
    this.gone = null;
  }

  static styles = [
    dialogStyles,
    clampCss,
    css`
      :host {
        display: contents;
      }
      sp-alert-dialog {
        display: grid;
        --mod-alert-dialog-min-width: min(
          var(--swc-alert-dialog-maximum-width),
          calc(100vw - 2 * var(--swc-spacing-300))
        );
      }
      .command {
        margin: var(--swc-spacing-200) 0 0;
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-gray-100);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-100);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .control {
        display: inline-flex;
        align-items: baseline;
        gap: var(--swc-spacing-50);
        padding-inline: var(--swc-spacing-50);
        border-radius: var(--swc-corner-radius-75);
        background: var(--swc-gray-300);
        color: var(--swc-gray-900);
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
      }
      .control[data-label]:not([data-label=''])::after {
        content: attr(data-label);
      }
      .command .lines:not([data-clamp]) {
        display: block;
        max-block-size: min(16lh, 50dvh);
        overflow: auto;
        overscroll-behavior: contain;
      }
      .command .end {
        display: inline-block;
        inline-size: 0;
        block-size: 0;
      }
      .full-command {
        margin-block-start: var(--swc-spacing-100);
      }
      .guest {
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border: var(--swc-border-width-100) solid var(--swc-gray-300);
        border-radius: var(--swc-corner-radius-medium-default);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-block-size: 12lh;
        overflow: auto;
      }
      .files {
        margin: var(--swc-spacing-200) 0 0;
        padding-inline-start: var(--swc-spacing-400);
        font-size: var(--swc-font-size-75);
        overflow-wrap: anywhere;
      }
      .cwd,
      .verdict,
      .hint,
      .timer,
      .more {
        margin-block-start: var(--swc-spacing-100);
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .cwd {
        overflow-wrap: anywhere;
      }
      .timer {
        margin-block-start: var(--swc-spacing-300);
        font-variant-numeric: tabular-nums;
      }
      .judged {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-neutral-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
        font-size: var(--swc-font-size-75);
        overflow-wrap: anywhere;
      }
      .judged[data-verdict='checking'],
      .judged[data-verdict='none'] {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .judged[data-level='1'] {
        background: var(--swc-positive-subtle-background-color-default);
      }
      .judged[data-level='2'] {
        background: var(--swc-notice-subtle-background-color-default);
      }
      .judged[data-level='3'] {
        background: var(--swc-negative-subtle-background-color-default);
        --swc-icon-color: var(--swc-icon-color-negative);
      }
      .judged swc-icon-alert-triangle {
        flex: none;
        margin-block-start: 0.15em;
      }
      .judged p {
        margin: 0;
      }
      .problem {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin-block-start: var(--swc-spacing-200);
        color: var(--swc-negative-content-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.approvals;
    if (port !== this.#port) {
      this.#port = port;
      this.#showing = null;
      this.gone = null;
      this.busy = '';
      this.failure = null;
      this.#pending.clear();
      this.#done.clear();
      this.#closed.clear();
      this.#ended.clear();
      this.#full.clear();
      this.#ends.clear();
    }
    if (!port) return [];
    return [
      port.on('approvals', () => {
        this.now = Date.now();
        this.requestUpdate();
      }),
      port.on('ended', ({ id, reason }) => {
        this.#ended.set(id, reason);
        if (this.gone?.approval.id === id) {
          this.gone = reason === 'withdrawn' ? null : { ...this.gone, reason: gone(reason) };
          if (!this.gone) this.#showing = null;
        }
        this.requestUpdate();
      }),
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#tick(false);
    clearTimeout(this.#arming);
    this.#showing = null;
    this.#cuts.disconnect();
    this.#ends.disconnect();
  }

  #tick(on: boolean): void {
    if (on && !this.#timer) this.#timer = setInterval(() => (this.now = Date.now()), 1000);
    if (!on && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async decide(approval: Approval, decision: ApprovalDecision): Promise<void> {
    const port = this.model?.approvals;
    if (
      !port?.decide ||
      this.busy ||
      (decision !== 'deny' && (!this.#armed || !this.#whole(approval)))
    )
      return;
    const live = port.list().find(({ id }) => id === approval.id);
    if (decision === 'always' && !(live && offersAlways(live))) return;
    this.busy = decision;
    this.failure = null;
    this.#pending.add(approval.id);
    try {
      await port.decide(approval.id, decision);
      this.#done.add(approval.id);
    } catch (error) {
      this.failure = {
        id: approval.id,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.#pending.delete(approval.id);
      this.busy = '';
    }
  }

  #current(): Approval[] {
    return this.model?.approvals?.decide
      ? waiting(this.model, this.now).filter(({ id }) => !this.#closed.has(id))
      : [];
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const list = this.#current();
    const showing = this.#showing;
    if (showing && this.#pending.has(showing.id)) return;
    if (
      showing &&
      !this.gone &&
      !this.#done.has(showing.id) &&
      !list.some((approval) => approval.id === showing.id)
    ) {
      const reason =
        this.#ended.get(showing.id) ?? (showing.expiresAt <= this.now ? 'expired' : 'answered');
      if (reason !== 'withdrawn') this.gone = { approval: showing, reason: gone(reason) };
    }
    if (this.gone) return;
    const next = list[0] ?? null;
    if (next?.id === showing?.id) return;
    this.#showing = next;
    clearTimeout(this.#arming);
    this.#armed = false;
    this.#arming = setTimeout(() => (this.#armed = true), this.arming);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const all = this.model?.approvals?.list() ?? [];
    this.#tick(this.isConnected && all.length > 0);
    this.#cuts.measure();
    this.#ends.observe();
    const dialog = this.renderRoot.querySelector('dialog');
    const key = dialog
      ? `${dialog.dataset.approval}:${dialog.dataset.gone ?? ''}:${dialog.hasAttribute('data-rejected')}`
      : '';
    if (key === this.#shown) return;
    if (dialog && !this.#shown) this.#trigger = origin();
    this.#shown = key;
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    this.#cuts.measure();
    this.#ends.observe();
    const first = dialog.querySelector('[data-action=deny], [data-action=close]') as LitElement;
    void first.updateComplete.then(() => first.focus());
  }

  close(): void {
    this.gone = null;
    this.#showing = null;
  }

  #dismiss(approval: Approval): void {
    this.#done.add(approval.id);
    this.#closed.add(approval.id);
    this.failure = null;
  }

  #cancel(event: Event, approval: Approval): void {
    event.preventDefault();
    if (this.gone) this.close();
    else if (this.failure?.id === approval.id) this.#dismiss(approval);
    else void this.decide(approval, 'deny');
  }

  #button(
    approval: Approval,
    decision: ApprovalDecision,
    label: string,
    variant: string
  ): TemplateResult {
    return html`<swc-button
      slot="button"
      variant=${variant}
      fill-style=${variant === 'accent' ? nothing : 'outline'}
      data-action=${decision}
      ?pending=${this.busy === decision}
      ?disabled=${!!this.busy && this.busy !== decision}
      @click=${() => this.decide(approval, decision)}
      >${label}</swc-button
    >`;
  }

  #dialog(approval: Approval, key: string, content: TemplateResult): unknown {
    return keyed(
      key,
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asking" data-approval=${approval.id} data-kind=${approval.kind} data-requester=${approval.requester.kind} data-gone=${this.gone?.reason ?? nothing} data-rejected=${!this.gone && this.failure?.id === approval.id ? '' : nothing} @cancel=${(event: Event) => this.#cancel(event, approval)}>${content}</dialog>`
    );
  }

  #whole(approval: Approval): boolean {
    const { id } = approval;
    if (truncated(approval)) return false;
    return (
      !approved(approval) ||
      this.#cuts.get(id) === false ||
      (this.#full.has(id) && this.#ends.has(id))
    );
  }

  #gate(approval: Approval): string {
    if (truncated(approval)) return tooLong;
    if (this.#whole(approval)) return '';
    return this.#full.has(approval.id) ? toScroll : toShow;
  }

  #expand(id: string): void {
    if (!this.#full.delete(id)) this.#full.add(id);
    this.requestUpdate();
  }

  #command(approval: Approval, pending: boolean): TemplateResult {
    const { id } = approval;
    const text = approved(approval);
    if (!text) return html`<p class="hint" data-id="no-details">This request has no details.</p>`;
    const full = !pending || this.#full.has(id);
    const toggle =
      pending && (full || this.#cuts.get(id)) ? fullCommand(full, () => this.#expand(id)) : nothing;
    return html`<pre class="command" data-command=${approval.kind === 'sudo' ? '' : nothing} data-summary=${approval.kind === 'sudo' ? nothing : ''}><span class="lines" data-clamp=${full ? nothing : id}>${approval.kind === 'sudo' ? commandText(text) : text}${pending ? html`<span class="end" data-end=${id}></span>` : nothing}</span></pre>${toggle}`;
  }

  #request(approval: Approval, pending = false): TemplateResult {
    if (approval.kind === 'tray') return html`<p id="asking">${trayAsking(approval)}</p>`;
    if (approval.kind === 'sudo')
      return html`<p id="asking">${commandText(asking(approval), false)}:</p>
        ${this.#command(approval, pending)}`;
    if (approval.kind === 'guest-tool')
      return html`<p id="asking">${guestAsking(approval)}</p>
        ${this.#command(approval, pending)}`;
    const files = approval.attachments ?? [];
    return html`<p id="asking">${guestAsking(approval)}</p>
      <div class="guest" data-guest-text>${approval.text}</div>
      ${files.length ? html`<ul class="files" data-attachments>${files.map((file) => html`<li>${file.name} · ${file.mimeType} · ${size(file.size)}</li>`)}</ul>` : nothing}`;
  }

  #verdict(approval: Approval): TemplateResult | typeof nothing {
    if (approval.kind === 'tray') return nothing;
    const note = verdictNote(approval);
    return html`<div class="judge" aria-live="polite">${judged(approval)}${note ? html`<p class="hint" data-verdict-note>${note}</p>` : nothing}</div>`;
  }

  #actions(approval: Approval, rejected: boolean, always: boolean): TemplateResult {
    if (rejected)
      return html`<swc-button slot="button" variant="secondary" fill-style="outline" data-action="close" @click=${() => this.#dismiss(approval)}>Close</swc-button>`;
    const whole = this.#whole(approval);
    return html`${this.#button(approval, 'deny', 'Deny', 'secondary')}
      ${whole && always ? this.#button(approval, 'always', inCwd(approval) ? 'Always allow in this directory' : 'Always allow', 'secondary') : nothing}
      ${whole ? this.#button(approval, 'once', 'Allow once', 'accent') : nothing}`;
  }

  render(): unknown {
    if (this.gone) {
      const { approval, reason } = this.gone;
      return this.#dialog(
        approval,
        `gone:${approval.id}`,
        html`<sp-alert-dialog variant="information" data-approval-kind=${approval.kind}>
          <h2 id="title" slot="heading">${titles[approval.kind][reason]}</h2>
          ${this.#request(approval)}
          ${reason === 'expired' ? html`<p class="timer" data-timer>Denied because nobody answered in time.</p>` : nothing}
          <swc-button slot="button" variant="secondary" fill-style="outline" data-action="close" @click=${() => this.close()}>Close</swc-button>
        </sp-alert-dialog>`
      );
    }
    const held = this.#showing && this.#pending.has(this.#showing.id) ? this.#showing : null;
    const list = this.#current();
    const [approval, ...rest] = held ? [held, ...list.filter(({ id }) => id !== held.id)] : list;
    if (!approval) return nothing;
    const failure = this.failure?.id === approval.id ? this.failure.message : '';
    const always = offersAlways(approval);
    const gate = this.#gate(approval);
    const hint = always && this.#whole(approval) ? hintOf(approval) : '';
    return this.#dialog(
      approval,
      approval.id,
      html`<sp-alert-dialog variant="warning" data-approval-kind=${approval.kind}>
          <h2 id="title" slot="heading">${title(approval)}</h2>
          ${this.#request(approval, true)}
          ${approval.kind === 'sudo' && approval.cwd ? html`<p class="cwd">In ${commandText(approval.cwd, false)}</p>` : nothing}
          ${this.#verdict(approval)}
          ${hint ? html`<p class="hint">${hint}</p>` : nothing}
          ${!failure && gate ? html`<p class="hint" data-allow-hint>${gate}</p>` : nothing}
          ${failure ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${failure}</span></p>` : html`<p class="timer" data-timer>Denied automatically in ${countdown(approval.expiresAt - this.now)}.</p>`}
          ${rest.length ? html`<p class="more" data-more>${rest.length === 1 ? '1 more request is waiting.' : `${rest.length} more requests are waiting.`}</p>` : nothing}
          ${this.#actions(approval, !!failure, always)}
        </sp-alert-dialog>`
    );
  }
}
