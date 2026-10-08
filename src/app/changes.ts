import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/action-group/swc-action-group.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Change, SliccModel } from '../model/types.ts';
import { ModelElement, shared, ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { agentName, basename, panelCss, request, statusLabels, statusMark } from './files.ts';

const layouts = [
  ['unified', 'Unified'],
  ['split', 'Split'],
] as const;

function folder(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

const confirmRevert = (path: string): Promise<boolean> =>
  confirm({
    title: `Revert ${basename(path)}?`,
    body: `This discards the agent’s edits to ${path}. You can’t undo this.`,
    action: 'Revert',
  });

export class SliccChanges extends ModelElement {
  static styles = [
    shared,
    panelCss,
    css`
      ul {
        list-style: none;
        margin: 0;
        padding: var(--swc-spacing-75) 0;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }
      li {
        display: grid;
        grid-template-columns: auto minmax(0, auto) minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-height: var(--swc-component-height-100);
        padding: 0 var(--swc-spacing-75) 0 var(--swc-spacing-200);
        cursor: pointer;
      }
      li:hover,
      li:focus-within {
        background: var(--swc-gray-100);
      }
      li:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .name {
        font-weight: var(--swc-bold-font-weight);
        white-space: nowrap;
      }
      .where {
        color: var(--swc-neutral-subdued-content-color-default);
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
      @media (hover: none), (pointer: coarse) {
        li {
          min-height: var(--swc-component-height-200);
        }
        .actions {
          visibility: visible;
        }
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

  async #revert(event: Event, path: string): Promise<void> {
    event.stopPropagation();
    if (await confirmRevert(path)) await this.model?.files.revert(path);
  }

  async #all(action: 'accept' | 'revert'): Promise<void> {
    const files = this.model?.files;
    const changes = files?.changes() ?? [];
    const count = changes.length;
    const title = `Revert ${count} ${count === 1 ? 'change' : 'changes'}?`;
    const body = 'This discards the agents’ edits and puts every file back. You can’t undo this.';
    if (action === 'revert' && !(await confirm({ title, body, action: 'Revert all' }))) return;
    for (const change of changes) {
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
      ${statusMark(change.status)}
      <span class="name">${basename(change.path)}</span>
      <span class="where"><bdi>${folder(change.path)} · ${agentName(this.model, change.agentId)}</bdi></span>
      <span class="actions">
        <swc-action-button
          size="xs"
          quiet
          accessible-label=${`Accept ${basename(change.path)}`}
          title="Accept"
          @click=${(event: Event) => this.#accept(event, change.path)}
        >
          <swc-icon-checkmark slot="icon"></swc-icon-checkmark>
        </swc-action-button>
        <swc-action-button
          size="xs"
          quiet
          accessible-label=${`Revert ${basename(change.path)}`}
          title="Revert"
          @click=${(event: Event) => this.#revert(event, change.path)}
        >
          <swc-icon-revert slot="icon"></swc-icon-revert>
        </swc-action-button>
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
            ? html`<swc-action-button size="s" quiet @click=${() => this.#all('accept')}>Accept all</swc-action-button>
              <swc-action-button size="s" quiet @click=${() => this.#all('revert')}>Revert all</swc-action-button>`
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
      swc-action-group {
        flex: none;
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
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [...super.subscribe(model), model.files.on('changes', () => this.requestUpdate())];
  }

  async #revert(): Promise<void> {
    if (await confirmRevert(this.path)) await this.model?.files.revert(this.path);
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
          <swc-action-button size="s" quiet @click=${() => request(this, 'open-file', this.path)}>Open the file</swc-action-button>
        </div>`;
    }
    return html`<div class="bar">
        ${statusMark(change.status, false)}
        <span class="path" title=${this.path}>${this.path}</span>
        <span>${statusLabels[change.status]} by ${agentName(model, change.agentId)}</span>
        <span class="spacer"></span>
        <swc-action-group size="s" compact accessible-label="Diff layout">
          ${layouts.map(
            ([value, label]) =>
              html`<swc-action-button
                class=${value === style ? 'selected' : ''}
                data-value=${value}
                accessible-label=${value === style ? `${label}, selected` : label}
                @click=${() => this.#style(value)}
                >${label}</swc-action-button
              >`
          )}
        </swc-action-group>
        <swc-action-button size="s" quiet @click=${() => model?.files.accept(this.path)}>
          <swc-icon-checkmark slot="icon"></swc-icon-checkmark>Accept
        </swc-action-button>
        <swc-action-button size="s" quiet @click=${() => this.#revert()}>
          <swc-icon-revert slot="icon"></swc-icon-revert>Revert
        </swc-action-button>
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
