import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, FrozenCone, FrozenKind, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';
import { coneLabel, twinned, withTitle } from './names.ts';

export function ago(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

export async function deleteCone(
  model: SliccModel,
  agent: Agent,
  trigger?: HTMLElement | null
): Promise<boolean> {
  const ok = await confirm({
    title: `Delete cone ${coneLabel(model, agent)}?`,
    body: 'It stops, with its scoops. Its conversation stays in the Freezer, where you can thaw it.',
    action: 'Delete cone',
    variant: 'confirmation',
    trigger,
  });
  if (ok) model.agent.freeze?.(agent.id);
  return ok;
}

export const frozenKinds: Record<FrozenKind, readonly ['indigo' | 'seafoam' | 'purple', string]> = {
  cone: ['indigo', 'Cone'],
  scoop: ['seafoam', 'Scoop'],
  agent: ['purple', 'Agent run'],
};

export function freezerOrder(rows: readonly FrozenCone[]): FrozenCone[] {
  return [...rows].sort((a, b) => Number(!!b.live) - Number(!!a.live) || b.frozenAt - a.frozenAt);
}

export class SliccFreezer extends ModelElement {
  static styles = [
    shared,
    panelCss,
    css`
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--swc-spacing-100);
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-content: start;
        gap: var(--swc-spacing-100);
      }
      .card {
        display: grid;
        gap: var(--swc-spacing-50);
        border-radius: var(--swc-corner-radius-medium-default);
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        background: var(--swc-background-layer-1-color);
      }
      .name {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-100);
        font-weight: var(--swc-bold-font-weight);
      }
      .title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        line-height: var(--swc-line-height-100);
      }
      .meta {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .name swc-status-light {
        font-weight: normal;
      }
      .actions {
        display: flex;
        gap: var(--swc-spacing-75);
        margin-inline-start: calc(-1 * var(--swc-spacing-100));
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      model.agent.on('frozen', update),
      model.agent.on('active', update),
      model.agent.on('agents', update),
    ];
  }

  focus(): void {
    this.focusOn('swc-action-button');
  }

  async #remove(cone: FrozenCone, trigger: HTMLElement): Promise<void> {
    const ok = await confirm({
      title: `Remove ${this.#named(cone)} from the Freezer?`,
      body: 'Its working folders are deleted. The conversation stays in the session database. You can’t undo this.',
      action: 'Remove',
      variant: 'destructive',
      trigger,
    });
    if (ok) this.model?.agent.discard(cone.id);
  }

  #named(cone: FrozenCone): string {
    const rows = this.model?.agent.frozen() ?? [];
    return twinned(cone.name, cone.id, rows) ? withTitle(cone.name, cone.title) : cone.name;
  }

  #thawedAs(id: string): string {
    const model = this.model as SliccModel;
    return (
      model.agent.list().find((agent) => agent.id === id)?.name ??
      model.agent.frozen().find((row) => row.id === id)?.name ??
      id
    );
  }

  #actions(cone: FrozenCone): TemplateResult {
    const model = this.model as SliccModel;
    if (cone.live) {
      return html`<swc-action-button size="s" quiet data-action="open" accessible-label=${`Open ${this.#named(cone)}`} @click=${() => model.agent.select(cone.id)}>Open</swc-action-button>`;
    }
    return html`<swc-action-button size="s" quiet data-action="thaw" accessible-label=${`Thaw ${this.#named(cone)}`} @click=${() => model.agent.thaw(cone.id)}>Thaw</swc-action-button>
      <swc-action-button size="s" quiet data-action="remove" accessible-label=${`Remove ${this.#named(cone)}`} @click=${(event: Event) => this.#remove(cone, event.currentTarget as HTMLElement)}>Remove</swc-action-button>`;
  }

  #card(cone: FrozenCone): TemplateResult {
    const model = this.model as SliccModel;
    const label =
      model.settings.models().find((option) => option.id === cone.model)?.label ?? cone.model;
    const kind = frozenKinds[cone.kind ?? 'cone'];
    const meta = [
      `${cone.messages} ${cone.messages === 1 ? 'message' : 'messages'}`,
      ...(cone.live ? [] : [`frozen ${ago(cone.frozenAt)}`]),
      ...(cone.thawedAs ? [`thawed as ${this.#thawedAs(cone.thawedAs)}`] : []),
    ];
    return html`<div class="card" data-id=${cone.id} data-kind=${cone.kind ?? 'cone'} ?data-live=${cone.live}>
      <div class="name">${cone.name}<swc-badge size="s" variant=${kind[0]} subtle data-badge="kind">${kind[1]}</swc-badge><swc-badge size="s" variant="neutral" subtle>${label}</swc-badge>${cone.live ? html`<swc-status-light size="s" variant="positive" data-live>Live</swc-status-light>` : nothing}</div>
      <div class="title" title=${cone.title}>${cone.title}</div>
      <div class="meta">${meta.join(' · ')}</div>
      <div class="actions">${this.#actions(cone)}</div>
    </div>`;
  }

  render(): TemplateResult {
    const rows = freezerOrder(this.model?.agent.frozen() ?? []);
    return html`<div class="bar">
        <span>${rows.length} ${rows.length === 1 ? 'conversation' : 'conversations'}</span>
      </div>
      <div class="list">
        ${rows.length ? rows.map((cone) => this.#card(cone)) : html`<div class="note">No conversations yet. A new conversation or a deleted cone leaves the old one here.</div>`}
      </div>`;
  }
}
