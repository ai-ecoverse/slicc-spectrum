import { css, html, nothing, type TemplateResult } from 'lit';
import type { BrowserTab, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { agentName, panelCss } from './files.ts';

export function normalize(input: string): string {
  const text = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  return `https://${text}`;
}

export class SliccBrowser extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    shot: { state: true },
    address: { state: true },
  };
  declare shot: string;
  declare address: string;
  #shown = '';

  constructor() {
    super();
    this.shot = '';
    this.address = '';
  }

  static styles = [
    shared,
    panelCss,
    css`
      .tabs {
        display: flex;
        gap: 2px;
        overflow-x: auto;
        flex: 1;
        min-width: 0;
      }
      .tab {
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 200px;
        height: 24px;
        padding: 0 4px 0 8px;
        border-radius: var(--spectrum-corner-radius-75);
        font: inherit;
        color: var(--spectrum-neutral-subdued-content-color-default);
        background: none;
        border: 0;
        cursor: pointer;
      }
      .tab[aria-selected='true'] {
        color: var(--spectrum-neutral-content-color-default);
        background: var(--spectrum-gray-200);
      }
      .tab:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
      }
      .title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .close {
        display: inline-grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 3px;
        flex: none;
      }
      .close:hover {
        background: var(--spectrum-gray-300);
      }
      .agent {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex: none;
        background: var(--spectrum-informative-visual-color);
      }
      form {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
        padding: 4px 8px;
        border-bottom: 1px solid var(--spectrum-gray-200);
      }
      sp-textfield {
        flex: 1;
        width: auto;
      }
      .driver {
        color: var(--spectrum-neutral-subdued-content-color-default);
        white-space: nowrap;
      }
      .viewport {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: grid;
        place-items: start center;
        padding: 12px;
        background: var(--spectrum-background-base-color);
      }
      img {
        max-width: 100%;
        box-shadow: 0 1px 4px var(--spectrum-drop-shadow-color);
        border-radius: 4px;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => {
      this.#sync();
      this.requestUpdate();
    };
    this.#sync();
    return [model.browser.on('tabs', update), model.browser.on('active', update)];
  }

  #tab(): BrowserTab | undefined {
    const model = this.model;
    return model?.browser.list().find((tab) => tab.id === model.browser.active());
  }

  #sync(): void {
    const tab = this.#tab();
    const key = tab ? `${tab.id} ${tab.url} ${tab.status}` : '';
    if (key === this.#shown) return;
    this.#shown = key;
    this.address = tab?.url ?? '';
    if (!tab) {
      this.shot = '';
      return;
    }
    void this.model?.browser.screenshot(tab.id).then(
      (shot) => {
        if (this.#shown === key) this.shot = shot;
      },
      () => {}
    );
  }

  focus(): void {
    this.focusOn('sp-textfield');
  }

  #navigate(event: Event): void {
    event.preventDefault();
    const model = this.model;
    const tab = this.#tab();
    const url = normalize(this.address);
    if (!model || url === 'https://') return;
    if (tab) model.browser.navigate(tab.id, url);
    else model.browser.open(url);
  }

  #keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#navigate(event);
  }

  #reload(): void {
    const tab = this.#tab();
    if (tab) this.model?.browser.navigate(tab.id, tab.url);
  }

  #tabkey(event: KeyboardEvent): void {
    const tabs = this.model?.browser.list() ?? [];
    const index = tabs.findIndex((tab) => tab.id === this.model?.browser.active());
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
    if (next === undefined || tabs.length === 0) return;
    event.preventDefault();
    this.model?.browser.activate(tabs[(next + tabs.length) % tabs.length].id);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('.tab[aria-selected="true"]')?.focus()
    );
  }

  #tabButton(tab: BrowserTab, active: string | null): TemplateResult {
    const selected = tab.id === active;
    return html`<button
      class="tab"
      role="tab"
      data-id=${tab.id}
      aria-selected=${selected ? 'true' : 'false'}
      tabindex=${selected ? '0' : '-1'}
      title=${tab.url}
      @click=${() => this.model?.browser.activate(tab.id)}
    >
      ${tab.agentId ? html`<span class="agent" title=${`Driven by ${agentName(this.model, tab.agentId)}`}></span>` : nothing}
      ${tab.status === 'loading' ? html`<sp-progress-circle size="s" indeterminate label="Loading"></sp-progress-circle>` : nothing}
      <span class="title">${tab.title}</span>
      <span
        class="close"
        role="button"
        aria-label=${`Close ${tab.title}`}
        @click=${(event: Event) => {
          event.stopPropagation();
          this.model?.browser.close(tab.id);
        }}
        >×</span
      >
    </button>`;
  }

  render(): TemplateResult {
    const tabs = this.model?.browser.list() ?? [];
    const active = this.model?.browser.active() ?? null;
    const tab = this.#tab();
    return html`<div class="bar">
        <div class="tabs" role="tablist" aria-label="Browser tabs" @keydown=${this.#tabkey}>
          ${tabs.map((candidate) => this.#tabButton(candidate, active))}
        </div>
        <sp-action-button size="s" quiet label="New tab" title="New tab" @click=${() => this.model?.browser.open('about:blank')}>
          <sp-icon-add slot="icon"></sp-icon-add>
        </sp-action-button>
      </div>
      <form @submit=${this.#navigate}>
        <sp-action-button size="s" quiet label="Reload" title="Reload" ?disabled=${!tab} @click=${() => this.#reload()}>
          <sp-icon-refresh slot="icon"></sp-icon-refresh>
        </sp-action-button>
        <sp-textfield
          size="s"
          label="Address"
          placeholder="Enter an address"
          .value=${this.address}
          @input=${(event: Event) => {
            this.address = (event.target as HTMLInputElement).value;
          }}
          @keydown=${this.#keydown}
        ></sp-textfield>
        ${tab?.agentId ? html`<span class="driver">Driven by ${agentName(this.model, tab.agentId)}</span>` : nothing}
      </form>
      <div class="viewport">
        ${
          tab
            ? this.shot
              ? html`<img src=${this.shot} alt=${`Screenshot of ${tab.title}`} />`
              : html`<sp-progress-circle indeterminate label="Loading"></sp-progress-circle>`
            : html`<div class="note">No tabs open.</div>`
        }
      </div>`;
  }
}
