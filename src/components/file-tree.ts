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

const folderName = "[data-item-type='folder'] > [data-item-section='content']";

const rows = `
${folderName} {
  display: block;
  white-space: nowrap;
}
${folderName} :is([data-truncate-group-container], [data-truncate-segment-priority], [data-truncate-container], [data-truncate-grid]),
${folderName} [data-truncate-grid] > div:not([data-truncate-marker-cell], [data-truncate-fill]) {
  display: contents;
}
${folderName} :is([data-truncate-content='overflow'], [data-truncate-marker-cell], [data-truncate-fill]) {
  display: none;
}
${folderName} :is([data-item-flattened-subitems], [data-item-flattened-subitem]),
${folderName} [data-truncate-content='visible'] {
  display: inline;
  direction: inherit;
}
`;

function titled(root: ParentNode): void {
  for (const row of root.querySelectorAll<HTMLElement>("[data-type='item'][aria-label]")) {
    const name = row.getAttribute('aria-label') as string;
    if (row.title !== name) row.title = name;
  }
}

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
  #chosen: readonly string[] = [];
  #applying = false;
  #titles: MutationObserver | null = null;

  get paths(): readonly string[] {
    return this.#paths;
  }

  set paths(value: readonly string[]) {
    const expanded = this.#paths.length > 0 ? this.#held() : this.#expanded;
    this.#paths = value;
    this.#tree?.resetPaths(value, { initialExpandedPaths: expanded });
    this.#research();
    this.#matched();
  }

  #research(): void {
    const query = this.#query;
    if (!query || !this.#tree) return;
    this.#query = '';
    this.#tree.setSearch(null);
    this.#query = query;
    this.#tree.setSearch(query);
  }

  get query(): string {
    return this.#query;
  }

  set query(value: string) {
    const was = this.#query;
    this.#query = value;
    this.#tree?.setSearch(value || null);
    if (was && !value) this.expanded = this.#chosen;
    this.#matched();
  }

  #held(): readonly string[] {
    return this.#query ? this.#chosen : this.#expandedNow();
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
    const open = (path: string): boolean | null => {
      const item = tree?.getItem(path);
      return item && 'isExpanded' in item ? item.isExpanded() : null;
    };
    const shown = (path: string): boolean =>
      path
        .split('/')
        .slice(0, -2)
        .every((_, i, parts) => open(`${parts.slice(0, i + 1).join('/')}/`) !== false);
    return this.#paths
      .filter((path) => path.endsWith('/') && open(path) === true && shown(path))
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
    this.#apply();
  }

  #apply(): void {
    const tree = this.#tree;
    if (!tree || this.#paths.length === 0) return;
    if (this.#query) {
      this.#chosen = this.#expanded;
      return;
    }
    const wanted = new Set(this.#expanded);
    this.#applying = true;
    for (const path of this.#paths) {
      const item = path.endsWith('/') ? tree.getItem(path) : null;
      if (!item || !('isExpanded' in item)) continue;
      const open = wanted.has(path.slice(0, -1));
      if (item.isExpanded() === open) continue;
      if (open) item.expand();
      else item.collapse();
    }
    this.#applying = false;
    this.#chosen = this.#expandedNow();
  }

  #changed(): void {
    if (this.#applying || !this.#tree || this.#query) return;
    const expanded = this.#expandedNow();
    if (expanded.join('\n') === this.#chosen.join('\n')) return;
    this.#chosen = expanded;
    this.dispatchEvent(
      new CustomEvent('tree-expand', { detail: { expanded }, bubbles: true, composed: true })
    );
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
      unsafeCSS: rows,
      icons: { set: 'complete', colored: false },
      onSelectionChange: (paths) => this.#selected(paths),
      onSearchChange: (value) => this.#searched(value),
    });
    this.#tree.render({ containerWrapper: this.#mount });
    this.#title();
    this.#chosen = this.#query ? this.#expanded : this.#expandedNow();
    this.#tree.subscribe(() => this.#changed());
    this.#matched();
  }

  disconnectedCallback(): void {
    if (this.#paths.length > 0) this.#expanded = this.#held();
    this.#titles?.disconnect();
    this.#titles = null;
    this.#tree?.cleanUp();
    this.#tree = null;
    this.#mount?.replaceChildren();
  }

  #title(): void {
    const root = this.#tree?.getFileTreeContainer()?.shadowRoot;
    if (!root) return;
    titled(root);
    this.#titles = new MutationObserver(() => titled(root));
    this.#titles.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
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
