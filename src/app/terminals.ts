import { css, html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { SliccModel, TerminalInfo } from '../model/types.ts';
import type { SliccTerminal } from '../slicc-terminal.ts';
import { shared, ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';

export function deepActive(root: Document | ShadowRoot): HTMLElement | null {
  const active = root.activeElement as HTMLElement | null;
  return active?.shadowRoot ? (deepActive(active.shadowRoot) ?? active) : active;
}

export class SliccTerminals extends ThemedElement {
  static properties = { ...ThemedElement.properties, active: { state: true } };
  declare active: string;
  #terminals = new Map<string, SliccTerminal>();
  #wanted = '';

  constructor() {
    super();
    this.active = '';
  }

  static styles = [
    shared,
    panelCss,
    css`
      .tabs {
        display: flex;
        gap: 2px;
        overflow-x: auto;
      }
      .tab {
        display: flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 4px 0 8px;
        border-radius: var(--spectrum-corner-radius-75);
        font: inherit;
        color: var(--spectrum-neutral-subdued-content-color-default);
        background: none;
        border: 0;
        cursor: pointer;
        white-space: nowrap;
      }
      .tab[aria-selected='true'] {
        color: var(--spectrum-neutral-content-color-default);
        background: var(--spectrum-gray-200);
      }
      .tab:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
      }
      .close {
        display: inline-grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 3px;
      }
      .close:hover {
        background: var(--spectrum-gray-300);
      }
      .screens {
        position: relative;
        flex: 1;
        min-height: 0;
        background: var(--slicc-terminal-background);
      }
      slicc-terminal {
        position: absolute;
        inset: 0;
        --slicc-terminal-height: 100%;
        --slicc-terminal-border-radius: 0;
        --slicc-terminal-font-size: 13px;
      }
      slicc-terminal[hidden] {
        display: none;
      }
      :host {
        --slicc-terminal-background: var(--spectrum-background-layer-2-color);
        --slicc-terminal-foreground: var(--spectrum-neutral-content-color-default);
        --slicc-terminal-cursor: var(--spectrum-accent-visual-color);
        --slicc-terminal-font-family: var(--spectrum-code-font-family-stack, 'Source Code Pro', monospace);
      }
      :host([color='light']) {
        --slicc-terminal-color-0: #292929;
        --slicc-terminal-color-1: #c4271c;
        --slicc-terminal-color-2: #0a7a43;
        --slicc-terminal-color-3: #8a5a00;
        --slicc-terminal-color-4: #2d5bd9;
        --slicc-terminal-color-5: #8f3ac0;
        --slicc-terminal-color-6: #0b7a8f;
        --slicc-terminal-color-7: #717171;
        --slicc-terminal-color-8: #8f8f8f;
        --slicc-terminal-color-9: #d7373f;
        --slicc-terminal-color-10: #12805c;
        --slicc-terminal-color-11: #a26a00;
        --slicc-terminal-color-12: #3b63fb;
        --slicc-terminal-color-13: #a33fd6;
        --slicc-terminal-color-14: #0d8ea3;
        --slicc-terminal-color-15: #292929;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    if (!this.active) this.active = model.terminals.list()[0]?.id ?? '';
    return [
      ...super.subscribe(model),
      model.terminals.on('terminals', (terminals) => {
        if (!terminals.some((terminal) => terminal.id === this.active))
          this.active = terminals.at(-1)?.id ?? '';
        else this.requestUpdate();
      }),
    ];
  }

  focus(): void {
    this.#wanted = this.active;
    this.#terminals.get(this.active)?.focus();
  }

  #terminal(info: TerminalInfo): SliccTerminal {
    let terminal = this.#terminals.get(info.id);
    if (!terminal) {
      terminal = document.createElement('slicc-terminal') as SliccTerminal;
      terminal.dataset.id = info.id;
      terminal.backend = (this.model as SliccModel).terminals.backend(info.id);
      terminal.addEventListener('exit', () => this.close(info.id));
      this.#terminals.set(info.id, terminal);
      const previous = deepActive(document);
      void terminal.ready.then(
        (ready) => {
          if (this.#wanted === info.id || !ready.contains(deepActive(document))) return;
          if (previous?.isConnected) previous.focus();
          else (deepActive(document) as HTMLElement | null)?.blur();
        },
        () => {}
      );
    }
    terminal.hidden = info.id !== this.active;
    return terminal;
  }

  select(id: string): void {
    this.active = id;
    void this.updateComplete.then(() => this.focus());
  }

  add(): void {
    const model = this.model;
    if (!model) return;
    this.select(model.terminals.open().id);
  }

  close(id: string): void {
    this.#terminals.delete(id);
    this.model?.terminals.close(id);
  }

  async #ask(info: TerminalInfo): Promise<void> {
    const body = "The shell and anything running in it stop. You can't undo this.";
    if (await confirm({ title: `Close ${info.title}?`, body, action: 'Close' }))
      this.close(info.id);
  }

  #keydown(event: KeyboardEvent): void {
    const ids = (this.model?.terminals.list() ?? []).map((terminal) => terminal.id);
    const index = ids.indexOf(this.active);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
    if (next === undefined || ids.length === 0) return;
    event.preventDefault();
    this.active = ids[(next + ids.length) % ids.length];
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('.tab[aria-selected="true"]')?.focus()
    );
  }

  #tab(info: TerminalInfo): TemplateResult {
    const selected = info.id === this.active;
    return html`<button
      class="tab"
      role="tab"
      data-id=${info.id}
      aria-selected=${selected ? 'true' : 'false'}
      tabindex=${selected ? '0' : '-1'}
      title=${info.cwd}
      @click=${() => this.select(info.id)}
    >
      ${info.title}
      <span
        class="close"
        role="button"
        aria-label=${`Close ${info.title}`}
        @click=${(event: Event) => {
          event.stopPropagation();
          void this.#ask(info);
        }}
        >×</span
      >
    </button>`;
  }

  protected updated(): void {
    this.setAttribute('color', this.color);
  }

  render(): TemplateResult {
    const terminals = this.model?.terminals.list() ?? [];
    return html`<div class="bar">
        <div class="tabs" role="tablist" aria-label="Terminals" @keydown=${this.#keydown}>
          ${terminals.map((info) => this.#tab(info))}
        </div>
        <sp-action-button size="s" quiet label="New terminal" title="New terminal" @click=${() => this.add()}>
          <swc-icon-add slot="icon"></swc-icon-add>
        </sp-action-button>
      </div>
      <div class="screens">
        ${repeat(
          terminals,
          (info) => info.id,
          (info) => this.#terminal(info)
        )}
        ${terminals.length === 0 ? html`<div class="note">No terminals. Open one with +.</div>` : ''}
      </div>`;
  }
}
