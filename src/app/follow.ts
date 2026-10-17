import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/popover/swc-popover.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-user-following.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { FollowLink, FollowState, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';

export type FollowVariant = 'info' | 'positive' | 'notice' | 'negative' | 'neutral';

export interface FollowLight {
  variant: FollowVariant;
  text: string;
}

const lights: Record<FollowLink, readonly [FollowVariant, (owner: string) => string]> = {
  connecting: ['info', (owner) => `Connecting to ${owner}`],
  connected: ['positive', (owner) => `Following ${owner}`],
  reconnecting: ['notice', (owner) => `Reconnecting to ${owner}`],
  unlinked: ['negative', (owner) => `Unlinked from ${owner}`],
  failed: ['negative', (owner) => `Can’t reach ${owner}`],
};

export function refusedNow(state: FollowState | undefined): boolean {
  return !!state?.refused && state.link === 'connected';
}

export function followLight(state: FollowState): FollowLight {
  if (refusedNow(state)) return { variant: 'neutral', text: `Can’t follow ${state.owner}` };
  const [variant, text] = lights[state.link];
  return { variant, text: text(state.owner) };
}

export type FollowPageKind = 'connecting' | 'waiting' | 'unlinked' | 'failed';

export interface FollowPage {
  kind: FollowPageKind;
  title: string;
  body: string;
}

export function followPage(state: FollowState | undefined): FollowPage | null {
  if (!state) return null;
  const { owner } = state;
  if (state.link === 'connecting')
    return {
      kind: 'connecting',
      title: `Connecting to ${owner}…`,
      body: `This device follows ${owner}. Its agent shows here once it’s connected.`,
    };
  if (state.link === 'unlinked')
    return {
      kind: 'unlinked',
      title: `${owner} unlinked this device`,
      body: `To follow it again, open a new link from ${owner}.`,
    };
  if (state.link === 'failed')
    return {
      kind: 'failed',
      title: `Can’t follow ${owner}`,
      body: state.error ?? `The link to ${owner} failed.`,
    };
  if (state.access.view) return null;
  const where = state.name ? `next to ${state.name}` : 'for this device';
  return {
    kind: 'waiting',
    title: `Waiting for ${owner} to allow this device`,
    body: `On ${owner}, choose Allow ${where} in Network › Linked devices.`,
  };
}

function list(items: readonly string[], last: string): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`;
}

export function followCan(state: FollowState): string {
  if (state.refused) return state.refused;
  const allowed = ['watch the agent'];
  const missing: string[] = [];
  (state.access.control ? allowed : missing).push('send prompts');
  (state.access.terminal ? allowed : missing).push('open terminals');
  const can = `This device can ${list(allowed, 'and')}.`;
  return missing.length ? `${can} To ${list(missing, 'or')}, allow it on ${state.owner}.` : can;
}

export function following(model: SliccModel | null | undefined): FollowState | null {
  const state = model?.follow?.state();
  return state && !followPage(state) ? state : null;
}

export function watchOnly(model: SliccModel | null | undefined): string {
  const text = model?.agent?.readOnly?.();
  if (text) return text;
  const state = following(model);
  if (!state) return '';
  if (state.refused) return state.refused;
  if (state.access.control) return '';
  return `Watch only. To send prompts from this device, allow Control for it on ${state.owner}.`;
}

export function onWatch(model: SliccModel, listener: () => void): Array<() => void> {
  return [
    ...(model.agent.readOnly ? [model.agent.on('readOnly', listener)] : []),
    ...(model.follow ? [model.follow.on('follow', listener)] : []),
  ];
}

export function terminalsAllowed(model: SliccModel | null | undefined): boolean {
  const state = model?.follow?.state();
  return !state || (!state.refused && !!state.access.terminal);
}

export class SliccFollow extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    page: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    busy: { state: true },
    error: { state: true },
  };
  declare page: boolean;
  declare compact: boolean;
  declare busy: '' | 'leave' | 'retry';
  declare error: string;

  constructor() {
    super();
    this.page = false;
    this.compact = false;
    this.busy = '';
    this.error = '';
  }

  static styles = [
    shared,
    css`
      :host {
        display: inline-block;
      }
      :host([page]) {
        display: block;
        max-width: 480px;
      }
      .chip swc-status-light {
        align-self: center;
      }
      :host([compact]) .chip .text {
        display: none;
      }
      .panel {
        display: grid;
        gap: var(--swc-spacing-200);
        width: calc(var(--swc-spacing-400) * 11);
        max-width: 100%;
        padding: var(--swc-spacing-300);
        box-sizing: border-box;
        font-size: var(--swc-font-size-100);
        color: var(--swc-neutral-content-color-default);
      }
      h2 {
        margin: 0;
        font-size: var(--swc-font-size-300);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-heading-line-height);
        color: var(--swc-heading-color);
      }
      .page h2 {
        font-size: var(--swc-font-size-500);
      }
      .page > p {
        font-size: var(--swc-font-size-200);
      }
      .panel h2 {
        font-size: var(--swc-font-size-100);
      }
      p {
        margin: 0;
      }
      .muted {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .page {
        display: grid;
        gap: var(--swc-spacing-300);
        justify-items: center;
        text-align: center;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--swc-spacing-200);
      }
      .panel .actions {
        justify-content: flex-start;
      }
      .error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        color: var(--swc-negative-content-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.follow;
    return port ? [port.on('follow', () => this.requestUpdate())] : [];
  }

  async leave(): Promise<void> {
    const port = this.model?.follow;
    if (!port || this.busy) return;
    const state = port.state();
    if (state.link !== 'unlinked') {
      const ok = await confirm({
        title: `Stop following ${state.owner}?`,
        body: `This device forgets the link. To follow ${state.owner} again, open a new link from it.`,
        action: 'Leave',
        variant: 'confirmation',
      });
      if (!ok) return;
    }
    await this.#run('leave', () => port.leave());
  }

  async retry(): Promise<void> {
    const port = this.model?.follow;
    if (!port?.retry || this.busy) return;
    await this.#run('retry', () => port.retry?.());
  }

  async #run(busy: 'leave' | 'retry', task: () => Promise<void> | undefined): Promise<void> {
    this.busy = busy;
    this.error = '';
    try {
      await task();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = '';
    }
  }

  #error(): TemplateResult | typeof nothing {
    return this.error
      ? html`<p class="error" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.error}</span></p>`
      : nothing;
  }

  #leaveButton(): TemplateResult {
    return html`<swc-button size="m" variant="secondary" fill-style="outline" data-action="leave" ?pending=${this.busy === 'leave'} ?disabled=${!!this.busy && this.busy !== 'leave'} @click=${() => this.leave()}>Leave</swc-button>`;
  }

  #page(page: FollowPage): TemplateResult {
    return html`<div class="page" data-follow-page=${page.kind}>
      ${page.kind === 'connecting' || page.kind === 'waiting' ? html`<swc-progress-circle size="m" indeterminate label=${page.kind === 'waiting' ? 'Waiting' : 'Connecting'} aria-hidden="true"></swc-progress-circle>` : nothing}
      <h2 aria-live="polite">${page.title}</h2>
      <p class="muted">${page.body}</p>
      ${this.#error()}
      <div class="actions">
        ${
          page.kind === 'failed' && this.model?.follow?.retry
            ? html`<swc-button size="m" variant="accent" data-action="retry" ?pending=${this.busy === 'retry'} ?disabled=${!!this.busy && this.busy !== 'retry'} @click=${() => this.retry()}>Try again</swc-button>`
            : nothing
        }
        ${this.#leaveButton()}
      </div>
    </div>`;
  }

  render(): TemplateResult | typeof nothing {
    const state = this.model?.follow?.state();
    if (!state) return nothing;
    const page = followPage(state);
    if (this.page) return page ? this.#page(page) : nothing;
    const light = followLight(state);
    return html`<swc-action-button id="chip" class="chip" size="s" quiet data-follow=${state.link} accessible-label=${light.text}>
        ${this.compact ? html`<swc-icon-user-following slot="icon" size="s" aria-hidden="true"></swc-icon-user-following>` : nothing}
        <swc-status-light size="s" variant=${light.variant}><span class="text">${light.text}</span></swc-status-light>
      </swc-action-button>
      <swc-tooltip for="chip" placement="bottom">${light.text}</swc-tooltip>
      <swc-popover for="chip" placement="bottom-end" accessible-label=${light.text}>
        <div class="panel">
          <h2>${light.text}</h2>
          ${
            state.link === 'reconnecting'
              ? html`<p class="muted" data-reconnecting>The link to ${state.owner} dropped. The conversation may be out of date until it’s back${state.access.control ? ', and sending waits until then' : ''}.</p>`
              : nothing
          }
          <p data-can>${followCan(state)}</p>
          ${this.#error()}
          <div class="actions">${this.#leaveButton()}</div>
        </div>
      </swc-popover>`;
  }
}
