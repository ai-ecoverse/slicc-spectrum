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
    background: var(--spectrum-background-layer-2-color);
    color: var(--spectrum-neutral-content-color-default);
    font-size: var(--spectrum-font-size-75);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    height: 32px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--spectrum-gray-200);
    background: var(--spectrum-background-layer-1-color);
    color: var(--spectrum-neutral-subdued-content-color-default);
    white-space: nowrap;
    overflow: hidden;
  }
  .bar .path {
    font-family: var(--spectrum-code-font-family-stack, ui-monospace, monospace);
    color: var(--spectrum-neutral-content-color-default);
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
    padding: 24px;
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .status {
    display: inline-block;
    width: 14px;
    text-align: center;
    font-weight: 700;
    font-family: var(--spectrum-code-font-family-stack, ui-monospace, monospace);
  }
  .status[data-status='added'] {
    color: var(--spectrum-positive-visual-color);
  }
  .status[data-status='modified'] {
    color: var(--spectrum-notice-visual-color);
  }
  .status[data-status='deleted'] {
    color: var(--spectrum-negative-visual-color);
  }
`;

export const letters = { added: 'A', modified: 'M', deleted: 'D' } as const;

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
  };
  declare path: string;
  declare text: string | null;
  declare missing: boolean;

  constructor() {
    super();
    this.path = '';
    this.text = null;
    this.missing = false;
  }

  static styles = [
    shared,
    panelCss,
    css`
      slicc-code-view {
        flex: 1;
        min-height: 0;
      }
    `,
  ];

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
            ? html`<span class="status" data-status=${change.status}>${letters[change.status]}</span>
              <span>${change.status} by ${agentName(this.model, change.agentId)}</span>
              <sp-action-button size="s" quiet @click=${() => request(this, 'open-diff', this.path)}>
                <sp-icon-compare slot="icon"></sp-icon-compare>Diff
              </sp-action-button>`
            : nothing
        }
      </div>
      ${
        this.missing
          ? html`<div class="note">This file doesn’t exist${change ? ' any more' : ''}.</div>`
          : html`<slicc-code-view path=${this.path} color=${this.color} .contents=${this.text}></slicc-code-view>`
      }`;
  }
}
