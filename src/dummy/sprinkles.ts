import { Emitter } from '../model/emitter.ts';
import type {
  FilePort,
  Sprinkle,
  SprinkleEvents,
  SprinkleMethod,
  SprinklePort,
} from '../model/types.ts';
import type { DummyAgent } from './agent.ts';

export function homePath(path: unknown): string {
  const text = String(path);
  const mapped = text.startsWith('/shared/') ? `/home/${text.slice('/shared/'.length)}` : text;
  const parts = mapped.split('/');
  if (!mapped.startsWith('/home/') || parts.some((part) => part === '.' || part === '..'))
    throw new Error(`EACCES: ${text} is outside /home`);
  return mapped;
}

export class DummySprinkles extends Emitter<SprinkleEvents> implements SprinklePort {
  #sprinkles: Sprinkle[];
  #agent: DummyAgent;
  #files: FilePort;
  #state = new Map<string, unknown>();

  constructor(sprinkles: readonly Sprinkle[], agent: DummyAgent, files: FilePort) {
    super();
    this.#sprinkles = sprinkles.map((sprinkle) => ({ ...sprinkle }));
    this.#agent = agent;
    this.#files = files;
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

  async call(id: string, method: SprinkleMethod, args: readonly unknown[]): Promise<unknown> {
    if (method === 'getState') return structuredClone(this.#state.get(id) ?? null);
    if (method === 'setState') {
      this.#state.set(id, structuredClone(args[0] ?? null));
      return undefined;
    }
    const path = homePath(args[0]);
    if (method === 'exists') return (await this.#files.list()).some((entry) => entry.path === path);
    return this.#files.read(path);
  }
}
