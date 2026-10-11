import { css, html, nothing, type TemplateResult } from 'lit';
import type { SliccModel, TrayBudget, TrayConnection, TrayStatus } from '../model/types.ts';
import { ModelElement, meterVariant, shared } from './base.ts';

export const connectionVariant: Record<TrayConnection, string> = {
  live: 'positive',
  connecting: 'info',
  reconnecting: 'info',
  stalled: 'notice',
  offline: 'neutral',
  error: 'negative',
};

export const connectionLabel: Record<TrayConnection, string> = {
  live: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  stalled: 'Stalled',
  offline: 'Offline',
  error: 'Error',
};

export function budgetVariant(percent: number): string {
  const variant = meterVariant(percent);
  return variant === 'informative' ? 'neutral' : variant;
}

export function spendLine(status: TrayStatus): string {
  const parts = [
    status.spent ? `Spent $${status.spent.toFixed(2)}` : '',
    status.rate ? `$${status.rate.toFixed(2)}/h` : '',
  ];
  const line = parts.filter(Boolean).join(' · ');
  return line ? `${line}. ` : '';
}

export function budgetLine(status: TrayStatus, budget: TrayBudget): string {
  return `${spendLine(status)}${budget.percent}% of the ${budget.window} budget, ${budget.resets}.`;
}

export function shownBudget(status: TrayStatus): TrayBudget | null {
  const budget = status.budget;
  return budget && (budget.percent > 0 || status.spent || status.rate) ? budget : null;
}

export class SliccTray extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    panels: { attribute: false },
  };
  declare panels: readonly string[];

  constructor() {
    super();
    this.panels = ['network', 'monitor'];
  }

  static styles = [
    shared,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      .chip > span {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      span.chip,
      span.usage {
        display: inline-flex;
        align-items: center;
        padding-inline: var(--swc-spacing-100);
      }
      swc-status-light {
        align-self: center;
      }
      .chip .followers {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-50);
      }
      :host([compact]) .chip .detail,
      :host([compact]) .usage {
        display: none;
      }
      .muted {
        color: var(--swc-neutral-subdued-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.tray.on('status', () => this.requestUpdate())];
  }

  #open(id: string, section?: string): void {
    this.dispatchEvent(
      new CustomEvent('show-surface', {
        detail: section ? { id, section } : { id },
        bubbles: true,
        composed: true,
      })
    );
  }

  #item(
    id: string,
    surface: string,
    label: string,
    content: TemplateResult,
    open: () => void
  ): TemplateResult {
    return this.panels.includes(surface)
      ? html`<swc-action-button id=${id} class=${id} size="s" quiet data-surface=${surface} accessible-label=${label} @click=${open}>${content}</swc-action-button>`
      : html`<span id=${id} class=${id} tabindex="0" role="img" aria-label=${label}>${content}</span>`;
  }

  render(): TemplateResult {
    const model = this.model;
    if (!model) return html``;
    const status = model.tray.status();
    const connection = connectionLabel[status.connection];
    const followers = `${status.followers.length} ${status.followers.length === 1 ? 'follower' : 'followers'}`;
    const light = status.connection === 'live' ? status.name : `${status.name}, ${connection}`;
    const budget = shownBudget(status);
    return html`${this.#item(
      'chip',
      'network',
      `Tray ${status.name}: ${connection}, ${followers}`,
      html`<span>
          <swc-status-light size="s" variant=${connectionVariant[status.connection]}>
            <span class="detail">${light}</span>
          </swc-status-light>
          <span class="detail muted followers"><swc-icon-user-group size="s"></swc-icon-user-group>${status.followers.length}</span>
        </span>`,
      () => this.#open('network', 'sync')
    )}
      <swc-tooltip for="chip" placement="bottom">${`${connection}, ${followers}`}</swc-tooltip>
      ${budget ? this.#usage(status, budget) : nothing}`;
  }

  #usage(status: TrayStatus, budget: TrayBudget): TemplateResult {
    const label = `Budget ${budget.percent}%`;
    return html`${this.#item(
      'usage',
      'monitor',
      `${label}. ${budgetLine(status, budget)}`,
      html`<swc-status-light size="s" variant=${budgetVariant(budget.percent)}>${label}</swc-status-light>`,
      () => this.#open('monitor')
    )}
      <swc-tooltip for="usage" placement="bottom">${budgetLine(status, budget)}</swc-tooltip>`;
  }
}
