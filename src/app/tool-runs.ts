import { html, LitElement, type TemplateResult } from 'lit';
import type { SliccModel, ToolCall } from '../model/types.ts';
import { chip, type Owner, overall, state, statusLabel, tool, toolSummary } from './messages.ts';

const opened = new Map<string, string>();

export class SliccToolRuns extends LitElement {
  static properties = {
    calls: { attribute: false },
    color: { attribute: false },
    model: { attribute: false },
    owners: { attribute: false },
  };
  declare calls: ToolCall[];
  declare color: 'light' | 'dark';
  declare model: SliccModel | null;
  declare owners: ReadonlyMap<string, Owner> | null;

  constructor() {
    super();
    this.calls = [];
    this.color = 'light';
    this.model = null;
    this.owners = null;
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  get #anchor(): string {
    return this.calls[0]?.id ?? '';
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
    const current = this.#open;
    if (open && current !== 'all') this.#set(call.id);
    if (!open && current === call.id) this.#set('');
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
    const pick = (id: string) => this.#set(open === id ? '' : id);
    return html`<div class="runs" data-runs="cluster" data-status=${status} data-count=${calls.length}>
      <div class="strip">
        <span class="icons" role="group" aria-label=${`${calls.length} tool runs`}>${calls.map(
          (call) =>
            html`<button type="button" class="run" data-action="open-run" data-target=${call.id} data-status=${call.status} aria-expanded=${open === call.id ? 'true' : 'false'} aria-controls=${`run-${call.id}`} aria-label=${`${call.title}, ${statusLabel(call.status)}`} title=${call.title} @click=${() => pick(call.id)}>${chip(call, this.model)}</button>`
        )}</span>
        <button type="button" class="summary" data-action="open-cluster" aria-expanded=${open === 'all' ? 'true' : 'false'} @click=${() => pick('all')}>
          <swc-icon-chevron-right class="chevron" size="s" aria-hidden="true"></swc-icon-chevron-right>
          <span class="names">${toolSummary(calls)}</span>
          ${state(status, label)}
        </button>
      </div>
      <div class="cards" ?hidden=${!open}>${calls.map(
        (call) =>
          html`<div class="slot" ?hidden=${open !== 'all' && open !== call.id}>${this.#card(call, false)}</div>`
      )}</div>
    </div>`;
  }
}
