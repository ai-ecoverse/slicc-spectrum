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
        padding: 6px 8px;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-content: start;
        gap: 6px;
      }
      .card {
        border: 1px solid var(--spectrum-gray-200);
        border-radius: var(--spectrum-corner-radius-75);
        padding: 6px 8px;
        background: var(--spectrum-background-layer-1-color);
      }
      .card strong {
        display: block;
      }
      .title,
      .meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .actions {
        display: flex;
        gap: 4px;
        margin-top: 4px;
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
    this.focusOn('sp-action-button');
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
      <strong>${cone.name}</strong>
      <div class="title" title=${cone.title}>${cone.title}</div>
      <div class="meta">${cone.messages} messages · ${label} · frozen ${ago(cone.frozenAt)}</div>
      <div class="actions">
        <sp-action-button size="s" quiet @click=${() => model.agent.thaw(cone.id)}>Thaw</sp-action-button>
        <sp-action-button size="s" quiet @click=${() => this.#delete(cone)}>Delete</sp-action-button>
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
          active?.kind === 'cone'
            ? html`<sp-action-button size="s" quiet @click=${() => model?.agent.freeze(active.id)}>Freeze ${active.name}</sp-action-button>`
            : ''
        }
      </div>
      <div class="list">
        ${cones.length ? cones.map((cone) => this.#card(cone)) : html`<div class="note">Nothing frozen. Freeze a cone to archive it with its scoops.</div>`}
      </div>`;
  }
}
