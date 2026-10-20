import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-add.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import '@adobe/spectrum-wc-icons/swc-icon-close.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Agent, SliccModel } from '../model/types.ts';
import { ModelElement, percent, shared, statusLabel } from './base.ts';
import { confirm, prompt } from './confirm.ts';
import { onWatch, watchOnly } from './follow.ts';
import { deleteCone } from './freezer.ts';
import { meterVariant } from './monitor.ts';
import { agentTitle, coneLabel, untitled, watchTitles } from './names.ts';
import { ViewScroll, ViewSet, ViewState } from './view-state.ts';

export function ordered(agents: readonly Agent[]): Agent[] {
  const cones = agents.filter((agent) => agent.kind === 'cone');
  return cones.flatMap((cone) => [cone, ...agents.filter((agent) => agent.parentId === cone.id)]);
}

export function creatable(model: SliccModel | null | undefined): boolean {
  return Boolean(model?.agent.createCone) && !watchOnly(model);
}

export async function createCone(
  model: SliccModel,
  trigger: HTMLElement
): Promise<Agent | undefined> {
  const port = model.agent;
  const create = port.createCone?.bind(port);
  if (!create) return undefined;
  let created: Agent | undefined;
  await prompt({
    title: 'New cone',
    label: 'Name',
    action: 'Create',
    trigger,
    submit: async (name) => {
      if (watchOnly(model)) return;
      created = await create(name);
    },
  });
  if (created) port.select(created.id);
  return created;
}

const statusOrder: readonly Agent['status'][] = ['working', 'thinking', 'waiting', 'error', 'idle'];

export function scoopSummary(scoops: readonly Agent[]): string {
  if (scoops.length === 0) return '';
  const counts = statusOrder
    .map((status) => [status, scoops.filter((scoop) => scoop.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${statusLabel[status].toLowerCase()}`);
  return `${scoopCount(scoops)}: ${counts.join(', ')}`;
}

function scoopCount(scoops: readonly Agent[]): string {
  return `${scoops.length} scoop${scoops.length === 1 ? '' : 's'}`;
}

export function scoopBrief(scoops: readonly Agent[]): string {
  if (scoops.length === 0) return '';
  const busy = statusOrder
    .filter((status) => status !== 'idle')
    .map((status) => [status, scoops.filter((scoop) => scoop.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${statusLabel[status].toLowerCase()}`);
  return [scoopCount(scoops), busy.join(', ')].filter(Boolean).join(' · ');
}

export function unreadCount(unread: number): string {
  return unread > 99 ? '99+' : String(unread);
}

export function fillShown(fill: number): boolean {
  return fill >= 0.5;
}

type Tooltip = HTMLElement & { triggerElement: HTMLElement | null };

export class SliccAgents extends ModelElement {
  static properties = { ...ModelElement.properties, errors: { state: true } };
  declare errors: Record<string, string>;
  #expanded = new ViewSet(this, 'agents');
  #revealed = new ViewState(this, 'agents:revealed', () => '');
  #scroll = new ViewScroll(this, 'agents:scroll', {
    scroller: () => this.renderRoot.querySelector<HTMLElement>('.list'),
    rows: 'li[data-id]',
    current: "li[aria-selected='true']",
  });
  #pointer = false;
  #modality = (event: Event): void => {
    this.#pointer = event.type === 'pointerdown';
  };

  constructor() {
    super();
    this.errors = {};
  }

  static styles = [
    shared,
    css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--swc-background-layer-1-color);
      color: var(--swc-neutral-content-color-default);
      font-size: var(--swc-font-size-100);
    }
    .list {
      flex: 1;
      min-block-size: 0;
      overflow-y: auto;
    }
    .note {
      margin: 0;
      padding: var(--swc-spacing-400);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .actions {
      display: flex;
      padding: var(--swc-spacing-75) var(--swc-spacing-100);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: var(--swc-spacing-75) 0;
    }
    li {
      --row-background: var(--swc-background-layer-1-color);
      position: relative;
      display: grid;
      grid-template-columns: var(--swc-component-height-75) minmax(0, 1fr) auto;
      grid-template-areas:
        'toggle head fill'
        'toggle description strip'
        'toggle ribbon ribbon'
        'toggle error error';
      align-items: start;
      column-gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-75) var(--swc-spacing-200) var(--swc-spacing-75) var(--swc-spacing-100);
      background: var(--row-background);
      cursor: pointer;
    }
    li.scoop {
      padding-inline-start: calc(var(--swc-spacing-100) + var(--swc-spacing-300));
    }
    li:hover {
      --row-background: var(--swc-gray-100);
    }
    li[aria-selected='true'] {
      --row-background: var(--swc-gray-200);
    }
    li[aria-selected='true']::before {
      content: '';
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      inline-size: var(--swc-spacing-75);
      background: var(--swc-accent-color-900);
    }
    li:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .toggle {
      grid-area: toggle;
      align-self: start;
    }
    .toggle swc-icon-chevron-right:dir(rtl) {
      transform: scaleX(-1);
    }
    .toggle[data-open] swc-icon-chevron-right {
      transform: rotate(90deg);
    }
    .head {
      grid-area: head;
      align-self: center;
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-75);
      min-inline-size: 0;
      min-block-size: var(--swc-component-height-75);
    }
    .head > * {
      flex: none;
    }
    .marker {
      --status-color: var(--swc-gray-600);
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      inline-size: var(--swc-spacing-200);
      block-size: var(--swc-spacing-200);
      border-radius: var(--swc-corner-radius-full);
      background: var(--status-color);
    }
    .marker.unread {
      --status-color: var(--swc-accent-background-color-default);
      inline-size: auto;
      min-inline-size: var(--swc-spacing-300);
      block-size: var(--swc-spacing-300);
      padding-inline: var(--swc-spacing-75);
      color: var(--swc-white);
      font-size: var(--swc-font-size-50);
      font-variant-numeric: tabular-nums;
      font-weight: var(--swc-bold-font-weight);
      line-height: var(--swc-line-height-100);
    }
    .marker.unread[data-status='error'] {
      --status-color: var(--swc-negative-background-color-default);
    }
    .name {
      flex: 0 1 auto;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cone .name {
      font-weight: var(--swc-bold-font-weight);
    }
    .title {
      grid-area: description;
      align-self: start;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      overflow-wrap: anywhere;
      line-height: var(--swc-line-height-100);
      font-size: var(--swc-font-size-75);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .state {
      color: var(--swc-neutral-content-color-default);
    }
    .ribbon {
      grid-area: ribbon;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--swc-spacing-100);
      min-inline-size: 0;
      margin-block-start: var(--swc-spacing-75);
      font-size: var(--swc-font-size-75);
      line-height: var(--swc-line-height-100);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .segments {
      display: flex;
      flex-wrap: wrap;
      gap: var(--swc-spacing-50);
      min-inline-size: 0;
    }
    .summary {
      min-inline-size: 0;
    }
    .segment {
      --status-color: var(--swc-gray-600);
      flex: none;
      inline-size: var(--swc-spacing-200);
      block-size: var(--swc-spacing-75);
      border-radius: var(--swc-corner-radius-full);
      background: var(--status-color);
    }
    [data-status='thinking'],
    [data-status='working'] {
      --status-color: var(--swc-informative-color-900);
    }
    [data-status='waiting'] {
      --status-color: var(--swc-notice-color-900);
    }
    [data-status='error'] {
      --status-color: var(--swc-negative-color-900);
    }
    .fill {
      grid-area: fill;
      align-self: center;
      justify-self: end;
      font-size: var(--swc-font-size-75);
      line-height: var(--swc-line-height-100);
      font-variant-numeric: tabular-nums;
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .fill[data-variant='notice'] {
      color: var(--swc-notice-color-1000);
      font-weight: var(--swc-bold-font-weight);
    }
    .fill[data-variant='negative'] {
      color: var(--swc-negative-color-1000);
      font-weight: var(--swc-bold-font-weight);
    }
    .drop-cell {
      grid-area: strip;
      align-self: center;
      justify-self: end;
      display: flex;
      opacity: 0;
    }
    li:hover .drop-cell,
    li:focus-visible .drop-cell,
    .drop-cell[data-shown] {
      opacity: 1;
    }
    .error {
      grid-area: error;
      margin-block-start: var(--swc-spacing-75);
      color: var(--swc-negative-color-1100);
      font-size: var(--swc-font-size-75);
    }
    .sr {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    @media (hover: none), (pointer: coarse) {
      .drop-cell {
        opacity: 1;
      }
    }
    @media (forced-colors: active) {
      .marker,
      .segment,
      li[aria-selected='true']::before {
        forced-color-adjust: none;
        background: CanvasText;
      }
      .marker.unread,
      li[aria-selected='true']::before {
        background: Highlight;
        color: HighlightText;
      }
    }
  `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#reveal(model);
    return [
      model.agent.on('agents', () => this.requestUpdate()),
      ...(model.agent.starting ? [model.agent.on('starting', () => this.requestUpdate())] : []),
      model.agent.on('active', () => {
        this.#reveal(model);
        this.requestUpdate();
      }),
      watchTitles(model, () => this.requestUpdate()),
      ...onWatch(model, () => this.requestUpdate()),
      this.#watchPointer(),
    ];
  }

  #watchPointer(): () => void {
    const types = ['pointerdown', 'keydown'];
    for (const type of types) globalThis.addEventListener(type, this.#modality, true);
    return () => {
      for (const type of types) globalThis.removeEventListener(type, this.#modality, true);
    };
  }

  #reveal(model: SliccModel): void {
    const focused = model.agent.list().find((agent) => agent.id === model.agent.active());
    const cone = focused?.kind === 'cone' ? focused.id : focused?.parentId;
    if (!cone || focused?.id === this.#revealed.value) return;
    this.#revealed.value = focused?.id as string;
    this.#expanded.toggle(cone, true);
  }

  #select(agent: Agent): void {
    this.model?.agent.select(agent.id);
    if (agent.kind === 'cone') this.#toggle(agent, true);
  }

  #toggle(agent: Agent, open = !this.#expanded.has(agent.id)): void {
    this.#expanded.toggle(agent.id, open);
  }

  focus(): void {
    this.focusOn('li[tabindex="0"]');
  }

  #items(): HTMLElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLElement>('li')];
  }

  #keydown(event: KeyboardEvent): void {
    const items = this.#items();
    const index = items.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, moves[event.key]))]?.focus();
      return;
    }
    const agent = this.model?.agent.list().find((item) => item.id === items[index]?.dataset.id);
    if (!agent) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.#select(agent);
    } else if (event.key === 'ArrowRight' && this.#scoops(agent).length > 0) {
      event.preventDefault();
      if (this.#expanded.has(agent.id)) items[index + 1].focus();
      else this.#toggle(agent, true);
    } else if (event.key === 'ArrowLeft' && agent.kind === 'scoop') {
      event.preventDefault();
      items.find((item) => item.dataset.id === agent.parentId)?.focus();
    } else if (event.key === 'ArrowLeft' && this.#expanded.has(agent.id)) {
      event.preventDefault();
      this.#toggle(agent, false);
    } else if (event.key === 'Delete') {
      if (this.#droppable(agent)) {
        event.preventDefault();
        void this.#drop(agent, items[index]);
      } else if (this.#deletable(agent)) {
        event.preventDefault();
        void this.#deleteCone(agent, items[index]);
      }
    }
  }

  #scoops(agent: Agent): Agent[] {
    if (agent.kind !== 'cone') return [];
    return (this.model as SliccModel).agent.list().filter((other) => other.parentId === agent.id);
  }

  #focusin(event: FocusEvent): void {
    const cell = (event.target as Element).closest('.drop-cell');
    cell?.toggleAttribute('data-shown', !this.#pointer);
  }

  #focusout(event: FocusEvent): void {
    (event.target as Element).closest('.drop-cell')?.removeAttribute('data-shown');
  }

  #droppable(agent: Agent): boolean {
    return agent.kind === 'scoop' && Boolean(this.model?.agent.drop) && !watchOnly(this.model);
  }

  #deletable(agent: Agent): boolean {
    return (
      agent.kind === 'cone' &&
      !agent.frozen &&
      Boolean(this.model?.agent.freeze) &&
      !watchOnly(this.model)
    );
  }

  async #deleteCone(agent: Agent, trigger: HTMLElement): Promise<void> {
    if (!(await deleteCone(this.model as SliccModel, agent, trigger))) return;
    await this.updateComplete;
    this.focus();
  }

  async #drop(agent: Agent, trigger: HTMLElement): Promise<void> {
    const port = this.model?.agent;
    if (!port?.drop) return;
    const ok = await confirm({
      title: `Drop scoop ${agent.name}?`,
      body: 'It stops, and its working folder is deleted. Its conversation and reports are kept. You can’t undo this.',
      action: 'Drop',
      variant: 'destructive',
      trigger,
    });
    if (!ok || watchOnly(this.model)) return;
    const { [agent.id]: _, ...rest } = this.errors;
    this.errors = rest;
    try {
      await port.drop(agent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors = { ...this.errors, [agent.id]: `Couldn’t drop ${agent.name}: ${message}` };
      return;
    }
    const current = port.active();
    const stale =
      current === agent.id || !port.list().some((candidate) => candidate.id === current);
    if (stale && agent.parentId) port.select(agent.parentId);
    await this.updateComplete;
    this.focus();
  }

  #dropButton(agent: Agent, selected: boolean): TemplateResult | typeof nothing {
    if (!this.#droppable(agent)) return nothing;
    const id = `drop-${agent.id}`;
    const label = `Drop scoop ${agent.name}`;
    return html`<span class="drop-cell"
        ><swc-action-button
          id=${id}
          class="drop"
          size="m"
          quiet
          tabindex=${selected ? '0' : '-1'}
          data-action="drop"
          accessible-label=${label}
          @click=${(event: Event) => {
            event.stopPropagation();
            void this.#drop(agent, event.currentTarget as HTMLElement);
          }}
          ><swc-icon-close slot="icon"></swc-icon-close></swc-action-button
        ><swc-tooltip for=${id} placement="start">${label}</swc-tooltip></span
      >`;
  }

  #deleteButton(agent: Agent, selected: boolean): TemplateResult | typeof nothing {
    if (!this.#deletable(agent)) return nothing;
    const id = `delete-${agent.id}`;
    const label = `Delete cone ${coneLabel(this.model as SliccModel, agent)}`;
    return html`<span class="drop-cell"
        ><swc-action-button
          id=${id}
          class="drop"
          size="m"
          quiet
          tabindex=${selected ? '0' : '-1'}
          data-action="delete-cone"
          accessible-label=${label}
          @click=${(event: Event) => {
            event.stopPropagation();
            void this.#deleteCone(agent, event.currentTarget as HTMLElement);
          }}
          ><swc-icon-delete slot="icon"></swc-icon-delete></swc-action-button
        ><swc-tooltip for=${id} placement="start">${label}</swc-tooltip></span
      >`;
  }

  #ribbon(scoops: readonly Agent[]): TemplateResult | typeof nothing {
    if (scoops.length === 0) return nothing;
    return html`<span class="ribbon"><span class="segments" aria-hidden="true">${scoops.map(
      (scoop) => html`<span class="segment" data-status=${scoop.status}></span>`
    )}</span><span class="summary">${scoopBrief(scoops)}</span></span>`;
  }

  #disclosure(
    agent: Agent,
    scoops: readonly Agent[],
    open: boolean
  ): TemplateResult | typeof nothing {
    if (scoops.length === 0) return nothing;
    return html`<swc-action-button
      class="toggle"
      size="s"
      quiet
      tabindex="-1"
      aria-hidden="true"
      data-action="toggle-cone"
      ?data-open=${open}
      @mousedown=${(event: Event) => event.preventDefault()}
      @click=${(event: Event) => {
        event.stopPropagation();
        this.#toggle(agent);
      }}
      ><swc-icon-chevron-right slot="icon"></swc-icon-chevron-right
    ></swc-action-button>`;
  }

  #row(agent: Agent, active: string, anchor: string): TemplateResult {
    const selected = agent.id === active;
    const current = agent.id === anchor;
    const error = this.errors[agent.id];
    const model = this.model as SliccModel;
    const title = agentTitle(model, agent);
    const scoops = this.#scoops(agent);
    const open = this.#expanded.has(agent.id);
    const unread = selected ? 0 : agent.unread;
    const label = `${coneLabel(model, agent)}: ${statusLabel[agent.status]}, ${percent(agent.contextFill)} context${
      unread ? `, ${unread} unread` : ''
    }${error ? `. ${error}` : ''}`;
    const summary = scoopSummary(scoops);
    return html`<li
      role="treeitem"
      id=${`row-${agent.id}`}
      class=${agent.kind}
      data-id=${agent.id}
      aria-level=${agent.kind === 'cone' ? '1' : '2'}
      aria-selected=${selected ? 'true' : 'false'}
      aria-expanded=${scoops.length ? String(open) : nothing}
      aria-controls=${open && scoops.length ? scoops.map((scoop) => `row-${scoop.id}`).join(' ') : nothing}
      aria-label=${label}
      aria-description=${summary || nothing}
      tabindex=${current ? '0' : '-1'}
      aria-keyshortcuts=${this.#droppable(agent) || this.#deletable(agent) ? 'Delete' : nothing}
      title=${summary ? `${label}. ${summary}` : label}
      @click=${() => this.#select(agent)}
    >
      ${this.#disclosure(agent, scoops, open)}
      <div class="head">
        ${
          unread
            ? html`<span class="marker unread" data-status=${agent.status} aria-hidden="true">${unreadCount(unread)}</span>`
            : html`<span class="marker status" data-status=${agent.status} aria-hidden="true"></span>`
        }
        <span class="name">${agent.name}</span>
      </div>
      ${
        fillShown(agent.contextFill)
          ? html`<span class="fill" data-variant=${meterVariant(agent.contextFill)}>${percent(agent.contextFill)}</span>`
          : nothing
      }
      <span class="title"><span class="state">${statusLabel[agent.status]}</span> · ${title || untitled}</span>
      ${this.#ribbon(scoops)}
      ${this.#dropButton(agent, selected)}
      ${this.#deleteButton(agent, selected)}
      ${error ? html`<span class="error">${error}</span>` : nothing}
    </li>`;
  }

  async #newCone(trigger: HTMLElement): Promise<void> {
    if (!(await createCone(this.model as SliccModel, trigger))) return;
    await this.updateComplete;
    this.focus();
  }

  #actions(): TemplateResult | typeof nothing {
    if (!creatable(this.model)) return nothing;
    return html`<div class="actions">
      <swc-action-button size="s" quiet data-action="new-cone" @click=${(event: Event) => void this.#newCone(event.currentTarget as HTMLElement)}>
        <swc-icon-add slot="icon"></swc-icon-add>New cone
      </swc-action-button>
    </div>`;
  }

  protected updated(): void {
    for (const tip of this.renderRoot.querySelectorAll<Tooltip>('swc-tooltip')) {
      tip.triggerElement = tip.previousElementSibling as HTMLElement;
    }
  }

  render(): TemplateResult {
    const list = this.model?.agent.list() ?? [];
    if (!list.length && this.model?.agent.starting?.())
      return html`<div class="list"><p class="note" data-empty="starting">The agent shows up here once it starts.</p></div>`;
    const active = this.model?.agent.active() ?? '';
    const errors = Object.values(this.errors);
    const rows = ordered(list).filter(
      (agent) => agent.kind === 'cone' || this.#expanded.has(agent.parentId as string)
    );
    const shown = rows.find((agent) => agent.id === active);
    const anchor = shown ? active : (list.find((agent) => agent.id === active)?.parentId ?? '');
    return html`<div class="list"><ul role="tree" aria-label="Cones and scoops" @keydown=${this.#keydown} @focusin=${this.#focusin} @focusout=${this.#focusout}>
        ${repeat(
          rows,
          (agent) => agent.id,
          (agent) => this.#row(agent, active, anchor)
        )}
      </ul></div>${this.#actions()}
      <div class="sr" role="status">${errors.at(-1) ?? ''}</div>`;
  }
}
