import '@spectrum-web-components/search/sp-search.js';
import { css, html, nothing, type ReactiveControllerHost, type TemplateResult } from 'lit';
import type { ModelOption } from '../model/types.ts';

const searchable = 5;
const field = 'sp-search[data-action=filter-models]';

type Picker = HTMLElement & { open: boolean };
type Search = HTMLElement & { focusElement: HTMLInputElement };

export const modelFilterCss = css`
  sp-search[data-action='filter-models'] {
    position: sticky;
    inset-block-start: 0;
    z-index: 1;
    box-sizing: border-box;
    width: 100%;
    padding: var(--swc-spacing-75) var(--swc-spacing-100);
    background: var(--mod-popover-background-color, var(--spectrum-popover-background-color));
  }
`;

export function matchesModel(option: ModelOption, query: string): boolean {
  const text = `${option.label} ${option.provider} ${option.id}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

function visible(picker: Element): HTMLElement | undefined {
  return [...picker.querySelectorAll<HTMLElement>('sp-menu-item[value]')].find(
    (item) => !item.hidden
  );
}

export class ModelFilter {
  #host: ReactiveControllerHost;
  #query = '';

  constructor(host: ReactiveControllerHost) {
    this.#host = host;
  }

  #set(query: string): void {
    if (query === this.#query) return;
    this.#query = query;
    this.#host.requestUpdate();
  }

  items(options: readonly ModelOption[]): TemplateResult {
    if (options.length <= searchable)
      return html`${options.map((option) => this.#item(option, false))}`;
    const shown = options.filter((option) => matchesModel(option, this.#query));
    return html`<sp-search
        size="s"
        data-action="filter-models"
        label="Filter models"
        placeholder="Filter models"
        .value=${this.#query}
        @input=${(event: Event) => this.#set((event.target as HTMLInputElement).value)}
        @change=${(event: Event) => event.stopPropagation()}
        @submit=${(event: Event) => event.preventDefault()}
        @keydown=${this.#key}
      ></sp-search>
      ${options.map((option) => this.#item(option, !shown.includes(option)))}
      ${shown.length ? nothing : html`<sp-menu-item disabled data-empty>No matching models</sp-menu-item>`}`;
  }

  #item(option: ModelOption, hidden: boolean): TemplateResult {
    return html`<sp-menu-item value=${option.id} ?hidden=${hidden}>${option.label}<span slot="description">${option.provider}</span></sp-menu-item>`;
  }

  readonly opened = (event: Event): void => {
    const search = (event.currentTarget as Element).querySelector<HTMLElement>(field);
    if (search) queueMicrotask(() => search.focus());
  };

  readonly closed = (): void => this.#set('');

  readonly keys = {
    capture: true,
    handleEvent: (event: KeyboardEvent): void => {
      const picker = event.currentTarget as Picker;
      const search = picker.querySelector<Search>(field);
      if (!search || !picker.open) return;
      if (event.target === search) {
        if (event.key === 'Escape' && this.#query) event.preventDefault();
        return;
      }
      if (event.key.trim().length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      search.focus();
      const end = search.focusElement.value.length;
      search.focusElement.setSelectionRange(end, end);
    },
  };

  #key = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' || (event.key === 'Escape' && !event.defaultPrevented)) return;
    event.stopPropagation();
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
    event.preventDefault();
    const first = visible((event.currentTarget as Element).parentElement as Element);
    if (event.key === 'Enter') first?.click();
    else first?.focus();
  };
}
