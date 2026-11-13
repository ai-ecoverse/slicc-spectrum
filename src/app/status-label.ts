import { html, LitElement, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { AgentPort, SliccModel, ToolCall } from '../model/types.ts';
import { commandText, displayCommand } from './command-display.ts';
import { modelText } from './guard.ts';
import { askStep, StepWatch, stepLabel } from './step-labels.ts';
import { rawTitle } from './tool-title.ts';

interface Labels {
  done: Map<string, string>;
  latest: Map<string, string>;
  asked: Set<string>;
}

const caches = new WeakMap<AgentPort, Labels>();

function cache(port: AgentPort): Labels {
  const found = caches.get(port);
  if (found) return found;
  const fresh: Labels = { done: new Map(), latest: new Map(), asked: new Set() };
  caches.set(port, fresh);
  return fresh;
}

export const hold = 1000;

export class SliccStatusLabel extends LitElement {
  static properties = {
    text: { attribute: false },
    note: { attribute: false },
    state: { attribute: false },
    calls: { attribute: false },
    agent: { attribute: false },
    model: { attribute: false },
  };
  declare text: string;
  declare note: string;
  declare state: 'active' | 'complete' | 'stopped';
  declare calls: ToolCall[];
  declare agent: string;
  declare model: SliccModel | null;
  #shown = '';
  #at = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #watch = new StepWatch(() => this.requestUpdate());

  constructor() {
    super();
    this.text = '';
    this.note = '';
    this.state = 'active';
    this.calls = [];
    this.agent = '';
    this.model = null;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#cancel();
    this.#watch.stop();
  }

  get shown(): string {
    return this.#shown;
  }

  get #key(): string {
    return `${this.agent} ${this.calls.map((call) => call.id).join(' ')}`;
  }

  get #anchor(): string {
    return `${this.agent} ${this.calls[0]?.id ?? ''}`;
  }

  #needsLabel(): boolean {
    if (this.calls.length >= 2) return true;
    const only = this.calls[0];
    return !!only && rawTitle(only.title);
  }

  #step(): ToolCall | undefined {
    if (!this.model?.agent?.stepLabel) return undefined;
    if (this.state === 'active')
      return this.calls.findLast((call) => call.status === 'running') ?? this.calls.at(-1);
    return this.calls.length === 1 ? this.calls[0] : undefined;
  }

  #ask(): void {
    const port = this.model?.agent;
    if (this.state === 'stopped') return;
    const step = this.#step();
    if (step) {
      askStep(port, this.agent, step.id);
      return;
    }
    if (!this.#needsLabel() || !port?.toolLabel) return;
    const store = cache(port);
    const key = this.#key;
    const anchor = this.#anchor;
    if (store.asked.has(key)) return;
    store.asked.add(key);
    port
      .toolLabel(
        this.agent,
        this.calls.map((call) => call.id)
      )
      .then(
        (text) => {
          const label = modelText(text?.trim() ?? '');
          if (!label) return;
          store.done.set(key, label);
          store.latest.set(anchor, label);
          this.requestUpdate();
        },
        () => undefined
      );
  }

  #label(): string {
    const port = this.model?.agent;
    const step = this.#step();
    if (step) return stepLabel(port, this.agent, step.id);
    const store = port ? caches.get(port) : undefined;
    return store?.done.get(this.#key) ?? store?.latest.get(this.#anchor) ?? '';
  }

  #wanted(): string {
    if (this.state === 'stopped') return this.text;
    const base = this.#label() || this.text;
    return base && this.note ? `${this.note} · ${base}` : base;
  }

  #cancel(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  protected willUpdate(): void {
    if (this.isConnected) this.#watch.watch(this.model?.agent, this.agent, this.#step()?.id);
    this.#ask();
    const wanted = this.#wanted();
    if (wanted === this.#shown) {
      this.#cancel();
      if (this.#at === Number.NEGATIVE_INFINITY) this.#at = performance.now();
      return;
    }
    const wait = this.#at + hold - performance.now();
    if (this.state !== 'active' || wait <= 0) {
      this.#cancel();
      this.#shown = wanted;
      this.#at = performance.now();
      return;
    }
    this.#timer ??= setTimeout(() => {
      this.#timer = undefined;
      this.requestUpdate();
    }, wait);
  }

  render(): TemplateResult {
    return html`${keyed(this.#shown, html`<span title=${displayCommand(this.#shown)}>${commandText(this.#shown, false)}</span>`)}`;
  }
}
