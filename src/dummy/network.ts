import { Emitter } from '../model/emitter.ts';
import type { NetworkPort, NetworkStatus, TailnetStatus } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type NetworkScenario = 'ok' | 'limited' | 'failing';
export type TailnetScenario = 'off' | 'needs-login' | 'running' | 'failed';

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

export class DummyNetwork extends Emitter<{ network: NetworkStatus }> implements NetworkPort {
  scenario: NetworkScenario;
  #base: NetworkStatus;
  #status: NetworkStatus;
  #clock: Clock;
  #tailnet: TailnetStatus | undefined;

  constructor(scenario: NetworkScenario, clock: Clock, tailnet?: TailnetScenario) {
    super();
    this.scenario = scenario;
    this.#clock = clock;
    this.#tailnet = tailnet ? tailnetFixtures(tailnet) : undefined;
    this.#base = networkFixtures(scenario);
    this.#status = this.#with(this.#base);
  }

  #with(status: NetworkStatus): NetworkStatus {
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
    this.#status = this.#with(this.#base);
    this.emit('network', this.#status);
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
