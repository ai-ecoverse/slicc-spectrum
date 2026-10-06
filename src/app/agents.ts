import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, SliccModel } from '../model/types.ts';
import { dot, ModelElement, percent, shared } from './base.ts';

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
      background: var(--spectrum-background-layer-1-color);
      color: var(--spectrum-neutral-content-color-default);
      font-size: var(--spectrum-font-size-75);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 4px 0;
    }
    li {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 8px;
      height: 28px;
      padding: 0 10px;
      cursor: pointer;
      outline: none;
    }
    li.scoop {
      padding-left: 26px;
    }
    li:hover {
      background: var(--spectrum-gray-100);
    }
    li[aria-selected='true'] {
      background: color-mix(in srgb, var(--spectrum-accent-visual-color) 14%, transparent);
    }
    li:focus-visible {
      box-shadow: inset 0 0 0 2px var(--spectrum-focus-indicator-color);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cone .name {
      font-weight: 600;
    }
    .fill {
      font-variant-numeric: tabular-nums;
      color: var(--spectrum-neutral-subdued-content-color-default);
      min-width: 3ch;
      text-align: right;
    }
    .unread {
      min-width: 16px;
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
    this.renderRoot.querySelector<HTMLElement>('li[tabindex="0"]')?.focus();
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
    const label = `${agent.name}: ${agent.status}, ${percent(agent.contextFill)} context${
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
      ${dot(agent.status)}
      <span class="name">${agent.name}</span>
      <span class="unread">${
        agent.unread ? html`<span class="count">${agent.unread}</span>` : nothing
      }</span>
      <span class="fill">${percent(agent.contextFill)}</span>
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
