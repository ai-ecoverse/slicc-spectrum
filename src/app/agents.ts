import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, SliccModel } from '../model/types.ts';
import { ModelElement, percent, shared, statusLabel, statusLight } from './base.ts';

export function ordered(agents: readonly Agent[]): Agent[] {
  const cones = agents.filter((agent) => agent.kind === 'cone');
  return cones.flatMap((cone) => [cone, ...agents.filter((agent) => agent.parentId === cone.id)]);
}

export class SliccAgents extends ModelElement {
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
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas: 'name unread fill' 'status unread fill';
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
    }
  }

  #row(agent: Agent, active: string): TemplateResult {
    const selected = agent.id === active;
    const label = `${agent.name}: ${statusLabel[agent.status]}, ${percent(agent.contextFill)} context${
      agent.unread ? `, ${agent.unread} unread` : ''
    }`;
    return html`<li
      role="option"
      class=${agent.kind}
      data-id=${agent.id}
      aria-selected=${selected ? 'true' : 'false'}
      aria-label=${label}
      tabindex=${selected ? '0' : '-1'}
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
    </li>`;
  }

  render(): TemplateResult {
    const agents = ordered(this.model?.agent.list() ?? []);
    const active = this.model?.agent.active() ?? '';
    return html`<ul role="listbox" aria-label="Cones and scoops" @keydown=${this.#keydown}>
      ${agents.map((agent) => this.#row(agent, active))}
    </ul>`;
  }
}
