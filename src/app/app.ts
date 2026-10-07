import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import type { PanelParams, SerializedDockview, SliccDock } from '../components/dock.ts';
import type { SliccModel, Sprinkle } from '../model/types.ts';
import { ordered } from './agents.ts';
import { dot, percent, shared, ThemedElement } from './base.ts';
import { Dips, dipType } from './dips.ts';
import { defaultFontBase, installFonts } from './fonts.ts';
import { grammarBase, setGrammarBase } from './grammars.ts';
import {
  chatAgent,
  chats,
  closed,
  create,
  type DocumentKind,
  defaultLayout,
  documents,
  dropPlacement,
  openChat,
  openDocument,
  openSprinkle,
  openSurface,
  type Placement,
  type ScreenClass,
  type Surface,
  screenClass,
  sprinkleSurface,
  surface,
  surfaces,
} from './panels.ts';

function railIcon(icon: string): TemplateResult {
  if (icon.startsWith('sp-icon-')) {
    return staticHtml`<${unsafeStatic(icon)} slot="icon"></${unsafeStatic(icon)}>`;
  }
  return html`<slicc-lucide slot="icon" name=${icon}></slicc-lucide>`;
}

export class SliccApp extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    screen: { reflect: true },
    surfaces: { attribute: false },
  };
  declare screen: ScreenClass;
  declare surfaces: readonly Surface[];
  storage: Storage | null = globalThis.localStorage ?? null;
  layoutKey = 'slicc-ui.layout.v2';
  readonly dips = new Dips();
  #fontBase: string | null = defaultFontBase;
  #resize: ResizeObserver | null = null;
  #started: ScreenClass | null = null;
  #saving = false;

  constructor() {
    super();
    this.screen = screenClass(globalThis.innerWidth ?? 1280);
    this.surfaces = surfaces;
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
    .rail.drop {
      background: var(--spectrum-accent-background-color-default);
      outline: 2px solid var(--spectrum-focus-indicator-color);
      outline-offset: -2px;
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
      model.agent.on('agents', () => {
        this.#prune();
        update();
      }),
      model.agent.on('active', () => {
        const agent = this.#active();
        if (this.#started && agent && this.#offers('chat')) {
          openChat(this.dock, agent, this.screen, false);
        }
        update();
      }),
      model.files.on('changes', update),
      model.sprinkles.on('sprinkles', update),
      this.dips.on('change', update),
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

  get grammarBase(): string | null {
    return grammarBase();
  }

  set grammarBase(value: string | null) {
    setGrammarBase(value);
  }

  #fonts(): void {
    installFonts(this.ownerDocument, this.#fontBase, new URL('./fonts/', import.meta.url).href);
  }

  #measure(): void {
    const width = this.getBoundingClientRect().width;
    if (width > 0) this.screen = screenClass(width);
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!this.model) return;
    if (this.#started !== this.screen) this.#start(this.model);
    else if (changed.has('model')) this.#rebind(this.model);
  }

  #factories(model: SliccModel): SliccDock['factories'] {
    return {
      ...Object.fromEntries(this.surfaces.map((item) => [item.id, () => create(item.tag, model)])),
      ...Object.fromEntries(
        Object.entries(documents).map(([kind, document]) => [
          kind,
          (params) => create(document.tag, model, params),
        ])
      ),
      ...(this.#offers('chat')
        ? { chat: (params: PanelParams) => create('slicc-chat', model, params) }
        : {}),
      sprinkle: (params) => create('slicc-sprinkle', model, params),
    };
  }

  #rebind(model: SliccModel): void {
    const dock = this.dock;
    dock.factories = this.#factories(model);
    for (const panel of dock.api.panels) {
      const element = dock.content(panel.id) as (HTMLElement & { model?: SliccModel }) | undefined;
      if (element && 'model' in element) element.model = model;
    }
    this.#prune();
    const agent = this.#active();
    if (agent && this.#offers('chat')) openChat(dock, agent, this.screen, false);
  }

  #start(model: SliccModel): void {
    const dock = this.dock;
    this.#saving = false;
    dock.factories = this.#factories(model);
    dock.accepts = [dipType];
    this.dips.load(this.storage);
    const saved = this.#saved();
    const restored = this.#offered(saved, dock.factories) && dock.restore(saved);
    if (!restored) defaultLayout(dock, this.screen, this.#active(), this.surfaces);
    this.#started = this.screen;
    this.#prune();
    this.#saving = true;
    this.#save();
  }

  #offered(layout: SerializedDockview | null, factories: SliccDock['factories']): boolean {
    return Object.values(layout?.panels ?? {}).every(
      (panel) => ((panel as { contentComponent?: string }).contentComponent ?? '') in factories
    );
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

  #active(): { id: string; name: string } | null {
    const model = this.model;
    return model?.agent.list().find((agent) => agent.id === model.agent.active()) ?? null;
  }

  #prune(): void {
    const dock = this.renderRoot.querySelector('slicc-dock') as SliccDock | null;
    if (!dock || !this.#started) return;
    const known = new Set(this.model?.agent.list().map((agent) => agent.id));
    for (const id of chats(dock)) {
      if (!known.has(chatAgent(id) as string)) dock.close(id);
    }
  }

  #activated(event: Event): void {
    const agent = chatAgent((event as CustomEvent<{ id: string | null }>).detail.id);
    if (agent && agent !== this.model?.agent.active()) this.model?.agent.select(agent);
  }

  resetLayout(): void {
    defaultLayout(this.dock, this.screen, this.#active(), this.surfaces);
    this.#save();
  }

  show(id: string): void {
    const agent = this.#active();
    if (id === 'chat' && agent && this.#offers('chat')) {
      openChat(this.dock, agent, this.screen);
      return;
    }
    const sprinkle = this.model?.sprinkles
      .list()
      .find((candidate) => `sprinkle:${candidate.id}` === id);
    if (sprinkle) {
      openSprinkle(this.dock, sprinkle, this.screen);
      return;
    }
    const item = surface(id, this.surfaces);
    if (!item) return;
    openSurface(this.dock, item, this.screen);
    this.dock.focusPanel(id);
  }

  #sprinkle(id: string): Sprinkle | undefined {
    return this.model?.sprinkles.list().find((candidate) => candidate.id === id);
  }

  #detach(id: string, place: Placement | null, open: boolean): void {
    const sprinkle = this.#sprinkle(id);
    if (!sprinkle) return;
    this.dips.detach(id);
    if (open) openSprinkle(this.dock, sprinkle, this.screen, place);
  }

  #dropped(event: Event): void {
    const { type, data, panel, position } = (
      event as CustomEvent<{ type: string; data: string; panel: string | null; position: string }>
    ).detail;
    if (type === dipType) this.#detach(data, dropPlacement(panel, position), true);
  }

  #railOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes(dipType)) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('drop');
  }

  #railLeave(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drop');
  }

  #railDrop(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drop');
    const id = event.dataTransfer?.getData(dipType);
    if (!id) return;
    event.preventDefault();
    this.#detach(id, null, false);
  }

  #rail(items: readonly Surface[], side: string): TemplateResult {
    return html`<nav class=${`rail ${side}`} aria-label=${`Closed panels, ${side}`} @dragover=${this.#railOver} @dragleave=${this.#railLeave} @drop=${this.#railDrop}>${items.map(
      (item) =>
        staticHtml`<sp-action-button quiet size="m" label=${`Open ${item.title}`} title=${item.title} data-surface=${item.id} @click=${() => this.show(item.id)}>${railIcon(item.icon)}</sp-action-button>`
    )}</nav>`;
  }

  #rails(): {
    left: TemplateResult;
    right: TemplateResult;
    bottom: TemplateResult | typeof nothing;
  } {
    const dock = this.renderRoot.querySelector('slicc-dock') as SliccDock | null;
    const sprinkles = (this.model?.sprinkles.list() ?? [])
      .filter((sprinkle) => !sprinkle.inline || this.dips.has(sprinkle.id))
      .map(sprinkleSurface)
      .filter((item) => !dock?.has(item.id));
    const shut = dock && this.#started ? [...sprinkles, ...closed(dock, this.surfaces)] : [];
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
    const surface = digit ? this.surfaces[Number(digit) - 1] : undefined;
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

  #offers(id: string): boolean {
    return this.surfaces.some((item) => item.id === id);
  }

  #agentStatus(): TemplateResult | typeof nothing {
    if (!this.#offers('chat')) return nothing;
    const model = this.model;
    const agent = model?.agent.list().find((candidate) => candidate.id === model.agent.active());
    const label = model?.settings.models().find((option) => option.id === agent?.model)?.label;
    return agent
      ? html`<span class="item">${dot(agent.status)}${agent.name} · ${agent.status}</span>
            <span>${label ?? agent.model}</span>
            <span class="item" title="Context fill"
              >Context <span class="bar"><span style=${`width: ${percent(agent.contextFill)}`}></span></span>
              ${percent(agent.contextFill)}</span
            >`
      : html`<span>No agent</span>`;
  }

  #changes(): TemplateResult | typeof nothing {
    if (!this.#offers('changes')) return nothing;
    const changes = this.model?.files.changes().length ?? 0;
    return html`<button class="link" @click=${() => this.show('changes')}>${changes} ${changes === 1 ? 'change' : 'changes'}</button>`;
  }

  #status(): TemplateResult {
    return html`<footer role="status" aria-label="Status">
      ${this.#agentStatus()}
      ${this.#changes()}
      <slot name="status"></slot>
      <span class="spacer"></span>
      <span class="hints"><kbd>F6</kbd> next group · <kbd>Alt+1–${Math.min(9, this.surfaces.length)}</kbd> panels · <kbd>Alt+Shift+T</kbd> theme</span>
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
          ${
            this.#offers('chat')
              ? html`<sp-picker size="s" label="Agent" value=${this.model?.agent.active() ?? ''} @change=${this.#pick}>
            ${agents.map(
              (agent) =>
                html`<sp-menu-item value=${agent.id}>${agent.kind === 'scoop' ? `↳ ${agent.name}` : agent.name}</sp-menu-item>`
            )}
          </sp-picker>`
              : nothing
          }
          <span class="spacer"></span>
          ${this.#offers('chat') ? html`<slicc-tray .model=${this.model}></slicc-tray>` : nothing}
          <sp-action-menu size="s" quiet label="View" @change=${this.#view}>
            <sp-icon-view-grid slot="icon"></sp-icon-view-grid>
            <span slot="label">View</span>
            ${this.surfaces.map((surface, index) => this.#menuItem(surface, index))}
            <sp-menu-divider></sp-menu-divider>
            <sp-menu-item value="reset">Reset layout</sp-menu-item>
          </sp-action-menu>
          ${
            this.#offers('settings')
              ? html`<sp-action-button size="s" quiet label="Settings" title="Settings" @click=${() => this.show('settings')}>
            <sp-icon-settings slot="icon"></sp-icon-settings>
          </sp-action-button>`
              : nothing
          }
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
            @active-panel-change=${this.#activated}
            @external-drop=${this.#dropped}
            @detach-sprinkle=${(event: Event) => this.#detach((event as CustomEvent<{ id: string }>).detail.id, null, true)}
            @open-file=${(event: Event) => this.#request('file', event)}
            @open-diff=${(event: Event) => this.#request('diff', event)}
            @show-surface=${(event: Event) => this.show((event as CustomEvent<{ id: string }>).detail.id)}
          ></slicc-dock>
          ${rails.right}
        </main>
        ${rails.bottom}
        ${this.#status()}
      </div>
    </sp-theme>`;
  }
}
