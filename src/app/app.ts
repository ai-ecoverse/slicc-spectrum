import { css, html, nothing, type TemplateResult } from 'lit';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import type { SerializedDockview, SliccDock } from '../components/dock.ts';
import type { SliccModel } from '../model/types.ts';
import { ordered } from './agents.ts';
import { dot, percent, shared, ThemedElement } from './base.ts';
import { defaultFontBase, installFonts } from './fonts.ts';
import {
  closed,
  create,
  type DocumentKind,
  defaultLayout,
  documents,
  openDocument,
  openSurface,
  type ScreenClass,
  type Surface,
  screenClass,
  surface,
  surfaces,
} from './panels.ts';

export class SliccApp extends ThemedElement {
  static properties = { ...ThemedElement.properties, screen: { reflect: true } };
  declare screen: ScreenClass;
  storage: Storage | null = globalThis.localStorage ?? null;
  layoutKey = 'slicc-ui.layout';
  #fontBase: string | null = defaultFontBase;
  #resize: ResizeObserver | null = null;
  #started: ScreenClass | null = null;
  #saving = false;

  constructor() {
    super();
    this.screen = screenClass(globalThis.innerWidth ?? 1280);
  }

  static styles = [
    shared,
    css`
    :host {
      display: block;
      height: 100%;
    }
    sp-theme {
      display: block;
      height: 100%;
      background: var(--spectrum-background-base-color);
      color: var(--spectrum-neutral-content-color-default);
    }
    .shell {
      display: grid;
      grid-template-rows: 40px minmax(0, 1fr) auto 24px;
      height: 100%;
    }
    main {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 0;
    }
    .rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 40px;
      padding: 6px 0;
      box-sizing: border-box;
      background: var(--spectrum-background-layer-1-color);
    }
    .rail.left {
      grid-column: 1;
      border-right: 1px solid var(--spectrum-gray-200);
    }
    .rail.right {
      grid-column: 3;
      border-left: 1px solid var(--spectrum-gray-200);
    }
    main slicc-dock {
      grid-column: 2;
      grid-row: 1;
    }
    .rail.bottom {
      flex-direction: row;
      justify-content: center;
      width: auto;
      height: 44px;
      padding: 0 8px;
      border-top: 1px solid var(--spectrum-gray-200);
    }
    .rail:empty {
      display: none;
    }
    :host([screen='phone']) footer .hints {
      display: none;
    }
    header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 8px 0 12px;
      border-bottom: 1px solid var(--spectrum-gray-200);
      background: var(--spectrum-background-layer-1-color);
    }
    .brand {
      font-weight: 800;
      font-size: var(--spectrum-font-size-100);
      letter-spacing: -0.01em;
      margin-right: 8px;
    }
    .spacer {
      flex: 1;
    }
    sp-picker {
      min-width: 200px;
    }
    slicc-dock {
      height: 100%;
    }
    footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 12px;
      border-top: 1px solid var(--spectrum-gray-200);
      background: var(--spectrum-background-layer-1-color);
      color: var(--spectrum-neutral-subdued-content-color-default);
      font-size: var(--spectrum-font-size-50);
      white-space: nowrap;
      overflow: hidden;
    }
    .bar {
      display: inline-block;
      width: 48px;
      height: 4px;
      border-radius: 2px;
      background: var(--spectrum-gray-200);
      overflow: hidden;
    }
    .bar > span {
      display: block;
      height: 100%;
      background: var(--spectrum-accent-visual-color);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .link {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .link:hover {
      color: var(--spectrum-neutral-content-color-default);
      text-decoration: underline;
    }
    .link:focus-visible {
      outline: 2px solid var(--spectrum-focus-indicator-color);
    }
    .context {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  `,
  ];

  get dock(): SliccDock {
    return this.renderRoot.querySelector('slicc-dock') as SliccDock;
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      ...super.subscribe(model),
      model.agent.on('agents', update),
      model.agent.on('active', update),
      model.files.on('changes', update),
    ];
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.#keydown, true);
    this.#fonts();
    this.#resize = new ResizeObserver(() => this.#measure());
    this.#resize.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('keydown', this.#keydown, true);
    this.#resize?.disconnect();
  }

  get fontBase(): string | null {
    return this.#fontBase;
  }

  set fontBase(value: string | null) {
    this.#fontBase = value;
    if (this.isConnected) this.#fonts();
  }

  #fonts(): void {
    installFonts(this.ownerDocument, this.#fontBase, new URL('./fonts/', import.meta.url).href);
  }

  #measure(): void {
    const width = this.getBoundingClientRect().width;
    if (width > 0) this.screen = screenClass(width);
  }

  protected updated(): void {
    if (this.model && this.#started !== this.screen) this.#start(this.model);
  }

  #start(model: SliccModel): void {
    const dock = this.dock;
    this.#saving = false;
    dock.factories = {
      ...Object.fromEntries(surfaces.map((item) => [item.id, () => create(item.tag, model)])),
      ...Object.fromEntries(
        Object.entries(documents).map(([kind, document]) => [
          kind,
          (params) => create(document.tag, model, params),
        ])
      ),
    };
    const restored = dock.restore(this.#saved());
    if (!restored) defaultLayout(dock, this.screen);
    this.#started = this.screen;
    this.#saving = true;
    this.#save();
  }

  get storageKey(): string {
    return `${this.layoutKey}.${this.screen}`;
  }

  #saved(): SerializedDockview | null {
    try {
      return JSON.parse(this.storage?.getItem(this.storageKey) ?? 'null');
    } catch {
      return null;
    }
  }

  #save(): void {
    if (this.#saving) this.storage?.setItem(this.storageKey, JSON.stringify(this.dock.toJSON()));
    this.requestUpdate();
  }

  resetLayout(): void {
    defaultLayout(this.dock, this.screen);
    this.#save();
  }

  show(id: string): void {
    const item = surface(id);
    if (!item) return;
    openSurface(this.dock, item, this.screen);
    this.dock.focusPanel(id);
  }

  #rail(items: readonly Surface[], side: string): TemplateResult {
    return html`<nav class=${`rail ${side}`} aria-label=${`Closed panels, ${side}`}>${items.map(
      (item) =>
        staticHtml`<sp-action-button quiet size="m" label=${`Open ${item.title}`} title=${item.title} data-surface=${item.id} @click=${() => this.show(item.id)}><${unsafeStatic(item.icon)} slot="icon"></${unsafeStatic(item.icon)}></sp-action-button>`
    )}</nav>`;
  }

  #rails(): {
    left: TemplateResult;
    right: TemplateResult;
    bottom: TemplateResult | typeof nothing;
  } {
    const dock = this.renderRoot.querySelector('slicc-dock') as SliccDock | null;
    const shut = dock && this.#started ? closed(dock) : [];
    const phone = this.screen === 'phone';
    return {
      left: this.#rail(phone ? [] : shut.filter((item) => item.side !== 'right'), 'left'),
      right: this.#rail(phone ? [] : shut.filter((item) => item.side === 'right'), 'right'),
      bottom: phone ? this.#rail(shut, 'bottom') : nothing,
    };
  }

  open(kind: DocumentKind, path: string): void {
    openDocument(this.dock, kind, path, this.screen);
  }

  #request(kind: DocumentKind, event: Event): void {
    event.stopPropagation();
    this.open(kind, (event as CustomEvent<{ path: string }>).detail.path);
  }

  toggleColor(): void {
    this.model?.settings.update({ color: this.color === 'dark' ? 'light' : 'dark' });
  }

  #keydown = (event: KeyboardEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const digit = event.code.match(/^Digit([1-9])$/)?.[1] ?? event.key.match(/^[1-9]$/)?.[0];
    const surface = digit ? surfaces[Number(digit) - 1] : undefined;
    if (surface) {
      event.preventDefault();
      this.show(surface.id);
    } else if (event.code === 'KeyT' && event.shiftKey) {
      event.preventDefault();
      this.toggleColor();
    }
  };

  #view(event: Event): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    if (value === 'reset') this.resetLayout();
    else this.show(value);
  }

  #pick(event: Event): void {
    this.model?.agent.select((event.target as HTMLElement & { value: string }).value);
  }

  #menuItem(surface: Surface, index: number): TemplateResult {
    return html`<sp-menu-item value=${surface.id}>
      ${surface.title}<kbd slot="value">Alt+${index + 1}</kbd>
    </sp-menu-item>`;
  }

  #status(): TemplateResult {
    const model = this.model;
    const agent = model?.agent.list().find((candidate) => candidate.id === model.agent.active());
    const label = model?.settings.models().find((option) => option.id === agent?.model)?.label;
    const changes = model?.files.changes().length ?? 0;
    return html`<footer role="status" aria-label="Status">
      ${
        agent
          ? html`<span class="item">${dot(agent.status)}${agent.name} · ${agent.status}</span>
            <span>${label ?? agent.model}</span>
            <span class="item" title="Context fill"
              >Context <span class="bar"><span style=${`width: ${percent(agent.contextFill)}`}></span></span>
              ${percent(agent.contextFill)}</span
            >`
          : html`<span>No agent</span>`
      }
      <button class="link" @click=${() => this.show('changes')}>${changes} ${changes === 1 ? 'change' : 'changes'}</button>
      <span class="spacer"></span>
      <span class="hints"><kbd>F6</kbd> next group · <kbd>Alt+1–${surfaces.length}</kbd> panels · <kbd>Alt+Shift+T</kbd> theme</span>
    </footer>`;
  }

  render(): TemplateResult {
    const color = this.color;
    const agents = ordered(this.model?.agent.list() ?? []);
    const rails = this.#rails();
    return html`<sp-theme system="spectrum-two" color=${color} scale="medium" style=${`color-scheme: ${color}`}>
      <div class="shell">
        <header>
          <span class="brand">slicc</span>
          <sp-picker size="s" label="Agent" value=${this.model?.agent.active() ?? ''} @change=${this.#pick}>
            ${agents.map(
              (agent) =>
                html`<sp-menu-item value=${agent.id}>${agent.kind === 'scoop' ? `↳ ${agent.name}` : agent.name}</sp-menu-item>`
            )}
          </sp-picker>
          <span class="spacer"></span>
          <sp-action-menu size="s" quiet label="View" @change=${this.#view}>
            <sp-icon-view-grid slot="icon"></sp-icon-view-grid>
            <span slot="label">View</span>
            ${surfaces.map((surface, index) => this.#menuItem(surface, index))}
            <sp-menu-divider></sp-menu-divider>
            <sp-menu-item value="reset">Reset layout</sp-menu-item>
          </sp-action-menu>
          <sp-action-button size="s" quiet label="Settings" title="Settings" @click=${() => this.show('settings')}>
            <sp-icon-settings slot="icon"></sp-icon-settings>
          </sp-action-button>
          <sp-action-button
            size="s"
            quiet
            label=${color === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            @click=${this.toggleColor}
          >
            <sp-icon-contrast slot="icon"></sp-icon-contrast>
          </sp-action-button>
        </header>
        <main>
          ${rails.left}
          <slicc-dock empty-text="All panels are closed. Open one from a rail or View." @layout-change=${this.#save}
            @open-file=${(event: Event) => this.#request('file', event)}
            @open-diff=${(event: Event) => this.#request('diff', event)}
          ></slicc-dock>
          ${rails.right}
        </main>
        ${rails.bottom}
        ${this.#status()}
      </div>
    </sp-theme>`;
  }
}
