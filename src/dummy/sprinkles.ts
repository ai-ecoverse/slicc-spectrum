import { Emitter } from '../model/emitter.ts';
import type { Sprinkle, SprinkleEvents, SprinklePort } from '../model/types.ts';
import type { DummyAgent } from './agent.ts';

export class DummySprinkles extends Emitter<SprinkleEvents> implements SprinklePort {
  #sprinkles: Sprinkle[];
  #agent: DummyAgent;

  constructor(sprinkles: readonly Sprinkle[], agent: DummyAgent) {
    super();
    this.#sprinkles = sprinkles.map((sprinkle) => ({ ...sprinkle }));
    this.#agent = agent;
  }

  list(): readonly Sprinkle[] {
    return this.#sprinkles.map((sprinkle) => ({ ...sprinkle }));
  }

  send(id: string, payload: unknown): void {
    const sprinkle = this.#sprinkles.find((candidate) => candidate.id === id);
    if (!sprinkle) return;
    const data = (payload ?? {}) as { event?: string; detail?: string | null };
    const what = data.event
      ? `“${data.event}”${data.detail ? ` (${data.detail})` : ''}`
      : 'an event';
    this.#agent.lick(
      sprinkle.agentId,
      'sprinkle',
      sprinkle.title,
      `Sent ${what}`,
      JSON.stringify(payload, null, 2)
    );
  }
}
