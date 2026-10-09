import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import type {
  AgentStatus,
  ChangesPort,
  ColorScheme,
  ModelOption,
  SliccModel,
} from '../model/types.ts';

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

  protected focusOn(...selectors: string[]): void {
    const focus = () =>
      selectors
        .map((selector) => this.renderRoot.querySelector<HTMLElement>(selector))
        .find(Boolean)
        ?.focus();
    if (this.hasUpdated) focus();
    else void this.updateComplete.then(focus);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#bind();
    this.requestUpdate();
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

export function changesOf(model: SliccModel): ChangesPort {
  return model.changes ?? model.files;
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

export const statusLabel: Record<AgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  working: 'Working',
  waiting: 'Waiting',
  error: 'Error',
};

export function percent(fill: number): string {
  return `${Math.round(fill * 100)}%`;
}

export function meterVariant(value: number): 'informative' | 'notice' | 'negative' {
  if (value >= 90) return 'negative';
  if (value >= 75) return 'notice';
  return 'informative';
}

export function chatModels(options: readonly ModelOption[]): ModelOption[] {
  return options.filter((option) => option.kind !== 'classifier' && option.tools !== false);
}

export function statusLight(status: AgentStatus): TemplateResult {
  return html`<swc-status-light size="s" variant=${statusVariant[status]}>${statusLabel[status]}</swc-status-light>`;
}

export const shared = css`
  .dot {
    display: inline-block;
    flex: none;
    width: var(--swc-spacing-100);
    height: var(--swc-spacing-100);
    border-radius: var(--swc-corner-radius-full);
    background: var(--swc-neutral-visual-color);
  }
  .dot[data-variant='info'] {
    background: var(--swc-informative-visual-color);
  }
  .dot[data-variant='notice'] {
    background: var(--swc-notice-visual-color);
  }
  .dot[data-variant='negative'] {
    background: var(--swc-negative-visual-color);
  }
  .count {
    display: inline-block;
    min-width: var(--swc-component-height-50);
    height: var(--swc-component-height-50);
    padding: 0 var(--swc-spacing-75);
    box-sizing: border-box;
    border-radius: var(--swc-component-height-50);
    background: var(--swc-accent-background-color-default);
    color: var(--swc-white);
    font-size: var(--swc-font-size-75);
    font-weight: var(--swc-bold-font-weight);
    line-height: var(--swc-component-height-50);
    text-align: center;
  }
  kbd {
    font-family: inherit;
    font-size: inherit;
    border: var(--swc-border-width-100) solid var(--swc-gray-300);
    border-radius: var(--swc-corner-radius-75);
    padding: 0 var(--swc-spacing-75);
  }
`;
