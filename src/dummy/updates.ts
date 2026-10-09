import { Emitter } from '../model/emitter.ts';
import type { UpdateAction, UpdateItem, UpdateKind, UpdatesPort } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type UpdateScenario = 'current' | 'boot' | 'starting' | 'available' | 'restart' | 'failure';

const checkedAt = Date.UTC(2026, 9, 8, 8, 42);

export function updateFixtures(scenario: UpdateScenario): readonly UpdateItem[] {
  const components: readonly [UpdateKind, string, string][] = [
    ['bios', 'BIOS packages', '0.8.2'],
    ['kernel', 'Kernel', '1.12.0'],
    ['agent', 'Agent (/opt/agent)', '0.24.0'],
    ['grammars', 'Syntax grammars', '4.5.0'],
    ['global', 'Global pnpm packages', '2.3.0'],
    ['skills', 'Skills', '1.6.0'],
  ];
  const items: UpdateItem[] = components.map(([kind, label, version]) => ({
    id: kind,
    label,
    kind,
    state: 'current',
    progress: null,
    from: version,
    to: version,
    checkedAt,
    error: null,
    actions: [],
  }));
  const agent = items[2];
  if (scenario === 'boot') {
    Object.assign(agent, {
      state: 'downloading',
      from: null,
      progress: { phase: 'download', done: 63, total: 95 },
      log: 'Packages: +95\nProgress: resolved 95, reused 0, downloaded 63, added 0\nDownloading @slicc/demo-agent...',
    });
    Object.assign(items[3], {
      state: 'linking',
      progress: { phase: 'link', done: 12, total: 15 },
      log: 'Linking syntax grammars\nProgress: linked 12 of 15',
    });
    items[4].state = 'checking';
    Object.assign(items[5], { state: 'queued', from: null });
  } else if (scenario === 'starting') {
    agent.state = 'starting';
  } else if (scenario === 'available' || scenario === 'restart') {
    Object.assign(agent, {
      state: scenario === 'available' ? 'available' : 'ready',
      to: '0.25.0',
      actions: [scenario === 'available' ? 'update-now' : 'restart-agent'],
      log:
        scenario === 'restart'
          ? 'Packages: +95\nProgress: resolved 95, downloaded 95, added 95\nDone in 48.2s'
          : undefined,
    });
    Object.assign(items[1], { state: 'ready', to: '1.13.0', actions: ['reload'] });
  } else if (scenario === 'failure') {
    Object.assign(items[4], {
      state: 'failed',
      to: '2.4.0',
      error: 'The package registry did not respond. Installed commands are still available.',
      actions: ['retry'],
      log: 'pnpm add -g @harbor/demo-cli@2.4.0\nERR_PNPM_FETCH_TIMEOUT Request timed out after 30000ms',
    });
  }
  return items;
}

export class DummyUpdates extends Emitter<{ items: readonly UpdateItem[] }> implements UpdatesPort {
  #items: readonly UpdateItem[];
  #ready: boolean;
  #clock: Clock;

  constructor(scenario: UpdateScenario, clock: Clock) {
    super();
    this.#items = updateFixtures(scenario);
    this.#ready = scenario !== 'boot' && scenario !== 'starting';
    this.#clock = clock;
  }

  list(): readonly UpdateItem[] {
    return this.#items;
  }

  ready(): boolean {
    return this.#ready;
  }

  setScenario(scenario: UpdateScenario): void {
    this.#items = updateFixtures(scenario);
    this.#ready = scenario !== 'boot' && scenario !== 'starting';
    this.emit('items', this.#items);
  }

  #patch(id: string, patch: Partial<UpdateItem>): void {
    this.#items = this.#items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    this.emit('items', this.#items);
  }

  async act(id: string, action: UpdateAction): Promise<void> {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item?.actions.includes(action)) throw new Error(`Update action unavailable: ${id}`);
    if (action === 'update-now' || action === 'retry') {
      this.#patch(id, {
        state: 'downloading',
        progress: { phase: 'download', done: 0, total: 95 },
        error: null,
        actions: [],
        log: 'Packages: +95\nProgress: resolved 95, downloaded 0, added 0',
      });
      await this.#clock.sleep(4);
      this.#patch(id, {
        state: 'linking',
        progress: { phase: 'link', done: 95, total: 95 },
        log: 'Packages: +95\nProgress: resolved 95, downloaded 95, added 95',
      });
      await this.#clock.sleep(2);
    }
    const apply = action === 'update-now' && ['agent', 'bios', 'kernel', 'ui'].includes(item.kind);
    this.#patch(id, {
      state: apply ? 'ready' : 'installed',
      from: apply ? item.from : item.to,
      progress: null,
      checkedAt,
      actions: apply ? [item.kind === 'agent' ? 'restart-agent' : 'reload'] : [],
    });
  }
}
