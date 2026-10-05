import { css, html, type TemplateResult } from 'lit';
import type { SerializedDockview, SliccDock } from '../components/dock.ts';
import type { ColorScheme, SliccModel } from '../model/types.ts';
import { ordered } from './agents.ts';
import { dot, ModelElement, percent, shared } from './base.ts';
import { create, defaultLayout, openSurface, type Surface, surfaces } from './panels.ts';

export type Color = 'light' | 'dark';

export function resolveColor(scheme: ColorScheme, prefersDark: boolean): Color {
  if (scheme === 'system') return prefersDark ? 'dark' : 'light';
  return scheme;
}

export class SliccApp extends ModelElement {
  static properties = { ...ModelElement.properties, prefersDark: { state: true } };
  declare prefersDark: boolean;
  storage: Storage | null = globalThis.localStorage ?? null;
  layoutKey = 'slicc-ui.layout';
  #media: MediaQueryList | null = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  #saving = false;

  constructor() {
    super();
    this.prefersDark = this.#media?.matches ?? false;
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
      grid-template-rows: 40px minmax(0, 1fr) 24px;
      height: 100%;
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
    .context {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  `,
  ];

  get color(): Color {
    return resolveColor(this.model?.settings.get().color ?? 'system', this.prefersDark);
  }

  get dock(): SliccDock {
    return this.renderRoot.querySelector('slicc-dock') as SliccDock;
  }

  #prefers = (event: MediaQueryListEvent) => {
    this.prefersDark = event.matches;
  };

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    this.#media?.addEventListener('change', this.#prefers);
    return [
      () => this.#media?.removeEventListener('change', this.#prefers),
      model.settings.on('settings', update),
      model.agent.on('agents', update),
      model.agent.on('active', update),
      model.files.on('changes', update),
    ];
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.#keydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('keydown', this.#keydown);
  }

  protected updated(): void {
    if (!this.#saving && this.model) this.#start(this.model);
  }

  #start(model: SliccModel): void {
    const dock = this.dock;
    dock.factories = Object.fromEntries(
      surfaces.map((surface) => [surface.id, () => create(surface.tag, model)])
    );
    const restored = dock.restore(this.#saved());
    if (!restored) defaultLayout(dock);
    this.#saving = true;
    this.#save();
  }

  #saved(): SerializedDockview | null {
    try {
      return JSON.parse(this.storage?.getItem(this.layoutKey) ?? 'null');
    } catch {
      return null;
    }
  }

  #save(): void {
    if (this.#saving) this.storage?.setItem(this.layoutKey, JSON.stringify(this.dock.toJSON()));
  }

  resetLayout(): void {
    defaultLayout(this.dock);
    this.#save();
  }

  show(id: string): void {
    const surface = surfaces.find((candidate) => candidate.id === id);
    if (!surface) return;
    openSurface(this.dock, surface);
    this.dock.focusPanel(id);
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
      <span>${changes} ${changes === 1 ? 'change' : 'changes'}</span>
      <span class="spacer"></span>
      <span><kbd>F6</kbd> next group · <kbd>Alt+1–${surfaces.length}</kbd> panels · <kbd>Alt+Shift+T</kbd> theme</span>
    </footer>`;
  }

  render(): TemplateResult {
    const color = this.color;
    const agents = ordered(this.model?.agent.list() ?? []);
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
          <sp-action-button
            size="s"
            quiet
            label=${color === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            @click=${this.toggleColor}
          >
            <sp-icon-contrast slot="icon"></sp-icon-contrast>
          </sp-action-button>
        </header>
        <slicc-dock empty-text="All panels are closed. Open one from View." @layout-change=${this.#save}></slicc-dock>
        ${this.#status()}
      </div>
    </sp-theme>`;
  }
}
