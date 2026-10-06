import {
  type AddPanelOptions,
  createDockview,
  type DockviewApi,
  type DockviewTheme,
  type IDockviewPanel,
  type SerializedDockview,
} from 'dockview-core';
import dockview from 'dockview-core/css';
import css from './dock.css';
import { adoptStyles } from './sheets.ts';

export type PanelParams = Record<string, unknown>;
export type PanelFactory = (params: PanelParams) => HTMLElement;
export type { AddPanelOptions, DockviewApi, IDockviewPanel, SerializedDockview };

export const theme: DockviewTheme = {
  name: 'spectrum',
  className: 'slicc-dock-theme',
  gap: 0,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
};

export class SliccDock extends HTMLElement {
  factories: Record<string, PanelFactory> = {};
  #api: DockviewApi | null = null;
  #contents = new Map<string, HTMLElement>();

  get api(): DockviewApi {
    if (!this.#api) this.#mount();
    return this.#api as DockviewApi;
  }

  connectedCallback(): void {
    if (!this.#api) this.#mount();
    this.addEventListener('keydown', this.#keydown, true);
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#keydown, true);
  }

  #keydown = (event: KeyboardEvent) => {
    const moves: Record<string, () => string | null> = {
      F6: () => this.cycleGroup(event.shiftKey ? -1 : 1),
      ']': () => this.cycleTab(1),
      '[': () => this.cycleTab(-1),
    };
    const tab = event.key !== 'F6' && event.ctrlKey && !event.altKey && !event.metaKey;
    const group = event.key === 'F6' && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (!(tab || group) || !(event.key in moves)) return;
    event.preventDefault();
    moves[event.key]();
  };

  #mount(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    adoptStyles(root, dockview, css);
    const container = document.createElement('div');
    container.className = 'root';
    root.replaceChildren(container);
    const api = createDockview(container, {
      theme,
      createComponent: ({ id, name }) => this.#create(id, name),
      getTabContextMenuItems: () => ['close', 'closeOthers', 'separator', 'float', 'maximize'],
      createWatermarkComponent: () => {
        const element = document.createElement('div');
        element.className = 'dv-watermark';
        element.textContent = this.getAttribute('empty-text') ?? 'No panels open';
        return { element, init: () => {} };
      },
    });
    api.onDidLayoutChange(() => this.#dispatch('layout-change', api.toJSON()));
    api.onDidActivePanelChange(({ panel }) =>
      this.#dispatch('active-panel-change', { id: panel?.id ?? null })
    );
    api.onDidRemovePanel((panel) => {
      this.#contents.delete(panel.id);
      this.#dispatch('panel-close', { id: panel.id });
    });
    this.#api = api;
  }

  #create(id: string, name: string) {
    const element = document.createElement('div');
    element.className = 'panel';
    element.dataset.panel = id;
    return {
      element,
      init: ({ params }: { params: PanelParams }) => {
        const factory = this.factories[name];
        const content = factory ? factory(params ?? {}) : document.createElement('div');
        this.#contents.set(id, content);
        element.replaceChildren(content);
      },
    };
  }

  #dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  has(id: string): boolean {
    return this.api.getPanel(id) !== undefined;
  }

  content(id: string): HTMLElement | undefined {
    return this.#contents.get(id);
  }

  open(options: AddPanelOptions): IDockviewPanel {
    const existing = this.api.getPanel(options.id);
    if (existing) {
      existing.api.setActive();
      return existing;
    }
    return this.api.addPanel(options);
  }

  close(id: string): void {
    this.api.getPanel(id)?.api.close();
  }

  focusPanel(id: string): void {
    const panel = this.api.getPanel(id);
    if (!panel) return;
    panel.api.setActive();
    this.#contents.get(id)?.focus();
  }

  cycleGroup(delta: number): string | null {
    const groups = this.api.groups.filter((group) => group.activePanel);
    if (groups.length === 0) return null;
    const current = groups.indexOf(this.api.activeGroup as (typeof groups)[number]);
    const next = groups[(current + delta + groups.length) % groups.length];
    const id = next.activePanel?.id as string;
    this.focusPanel(id);
    return id;
  }

  cycleTab(delta: number): string | null {
    const group = this.api.activeGroup;
    if (!group?.activePanel) return null;
    const panels = group.panels;
    const current = panels.indexOf(group.activePanel);
    const id = panels[(current + delta + panels.length) % panels.length].id;
    this.focusPanel(id);
    return id;
  }

  toJSON(): SerializedDockview {
    return this.api.toJSON();
  }

  restore(layout: SerializedDockview | null | undefined): boolean {
    if (!layout) return false;
    try {
      this.api.fromJSON(layout);
      return this.api.panels.length > 0;
    } catch {
      this.api.clear();
      return false;
    }
  }

  clear(): void {
    this.api.clear();
  }

  dispose(): void {
    this.#api?.dispose();
    this.#api = null;
    this.#contents.clear();
  }
}

export function defineDock(name = 'slicc-dock'): void {
  if (!customElements.get(name)) customElements.define(name, SliccDock);
}
