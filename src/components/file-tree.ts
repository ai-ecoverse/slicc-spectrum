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
  --trees-fg-override: var(--spectrum-neutral-content-color-default, #292929);
  --trees-fg-muted-override: var(--spectrum-neutral-subdued-content-color-default, #505050);
  --trees-accent-override: var(--spectrum-accent-visual-color, #4b75ff);
  --trees-border-color-override: var(--spectrum-gray-200, #e1e1e1);
  --trees-selected-bg-override: color-mix(in srgb, var(--spectrum-accent-visual-color, #4b75ff) 14%, transparent);
  --trees-selected-fg-override: var(--spectrum-neutral-content-color-default, #292929);
  --trees-focus-ring-color-override: var(--spectrum-focus-indicator-color, #4b75ff);
  --trees-font-family-override: var(--spectrum-sans-font-family-stack, system-ui, sans-serif);
  --trees-font-size-override: var(--spectrum-font-size-75, 12px);
  --trees-search-bg-override: var(--spectrum-background-layer-2-color, #fff);
  --trees-git-added-color-override: var(--spectrum-positive-visual-color, #079355);
  --trees-git-modified-color-override: var(--spectrum-notice-visual-color, #d45b00);
  --trees-git-deleted-color-override: var(--spectrum-negative-visual-color, #f03823);
}

.mount {
  height: 100%;
}
`;

export class SliccFileTree extends HTMLElement {
  static loaded = FileTreeContainerLoaded;
  #tree: FileTree | null = null;
  #paths: readonly string[] = [];
  #status: readonly GitStatusEntry[] = [];
  #expanded: readonly string[] = [];
  #mount: HTMLElement | null = null;

  get paths(): readonly string[] {
    return this.#paths;
  }

  set paths(value: readonly string[]) {
    const expanded = this.#paths.length > 0 ? this.#expandedNow() : this.#expanded;
    this.#paths = value;
    this.#tree?.resetPaths(value, { initialExpandedPaths: expanded });
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
      search: true,
      density: 'compact',
      onSelectionChange: (paths) => this.#selected(paths),
    });
    this.#tree.render({ containerWrapper: this.#mount });
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
    if (event.key !== 'Enter' || event.defaultPrevented) return;
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
