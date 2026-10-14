import '@spectrum-web-components/search/sp-search.js';
import { css, html, type TemplateResult } from 'lit';

export interface SearchOptions {
  label: string;
  value: string;
  input: (value: string) => void;
  keydown?: (event: KeyboardEvent) => void;
}

export const searchCss = css`
  sp-search[data-action='search'] {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
  }
`;

export function search(options: SearchOptions): TemplateResult {
  const { label, value, input, keydown } = options;
  return html`<sp-search
    size="s"
    data-action="search"
    label=${label}
    placeholder=${label}
    .value=${value}
    @input=${(event: Event) => input((event.target as HTMLInputElement).value)}
    @change=${(event: Event) => input((event.target as HTMLInputElement).value)}
    @submit=${(event: Event) => event.preventDefault()}
    @keydown=${(event: KeyboardEvent) => keydown?.(event)}
  ></sp-search>`;
}
