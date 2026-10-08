import { css, html, nothing, svg, type TemplateResult } from 'lit';
import type { MonitorSection, MonitorStatus, MonitorVital, SliccModel } from '../model/types.ts';
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

export class SliccMonitor extends ModelElement {
  static styles = [
    shared,
    panelCss,
    css`
      .body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 8px;
      }
      .vitals {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 6px;
      }
      .vital {
        border: 1px solid var(--spectrum-gray-200);
        border-radius: var(--spectrum-corner-radius-75);
        padding: 6px 8px;
        background: var(--spectrum-background-layer-1-color);
      }
      .label {
        color: var(--spectrum-neutral-subdued-content-color-default);
        font-size: var(--spectrum-font-size-50);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .value {
        font-size: var(--spectrum-font-size-300);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .unit,
      .delta {
        color: var(--spectrum-neutral-subdued-content-color-default);
        margin-left: 4px;
      }
      svg {
        display: block;
        width: 100%;
        height: 28px;
      }
      polyline {
        fill: none;
        stroke: var(--spectrum-accent-visual-color);
        stroke-width: 1.5;
      }
      .ratio {
        height: 4px;
        border-radius: 2px;
        background: var(--spectrum-gray-200);
        margin-top: 8px;
        overflow: hidden;
      }
      .ratio > span {
        display: block;
        height: 100%;
        background: var(--spectrum-accent-visual-color);
      }
      .alerts {
        display: grid;
        gap: 4px;
        margin: 8px 0;
      }
      .alert {
        border-left: 3px solid var(--spectrum-notice-visual-color);
        padding: 4px 8px;
        background: var(--spectrum-background-layer-1-color);
      }
      .alert[data-severity='error'] {
        border-color: var(--spectrum-negative-visual-color);
      }
      .alert span {
        color: var(--spectrum-neutral-subdued-content-color-default);
        margin-left: 6px;
      }
      details {
        border-top: 1px solid var(--spectrum-gray-200);
      }
      summary {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 6px 2px;
        cursor: pointer;
        list-style: none;
      }
      summary::-webkit-details-marker {
        display: none;
      }
      summary:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
      }
      summary .count {
        background: var(--spectrum-gray-300);
        color: var(--spectrum-neutral-content-color-default);
      }
      .row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 2px 4px 2px 16px;
      }
      .row .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row .meta {
        color: var(--spectrum-neutral-subdued-content-color-default);
        white-space: nowrap;
      }
      .badge {
        margin-left: 6px;
        font-size: var(--spectrum-font-size-50);
        border-radius: 3px;
        padding: 0 4px;
        background: var(--spectrum-gray-200);
      }
      .dot[data-variant='positive'] {
        background: var(--spectrum-positive-visual-color);
      }
      .empty {
        color: var(--spectrum-neutral-subdued-content-color-default);
        padding: 2px 16px;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [model.monitor.on('snapshot', () => this.requestUpdate())];
  }

  #vital(vital: MonitorVital): TemplateResult {
    const line = vital.series ? sparkline(vital.series) : '';
    return html`<div class="vital" data-id=${vital.id}>
      <div class="label">${vital.label}</div>
      <div><span class="value">${vital.value}</span>${vital.unit ? html`<span class="unit">${vital.unit}</span>` : nothing}${
        vital.delta ? html`<span class="delta">${vital.delta}</span>` : nothing
      }</div>
      ${line ? html`<svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">${svg`<polyline points=${line}></polyline>`}</svg>` : nothing}
      ${vital.ratio !== undefined ? html`<div class="ratio" role="meter" aria-valuenow=${Math.round(vital.ratio * 100)} aria-valuemin="0" aria-valuemax="100" aria-label=${vital.label}><span style=${`width: ${Math.round(vital.ratio * 100)}%`}></span></div>` : nothing}
    </div>`;
  }

  #section(section: MonitorSection): TemplateResult {
    const variant = { error: 'negative', warn: 'notice', active: 'positive', idle: 'neutral' }[
      health(section)
    ];
    return html`<details data-id=${section.id} ?open=${section.rows.length > 0 && section.rows.length <= 8}>
      <summary><span class="dot" data-variant=${variant}></span><strong>${section.label}</strong><span class="count">${section.rows.length}</span></summary>
      ${
        section.rows.length
          ? section.rows.map(
              (row) => html`<div class="row">
                <span class="dot" data-variant=${{ error: 'negative', warn: 'notice', active: 'positive', idle: 'neutral' }[row.status]}></span>
                <span class="name">${row.name}${(row.badges ?? []).map((badge) => html`<span class="badge">${badge}</span>`)}</span>
                <span class="meta">${row.meta}</span>
              </div>`
            )
          : html`<div class="empty">Nothing here.</div>`
      }
    </details>`;
  }

  render(): TemplateResult {
    const snapshot = this.model?.monitor.snapshot();
    return html`<div class="bar">
        <strong>Live monitor</strong><span>${snapshot ? `Updated ${new Date(snapshot.updatedAt).toISOString().slice(11, 19)} UTC` : 'No data'}</span>
        <span class="spacer"></span>
        <sp-action-button size="s" quiet @click=${() => this.model?.monitor.resync()}><swc-icon-refresh slot="icon"></swc-icon-refresh>Re-sync</sp-action-button>
      </div>
      <div class="body">
        ${
          snapshot
            ? html`<div class="vitals">${snapshot.vitals.map((vital) => this.#vital(vital))}</div>
              ${
                snapshot.alerts.length
                  ? html`<div class="alerts" role="list">${snapshot.alerts.map(
                      (alert) =>
                        html`<div class="alert" role="listitem" data-severity=${alert.severity}><strong>${alert.title}</strong><span>${alert.detail}</span></div>`
                    )}</div>`
                  : nothing
              }
              ${snapshot.sections.map((section) => this.#section(section))}`
            : nothing
        }
      </div>`;
  }
}
