import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-add.js';
import '@adobe/spectrum-wc-icons/swc-icon-close.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, SliccModel } from '../model/types.ts';
import { ModelElement, percent, shared, statusLabel } from './base.ts';
import { confirm, prompt } from './confirm.ts';
import { watchOnly } from './follow.ts';
import { deleteCone } from './freezer.ts';
import { meterVariant } from './monitor.ts';
import { agentTitle, coneLabel, untitled, watchTitles } from './names.ts';

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

export function fillShown(fill: number): boolean {
  return fill >= 0.5;
}

export class SliccAgents extends ModelElement {
  static properties = { ...ModelElement.properties, errors: { state: true } };
  declare errors: Record<string, string>;
  #expanded: string | null = null;

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
      --row-head: 1lh;
      --row-description: calc(2 * 1.4 * var(--swc-font-size-75));
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'head fill' 'description description' 'ribbon ribbon' 'error error';
      grid-template-rows: var(--row-head) var(--row-description) var(--swc-spacing-100);
      align-items: center;
      column-gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-75) var(--swc-spacing-200);
      background: var(--row-background);
      cursor: pointer;
    }
    li.scoop {
      padding-inline-start: calc(var(--swc-spacing-200) + var(--swc-spacing-300));
    }
    li:hover {
      --row-background: var(--swc-gray-100);
    }
    li[aria-selected='true'] {
      --row-background: var(--swc-gray-200);
    }
    li:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .head {
      grid-area: head;
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-75);
      min-inline-size: 0;
    }
    .head > * {
      flex: none;
    }
    .marker {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--swc-spacing-200);
      block-size: var(--swc-spacing-200);
      border-radius: var(--swc-corner-radius-full);
      font-size: var(--swc-font-size-25);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .marker.unread {
      background: var(--swc-accent-visual-color);
      color: #fff;
      font-weight: var(--swc-bold-font-weight);
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
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      overflow-wrap: anywhere;
      line-height: 1.4;
      font-size: var(--swc-font-size-75);
      color: var(--swc-neutral-subdued-content-color-default);
    }
    .ribbon {
      grid-area: ribbon;
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-50);
      overflow: hidden;
    }
    .status,
    .segment {
      background: var(--swc-neutral-visual-color);
    }
    .status[data-status='thinking'],
    .status[data-status='working'],
    .segment[data-status='thinking'],
    .segment[data-status='working'] {
      background: var(--swc-informative-visual-color);
    }
    .status[data-status='waiting'],
    .segment[data-status='waiting'] {
      background: var(--swc-notice-visual-color);
    }
    .status[data-status='error'],
    .segment[data-status='error'] {
      background: var(--swc-negative-visual-color);
    }
    .segment {
      flex: none;
      inline-size: var(--swc-spacing-200);
      block-size: var(--swc-spacing-50);
      border-radius: var(--swc-corner-radius-full);
    }
    .fill {
      grid-area: fill;
      position: relative;
      z-index: 1;
      align-self: start;
      font-size: var(--swc-font-size-75);
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
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      display: flex;
      align-items: center;
      padding-inline: var(--swc-spacing-100);
      background: var(--row-background);
      visibility: hidden;
    }
    li:hover .drop-cell,
    li:focus-visible .drop-cell {
      visibility: visible;
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
        visibility: visible;
      }
    }
  `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const focused = this.#focused(model);
    this.#expanded = focused?.kind === 'scoop' ? focused.parentId : null;
    return [
      model.agent.on('agents', () => this.requestUpdate()),
      model.agent.on('active', () => {
        const next = this.#focused(model);
        if (next) this.#expanded = next.kind === 'cone' ? next.id : next.parentId;
        this.requestUpdate();
      }),
      watchTitles(model, () => this.requestUpdate()),
      ...(model.follow ? [model.follow.on('follow', () => this.requestUpdate())] : []),
    ];
  }

  #focused(model: SliccModel): Agent | undefined {
    return model.agent.list().find((agent) => agent.id === model.agent.active());
  }

  #select(id: string): void {
    this.model?.agent.select(id);
  }

  #pick(agent: Agent): void {
    const open = agent.kind === 'cone' && this.#expanded !== agent.id;
    this.#select(agent.id);
    if (agent.kind === 'cone') this.#expanded = open ? agent.id : null;
    this.requestUpdate();
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
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const agent = this.model?.agent.list().find((item) => item.id === items[index]?.dataset.id);
      if (agent) this.#pick(agent);
    } else if (event.key === 'Delete') {
      const agent = this.model?.agent.list().find((item) => item.id === items[index]?.dataset.id);
      if (agent && this.#droppable(agent)) {
        event.preventDefault();
        void this.#drop(agent, items[index]);
      } else if (agent && this.#deletable(agent)) {
        event.preventDefault();
        void this.#deleteCone(agent, items[index]);
      }
    }
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

  #dropButton(agent: Agent): TemplateResult | typeof nothing {
    if (!this.#droppable(agent)) return nothing;
    const id = `drop-${agent.id}`;
    const label = `Drop scoop ${agent.name}`;
    return html`<span class="drop-cell"
        ><swc-action-button
          id=${id}
          class="drop"
          size="l"
          quiet
          tabindex="-1"
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

  #deleteButton(agent: Agent): TemplateResult | typeof nothing {
    if (!this.#deletable(agent)) return nothing;
    const id = `delete-${agent.id}`;
    const label = `Delete cone ${coneLabel(this.model as SliccModel, agent)}`;
    return html`<span class="drop-cell"
        ><swc-action-button
          id=${id}
          class="drop"
          size="l"
          quiet
          tabindex="-1"
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
    return html`<span class="ribbon" aria-hidden="true">${scoops.map(
      (scoop) => html`<span class="segment" data-status=${scoop.status}></span>`
    )}</span>`;
  }

  #row(agent: Agent, active: string, list: readonly Agent[]): TemplateResult {
    const selected = agent.id === active;
    const error = this.errors[agent.id];
    const model = this.model as SliccModel;
    const title = agentTitle(model, agent);
    const scoops = agent.kind === 'cone' ? list.filter((other) => other.parentId === agent.id) : [];
    const unread = selected ? 0 : agent.unread;
    const state =
      agent.kind === 'cone' ? (this.#expanded === agent.id ? ', expanded' : ', collapsed') : '';
    const subs = scoops.length
      ? `, ${scoops.length} scoop${scoops.length === 1 ? '' : 's'}: ${scoops.map((scoop) => statusLabel[scoop.status].toLowerCase()).join(', ')}`
      : '';
    const label = `${coneLabel(model, agent)}: ${statusLabel[agent.status]}, ${percent(agent.contextFill)} context${state}${subs}${
      unread ? `, ${unread} unread` : ''
    }${error ? `. ${error}` : ''}`;
    return html`<li
      role="option"
      class=${agent.kind}
      data-id=${agent.id}
      aria-selected=${selected ? 'true' : 'false'}
      aria-label=${label}
      tabindex=${selected ? '0' : '-1'}
      aria-keyshortcuts=${this.#droppable(agent) || this.#deletable(agent) ? 'Delete' : nothing}
      title=${label}
      @click=${() => this.#pick(agent)}
    >
      <div class="head">
        ${
          unread
            ? html`<span class="marker unread" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>`
            : html`<span class="marker status" data-status=${agent.status} aria-hidden="true"></span>`
        }
        <span class="name">${agent.name}</span>
      </div>
      ${
        fillShown(agent.contextFill)
          ? html`<span class="fill" data-variant=${meterVariant(agent.contextFill)}>${percent(agent.contextFill)}</span>`
          : nothing
      }
      <span class="title">${title || untitled}</span>
      ${this.#ribbon(scoops)}
      ${this.#dropButton(agent)}
      ${this.#deleteButton(agent)}
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

  render(): TemplateResult {
    const list = this.model?.agent.list() ?? [];
    const active = this.model?.agent.active() ?? '';
    const errors = Object.values(this.errors);
    const rows = ordered(list).filter(
      (agent) => agent.kind === 'cone' || agent.parentId === this.#expanded
    );
    return html`<div class="list"><ul role="listbox" aria-label="Cones and scoops" @keydown=${this.#keydown}>
        ${rows.map((agent) => this.#row(agent, active, list))}
      </ul></div>${this.#actions()}
      <div class="sr" role="status">${errors.at(-1) ?? ''}</div>`;
  }
}
