import { FileTree, type GitStatusEntry } from '@pierre/trees';
import { FileTreeContainerLoaded } from '@pierre/trees/web-components';
import { adoptStyles } from './sheets.ts';

export type { GitStatusEntry };

export interface TreeView {
  scroll: number;
  selected: readonly string[];
  focused: string | null;
  shown: boolean;
}

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

const gestures = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;

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
  #want: TreeView | null = null;
  #back: TreeView | null = null;
  #hold: TreeView | null = null;
  #quiet = false;
  #told = '';
  #scroller: HTMLElement | null = null;
  #top = 0;
  #height = 0;
  #set = -1;
  #user = false;
  #gesture = (): void => {
    this.#user = true;
  };
  #resize = new ResizeObserver(() => {
    this.#measure();
    this.#scrollBack();
  });
  #scrolled = (): void => this.#onScroll();

  get paths(): readonly string[] {
    return this.#paths;
  }

  set paths(value: readonly string[]) {
    const expanded = this.#paths.length > 0 ? this.#held() : this.#expanded;
    this.#paths = value;
    this.#tree?.resetPaths(value, { initialExpandedPaths: expanded });
    this.#research();
    this.#matched();
    this.#restore();
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

  get view(): TreeView {
    const tree = this.#tree;
    const back = this.#back;
    const index = tree?.getFocusedIndex() ?? -1;
    const height = tree?.getItemHeight() ?? 0;
    const top = this.#top;
    return {
      scroll: back ? back.scroll : top,
      selected: tree?.getSelectedPaths() ?? [],
      focused: tree?.getFocusedPath() ?? null,
      shown: back
        ? back.shown
        : index >= 0 && index * height >= top && (index + 1) * height <= top + this.#height,
    };
  }

  set view(value: TreeView) {
    this.#want = value;
    this.#back = value;
    this.#restore();
  }

  #restore(): void {
    const tree = this.#tree;
    const want = this.#want;
    if (want && tree && this.#paths.length > 0) {
      this.#want = null;
      this.#quiet = true;
      for (const path of tree.getSelectedPaths())
        if (!want.selected.includes(path)) tree.getItem(path)?.deselect();
      for (const path of want.selected) tree.getItem(path)?.select();
      if (want.focused) tree.focusPath(want.focused);
      this.#quiet = false;
    }
    this.#scrollBack();
  }

  #scrollBack(): void {
    const back = this.#back ?? this.#hold;
    const el = this.#scroller;
    const tree = this.#tree;
    if (!back || !el || !tree || this.#want || !el.clientHeight) return;
    if (el.scrollHeight + 1 < tree.getVisibleCount() * tree.getItemHeight()) return;
    this.#back = null;
    this.#hold = back;
    const index = tree.getFocusedIndex();
    const height = tree.getItemHeight();
    let top = Math.min(back.scroll, el.scrollHeight - el.clientHeight);
    if (back.shown && index >= 0)
      top = Math.min(Math.max(top, (index + 1) * height - el.clientHeight), index * height);
    el.scrollTop = top;
    this.#set = el.scrollTop;
    this.#user = false;
    this.#measure();
  }

  #measure(): void {
    const el = this.#scroller;
    if (!el?.clientHeight) return;
    this.#top = el.scrollTop;
    this.#height = el.clientHeight;
  }

  #onScroll(): void {
    this.#measure();
    const el = this.#scroller;
    if (!el?.clientHeight || this.#want || Math.abs(el.scrollTop - this.#set) < 1) return;
    if ((this.#back || this.#hold) && !this.#user) return;
    this.#set = -1;
    this.#back = null;
    this.#hold = null;
    this.#tell(true);
  }

  #tell(always = false): void {
    if (this.#want || this.#quiet || this.#paths.length === 0 || !this.isConnected) return;
    const view = this.view;
    const told = `${view.selected.join('\n')}\n\n${view.focused}`;
    if (!always && told === this.#told) return;
    this.#told = told;
    this.dispatchEvent(
      new CustomEvent('tree-view', { detail: view, bubbles: true, composed: true })
    );
  }

  #changed(): void {
    this.#tell();
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
      icons: { set: 'complete', colored: false },
      onSelectionChange: (paths) => this.#selected(paths),
      onSearchChange: (value) => this.#searched(value),
    });
    this.#tree.render({ containerWrapper: this.#mount });
    this.#chosen = this.#query ? this.#expanded : this.#expandedNow();
    this.#tree.subscribe(() => this.#changed());
    this.#watch();
    this.#matched();
    this.#restore();
  }

  #watch(): void {
    const root = this.#tree?.getFileTreeContainer()?.shadowRoot;
    const el = root?.querySelector<HTMLElement>('[data-file-tree-virtualized-scroll]') ?? null;
    this.#scroller = el;
    if (!el) return;
    el.addEventListener('scroll', this.#scrolled, { passive: true });
    for (const type of gestures) el.addEventListener(type, this.#gesture, { passive: true });
    this.#set = -1;
    this.#user = false;
    this.#resize.observe(el);
    const list = el.querySelector('[data-file-tree-virtualized-list]');
    if (list) this.#resize.observe(list);
  }

  disconnectedCallback(): void {
    if (this.#paths.length > 0 && !this.#want) {
      const view = this.view;
      this.#want = view;
      this.#back = view;
    }
    this.#scroller?.removeEventListener('scroll', this.#scrolled);
    for (const type of gestures) this.#scroller?.removeEventListener(type, this.#gesture);
    this.#scroller = null;
    this.#hold = null;
    this.#resize.disconnect();
    if (this.#paths.length > 0) this.#expanded = this.#held();
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
    if (paths.length === 1 && !this.#quiet) this.#open(paths[0]);
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
    this.#hold = null;
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
