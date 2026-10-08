import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-close.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, SliccModel } from '../model/types.ts';
import { ModelElement, percent, shared, statusLabel, statusLight } from './base.ts';
import { confirm } from './confirm.ts';

export function ordered(agents: readonly Agent[]): Agent[] {
  const cones = agents.filter((agent) => agent.kind === 'cone');
  return cones.flatMap((cone) => [cone, ...agents.filter((agent) => agent.parentId === cone.id)]);
}

export class SliccAgents extends ModelElement {
  static properties = { ...ModelElement.properties, errors: { state: true } };
  declare errors: Record<string, string>;

  constructor() {
    super();
    this.errors = {};
  }

  static styles = [
    shared,
    css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
      background: var(--swc-background-layer-1-color);
      color: var(--swc-neutral-content-color-default);
      font-size: var(--swc-font-size-100);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: var(--swc-spacing-75) 0;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      grid-template-areas: 'name unread fill drop' 'status unread fill drop' 'error error error error';
      align-items: center;
      column-gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-75) var(--swc-spacing-200);
      cursor: pointer;
    }
    li.scoop {
      padding-inline-start: calc(var(--swc-spacing-200) + var(--swc-spacing-300));
    }
    li:hover {
      background: var(--swc-gray-100);
    }
    li[aria-selected='true'] {
      background: var(--swc-gray-200);
      box-shadow: inset var(--swc-spacing-50) 0 0 var(--swc-accent-visual-color);
    }
    li:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .name {
      grid-area: name;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cone .name {
      font-weight: var(--swc-bold-font-weight);
    }
    .unread {
      --swc-badge-height: var(--swc-spacing-300);
      --swc-badge-padding-block: var(--swc-spacing-50);
      --swc-badge-padding-inline: var(--swc-spacing-75);
      --swc-badge-corner-radius: var(--swc-spacing-100);
      --swc-badge-line-height: 1;
      grid-area: unread;
      align-self: center;
    }
    .fill {
      grid-area: fill;
      font-size: var(--swc-font-size-75);
      font-variant-numeric: tabular-nums;
      color: var(--swc-neutral-subdued-content-color-default);
      min-width: 4ch;
      text-align: end;
    }
    swc-status-light {
      grid-area: status;
      justify-self: start;
    }
    .drop {
      grid-area: drop;
      visibility: hidden;
    }
    li:hover .drop,
    li:focus-within .drop {
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
      .drop {
        visibility: visible;
      }
    }
  `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [
      model.agent.on('agents', () => this.requestUpdate()),
      model.agent.on('active', () => this.requestUpdate()),
    ];
  }

  #select(id: string): void {
    this.model?.agent.select(id);
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
      const id = items[index]?.dataset.id;
      if (id) this.#select(id);
    } else if (event.key === 'Delete') {
      const agent = this.model?.agent.list().find((item) => item.id === items[index]?.dataset.id);
      if (agent && this.#droppable(agent)) {
        event.preventDefault();
        void this.#drop(agent, items[index]);
      }
    }
  }

  #droppable(agent: Agent): boolean {
    return agent.kind === 'scoop' && Boolean(this.model?.agent.drop);
  }

  async #drop(agent: Agent, trigger: HTMLElement): Promise<void> {
    const port = this.model?.agent;
    if (!port?.drop) return;
    const ok = await confirm({
      title: `Drop scoop ${agent.name}?`,
      body: 'It stops working. Its files stay.',
      action: 'Drop',
      variant: 'destructive',
      trigger,
    });
    if (!ok) return;
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
    return html`<swc-action-button
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
      ><swc-tooltip for=${id} placement="start">${label}</swc-tooltip>`;
  }

  #row(agent: Agent, active: string): TemplateResult {
    const selected = agent.id === active;
    const error = this.errors[agent.id];
    const label = `${agent.name}: ${statusLabel[agent.status]}, ${percent(agent.contextFill)} context${
      agent.unread ? `, ${agent.unread} unread` : ''
    }${error ? `. ${error}` : ''}`;
    return html`<li
      role="option"
      class=${agent.kind}
      data-id=${agent.id}
      aria-selected=${selected ? 'true' : 'false'}
      aria-label=${label}
      tabindex=${selected ? '0' : '-1'}
      aria-keyshortcuts=${this.#droppable(agent) ? 'Delete' : nothing}
      title=${label}
      @click=${() => this.#select(agent.id)}
    >
      <span class="name">${agent.name}</span>
      ${
        agent.unread
          ? html`<swc-badge class="unread" size="s" variant="accent">${agent.unread}</swc-badge>`
          : nothing
      }
      <span class="fill">${percent(agent.contextFill)}</span>
      ${statusLight(agent.status)}
      ${this.#dropButton(agent)}
      ${error ? html`<span class="error">${error}</span>` : nothing}
    </li>`;
  }

  render(): TemplateResult {
    const agents = ordered(this.model?.agent.list() ?? []);
    const active = this.model?.agent.active() ?? '';
    const errors = Object.values(this.errors);
    return html`<ul role="listbox" aria-label="Cones and scoops" @keydown=${this.#keydown}>
        ${agents.map((agent) => this.#row(agent, active))}
      </ul>
      <div class="sr" role="status">${errors.at(-1) ?? ''}</div>`;
  }
}
