import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-folder-add.js';
import type { FileTree } from '@pierre/trees';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { GitStatusEntry } from '../components/file-tree.ts';
import type { Change, FileEntry, FilePort, SliccModel } from '../model/types.ts';
import { changesOf, ModelElement, shared, ThemedElement } from './base.ts';

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

export function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const errorCss = css`
  .error {
    display: flex;
    align-items: flex-start;
    gap: var(--swc-spacing-75);
    flex: none;
    color: var(--swc-negative-content-color-default);
    background: var(--swc-background-layer-1-color);
    white-space: normal;
  }
  .error:not(:empty) {
    padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-75) var(--swc-spacing-200);
    border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
  }
  .error swc-icon-alert-diamond {
    flex: none;
    color: var(--swc-negative-content-color-default);
  }
`;

export class SliccFiles extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    count: { state: true },
    mounted: { state: true },
    mounting: { state: true },
    ejecting: { state: true },
    waiting: { state: true },
    inserting: { state: true },
    error: { state: true },
  };
  declare count: number;
  declare mounted: readonly string[];
  declare mounting: boolean;
  declare ejecting: ReadonlySet<string>;
  declare waiting: readonly string[];
  declare inserting: ReadonlySet<string>;
  declare error: string;
  #entries: readonly FileEntry[] = [];
  #pending = false;
  #reveal: string | null = null;

  constructor() {
    super();
    this.count = 0;
    this.mounted = [];
    this.mounting = false;
    this.ejecting = new Set();
    this.waiting = [];
    this.inserting = new Set();
    this.error = '';
  }

  static styles = [
    shared,
    panelCss,
    errorCss,
    css`
      :host {
        container-type: inline-size;
      }
      slicc-file-tree {
        flex: 1;
        min-height: 0;
      }
      .total {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mount {
        flex: none;
      }
      .mounts {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-75) var(--swc-spacing-200);
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
      }
      .mounts .heading {
        color: var(--swc-neutral-subdued-content-color-default);
        font-weight: var(--swc-bold-font-weight);
      }
      .mounts ul {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .mounts li {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-height: var(--swc-component-height-75);
      }
      .mounts .path {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: var(--swc-code-font-family-stack);
      }
      @container (min-width: 221px) {
        .mount + swc-tooltip {
          display: none;
        }
      }
      @container (max-width: 220px) {
        .mount {
          --swc-action-button-gap: 0;
          --swc-action-button-edge-to-text: var(--swc-spacing-75);
          --swc-action-button-edge-to-visual: var(--swc-spacing-75);
        }
        .mount .label {
          display: none;
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    void model.files.list().then((entries) => this.#load(entries));
    this.#mounts(model.files);
    return [
      model.files.on('files', (entries) => this.#load(entries)),
      changesOf(model).on('changes', () => this.#sync()),
      model.files.on('mounts', () => this.#mounts(model.files)),
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
        tree: FileTree | null;
        reveal(path: string, focus?: boolean): void;
      })
    | null {
    return this.renderRoot.querySelector('slicc-file-tree');
  }

  #load(entries: readonly FileEntry[]): void {
    this.#entries = entries;
    this.count = entries.filter((entry) => entry.kind === 'file').length;
    void this.updateComplete.then(() => this.#sync());
  }

  #mounts(files: FilePort): void {
    this.mounted = files.mounts?.() ?? [];
    this.waiting = files.needsFolder?.() ?? [];
  }

  #sync(): void {
    const tree = this.#tree();
    const changes = this.model ? changesOf(this.model).changes() : [];
    if (!tree) return;
    if (tree.paths.length === 0) tree.expanded = ancestors(changes.map((change) => change.path));
    tree.paths = treePaths(this.#entries);
    tree.gitStatus = treeStatus(changes);
    this.#show();
    if (this.#pending) {
      this.#pending = false;
      requestAnimationFrame(() => tree.focus());
    }
  }

  #show(): void {
    const tree = this.#tree();
    const path = this.#reveal;
    if (!tree || !path || !tree.paths.includes(path)) return;
    this.#reveal = null;
    const item = tree.tree?.getItem(path);
    if (item && 'expand' in item) item.expand();
    item?.select();
    tree.reveal(path, false);
  }

  #busy(at: string | undefined, on: boolean): void {
    if (at === undefined) {
      this.mounting = on;
      return;
    }
    const inserting = new Set(this.inserting);
    if (on) inserting.add(at);
    else inserting.delete(at);
    this.inserting = inserting;
  }

  #mount(mountFolder: (path?: string) => Promise<string | null>, at?: string): void {
    const result = at === undefined ? mountFolder() : mountFolder(at);
    this.error = '';
    this.#busy(at, true);
    result
      .then(
        (path) => {
          if (!path) return;
          this.#reveal = `${relative(path)}/`;
          this.#show();
        },
        (error: unknown) => {
          this.error = failure(error);
        }
      )
      .finally(() => this.#busy(at, false));
  }

  #eject(eject: (path: string) => Promise<void>, path: string): void {
    const result = eject(path);
    this.error = '';
    this.ejecting = new Set([...this.ejecting, path]);
    result
      .catch((error: unknown) => {
        this.error = failure(error);
      })
      .finally(() => {
        const ejecting = new Set(this.ejecting);
        ejecting.delete(path);
        this.ejecting = ejecting;
      });
  }

  #open(event: CustomEvent<{ path: string }>): void {
    event.stopPropagation();
    request(this, 'open-file', `/${event.detail.path}`);
  }

  #mountButton(files: FilePort | undefined): TemplateResult | typeof nothing {
    if (typeof files?.mountFolder !== 'function') return nothing;
    const mountFolder = files.mountFolder.bind(files);
    const label = 'Mount a folder…';
    return html`<swc-action-button
        id="mount"
        class="mount"
        size="s"
        quiet
        data-action="mount-folder"
        accessible-label=${label}
        ?pending=${this.mounting}
        @click=${() => this.#mount(mountFolder)}
        ><swc-icon-folder-add slot="icon"></swc-icon-folder-add><span class="label">${label}</span></swc-action-button
      ><swc-tooltip for="mount" placement="bottom">${label}</swc-tooltip>`;
  }

  #waiting(files: FilePort | undefined): TemplateResult | typeof nothing {
    if (this.waiting.length === 0) return nothing;
    const mountFolder = files?.mountFolder?.bind(files);
    return html`<section class="mounts" aria-labelledby="waiting">
      <span class="heading" id="waiting">Needs a folder</span>
      <ul aria-labelledby="waiting">
        ${this.waiting.map(
          (path) => html`<li>
            <span class="path" title=${`${path} needs a folder`}>${path}</span>
            ${
              mountFolder
                ? html`<swc-action-button
                    size="s"
                    quiet
                    data-action="insert-folder"
                    data-id=${path}
                    accessible-label=${`Insert folder at ${path}`}
                    ?pending=${this.inserting.has(path)}
                    @click=${() => this.#mount(mountFolder, path)}
                    >Insert folder…</swc-action-button
                  >`
                : nothing
            }
          </li>`
        )}
      </ul>
    </section>`;
  }

  #strip(files: FilePort | undefined): TemplateResult | typeof nothing {
    if (this.mounted.length === 0) return nothing;
    const eject = files?.eject?.bind(files);
    return html`<section class="mounts" aria-labelledby="mounted">
      <span class="heading" id="mounted">Mounted</span>
      <ul aria-labelledby="mounted">
        ${this.mounted.map(
          (path) => html`<li>
            <span class="path" title=${path}>${path}</span>
            ${
              eject
                ? html`<swc-action-button
                    size="s"
                    quiet
                    data-action="eject"
                    data-path=${path}
                    accessible-label=${`Eject ${path}`}
                    ?pending=${this.ejecting.has(path)}
                    @click=${() => this.#eject(eject, path)}
                    >Eject</swc-action-button
                  >`
                : nothing
            }
          </li>`
        )}
      </ul>
    </section>`;
  }

  render(): TemplateResult {
    const files = this.model?.files;
    return html`<div class="bar"><span class="total">${this.count} files</span><span class="spacer"></span>${this.#mountButton(files)}</div>
      <div class="error" role="status" aria-live="polite">${
        this.error
          ? html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond><span>${this.error}</span>`
          : nothing
      }</div>
      ${this.#waiting(files)}
      ${this.#strip(files)}
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
      changesOf(model).on('changes', () => this.requestUpdate()),
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
    const change = this.model
      ? changesOf(this.model)
          .changes()
          .find((candidate) => candidate.path === this.path)
      : undefined;
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
