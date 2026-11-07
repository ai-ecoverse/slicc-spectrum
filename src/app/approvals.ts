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
  CaptureApproval,
  CaptureDetail,
  ClickApproval,
  GuestMessageApproval,
  GuestToolApproval,
  SecretApproval,
  SliccModel,
  SudoApproval,
  TrayApproval,
  ValueConfig,
} from '../model/types.ts';
import { ModelElement, resolveColor } from './base.ts';
import { Ends, toScroll } from './command.ts';
import { commandText, controlStyles } from './command-display.ts';
import { dialogStyles, focused } from './confirm.ts';
import { size } from './messages.ts';
import { prompt } from './secrets.ts';
import { shellWord, type ValueDetail } from './vault.ts';

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

const captureActs: Record<string, [string, string]> = {
  'screen:still': ['take a picture of your screen', 'take pictures of your screen'],
  'screen:video': ['record your screen', 'record your screen'],
  'camera:still': ['take a photo with your camera', 'take photos with your camera'],
  'camera:video': ['record your camera', 'record your camera'],
  'microphone:audio': ['record your microphone', 'record your microphone'],
};

function captureAct(detail: CaptureDetail): [string, string] {
  const fallback = `capture your ${detail.what}`;
  return captureActs[`${detail.what}:${detail.mode}`] ?? [fallback, fallback];
}

export function captureLine(approval: CaptureApproval): string {
  const { detail } = approval;
  const [act] = captureAct(detail);
  const device = detail.device ? ` (${detail.device})` : '';
  const still = detail.mode === 'still';
  const span = detail.seconds
    ? ` for up to ${detail.seconds} ${detail.seconds === 1 ? 'second' : 'seconds'}`
    : ' until it’s stopped';
  const audio = [
    detail.system ? 'system audio' : '',
    detail.microphone && detail.what !== 'microphone' ? 'microphone' : '',
  ].filter(Boolean);
  const extra = still || !audio.length ? '' : `, with your ${audio.join(' and ')}`;
  const line = `${act}${device}${still ? '' : span}${extra}`;
  return `${line[0].toUpperCase()}${line.slice(1)} · ${detail.program}`;
}

export function captureAsking(approval: CaptureApproval): string {
  return `${approval.agentName ?? 'This cone'} wants to use your ${approval.detail.what} for ${approval.requester.name}:`;
}

export function captureWaiting(approval: CaptureApproval): string {
  return `${approval.agentName ?? 'This cone'} wants to use your ${approval.detail.what} for ${approval.requester.name}, which waits for the owner's approval.`;
}

export function captureAlwaysHint(approval: CaptureApproval): string {
  const [, acts] = captureAct(approval.detail);
  const picker =
    approval.detail.what === 'screen' ? ' You still choose what to share each time.' : '';
  return `Always allow lets ${approval.agentName ?? 'this cone'} ${acts} for ${approval.requester.name} without asking again.${picker}`;
}

export function clickWhere(approval: ClickApproval): string {
  return approval.device
    ? `Click in seven’s tab on ${approval.device.name}.`
    : 'Click in seven’s tab.';
}

export function secretTitle(approval: SecretApproval): string {
  return approval.mode === 'reveal'
    ? `Reveal ${approval.name} to a program?`
    : `Enter a value for ${approval.name}?`;
}

export function secretAsking(approval: SecretApproval): string {
  const { kind, name, where } = approval.requester;
  const place = where ? ` in ${where}` : '';
  return kind === 'user' ? `You ran this${place} (as ${name})` : `${name} ran this${place}`;
}

export function processLine(approval: SecretApproval): string {
  const { exe, argv } = approval.process;
  return [exe, ...argv.slice(1)].map(shellWord).join(' ');
}

export function revealWarning(approval: SecretApproval): string {
  const asked = approval.requester.kind === 'agent' ? ' The agent asked for this.' : '';
  return `${approval.process.exe} gets the plaintext. It can send it anywhere.${asked}`;
}

export function secretWaiting(approval: SecretApproval): string {
  const { kind, name } = approval.requester;
  const who = kind === 'user' ? 'You ran' : `${name} ran`;
  const what =
    approval.mode === 'reveal'
      ? `the plaintext of ${approval.name}`
      : `a value for ${approval.name}`;
  return `${who} ${approval.process.exe}, which asks for ${what}.`;
}

export function approved(approval: Approval): string {
  if (approval.kind === 'sudo') return sudo(approval);
  if (approval.kind === 'secret') return processLine(approval);
  if (
    approval.kind === 'guest-message' ||
    approval.kind === 'tray' ||
    approval.kind === 'click' ||
    approval.kind === 'capture'
  )
    return '';
  if (approval.summary.trim()) return approval.summary;
  return approval.args?.trim() ? `${approval.tool}\n${approval.args}` : '';
}

export function truncated(approval: Approval): boolean {
  return approval.kind === 'guest-tool' && !approval.summary.trim() && !!approval.argsTruncated;
}

function hintOf(approval: Approval): string | Array<string | TemplateResult> {
  if (approval.kind === 'capture') return captureAlwaysHint(approval);
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

type Judged = GuestMessageApproval | GuestToolApproval | SudoApproval | CaptureApproval;

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
    approval.kind !== 'secret' &&
    approval.kind !== 'click' &&
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
  secret: {
    ask: '',
    elsewhere: 'Answered elsewhere',
    expired: 'Secret request timed out',
  },
  click: {
    ask: '',
    elsewhere: 'Answered elsewhere',
    expired: 'Click request timed out',
  },
  capture: {
    ask: 'Allow a guest’s capture?',
    elsewhere: 'Answered elsewhere',
    expired: 'Capture request timed out',
  },
};

export const approvalKinds: readonly Approval['kind'][] = Object.freeze(
  Object.keys(titles) as Approval['kind'][]
);

function title(approval: Approval): string {
  if (approval.kind === 'tray') return trayTitle(approval);
  if (approval.kind === 'secret') return secretTitle(approval);
  if (approval.kind === 'click') return approval.title;
  return titles[approval.kind].ask;
}

const toAnswer = 'Scroll to the end of the command to answer it.';

function extras(approval: Approval): unknown[] {
  if (approval.kind === 'secret')
    return [
      approval.mode,
      approval.name,
      approval.reveal,
      approval.prompt ?? '',
      approval.requester,
    ];
  if (approval.kind === 'click')
    return [approval.title, approval.body, approval.action, approval.here, approval.device ?? null];
  if (approval.kind === 'capture') return [approval.detail, approval.requester];
  return [];
}

function answerable(approval: Approval, decision: ApprovalDecision): boolean {
  if (decision === 'deny') return true;
  if (approval.kind === 'secret') return false;
  return approval.kind !== 'click' || approval.here;
}

function identity(approval: Approval): string {
  const extra = extras(approval);
  return JSON.stringify([approval.kind, approval.createdAt, approved(approval), ...extra]);
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
    frameError: { state: true },
  };
  declare now: number;
  declare busy: ApprovalDecision | '';
  declare failure: { id: string; message: string } | null;
  declare gone: { approval: Approval; reason: 'elsewhere' | 'expired' } | null;
  declare frameError: { id: string; message: string } | null;
  arming = 500;
  #changed = 0;
  #pressed = 0;
  #layout = '';
  #moves = new ResizeObserver(() => this.#settle());
  #showing: Approval | null = null;
  #pending = new Set<string>();
  #done = new Set<string>();
  #closed = new Set<string>();
  #keys = new Map<string, string>();
  #generation = new Map<string, number>();
  #port: ApprovalsPort | undefined;
  #ended = new Map<string, ApprovalEnd>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #shown = '';
  #trigger: HTMLElement | null = null;
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
    this.frameError = null;
  }

  static styles = [
    dialogStyles,
    controlStyles,
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
      .where {
        margin-block-start: var(--swc-spacing-200);
        font-weight: var(--swc-bold-font-weight);
        overflow-wrap: anywhere;
      }
      .timer {
        margin-block-start: var(--swc-spacing-300);
        font-variant-numeric: tabular-nums;
      }
      .more {
        min-block-size: 1lh;
      }
      .notes {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        box-sizing: border-box;
        block-size: min(9lh, 30dvh);
        margin-block-start: var(--swc-spacing-200);
        font-size: var(--swc-font-size-75);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .notes .hint,
      .notes .verdict {
        margin: 0;
      }
      .judge {
        display: flex;
        flex: 1 0 auto;
        flex-direction: column;
        gap: var(--swc-spacing-100);
      }
      .judged {
        display: flex;
        flex: 1 0 auto;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-neutral-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
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
      [slot='button'][data-action='deny'] {
        margin-inline-end: auto;
      }
      .prompt {
        margin-block-start: var(--swc-spacing-200);
        padding-inline-start: var(--swc-spacing-200);
        border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
        overflow-wrap: anywhere;
        max-block-size: 8lh;
        overflow: auto;
      }
      .prompt .from {
        display: block;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .prompt .said {
        white-space: pre-wrap;
      }
      .reveal {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-negative-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
        overflow-wrap: anywhere;
        --swc-icon-color: var(--swc-icon-color-negative);
      }
      .reveal swc-icon-alert-triangle {
        flex: none;
        margin-block-start: 0.15em;
      }
      .reveal p {
        margin: 0;
      }
      .value {
        margin-block-start: var(--swc-spacing-300);
      }
      .value[inert] {
        opacity: 0.4;
      }
      .gate {
        min-block-size: 1lh;
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
      this.frameError = null;
      this.#pending.clear();
      this.#done.clear();
      this.#closed.clear();
      this.#ended.clear();
      this.#ends.clear();
      this.#keys.clear();
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
    this.#showing = null;
    this.#layout = '';
    this.#moves.disconnect();
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
    const { id } = approval;
    if (
      !port?.decide ||
      this.busy ||
      this.gone ||
      this.#showing?.id !== id ||
      this.#done.has(id) ||
      this.#closed.has(id) ||
      !answerable(approval, decision) ||
      (decision !== 'deny' && (!this.#settled(performance.now()) || !this.#whole(approval)))
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

  #track(): void {
    const keys = new Map<string, string>();
    for (const approval of this.model?.approvals?.list() ?? []) {
      if (!Object.hasOwn(titles, approval.kind)) continue;
      const { id } = approval;
      const key = identity(approval);
      keys.set(id, key);
      if (this.#keys.get(id) === key || this.#pending.has(id)) continue;
      this.#generation.set(id, (this.#generation.get(id) ?? 0) + 1);
      this.#done.delete(id);
      this.#closed.delete(id);
      this.#ended.delete(id);
      this.#ends.forget(id);
      if (this.frameError?.id === id) this.frameError = null;
      if (this.#showing?.id === id && !this.gone) this.#showing = null;
    }
    this.#keys = keys;
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.#track();
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
        this.#ended.get(showing.id) ??
        (showing.expiresAt <= this.now
          ? 'expired'
          : showing.kind === 'secret'
            ? 'withdrawn'
            : 'answered');
      if (reason !== 'withdrawn') this.gone = { approval: showing, reason: gone(reason) };
    }
    if (this.gone) return;
    const next = list[0] ?? null;
    if (next?.id === showing?.id) return;
    this.frameError = null;
    this.#showing = next;
    this.#changed = performance.now();
  }

  #settled(at: number): boolean {
    return at - this.#changed >= this.arming;
  }

  #settle(): void {
    const dialog = this.renderRoot.querySelector('dialog');
    const buttons = [...this.renderRoot.querySelectorAll<HTMLElement>('[slot=button]')];
    const layout = JSON.stringify([
      dialog?.dataset.approval,
      dialog?.dataset.gone,
      buttons.map((button) => {
        const { left, top, width, height } = button.getBoundingClientRect();
        return [
          button.dataset.action,
          button.textContent,
          button.hasAttribute('disabled'),
          button.hasAttribute('pending'),
          ...[left, top, width, height].map(Math.round),
        ];
      }),
    ]);
    if (layout === this.#layout) return;
    this.#layout = layout;
    this.#changed = performance.now();
  }

  #click(event: MouseEvent, approval: Approval, decision: ApprovalDecision): void {
    if (!this.#settled(event.detail ? this.#pressed : performance.now())) return;
    void this.decide(approval, decision);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const all = this.model?.approvals?.list() ?? [];
    this.#tick(this.isConnected && all.length > 0);
    this.#ends.observe();
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog)
      for (const box of dialog.querySelectorAll('sp-alert-dialog, [slot=button]'))
        this.#moves.observe(box);
    this.#settle();
    const key = dialog
      ? `${dialog.dataset.approval}:${this.#generation.get(dialog.dataset.approval as string)}:${dialog.dataset.gone ?? ''}:${dialog.hasAttribute('data-rejected')}`
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
    this.#ends.observe();
    this.#settle();
    const first = dialog.querySelector('[data-action=deny], [data-action=close]') as LitElement;
    void first.updateComplete.then(() => first.focus());
  }

  close(): void {
    this.gone = null;
    this.#showing = null;
  }

  #value(event: CustomEvent<ValueDetail>, approval: SecretApproval): void {
    const detail = event.detail;
    if (detail.event === 'escape') {
      void this.decide(approval, 'deny');
      return;
    }
    if (detail.event === 'error') {
      this.frameError = { id: approval.id, message: detail.message };
      return;
    }
    const { id } = approval;
    if (detail.request !== id || this.#pending.has(id) || this.#done.has(id)) return;
    if (detail.event === 'done' || detail.state === 'withdrawn') this.#dismiss(approval);
    else this.gone = { approval, reason: detail.state === 'expired' ? 'expired' : 'elsewhere' };
  }

  #config(): ValueConfig {
    const doc = this.ownerDocument;
    const dark = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const lang = doc.documentElement.lang;
    return {
      theme: resolveColor(this.model?.settings?.get().color ?? 'system', dark),
      dir: doc.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
      ...(lang ? { lang } : {}),
    };
  }

  #frame(approval: SecretApproval): TemplateResult {
    const vault = this.model?.vault;
    if (!vault?.valueFrame)
      return html`<p class="hint" data-id="no-frame">The vault isn’t available here, so this request can only be denied.</p>`;
    const hidden = this.#ends.hidden(approval.id);
    const problem = this.frameError?.id === approval.id ? this.frameError.message : '';
    return html`<div class="value" data-value-frame ?inert=${!this.#ends.has(approval.id)}><slicc-vault-value .vault=${vault} .request=${approval.id} .config=${this.#config()} @vault-value=${(event: CustomEvent<ValueDetail>) => this.#value(event, approval)}></slicc-vault-value></div>
      <p class="hint gate" data-allow-hint=${hidden ? '' : nothing}>${hidden ? toAnswer : ''}</p>
      ${problem ? html`<p class="problem" role="alert" data-frame-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${problem}</span></p>` : nothing}`;
  }

  #dismiss(approval: Approval): void {
    this.#done.add(approval.id);
    this.#closed.add(approval.id);
    this.failure = null;
    this.requestUpdate();
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
      ?disabled=${(!!this.busy && this.busy !== decision) || (decision !== 'deny' && !this.#whole(approval))}
      @click=${(event: MouseEvent) => this.#click(event, approval, decision)}
      >${label}</swc-button
    >`;
  }

  #dialog(approval: Approval, key: string, content: TemplateResult): unknown {
    return keyed(
      key,
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asking" data-approval=${approval.id} data-kind=${approval.kind} data-requester=${approval.requester.kind} data-gone=${this.gone?.reason ?? nothing} data-rejected=${!this.gone && this.failure?.id === approval.id ? '' : nothing} @pointerdown=${() => (this.#pressed = performance.now())} @cancel=${(event: Event) => this.#cancel(event, approval)}>${content}</dialog>`
    );
  }

  #whole(approval: Approval): boolean {
    if (truncated(approval)) return false;
    return !approved(approval) || this.#ends.has(approval.id);
  }

  #gate(approval: Approval): string {
    if (truncated(approval)) return tooLong;
    return this.#ends.hidden(approval.id) ? toScroll : '';
  }

  #command(approval: Approval, pending: boolean): TemplateResult {
    const { id } = approval;
    const text = approved(approval);
    if (!text) return html`<p class="hint" data-id="no-details">This request has no details.</p>`;
    const command = approval.kind === 'sudo' || approval.kind === 'secret';
    return html`<pre class="command" data-command=${command ? '' : nothing} data-summary=${command ? nothing : ''}><span class="lines">${command ? commandText(text) : text}${pending ? html`<span class="end" data-end=${id}></span>` : nothing}</span></pre>`;
  }

  #request(approval: Approval, pending = false): TemplateResult {
    if (approval.kind === 'tray') return html`<p id="asking">${trayAsking(approval)}</p>`;
    if (approval.kind === 'click')
      return html`<p id="asking">${commandText(approval.body, false)}</p>
        ${approval.here ? nothing : html`<p class="where" data-where>${commandText(clickWhere(approval), false)}</p>`}`;
    if (approval.kind === 'capture')
      return html`<p id="asking">${commandText(captureAsking(approval), false)}</p>
        <div class="guest" data-capture>${commandText(captureLine(approval), false)}</div>`;
    if (approval.kind === 'sudo')
      return html`<p id="asking">${commandText(asking(approval), false)}:</p>
        ${this.#command(approval, pending)}`;
    if (approval.kind === 'guest-tool')
      return html`<p id="asking">${guestAsking(approval)}</p>
        ${this.#command(approval, pending)}`;
    if (approval.kind === 'secret')
      return html`<p id="asking">${commandText(secretAsking(approval), false)}:</p>
        ${this.#command(approval, pending)}
        <p class="cwd">In ${commandText(approval.process.cwd, false)}</p>
        ${approval.prompt ? html`<div class="prompt" data-prompt><span class="from">From the agent, not checked by SLICC:</span><span class="said">${commandText(prompt(approval.prompt))}</span></div>` : nothing}
        ${approval.reveal ? html`<div class="reveal" data-reveal><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><p>${commandText(revealWarning(approval), false)}</p></div>` : nothing}`;
    const files = approval.attachments ?? [];
    return html`<p id="asking">${guestAsking(approval)}</p>
      <div class="guest" data-guest-text>${approval.text}</div>
      ${files.length ? html`<ul class="files" data-attachments>${files.map((file) => html`<li>${file.name} · ${file.mimeType} · ${size(file.size)}</li>`)}</ul>` : nothing}`;
  }

  #notes(approval: Approval, gate: string, always: boolean): TemplateResult | typeof nothing {
    if (approval.kind === 'tray' || approval.kind === 'secret' || approval.kind === 'click')
      return nothing;
    const note = verdictNote(approval);
    return html`<div class="notes" data-notes><div class="judge" aria-live="polite">${judged(approval)}${note ? html`<p class="hint" data-verdict-note>${note}</p>` : nothing}</div>${gate ? html`<p class="hint" data-allow-hint>${gate}</p>` : nothing}${always ? html`<p class="hint" data-always-hint>${hintOf(approval)}</p>` : nothing}</div>`;
  }

  #actions(approval: Approval, rejected: boolean, always: boolean): TemplateResult {
    if (rejected)
      return html`<swc-button slot="button" variant="secondary" fill-style="outline" data-action="close" @click=${() => this.#dismiss(approval)}>Close</swc-button>`;
    const click = approval.kind === 'click';
    return html`${this.#button(approval, 'deny', click ? 'Cancel' : 'Deny', 'secondary')}
      ${always ? this.#button(approval, 'always', inCwd(approval) ? 'Always allow in this directory' : 'Always allow', 'secondary') : nothing}
      ${answerable(approval, 'once') ? this.#button(approval, 'once', click ? approval.action : 'Allow once', 'accent') : nothing}`;
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
          ${reason === 'expired' ? html`<p class="timer" data-timer>${approval.kind === 'click' ? 'Cancelled because nobody clicked in time.' : 'Denied because nobody answered in time.'}</p>` : nothing}
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
    const gate = failure ? '' : this.#gate(approval);
    return this.#dialog(
      approval,
      `${approval.id}:${this.#generation.get(approval.id)}`,
      html`<sp-alert-dialog variant=${approval.kind === 'click' ? 'information' : 'warning'} data-approval-kind=${approval.kind}>
          <h2 id="title" slot="heading">${commandText(title(approval), false)}</h2>
          ${this.#request(approval, true)}
          ${approval.kind === 'sudo' && approval.cwd ? html`<p class="cwd">In ${commandText(approval.cwd, false)}</p>` : nothing}
          ${this.#notes(approval, gate, always)}
          ${approval.kind === 'secret' && !failure ? this.#frame(approval) : nothing}
          ${failure ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${failure}</span></p>` : html`<p class="timer" data-timer>${approval.kind === 'click' ? 'Cancelled' : 'Denied'} automatically in ${countdown(approval.expiresAt - this.now)}.</p>`}
          <p class="more" data-more=${rest.length ? '' : nothing}>${rest.length === 1 ? '1 more request is waiting.' : rest.length ? `${rest.length} more requests are waiting.` : ''}</p>
          ${this.#actions(approval, !!failure, always)}
        </sp-alert-dialog>`
    );
  }
}
