import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-error.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-online.js';
import '@adobe/spectrum-wc-icons/swc-icon-cloud-state-slow-connection.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-visibility.js';
import '@adobe/spectrum-wc-icons/swc-icon-visibility-off.js';
import link from '@adobe/spectrum-wc/link.css';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/help-text/sp-help-text.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import { css, html, nothing, type PropertyValues, type TemplateResult, unsafeCSS } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  AccessKey,
  BrowserAutomation,
  DeviceAccess,
  GuestPort,
  GuestSeat,
  Leader,
  LeaderState,
  LinkedDevice,
  LinkedFolder,
  LinkPairing,
  LinkState,
  NetworkExit,
  NetworkFailure,
  NetworkLinks,
  NetworkPort,
  NetworkRoute,
  NetworkStatus,
  RemoteControlMode,
  SliccModel,
  TailnetState,
  TailnetStatus,
  TrayPort,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { type ConfirmOptions, confirm } from './confirm.ts';
import { chevron, disclosureStyles } from './disclosure.ts';
import { failure } from './files.ts';
import { ago } from './freezer.ts';
import { guestCones, guestExpiry, invite, pendingLabel } from './guests.ts';
import { qrCode } from './qr.ts';
import { command, copyText, reach, reachStyles } from './reach.ts';
import { connectionLabel, connectionVariant } from './tray.ts';
import { ViewSet } from './view-state.ts';

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
  proxy: 'Through slicc on this computer, which reaches every site.',
  link: 'Through a linked device.',
  extension: 'Through the SLICC Chrome extension, which reaches every site.',
  tailnet: 'Through a Tailscale exit node, which reaches every site.',
  page: 'Through this page’s own fetch. Sites that block cross-origin requests are out of reach.',
  none: 'No route to the network.',
};

export const automation: Record<NonNullable<BrowserAutomation['via']> | 'none', string> = {
  extension: 'Browser automation: through the SLICC extension.',
  proxy: 'Browser automation: through slicc on this computer.',
  link: 'Browser automation: through a linked device.',
  none: 'Browser automation: not available. Install the extension, or run slicc on this computer.',
};

export function exitDevice(status: NetworkStatus): LinkedDevice | undefined {
  const exit = status.exit;
  return exit?.kind === 'link'
    ? status.links?.devices.find((device) => device.id === exit.id)
    : undefined;
}

export function localExit(status: NetworkStatus): boolean {
  if (status.exit?.kind === 'link') return exitDevice(status)?.mode === 'local';
  return status.route === 'proxy';
}

export function automationOf(browser: BrowserAutomation): keyof typeof automation {
  return browser.via ?? 'none';
}

export function browserLine(browser: BrowserAutomation, status: NetworkStatus): string {
  const via = automationOf(browser);
  const local = localExit(status);
  if (via === 'none' && local) return 'slicc on this computer has no browser to control.';
  if (via !== 'link') return automation[via];
  const connected = (status.links?.devices ?? []).filter((device) => device.state === 'connected');
  const found = connected.flatMap((device) =>
    (device.browsers ?? []).map((item) => ({ name: item.name, device }))
  );
  if (found.length === 1 && found[0].device.mode === 'local') return automation.proxy;
  if (found.length === 1)
    return `Browser automation: through ${found[0].name} on the linked device ${found[0].device.name}.`;
  if (found.length > 1)
    return `Browser automation: through ${found.length} browsers on linked devices.`;
  return local ? automation.proxy : automation.link;
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
  proxy: 'Tailnet hosts only. Everything else goes through slicc on this computer.',
  link: 'Tailnet hosts only. Everything else goes through a linked device.',
  extension: 'Tailnet hosts only. Everything else goes through the SLICC extension.',
  tailnet: 'Everything goes through your tailnet.',
  page: 'Tailnet hosts only. Everything else goes through this page’s fetch.',
  none: 'Tailnet hosts only. Nothing else is reachable.',
};

export function tailnetAddress(addresses: readonly string[]): string | undefined {
  return addresses.find((address) => address.startsWith('100.')) ?? addresses[0];
}

export function tailnetLine(status: NetworkStatus): string {
  const route = routeOf(status) ?? 'none';
  if (route !== 'link') return tailnetOnly[route];
  if (localExit(status)) return tailnetOnly.proxy;
  const device = exitDevice(status);
  return device
    ? `Tailnet hosts only. Everything else goes through ${device.name}.`
    : tailnetOnly.link;
}

export function exitNodeValue(tailnet: TailnetStatus): string {
  if (tailnet.autoExitNode) return 'auto';
  return tailnet.exitNodes?.find((node) => node.name === tailnet.exitNode)?.id ?? 'none';
}

export const linkStates: Record<
  LinkState,
  readonly ['neutral' | 'info' | 'positive' | 'notice', string]
> = {
  connecting: ['info', 'Connecting'],
  connected: ['positive', 'Connected'],
  reconnecting: ['notice', 'Reconnecting'],
  offline: ['neutral', 'Offline'],
};

export const controlBadges: Record<RemoteControlMode, string> = {
  prompt: 'Prompting',
  watch: 'Watching',
};

export const accessLabels: Record<AccessKey, string> = {
  view: 'View',
  control: 'Control',
  terminal: 'Terminal',
};

const accessKeys = Object.keys(accessLabels) as AccessKey[];

export function accessShown(access: DeviceAccess): AccessKey[] {
  return accessKeys.filter((key) => access[key] !== undefined);
}

export function terminalsText(count: number): string {
  return count === 1 ? 'Terminal open' : `${count} terminals open`;
}

const again = 'Unlinking it, or a new certificate on it, turns this off again.';

export function accessConfirm(device: LinkedDevice, key: AccessKey | 'follow'): ConfirmOptions {
  const name = device.name;
  const [title, body] = {
    follow: [
      `Let ${name} follow this SLICC?`,
      'It sees the agent’s conversations live. To let it send prompts or open terminals, turn on Control or Terminal for it afterwards.',
    ],
    view: [
      `Let ${name} view this SLICC?`,
      'It sees the agent’s conversations live, but can’t send prompts.',
    ],
    control: [
      `Allow remote control from ${name}?`,
      'It can send prompts to the agent, steer it and stop it.',
    ],
    terminal: [
      `Give ${name} a root shell?`,
      'Terminal lets it open shells on this SLICC as root: it can run any command and read or change every file.',
    ],
  }[key];
  return { title, body: `${body} ${again}`, action: 'Allow', variant: 'confirmation' };
}

export interface RemoteLight {
  mode: RemoteControlMode | 'terminal' | 'ask';
  variant: 'info' | 'notice';
  text: string;
  tooltip: string;
}

function say(
  devices: readonly LinkedDevice[],
  one: (device: LinkedDevice) => string,
  many: string
): string[] {
  if (!devices.length) return [];
  return [devices.length === 1 ? one(devices[0]) : `${devices.length} ${many}`];
}

export function deviceName(name: string): string {
  return name.replace(/^slicc\b/i, 'SLICC');
}

function named<T extends { name: string }>(items: readonly T[]): T[] {
  return items.map((item) => ({ ...item, name: deviceName(item.name) }));
}

export function networkStatus(port: NetworkPort): NetworkStatus {
  let status = port.status();
  if (status.links)
    status = { ...status, links: { ...status.links, devices: named(status.links.devices) } };
  if (status.leaders) status = { ...status, leaders: named(status.leaders) };
  return status;
}

type LeaderAction = 'retry' | 'reconnect' | 'disconnect' | 'forget';

export const leaderStates: Record<
  LeaderState,
  readonly ['neutral' | 'info' | 'positive' | 'notice' | 'negative', string]
> = {
  connecting: ['info', 'Connecting'],
  reconnecting: ['notice', 'Reconnecting'],
  connected: ['positive', 'Connected'],
  disconnected: ['neutral', 'Disconnected'],
  failed: ['negative', 'Failed'],
  unlinked: ['neutral', 'Unlinked'],
};

export function leaderConfirm(leader: Leader): ConfirmOptions {
  return {
    title: `Forget ${leader.name}?`,
    body: 'To follow it again, you’ll need a new invite from it.',
    action: 'Forget',
    variant: 'destructive',
  };
}

export function guestConfirm(seat: GuestSeat): ConfirmOptions {
  return {
    title: `Revoke ${seat.label}?`,
    body: 'Their link stops working at once. To let them back in, invite them again.',
    action: 'Revoke',
    variant: 'destructive',
  };
}

export function remoteLight(status: NetworkStatus | undefined): RemoteLight | null {
  const devices = status?.links?.devices ?? [];
  const asking = devices.filter((device) => device.asking);
  const prompting = devices.filter((device) => device.controlling === 'prompt');
  const watching = devices.filter((device) => device.controlling === 'watch');
  const shells = devices.filter((device) => device.terminals);
  if (!asking.length && !prompting.length && !watching.length && !shells.length) return null;
  const tooltip = [
    ...say(
      asking,
      (device) => `${device.name} asks to follow this SLICC. Allow it in Linked devices.`,
      'devices ask to follow this SLICC. Allow them in Linked devices.'
    ),
    ...say(
      prompting,
      (device) => `${device.name} is sending prompts to the agent.`,
      'linked devices are sending prompts to the agent.'
    ),
    ...say(
      shells,
      (device) =>
        `${device.name} has ${device.terminals === 1 ? 'a terminal' : `${device.terminals} terminals`} open here.`,
      'linked devices have terminals open here.'
    ),
    ...say(
      watching,
      (device) => `${device.name} is watching the agent.`,
      'linked devices are watching the agent.'
    ),
  ].join(' ');
  const by = (list: readonly LinkedDevice[]) =>
    list.length === 1 ? list[0].name : `${list.length} linked devices`;
  if (asking.length) {
    const text =
      asking.length === 1
        ? `${asking[0].name} asks to follow`
        : `${asking.length} devices ask to follow`;
    return { mode: 'ask', variant: 'notice', text, tooltip };
  }
  if (prompting.length)
    return { mode: 'prompt', variant: 'info', text: `Controlled by ${by(prompting)}`, tooltip };
  if (shells.length)
    return { mode: 'terminal', variant: 'info', text: `Terminal open from ${by(shells)}`, tooltip };
  return { mode: 'watch', variant: 'info', text: `Watched by ${by(watching)}`, tooltip };
}

export function pairingLine(pairing: LinkPairing): string {
  const code = pairing.code ? ` Code ${pairing.code}.` : '';
  switch (pairing.state) {
    case 'confirm':
      return `Link SLICC on this computer?${code}`;
    case 'linking':
      return 'Linking SLICC on this computer…';
    case 'linked':
      return `Linked ${deviceName(pairing.name ?? 'SLICC on this computer')}.`;
    case 'failed':
      return `Error: ${pairingError(pairing)}`;
    default:
      return '';
  }
}

export function pairingError(pairing: LinkPairing): string {
  return pairing.error ?? 'Linking stopped.';
}

export function hasTray(links: NetworkLinks): boolean {
  return links.joinUrl !== undefined || links.joinCommand !== undefined;
}

export type LinksSummary =
  | 'permission'
  | 'none'
  | 'reconnecting'
  | 'connecting'
  | 'offline'
  | 'linked';

export function linksSummary(links: NetworkLinks): LinksSummary {
  if (links.permission) return 'permission';
  if (!links.devices.length) return 'none';
  if (links.devices.some((device) => device.state === 'reconnecting')) return 'reconnecting';
  if (links.devices.some((device) => device.state === 'connecting')) return 'connecting';
  if (links.devices.every((device) => device.state === 'offline')) return 'offline';
  return 'linked';
}

export function linksLight(
  links: NetworkLinks
): readonly ['neutral' | 'info' | 'positive' | 'notice', string] {
  const summary = linksSummary(links);
  if (summary === 'permission') return ['notice', 'Needs permission'];
  if (summary === 'none') return ['neutral', 'None'];
  if (summary === 'linked') {
    const online = links.devices.filter((device) => device.state !== 'offline');
    return ['positive', `${online.length} linked`];
  }
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

export const wholeWeb: ReadonlySet<NetworkRoute | null> = new Set([
  'proxy',
  'extension',
  'tailnet',
  'link',
]);

export function routeOf(status: NetworkStatus): NetworkRoute | null {
  return status.exit?.kind === 'link' ? 'link' : status.route;
}

function linkLine(status: NetworkStatus): string {
  const device = exitDevice(status);
  if (!device) return 'Waiting for a linked device that isn’t connected.';
  if (device.state !== 'connected') return `Waiting for the linked device ${device.name}.`;
  if (device.mode === 'local') return routes.proxy;
  return device.policy
    ? `Through the linked device ${device.name}, which reaches ${device.policy}.`
    : `Through the linked device ${device.name}.`;
}

export function routeLine(status: NetworkStatus): string {
  if (status.exit?.kind === 'link') return linkLine(status);
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

const dots = '••••••';

function maskUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const base = cut < 0 ? url : url.slice(0, cut);
  const path = base.replace(/\/+$/, '');
  const slash = path.lastIndexOf('/');
  if (slash > path.indexOf('//') + 1) return `${path.slice(0, slash + 1)}${dots}`;
  return cut < 0 ? `${path}/${dots}` : `${base}${url[cut]}${dots}`;
}

function masked(text: string): TemplateResult[] {
  return maskSecret(text)
    .split(dots)
    .map((part, i) => (i ? html`<span class="dots">${dots}</span>${part}` : html`${part}`));
}

export function maskSecret(text: string): string {
  const masked = text.replace(/https?:\/\/\S+/g, maskUrl);
  return masked === text ? dots : masked;
}

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
    revealed: { state: true },
    linksError: { state: true },
    syncError: { state: true },
    leaderError: { state: true },
    guestError: { state: true },
    guestsOff: { state: true },
    pairBusy: { state: true },
    pairError: { state: true },
    pairFilled: { state: true },
  };
  #open = new ViewSet(this, 'network');
  declare checking: boolean;
  declare copied: string | null;
  declare uncopied: boolean;
  declare error: string;
  declare busy: string;
  declare tailnetError: string;
  declare tailnetCopied: string;
  declare revealed: Record<string, string>;
  declare linksError: string;
  declare syncError: string;
  declare leaderError: string;
  declare guestError: string;
  declare guestsOff: string | null;
  declare pairBusy: string;
  declare pairError: string;
  declare pairFilled: boolean;
  #pairState: LinkPairing['state'] | undefined;
  #confirming = false;
  #settle: ResizeObserver | null = null;
  #leaderId = '';
  #guestId = '';

  constructor() {
    super();
    this.checking = false;
    this.copied = null;
    this.uncopied = false;
    this.error = '';
    this.busy = '';
    this.tailnetError = '';
    this.tailnetCopied = '';
    this.revealed = {};
    this.linksError = '';
    this.syncError = '';
    this.leaderError = '';
    this.guestError = '';
    this.guestsOff = null;
    this.pairBusy = '';
    this.pairError = '';
    this.pairFilled = false;
  }

  static styles = [
    unsafeCSS(link),
    reachStyles,
    disclosureStyles,
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
        scroll-margin-top: var(--swc-spacing-300);
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
      h3 {
        margin: var(--swc-spacing-200) 0 0;
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-heading-color);
      }
      .follow {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-300);
      }
      .follow dl {
        flex: 1 1 240px;
      }
      .qr {
        flex: none;
        width: 168px;
        height: 168px;
        border-radius: var(--swc-corner-radius-small-default);
      }
      .access {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 var(--swc-spacing-200);
      }
      .access > .muted {
        flex-basis: 100%;
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
      .folders {
        margin-top: var(--swc-spacing-100);
      }
      .folders .subheading {
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .folders ul {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-75);
        margin: var(--swc-spacing-75) 0 0;
        padding: 0;
        list-style: none;
      }
      .folders li {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        min-width: 0;
      }
      .folders swc-icon-folder {
        flex: none;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .folder {
        flex: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .folder > code {
        flex: none;
        max-width: 100%;
      }
      .folder .muted {
        flex-basis: 100%;
        font-size: var(--swc-font-size-75);
      }
      .where code,
      .folder code,
      [data-browsers] code {
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
      .pairing {
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
      }
      .pairing h3 {
        margin: 0;
      }
      .pairing h3:focus {
        outline: none;
      }
      .pairing code {
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        color: var(--swc-code-color);
        white-space: nowrap;
      }
      .pairing .chip {
        display: inline-block;
        padding: 0 var(--swc-spacing-75);
        border-radius: var(--swc-corner-radius-small-default);
        background: var(--swc-gray-200);
        font-size: var(--swc-font-size-100);
      }
      .pair-field {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
      }
      .pair-field sp-field-label {
        flex-basis: 100%;
      }
      .pair-field sp-textfield {
        flex: 1 1 200px;
        min-width: 0;
      }
      .linking {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-200);
        overflow-wrap: anywhere;
      }
      .linking swc-progress-circle {
        flex: none;
      }
      .dots {
        display: inline-block;
        white-space: nowrap;
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
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
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
    this.syncError = '';
    this.leaderError = '';
    this.guestError = '';
    this.guestsOff = null;
    this.pairError = '';
    this.pairBusy = '';
    this.#pairState = undefined;
    const update = () => this.requestUpdate();
    return [
      model.tray.on('status', update),
      ...(model.network ? [model.network.on('network', update)] : []),
      ...(model.guests
        ? [
            model.guests.on('seats', update),
            model.agent.on('agents', update),
            model.guests.on('unavailable', (text) => {
              this.guestsOff = text;
            }),
          ]
        : []),
    ];
  }

  reveal(section: string): void {
    void this.updateComplete.then(() => {
      const target = this.renderRoot.querySelector<HTMLElement>(
        `section[aria-labelledby="${section}"]`
      );
      (
        target?.querySelector<HTMLElement>('[data-action^="copy-"]') ??
        target?.querySelector<HTMLElement>('swc-button, swc-action-button')
      )?.focus({ focusVisible: false });
      target?.scrollIntoView({ block: 'start' });
    });
  }

  focus(): void {
    if (this.#pairing()?.state === 'confirm') {
      this.#showPairing();
      return;
    }
    this.focusWith(
      { focusVisible: false },
      'sp-picker, swc-button, a, summary, swc-action-button',
      '.page'
    );
  }

  #showPairing(): void {
    void this.updateComplete.then(() => {
      this.focusWith({ preventScroll: true }, '#pairing');
      const scroll = () =>
        this.renderRoot.querySelector('[data-pairing]')?.scrollIntoView({ block: 'nearest' });
      scroll();
      this.#settle?.disconnect();
      const settle = new ResizeObserver(scroll);
      settle.observe(this.renderRoot.querySelector('.page') as Element);
      this.#settle = settle;
      setTimeout(() => settle.disconnect(), 1000);
    });
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const state = this.#pairing()?.state;
    const was = this.#pairState;
    this.#pairState = state;
    if (state === was) return;
    if (was !== undefined) this.pairError = '';
    this.#confirming = state === 'confirm';
  }

  protected updated(): void {
    if (!this.#confirming) return;
    this.#confirming = false;
    this.#showPairing();
  }

  #pairing(): LinkPairing | undefined {
    return this.model?.network?.status().links?.pairing;
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

  async copy(text = command): Promise<void> {
    const done = await copyText(text);
    this.copied = done ? text : null;
    this.uncopied = !done;
  }

  async #act(
    action: string,
    run: () => Promise<void> | undefined,
    area: 'error' | 'tailnetError' | 'linksError' | 'syncError' | 'leaderError' | 'guestError'
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

  async #pairAct(
    action: string,
    run: () => Promise<void> | undefined,
    then?: string
  ): Promise<boolean> {
    this.pairBusy = action;
    this.pairError = '';
    let ok = true;
    let error: unknown;
    try {
      await run();
    } catch (reason) {
      ok = false;
      error = reason;
    }
    if (this.pairBusy !== action) return false;
    this.pairBusy = '';
    if (!ok) {
      this.pairError = failure(error);
      return false;
    }
    if (then) {
      await this.updateComplete;
      this.focusOn(then);
    }
    return true;
  }

  async #submitPair(event: Event, port: NetworkPort): Promise<void> {
    event.preventDefault();
    const field = this.renderRoot.querySelector('#pair-url') as HTMLElement & { value: string };
    const url = field.value.trim();
    if (!url || this.pairBusy || !port.pairComputer) return;
    if (await this.#pairAct('pair', () => port.pairComputer?.(url))) {
      field.value = '';
      this.pairFilled = false;
    }
  }

  #pairInput(event: Event): void {
    this.pairFilled = !!(event.target as HTMLElement & { value: string }).value.trim();
  }

  #pairButton(
    port: NetworkPort,
    action: string,
    label: string,
    then = '#pairing',
    variant = 'secondary'
  ): TemplateResult {
    return html`<swc-button size="m" variant=${variant} fill-style=${variant === 'accent' ? nothing : 'outline'} data-action=${action} ?pending=${this.pairBusy === action} @click=${() => this.#pairAct(action, () => port.cancelPairing?.(), then)}>${label}</swc-button>`;
  }

  #pairingBody(port: NetworkPort, pairing: LinkPairing): TemplateResult {
    const code = pairing.code ? html`<code class="chip">${pairing.code}</code>` : nothing;
    const after = pairing.code ? html` (<code>${pairing.code}</code>)` : nothing;
    switch (pairing.state) {
      case 'confirm':
        return html`<p>Code ${code}</p>
          <p>Its network, folders and kernel services become available to seven. Check that slicc shows the same code.</p>
          <div class="actions">
            <swc-button size="m" variant="accent" data-action="confirm-pairing" ?pending=${this.pairBusy === 'confirm-pairing'} @click=${() => this.#pairAct('confirm-pairing', () => port.confirmPairing?.())}>Link</swc-button>
            ${this.#pairButton(port, 'cancel-pairing', 'Cancel')}
          </div>`;
      case 'linking':
        return html`<div class="linking"><swc-progress-circle size="s" indeterminate label="Linking" aria-hidden="true"></swc-progress-circle><span>Linking SLICC on this computer${after}…</span></div>
          <div class="actions">${this.#pairButton(port, 'cancel-pairing', 'Cancel')}</div>`;
      case 'linked':
        return html`<swc-status-light size="m" variant="positive" data-paired><span>Linked ${deviceName(pairing.name ?? 'SLICC on this computer')}${after}.</span></swc-status-light>
          <div class="actions">${this.#pairButton(port, 'done-pairing', 'Done')}</div>`;
      case 'failed':
        return html`<div class="error" data-error="pair-failed"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span><span class="sr">Error: </span>${pairingError(pairing)}</span></div>
          <div class="actions">
            ${this.#pairButton(port, 'retry-pairing', 'Try again', '#pair-url')}
            ${this.#pairButton(port, 'dismiss-pairing', 'Dismiss')}
          </div>`;
      default:
        return html`<p>Run <code>slicc pair</code> on this computer and paste the link it prints.</p>
          <form class="pair-field" data-form="pair" @submit=${(event: Event) => this.#submitPair(event, port)}>
            <sp-field-label for="pair-url" size="m">Pairing link</sp-field-label>
            <sp-textfield id="pair-url" size="m" type="url" autocomplete="off" placeholder=${`${location.origin}/#slicc-pair=…`} ?invalid=${!!this.pairError} @input=${(event: Event) => this.#pairInput(event)} @keydown=${(event: KeyboardEvent) => this.#enterKey(event)}>${this.pairError ? html`<sp-help-text slot="negative-help-text" icon data-error="pairing">${this.pairError}</sp-help-text>` : nothing}</sp-textfield>
            <swc-button size="m" variant="accent" data-action="pair" ?pending=${this.pairBusy === 'pair'} ?disabled=${!this.pairFilled || !port.pairComputer} @click=${(event: Event) => this.#sendKey(event)}>Link</swc-button>
          </form>`;
    }
  }

  #pairingBlock(port: NetworkPort, pairing: LinkPairing): TemplateResult {
    const confirming = pairing.state === 'confirm';
    return html`<section class="pairing" aria-labelledby="pairing" data-pairing=${pairing.state}>
      <h3 id="pairing" tabindex="-1">${confirming ? 'Link SLICC on this computer?' : 'Link this computer'}</h3>
      ${this.#pairingBody(port, pairing)}
      ${
        this.pairError && pairing.state !== 'idle'
          ? html`<div class="error" data-error="pairing"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span><span class="sr">Error: </span>${this.pairError}</span></div>`
          : nothing
      }
    </section>`;
  }

  #tailnet(action: string, run: () => Promise<void> | undefined): Promise<void> {
    return this.#act(action, run, 'tailnetError');
  }

  async #copyValue(
    key: string,
    value: string,
    area: 'tailnetError' | 'linksError' | 'syncError',
    hidden: boolean
  ): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(value);
      this.tailnetCopied = key;
      this[area] = '';
    } catch {
      this.tailnetCopied = '';
      this[area] = hidden
        ? 'Couldn’t copy. Choose Show, then select the text and copy it.'
        : 'Couldn’t copy. Select the text and copy it.';
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
    area: 'tailnetError' | 'linksError' | 'syncError',
    hidden = false
  ): TemplateResult {
    const copied = this.tailnetCopied === key;
    return html`<swc-action-button size="s" quiet data-action=${`copy-${what}`} accessible-label=${copied ? 'Copied' : `Copy ${label}`} @click=${() => this.#copyValue(key, value, area, hidden)}>
      <swc-icon-copy slot="icon"></swc-icon-copy>${copied ? 'Copied' : 'Copy'}
    </swc-action-button>`;
  }

  #copyRow(
    what: string,
    label: string,
    value: string,
    area: 'tailnetError' | 'linksError' | 'syncError' = 'tailnetError',
    spoken = label.toLowerCase(),
    secret = false
  ): TemplateResult {
    const hidden = secret && this.revealed[what] !== value;
    return html`<dt>${label}</dt>
      <dd class="command" data-copy=${what} data-secret=${secret ? (hidden ? 'hidden' : 'shown') : nothing}>
        <code>${hidden ? masked(value) : value}</code>
        ${secret ? this.#revealButton(what, spoken, value, hidden) : nothing}
        ${this.#copyButton(what, what, spoken, value, area, hidden)}
      </dd>`;
  }

  #revealButton(what: string, spoken: string, value: string, hidden: boolean): TemplateResult {
    const id = `reveal-${what}`;
    const label = `${hidden ? 'Show' : 'Hide'} ${spoken}`;
    return html`<swc-action-button id=${id} size="s" quiet data-action=${id} accessible-label=${label} @click=${() => {
      this.revealed = { ...this.revealed, [what]: hidden ? value : '' };
    }}>${hidden ? html`<swc-icon-visibility slot="icon"></swc-icon-visibility>` : html`<swc-icon-visibility-off slot="icon"></swc-icon-visibility-off>`}</swc-action-button
    ><swc-tooltip for=${id} placement="top">${label}</swc-tooltip>`;
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
      <p data-exit=${tailnet.exitNode ? 'node' : 'none'}>${tailnet.exitNode ? `Internet through the exit node ${tailnet.exitNode}.` : tailnetLine(status)}</p>`;
  }

  #exitLine(port: NetworkPort, status: NetworkStatus): TemplateResult | typeof nothing {
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
    return html`<div class="warning" data-exit="device" data-held><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><div class="banner"><span>${who}. Internet traffic waits until it’s connected.</span><div class="actions"><swc-button size="s" variant="secondary" fill-style="outline" data-action="exit-direct" ?pending=${this.busy === 'exit'} ?disabled=${this.#waiting('exit')} @click=${() => this.#act('exit', () => port.setExit?.(null), 'error')}>Send directly</swc-button></div></div></div>`;
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
      ${this.#exitLine(port, status)}`;
  }

  #exitAll(event: Event, port: NetworkPort): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    void this.#act('exit', () => port.setExit?.(parseExit(value)), 'error');
  }

  #control(port: NetworkPort, device: LinkedDevice): TemplateResult | typeof nothing {
    const control = device.control;
    if (!control) return nothing;
    if (control.fixed)
      return html`<span class="muted" data-control="fixed">Remote control is always allowed from this computer.</span>`;
    if (!port.setRemoteControl) {
      return html`<span class="muted" data-control=${control.allowed ? 'allowed' : 'off'}>${control.allowed ? 'Remote control allowed.' : 'Remote control not allowed.'}</span>`;
    }
    return html`<sp-switch class="control" data-action="remote-control" .checked=${live(control.allowed)} ?disabled=${this.busy !== ''} @change=${(event: Event) => this.#setControl(port, device, event.target as HTMLElement & { checked: boolean })}>Allow remote control</sp-switch>`;
  }

  async #setControl(
    port: NetworkPort,
    device: LinkedDevice,
    toggle: { checked: boolean }
  ): Promise<void> {
    const allowed = toggle.checked;
    if (allowed) {
      const ok = await confirm({
        title: `Allow remote control from ${device.name}?`,
        body: 'It can send prompts to the agent, watch its replies and stop it. Unlinking it, or a new certificate on it, turns this off again.',
        action: 'Allow',
        variant: 'confirmation',
      });
      if (!ok) {
        toggle.checked = false;
        return;
      }
    }
    await this.#act(
      `control:${device.id}`,
      () => port.setRemoteControl?.(device.id, allowed),
      'linksError'
    );
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

  async #rotate(port: NetworkPort, follow: boolean): Promise<void> {
    const ok = await confirm({
      title: 'Make a new join URL?',
      body: `Linked devices stay linked. Anyone with the old ${follow ? 'join URL, follow link or QR code' : 'URL'} can’t link anymore.`,
      action: 'New URL',
      variant: 'confirmation',
    });
    if (ok) await this.#act('rotate', () => port.rotateJoinUrl?.(), 'linksError');
  }

  #access(port: NetworkPort, device: LinkedDevice): TemplateResult | typeof nothing {
    const access = device.access;
    if (!access) return this.#control(port, device);
    const keys = accessShown(access);
    if (access.fixed)
      return html`<span class="muted" data-access="fixed">Always allowed from this computer: ${keys.map((key) => accessLabels[key]).join(', ')}.</span>`;
    if (!port.setAccess) {
      const granted = keys.filter((key) => access[key]).map((key) => accessLabels[key]);
      return html`<span class="muted" data-access="read">${granted.length ? `Allowed: ${granted.join(', ')}.` : 'Nothing allowed yet.'}</span>`;
    }
    return html`<div class="access" role="group" aria-label=${`Allow from ${device.name}`} data-access="edit">
      <span class="muted" aria-hidden="true">Allow</span>
      ${keys.map((key) => html`<sp-switch size="s" data-action=${`access-${key}`} .checked=${live(!!access[key])} ?disabled=${this.busy !== '' || (key === 'control' && access.view === false)} @change=${(event: Event) => this.#setAccess(port, device, key, event.target as HTMLElement & { checked: boolean })}>${accessLabels[key]}</sp-switch>`)}
    </div>`;
  }

  async #setAccess(
    port: NetworkPort,
    device: LinkedDevice,
    key: AccessKey,
    toggle: { checked: boolean }
  ): Promise<void> {
    const allowed = toggle.checked;
    if (allowed && !(await confirm(accessConfirm(device, key)))) {
      toggle.checked = false;
      return;
    }
    await this.#act(
      `access:${device.id}`,
      () => port.setAccess?.(device.id, key, allowed),
      'linksError'
    );
  }

  async #allow(port: NetworkPort, device: LinkedDevice): Promise<void> {
    if (!(await confirm(accessConfirm(device, 'follow')))) return;
    await this.#act(
      `allow:${device.id}`,
      () => port.setAccess?.(device.id, 'view', true),
      'linksError'
    );
  }

  #ask(port: NetworkPort, device: LinkedDevice): TemplateResult {
    const action = `allow:${device.id}`;
    return html`<div class="info" data-ask><swc-icon-info-circle size="s" aria-hidden="true"></swc-icon-info-circle><div class="banner"><span>${device.name} asks to follow this SLICC. It waits until you allow it.</span>${
      port.setAccess
        ? html`<div class="actions"><swc-button size="s" variant="accent" data-action="allow-follow" ?pending=${this.busy === action} ?disabled=${this.#waiting(action)} @click=${() => this.#allow(port, device)}>Allow</swc-button></div>`
        : nothing
    }</div></div>`;
  }

  #device(port: NetworkPort, status: NetworkStatus, device: LinkedDevice): TemplateResult {
    const [variant, label] = device.asking
      ? (['notice', 'Asks to follow'] as const)
      : linkStates[device.state];
    const isExit = status.exit?.kind === 'link' && status.exit.id === device.id;
    const action = `unlink:${device.id}`;
    return html`<li class="device" data-device=${device.id} data-state=${device.state} data-mode=${device.mode} data-kind=${device.kind ?? 'cli'} ?data-asking=${device.asking}>
      <div class="who">
        <span class="name" title=${device.name}>${device.name}</span>
        <swc-status-light size="s" variant=${variant}>${label}</swc-status-light>
        ${isExit ? html`<swc-badge size="s" variant="accent" subtle data-exit-badge>Exit</swc-badge>` : nothing}
        ${device.controlling ? html`<swc-badge size="s" variant="informative" subtle data-controlling=${device.controlling}>${controlBadges[device.controlling]}</swc-badge>` : nothing}
        ${device.terminals ? html`<swc-badge size="s" variant="informative" subtle data-terminals=${device.terminals}>${terminalsText(device.terminals)}</swc-badge>` : nothing}
      </div>
      ${
        port.unlink
          ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="unlink" ?pending=${this.busy === action} ?disabled=${this.#waiting(action)} @click=${() => this.#unlink(port, status, device)}>Unlink</swc-button>`
          : nothing
      }
      <span class="where">${device.host ? html`<code>${device.host}</code>` : nothing}<span>${device.address ? html`<code>${device.address}</code> · ` : nothing}${device.mode === 'local' ? 'This computer' : 'Remote'}${device.kind === 'seven' ? ' · Follower' : ''}</span></span>
      ${device.policy ? html`<span class="muted" data-policy>Reaches ${device.policy}.</span>` : nothing}
      ${
        device.browsers?.length
          ? html`<span class="muted" data-browsers>${device.browsers.length === 1 ? 'Browser' : 'Browsers'}: ${device.browsers.map((item, index) => html`${index ? ', ' : ''}${item.name} (<code>${item.runtime}</code>)`)}</span>`
          : nothing
      }
      ${device.note ? html`<div class="warning" data-note><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span><span class="sr">Warning: </span>${device.note}</span></div>` : nothing}
      ${device.folders?.length ? this.#folders(port, device, device.folders) : nothing}
      ${device.asking ? this.#ask(port, device) : this.#access(port, device)}
      ${
        device.offers.includes('ssh')
          ? html`<div class="command" data-copy="ssh"><code>ssh ${device.host}</code>${this.#copyButton(`ssh:${device.id}`, 'ssh', 'ssh command', `ssh ${device.host}`, 'linksError')}</div>`
          : nothing
      }
    </li>`;
  }

  #folders(
    port: NetworkPort,
    device: LinkedDevice,
    folders: readonly LinkedFolder[]
  ): TemplateResult {
    const heading = `folders-${device.id}`;
    return html`<div class="folders" data-folders>
      <span class="subheading" id=${heading}>Folders</span>
      <ul aria-labelledby=${heading}>${folders.map((folder) => this.#folder(port, device, folder))}</ul>
    </div>`;
  }

  #folder(port: NetworkPort, device: LinkedDevice, folder: LinkedFolder): TemplateResult {
    const action = `folder:${folder.source}`;
    const busy = this.busy === action;
    const button = folder.mounted
      ? port.ejectFolder
        ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="eject-folder" data-id=${folder.source} accessible-label=${`Eject ${folder.mounted}`} ?pending=${busy} ?disabled=${this.#waiting(action)} @click=${() => this.#act(action, () => port.ejectFolder?.(folder.source), 'linksError')}>Eject</swc-button>`
        : nothing
      : port.mountFolder
        ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="mount-folder" data-id=${folder.source} accessible-label=${`Mount ${folder.source}`} ?pending=${busy} ?disabled=${this.#waiting(action) || device.state !== 'connected'} @click=${() => this.#act(action, () => this.#mountFolder(port, folder.source), 'linksError')}>Mount</swc-button>`
        : nothing;
    return html`<li data-folder=${folder.source} data-mounted=${folder.mounted ? 'yes' : 'no'}>
      <swc-icon-folder size="s" aria-hidden="true"></swc-icon-folder>
      <span class="folder">
        <code title=${folder.source}>${folder.name}</code>
        ${folder.readonly ? html`<swc-badge size="s" variant="neutral" subtle data-readonly>Read-only</swc-badge>` : nothing}
        ${folder.mounted ? html`<span class="muted" data-mounted-at>Mounted at <code>${folder.mounted}</code></span>` : nothing}
      </span>
      ${button}
    </li>`;
  }

  async #mountFolder(port: NetworkPort, source: string): Promise<void> {
    await port.mountFolder?.(source);
  }

  #join(port: NetworkPort, links: NetworkLinks): TemplateResult {
    return html`${hasTray(links) ? this.#joinTray(port, links) : nothing}
      ${links.pairing ? this.#pairingBlock(port, links.pairing) : nothing}`;
  }

  #joinTray(port: NetworkPort, links: NetworkLinks): TemplateResult {
    const ready = links.joinCommand || links.joinUrl;
    const follow = links.followUrl;
    return html`<p>Link a slicc CLI on another computer, or on this one, to reach its network, ssh into it, or send internet traffic through it.</p>
      ${
        ready
          ? html`<p>Run this on that computer:</p>
            <dl class="node stacked" data-join="ready">
              ${links.joinCommand ? this.#copyRow('join-command', 'Command', links.joinCommand, 'linksError', 'command', true) : nothing}
              ${links.joinUrl ? this.#copyRow('join-url', 'Join URL', links.joinUrl, 'linksError', 'join URL', true) : nothing}
            </dl>
            ${
              follow
                ? html`<h3 id="follow-link">Open on another device</h3>
                  <p>Scan this code on your phone, or open the link on another computer, to follow this SLICC there. It waits until you allow it here.</p>
                  <div class="follow" data-join="follow">
                    ${qrCode(follow, 'QR code of the follow link')}
                    <dl class="node stacked">${this.#copyRow('follow-url', 'Link', follow, 'linksError', 'follow link', true)}</dl>
                  </div>`
                : nothing
            }
            ${
              port.rotateJoinUrl && links.joinUrl
                ? html`<div class="actions"><swc-button size="s" variant="secondary" fill-style="outline" data-action="rotate-join-url" ?pending=${this.busy === 'rotate'} ?disabled=${this.#waiting('rotate')} @click=${() => this.#rotate(port, !!follow)}>New join URL</swc-button></div>`
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
    const pairing = links.pairing;
    const joinable = hasTray(links) || !!pairing;
    const active =
      !!pairing && (pairing.state !== 'idle' || links.devices.some((device) => device.note));
    return html`<section aria-labelledby="links" data-links=${linksSummary(links)}>
      <div class="head">
        <h2 id="links">Linked devices</h2>
        <swc-status-light variant=${variant}>${label}</swc-status-light>
      </div>
      ${this.#permission(port, links)}
      ${
        links.devices.length
          ? html`<ul aria-labelledby="links">${links.devices.map((device) => this.#device(port, status, device))}</ul>
            ${joinable ? html`<details ?open=${active || this.#open.has('link')} @toggle=${this.#open.details('link')}><summary>${chevron}Link another device</summary><div>${this.#join(port, links)}</div></details>` : nothing}`
          : this.#join(port, links)
      }
      ${pairing ? html`<div class="sr" role="status" aria-live="polite" data-pairing-status>${pairingLine(pairing)}</div>` : nothing}
      ${
        this.linksError
          ? html`<div class="error" role="alert" data-error="links"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.linksError}</span></div>`
          : nothing
      }
    </section>`;
  }

  #leaderAct(
    kind: LeaderAction,
    leader: Leader,
    run: (id: string) => Promise<void> | undefined
  ): Promise<void> {
    return this.#act(
      `leader:${kind}:${leader.id}`,
      () => {
        this.#leaderId = leader.id;
        return run(leader.id);
      },
      'leaderError'
    );
  }

  async #forgetLeader(event: Event, port: NetworkPort, leader: Leader): Promise<void> {
    const trigger = event.currentTarget as HTMLElement;
    if (await confirm({ ...leaderConfirm(leader), trigger }))
      await this.#leaderAct('forget', leader, (id) => port.forgetLeader?.(id));
  }

  #leaderButton(
    kind: LeaderAction,
    label: string,
    leader: Leader,
    click: (event: Event) => Promise<void>
  ): TemplateResult {
    const action = `leader:${kind}:${leader.id}`;
    return html`<swc-button size="s" variant="secondary" fill-style="outline" data-action=${`${kind}-leader`} accessible-label=${`${label} ${leader.name}`} ?pending=${this.busy === action} ?disabled=${this.#waiting(action)} @click=${click}>${label}</swc-button>`;
  }

  #leaderActions(port: NetworkPort, leader: Leader): TemplateResult | typeof nothing {
    if (leader.state === 'unlinked') return nothing;
    const off = leader.state === 'disconnected';
    const retry = leader.state === 'failed' && !!port.retryLeader;
    const reconnect = off && !!port.reconnectLeader;
    const disconnect = !off && !!port.disconnectLeader;
    if (!retry && !reconnect && !disconnect && !port.forgetLeader) return nothing;
    return html`<div class="actions">
      ${reconnect ? this.#leaderButton('reconnect', 'Reconnect', leader, () => this.#leaderAct('reconnect', leader, (id) => port.reconnectLeader?.(id))) : nothing}
      ${retry ? this.#leaderButton('retry', 'Retry', leader, () => this.#leaderAct('retry', leader, (id) => port.retryLeader?.(id))) : nothing}
      ${disconnect ? this.#leaderButton('disconnect', 'Disconnect', leader, () => this.#leaderAct('disconnect', leader, (id) => port.disconnectLeader?.(id))) : nothing}
      ${port.forgetLeader ? this.#leaderButton('forget', 'Forget', leader, (event) => this.#forgetLeader(event, port, leader)) : nothing}
    </div>`;
  }

  #leader(port: NetworkPort, leader: Leader): TemplateResult {
    const [variant, label] = leaderStates[leader.state];
    return html`<li class="device leader" data-leader=${leader.id} data-state=${leader.state}>
      <div class="who">
        <span class="name" title=${leader.name}>${leader.name}</span>
        <swc-status-light size="s" variant=${variant}>${label}</swc-status-light>
      </div>
      <span class="where">${leader.hub}</span>
      ${leader.state === 'failed' ? html`<p data-leader-error>${leader.error ?? 'Couldn’t reach its hub.'}</p>` : nothing}
      ${leader.state === 'unlinked' ? html`<p class="muted" data-unlinked>${leader.name} stopped sharing with this SLICC.</p>` : nothing}
      ${this.#leaderActions(port, leader)}
      ${
        this.leaderError && this.#leaderId === leader.id
          ? html`<div class="error" role="alert" data-error="leader"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.leaderError}</span></div>`
          : nothing
      }
    </li>`;
  }

  #leadersSection(port: NetworkPort, status: NetworkStatus): TemplateResult | typeof nothing {
    if (!status.leaders?.length) return nothing;
    return html`<section aria-labelledby="leaders" data-leaders=${status.leaders.length}>
      <h2 id="leaders">Leaders</h2>
      <ul aria-labelledby="leaders">${status.leaders.map((leader) => this.#leader(port, leader))}</ul>
    </section>`;
  }

  async #revoke(event: Event, port: GuestPort, seat: GuestSeat): Promise<void> {
    const trigger = event.currentTarget as HTMLElement;
    if (!(await confirm({ ...guestConfirm(seat), trigger }))) return;
    await this.#act(
      `guest:${seat.id}`,
      () => {
        this.#guestId = seat.id;
        return port.revoke(seat.id);
      },
      'guestError'
    );
  }

  #invite(event: Event, port: GuestPort): void {
    const agent = (this.model as SliccModel).agent;
    void invite({
      port,
      agents: agent.list(),
      active: agent.active(),
      trigger: event.currentTarget as HTMLElement,
    });
  }

  #seat(port: GuestPort, seat: GuestSeat, now: number): TemplateResult {
    const action = `guest:${seat.id}`;
    const cone = (this.model as SliccModel).agent.list().find((item) => item.id === seat.agentId);
    return html`<li class="device guest" data-seat=${seat.id} data-connected=${seat.connected ? 'true' : 'false'}>
      <div class="who">
        <span class="name" title=${seat.label}>${seat.label}</span>
        <swc-status-light size="s" variant=${seat.connected ? 'positive' : 'neutral'}>${seat.connected ? 'Connected' : 'Not connected'}</swc-status-light>
        ${seat.pending > 0 ? html`<swc-badge size="s" variant="notice" subtle data-pending=${seat.pending}><span aria-hidden="true">${seat.pending} waiting</span><span class="sr">${pendingLabel(seat.pending)}</span></swc-badge>` : nothing}
      </div>
      <swc-button size="s" variant="secondary" fill-style="outline" data-action="revoke-guest" accessible-label=${`Revoke ${seat.label}`} ?pending=${this.busy === action} ?disabled=${this.#waiting(action)} @click=${(event: Event) => this.#revoke(event, port, seat)}>Revoke</swc-button>
      <span class="where"><span data-seat-cone>on ${cone?.name ?? seat.agentId}</span><span data-expiry>${guestExpiry(seat, now)}</span></span>
      ${
        this.guestError && this.#guestId === seat.id
          ? html`<div class="error" role="alert" data-error="guest"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.guestError}</span></div>`
          : nothing
      }
    </li>`;
  }

  #guestsSection(): TemplateResult | typeof nothing {
    const port = this.model?.guests;
    if (!port) return nothing;
    const seats = port.list();
    const off = port.unavailable ? port.unavailable() : this.guestsOff;
    const cones = guestCones((this.model as SliccModel).agent.list()).length > 0;
    const now = Date.now();
    return html`<section aria-labelledby="guests" data-guests=${seats.length}>
      <div class="head">
        <h2 id="guests">Guests</h2>
        ${
          off
            ? html`<p class="muted" data-guests-unavailable>${off}</p>`
            : html`<swc-button size="m" variant="accent" data-action="invite-guest" ?disabled=${!cones} @click=${(event: Event) => this.#invite(event, port)}>Invite a guest</swc-button>`
        }
      </div>
      ${
        seats.length
          ? html`<ul aria-labelledby="guests">${seats.map((seat) => this.#seat(port, seat, now))}</ul>`
          : html`<p class="muted" data-guests-empty>No guests yet.</p>`
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
          ? html`<p data-browser=${automationOf(status.browser)}>${browserLine(status.browser, status)}${status.browser.detail ? html` <span class="detail">${status.browser.detail}</span>` : nothing}</p>`
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

  async #disconnect(tray: TrayPort, name: string, trigger: HTMLElement): Promise<void> {
    const ok = await confirm({
      title: `Disconnect from ${name}?`,
      body: 'This SLICC stops syncing with the tray until you reconnect.',
      action: 'Disconnect',
      variant: 'confirmation',
      trigger,
    });
    if (ok) tray.disconnect();
  }

  #sync(tray: TrayPort): TemplateResult {
    const status = tray.status();
    return html`<section aria-labelledby="sync" data-sync=${status.connection}>
      <div class="head">
        <h2 id="sync">Sync</h2>
        <swc-status-light variant=${connectionVariant[status.connection]}>${connectionLabel[status.connection]}</swc-status-light>
      </div>
      <dl class="node">
        <dt>Name</dt><dd>${status.name}</dd>
        <dt>Role</dt><dd>${status.role}</dd>
        <dt>Runs in</dt><dd>${status.kind}</dd>
        ${status.joinUrl ? this.#copyRow('tray-join', 'Join link', status.joinUrl, 'syncError', 'join link', true) : nothing}
      </dl>
      <h3 id="sync-followers">Followers</h3>
      ${
        status.followers.length
          ? html`<ul aria-labelledby="sync-followers" data-followers>${status.followers.map((follower) => html`<li data-follower=${follower.id}>${follower.name} <span class="muted">${follower.device}</span></li>`)}</ul>`
          : html`<p class="muted" data-followers>No one else is connected.</p>`
      }
      <div class="actions">${
        status.connection === 'offline'
          ? html`<swc-button size="m" variant="secondary" data-action="tray-reconnect" @click=${() => tray.reconnect()}>Reconnect</swc-button>`
          : html`<swc-button size="m" variant="secondary" data-action="tray-disconnect" @click=${(event: Event) => this.#disconnect(tray, status.name, event.currentTarget as HTMLElement)}>Disconnect</swc-button>`
      }</div>
      ${
        this.syncError
          ? html`<div class="error" role="alert" data-error="sync"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.syncError}</span></div>`
          : nothing
      }
    </section>`;
  }

  #ways(status: NetworkStatus): TemplateResult {
    return reach({
      intro:
        'Install the SLICC extension, or run slicc on this computer. Either one reaches every site.',
      extensionUrl: status.extensionUrl,
      copied: this.copied,
      uncopied: this.uncopied,
      copy: (text) => this.copy(text),
    });
  }

  #whole(status: NetworkStatus): TemplateResult {
    if (wholeWeb.has(routeOf(status))) {
      return html`<details ?open=${this.#open.has('whole')} @toggle=${this.#open.details('whole')}><summary>${chevron}Other ways to reach the whole web</summary><div>${this.#ways(status)}</div></details>`;
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
      return html`<div class="page" tabindex="-1">${this.model?.guests ? this.#guestsSection() : html`<p class="muted">Network information is not connected.</p>`}</div>`;
    }
    const status = networkStatus(port);
    return html`<div class="page" tabindex="-1">
      ${this.#state(port, status)}
      ${this.#sync((this.model as SliccModel).tray)}
      ${this.#leadersSection(port, status)}
      ${this.#guestsSection()}
      ${this.#tailnetSection(port, status)}
      ${this.#linksSection(port, status)}
      ${this.#whole(status)}
      ${this.#failures(status)}
    </div>`;
  }
}
