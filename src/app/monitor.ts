import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/meter/swc-meter.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import { css, html, nothing, svg, type TemplateResult } from 'lit';
import type {
  MonitorAlert,
  MonitorSection,
  MonitorStatus,
  MonitorVital,
  SliccModel,
} from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { panelCss } from './files.ts';

export function sparkline(points: readonly number[], width = 120, height = 28): string {
  if (points.length < 2) return '';
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  return points
    .map(
      (value, i) =>
        `${((i / (points.length - 1)) * width).toFixed(1)},${(height - ((value - min) / span) * (height - 2) - 1).toFixed(1)}`
    )
    .join(' ');
}

const worst: MonitorStatus[] = ['error', 'warn', 'active', 'idle'];

export function health(section: MonitorSection): MonitorStatus {
  return worst.find((status) => section.rows.some((row) => row.status === status)) ?? 'idle';
}

export function meterVariant(ratio: number): 'informative' | 'notice' | 'negative' {
  if (ratio >= 0.9) return 'negative';
  if (ratio >= 0.6) return 'notice';
  return 'informative';
}

export const surfaces: Record<string, string> = {
  agents: 'agents',
  terminals: 'terminal',
  tabs: 'browser',
  changes: 'changes',
};

export function attention(
  section: MonitorSection
): { variant: 'negative' | 'notice'; text: string } | null {
  const errors = section.rows.filter((row) => row.status === 'error').length;
  if (errors)
    return { variant: 'negative', text: `${errors} ${errors === 1 ? 'error' : 'errors'}` };
  const warnings = section.rows.filter((row) => row.status === 'warn').length;
  if (warnings)
    return {
      variant: 'notice',
      text: `${warnings} ${warnings === 1 ? 'needs' : 'need'} attention`,
    };
  return null;
}

export class SliccMonitor extends ModelElement {
  static styles = [
    shared,
    panelCss,
    css`
      .body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--swc-spacing-100);
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-content: start;
        gap: var(--swc-spacing-200);
      }
      .vitals {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--swc-card-default-width-extra-small)), 1fr));
        gap: var(--swc-spacing-100);
      }
      .vital {
        display: grid;
        align-content: start;
        gap: var(--swc-spacing-50);
        border-radius: var(--swc-corner-radius-medium-default);
        padding: var(--swc-spacing-200);
        background: var(--swc-background-layer-1-color);
      }
      .label {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .value {
        font-size: var(--swc-font-size-300);
        font-weight: var(--swc-bold-font-weight);
        font-variant-numeric: tabular-nums;
      }
      .unit,
      .delta {
        color: var(--swc-neutral-subdued-content-color-default);
        margin-inline-start: var(--swc-spacing-75);
      }
      svg {
        display: block;
        width: 100%;
        height: var(--swc-component-height-100);
      }
      polyline {
        fill: none;
        stroke: var(--swc-accent-visual-color);
        stroke-width: 1.5;
      }
      swc-meter {
        width: 100%;
      }
      .alerts {
        display: grid;
        gap: var(--swc-spacing-75);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .alert {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--swc-spacing-100);
        align-items: start;
        border-radius: var(--swc-corner-radius-medium-default);
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        background: var(--swc-notice-subtle-background-color-default);
      }
      .alert[data-severity='error'] {
        background: var(--swc-negative-subtle-background-color-default);
      }
      .alert swc-icon-alert-triangle {
        color: var(--swc-icon-color-notice);
      }
      .alert swc-icon-alert-diamond {
        color: var(--swc-icon-color-negative);
      }
      .alert .detail {
        display: block;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .sections {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .section {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-height: var(--swc-component-height-100);
        padding: var(--swc-spacing-50) 0;
      }
      .section .name {
        flex: 1;
        min-width: 0;
      }
      .section .num {
        font-weight: var(--swc-bold-font-weight);
        font-variant-numeric: tabular-nums;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.monitor.on('snapshot', () => this.requestUpdate())];
  }

  focus(): void {
    this.focusOn('.bar swc-action-button');
  }

  #vital(vital: MonitorVital): TemplateResult {
    if (vital.ratio !== undefined) {
      return html`<div class="vital" data-id=${vital.id}>
        <swc-meter
          size="s"
          variant=${meterVariant(vital.ratio)}
          value=${Math.round(vital.ratio * 100)}
          value-label=${vital.value}
          ><span slot="label">${vital.label}</span>${
            vital.unit ? html`<span slot="description">${vital.unit}</span>` : nothing
          }</swc-meter
        >
      </div>`;
    }
    const line = vital.series ? sparkline(vital.series) : '';
    return html`<div class="vital" data-id=${vital.id}>
      <div class="label">${vital.label}</div>
      <div><span class="value">${vital.value}</span>${vital.unit ? html`<span class="unit">${vital.unit}</span>` : nothing}${
        vital.delta ? html`<span class="delta">${vital.delta}</span>` : nothing
      }</div>
      ${line ? html`<svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">${svg`<polyline points=${line}></polyline>`}</svg>` : nothing}
    </div>`;
  }

  #alert(alert: MonitorAlert): TemplateResult {
    const error = alert.severity === 'error';
    return html`<li class="alert" data-severity=${alert.severity}>
      ${error ? html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond>` : html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>`}
      <div><span class="sr">${error ? 'Error: ' : 'Warning: '}</span><strong>${alert.title}</strong><span class="detail">${alert.detail}</span></div>
    </li>`;
  }

  #open(id: string): void {
    this.dispatchEvent(
      new CustomEvent('show-surface', { detail: { id }, bubbles: true, composed: true })
    );
  }

  #section(section: MonitorSection): TemplateResult {
    const flag = attention(section);
    const surface = surfaces[section.id];
    return html`<li class="section" data-id=${section.id}>
      <span class="name">${section.label}</span>
      ${flag ? html`<swc-badge size="s" variant=${flag.variant} subtle>${flag.text}</swc-badge>` : nothing}
      <span class="num">${section.rows.length}</span>
      ${
        surface
          ? html`<swc-action-button size="s" quiet accessible-label=${`Open ${section.label}`} @click=${() => this.#open(surface)}
              >Open</swc-action-button
            >`
          : nothing
      }
    </li>`;
  }

  render(): TemplateResult {
    const snapshot = this.model?.monitor.snapshot();
    return html`<div class="bar">
        <strong>Live monitor</strong><span>${snapshot ? `Updated ${new Date(snapshot.updatedAt).toISOString().slice(11, 19)} UTC` : 'No data'}</span>
        <span class="spacer"></span>
        <swc-action-button size="s" quiet @click=${() => this.model?.monitor.resync()}><swc-icon-refresh slot="icon"></swc-icon-refresh>Re-sync</swc-action-button>
      </div>
      <div class="body">
        ${
          snapshot
            ? html`<div class="vitals">${snapshot.vitals.map((vital) => this.#vital(vital))}</div>
              ${
                snapshot.alerts.length
                  ? html`<ul class="alerts" aria-label="Alerts">${snapshot.alerts.map((alert) => this.#alert(alert))}</ul>`
                  : nothing
              }
              <ul class="sections" aria-label="Activity">${snapshot.sections.map((section) => this.#section(section))}</ul>`
            : nothing
        }
      </div>`;
  }
}
