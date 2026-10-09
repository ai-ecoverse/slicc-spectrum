import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import type { PanelParams, SerializedDockview, SliccDock } from '../components/dock.ts';
import type { Agent, SliccModel, Sprinkle, UpdatesPort } from '../model/types.ts';
import { changesOf, shared, ThemedElement } from './base.ts';
import { prompt } from './confirm.ts';
import { Dips, dipType } from './dips.ts';
import { defaultFontBase, defaultVariableFont, installFonts } from './fonts.ts';
import { grammarBase, setGrammarBase } from './grammars.ts';
import { networkHealth, networkIcon, networkLabel } from './network.ts';
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
import { installProperties } from './properties.ts';
import { TerminalPanels } from './terminals.ts';
import { theme } from './theme.ts';
import { UpdateVisibility, updatesStatus } from './updates.ts';

function railIcon(icon: string): TemplateResult {
  if (icon.startsWith('swc-icon-')) {
    return staticHtml`<${unsafeStatic(icon)} slot="icon"></${unsafeStatic(icon)}>`;
  }
  return html`<slicc-lucide slot="icon" name=${icon}></slicc-lucide>`;
}

export function changeCount(count: number): string {
  return `${count} ${count === 1 ? 'change' : 'changes'}`;
}

export const allAgents = 'slicc:all-agents';

export const newCone = 'slicc:new-cone';

export const railPitch = 52;

export const phoneRail = ['agents', 'files', 'changes', 'terminal', 'browser'];

export function railCapacity(width: number, count: number): number {
  if (!width) return count;
  const slots = Math.max(1, Math.floor((width - 16 + 4) / railPitch));
  return count <= slots ? count : Math.max(0, slots - 1);
}

export function updatesVariant(status: string): 'negative' | 'info' | 'notice' | 'neutral' {
  if (status.endsWith('failed')) return 'negative';
  if (status.startsWith('updating')) return 'info';
  if (status === 'starting') return 'neutral';
  return 'notice';
}

const overscrollLocks = new WeakMap<Document, { count: number; restore: () => void }>();

function lockOverscroll(document: Document): () => void {
  const lock = overscrollLocks.get(document) ?? { count: 0, restore: () => {} };
  overscrollLocks.set(document, lock);
  if (lock.count === 0) {
    const saved = [document.documentElement, document.body].flatMap(({ style }) =>
      ['overscroll-behavior-x', 'overscroll-behavior-y'].map((name) => {
        const value = style.getPropertyValue(name);
        const priority = style.getPropertyPriority(name);
        style.setProperty(name, 'none', 'important');
        return () => style.setProperty(name, value, priority);
      })
    );
    lock.restore = () => {
      for (const restore of saved) restore();
    };
  }
  lock.count += 1;
  return () => {
    lock.count -= 1;
    if (lock.count === 0) lock.restore();
  };
}

export function finishTransitions(root: ShadowRoot): void {
  for (const animation of root.getAnimations())
    if ('transitionProperty' in animation) animation.finish();
  for (const element of root.querySelectorAll('*'))
    if (element.shadowRoot) finishTransitions(element.shadowRoot);
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
  readonly terminalPanels = new TerminalPanels();
  #fontBase: string | null = defaultFontBase;
  #variableFont: string | null = defaultVariableFont;
  #resize: ResizeObserver | null = null;
  #width = 0;
  #started: ScreenClass | null = null;
  #painted = '';
  #saving = false;
  #updatesPort: UpdatesPort | undefined;
  #unlock!: () => void;
  #updatesVisibility: UpdateVisibility | null = null;

  constructor() {
    super();
    this.screen = screenClass(globalThis.innerWidth ?? 1280);
    this.surfaces = surfaces;
  }

  static styles = [
    theme,
    shared,
    css`
    :host {
      display: block;
      height: 100%;
    }
    .swc-theme {
      display: block;
      height: 100%;
      --swc-sans-font-family-stack:
        adobe-clean-spectrum-vf, 'Adobe Clean Spectrum VF', adobe-clean, 'Adobe Clean',
        'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu,
        'Trebuchet MS', 'Lucida Grande', sans-serif;
    }
    sp-theme {
      --spectrum-sans-font-family-stack: var(--swc-sans-font-family-stack);
      display: block;
      height: 100%;
      background: var(--spectrum-background-base-color);
      color: var(--spectrum-neutral-content-color-default);
    }
    .shell {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    main {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      flex: 1;
      min-height: 0;
    }
    .rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--swc-spacing-75);
      width: calc(var(--swc-component-height-100) + var(--swc-spacing-100));
      padding: var(--swc-spacing-100) 0;
      box-sizing: border-box;
      background: var(--swc-background-layer-1-color);
    }
    .rail.drop {
      background: var(--swc-gray-200);
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .rail.left {
      grid-column: 1;
      border-right: var(--swc-border-width-100) solid var(--swc-gray-200);
    }
    .rail.right {
      grid-column: 3;
      border-left: var(--swc-border-width-100) solid var(--swc-gray-200);
    }
    main slicc-dock {
      grid-column: 2;
      grid-row: 1;
    }
    .rail.bottom {
      flex: none;
      flex-direction: row;
      justify-content: space-evenly;
      width: auto;
      height: calc(var(--swc-component-height-300) + var(--swc-spacing-100));
      padding: 0 var(--swc-spacing-100);
      border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
    }
    .rail.bottom swc-action-button {
      --swc-action-button-min-block-size: var(--swc-component-height-300);
      min-inline-size: var(--swc-component-height-300);
    }
    .rail.bottom sp-action-menu {
      --mod-actionbutton-height: var(--swc-component-height-300);
      --mod-actionbutton-min-width: var(--swc-component-height-300);
    }
    .rail:empty {
      display: none;
    }
    .badged {
      position: relative;
      display: inline-flex;
    }
    .badged swc-badge {
      --swc-badge-height: var(--swc-spacing-300);
      --swc-badge-padding-block: var(--swc-spacing-50);
      --swc-badge-padding-inline: var(--swc-spacing-75);
      --swc-badge-corner-radius: var(--swc-spacing-100);
      --swc-badge-line-height: 1;
      position: absolute;
      inset-block-start: calc(-1 * var(--swc-spacing-50));
      inset-inline-end: calc(-1 * var(--swc-spacing-75));
      pointer-events: none;
    }
    header swc-status-light {
      align-self: center;
    }
    header .status {
      display: flex;
      align-items: center;
      flex: 0 1 auto;
      min-width: 0;
      margin-inline-start: calc(-1 * var(--swc-spacing-100));
      overflow: hidden;
      font-size: var(--swc-font-size-75);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    header .status ::slotted(*) {
      flex: 0 1 auto;
      min-width: 0;
      max-inline-size: calc(var(--swc-spacing-1000) * 4);
      margin-inline-start: var(--swc-spacing-100);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    header .status ::slotted([hidden]) {
      display: none;
    }
    :host([screen='phone']) header .status {
      display: none;
    }
    header slicc-tray {
      margin-inline-end: var(--swc-spacing-200);
    }
    :host([screen='phone']) header sp-picker {
      min-width: calc(var(--swc-spacing-400) * 4);
      width: 0;
      flex: 1;
    }
    :host([screen='phone']) header .spacer,
    :host([screen='phone']) header .view-label {
      display: none;
    }
    header {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--swc-spacing-100);
      height: calc(var(--swc-component-height-100) + var(--swc-spacing-100));
      padding: 0 var(--swc-spacing-100) 0 var(--swc-spacing-200);
      border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      background: var(--swc-background-layer-1-color);
    }
    .brand {
      font-weight: var(--swc-extra-bold-font-weight);
      font-size: var(--swc-font-size-100);
      margin-inline-end: var(--swc-spacing-100);
    }
    .spacer {
      flex: 1;
    }
    sp-picker {
      min-width: calc(var(--swc-spacing-400) * 8);
    }
    slicc-dock {
      height: 100%;
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
      changesOf(model).on('changes', update),
      model.terminals.on('terminals', () => {
        this.#prune();
        update();
      }),
      model.sprinkles.on('sprinkles', update),
      this.dips.on('change', update),
      ...(model.updates ? [model.updates.on('items', update)] : []),
      ...(model.network ? [model.network.on('network', update)] : []),
    ];
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.#keydown, true);
    this.#fonts();
    installProperties(this.ownerDocument);
    this.#unlock = lockOverscroll(this.ownerDocument);
    this.#resize = new ResizeObserver(() => this.#measure());
    this.#resize.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('keydown', this.#keydown, true);
    this.#unlock();
    this.#resize?.disconnect();
  }

  get fontBase(): string | null {
    return this.#fontBase;
  }

  set fontBase(value: string | null) {
    this.#fontBase = value;
    if (this.isConnected) this.#fonts();
  }

  get variableFont(): string | null {
    return this.#variableFont;
  }

  set variableFont(value: string | null) {
    this.#variableFont = value;
    if (this.isConnected) this.#fonts();
  }

  get grammarBase(): string | null {
    return grammarBase();
  }

  set grammarBase(value: string | null) {
    setGrammarBase(value);
  }

  #fonts(): void {
    installFonts(
      this.ownerDocument,
      this.#fontBase,
      new URL('./fonts/', import.meta.url).href,
      this.#variableFont
    );
  }

  #measure(): void {
    const width = this.getBoundingClientRect().width;
    if (width > 0) {
      this.screen = screenClass(width);
      if (width !== this.#width) {
        this.#width = width;
        this.requestUpdate();
      }
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    const color = this.color;
    if (this.#painted && this.#painted !== color) {
      const root = this.renderRoot as ShadowRoot;
      finishTransitions(root);
      requestAnimationFrame(() => finishTransitions(root));
    }
    this.#painted = color;
    if (!this.model) return;
    const layout = this.#started !== this.screen;
    if (layout) this.#start(this.model);
    else if (changed.has('model')) this.#rebind(this.model);
    this.#updates(layout);
  }

  #updates(layout: boolean): void {
    const port = this.model?.updates;
    if (port !== this.#updatesPort) {
      this.#updatesPort = port;
      this.#updatesVisibility = port ? new UpdateVisibility(port.ready()) : null;
    }
    if (!port || !this.#offers('updates')) return;
    const change = this.#updatesVisibility?.change(port, layout);
    if (change === 'open') {
      const restored = this.dock.api.getPanel('updates');
      if (restored) this.dock.reveal('updates');
      else this.show('updates');
      const panel = this.dock.api.getPanel('updates');
      if (!port.ready() && restored?.params?.boot !== false)
        panel?.api.updateParameters({ boot: true });
      else if (!restored) panel?.api.updateParameters({ boot: undefined });
      this.#save();
    } else if (
      this.dock.api.getPanel('updates')?.params?.boot &&
      port.ready() &&
      !port.list().some((item) => item.state === 'failed')
    ) {
      this.dock.close('updates');
      this.#save();
    }
  }

  #factories(model: SliccModel): SliccDock['factories'] {
    return {
      ...Object.fromEntries(
        this.#available(model).map((item) => [
          item.id,
          (params: PanelParams) => create(item.tag, model, params),
        ])
      ),
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
    if (!model.network && dock.has('network')) dock.close('network');
    this.#prune();
    const agent = this.#active();
    if (agent && this.#offers('chat')) openChat(dock, agent, this.screen, false, false);
  }

  #start(model: SliccModel): void {
    const dock = this.dock;
    this.#saving = false;
    dock.factories = this.#factories(model);
    dock.accepts = [dipType];
    this.terminalPanels.attach(
      dock,
      () => this.model?.terminals,
      () => this.screen
    );
    this.dips.load(this.storage);
    const saved = this.#saved();
    const restored = this.#offered(saved, dock.factories) && dock.restore(saved);
    if (!restored) {
      defaultLayout(dock, this.screen, this.#active(), this.#available(), model.terminals.list());
    }
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

  #active(): Agent | null {
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
    if (this.model && this.#offers('terminal'))
      this.terminalPanels.sync(dock, this.model.terminals, this.screen);
  }

  #activated(event: Event): void {
    const { id } = (event as CustomEvent<{ id: string | null }>).detail;
    this.terminalPanels.activated(id);
    const agent = chatAgent(id);
    if (agent && agent !== this.model?.agent.active()) this.model?.agent.select(agent);
  }

  resetLayout(): void {
    const terminals = this.model?.terminals.list();
    defaultLayout(this.dock, this.screen, this.#active(), this.#available(), terminals);
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
    const item = surface(id, this.#available());
    if (!item) return;
    if (item.id === 'terminal') {
      if (this.model) this.terminalPanels.show(this.dock, this.model.terminals, this.screen);
      return;
    }
    openSurface(this.dock, item, this.screen);
    if (id === 'updates') this.dock.api.getPanel(id)?.api.updateParameters({ boot: false });
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

  #railButton(item: Surface, side: string): TemplateResult {
    const changes = item.id === 'changes' ? this.#changes() : 0;
    const label = changes ? `Open ${item.title}, ${changeCount(changes)}` : `Open ${item.title}`;
    const button = staticHtml`<swc-action-button id=${`rail-${item.id}`} quiet size="m" accessible-label=${label} data-surface=${item.id} @click=${() => this.show(item.id)}>${railIcon(item.icon)}</swc-action-button>`;
    const tooltip = html`<swc-tooltip for=${`rail-${item.id}`} placement=${{ left: 'end', right: 'start', bottom: 'top' }[side]}>${item.title}</swc-tooltip>`;
    return changes
      ? html`<span class="badged">${button}<swc-badge size="s" variant="neutral" aria-hidden="true">${changes}</swc-badge></span>${tooltip}`
      : html`${button}${tooltip}`;
  }

  #changes(): number {
    const port = this.model ? changesOf(this.model) : null;
    return port && !port.unavailable?.() ? port.changes().length : 0;
  }

  #more(items: readonly Surface[]): TemplateResult | typeof nothing {
    if (!items.length) return nothing;
    const changes = items.some((item) => item.id === 'changes') ? this.#changes() : 0;
    const label = changes ? `More panels, ${changeCount(changes)}` : 'More panels';
    const menu = staticHtml`<sp-action-menu quiet size="m" label=${label} placement="top-end" @change=${(event: Event) => this.show((event.target as HTMLElement & { value: string }).value)}>
      <swc-icon-more slot="icon"></swc-icon-more>
      ${items.map((item) => staticHtml`<sp-menu-item value=${item.id}>${railIcon(item.icon)}${item.title}</sp-menu-item>`)}
    </sp-action-menu>`;
    return changes
      ? html`<span class="badged">${menu}<swc-badge size="s" variant="neutral" aria-hidden="true">${changes}</swc-badge></span>`
      : menu;
  }

  #rail(items: readonly Surface[], side: string): TemplateResult {
    const primary = side === 'bottom' ? items.filter((item) => phoneRail.includes(item.id)) : items;
    const fit =
      primary.length < items.length
        ? Math.min(primary.length, railCapacity(this.#width, Infinity))
        : railCapacity(this.#width, items.length);
    const shown = side === 'bottom' ? primary.slice(0, fit) : items;
    return html`<nav class=${`rail ${side}`} aria-label=${`Closed panels, ${side}`} @dragover=${this.#railOver} @dragleave=${this.#railLeave} @drop=${this.#railDrop}>${shown.map(
      (item) => this.#railButton(item, side)
    )}${this.#more(items.filter((item) => !shown.includes(item)))}</nav>`;
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
    const shut = dock && this.#started ? [...sprinkles, ...closed(dock, this.#available())] : [];
    const phone = this.screen === 'phone';
    return {
      left: this.#rail(phone ? [] : shut.filter((item) => item.side !== 'right'), 'left'),
      right: this.#rail(phone ? [] : shut.filter((item) => item.side === 'right'), 'right'),
      bottom: phone ? this.#rail(shut, 'bottom') : nothing,
    };
  }

  newTerminal(): void {
    if (!this.model || !this.#offers('terminal')) return;
    this.terminalPanels.create(this.dock, this.model.terminals, this.screen);
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
    const surface = digit ? this.#available()[Number(digit) - 1] : undefined;
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
    else if (value === 'new-terminal') this.newTerminal();
    else if (value === 'next-group') this.dock.cycleGroup(1);
    else if (value === 'theme') this.toggleColor();
    else this.show(value);
  }

  #cone(): string {
    const agent = this.#active() as Agent | null;
    return agent?.kind === 'scoop' ? (agent.parentId ?? '') : (agent?.id ?? '');
  }

  #pick(event: Event): void {
    const picker = event.target as HTMLElement & { value: string };
    if (picker.value === allAgents) {
      picker.value = this.#cone();
      this.show('agents');
      return;
    }
    if (picker.value === newCone) {
      picker.value = this.#cone();
      void this.#newCone(picker);
      return;
    }
    this.model?.agent.select(picker.value);
  }

  async #newCone(trigger: HTMLElement): Promise<void> {
    const port = this.model?.agent;
    const create = port?.createCone?.bind(port);
    if (!port || !create) return;
    let created: Agent | undefined;
    await prompt({
      title: 'New cone',
      label: 'Name',
      action: 'Create',
      trigger,
      submit: async (name) => {
        created = await create(name);
      },
    });
    if (!created) return;
    port.select(created.id);
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('header sp-picker')?.focus();
  }

  #menuItem(surface: Surface, index: number): TemplateResult {
    return html`<sp-menu-item value=${surface.id}>
      ${surface.title}${index < 9 ? html`<kbd slot="value">Alt+${index + 1}</kbd>` : nothing}
    </sp-menu-item>`;
  }

  #offers(id: string): boolean {
    return this.#available().some((item) => item.id === id);
  }

  #available(model = this.model): readonly Surface[] {
    return this.surfaces.filter((item) => item.id !== 'network' || model?.network);
  }

  #updatesIndicator(): TemplateResult | typeof nothing {
    const updates = this.#offers('updates')
      ? updatesStatus(this.model?.updates?.list() ?? [])
      : null;
    if (!updates) return nothing;
    const text = updates[0].toUpperCase() + updates.slice(1);
    return html`<swc-action-button id="updates" quiet size="s" data-updates accessible-label=${`Install / Update: ${updates}`} @click=${() => this.show('updates')}>
        <swc-status-light size="s" variant=${updatesVariant(updates)}>${this.screen === 'phone' ? nothing : text}</swc-status-light>
      </swc-action-button>
      <swc-tooltip for="updates" placement="bottom">${text}</swc-tooltip>`;
  }

  #networkIndicator(): TemplateResult | typeof nothing {
    const port = this.model?.network;
    if (!port || !this.#offers('network')) return nothing;
    const status = port.status();
    const [variant, state] = networkHealth[status.health];
    const label = networkLabel(status);
    const content =
      this.screen === 'phone'
        ? networkIcon[status.health]
        : html`<swc-status-light size="s" variant=${variant}>Network${status.health === 'ok' ? nothing : html`<span class="state"> ${state.toLowerCase()}</span>`}</swc-status-light>`;
    return html`<swc-action-button id="network" quiet size="s" data-network data-health=${status.health} accessible-label=${label} @click=${() => this.show('network')}>${content}</swc-action-button>
      <swc-tooltip for="network" placement="bottom">${status.detail ?? label}</swc-tooltip>`;
  }

  #headerButton(
    id: string,
    label: string,
    icon: TemplateResult,
    click: () => void
  ): TemplateResult {
    return html`<swc-action-button id=${id} size="s" quiet accessible-label=${label} @click=${click}>${icon}</swc-action-button>
      <swc-tooltip for=${id} placement="bottom">${label}</swc-tooltip>`;
  }

  render(): TemplateResult {
    const color = this.color;
    const cones = (this.model?.agent.list() ?? []).filter((agent) => agent.kind === 'cone');
    const rails = this.#rails();
    return html`<div class=${`swc-theme swc-theme--sizeM swc-theme--${color}`}><sp-theme system="spectrum-two" color=${color} scale="medium">
      <div class="shell">
        <header>
          <span class="brand">slicc</span>
          ${
            this.#offers('chat')
              ? keyed(
                  cones.map((agent) => agent.id).join(' '),
                  html`<sp-picker size="s" label="Agent" value=${this.#cone()} @change=${this.#pick}>
            ${cones.map((agent) => html`<sp-menu-item value=${agent.id}>${agent.name}</sp-menu-item>`)}
            ${
              this.model?.agent.createCone
                ? html`<sp-menu-divider></sp-menu-divider><sp-menu-item value=${newCone} data-action="new-cone"><swc-icon-add slot="icon"></swc-icon-add>New cone</sp-menu-item>`
                : nothing
            }
            ${
              this.#offers('agents')
                ? html`<sp-menu-divider></sp-menu-divider><sp-menu-item value=${allAgents}>Show all agents</sp-menu-item>`
                : nothing
            }
          </sp-picker>`
                )
              : nothing
          }
          <span class="spacer"></span>
          <div class="status" role="status"><slot name="status"></slot></div>
          ${this.#updatesIndicator()}
          ${this.#networkIndicator()}
          ${this.#offers('chat') ? html`<slicc-tray .model=${this.model} ?compact=${this.screen === 'phone'}></slicc-tray>` : nothing}
          <sp-action-menu size="s" quiet label="View" @change=${this.#view}>
            <swc-icon-view-grid slot="icon"></swc-icon-view-grid>
            <span slot="label" class="view-label">View</span>
            ${this.#available().map((surface, index) => this.#menuItem(surface, index))}
            ${this.#offers('terminal') ? html`<sp-menu-item value="new-terminal">New terminal</sp-menu-item>` : nothing}
            <sp-menu-divider></sp-menu-divider>
            <sp-menu-item value="reset">Reset layout</sp-menu-item>
            <sp-menu-divider></sp-menu-divider>
            <sp-menu-group size="s">
              <span slot="header">Keyboard shortcuts</span>
              <sp-menu-item value="next-group">Next panel group<kbd slot="value">F6</kbd></sp-menu-item>
              <sp-menu-item value="theme">${color === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}<kbd slot="value">Alt+Shift+T</kbd></sp-menu-item>
            </sp-menu-group>
          </sp-action-menu>
          ${
            this.#offers('settings')
              ? this.#headerButton(
                  'settings',
                  'Settings',
                  html`<swc-icon-settings slot="icon"></swc-icon-settings>`,
                  () => this.show('settings')
                )
              : nothing
          }
          ${this.#headerButton('theme', color === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', html`<swc-icon-contrast slot="icon"></swc-icon-contrast>`, () => this.toggleColor())}
        </header>
        <main>
          ${rails.left}
          <slicc-dock empty-text="All panels are closed. Open one from a rail or View." @layout-change=${this.#save}
            @active-panel-change=${this.#activated}
            @external-drop=${this.#dropped}
            @detach-sprinkle=${(event: Event) => this.#detach((event as CustomEvent<{ id: string }>).detail.id, null, true)}
            @open-file=${(event: Event) => this.#request('file', event)}
            @open-diff=${(event: Event) => this.#request('diff', event)}
            @new-terminal=${() => this.newTerminal()}
            @show-surface=${(event: Event) => this.show((event as CustomEvent<{ id: string }>).detail.id)}
          ></slicc-dock>
          ${rails.right}
        </main>
        ${rails.bottom}
      </div>
    </sp-theme></div>`;
  }
}
