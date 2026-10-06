import { css, html, nothing, type TemplateResult } from 'lit';
import type { Change, SliccModel } from '../model/types.ts';
import { ModelElement, shared, ThemedElement } from './base.ts';
import { agentName, basename, letters, panelCss, request } from './files.ts';

function folder(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

export class SliccChanges extends ModelElement {
  static styles = [
    shared,
    panelCss,
    css`
      ul {
        list-style: none;
        margin: 0;
        padding: 4px 0;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }
      li {
        display: grid;
        grid-template-columns: auto minmax(0, auto) minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        height: 28px;
        padding: 0 4px 0 10px;
        cursor: pointer;
        outline: none;
      }
      li:hover,
      li:focus-within {
        background: var(--spectrum-gray-100);
      }
      li:focus-visible {
        box-shadow: inset 0 0 0 2px var(--spectrum-focus-indicator-color);
      }
      .name {
        font-weight: 600;
        white-space: nowrap;
      }
      .where {
        color: var(--spectrum-neutral-subdued-content-color-default);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: rtl;
        text-align: left;
      }
      .actions {
        display: flex;
        visibility: hidden;
      }
      li:hover .actions,
      li:focus-within .actions {
        visibility: visible;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.files.on('changes', () => this.requestUpdate())];
  }

  focus(): void {
    this.focusOn('li');
  }

  #accept(event: Event, path: string): void {
    event.stopPropagation();
    this.model?.files.accept(path);
  }

  #revert(event: Event, path: string): void {
    event.stopPropagation();
    void this.model?.files.revert(path);
  }

  #all(action: 'accept' | 'revert'): void {
    const files = this.model?.files;
    for (const change of files?.changes() ?? []) {
      if (action === 'accept') files?.accept(change.path);
      else void files?.revert(change.path);
    }
  }

  #keydown(event: KeyboardEvent): void {
    const items = [...this.renderRoot.querySelectorAll<HTMLElement>('li')];
    const index = items.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLElement);
    if (index < 0) return;
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, moves[event.key]))].focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      request(this, 'open-diff', items[index].dataset.path as string);
    }
  }

  #row(change: Change): TemplateResult {
    return html`<li
      tabindex="0"
      data-path=${change.path}
      title=${`${change.path}, ${change.status} by ${agentName(this.model, change.agentId)}`}
      @click=${() => request(this, 'open-diff', change.path)}
    >
      <span class="status" data-status=${change.status} aria-label=${change.status}>${letters[change.status]}</span>
      <span class="name">${basename(change.path)}</span>
      <span class="where"><bdi>${folder(change.path)} · ${agentName(this.model, change.agentId)}</bdi></span>
      <span class="actions">
        <sp-action-button size="xs" quiet label="Accept" title="Accept" @click=${(event: Event) => this.#accept(event, change.path)}>
          <sp-icon-checkmark slot="icon"></sp-icon-checkmark>
        </sp-action-button>
        <sp-action-button size="xs" quiet label="Revert" title="Revert" @click=${(event: Event) => this.#revert(event, change.path)}>
          <sp-icon-revert slot="icon"></sp-icon-revert>
        </sp-action-button>
      </span>
    </li>`;
  }

  render(): TemplateResult {
    const changes = this.model?.files.changes() ?? [];
    return html`<div class="bar">
        <span>${changes.length} pending ${changes.length === 1 ? 'change' : 'changes'}</span>
        <span class="spacer"></span>
        ${
          changes.length
            ? html`<sp-action-button size="s" quiet @click=${() => this.#all('accept')}>Accept all</sp-action-button>
              <sp-action-button size="s" quiet @click=${() => this.#all('revert')}>Revert all</sp-action-button>`
            : nothing
        }
      </div>
      ${
        changes.length
          ? html`<ul aria-label="Pending changes" @keydown=${this.#keydown}>${changes.map((change) => this.#row(change))}</ul>`
          : html`<div class="note">No pending changes. Edits by agents show up here for review.</div>`
      }`;
  }
}

export class SliccDiffPanel extends ThemedElement {
  static properties = { ...ThemedElement.properties, path: {} };
  declare path: string;

  constructor() {
    super();
    this.path = '';
  }

  static styles = [
    shared,
    panelCss,
    css`
      slicc-diff-view {
        flex: 1;
        min-height: 0;
      }
      sp-action-group {
        flex: none;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [...super.subscribe(model), model.files.on('changes', () => this.requestUpdate())];
  }

  #style(style: 'unified' | 'split'): void {
    this.model?.settings.update({ diffStyle: style });
  }

  render(): TemplateResult {
    const model = this.model;
    const change = model?.files.changes().find((candidate) => candidate.path === this.path);
    const style = model?.settings.get().diffStyle ?? 'unified';
    if (!change) {
      return html`<div class="bar"><span class="path" title=${this.path}>${this.path}</span></div>
        <div class="note">
          No pending changes for this file.
          <sp-action-button size="s" quiet @click=${() => request(this, 'open-file', this.path)}>Open the file</sp-action-button>
        </div>`;
    }
    return html`<div class="bar">
        <span class="status" data-status=${change.status}>${letters[change.status]}</span>
        <span class="path" title=${this.path}>${this.path}</span>
        <span>${change.status} by ${agentName(model, change.agentId)}</span>
        <span class="spacer"></span>
        <sp-action-group size="s" compact quiet selects="single" label="Diff layout">
          <sp-action-button value="unified" ?selected=${style === 'unified'} @click=${() => this.#style('unified')}>Unified</sp-action-button>
          <sp-action-button value="split" ?selected=${style === 'split'} @click=${() => this.#style('split')}>Split</sp-action-button>
        </sp-action-group>
        <sp-action-button size="s" quiet @click=${() => model?.files.accept(this.path)}>
          <sp-icon-checkmark slot="icon"></sp-icon-checkmark>Accept
        </sp-action-button>
        <sp-action-button size="s" quiet @click=${() => model?.files.revert(this.path)}>
          <sp-icon-revert slot="icon"></sp-icon-revert>Revert
        </sp-action-button>
      </div>
      <slicc-diff-view
        path=${this.path}
        color=${this.color}
        diff-style=${style}
        .oldText=${change.before}
        .newText=${change.after}
      ></slicc-diff-view>`;
  }
}
