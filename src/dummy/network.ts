import { Emitter } from '../model/emitter.ts';
import type {
  LinkedDevice,
  NetworkExit,
  NetworkLinks,
  NetworkPort,
  NetworkStatus,
  TailnetStatus,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type NetworkScenario = 'ok' | 'limited' | 'failing';
export type TailnetScenario = 'off' | 'needs-login' | 'running' | 'failed';
export type LinksScenario =
  | 'none'
  | 'preparing'
  | 'linked'
  | 'reconnecting'
  | 'exit'
  | 'prompt'
  | 'denied';

const minute = 60_000;

export function networkFixtures(scenario: NetworkScenario, now = Date.now()): NetworkStatus {
  const extensionUrl = 'https://extensions.example/slicc';
  if (scenario === 'ok') {
    return {
      route: 'proxy',
      health: 'ok',
      detail: 'slicc-node on localhost:5710 reaches every site.',
      failures: [],
      extensionUrl,
      browser: { via: 'proxy', detail: 'Chrome on localhost:9222.' },
    };
  }
  if (scenario === 'limited') {
    return {
      route: 'page',
      health: 'limited',
      detail: 'The page fetch, limited by CORS.',
      failures: [
        {
          url: 'https://api.tidewatch.example/v2/forecast?port=harbor',
          error: 'Blocked by CORS',
          at: now - 2 * minute,
        },
        {
          url: 'https://feeds.lighthouse.example/notices.xml',
          error: 'Blocked by CORS',
          at: now - 14 * minute,
        },
      ],
      extensionUrl,
      browser: { via: null },
    };
  }
  return {
    route: null,
    health: 'failing',
    detail: 'No route answered. The last request timed out.',
    failures: [
      {
        url: 'https://registry.harbor.example/agent',
        error: 'Timed out after 30 s',
        at: now - 40_000,
      },
      {
        url: 'https://docs.tidewatch.example/',
        error: 'Network unreachable',
        at: now - 3 * minute,
      },
      {
        url: 'https://api.tidewatch.example/v2/tides',
        error: 'Network unreachable',
        at: now - 75 * minute,
      },
    ],
    extensionUrl,
    browser: { via: null },
  };
}

const exitNodes = [
  { id: 'nKeel1CNTRL', name: 'keel-router', online: true },
  { id: 'nMast2CNTRL', name: 'mast-pi', online: true },
  { id: 'nBuoy3CNTRL', name: 'buoy-laptop', online: false },
];

export function tailnetFixtures(scenario: TailnetScenario): TailnetStatus {
  const base = { exitNode: null, exitNodes: [], autoExitNode: false, shieldsUp: true };
  if (scenario === 'needs-login') {
    return { ...base, state: 'needs-login', loginUrl: 'https://login.tailnet.example/a/7f3c2e' };
  }
  if (scenario === 'running') {
    return {
      ...base,
      state: 'running',
      node: { name: 'slicc-harbor', addresses: ['fd7a:115c:a1e0::7', '100.64.12.7'] },
      exitNodes,
      peers: 4,
    };
  }
  if (scenario === 'failed') {
    return {
      ...base,
      state: 'failed',
      detail: 'The coordination server didn’t answer. Check the connection and try again.',
    };
  }
  return { ...base, state: 'off' };
}

const linkedDevices: readonly LinkedDevice[] = [
  {
    id: 'link-quay',
    name: 'slicc on quay-studio',
    host: 'quay-studio.slicc.internal',
    address: '198.18.57.11',
    mode: 'local',
    offers: ['net', 'http', 'ssh'],
    policy: 'every public address, this machine, and the local network',
    exit: true,
    state: 'connected',
  },
  {
    id: 'link-pier',
    name: 'slicc on pier-nuc',
    host: 'pier-nuc.slicc.internal',
    address: '198.18.57.12',
    mode: 'remote',
    offers: ['net', 'ssh'],
    policy: 'every public address and the local network',
    exit: true,
    state: 'connected',
  },
  {
    id: 'link-dock',
    name: 'slicc on dock-builder',
    host: 'dock-builder.slicc.internal',
    address: '198.18.57.13',
    mode: 'remote',
    offers: ['http'],
    policy: 'this machine',
    exit: false,
    state: 'connected',
  },
];

export function joinUrl(rotation = 0): string {
  return `https://join.slicc.example/l/${rotation ? `r${rotation}-` : ''}7Hq2kd9FXw3m`;
}

export function linksFixtures(
  scenario: LinksScenario,
  rotation = 0
): { links: NetworkLinks; exit: NetworkExit } {
  const url = joinUrl(rotation);
  const base = { joinUrl: url, joinCommand: `npx sliccy ${url} follow`, permission: null };
  if (scenario === 'preparing') {
    return { links: { ...base, joinUrl: null, joinCommand: null, devices: [] }, exit: null };
  }
  if (scenario === 'none') return { links: { ...base, devices: [] }, exit: null };
  if (scenario === 'prompt') {
    return { links: { ...base, devices: [], permission: 'prompt' }, exit: null };
  }
  if (scenario === 'denied') {
    return { links: { ...base, devices: [], permission: 'denied' }, exit: null };
  }
  if (scenario === 'reconnecting') {
    const devices = linkedDevices.map((device) =>
      device.id === 'link-pier' ? { ...device, state: 'reconnecting' as const } : device
    );
    return { links: { ...base, devices }, exit: { kind: 'link', id: 'link-pier' } };
  }
  return {
    links: { ...base, devices: linkedDevices },
    exit: scenario === 'exit' ? { kind: 'link', id: 'link-quay' } : null,
  };
}

export class DummyNetwork extends Emitter<{ network: NetworkStatus }> implements NetworkPort {
  scenario: NetworkScenario;
  #base: NetworkStatus;
  #status: NetworkStatus;
  #clock: Clock;
  #tailnet: TailnetStatus | undefined;
  #links: NetworkLinks | undefined;
  #exit: NetworkExit = null;
  #rotation = 0;
  setExit?: (exit: NetworkExit) => Promise<void>;
  unlink?: (id: string) => Promise<void>;
  rotateJoinUrl?: () => Promise<void>;
  retryLinks?: () => Promise<void>;

  constructor(
    scenario: NetworkScenario,
    clock: Clock,
    tailnet?: TailnetScenario,
    links?: LinksScenario
  ) {
    super();
    this.scenario = scenario;
    this.#clock = clock;
    this.#tailnet = tailnet ? tailnetFixtures(tailnet) : undefined;
    if (links) {
      ({ links: this.#links, exit: this.#exit } = linksFixtures(links));
      this.setExit = (exit) => this.#setExit(exit);
      this.unlink = (id) => this.#unlink(id);
      this.rotateJoinUrl = () => this.#rotate();
      this.retryLinks = () => this.#retry();
    }
    this.#base = networkFixtures(scenario);
    this.#status = this.#with(this.#base);
  }

  #with(status: NetworkStatus): NetworkStatus {
    const linked = this.#links ? { ...status, links: this.#links, exit: this.#exit } : status;
    const exit = this.#exit;
    const device =
      exit?.kind === 'link' ? this.#links?.devices.find((item) => item.id === exit.id) : undefined;
    const routed = this.#withTailnet(linked);
    if (!device) return routed;
    return { ...routed, health: device.state === 'connected' ? 'ok' : 'failing', detail: null };
  }

  #withTailnet(status: NetworkStatus): NetworkStatus {
    const tailnet = this.#tailnet;
    if (!tailnet) return status;
    const exit = tailnet.state === 'running' ? tailnet.exitNode : null;
    if (!exit) return { ...status, tailnet };
    return {
      ...status,
      route: 'tailnet',
      health: 'ok',
      detail: `${exit} carries everything except this computer’s own services.`,
      tailnet,
    };
  }

  #set(tailnet: TailnetStatus): void {
    this.#tailnet = tailnet;
    this.#emit();
  }

  #emit(): void {
    this.#status = this.#with(this.#base);
    this.emit('network', this.#status);
  }

  setLinks(scenario: LinksScenario): void {
    ({ links: this.#links, exit: this.#exit } = linksFixtures(scenario, this.#rotation));
    this.#emit();
  }

  async #setExit(exit: NetworkExit): Promise<void> {
    await this.#clock.sleep(4);
    const links = this.#links as NetworkLinks;
    if (exit?.kind === 'link') {
      const device = links.devices.find((item) => item.id === exit.id);
      if (!device?.exit || device.state !== 'connected') {
        throw new Error('That device can’t carry internet traffic right now.');
      }
    }
    if (this.#tailnet) {
      const node = exit?.kind === 'tailnet' ? exit.node : null;
      await this.setExitNode(node);
    }
    this.#exit = exit;
    this.#emit();
  }

  async #unlink(id: string): Promise<void> {
    await this.#clock.sleep(4);
    const links = this.#links as NetworkLinks;
    this.#links = { ...links, devices: links.devices.filter((device) => device.id !== id) };
    if (this.#exit?.kind === 'link' && this.#exit.id === id) this.#exit = null;
    this.#emit();
  }

  async #rotate(): Promise<void> {
    await this.#clock.sleep(4);
    this.#rotation += 1;
    const url = joinUrl(this.#rotation);
    this.#links = {
      ...(this.#links as NetworkLinks),
      joinUrl: url,
      joinCommand: `npx sliccy ${url} follow`,
    };
    this.#emit();
  }

  async #retry(): Promise<void> {
    await this.#clock.sleep(4);
    const links = this.#links as NetworkLinks;
    const devices = links.devices.length ? links.devices : linkedDevices.slice(0, 1);
    this.#links = { ...links, permission: null, devices };
    this.#emit();
  }

  status(): NetworkStatus {
    return this.#status;
  }

  setScenario(scenario: NetworkScenario): void {
    this.scenario = scenario;
    this.#base = networkFixtures(scenario);
    this.#status = this.#with(this.#base);
    this.emit('network', this.#status);
  }

  async check(): Promise<void> {
    await this.#clock.sleep(4);
    if (this.#tailnet?.state === 'failed') this.#tailnet = tailnetFixtures('running');
    this.#base = networkFixtures(this.scenario);
    this.#status = this.#with(this.#base);
    this.emit('network', this.#status);
  }

  async setTailnet(on: boolean): Promise<void> {
    await this.#clock.sleep(4);
    this.#set(tailnetFixtures(on ? 'needs-login' : 'off'));
  }

  async submitAuthKey(key: string): Promise<void> {
    if (!key.startsWith('tskey-')) {
      throw new Error('That isn’t a Tailscale auth key. Auth keys start with tskey-.');
    }
    this.#set({ ...tailnetFixtures('off'), state: 'starting', detail: 'Joining your tailnet…' });
    await this.#clock.sleep(8);
    this.#set(tailnetFixtures('running'));
  }

  async setExitNode(id: string | null): Promise<void> {
    await this.#clock.sleep(4);
    const tailnet = this.#tailnet ?? tailnetFixtures('running');
    const nodes = tailnet.exitNodes ?? [];
    if (id === 'auto') {
      const node = nodes.find((item) => item.online);
      this.#set({ ...tailnet, autoExitNode: true, exitNode: node?.name ?? null });
      return;
    }
    const node = nodes.find((item) => item.id === id);
    if (id && !node?.online) throw new Error('That exit node is offline.');
    this.#set({ ...tailnet, autoExitNode: false, exitNode: node?.name ?? null });
  }

  async logoutTailnet(): Promise<void> {
    await this.#clock.sleep(4);
    this.#set(tailnetFixtures('needs-login'));
  }
}
