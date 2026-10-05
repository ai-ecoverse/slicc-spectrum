import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import type { AgentStatus, ColorScheme, SliccModel } from '../model/types.ts';

export class ModelElement extends LitElement {
  static properties = { model: { attribute: false } };
  static shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };
  declare model: SliccModel | null;
  #off: Array<() => void> = [];

  constructor() {
    super();
    this.model = null;
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    return [];
  }

  protected focusOn(selector: string): void {
    const focus = () => this.renderRoot.querySelector<HTMLElement>(selector)?.focus();
    if (this.hasUpdated) focus();
    else void this.updateComplete.then(focus);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#bind();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbind();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('model') && this.isConnected) this.#bind();
  }

  #bind(): void {
    this.#unbind();
    if (this.model) this.#off = this.subscribe(this.model);
  }

  #unbind(): void {
    for (const off of this.#off) off();
    this.#off = [];
  }
}

export type Color = 'light' | 'dark';

export function resolveColor(scheme: ColorScheme, prefersDark: boolean): Color {
  if (scheme === 'system') return prefersDark ? 'dark' : 'light';
  return scheme;
}

export class ThemedElement extends ModelElement {
  #media: MediaQueryList | null = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  #change = () => this.requestUpdate();

  get color(): Color {
    return resolveColor(
      this.model?.settings.get().color ?? 'system',
      this.#media?.matches ?? false
    );
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#media?.addEventListener('change', this.#change);
    return [
      () => this.#media?.removeEventListener('change', this.#change),
      model.settings.on('settings', this.#change),
    ];
  }
}

export const statusVariant = {
  idle: 'neutral',
  thinking: 'info',
  working: 'info',
  waiting: 'notice',
  error: 'negative',
} as const;

export function percent(fill: number): string {
  return `${Math.round(fill * 100)}%`;
}

export function dot(status: AgentStatus): TemplateResult {
  return html`<span class="dot" data-variant=${statusVariant[status]} aria-hidden="true"></span>`;
}

export const shared = css`
  .dot {
    display: inline-block;
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--spectrum-gray-500);
  }
  .dot[data-variant='info'] {
    background: var(--spectrum-informative-visual-color);
  }
  .dot[data-variant='notice'] {
    background: var(--spectrum-notice-visual-color);
  }
  .dot[data-variant='negative'] {
    background: var(--spectrum-negative-visual-color);
  }
  .count {
    display: inline-block;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--spectrum-accent-background-color-default);
    color: var(--spectrum-white, #fff);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }
  kbd {
    font-family: inherit;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 3px;
    padding: 0 3px;
  }
`;
