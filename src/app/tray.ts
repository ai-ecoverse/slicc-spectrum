import { css, html, nothing, type TemplateResult } from 'lit';
import type { SliccModel, TrayBudget, TrayConnection, TrayStatus } from '../model/types.ts';
import { ModelElement, meterVariant, shared } from './base.ts';
import { refusedNow } from './follow.ts';

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

const providerName: Record<string, string> = { adobe: 'Adobe', xai: 'SuperGrok' };

export function providerOf(provider: string): string {
  return Object.hasOwn(providerName, provider) ? providerName[provider] : provider;
}

export function budgetTitle(provider: string, window: string): string {
  return `${providerOf(provider)} ${window}`;
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
        white-space: nowrap;
      }
      .chip .followers {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-50);
      }
      :host([compact]) .chip .detail,
      :host([compact]) .usage,
      :host([narrow]) .chip .spare,
      :host([narrow]) .usage .window {
        display: none;
      }
      .muted {
        color: var(--swc-neutral-subdued-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [
      model.tray.on('status', () => this.requestUpdate()),
      ...(model.follow ? [model.follow.on('follow', () => this.requestUpdate())] : []),
    ];
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
    const refused = refusedNow(model.follow?.state());
    const connection = `${connectionLabel[status.connection]}${refused ? ', can’t follow' : ''}`;
    const followers = `${status.followers.length} ${status.followers.length === 1 ? 'follower' : 'followers'}`;
    const live = status.connection === 'live';
    const light = live
      ? status.name
      : html`<span class="spare">${status.name}, </span>${connection}`;
    const budget = shownBudget(status);
    return html`${this.#item(
      'chip',
      'network',
      `Tray ${status.name}: ${connection}, ${followers}`,
      html`<span>
          <swc-status-light size="s" variant=${refused ? 'neutral' : connectionVariant[status.connection]}>
            <span class="detail">${light}</span>
          </swc-status-light>
          <span class=${live ? 'detail muted followers' : 'detail muted followers spare'}><swc-icon-user-group size="s"></swc-icon-user-group>${status.followers.length}</span>
        </span>`,
      () => this.#open('network', 'sync')
    )}
      <swc-tooltip for="chip" placement="bottom">${`${connection}, ${followers}`}</swc-tooltip>
      ${budget ? this.#usage(status, budget) : nothing}`;
  }

  #usage(status: TrayStatus, budget: TrayBudget): TemplateResult {
    const provider = budget.provider;
    const title = provider ? budgetTitle(provider, budget.window) : '';
    const label = `${title || 'Budget'} ${budget.percent}%`;
    const line = budgetLine(status, budget);
    const shown = provider
      ? html`<span>${providerOf(provider)}<span class="window"> ${budget.window}</span> ${budget.percent}%</span>`
      : label;
    return html`${this.#item(
      'usage',
      'monitor',
      `${label}. ${line}`,
      html`<swc-status-light size="s" variant=${budgetVariant(budget.percent)}>${shown}</swc-status-light>`,
      () => this.#open('monitor')
    )}
      <swc-tooltip for="usage" placement="bottom">${title ? `${title}. ${line}` : line}</swc-tooltip>`;
  }
}
