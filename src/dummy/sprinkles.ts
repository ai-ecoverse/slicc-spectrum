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
    const data = (payload ?? {}) as { action?: string; data?: unknown };
    this.#agent.lick(
      sprinkle.agentId,
      'sprinkle',
      sprinkle.title,
      data.action || 'event',
      JSON.stringify(data.data ?? null, null, 2)
    );
  }
}
