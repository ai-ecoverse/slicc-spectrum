import { html, LitElement, type TemplateResult } from 'lit';
import type { SliccModel, ToolCall } from '../model/types.ts';
import { chip, type Owner, overall, statusLabel, tool, toolSummary } from './messages.ts';

const opened = new Map<string, string>();
const labels = new Map<string, string>();
const latest = new Map<string, string>();
const asked = new Set<string>();

export class SliccToolRuns extends LitElement {
  static properties = {
    calls: { attribute: false },
    agent: { attribute: false },
    color: { attribute: false },
    model: { attribute: false },
    owners: { attribute: false },
  };
  declare calls: ToolCall[];
  declare agent: string;
  declare color: 'light' | 'dark';
  declare model: SliccModel | null;
  declare owners: ReadonlyMap<string, Owner> | null;
  #icons: HTMLElement | null = null;
  #count = 0;
  #resize = new ResizeObserver(() => this.#end());

  constructor() {
    super();
    this.calls = [];
    this.agent = '';
    this.color = 'light';
    this.model = null;
    this.owners = null;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.#icons) this.#resize.observe(this.#icons);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
  }

  get #anchor(): string {
    return this.calls[0]?.id ?? '';
  }

  get #key(): string {
    return this.calls.map((call) => call.id).join(' ');
  }

  get #open(): string {
    return opened.get(this.#anchor) ?? '';
  }

  #set(value: string): void {
    if (value) opened.set(this.#anchor, value);
    else opened.delete(this.#anchor);
    this.requestUpdate();
  }

  #toggled(call: ToolCall, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (open) this.#set(call.id);
    else if (this.#open === call.id) this.#set('');
  }

  #ask(): void {
    const key = this.#key;
    const anchor = this.#anchor;
    const port = this.model?.agent;
    if (this.calls.length < 2 || !port?.runLabel || asked.has(key)) return;
    asked.add(key);
    port.runLabel(this.agent, [...this.calls]).then(
      (text) => {
        const label = text?.trim();
        if (!label) return;
        labels.set(key, label);
        latest.set(anchor, label);
        this.requestUpdate();
      },
      () => undefined
    );
  }

  #end(): void {
    const icons = this.#icons as HTMLElement;
    const rtl = getComputedStyle(icons).direction === 'rtl';
    icons.scrollLeft = rtl ? -icons.scrollWidth : icons.scrollWidth;
  }

  protected willUpdate(): void {
    this.#ask();
  }

  protected updated(): void {
    const icons = this.querySelector('.icons') as HTMLElement;
    if (icons !== this.#icons) {
      this.#resize.disconnect();
      this.#resize.observe(icons);
      this.#icons = icons;
    }
    if (this.calls.length === this.#count) return;
    this.#count = this.calls.length;
    this.#end();
  }

  #card(call: ToolCall, run: boolean): TemplateResult {
    const open = this.#open;
    return tool(call, this.color, {
      run,
      open: open === call.id,
      owner: this.owners?.get(call.id),
      model: this.model,
      toggle: (event) => this.#toggled(call, event),
    });
  }

  render(): TemplateResult {
    const calls = this.calls;
    if (calls.length === 1) {
      return html`<div class="runs" data-runs="single" data-status=${calls[0].status}>${this.#card(calls[0], true)}</div>`;
    }
    const open = this.#open;
    const [status, label] = overall(calls);
    const summary = `${toolSummary(calls)}. ${label}`;
    const pick = (id: string) => this.#set(open === id ? '' : id);
    return html`<div class="runs" data-runs="cluster" data-status=${status} data-count=${calls.length}>
      <div class="strip" title=${summary}>
        <span class="icons" role="group" aria-label=${summary}>${calls.map(
          (call) =>
            html`<button type="button" class="run" data-action="open-run" data-target=${call.id} data-status=${call.status} aria-expanded=${open === call.id ? 'true' : 'false'} aria-controls=${`run-${call.id}`} aria-label=${`${call.title}, ${statusLabel(call.status)}`} title=${call.title} @click=${() => pick(call.id)}>${chip(call, this.model)}</button>`
        )}</span>
        <span class="label">${labels.get(this.#key) ?? latest.get(this.#anchor) ?? ''}</span>
      </div>
      <div class="cards" ?hidden=${!open}>${calls.map(
        (call) =>
          html`<div class="slot" ?hidden=${open !== call.id}>${this.#card(call, false)}</div>`
      )}</div>
    </div>`;
  }
}
