import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { Approval, ApprovalDecision, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';
import { dialogStyles, focused } from './confirm.ts';

export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function asking(approval: Approval): string {
  const { name, where } = approval.requester;
  return `${name} wants to run this with sudo${where ? ` in ${where}` : ''}`;
}

export function waiting(model: SliccModel | null, now: number): Approval[] {
  return [...(model?.approvals?.list() ?? [])]
    .filter((approval) => approval.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export class SliccApprovals extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    now: { state: true },
    busy: { state: true },
    failure: { state: true },
  };
  declare now: number;
  declare busy: ApprovalDecision | '';
  declare failure: { id: string; message: string } | null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #shown = '';
  #trigger: HTMLElement | null = null;

  constructor() {
    super();
    this.now = Date.now();
    this.busy = '';
    this.failure = null;
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
    if (!port) return [];
    return [
      port.on('approvals', () => {
        this.now = Date.now();
        this.requestUpdate();
      }),
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#tick(false);
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
    if (!port?.decide || this.busy) return;
    this.busy = decision;
    this.failure = null;
    try {
      await port.decide(approval.id, decision);
    } catch (error) {
      this.failure = {
        id: approval.id,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.busy = '';
    }
  }

  #current(): Approval[] {
    return this.model?.approvals?.decide ? waiting(this.model, this.now) : [];
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const all = this.model?.approvals?.list() ?? [];
    this.#tick(all.length > 0);
    const dialog = this.renderRoot.querySelector('dialog');
    const id = dialog?.dataset.approval ?? '';
    if (id === this.#shown) return;
    if (dialog && !this.#shown) this.#trigger = focused();
    this.#shown = id;
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    const deny = dialog.querySelector('[data-action=deny]') as LitElement;
    void deny.updateComplete.then(() => deny.focus());
  }

  #cancel(event: Event, approval: Approval): void {
    event.preventDefault();
    void this.decide(approval, 'deny');
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

  render(): unknown {
    const [approval, ...rest] = this.#current();
    if (!approval) return nothing;
    const failure = this.failure?.id === approval.id ? this.failure.message : '';
    return keyed(
      approval.id,
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asking" data-approval=${approval.id} data-kind=${approval.kind} data-requester=${approval.requester.kind} @cancel=${(event: Event) => this.#cancel(event, approval)}>
        <sp-alert-dialog variant="warning">
          <h2 id="title" slot="heading">Allow sudo?</h2>
          <p id="asking">${asking(approval)}:</p>
          <pre class="command" data-command>sudo ${approval.command}</pre>
          ${approval.cwd ? html`<p class="cwd">In ${approval.cwd}</p>` : nothing}
          ${approval.always ? html`<p class="hint">Always allow lets ${approval.requester.name} run exactly this command with sudo without asking again.</p>` : nothing}
          ${failure ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${failure}</span></p>` : nothing}
          <p class="timer" data-timer>Denied automatically in ${countdown(approval.expiresAt - this.now)}.</p>
          ${rest.length ? html`<p class="more" data-more>${rest.length === 1 ? '1 more request is waiting.' : `${rest.length} more requests are waiting.`}</p>` : nothing}
          ${this.#button(approval, 'deny', 'Deny', 'secondary')}
          ${approval.always ? this.#button(approval, 'always', 'Always allow', 'secondary') : nothing}
          ${this.#button(approval, 'once', 'Allow once', 'accent')}
        </sp-alert-dialog>
      </dialog>`
    );
  }
}

export function deadline(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
