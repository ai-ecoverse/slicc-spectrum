import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type {
  Approval,
  ApprovalDecision,
  ApprovalEnd,
  ApprovalsPort,
  SliccModel,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { dialogStyles, focused } from './confirm.ts';

export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function asking(approval: Approval): string {
  const { kind, name, where } = approval.requester;
  const place = where ? ` in ${where}` : '';
  return kind === 'user'
    ? `You ran this with sudo${place} (as ${name})`
    : `${name} wants to run this with sudo${place}`;
}

export function sudo(approval: Approval): string {
  const as = approval.target && approval.target !== 'root' ? `-u ${approval.target} ` : '';
  return `sudo ${as}${approval.command}`;
}

const rulePaths = ['/etc/fnox', '/etc/fnox/config.toml', '/etc/slicc/secrets-policy.toml'];
const ruleParents = ['/', '/etc', '/etc/slicc'];

function absolute(cwd: string, word: string): string {
  const parts: string[] = [];
  for (const part of `${word.startsWith('/') ? '' : cwd}/${word}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function pattern(path: string): RegExp {
  const source = path
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${source}$`);
}

const readOnly = [
  'cat',
  'cd',
  'df',
  'diff',
  'du',
  'echo',
  'file',
  'grep',
  'head',
  'ls',
  'pwd',
  'readlink',
  'realpath',
  'rg',
  'stat',
  'tail',
  'tree',
  'wc',
];

function candidates(word: string): string[] {
  if (word.startsWith('--')) return [];
  if (!word.startsWith('-')) return [word];
  const slash = word.indexOf('/');
  return [word.slice(2), ...(slash > 2 ? [word.slice(slash)] : [])].filter(Boolean);
}

function protects(path: string, whole: boolean): boolean {
  const inside = (candidate: string) =>
    candidate === '/etc/fnox' || candidate.startsWith('/etc/fnox/');
  if (/[[{$]/.test(path)) {
    const prefix = path.slice(0, path.search(/[*?[{$]/));
    return inside(prefix) || rulePaths.some((rule) => rule.startsWith(prefix));
  }
  if (!/[*?]/.test(path))
    return inside(path) || rulePaths.includes(path) || (whole && ruleParents.includes(path));
  const glob = pattern(path);
  const top = path.split('/').slice(0, 3).join('/');
  return (
    rulePaths.some((rule) => glob.test(rule)) ||
    (top !== path && pattern(top).test('/etc/fnox')) ||
    (whole && ruleParents.some((parent) => glob.test(parent)))
  );
}

export function secretRules(approval: Approval): string | null {
  let cwd = absolute('/', approval.cwd ?? '/');
  const words = approval.command
    .split(/[\s`;&|<>()=,]+/)
    .map((word) => word.replace(/['"\\]/g, ''))
    .filter(Boolean);
  const name = (word: string) => word.split('/').pop() ?? '';
  const whole = approval.command.split(/[;&|\n]|\$\(|`/).some((segment) => {
    const first = segment.trim().split(/\s+/)[0];
    return !!first && !readOnly.includes(name(first));
  });
  if (protects(cwd, false)) return cwd;
  for (const [index, word] of words.entries()) {
    if (index > 0 && name(words[index - 1]) === 'cd' && !word.startsWith('-')) {
      cwd = absolute(cwd, word);
      if (protects(cwd, false)) return cwd;
      continue;
    }
    for (const candidate of candidates(word)) {
      const path = absolute(cwd, candidate);
      if (index > 0 && protects(path, whole)) return path;
    }
  }
  return null;
}

export function waiting(model: SliccModel | null, now: number): Approval[] {
  return [...(model?.approvals?.list() ?? [])]
    .filter((approval) => approval.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt);
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
  #port: ApprovalsPort | undefined;
  #ended = new Map<string, ApprovalEnd>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #shown = '';
  #trigger: HTMLElement | null = null;

  constructor() {
    super();
    this.now = Date.now();
    this.busy = '';
    this.failure = null;
    this.gone = null;
  }

  static styles = [
    dialogStyles,
    css`
      :host {
        display: contents;
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
        max-block-size: 8lh;
        overflow: auto;
      }
      .cwd,
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
      .rules {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-notice-subtle-background-color-default);
        --swc-icon-color: var(--swc-icon-color-notice);
      }
      .rules swc-icon-alert-triangle {
        flex: none;
        margin-block-start: 0.15em;
      }
      .rules p {
        margin: 0;
      }
      .rules code {
        font-family: var(--swc-code-font-family-stack);
        overflow-wrap: anywhere;
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
      this.#ended.clear();
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
    if (!port?.decide || this.busy || (decision !== 'deny' && !this.#armed)) return;
    if (decision === 'always' && secretRules(approval)) return;
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
    return this.model?.approvals?.decide ? waiting(this.model, this.now) : [];
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
    const dialog = this.renderRoot.querySelector('dialog');
    const key = dialog ? `${dialog.dataset.approval}:${dialog.dataset.gone ?? ''}` : '';
    if (key === this.#shown) return;
    if (dialog && !this.#shown) this.#trigger = focused();
    this.#shown = key;
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector('[data-action=deny], [data-action=close]') as LitElement;
    void first.updateComplete.then(() => first.focus());
  }

  close(): void {
    this.gone = null;
    this.#showing = null;
  }

  #cancel(event: Event, approval: Approval): void {
    event.preventDefault();
    if (this.gone) this.close();
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
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asking" data-approval=${approval.id} data-kind=${approval.kind} data-requester=${approval.requester.kind} data-gone=${this.gone?.reason ?? nothing} @cancel=${(event: Event) => this.#cancel(event, approval)}>${content}</dialog>`
    );
  }

  #request(approval: Approval): TemplateResult {
    return html`<p id="asking">${asking(approval)}:</p>
      <pre class="command" data-command>${sudo(approval)}</pre>`;
  }

  render(): unknown {
    if (this.gone) {
      const { approval, reason } = this.gone;
      return this.#dialog(
        approval,
        `gone:${approval.id}`,
        html`<sp-alert-dialog variant="information">
          <h2 id="title" slot="heading">${reason === 'expired' ? 'Sudo request timed out' : 'Answered in another tab'}</h2>
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
    const rules = secretRules(approval);
    const always = approval.always && !rules;
    return this.#dialog(
      approval,
      approval.id,
      html`<sp-alert-dialog variant="warning">
          <h2 id="title" slot="heading">Allow sudo?</h2>
          ${this.#request(approval)}
          ${approval.cwd ? html`<p class="cwd">In ${approval.cwd}</p>` : nothing}
          ${rules ? html`<div class="rules" data-secret-rules=${rules}><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><p><strong>This changes secret rules.</strong> It names <code>${rules}</code>, where SLICC keeps which secrets programs may use and where they may be sent. Allow it only if you asked for this change.</p></div>` : nothing}
          ${always ? html`<p class="hint">Always allow lets ${approval.requester.name} run exactly this command with sudo without asking again.</p>` : nothing}
          ${failure ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${failure}</span></p>` : nothing}
          <p class="timer" data-timer>Denied automatically in ${countdown(approval.expiresAt - this.now)}.</p>
          ${rest.length ? html`<p class="more" data-more>${rest.length === 1 ? '1 more request is waiting.' : `${rest.length} more requests are waiting.`}</p>` : nothing}
          ${this.#button(approval, 'deny', 'Deny', 'secondary')}
          ${always ? this.#button(approval, 'always', 'Always allow', 'secondary') : nothing}
          ${this.#button(approval, 'once', 'Allow once', 'accent')}
        </sp-alert-dialog>`
    );
  }
}

export function deadline(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
