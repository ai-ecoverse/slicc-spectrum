import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { GitStatusEntry } from '../components/file-tree.ts';
import type { Change, FileEntry, SliccModel } from '../model/types.ts';
import { ModelElement, shared, ThemedElement } from './base.ts';

export function relative(path: string): string {
  return path.replace(/^\//, '');
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function treePaths(entries: readonly FileEntry[]): string[] {
  return entries.map((entry) => relative(entry.path) + (entry.kind === 'directory' ? '/' : ''));
}

export function treeStatus(changes: readonly Change[]): GitStatusEntry[] {
  return changes.map((change) => ({ path: relative(change.path), status: change.status }));
}

export function ancestors(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    const parts = relative(path).split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return [...out];
}

export function agentName(model: SliccModel | null, id: string | null): string {
  if (!id) return 'you';
  return model?.agent.list().find((agent) => agent.id === id)?.name ?? id;
}

export function request(target: EventTarget, type: 'open-file' | 'open-diff', path: string): void {
  target.dispatchEvent(new CustomEvent(type, { detail: { path }, bubbles: true, composed: true }));
}

export const panelCss = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--swc-background-layer-2-color);
    color: var(--swc-neutral-content-color-default);
    font-family: var(--swc-sans-font-family-stack);
    font-size: var(--swc-font-size-75);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-100);
    flex: none;
    min-height: var(--swc-component-height-100);
    padding: 0 var(--swc-spacing-100) 0 var(--swc-spacing-200);
    border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
    background: var(--swc-background-layer-1-color);
    color: var(--swc-neutral-subdued-content-color-default);
    white-space: nowrap;
    overflow: hidden;
  }
  .bar .path {
    font-family: var(--swc-code-font-family-stack);
    color: var(--swc-neutral-content-color-default);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  .note {
    padding: var(--swc-spacing-400);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .status {
    display: inline-block;
    min-width: var(--swc-spacing-300);
    text-align: center;
    font-weight: var(--swc-bold-font-weight);
    font-family: var(--swc-code-font-family-stack);
  }
  .status[data-status='added'] {
    color: var(--swc-positive-color-1000);
  }
  .status[data-status='modified'] {
    color: var(--swc-notice-color-1000);
  }
  .status[data-status='deleted'] {
    color: var(--swc-negative-color-1000);
  }
`;

export const letters = { added: 'A', modified: 'M', deleted: 'D' } as const;

export const statusLabels = { added: 'Added', modified: 'Modified', deleted: 'Deleted' } as const;

export function statusMark(status: Change['status'], announce = true): TemplateResult {
  return html`<span class="status" data-status=${status} title=${statusLabels[status]}
    ><span aria-hidden="true">${letters[status]}</span>${
      announce ? html`<span class="sr">${statusLabels[status]}</span>` : nothing
    }</span
  >`;
}

export class SliccFiles extends ModelElement {
  static properties = { ...ModelElement.properties, count: { state: true } };
  declare count: number;
  #entries: readonly FileEntry[] = [];
  #pending = false;

  constructor() {
    super();
    this.count = 0;
  }

  static styles = [
    shared,
    panelCss,
    css`
      slicc-file-tree {
        flex: 1;
        min-height: 0;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    void model.files.list().then((entries) => this.#load(entries));
    return [
      model.files.on('files', (entries) => this.#load(entries)),
      model.files.on('changes', () => this.#sync()),
    ];
  }

  focus(): void {
    if (this.count > 0) this.focusOn('slicc-file-tree');
    else this.#pending = true;
  }

  #tree():
    | (HTMLElement & {
        paths: readonly string[];
        gitStatus: readonly GitStatusEntry[];
        expanded: readonly string[];
      })
    | null {
    return this.renderRoot.querySelector('slicc-file-tree');
  }

  #load(entries: readonly FileEntry[]): void {
    this.#entries = entries;
    this.count = entries.filter((entry) => entry.kind === 'file').length;
    void this.updateComplete.then(() => this.#sync());
  }

  #sync(): void {
    const tree = this.#tree();
    const changes = this.model?.files.changes() ?? [];
    if (!tree) return;
    if (tree.paths.length === 0) tree.expanded = ancestors(changes.map((change) => change.path));
    tree.paths = treePaths(this.#entries);
    tree.gitStatus = treeStatus(changes);
    if (this.#pending) {
      this.#pending = false;
      requestAnimationFrame(() => tree.focus());
    }
  }

  #open(event: CustomEvent<{ path: string }>): void {
    event.stopPropagation();
    request(this, 'open-file', `/${event.detail.path}`);
  }

  render(): TemplateResult {
    return html`<div class="bar"><span>${this.count} files</span></div>
      <slicc-file-tree @file-open=${this.#open}></slicc-file-tree>`;
  }
}

export class SliccFileView extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    path: {},
    text: { state: true },
    missing: { state: true },
    draft: { state: true },
    saving: { state: true },
  };
  declare path: string;
  declare text: string | null;
  declare missing: boolean;
  declare draft: string | null;
  declare saving: boolean;

  constructor() {
    super();
    this.path = '';
    this.text = null;
    this.missing = false;
    this.draft = null;
    this.saving = false;
  }

  static styles = [
    shared,
    panelCss,
    css`
      slicc-code-view {
        flex: 1;
        min-height: 0;
      }
      textarea {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border: 0;
        resize: none;
        background: var(--swc-background-layer-2-color);
        color: var(--swc-code-color);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-code-size-xs);
        line-height: var(--swc-code-line-height);
        tab-size: 2;
      }
      textarea:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
    `,
  ];

  edit(): void {
    this.draft = this.text ?? '';
    void this.updateComplete.then(() => this.focusOn('textarea'));
  }

  cancel(): void {
    this.draft = null;
  }

  async save(): Promise<void> {
    const model = this.model;
    if (!model || this.draft === null) return;
    const draft = this.draft;
    this.saving = true;
    try {
      await model.files.write(this.path, draft);
      this.text = draft;
      this.missing = false;
      if (this.draft === draft) this.draft = null;
    } finally {
      this.saving = false;
    }
  }

  #keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.save();
    }
  }

  #actions(): TemplateResult {
    if (this.draft === null) {
      return html`<swc-action-button size="s" quiet ?disabled=${this.text === null} @click=${() => this.edit()}>
        <swc-icon-edit slot="icon"></swc-icon-edit>Edit
      </swc-action-button>`;
    }
    return html`<swc-action-button size="s" quiet @click=${() => this.cancel()}>Cancel</swc-action-button>
      <swc-button size="s" variant="accent" ?pending=${this.saving} ?disabled=${this.saving} @click=${() => this.save()}
        >Save</swc-button
      >`;
  }

  #body(change: unknown): TemplateResult {
    if (this.draft !== null) {
      return html`<textarea
        aria-label=${`Edit ${this.path}`}
        spellcheck="false"
        .value=${this.draft}
        @input=${(event: Event) => {
          this.draft = (event.target as HTMLTextAreaElement).value;
        }}
        @keydown=${this.#keydown}
      ></textarea>`;
    }
    if (this.missing) {
      return html`<div class="note">This file doesn’t exist${change ? ' any more' : ''}.</div>`;
    }
    return html`<slicc-code-view path=${this.path} color=${this.color} .contents=${this.text}></slicc-code-view>`;
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    void this.#read(model);
    return [
      ...super.subscribe(model),
      model.files.on('file', (path) => {
        if (path === this.path) void this.#read(model);
      }),
      model.files.on('changes', () => this.requestUpdate()),
    ];
  }

  async #read(model: SliccModel): Promise<void> {
    try {
      this.text = await model.files.read(this.path);
      this.missing = false;
    } catch {
      this.text = null;
      this.missing = true;
    }
  }

  render(): TemplateResult {
    const change = this.model?.files.changes().find((candidate) => candidate.path === this.path);
    return html`<div class="bar">
        <span class="path" title=${this.path}>${this.path}</span>
        <span class="spacer"></span>
        ${
          change
            ? html`${statusMark(change.status, false)}
              <span>${statusLabels[change.status]} by ${agentName(this.model, change.agentId)}</span>
              <swc-action-button size="s" quiet @click=${() => request(this, 'open-diff', this.path)}>
                <swc-icon-compare slot="icon"></swc-icon-compare>Diff
              </swc-action-button>`
            : nothing
        }
        ${this.#actions()}
      </div>
      ${this.#body(change)}`;
  }
}
