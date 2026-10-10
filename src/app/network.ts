import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-error.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-online.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-slow-connection.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import link from '@adobe/spectrum-wc/link.css';
import { css, html, nothing, type TemplateResult, unsafeCSS } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  BrowserAutomation,
  LinkedDevice,
  LinkState,
  NetworkExit,
  NetworkFailure,
  NetworkLinks,
  NetworkPort,
  NetworkRoute,
  NetworkStatus,
  SliccModel,
  TailnetState,
  TailnetStatus,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { confirm } from './confirm.ts';
import { failure } from './files.ts';
import { ago } from './freezer.ts';
import { command, copyText, reach, reachStyles } from './reach.ts';

export { command } from './reach.ts';

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
  tailnet: 'Through a Tailscale exit node, which reaches every site.',
  page: 'Through this page’s own fetch. Sites that block cross-origin requests are out of reach.',
  none: 'No route to the network.',
};

export const automation: Record<NonNullable<BrowserAutomation['via']> | 'none', string> = {
  extension: 'Browser automation: through the SLICC extension.',
  proxy: 'Browser automation: through slicc-node.',
  none: 'Browser automation: not available. Install the extension or run slicc-node.',
};

export function automationOf(browser: BrowserAutomation): keyof typeof automation {
  return browser.via ?? 'none';
}

export const tailnetStates: Record<
  TailnetState,
  readonly ['neutral' | 'info' | 'positive' | 'notice' | 'negative', string]
> = {
  off: ['neutral', 'Off'],
  loading: ['info', 'Loading'],
  'needs-login': ['notice', 'Needs sign-in'],
  starting: ['info', 'Connecting'],
  running: ['positive', 'Connected'],
  failed: ['negative', 'Failed'],
};

const tailnetOnly: Record<NetworkRoute | 'none', string> = {
  proxy: 'Tailnet hosts only. Everything else goes through slicc-node.',
  extension: 'Tailnet hosts only. Everything else goes through the SLICC extension.',
  tailnet: 'Everything goes through your tailnet.',
  page: 'Tailnet hosts only. Everything else goes through this page’s fetch.',
  none: 'Tailnet hosts only. Nothing else is reachable.',
};

export function tailnetAddress(addresses: readonly string[]): string | undefined {
  return addresses.find((address) => address.startsWith('100.')) ?? addresses[0];
}

export function exitNodeValue(tailnet: TailnetStatus): string {
  if (tailnet.autoExitNode) return 'auto';
  return tailnet.exitNodes?.find((node) => node.name === tailnet.exitNode)?.id ?? 'none';
}

export const linkStates: Record<LinkState, readonly ['info' | 'positive' | 'notice', string]> = {
  connecting: ['info', 'Connecting'],
  connected: ['positive', 'Connected'],
  reconnecting: ['notice', 'Reconnecting'],
};

export type LinksSummary = 'permission' | 'none' | 'reconnecting' | 'connecting' | 'linked';

export function linksSummary(links: NetworkLinks): LinksSummary {
  if (links.permission) return 'permission';
  if (!links.devices.length) return 'none';
  if (links.devices.some((device) => device.state === 'reconnecting')) return 'reconnecting';
  if (links.devices.some((device) => device.state === 'connecting')) return 'connecting';
  return 'linked';
}

export function linksLight(
  links: NetworkLinks
): readonly ['neutral' | 'info' | 'positive' | 'notice', string] {
  const summary = linksSummary(links);
  if (summary === 'permission') return ['notice', 'Needs permission'];
  if (summary === 'none') return ['neutral', 'None'];
  if (summary === 'linked') return ['positive', `${links.devices.length} linked`];
  return linkStates[summary];
}

export function exitValue(exit: NetworkExit | undefined): string {
  if (!exit) return 'none';
  return exit.kind === 'tailnet' ? `tailnet:${exit.node}` : `link:${exit.id}`;
}

export function parseExit(value: string): NetworkExit {
  if (value.startsWith('tailnet:')) return { kind: 'tailnet', node: value.slice(8) };
  if (value.startsWith('link:')) return { kind: 'link', id: value.slice(5) };
  return null;
}

export function unlinkBody(device: LinkedDevice, isExit: boolean): string {
  const body =
    device.mode === 'local'
      ? 'It disconnects until this page reloads.'
      : 'It disconnects now. To link it again, run the join command on that computer.';
  return isExit ? `${body} Internet traffic goes directly again.` : body;
}

export const wholeWeb: ReadonlySet<NetworkRoute | 'link' | null> = new Set([
  'proxy',
  'extension',
  'tailnet',
  'link',
]);

export function routeOf(status: NetworkStatus): NetworkRoute | 'link' | null {
  return status.exit?.kind === 'link' ? 'link' : status.route;
}

function linkLine(status: NetworkStatus, id: string): string {
  const device = status.links?.devices.find((item) => item.id === id);
  if (!device) return 'Waiting for a linked device that isn’t connected.';
  if (device.state !== 'connected') return `Waiting for the linked device ${device.name}.`;
  return device.policy
    ? `Through the linked device ${device.name}, which reaches ${device.policy}.`
    : `Through the linked device ${device.name}.`;
}

export function routeLine(status: NetworkStatus): string {
  if (status.exit?.kind === 'link') return linkLine(status, status.exit.id);
  const node = status.route === 'tailnet' ? status.tailnet?.exitNode : null;
  return node
    ? `Through the Tailscale exit node ${node}, which reaches every site.`
    : routes[status.route ?? 'none'];
}

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
    uncopied: { state: true },
    error: { state: true },
    busy: { state: true },
    tailnetError: { state: true },
    tailnetCopied: { state: true },
    linksError: { state: true },
  };
  declare checking: boolean;
  declare copied: boolean;
  declare uncopied: boolean;
  declare error: string;
  declare busy: string;
  declare tailnetError: string;
  declare tailnetCopied: string;
  declare linksError: string;

  constructor() {
    super();
    this.checking = false;
    this.copied = false;
    this.uncopied = false;
    this.error = '';
    this.busy = '';
    this.tailnetError = '';
    this.tailnetCopied = '';
    this.linksError = '';
  }

  static styles = [
    unsafeCSS(link),
    reachStyles,
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
      .page:focus {
        outline: none;
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
      .warning {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-notice-subtle-background-color-default);
        --swc-icon-color: var(--swc-notice-visual-color);
      }
      .warning swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .node {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: center;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
        margin: 0;
      }
      .node dt {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .node dd {
        margin: 0;
      }
      .node.stacked {
        grid-template-columns: minmax(0, 1fr);
      }
      .node.stacked dd + dt {
        margin-block-start: var(--swc-spacing-100);
      }
      .info {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-informative-subtle-background-color-default);
        --swc-icon-color: var(--swc-informative-visual-color);
      }
      .info swc-icon-info-circle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .banner {
        display: grid;
        gap: var(--swc-spacing-100);
      }
      li.device {
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-200);
        padding: var(--swc-spacing-200) 0;
      }
      .device > :not(.who, swc-button) {
        grid-column: 1 / -1;
      }
      .who {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-200);
        min-width: 0;
      }
      .who .name {
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: var(--swc-bold-font-weight);
      }
      .where {
        display: grid;
        min-width: 0;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
      }
      .where code {
        font-family: var(--swc-code-font-family-stack);
      }
      .key {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .key sp-textfield {
        flex: 1 1 200px;
      }
      .exit {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
      }
      .exit sp-picker {
        width: 240px;
        max-width: 100%;
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
    this.tailnetError = '';
    this.linksError = '';
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
    const done = await copyText(command);
    this.copied = done;
    this.uncopied = !done;
  }

  async #act(
    action: string,
    run: () => Promise<void> | undefined,
    area: 'error' | 'tailnetError' | 'linksError'
  ): Promise<void> {
    if (this.busy) return;
    this.busy = action;
    this[area] = '';
    try {
      await run();
    } catch (error) {
      this[area] = failure(error);
    } finally {
      this.busy = '';
    }
  }

  #tailnet(action: string, run: () => Promise<void> | undefined): Promise<void> {
    return this.#act(action, run, 'tailnetError');
  }

  async #copyValue(key: string, value: string, area: 'tailnetError' | 'linksError'): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(value);
      this.tailnetCopied = key;
      this[area] = '';
    } catch {
      this.tailnetCopied = '';
      this[area] = 'Couldn’t copy. Select the text and copy it.';
    }
  }

  #waiting(action: string): boolean {
    return this.busy !== '' && this.busy !== action;
  }

  #submitKey(event: Event, port: NetworkPort): void {
    event.preventDefault();
    if (this.busy) return;
    const field = (event.currentTarget as HTMLElement).querySelector(
      'sp-textfield'
    ) as HTMLElement & { value: string };
    const key = field.value.trim();
    field.value = '';
    if (key) void this.#tailnet('key', () => port.submitAuthKey?.(key));
  }

  #sendKey(event: Event): void {
    (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
  }

  #enterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.#sendKey(event);
  }

  async #signOut(port: NetworkPort): Promise<void> {
    const ok = await confirm({
      title: 'Sign out of Tailscale?',
      body: 'This browser leaves your tailnet until you sign in again.',
      action: 'Sign out',
      variant: 'confirmation',
    });
    if (ok) await this.#tailnet('sign-out', () => port.logoutTailnet?.());
  }

  #copyButton(
    key: string,
    what: string,
    label: string,
    value: string,
    area: 'tailnetError' | 'linksError'
  ): TemplateResult {
    const copied = this.tailnetCopied === key;
    return html`<swc-action-button size="s" quiet data-action=${`copy-${what}`} accessible-label=${copied ? 'Copied' : `Copy ${label}`} @click=${() => this.#copyValue(key, value, area)}>
      <swc-icon-copy slot="icon"></swc-icon-copy>${copied ? 'Copied' : 'Copy'}
    </swc-action-button>`;
  }

  #copyRow(
    what: string,
    label: string,
    value: string,
    area: 'tailnetError' | 'linksError' = 'tailnetError',
    spoken = label.toLowerCase()
  ): TemplateResult {
    return html`<dt>${label}</dt>
      <dd class="command" data-copy=${what}>
        <code>${value}</code>
        ${this.#copyButton(what, what, spoken, value, area)}
      </dd>`;
  }

  #signIn(port: NetworkPort, tailnet: TailnetStatus): TemplateResult {
    return html`<p>Sign in to add this browser to your tailnet.</p>
      ${
        tailnet.loginUrl
          ? html`<p><a class="swc-Link" href=${tailnet.loginUrl} target="_blank" rel="noopener noreferrer" data-action="tailnet-sign-in">Sign in to Tailscale</a></p>`
          : nothing
      }
      ${
        port.submitAuthKey
          ? html`<p class="muted" id="tailnet-key">Or paste an auth key:</p>
            <form class="key" data-form="auth-key" @submit=${(event: Event) => this.#submitKey(event, port)}>
              <sp-textfield size="m" type="password" autocomplete="off" label="Tailscale auth key" aria-labelledby="tailnet-key" placeholder="tskey-…" @keydown=${(event: KeyboardEvent) => this.#enterKey(event)}></sp-textfield>
              <swc-button size="m" variant="secondary" data-action="submit-auth-key" ?pending=${this.busy === 'key'} ?disabled=${this.#waiting('key')} @click=${(event: Event) => this.#sendKey(event)}>Connect</swc-button>
            </form>`
          : nothing
      }`;
  }

  #running(port: NetworkPort, status: NetworkStatus, tailnet: TailnetStatus): TemplateResult {
    const address = tailnet.node ? tailnetAddress(tailnet.node.addresses) : undefined;
    const peers = tailnet.peers;
    return html`${
      tailnet.node
        ? html`<p>This browser is on your tailnet${peers === undefined ? '' : ` with ${peers} other ${peers === 1 ? 'device' : 'devices'}`}.</p>
          <dl class="node">
            ${this.#copyRow('name', 'Name', tailnet.node.name)}
            ${address ? this.#copyRow('address', 'Address', address) : nothing}
          </dl>`
        : nothing
    }
      ${port.setExit ? nothing : this.#tailnetExit(port, status, tailnet)}
      ${
        tailnet.shieldsUp === false
          ? html`<div class="warning" data-shields="down"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>Shields down: peers on your tailnet can connect to this browser.</span></div>`
          : tailnet.shieldsUp
            ? html`<p class="muted" data-shields="up">Shields up: peers can’t connect to this browser.</p>`
            : nothing
      }
      ${
        port.logoutTailnet
          ? html`<div class="actions"><swc-button size="m" variant="secondary" data-action="tailnet-sign-out" ?pending=${this.busy === 'sign-out'} ?disabled=${this.#waiting('sign-out')} @click=${() => this.#signOut(port)}>Sign out</swc-button></div>`
          : nothing
      }`;
  }

  #tailnetExit(port: NetworkPort, status: NetworkStatus, tailnet: TailnetStatus): TemplateResult {
    return html`${
      port.setExitNode && tailnet.exitNodes
        ? html`<div class="exit">
            <span id="exit-node">Exit node</span>
            <sp-picker size="m" label="Exit node" aria-labelledby="exit-node" data-action="exit-node" .value=${live(exitNodeValue(tailnet))} ?pending=${this.busy === 'exit'} ?disabled=${this.#waiting('exit')} @change=${(event: Event) => this.#exit(event, port)}>
              <sp-menu-item value="none">None</sp-menu-item>
              <sp-menu-item value="auto">Automatic</sp-menu-item>
              ${tailnet.exitNodes.map((node) => html`<sp-menu-item value=${node.id} ?disabled=${!node.online}>${node.name}${node.online ? nothing : html`<span slot="description">Offline</span>`}</sp-menu-item>`)}
            </sp-picker>
          </div>`
        : nothing
    }
      <p data-exit=${tailnet.exitNode ? 'node' : 'none'}>${tailnet.exitNode ? `Internet through the exit node ${tailnet.exitNode}.` : tailnetOnly[status.route ?? 'none']}</p>`;
  }

  #exitLine(status: NetworkStatus): TemplateResult | typeof nothing {
    const exit = status.exit;
    if (!exit) return nothing;
    if (exit.kind === 'tailnet') {
      if (status.route === 'tailnet') return nothing;
      const name = status.tailnet?.exitNodes?.find((node) => node.id === exit.node)?.name;
      return html`<p data-exit="node">${name ? `Internet through the Tailscale exit node ${name}.` : 'Internet through an automatic Tailscale exit node.'}</p>`;
    }
    const device = status.links?.devices.find((item) => item.id === exit.id);
    if (device?.state === 'connected') return nothing;
    const who = device ? `${device.name} is ${device.state}` : 'The linked device isn’t connected';
    return html`<div class="warning" data-exit="device" data-held><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${who}. Internet traffic waits until it’s connected.</span></div>`;
  }

  #exitPicker(port: NetworkPort, status: NetworkStatus): TemplateResult | typeof nothing {
    const tailnet = status.tailnet;
    const nodes = tailnet?.state === 'running' ? (tailnet.exitNodes ?? []) : [];
    const devices = (status.links?.devices ?? []).filter((device) => device.exit);
    if (!port.setExit || (!nodes.length && !devices.length && !status.exit)) return nothing;
    const current = exitValue(status.exit);
    return html`<div class="exit" data-exit-picker=${status.exit?.kind ?? 'none'}>
        <span id="exit">Internet traffic</span>
        <sp-picker size="m" label="Internet traffic" aria-labelledby="exit" data-action="exit" .value=${live(current)} ?pending=${this.busy === 'exit'} ?disabled=${this.#waiting('exit')} @change=${(event: Event) => this.#exitAll(event, port)}>
          <sp-menu-item value="none">Directly</sp-menu-item>
          ${
            nodes.length
              ? html`<sp-menu-group data-group="tailnet"><span slot="header">Tailscale</span>
                <sp-menu-item value="tailnet:auto">Automatic</sp-menu-item>
                ${nodes.map((node) => html`<sp-menu-item value=${`tailnet:${node.id}`} ?disabled=${!node.online && current !== `tailnet:${node.id}`}>${node.name}${node.online ? nothing : html`<span slot="description">Offline</span>`}</sp-menu-item>`)}
              </sp-menu-group>`
              : nothing
          }
          ${
            devices.length
              ? html`<sp-menu-group data-group="links"><span slot="header">Linked devices</span>
                ${devices.map((device) => html`<sp-menu-item value=${`link:${device.id}`} ?disabled=${device.state !== 'connected' && current !== `link:${device.id}`}>${device.name}${device.state === 'connected' ? nothing : html`<span slot="description">${linkStates[device.state][1]}</span>`}</sp-menu-item>`)}
              </sp-menu-group>`
              : nothing
          }
        </sp-picker>
      </div>
      ${this.#exitLine(status)}`;
  }

  #exitAll(event: Event, port: NetworkPort): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    void this.#act('exit', () => port.setExit?.(parseExit(value)), 'error');
  }

  async #unlink(port: NetworkPort, status: NetworkStatus, device: LinkedDevice): Promise<void> {
    const isExit = status.exit?.kind === 'link' && status.exit.id === device.id;
    const ok = await confirm({
      title: `Unlink ${device.name}?`,
      body: unlinkBody(device, isExit),
      action: 'Unlink',
      variant: 'confirmation',
    });
    if (ok) await this.#act(`unlink:${device.id}`, () => port.unlink?.(device.id), 'linksError');
  }

  async #rotate(port: NetworkPort): Promise<void> {
    const ok = await confirm({
      title: 'Make a new join URL?',
      body: 'Linked devices stay linked. Anyone with the old URL can’t link anymore.',
      action: 'New URL',
      variant: 'confirmation',
    });
    if (ok) await this.#act('rotate', () => port.rotateJoinUrl?.(), 'linksError');
  }

  #device(port: NetworkPort, status: NetworkStatus, device: LinkedDevice): TemplateResult {
    const [variant, label] = linkStates[device.state];
    const isExit = status.exit?.kind === 'link' && status.exit.id === device.id;
    const action = `unlink:${device.id}`;
    return html`<li class="device" data-device=${device.id} data-state=${device.state} data-mode=${device.mode}>
      <div class="who">
        <span class="name" title=${device.name}>${device.name}</span>
        <swc-status-light size="s" variant=${variant}>${label}</swc-status-light>
        ${isExit ? html`<swc-badge size="s" variant="accent" subtle data-exit-badge>Exit</swc-badge>` : nothing}
      </div>
      ${
        port.unlink
          ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="unlink" ?pending=${this.busy === action} ?disabled=${this.#waiting(action)} @click=${() => this.#unlink(port, status, device)}>Unlink</swc-button>`
          : nothing
      }
      <span class="where"><code>${device.host}</code><span><code>${device.address}</code> · ${device.mode === 'local' ? 'This computer' : 'Remote'}</span></span>
      ${device.policy ? html`<span class="muted" data-policy>Reaches ${device.policy}.</span>` : nothing}
      ${
        device.offers.includes('ssh')
          ? html`<div class="command" data-copy="ssh"><code>ssh ${device.host}</code>${this.#copyButton(`ssh:${device.id}`, 'ssh', 'ssh command', `ssh ${device.host}`, 'linksError')}</div>`
          : nothing
      }
    </li>`;
  }

  #join(port: NetworkPort, links: NetworkLinks): TemplateResult {
    const ready = links.joinCommand || links.joinUrl;
    return html`<p>Link a slicc CLI on another computer, or on this one, to reach its network, ssh into it, or send internet traffic through it.</p>
      ${
        ready
          ? html`<p>Run this on that computer:</p>
            <dl class="node stacked" data-join="ready">
              ${links.joinCommand ? this.#copyRow('join-command', 'Command', links.joinCommand, 'linksError', 'command') : nothing}
              ${links.joinUrl ? this.#copyRow('join-url', 'Join URL', links.joinUrl, 'linksError', 'join URL') : nothing}
            </dl>
            ${
              port.rotateJoinUrl && links.joinUrl
                ? html`<div class="actions"><swc-button size="s" variant="secondary" fill-style="outline" data-action="rotate-join-url" ?pending=${this.busy === 'rotate'} ?disabled=${this.#waiting('rotate')} @click=${() => this.#rotate(port)}>New join URL</swc-button></div>`
                : nothing
            }`
          : html`<p class="muted" data-join="preparing">Preparing a join URL…</p>`
      }`;
  }

  #permission(port: NetworkPort, links: NetworkLinks): TemplateResult | typeof nothing {
    if (links.permission === 'prompt') {
      return html`<div class="info" data-link-permission="prompt"><swc-icon-info-circle size="s" aria-hidden="true"></swc-icon-info-circle><span>A device is waiting to link. Chrome is asking whether this page may reach devices on your local network. Choose Allow.</span></div>`;
    }
    if (links.permission === 'denied') {
      return html`<div class="warning" data-link-permission="denied"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><div class="banner"><span>Chrome blocked local network access, so devices can’t link. Allow it in this site’s settings, then try again.</span>${
        port.retryLinks
          ? html`<div class="actions"><swc-button size="s" variant="secondary" fill-style="outline" data-action="retry-links" ?pending=${this.busy === 'retry-links'} ?disabled=${this.#waiting('retry-links')} @click=${() => this.#act('retry-links', () => port.retryLinks?.(), 'linksError')}>Try again</swc-button></div>`
          : nothing
      }</div></div>`;
    }
    return nothing;
  }

  #linksSection(port: NetworkPort, status: NetworkStatus): TemplateResult | typeof nothing {
    const links = status.links;
    if (!links) return nothing;
    const [variant, label] = linksLight(links);
    return html`<section aria-labelledby="links" data-links=${linksSummary(links)}>
      <div class="head">
        <h2 id="links">Linked devices</h2>
        <swc-status-light variant=${variant}>${label}</swc-status-light>
      </div>
      ${this.#permission(port, links)}
      ${
        links.devices.length
          ? html`<ul aria-labelledby="links">${links.devices.map((device) => this.#device(port, status, device))}</ul>
            <details><summary>Link another device</summary><div>${this.#join(port, links)}</div></details>`
          : this.#join(port, links)
      }
      ${
        this.linksError
          ? html`<div class="error" role="alert" data-error="links"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.linksError}</span></div>`
          : nothing
      }
    </section>`;
  }

  #exit(event: Event, port: NetworkPort): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    void this.#tailnet('exit', () => port.setExitNode?.(value === 'none' ? null : value));
  }

  #failed(port: NetworkPort, tailnet: TailnetStatus): TemplateResult {
    return html`<div class="error" data-error="tailnet"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${tailnet.detail ?? 'Tailscale stopped.'}</span></div>
      ${
        port.check
          ? html`<div class="actions"><swc-button size="m" variant="secondary" data-action="tailnet-retry" ?pending=${this.busy === 'retry'} ?disabled=${this.#waiting('retry')} @click=${() => this.#tailnet('retry', () => port.check?.())}>Retry</swc-button></div>`
          : nothing
      }`;
  }

  #tailnetBody(port: NetworkPort, status: NetworkStatus, tailnet: TailnetStatus): unknown {
    switch (tailnet.state) {
      case 'off':
        return html`<p class="muted">Reach the devices on your tailnet, and send the rest through an exit node.</p>`;
      case 'needs-login':
        return this.#signIn(port, tailnet);
      case 'running':
        return this.#running(port, status, tailnet);
      case 'failed':
        return this.#failed(port, tailnet);
      default:
        return html`<p class="muted">${tailnet.detail ?? (tailnet.state === 'loading' ? 'Loading Tailscale…' : 'Joining your tailnet…')}</p>`;
    }
  }

  #tailnetSection(port: NetworkPort, status: NetworkStatus): TemplateResult | typeof nothing {
    const tailnet = status.tailnet;
    if (!tailnet) return nothing;
    const [variant, label] = tailnetStates[tailnet.state];
    return html`<section aria-labelledby="tailnet" data-tailnet=${tailnet.state}>
      <div class="head">
        <h2 id="tailnet">Tailscale</h2>
        <swc-status-light variant=${variant}>${label}</swc-status-light>
      </div>
      ${
        port.setTailnet
          ? html`<sp-switch data-action="tailnet" .checked=${live(tailnet.state !== 'off')} ?disabled=${!!this.busy} @change=${(event: Event) => this.#tailnet('switch', () => port.setTailnet?.((event.target as HTMLElement & { checked: boolean }).checked))}>Use Tailscale</sp-switch>`
          : nothing
      }
      ${this.#tailnetBody(port, status, tailnet)}
      ${
        this.tailnetError
          ? html`<div class="error" role="alert" data-error="tailnet-action"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.tailnetError}</span></div>`
          : nothing
      }
    </section>`;
  }

  #state(port: NetworkPort, status: NetworkStatus): TemplateResult {
    const [variant, label] = networkHealth[status.health];
    return html`<section aria-labelledby="state">
      <div class="head">
        <h2 id="state">Connection</h2>
        <swc-status-light variant=${variant} data-health=${status.health}>${label}</swc-status-light>
      </div>
      <p data-route=${routeOf(status) ?? 'none'}>${routeLine(status)}</p>
      ${status.detail ? html`<p class="detail">${status.detail}</p>` : nothing}
      ${this.#exitPicker(port, status)}
      ${
        status.browser
          ? html`<p data-browser=${automationOf(status.browser)}>${automation[automationOf(status.browser)]}${status.browser.detail ? html` <span class="detail">${status.browser.detail}</span>` : nothing}</p>`
          : nothing
      }
      ${
        port.check
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
    return reach({
      intro:
        'Install the SLICC Chrome extension, or run slicc-node on this computer. Either one reaches every site.',
      extensionUrl: status.extensionUrl,
      copied: this.copied,
      uncopied: this.uncopied,
      copy: () => this.copy(),
    });
  }

  #whole(status: NetworkStatus): TemplateResult {
    if (wholeWeb.has(routeOf(status))) {
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
      ${this.#state(port, status)}
      ${this.#tailnetSection(port, status)}
      ${this.#linksSection(port, status)}
      ${this.#whole(status)}
      ${this.#failures(status)}
    </div>`;
  }
}
