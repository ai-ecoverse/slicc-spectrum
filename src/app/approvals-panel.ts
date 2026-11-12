import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/action-group/swc-action-group.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import type {
  Approval,
  ApprovalDecision,
  ApprovalRecord,
  ApprovalRun,
  ApprovalState,
  ApprovalsPort,
  SliccModel,
  SudoApproval,
} from '../model/types.ts';
import {
  alwaysLabel,
  answerable,
  approved,
  captureLevels,
  captureLine,
  type Judged,
  leveled,
  levels,
  offersAlways,
  stops,
  trayTitle,
  truncated,
} from './approvals.ts';
import { ModelElement } from './base.ts';
import { Arming, Ends, end, endCss, layout, toScroll, Watched } from './command.ts';
import { commandText, controlStyles } from './command-display.ts';
import { dialogStyles } from './confirm.ts';
import { errorCss, panelCss, request } from './files.ts';

export type ApprovalFilter = 'open' | 'decided' | 'timed-out';

export const approvalFilters: ReadonlyArray<readonly [ApprovalFilter, string]> = [
  ['open', 'Open'],
  ['decided', 'Decided'],
  ['timed-out', 'Timed out'],
];

const filterStates: Record<ApprovalState, ApprovalFilter | 'withdrawn'> = {
  pending: 'open',
  approved: 'decided',
  rejected: 'decided',
  unanswered: 'timed-out',
  withdrawn: 'withdrawn',
};

export function filterOf(record: ApprovalRecord): ApprovalFilter | 'withdrawn' {
  return filterStates[record.state];
}

export const kindLabels: Record<Approval['kind'], string> = {
  sudo: 'Sudo',
  'guest-message': 'Guest message',
  'guest-tool': 'Guest tool call',
  tray: 'Tray',
  secret: 'Secret',
  click: 'Click',
  capture: 'Capture',
};

const empty: Record<ApprovalFilter, string> = {
  open: 'Nothing waits for an answer.',
  decided: 'Nothing has been decided yet.',
  'timed-out': 'No request has timed out.',
};

export function since(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function age(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const s = String(seconds % 60).padStart(2, '0');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}:${s}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${s}`;
}

export function stateLabel(record: ApprovalRecord): string {
  if (record.state === 'approved')
    return record.answer === 'always' ? 'Always allowed' : 'Allowed once';
  if (record.state === 'rejected') return 'Denied';
  if (record.state === 'unanswered') return 'Timed out';
  if (record.state === 'withdrawn') return 'Withdrawn';
  return 'Open';
}

const variants: Record<ApprovalState, string> = {
  pending: 'notice',
  approved: 'positive',
  rejected: 'negative',
  unanswered: 'neutral',
  withdrawn: 'neutral',
};

export function decided(record: ApprovalRecord, now = Date.now()): string {
  const who = record.decidedBy
    ? `by ${record.decidedBy}${record.device ? ` on ${record.device}` : ''}`
    : '';
  const when = record.decidedAt === undefined ? '' : since(record.decidedAt, now);
  return [who, when].filter(Boolean).join(', ');
}

export function runParts(run: ApprovalRun, now = Date.now()): [string, string] {
  if (run.state !== 'running') return [runOutcome(run), ''];
  return [
    `Running${run.pid === undefined ? '' : ` · pid ${run.pid}`}`,
    ` · ${elapsed(now - run.at)}`,
  ];
}

export function runOutcome(run: ApprovalRun, now = Date.now()): string {
  const took = run.endedAt === undefined ? '' : ` after ${elapsed(run.endedAt - run.at)}`;
  if (run.state === 'starting') return 'Starting…';
  if (run.state === 'running') return runParts(run, now).join('');
  if (run.state === 'failed') return run.error ?? 'It didn’t start.';
  if (run.state === 'stopped') return `Stopped${took}`;
  if (run.status !== undefined) return `Exited with status ${run.status}${took}`;
  if (run.signal) return `Ended by ${run.signal}${took}`;
  return `Ended${took}; its exit status is unknown`;
}

export function runBy(run: ApprovalRun, now = Date.now()): string {
  return `Run now by ${run.by}${run.device ? ` on ${run.device}` : ''}, ${since(run.at, now)}`;
}

export function runSentence(approval: SudoApproval): string {
  return `Runs as ${approval.target ?? 'root'} now, without a terminal or input. ${approval.requester.name} will be told when it starts and when it ends.`;
}

export function offersRun(record: ApprovalRecord, port: ApprovalsPort | undefined): boolean {
  return (
    !!port?.run &&
    record.state === 'unanswered' &&
    record.approval.kind === 'sudo' &&
    !record.run &&
    record.runnable !== undefined
  );
}

export function runBlocked(record: ApprovalRecord): string {
  const runnable = record.runnable;
  return typeof runnable === 'object' ? runnable.reason : '';
}

const judgedKinds = new Set<Approval['kind']>(['sudo', 'guest-message', 'guest-tool', 'capture']);

export function levelOf(approval: Approval): { level: number; label: string } | null {
  if (!judgedKinds.has(approval.kind)) return null;
  const level = leveled(approval as Judged);
  if (!level) return null;
  const table = approval.kind === 'capture' ? captureLevels : levels;
  return { level, label: table[level].label };
}

function asking(approval: Approval): string {
  const { name, where } = approval.requester;
  return where ? `${name} in ${where}` : name;
}

export function described(approval: Approval): { text: string; mono: boolean } {
  if (approval.kind === 'sudo') return { text: approval.command, mono: true };
  if (approval.kind === 'guest-message') return { text: approval.text, mono: false };
  if (approval.kind === 'tray') return { text: trayTitle(approval), mono: false };
  if (approval.kind === 'click') return { text: approval.title, mono: false };
  if (approval.kind === 'capture') return { text: captureLine(approval), mono: false };
  if (approval.kind === 'guest-tool')
    return { text: approved(approval) || approval.tool, mono: true };
  return { text: approved(approval), mono: true };
}

function place(approval: Approval): string {
  if (approval.kind === 'sudo')
    return [`as ${approval.target ?? 'root'}`, approval.cwd ? `in ${approval.cwd}` : '']
      .filter(Boolean)
      .join(' · ');
  if (approval.kind === 'secret') return `in ${approval.process.cwd}`;
  return '';
}

export class SliccApprovalsPanel extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    filter: { state: true },
    withdrawn: { state: true },
    now: { state: true },
    busy: { state: true },
    errors: { state: true },
    confirming: { state: true },
    highlight: { state: true },
  };
  declare filter: ApprovalFilter;
  declare withdrawn: boolean;
  declare now: number;
  declare busy: ReadonlyMap<string, string>;
  declare errors: ReadonlyMap<string, string>;
  declare confirming: string | null;
  declare highlight: string | null;
  arming = 500;
  #arming = new Arming(() => this.arming);
  #confirmArming = new Arming(() => this.arming);
  #ends = new Ends(
    () => this.renderRoot,
    () => this.requestUpdate()
  );
  #seen = new Map<string, string>();
  #asked = '';
  #moves = new Watched(new ResizeObserver(() => this.#settle()));
  #moved = (): void => this.#settle();
  #timer: ReturnType<typeof setInterval> | null = null;
  #fast = false;
  #trigger: HTMLElement | null = null;
  #reveal: string | null = null;

  constructor() {
    super();
    this.filter = 'open';
    this.withdrawn = false;
    this.now = Date.now();
    this.busy = new Map();
    this.errors = new Map();
    this.confirming = null;
    this.highlight = null;
    this.addEventListener('pointerdown', this.#unmark, true);
    this.addEventListener('keydown', this.#unmark, true);
  }

  static styles = [
    panelCss,
    errorCss,
    dialogStyles,
    controlStyles,
    endCss,
    css`
      :host {
        container: approvals / inline-size;
      }
      .bar {
        gap: var(--swc-spacing-100);
      }
      .bar swc-badge {
        margin-inline-start: var(--swc-spacing-75);
      }
      swc-action-button.selected {
        --swc-action-button-background-color-default: var(--swc-neutral-background-color-selected-default);
        --swc-action-button-background-color-hover: var(--swc-neutral-background-color-selected-hover);
        --swc-action-button-background-color-down: var(--swc-neutral-background-color-selected-down);
        --swc-action-button-background-color-focus: var(--swc-neutral-background-color-selected-key-focus);
        --swc-action-button-content-color-default: var(--swc-gray-25);
        --swc-action-button-content-color-hover: var(--swc-gray-25);
        --swc-action-button-content-color-down: var(--swc-gray-25);
        --swc-action-button-content-color-focus: var(--swc-gray-25);
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100);
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .withdrawn {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
      }
      .row {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border: var(--swc-border-width-100) solid var(--swc-gray-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
        font-size: var(--swc-font-size-75);
      }
      .row:focus {
        outline: none;
      }
      .row:focus-visible,
      .row[data-highlight] {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .head .kind {
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-content-color-default);
      }
      .head .when {
        margin-inline-start: auto;
      }
      .command,
      .summary {
        margin: 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .command {
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-small-default);
        background: var(--swc-gray-100);
        font-family: var(--swc-code-font-family-stack);
        color: var(--swc-neutral-content-color-default);
      }
      .summary {
        color: var(--swc-neutral-content-color-default);
      }
      .note-line,
      .place,
      .decided,
      .run-by,
      .note {
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
      }
      .state {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .level[data-level='2'] {
        color: var(--swc-notice-content-color-default);
      }
      .level[data-level='3'] {
        color: var(--swc-negative-content-color-default);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100);
      }
      .run {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
        padding-block-start: var(--swc-spacing-75);
        border-block-start: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      .run .line {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
        font-variant-numeric: tabular-nums;
        color: var(--swc-neutral-content-color-default);
      }
      .run[data-run='failed'] .line,
      .run[data-exit-warn] .line {
        color: var(--swc-negative-content-color-default);
      }
      .row .note-line {
        margin: 0;
      }
      .problem {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        color: var(--swc-negative-content-color-default);
      }
      .actions:has([data-run-reason]) {
        align-items: center;
      }
      .reason {
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
      }
      .more {
        align-self: flex-start;
      }
      .more .chevron {
        transition: transform 120ms;
      }
      .more.open .chevron {
        transform: rotate(90deg);
      }
      .note {
        padding: var(--swc-spacing-200);
      }
      dialog .command {
        margin-block-start: var(--swc-spacing-200);
        max-block-size: 12lh;
        overflow: auto;
      }
      dialog .facts {
        margin: var(--swc-spacing-200) 0 0;
        padding: 0;
        list-style: none;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
      }
      dialog .note-line {
        margin-block-start: var(--swc-spacing-200);
        font-size: var(--swc-font-size-75);
      }
      dialog .warning {
        margin-block-start: var(--swc-spacing-300);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.approvals;
    if (!port) return [];
    const update = () => {
      this.now = Date.now();
      this.requestUpdate();
    };
    return [port.on('history', update), port.on('approvals', update)];
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#tick();
    globalThis.addEventListener('resize', this.#moved);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopTick();
    this.#ends.disconnect();
    this.#moves.disconnect();
    globalThis.removeEventListener('resize', this.#moved);
  }

  #stopTick(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #tick(): void {
    if (!this.isConnected) return;
    const fast = this.records().some(
      ({ run }) => run?.state === 'running' || run?.state === 'starting'
    );
    if (this.#timer && fast === this.#fast) return;
    this.#stopTick();
    this.#fast = fast;
    this.#timer = setInterval(() => (this.now = Date.now()), fast ? 1000 : 30_000);
  }

  records(): readonly ApprovalRecord[] {
    return this.model?.approvals?.history?.() ?? [];
  }

  #record(id: string): ApprovalRecord | undefined {
    return this.records().find((record) => record.approval.id === id);
  }

  focus(): void {
    this.focusOn('[data-filter].selected', '.row');
  }

  reveal(id: string): void {
    const record = this.#record(id);
    if (!record) return;
    const where = filterOf(record);
    if (where === 'withdrawn') {
      this.filter = 'decided';
      this.withdrawn = true;
    } else this.filter = where;
    this.highlight = id;
    this.#reveal = id;
    this.requestUpdate();
  }

  #set(map: ReadonlyMap<string, string>, id: string, value: string | null): Map<string, string> {
    const next = new Map(map);
    if (value === null) next.delete(id);
    else next.set(id, value);
    return next;
  }

  async #act(id: string, action: string, run: () => Promise<void>): Promise<void> {
    if (this.busy.has(id)) return;
    this.busy = this.#set(this.busy, id, action);
    this.errors = this.#set(this.errors, id, null);
    try {
      await run();
    } catch (error) {
      this.errors = this.#set(
        this.errors,
        id,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.busy = this.#set(this.busy, id, null);
    }
  }

  decide(id: string, decision: ApprovalDecision): Promise<void> {
    const port = this.model?.approvals;
    const live = port?.list().find((approval) => approval.id === id);
    if (!port?.decide || !live || !answerable(live, decision)) return Promise.resolve();
    if (decision === 'always' && !offersAlways(live)) return Promise.resolve();
    const denies = decision === 'deny' || decision === 'stop';
    if (!denies && !(this.#whole(live) && this.#arming.settled())) return Promise.resolve();
    const decide = port.decide.bind(port);
    return this.#act(id, decision, () => decide(id, decision));
  }

  #whole(approval: Approval): boolean {
    if (truncated(approval)) return false;
    return !approved(approval) || this.#ends.has(approval.id);
  }

  #click(event: MouseEvent, arming: Arming, run: () => void): void {
    if (!arming.counts(event)) return;
    run();
  }

  #runnable(id: string): ApprovalRecord | null {
    const record = this.#record(id);
    const port = this.model?.approvals;
    return record && offersRun(record, port) && record.runnable === true ? record : null;
  }

  #identity(id: string): string {
    return JSON.stringify((this.#record(id) as ApprovalRecord).approval);
  }

  #ask(id: string, trigger: HTMLElement): void {
    if (!this.#runnable(id)) return;
    this.#trigger = trigger;
    this.#asked = this.#identity(id);
    this.confirming = id;
  }

  #cancel(): void {
    if (this.confirming) this.#ends.forget(`run:${this.confirming}`);
    this.#asked = '';
    this.confirming = null;
  }

  #unmark = (): void => {
    if (this.highlight) this.highlight = null;
  };

  #escape = (event: Event): void => {
    event.preventDefault();
    this.#cancel();
  };

  run(id: string): Promise<void> {
    const port = this.model?.approvals;
    if (!port?.run || !this.#runnable(id)) return Promise.resolve();
    if (
      this.confirming !== id ||
      this.#asked !== this.#identity(id) ||
      !(this.#ends.has(`run:${id}`) && this.#confirmArming.settled())
    )
      return Promise.resolve();
    this.#asked = '';
    this.confirming = null;
    const run = port.run.bind(port);
    return this.#act(id, 'run-now', () => run(id));
  }

  stopRun(id: string): Promise<void> {
    const port = this.model?.approvals;
    if (!port?.stopRun || this.#record(id)?.run?.state !== 'running') return Promise.resolve();
    const stop = port.stopRun.bind(port);
    return this.#act(id, 'stop-run', () => stop(id));
  }

  #open(path: string): void {
    request(this, 'open-file', path);
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const asked = this.confirming;
    if (asked && !this.#runnable(asked)) this.#cancel();
    else if (asked && this.#asked !== this.#identity(asked)) {
      this.#asked = this.#identity(asked);
      this.#ends.forget(`run:${asked}`);
      this.#confirmArming.arm();
    }
    for (const { approval, state } of this.records()) {
      if (state !== 'pending') continue;
      const key = JSON.stringify([approval.kind, approval.createdAt, approved(approval)]);
      if (this.#seen.get(approval.id) !== key) this.#ends.forget(approval.id);
      this.#seen.set(approval.id, key);
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this.#tick();
    this.#ends.observe();
    this.#dialog(changed);
    this.#moves.sync(
      this.renderRoot.querySelectorAll(
        '.list, .row, [data-decision], dialog sp-alert-dialog, dialog [slot=button]'
      )
    );
    this.#settle();
    const id = this.#reveal;
    if (!id) return;
    this.#reveal = null;
    const row = [...this.renderRoot.querySelectorAll<HTMLElement>('.row[data-id]')].find(
      (item) => item.dataset.id === id
    ) as HTMLElement;
    row.scrollIntoView({ block: 'center' });
    row.focus({ preventScroll: true });
  }

  #settle(): void {
    const list = this.renderRoot.querySelector<HTMLElement>('.list');
    const buttons = [...this.renderRoot.querySelectorAll<HTMLElement>('.row [data-decision]')];
    this.#arming.watch(layout(buttons, [], list));
    const dialog = this.renderRoot.querySelector('dialog');
    if (!dialog) return;
    const actions = [...dialog.querySelectorAll<HTMLElement>('[slot=button]')];
    this.#confirmArming.watch(layout(actions, [this.#asked], dialog));
  }

  #dialog(changed: PropertyValues): void {
    if (!changed.has('confirming')) return;
    const dialog = this.renderRoot.querySelector('dialog');
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    this.#confirmArming.arm();
    const cancel = dialog.querySelector('[data-action=cancel]') as LitElement;
    void cancel.updateComplete.then(() => cancel.focus());
  }

  #decision(
    approval: Approval,
    decision: ApprovalDecision,
    label: string,
    variant: string
  ): TemplateResult {
    const busy = this.busy.get(approval.id);
    return html`<swc-button size="s" variant=${variant} fill-style=${variant === 'accent' ? nothing : 'outline'} data-action=${decision} data-decision ?pending=${busy === decision} ?disabled=${(!!busy && busy !== decision) || (decision !== 'deny' && decision !== 'stop' && !this.#whole(approval))} @click=${(event: MouseEvent) => this.#click(event, this.#arming, () => void this.decide(approval.id, decision))}>${label}</swc-button>`;
  }

  #openActions(approval: Approval): TemplateResult | typeof nothing {
    if (!this.model?.approvals?.decide) return nothing;
    const click = approval.kind === 'click';
    const once =
      answerable(approval, 'once') && !truncated(approval)
        ? this.#decision(approval, 'once', click ? approval.action : 'Allow once', 'accent')
        : nothing;
    const gate = this.#ends.hidden(approval.id) ? toScroll : '';
    return html`${gate ? html`<p class="note-line" data-allow-hint>${gate}</p>` : nothing}<div class="actions">
      ${this.#decision(approval, 'deny', click ? 'Cancel' : 'Deny', 'secondary')}
      ${stops(approval) ? this.#decision(approval, 'stop', 'Deny and stop', 'secondary') : nothing}
      ${offersAlways(approval) ? this.#decision(approval, 'always', alwaysLabel(approval), 'secondary') : nothing}
      ${once}
    </div>`;
  }

  #runNow(record: ApprovalRecord): TemplateResult | typeof nothing {
    if (!offersRun(record, this.model?.approvals)) return nothing;
    const { id } = record.approval;
    const reason = runBlocked(record);
    const busy = this.busy.get(id) === 'run-now';
    const button = html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="run-now" ?pending=${busy} ?disabled=${!!reason} @click=${(event: MouseEvent) => this.#ask(id, event.currentTarget as HTMLElement)}>Run now</swc-button>`;
    if (!reason) return html`<div class="actions">${button}</div>`;
    return html`<div class="actions">${button}<span class="reason" data-run-reason>${commandText(reason, false)}</span></div>`;
  }

  #run(record: ApprovalRecord): TemplateResult | typeof nothing {
    const run = record.run;
    if (!run) return nothing;
    const { id } = record.approval;
    const live = run.state === 'running' || run.state === 'starting';
    const warn = run.state === 'done' && run.status !== undefined && run.status !== 0;
    const port = this.model?.approvals;
    const stopping = this.busy.get(id) === 'stop-run';
    const [said, ticking] = runParts(run, this.now);
    return html`<div class="run" data-run=${run.state} data-exit=${run.status ?? nothing} ?data-exit-warn=${warn}>
      <div class="line">${live ? html`<swc-progress-circle size="s" indeterminate label="Running" aria-hidden="true"></swc-progress-circle>` : nothing}<span data-run-line><span aria-live="polite" data-run-said>${commandText(said, false)}</span>${ticking ? html`<span aria-hidden="true" data-run-elapsed>${ticking}</span>` : nothing}</span></div>
      <span class="run-by">${runBy(run, this.now)}</span>
      <div class="actions">
        ${run.state === 'running' && port?.stopRun ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="stop-run" ?pending=${stopping} @click=${() => void this.stopRun(id)}>Stop</swc-button>` : nothing}
        ${!live && run.stdout ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="view-output" @click=${() => this.#open(run.stdout as string)}>View output</swc-button>` : nothing}
        ${!live && run.stderr ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="view-errors" @click=${() => this.#open(run.stderr as string)}>View errors</swc-button>` : nothing}
      </div>
    </div>`;
  }

  #row(record: ApprovalRecord): TemplateResult {
    const { approval } = record;
    const { id } = approval;
    const { text, mono } = described(approval);
    const where = place(approval);
    const level = levelOf(approval);
    const who = decided(record, this.now);
    const error = this.errors.get(id);
    const mark =
      record.state === 'pending' ? keyed(this.#seen.get(id) as string, end(id)) : nothing;
    return html`<li class="row" tabindex="-1" data-id=${id} data-kind=${approval.kind} data-state=${record.state} ?data-highlight=${this.highlight === id}>
      <div class="head"><span class="kind">${kindLabels[approval.kind]}</span><span class="who" data-requester>${commandText(asking(approval), false)}</span><span class="when">${since(approval.createdAt, this.now)}</span></div>
      ${mono ? html`<pre class="command" data-command>${commandText(text)}${mark}</pre>` : html`<p class="summary" data-summary>${commandText(text)}${mark}</p>`}
      ${where ? html`<span class="place" data-place>${commandText(where, false)}</span>` : nothing}
      <div class="state">
        <swc-badge size="s" variant=${variants[record.state]} subtle data-badge>${stateLabel(record)}</swc-badge>
        ${who ? html`<span class="decided" data-decided>${commandText(who, false)}</span>` : nothing}
        ${level ? html`<span class="level" data-level=${level.level}>Level ${level.level} · ${level.label}</span>` : nothing}
      </div>
      ${record.state === 'pending' ? this.#openActions(approval) : nothing}
      ${this.#runNow(record)}
      ${this.#run(record)}
      ${error ? html`<p class="problem" role="alert" data-error><swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond><span>${error}</span></p>` : nothing}
    </li>`;
  }

  #confirm(): TemplateResult | typeof nothing {
    const record = this.confirming ? this.#record(this.confirming) : undefined;
    if (!record) return nothing;
    const approval = record.approval as SudoApproval;
    const level = levelOf(approval);
    const { id } = approval;
    return html`<dialog role="alertdialog" aria-labelledby="run-title" data-run-confirm=${id} @pointerdown=${this.#confirmArming.press} @cancel=${this.#escape}>
      <sp-alert-dialog variant="confirmation">
        <h2 id="run-title" slot="heading">Run this now?</h2>
        <p>${commandText(`${asking(approval)} asked to run this with sudo ${age(approval.createdAt, this.now)} ago, and nobody answered in time:`, false)}</p>
        <pre class="command" data-command>${commandText(approval.command)}${keyed(this.#asked, end(`run:${id}`))}</pre>
        <ul class="facts">
          <li data-target>As ${commandText(approval.target ?? 'root', false)}</li>
          ${approval.cwd ? html`<li data-cwd>In ${commandText(approval.cwd, false)}</li>` : nothing}
          ${level ? html`<li data-level=${level.level}>Level ${level.level} · ${level.label}${approval.verdict?.reason ? html` ${commandText(approval.verdict.reason, false)}` : nothing}</li>` : html`<li data-level="none">No verdict</li>`}
          <li data-age>Asked ${age(approval.createdAt, this.now)} ago</li>
        </ul>
        <p class="warning" data-warning>${commandText(runSentence(approval), false)}</p>
        <swc-button slot="button" variant="secondary" fill-style="outline" data-action="cancel" @click=${() => this.#cancel()}>Cancel</swc-button>
        ${this.#ends.hidden(`run:${id}`) ? html`<p class="note-line" data-allow-hint>Scroll to the end of the command to run it.</p>` : nothing}
        <swc-button slot="button" variant="accent" data-action="run-confirm" ?disabled=${!this.#ends.has(`run:${id}`)} @click=${(event: MouseEvent) => this.#click(event, this.#confirmArming, () => void this.run(id))}>Run now</swc-button>
      </sp-alert-dialog>
    </dialog>`;
  }

  #filterButton(filter: ApprovalFilter, label: string, count: number): TemplateResult {
    const selected = this.filter === filter;
    const badge =
      filter === 'open' && count
        ? html`<swc-badge size="s" variant="notice" data-count>${count}</swc-badge>`
        : nothing;
    return html`<swc-action-button size="s" class=${selected ? 'selected' : ''} data-filter=${filter} aria-pressed=${selected ? 'true' : 'false'} @click=${() => (this.filter = filter)}>${label}${badge}</swc-action-button>`;
  }

  #withdrawn(rows: readonly ApprovalRecord[]): TemplateResult | typeof nothing {
    if (!rows.length) return nothing;
    const open = this.withdrawn;
    return html`<div class="withdrawn"><swc-action-button size="s" quiet class=${open ? 'more open' : 'more'} data-action="show-withdrawn" aria-expanded=${open ? 'true' : 'false'} @click=${() => (this.withdrawn = !open)}><swc-icon-chevron-right slot="icon" class="chevron"></swc-icon-chevron-right>${open ? 'Hide withdrawn' : `Show withdrawn (${rows.length})`}</swc-action-button>${open ? this.#rows(rows) : nothing}</div>`;
  }

  #rows(rows: readonly ApprovalRecord[]): TemplateResult {
    return html`<ul class="rows">${repeat(
      rows,
      (record) => record.approval.id,
      (record) => this.#row(record)
    )}</ul>`;
  }

  render(): TemplateResult {
    const records = this.records();
    const count = (filter: string) => records.filter((record) => filterOf(record) === filter);
    const shown = count(this.filter);
    const withdrawn = this.filter === 'decided' ? count('withdrawn') : [];
    return html`<div class="bar" data-surface="approvals">
        <swc-action-group size="s" compact accessible-label="Show">${approvalFilters.map(
          ([filter, label]) => this.#filterButton(filter, label, count(filter).length)
        )}</swc-action-group>
      </div>
      <div class="list" data-filter-shown=${this.filter} @pointerdown=${this.#arming.press}>
        ${shown.length ? this.#rows(shown) : html`<p class="note" data-empty>${empty[this.filter]}</p>`}
        ${this.#withdrawn(withdrawn)}
      </div>
      ${this.#confirm()}`;
  }
}
