import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/meter/swc-meter.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import { css, html, nothing, svg, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  MonitorAlert,
  MonitorRow,
  MonitorSection,
  MonitorStatus,
  MonitorVital,
  SliccModel,
} from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { panelCss } from './files.ts';
import { copyText } from './reach.ts';
import { budgetTitle } from './tray.ts';
import { ViewScroll, ViewState } from './view-state.ts';

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
  processes: 'terminal',
};

export const rowLights: Record<MonitorStatus, 'info' | 'neutral' | 'notice' | 'negative'> = {
  active: 'info',
  idle: 'neutral',
  warn: 'notice',
  error: 'negative',
};

const rowSpoken: Record<MonitorStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  warn: 'Needs attention',
  error: 'Error',
};

export function indent(depth: number | undefined): number {
  return Math.min(Math.max(Math.floor(depth ?? 0), 0), 6);
}

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
  static properties = {
    ...ModelElement.properties,
    copied: { state: true },
  };
  declare copied: { id: string; text: string; done: boolean } | null;
  #sections = new ViewState<Record<string, boolean>>(this, 'monitor', () => ({}));
  #scroll = new ViewScroll(this, 'monitor:scroll', {
    scroller: () => this.renderRoot.querySelector<HTMLElement>('.body'),
    rows: '.section[data-id], .row[data-id]',
  });

  constructor() {
    super();
    this.copied = null;
  }

  get expanded(): Record<string, boolean> {
    return this.#sections.value;
  }

  set expanded(value: Record<string, boolean>) {
    this.#sections.value = value;
  }

  static styles = [
    shared,
    panelCss,
    css`
      .bar {
        padding-block: var(--swc-spacing-50);
      }
      .heading {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: var(--swc-spacing-100);
        white-space: normal;
      }
      .bar swc-action-button {
        flex: none;
      }
      .body {
        container: monitor / inline-size;
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
      @container monitor (min-width: 248px) {
        .vital:last-child:nth-child(2n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 376px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(3n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 504px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(4n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 632px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(5n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 760px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(6n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 888px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(7n + 1) {
          grid-column: 1 / -1;
        }
      }
      @container monitor (min-width: 1016px) {
        .vital:last-child:nth-child(n) {
          grid-column: auto;
        }
        .vital:last-child:nth-child(8n + 1) {
          grid-column: 1 / -1;
        }
      }
      .vital {
        display: grid;
        grid-template-rows: auto auto 1fr;
        align-content: start;
        gap: var(--swc-spacing-50);
        min-width: 0;
        border-radius: var(--swc-corner-radius-medium-default);
        padding: var(--swc-spacing-200);
        background: var(--swc-background-layer-1-color);
      }
      .label {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .reading {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        column-gap: var(--swc-spacing-75);
        min-width: 0;
        height: 1lh;
        overflow: hidden;
        white-space: nowrap;
        font-size: var(--swc-font-size-300);
      }
      .value {
        flex: none;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: var(--swc-bold-font-weight);
        font-variant-numeric: tabular-nums;
      }
      .unit,
      .delta {
        flex: none;
        font-size: var(--swc-font-size-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .spark {
        align-self: end;
        height: var(--swc-component-height-100);
      }
      svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      polyline {
        fill: none;
        stroke: var(--swc-accent-visual-color);
        stroke-width: 1.5;
      }
      swc-meter {
        width: 100%;
      }
      swc-meter > span {
        display: block;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
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
      .alert > div {
        min-width: 0;
      }
      .alert .command {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        margin-block-start: var(--swc-spacing-75);
        padding-inline-start: var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
      }
      .alert code {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        white-space: nowrap;
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        color: var(--swc-code-color);
      }
      .alert .lead {
        display: block;
        margin-block-start: var(--swc-spacing-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .alert .uncopied {
        display: block;
        color: var(--swc-negative-content-color-default);
      }
      .sections {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        column-gap: var(--swc-spacing-100);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .section,
      .line {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: subgrid;
      }
      .line {
        align-items: center;
        min-height: var(--swc-component-height-100);
        padding: var(--swc-spacing-50) 0;
      }
      .caption {
        grid-column: 1;
        min-width: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-50) var(--swc-spacing-75);
      }
      .toggle {
        all: unset;
        box-sizing: border-box;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
        cursor: pointer;
        border-radius: var(--swc-corner-radius-small-default);
      }
      .toggle:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      .chevron {
        flex: none;
        width: var(--swc-component-height-50);
        display: inline-flex;
        justify-content: center;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .toggle[aria-expanded='true'] swc-icon-chevron-right {
        transform: rotate(90deg);
      }
      :host(:dir(rtl)) .toggle[aria-expanded='false'] swc-icon-chevron-right {
        transform: scaleX(-1);
      }
      .line .name {
        min-width: 0;
      }
      .line .num {
        grid-column: 2;
        justify-self: end;
        font-weight: var(--swc-bold-font-weight);
        font-variant-numeric: tabular-nums;
      }
      .line swc-action-button {
        grid-column: 3;
      }
      .rows {
        grid-column: 1 / -1;
        display: grid;
        gap: var(--swc-spacing-50);
        margin: 0 0 var(--swc-spacing-100);
        padding: 0;
        padding-inline-start: calc(var(--swc-component-height-50) + var(--swc-spacing-75));
        list-style: none;
      }
      .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: var(--swc-spacing-100);
        padding-inline-start: calc(var(--depth, 0) * var(--swc-spacing-300));
      }
      .row swc-status-light {
        min-width: 0;
        overflow-wrap: break-word;
      }
      .row .badges {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: start;
        display: flex;
        flex-wrap: wrap;
        justify-content: end;
        gap: var(--swc-spacing-50);
      }
      .row swc-status-light {
        grid-column: 1;
        grid-row: 1;
      }
      .row .meta {
        grid-column: 1;
        grid-row: 2;
        padding-inline-start: var(--swc-spacing-300);
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
        overflow-wrap: break-word;
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
    const label = vital.provider
      ? budgetTitle(vital.provider, vital.window ?? 'budget')
      : vital.label;
    if (vital.ratio !== undefined) {
      return html`<div class="vital" data-id=${vital.id} title=${vital.hint ?? vital.unit ?? nothing}>
        <swc-meter
          size="s"
          variant=${meterVariant(vital.ratio)}
          value=${Math.round(vital.ratio * 100)}
          value-label=${vital.value}
          ><span slot="label">${label}</span><span slot="description">${vital.unit ?? '\u00a0'}</span></swc-meter
        >
      </div>`;
    }
    const line = vital.series ? sparkline(vital.series) : '';
    return html`<div class="vital" data-id=${vital.id}>
      <div class="label">${label}</div>
      <div class="reading" title=${vital.hint ?? [vital.value, vital.unit, vital.delta].filter(Boolean).join(' ')}><span class="value">${vital.value}</span>${
        vital.unit ? html`<span class="unit">${vital.unit}</span>` : nothing
      }${vital.delta ? html`<span class="delta">${vital.delta}</span>` : nothing}</div>
      <div class="spark">${line ? html`<svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">${svg`<polyline points=${line}></polyline>`}</svg>` : nothing}</div>
    </div>`;
  }

  #alert(alert: MonitorAlert): TemplateResult {
    const error = alert.severity === 'error';
    return html`<li class="alert" data-severity=${alert.severity}>
      ${error ? html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond>` : html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>`}
      <div><span class="sr">${error ? 'Error: ' : 'Warning: '}</span><strong>${alert.title}</strong><span class="detail">${alert.detail}</span>${
        alert.command
          ? this.#command(alert.id, alert.command, alert.commandLabel ?? 'Run')
          : nothing
      }</div>
    </li>`;
  }

  #command(id: string, text: string, label: string): TemplateResult {
    const copied = this.copied?.id === id && this.copied.text === text ? this.copied : null;
    return html`<span class="lead">${label}:</span><div class="command" data-command><code>${text}</code><swc-action-button size="s" quiet data-action="copy-command" accessible-label=${copied?.done ? 'Copied' : 'Copy command'} @click=${() => this.#copy(id, text)}><swc-icon-copy slot="icon"></swc-icon-copy>${copied?.done ? 'Copied' : 'Copy'}</swc-action-button></div>${
      copied && !copied.done
        ? html`<span class="uncopied" role="alert" data-error="copy">Couldn’t copy. Select the command and copy it.</span>`
        : nothing
    }`;
  }

  async #copy(id: string, text: string): Promise<void> {
    this.copied = { id, text, done: await copyText(text) };
  }

  #open(id: string): void {
    this.dispatchEvent(
      new CustomEvent('show-surface', { detail: { id }, bubbles: true, composed: true })
    );
  }

  #row(row: MonitorRow): TemplateResult {
    const depth = indent(row.depth);
    return html`<li class="row" data-id=${row.id ?? nothing} data-status=${row.status} data-depth=${depth || nothing} style=${depth ? `--depth: ${depth}` : nothing}>
      <swc-status-light size="s" variant=${rowLights[row.status]}><span class="sr">${rowSpoken[row.status]}: </span>${row.name.split(/(?<=\/)/).map((part, i) => (i ? html`<wbr>${part}` : part))}</swc-status-light>
      <span class="badges">${(row.badges ?? []).map((badge) => html`<swc-badge size="s" variant="neutral" subtle>${badge}</swc-badge>`)}</span>
      ${row.meta ? html`<span class="meta">${row.meta}</span>` : nothing}
    </li>`;
  }

  #section(section: MonitorSection): TemplateResult {
    const flag = attention(section);
    const surface = surfaces[section.id];
    const rows = section.rows.length > 0;
    const open = rows && (this.expanded[section.id] ?? flag !== null);
    const list = `rows-${section.id}`;
    const badge = flag
      ? html`<swc-badge size="s" variant=${flag.variant} subtle>${flag.text}</swc-badge>`
      : nothing;
    return html`<li class="section" data-id=${section.id} data-open=${open ? '' : nothing}>
      <div class="line">
        <span class="caption">${
          rows
            ? html`<button class="toggle" aria-expanded=${open ? 'true' : 'false'} aria-controls=${open ? list : nothing} @click=${() => {
                this.expanded = { ...this.expanded, [section.id]: !open };
              }}><span class="chevron"><swc-icon-chevron-right size="s" aria-hidden="true"></swc-icon-chevron-right></span><span class="name">${section.label}</span></button>`
            : html`<span class="chevron"></span><span class="name">${section.label}</span>`
        }${badge}</span>
        <span class="num">${section.rows.length}</span>
        ${
          surface
            ? html`<swc-action-button size="s" quiet accessible-label=${`Open ${section.label}`} @click=${() => this.#open(surface)}
                >Open</swc-action-button
              >`
            : nothing
        }
      </div>
      ${
        open
          ? html`<ul class="rows" id=${list} aria-label=${section.label}>${repeat(
              section.rows,
              (row, i) => row.id ?? i,
              (row) => this.#row(row)
            )}</ul>`
          : nothing
      }
    </li>`;
  }

  render(): TemplateResult {
    const snapshot = this.model?.monitor.snapshot();
    return html`<div class="bar">
        <span class="heading"><strong>Live monitor</strong><span>${snapshot ? `Updated ${new Date(snapshot.updatedAt).toISOString().slice(11, 19)} UTC` : 'No data'}</span></span>
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
