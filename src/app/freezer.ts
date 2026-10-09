import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import { css, html, type TemplateResult } from 'lit';
import type { FrozenCone, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';

export function ago(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
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

  async #delete(cone: FrozenCone): Promise<void> {
    const body = `${cone.name}, its scoops and its ${cone.messages} messages are deleted. You can’t undo this.`;
    if (await confirm({ title: `Delete ${cone.name}?`, body, action: 'Delete' }))
      this.model?.agent.discard(cone.id);
  }

  #card(cone: FrozenCone): TemplateResult {
    const model = this.model as SliccModel;
    const label =
      model.settings.models().find((option) => option.id === cone.model)?.label ?? cone.model;
    return html`<div class="card" data-id=${cone.id}>
      <div class="name">${cone.name}<swc-badge size="s" variant="neutral" subtle>${label}</swc-badge></div>
      <div class="title" title=${cone.title}>${cone.title}</div>
      <div class="meta">${cone.messages} messages · frozen ${ago(cone.frozenAt)}</div>
      <div class="actions">
        <swc-action-button size="s" quiet accessible-label=${`Thaw ${cone.name}`} @click=${() => model.agent.thaw(cone.id)}>Thaw</swc-action-button>
        <swc-action-button size="s" quiet accessible-label=${`Delete ${cone.name}`} @click=${() => this.#delete(cone)}>Delete</swc-action-button>
      </div>
    </div>`;
  }

  render(): TemplateResult {
    const model = this.model;
    const cones = model?.agent.frozen() ?? [];
    const active = model?.agent.list().find((agent) => agent.id === model.agent.active());
    return html`<div class="bar">
        <span>${cones.length} frozen ${cones.length === 1 ? 'cone' : 'cones'}</span><span class="spacer"></span>
        ${
          active?.kind === 'cone' && !active.frozen && model?.agent.freeze
            ? html`<swc-action-button size="s" quiet @click=${() => model.agent.freeze?.(active.id)}>Freeze ${active.name}</swc-action-button>`
            : ''
        }
      </div>
      <div class="list">
        ${cones.length ? cones.map((cone) => this.#card(cone)) : html`<div class="note">Nothing frozen. Freeze a cone to archive it with its scoops.</div>`}
      </div>`;
  }
}
