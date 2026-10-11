import { Emitter } from '../model/emitter.ts';
import type { FollowPort, FollowState } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type FollowScenario =
  | 'connecting'
  | 'waiting'
  | 'watch'
  | 'control'
  | 'full'
  | 'reconnecting'
  | 'unlinked'
  | 'failed';

const owner = 'SLICC on quay-studio';
const name = 'SLICC on reef-phone';

export function followFixtures(scenario: FollowScenario): FollowState {
  const none = { view: false, control: false, terminal: false };
  const full = { view: true, control: true, terminal: true };
  const base = { owner, name };
  if (scenario === 'connecting') return { ...base, link: 'connecting', access: none };
  if (scenario === 'waiting') return { ...base, link: 'connected', access: none };
  if (scenario === 'watch') return { ...base, link: 'connected', access: { ...none, view: true } };
  if (scenario === 'control')
    return { ...base, link: 'connected', access: { ...full, terminal: false } };
  if (scenario === 'reconnecting') return { ...base, link: 'reconnecting', access: full };
  if (scenario === 'unlinked') return { ...base, link: 'unlinked', access: none };
  if (scenario === 'failed')
    return {
      ...base,
      link: 'failed',
      access: none,
      error: `The tray couldn’t reach ${owner}. It may be closed or offline.`,
    };
  return { ...base, link: 'connected', access: full };
}

export class DummyFollow extends Emitter<{ follow: FollowState }> implements FollowPort {
  #state: FollowState;
  #time: Clock;
  left = 0;

  constructor(scenario: FollowScenario, time: Clock) {
    super();
    this.#state = followFixtures(scenario);
    this.#time = time;
  }

  state(): FollowState {
    return this.#state;
  }

  setScenario(scenario: FollowScenario): void {
    this.#state = followFixtures(scenario);
    this.emit('follow', this.#state);
  }

  async leave(): Promise<void> {
    await this.#time.sleep(4);
    this.left++;
  }

  async retry(): Promise<void> {
    this.setScenario('connecting');
    await this.#time.sleep(20);
    this.setScenario('full');
  }
}
