import { Emitter } from '../model/emitter.ts';
import type { TabsPort, TabsState } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type TabsScenario =
  | 'owner'
  | 'follower'
  | 'connecting'
  | 'stalled'
  | 'newer'
  | 'older'
  | 'alone';

export function tabsFixtures(scenario: TabsScenario): TabsState {
  if (scenario === 'stalled') return { role: 'follower', stalled: true, skew: null };
  if (scenario === 'newer' || scenario === 'older')
    return { role: 'follower', stalled: false, skew: scenario };
  return { role: scenario, stalled: false, skew: null };
}

export class DummyTabs extends Emitter<{ tabs: TabsState }> implements TabsPort {
  #state: TabsState;
  #time: Clock;
  reloads = 0;

  constructor(scenario: TabsScenario, time: Clock) {
    super();
    this.#state = tabsFixtures(scenario);
    this.#time = time;
  }

  state(): TabsState {
    return { ...this.#state };
  }

  setScenario(scenario: TabsScenario): void {
    this.#state = tabsFixtures(scenario);
    this.emit('tabs', this.state());
  }

  reload(): void {
    this.reloads++;
    this.setScenario('connecting');
    void this.#time.sleep(20).then(() => this.setScenario('follower'));
  }
}
