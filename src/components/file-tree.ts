import { FileTree, type GitStatusEntry } from '@pierre/trees';
import { FileTreeContainerLoaded } from '@pierre/trees/web-components';
import { adoptStyles } from './sheets.ts';

export type { GitStatusEntry };

const css = `
:host {
  display: block;
  height: 100%;
  min-height: 0;
  --trees-bg-override: transparent;
  --trees-fg-override: var(--swc-neutral-content-color-default);
  --trees-fg-muted-override: var(--swc-neutral-subdued-content-color-default);
  --trees-accent-override: var(--swc-accent-visual-color);
  --trees-border-color-override: var(--swc-gray-200);
  --trees-selected-bg-override: var(--swc-accent-subtle-background-color-default);
  --trees-selected-fg-override: var(--swc-neutral-content-color-default);
  --trees-focus-ring-color-override: var(--swc-focus-indicator-color);
  --trees-font-family-override: var(--swc-sans-font-family-stack);
  --trees-font-size-override: var(--swc-font-size-75);
  --trees-git-added-color-override: var(--swc-positive-color-1000);
  --trees-git-modified-color-override: var(--swc-notice-color-1000);
  --trees-git-deleted-color-override: var(--swc-negative-color-1000);
}

.mount {
  height: 100%;
}

:host([data-empty]) .mount {
  display: none;
}

file-tree-container {
  color-scheme: inherit;
}
`;

function seed(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 &&
    /^[\p{L}\p{N}]$/u.test(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

export class SliccFileTree extends HTMLElement {
  static loaded = FileTreeContainerLoaded;
  #tree: FileTree | null = null;
  #paths: readonly string[] = [];
  #status: readonly GitStatusEntry[] = [];
  #expanded: readonly string[] = [];
  #mount: HTMLElement | null = null;
  #query = '';

  get paths(): readonly string[] {
    return this.#paths;
  }

  set paths(value: readonly string[]) {
    const expanded = this.#paths.length > 0 ? this.#expandedNow() : this.#expanded;
    this.#paths = value;
    this.#tree?.resetPaths(value, { initialExpandedPaths: expanded });
    if (this.#query) this.#tree?.setSearch(this.#query);
    this.#matched();
  }

  get query(): string {
    return this.#query;
  }

  set query(value: string) {
    this.#query = value;
    this.#tree?.setSearch(value || null);
    this.#matched();
  }

  get empty(): boolean {
    return this.hasAttribute('data-empty');
  }

  #matched(): void {
    const empty = !!this.#query && !!this.#tree && this.#tree.getSearchMatchingPaths().length === 0;
    if (empty === this.empty) return;
    this.toggleAttribute('data-empty', empty);
    this.dispatchEvent(
      new CustomEvent('tree-matches', { detail: { empty }, bubbles: true, composed: true })
    );
  }

  #searched(value: string | null): void {
    if (value !== null || !this.#query) return;
    this.#query = '';
    this.#matched();
    this.dispatchEvent(new CustomEvent('tree-search-close', { bubbles: true, composed: true }));
  }

  #expandedNow(): string[] {
    const tree = this.#tree;
    return this.#paths
      .filter((path) => {
        const item = path.endsWith('/') ? tree?.getItem(path) : null;
        return !!item && 'isExpanded' in item && item.isExpanded();
      })
      .map((path) => path.slice(0, -1));
  }

  get gitStatus(): readonly GitStatusEntry[] {
    return this.#status;
  }

  set gitStatus(value: readonly GitStatusEntry[]) {
    this.#status = value;
    this.#tree?.setGitStatus(value);
  }

  get expanded(): readonly string[] {
    return this.#expanded;
  }

  set expanded(value: readonly string[]) {
    this.#expanded = value;
  }

  get tree(): FileTree | null {
    return this.#tree;
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open', delegatesFocus: true });
    if (!this.#mount) {
      adoptStyles(root, css);
      this.#mount = document.createElement('div');
      this.#mount.className = 'mount';
      root.append(this.#mount);
      root.addEventListener('keydown', (event) => this.#keydown(event as KeyboardEvent));
    }
    this.#tree = new FileTree({
      paths: this.#paths,
      gitStatus: this.#status,
      initialExpandedPaths: this.#expanded,
      flattenEmptyDirectories: true,
      search: false,
      initialSearchQuery: this.#query || null,
      density: 'compact',
      icons: { set: 'complete', colored: false },
      onSelectionChange: (paths) => this.#selected(paths),
      onSearchChange: (value) => this.#searched(value),
    });
    this.#tree.render({ containerWrapper: this.#mount });
    this.#matched();
  }

  disconnectedCallback(): void {
    this.#tree?.cleanUp();
    this.#tree = null;
    this.#mount?.replaceChildren();
  }

  #open(path: string | null | undefined): void {
    const item = path ? this.#tree?.getItem(path) : null;
    if (!item || item.isDirectory()) return;
    this.dispatchEvent(
      new CustomEvent('file-open', { detail: { path }, bubbles: true, composed: true })
    );
  }

  #selected(paths: readonly string[]): void {
    if (paths.length === 1) this.#open(paths[0]);
  }

  #keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (seed(event)) {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent('tree-search', {
          detail: { key: event.key },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }
    if (event.key !== 'Enter') return;
    this.#open(this.#tree?.getFocusedPath());
  }

  focus(): void {
    const tree = this.#tree;
    const path = tree?.getFocusedPath() ?? tree?.getVisibleRows(0, 1)[0]?.path;
    if (path) this.reveal(path);
  }

  #row(path: string): HTMLElement | null {
    const container = this.#tree?.getFileTreeContainer();
    return (
      container?.shadowRoot?.querySelector<HTMLElement>(`[data-item-path="${CSS.escape(path)}"]`) ??
      null
    );
  }

  reveal(path: string, focus = true): void {
    this.#tree?.scrollToPath(path, { focus });
    if (!focus) return;
    const row = this.#row(path);
    if (row) row.focus();
    else requestAnimationFrame(() => this.#row(path)?.focus());
  }
}

export function defineFileTree(): void {
  if (!customElements.get('slicc-file-tree'))
    customElements.define('slicc-file-tree', SliccFileTree);
}
