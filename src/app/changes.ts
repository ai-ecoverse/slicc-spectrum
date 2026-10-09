import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/action-group/swc-action-group.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Change, ChangesPort, SliccModel } from '../model/types.ts';
import { changesOf, ModelElement, shared, ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import {
  agentName,
  basename,
  errorCss,
  failure,
  panelCss,
  request,
  statusLabels,
  statusMark,
} from './files.ts';

const layouts = [
  ['unified', 'Unified'],
  ['split', 'Split'],
] as const;

function folder(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

function where(change: Change): string {
  const at = folder(change.path);
  if (!change.repo) return at;
  if (at === change.repo) return '';
  return at.startsWith(`${change.repo}/`) ? at.slice(change.repo.length + 1) : at;
}

export function author(model: SliccModel | null, change: Change): string | null {
  return change.agentId === null && change.repo ? null : agentName(model, change.agentId);
}

function lost(changes: readonly Change[]): string {
  const kind = changes.every((change) => change.repo) ? 'uncommitted' : 'pending';
  return `${changes.length === 1 ? 'Its' : 'Their'} ${kind} changes are discarded and can’t be undone.`;
}

const confirmRevert = (change: Change): Promise<boolean> =>
  confirm({ title: `Revert ${basename(change.path)}?`, body: lost([change]), action: 'Revert' });

export async function revertPaths(port: ChangesPort, paths: readonly string[]): Promise<string> {
  const errors: string[] = [];
  for (const path of paths) {
    try {
      await port.revert(path);
    } catch (error) {
      errors.push(failure(error));
    }
  }
  if (errors.length > 1) return `Couldn’t revert ${errors.length} files. ${errors[0]}`;
  return errors[0] ?? '';
}

export function groups(changes: readonly Change[]): Array<[string, Change[]]> {
  const byRepo = new Map<string, Change[]>();
  for (const change of changes) {
    const key = change.repo ?? '';
    byRepo.set(key, [...(byRepo.get(key) ?? []), change]);
  }
  return [...byRepo];
}

function errorLine(error: string): TemplateResult {
  return html`<div class="error" role="status" aria-live="polite">${
    error
      ? html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond><span>${error}</span>`
      : nothing
  }</div>`;
}

export class SliccChanges extends ModelElement {
  static properties = { ...ModelElement.properties, error: { state: true } };
  declare error: string;

  constructor() {
    super();
    this.error = '';
  }

  static styles = [
    shared,
    panelCss,
    errorCss,
    css`
      ul {
        list-style: none;
        margin: 0;
        padding: var(--swc-spacing-75) 0;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }
      ul ul {
        padding: 0;
        overflow: visible;
      }
      .repo {
        display: flex;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-50);
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .repo span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      li[data-path] {
        display: grid;
        grid-template-columns: auto minmax(0, auto) minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-height: var(--swc-component-height-100);
        padding: 0 var(--swc-spacing-75) 0 var(--swc-spacing-200);
        cursor: pointer;
      }
      li[data-path]:hover,
      li[data-path]:focus-within {
        background: var(--swc-gray-100);
      }
      li[data-path]:focus-visible {
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
      li[data-path]:hover .actions,
      li[data-path]:focus-within .actions {
        visibility: visible;
      }
      @media (hover: none), (pointer: coarse) {
        li[data-path] {
          min-height: var(--swc-component-height-200);
        }
        .actions {
          visibility: visible;
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [changesOf(model).on('changes', () => this.requestUpdate())];
  }

  focus(): void {
    this.focusOn('li[data-path]');
  }

  #port(): ChangesPort {
    return changesOf(this.model as SliccModel);
  }

  #accept(event: Event, path: string): void {
    event.stopPropagation();
    this.#port().accept(path);
  }

  async #revert(event: Event, change: Change): Promise<void> {
    event.stopPropagation();
    this.error = '';
    if (await confirmRevert(change)) this.error = await revertPaths(this.#port(), [change.path]);
  }

  async #all(action: 'accept' | 'revert'): Promise<void> {
    const port = this.#port();
    const changes = port.changes();
    this.error = '';
    if (action === 'accept') {
      for (const change of changes) port.accept(change.path);
      return;
    }
    const count = changes.length;
    const title = `Revert ${count} ${count === 1 ? 'change' : 'changes'}?`;
    if (await confirm({ title, body: lost(changes), action: 'Revert all' }))
      this.error = await revertPaths(
        port,
        changes.map((change) => change.path)
      );
  }

  #keydown(event: KeyboardEvent): void {
    const items = [...this.renderRoot.querySelectorAll<HTMLElement>('li[data-path]')];
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
    const by = author(this.model, change);
    const at = where(change);
    return html`<li
      tabindex="0"
      data-path=${change.path}
      title=${`${change.path}, ${change.status}${by ? ` by ${by}` : ''}`}
      @click=${() => request(this, 'open-diff', change.path)}
    >
      ${statusMark(change.status)}
      <span class="name">${basename(change.path)}</span>
      <span class="where"><bdi>${[at, by].filter(Boolean).join(' · ')}</bdi></span>
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
          @click=${(event: Event) => this.#revert(event, change)}
        >
          <swc-icon-revert slot="icon"></swc-icon-revert>
        </swc-action-button>
      </span>
    </li>`;
  }

  #list(changes: readonly Change[]): TemplateResult {
    const grouped = groups(changes);
    if (grouped.length < 2)
      return html`<ul aria-label="Pending changes" @keydown=${this.#keydown}>${changes.map((change) => this.#row(change))}</ul>`;
    return html`<ul aria-label="Pending changes" @keydown=${this.#keydown}>${grouped.map(
      ([repo, items]) => html`<li data-repo=${repo}>
        <div class="repo" title=${repo}>
          <span>${repo || 'Outside a repository'}</span>
          <span>${items.length}</span>
        </div>
        <ul aria-label=${repo || 'Outside a repository'}>${items.map((change) => this.#row(change))}</ul>
      </li>`
    )}</ul>`;
  }

  render(): TemplateResult {
    const port = this.model ? changesOf(this.model) : null;
    const unavailable = port?.unavailable?.() ?? null;
    if (unavailable) return html`<div class="note" data-unavailable>${unavailable}</div>`;
    const changes = port?.changes() ?? [];
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
      ${errorLine(this.error)}
      ${changes.length ? this.#list(changes) : html`<div class="note">No pending changes. Edits by agents show up here for review.</div>`}`;
  }
}

export class SliccDiffPanel extends ThemedElement {
  static properties = { ...ThemedElement.properties, path: {}, error: { state: true } };
  declare path: string;
  declare error: string;

  constructor() {
    super();
    this.path = '';
    this.error = '';
  }

  static styles = [
    shared,
    panelCss,
    errorCss,
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
    return [...super.subscribe(model), changesOf(model).on('changes', () => this.requestUpdate())];
  }

  async #revert(port: ChangesPort, change: Change): Promise<void> {
    this.error = '';
    if (await confirmRevert(change)) this.error = await revertPaths(port, [this.path]);
  }

  #body(change: Change, style: 'unified' | 'split'): TemplateResult {
    if (change.before === null && change.after === null) {
      return html`<div class="note" data-diff="none">
        No diff for this file: it’s binary or over 1 MB.
        ${
          change.status === 'deleted'
            ? nothing
            : html`<swc-action-button size="s" quiet @click=${() => request(this, 'open-file', this.path)}>Open the file</swc-action-button>`
        }
      </div>`;
    }
    return html`<slicc-diff-view
      path=${this.path}
      color=${this.color}
      diff-style=${style}
      .oldText=${change.before}
      .newText=${change.after}
    ></slicc-diff-view>`;
  }

  #style(style: 'unified' | 'split'): void {
    this.model?.settings.update({ diffStyle: style });
  }

  render(): TemplateResult {
    const model = this.model;
    const port = model ? changesOf(model) : null;
    const change = port?.changes().find((candidate) => candidate.path === this.path);
    const style = model?.settings.get().diffStyle ?? 'unified';
    if (!change) {
      return html`<div class="bar"><span class="path" title=${this.path}>${this.path}</span></div>
        <div class="note">
          No pending changes for this file.
          <swc-action-button size="s" quiet @click=${() => request(this, 'open-file', this.path)}>Open the file</swc-action-button>
        </div>`;
    }
    const by = author(model, change);
    return html`<div class="bar">
        ${statusMark(change.status, false)}
        <span class="path" title=${this.path}>${this.path}</span>
        <span>${statusLabels[change.status]}${by ? ` by ${by}` : ''}</span>
        <span class="spacer"></span>
        ${
          change.before === null && change.after === null
            ? nothing
            : html`<swc-action-group size="s" compact accessible-label="Diff layout">
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
        </swc-action-group>`
        }
        <swc-action-button size="s" quiet @click=${() => port?.accept(this.path)}>
          <swc-icon-checkmark slot="icon"></swc-icon-checkmark>Accept
        </swc-action-button>
        <swc-action-button size="s" quiet @click=${() => this.#revert(port as ChangesPort, change)}>
          <swc-icon-revert slot="icon"></swc-icon-revert>Revert
        </swc-action-button>
      </div>
      ${errorLine(this.error)}
      ${this.#body(change, style)}`;
  }
}
