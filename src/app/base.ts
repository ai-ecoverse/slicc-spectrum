import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import type {
  AgentStatus,
  ChangesPort,
  ColorScheme,
  ModelOption,
  SliccModel,
} from '../model/types.ts';

function keyboardFocus(): boolean {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return !!active?.matches(':focus-visible');
}

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
    this.focusWith({}, ...selectors);
  }

  protected focusWith(options: FocusOptions, ...selectors: string[]): void {
    const settled = { focusVisible: keyboardFocus(), ...options };
    const focus = () =>
      selectors
        .map((selector) => this.renderRoot.querySelector<HTMLElement>(selector))
        .find(Boolean)
        ?.focus(settled);
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

interface Paint {
  scheme: string;
  priority: string;
  tones: Map<HTMLMetaElement, string>;
  holds: Map<object, Color | null>;
}

export interface DocumentHold {
  paint(color: Color): void;
  release(): void;
}

const paints = new WeakMap<Document, Paint>();

function schemeOf(media: string): Color | null {
  const query = media.replace(/\s/g, '').toLowerCase();
  const scheme = query.match(/prefers-color-scheme:(light|dark)/)?.[1] as Color | undefined;
  if (!scheme) return null;
  if (!query.startsWith('not')) return scheme;
  return scheme === 'dark' ? 'light' : 'dark';
}

function apply(doc: Document, paint: Paint, color: Color): void {
  doc.documentElement.style.colorScheme = color;
  const metas = [...doc.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  for (const meta of metas) if (!paint.tones.has(meta)) paint.tones.set(meta, meta.content);
  const own = metas.find((meta) => schemeOf(meta.media ?? '') === color);
  if (!own) return;
  const tone = paint.tones.get(own) as string;
  for (const meta of metas) meta.content = tone;
}

export function holdDocument(doc: Document): DocumentHold {
  const paint = paints.get(doc) ?? {
    scheme: doc.documentElement.style.colorScheme,
    priority: doc.documentElement.style.getPropertyPriority('color-scheme'),
    tones: new Map(),
    holds: new Map(),
  };
  paints.set(doc, paint);
  const key = {};
  paint.holds.set(key, null);
  return {
    paint(color) {
      if (!paint.holds.has(key)) return;
      paint.holds.delete(key);
      paint.holds.set(key, color);
      apply(doc, paint, color);
    },
    release() {
      if (!paint.holds.delete(key)) return;
      const left = [...paint.holds.values()].filter((color) => color !== null);
      if (left.length) return apply(doc, paint, left[left.length - 1] as Color);
      if (paint.holds.size) return;
      paints.delete(doc);
      doc.documentElement.style.setProperty('color-scheme', paint.scheme, paint.priority);
      for (const [meta, tone] of paint.tones) meta.content = tone;
    },
  };
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

export function speech<T>(): (new () => T) | undefined {
  const scope = globalThis as {
    SpeechRecognition?: new () => T;
    webkitSpeechRecognition?: new () => T;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}
