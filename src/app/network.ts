import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-error.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-online.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-slow-connection.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import link from '@adobe/spectrum-wc/link.css';
import { css, html, nothing, type TemplateResult, unsafeCSS } from 'lit';
import type { NetworkFailure, NetworkRoute, NetworkStatus, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';
import { failure } from './files.ts';
import { ago } from './freezer.ts';

export const command = 'npx @ai-ecoverse/slicc-node';

export const networkHealth: Record<
  NetworkStatus['health'],
  readonly ['positive' | 'notice' | 'negative', string]
> = {
  ok: ['positive', 'Full access'],
  limited: ['notice', 'Limited'],
  failing: ['negative', 'Failing'],
};

const routes: Record<NetworkRoute | 'none', string> = {
  proxy: 'Through slicc-node, which reaches every site.',
  extension: 'Through the SLICC Chrome extension, which reaches every site.',
  page: 'Through this page’s own fetch. Sites that block cross-origin requests are out of reach.',
  none: 'No route to the network.',
};

export function networkLabel(status: NetworkStatus): string {
  return `Network: ${networkHealth[status.health][1].toLowerCase()}`;
}

export const networkIcon: Record<NetworkStatus['health'], TemplateResult> = {
  ok: html`<swc-icon-cloud-state-online slot="icon"></swc-icon-cloud-state-online>`,
  limited: html`<swc-icon-cloud-state-slow-connection slot="icon"></swc-icon-cloud-state-slow-connection>`,
  failing: html`<swc-icon-cloud-state-error slot="icon"></swc-icon-cloud-state-error>`,
};

export function host(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function since(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return ago(at, now);
}

export class SliccNetwork extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    checking: { state: true },
    copied: { state: true },
    error: { state: true },
  };
  declare checking: boolean;
  declare copied: boolean;
  declare error: string;

  constructor() {
    super();
    this.checking = false;
    this.copied = false;
    this.error = '';
  }

  static styles = [
    unsafeCSS(link),
    css`
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        container-type: inline-size;
        background: var(--swc-background-layer-2-color);
        color: var(--swc-neutral-content-color-default);
        font-size: var(--swc-font-size-100);
        line-height: var(--swc-line-height-200);
      }
      .page {
        display: grid;
        gap: var(--swc-spacing-400);
        max-width: 800px;
        padding: var(--swc-spacing-400);
        margin: 0 auto;
        box-sizing: border-box;
      }
      .page:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      section {
        display: grid;
        gap: var(--swc-spacing-200);
        align-content: start;
      }
      h2 {
        margin: 0;
        font-size: var(--swc-font-size-200);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-heading-line-height);
        color: var(--swc-heading-color);
      }
      p {
        margin: 0;
      }
      .head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
      }
      swc-status-light {
        align-self: center;
      }
      .detail,
      .muted {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-200);
      }
      .error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-negative-subtle-background-color-default);
        overflow-wrap: anywhere;
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      .error swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .command {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-75) var(--swc-spacing-75) var(--swc-spacing-75) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
      }
      code {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        color: var(--swc-code-color);
      }
      .swc-Link {
        font-size: inherit;
      }
      summary {
        cursor: pointer;
        width: fit-content;
        color: var(--swc-neutral-subdued-content-color-default);
        border-radius: var(--swc-corner-radius-small-default);
      }
      summary:hover {
        color: var(--swc-neutral-subdued-content-color-hover);
      }
      summary:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      details[open] > summary {
        margin-block-end: var(--swc-spacing-200);
      }
      details > div {
        display: grid;
        gap: var(--swc-spacing-200);
      }
      ul {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0 var(--swc-spacing-200);
        padding: var(--swc-spacing-100) 0;
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      li:last-child {
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      .host {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: var(--swc-bold-font-weight);
      }
      li .muted {
        grid-column: 1 / -1;
        font-size: var(--swc-font-size-75);
      }
      time {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
        white-space: nowrap;
      }
      @container (max-width: 480px) {
        .page {
          padding: var(--swc-spacing-300);
          gap: var(--swc-spacing-300);
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    this.error = '';
    return model.network ? [model.network.on('network', () => this.requestUpdate())] : [];
  }

  focus(): void {
    this.focusOn('swc-button, a, summary, swc-action-button', '.page');
  }

  async check(): Promise<void> {
    const port = this.model?.network;
    if (!port?.check || this.checking) return;
    this.checking = true;
    this.error = '';
    try {
      await port.check();
    } catch (error) {
      this.error = failure(error);
    } finally {
      this.checking = false;
    }
  }

  async copy(): Promise<void> {
    await globalThis.navigator?.clipboard?.writeText(command).catch(() => {});
    this.copied = true;
  }

  #state(status: NetworkStatus): TemplateResult {
    const [variant, label] = networkHealth[status.health];
    return html`<section aria-labelledby="state">
      <div class="head">
        <h2 id="state">Connection</h2>
        <swc-status-light variant=${variant} data-health=${status.health}>${label}</swc-status-light>
      </div>
      <p data-route=${status.route ?? 'none'}>${routes[status.route ?? 'none']}</p>
      ${status.detail ? html`<p class="detail">${status.detail}</p>` : nothing}
      ${
        this.model?.network?.check
          ? html`<div class="actions"><swc-button size="m" variant="secondary" data-action="check" ?pending=${this.checking} @click=${() => this.check()}>Check again</swc-button></div>`
          : nothing
      }
      ${
        this.error
          ? html`<div class="error" role="alert"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.error}</span></div>`
          : nothing
      }
    </section>`;
  }

  #ways(status: NetworkStatus): TemplateResult {
    return html`<p>Install the SLICC Chrome extension, or run slicc-node on this computer. Either one reaches every site.</p>
      ${
        status.extensionUrl
          ? html`<p><a class="swc-Link" href=${status.extensionUrl} target="_blank" rel="noopener noreferrer" data-action="install-extension">Install the Chrome extension</a></p>`
          : nothing
      }
      <p>To run slicc-node, enter this in a terminal:</p>
      <div class="command">
        <code>${command}</code>
        <swc-action-button size="s" quiet data-action="copy-command" accessible-label=${this.copied ? 'Copied' : 'Copy command'} @click=${() => this.copy()}>
          <swc-icon-copy slot="icon"></swc-icon-copy>${this.copied ? 'Copied' : 'Copy'}
        </swc-action-button>
      </div>`;
  }

  #whole(status: NetworkStatus): TemplateResult {
    if (status.route === 'proxy' || status.route === 'extension') {
      return html`<details><summary>Other ways to reach the whole web</summary><div>${this.#ways(status)}</div></details>`;
    }
    return html`<section aria-labelledby="whole">
      <h2 id="whole">Get the whole web</h2>
      ${this.#ways(status)}
    </section>`;
  }

  #failure(item: NetworkFailure): TemplateResult {
    const date = new Date(item.at);
    return html`<li data-url=${item.url}>
      <span class="host" title=${item.url}>${host(item.url)}</span>
      <time datetime=${date.toISOString()} title=${date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}>${since(item.at)}</time>
      <span class="muted">${item.error}</span>
    </li>`;
  }

  #failures(status: NetworkStatus): TemplateResult {
    return html`<section aria-labelledby="failures">
      <h2 id="failures">Recent failures</h2>
      ${
        status.failures.length
          ? html`<ul aria-labelledby="failures">${status.failures.map((item) => this.#failure(item))}</ul>`
          : html`<p class="muted">No failures lately.</p>`
      }
    </section>`;
  }

  render(): TemplateResult {
    const port = this.model?.network;
    if (!port) {
      return html`<div class="page" tabindex="-1"><p class="muted">Network information is not connected.</p></div>`;
    }
    const status = port.status();
    return html`<div class="page" tabindex="-1">
      ${this.#state(status)}
      ${this.#whole(status)}
      ${this.#failures(status)}
    </div>`;
  }
}
