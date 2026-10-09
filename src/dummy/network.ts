import { Emitter } from '../model/emitter.ts';
import type { NetworkPort, NetworkStatus } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type NetworkScenario = 'ok' | 'limited' | 'failing';

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

export class DummyNetwork extends Emitter<{ network: NetworkStatus }> implements NetworkPort {
  scenario: NetworkScenario;
  #status: NetworkStatus;
  #clock: Clock;

  constructor(scenario: NetworkScenario, clock: Clock) {
    super();
    this.scenario = scenario;
    this.#status = networkFixtures(scenario);
    this.#clock = clock;
  }

  status(): NetworkStatus {
    return this.#status;
  }

  setScenario(scenario: NetworkScenario): void {
    this.scenario = scenario;
    this.#status = networkFixtures(scenario);
    this.emit('network', this.#status);
  }

  async check(): Promise<void> {
    await this.#clock.sleep(4);
    this.#status = networkFixtures(this.scenario);
    this.emit('network', this.#status);
  }
}
