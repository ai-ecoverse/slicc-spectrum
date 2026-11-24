import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { ToolCall, ToolExit, ToolProgram } from '../model/types.ts';

export function exitLabel(exit: ToolExit): string {
  return exit.signal ? `Killed (${exit.signal})` : `Exit ${exit.code}`;
}

export function programLabel(program: ToolProgram): string {
  return program.signal ? `was killed (${program.signal})` : `exited ${program.code}`;
}

function badge(exit: ToolExit): TemplateResult {
  return html`<swc-badge size="s" subtle variant=${exit.code || exit.signal ? 'negative' : 'positive'} data-exit=${exit.code} data-signal=${exit.signal ?? nothing}>${exitLabel(exit)}</swc-badge>`;
}

function program(item: ToolProgram, index: number): TemplateResult {
  return html`${index ? ', ' : ''}<span data-program=${item.name}><code>${item.name}</code> ${programLabel(item)}</span>`;
}

export function toolResult(call: ToolCall): TemplateResult | typeof nothing {
  const programs = call.programs ?? [];
  if (!call.exit && !programs.length && !call.meta) return nothing;
  return html`<div class="result">${call.exit ? badge(call.exit) : nothing}${
    programs.length
      ? html`<span class="programs"><swc-icon-alert-triangle size="xs" aria-hidden="true"></swc-icon-alert-triangle><span>${programs.map(program)}</span></span>`
      : nothing
  }${call.meta ? html`<span class="tool-meta">${call.meta}</span>` : nothing}</div>`;
}

export const toolResultCss = css`
  .result {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-75) var(--swc-spacing-100);
    font-size: var(--swc-font-size-75);
    line-height: var(--swc-line-height-100);
  }
  .result .programs {
    display: inline-flex;
    align-items: center;
    gap: var(--swc-spacing-75);
    color: var(--swc-neutral-content-color-default);
  }
  .result .programs swc-icon-alert-triangle {
    flex: none;
    color: var(--swc-notice-visual-color);
  }
  .result .programs code {
    padding: 0;
    background: none;
    font-size: inherit;
  }
  .result .tool-meta {
    color: var(--swc-neutral-subdued-content-color-default);
  }
`;
