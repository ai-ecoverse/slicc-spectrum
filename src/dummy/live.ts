import { Emitter } from '../model/emitter.ts';
import type { LiveItem, LivePort, Switch, SwitchesPort } from '../model/types.ts';

export type LiveScenario = 'screen' | 'both' | 'ended' | 'empty';

export function liveFixtures(scenario: LiveScenario, now = Date.now()): LiveItem[] {
  if (scenario === 'empty') return [];
  const screen: LiveItem = {
    id: 'live-screen',
    kind: 'screen',
    label: 'Recording screen',
    what: 'Entire screen',
    asker: 'sliccy',
    since: now - 42_000,
    action: { label: 'Stop' },
  };
  if (scenario === 'screen') return [screen];
  const microphone: LiveItem = {
    id: 'live-microphone',
    kind: 'microphone',
    label: 'Recording microphone',
    what: 'Desk microphone',
    asker: 'Seat 2 (Mara) via docs-pass',
    since: now - 7_000,
    action: { label: 'Stop' },
  };
  if (scenario === 'ended') {
    return [
      screen,
      {
        ...microphone,
        endedAt: now - 1_000,
        action: { label: 'Dismiss' },
      },
    ];
  }
  return [screen, microphone];
}

export class DummyLive extends Emitter<{ items: readonly LiveItem[] }> implements LivePort {
  #items: LiveItem[];
  acted: string[] = [];

  constructor(scenario: LiveScenario) {
    super();
    this.#items = liveFixtures(scenario);
  }

  items(): readonly LiveItem[] {
    return [...this.#items];
  }

  add(item: LiveItem): void {
    this.#items = [...this.#items.filter(({ id }) => id !== item.id), item];
    this.emit('items', this.items());
  }

  act(id: string): void {
    this.acted.push(id);
    this.#items = this.#items.filter((item) => item.id !== id);
    this.emit('items', this.items());
  }
}

export const switchFixtures: readonly Switch[] = [
  { key: 'camera', label: 'Camera', on: true },
  { key: 'microphone', label: 'Microphone', on: true },
  { key: 'screen', label: 'Screen', on: true },
];

export class DummySwitches
  extends Emitter<{ switches: readonly Switch[] }>
  implements SwitchesPort
{
  #list: Switch[] = switchFixtures.map((item) => ({ ...item }));
  sets: Array<[string, boolean]> = [];

  list(): readonly Switch[] {
    return this.#list.map((item) => ({ ...item }));
  }

  set(key: string, on: boolean): void {
    this.sets.push([key, on]);
    this.#list = this.#list.map((item) => (item.key === key ? { ...item, on } : item));
    this.emit('switches', this.list());
  }
}
