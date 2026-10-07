import { Emitter } from '../model/emitter.ts';

export const dipType = 'application/x-slicc-sprinkle';

export class Dips extends Emitter<{ change: readonly string[] }> {
  key = 'slicc-ui.dips';
  #out = new Set<string>();
  #storage: Storage | null = null;

  load(storage: Storage | null): void {
    this.#storage = storage;
    try {
      const saved = JSON.parse(storage?.getItem(this.key) ?? '[]');
      this.#out = new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
    } catch {
      this.#out = new Set();
    }
    this.emit('change', this.list());
  }

  list(): readonly string[] {
    return [...this.#out];
  }

  has(id: string): boolean {
    return this.#out.has(id);
  }

  detach(id: string): void {
    if (this.#out.has(id)) return;
    this.#out.add(id);
    this.#storage?.setItem(this.key, JSON.stringify(this.list()));
    this.emit('change', this.list());
  }
}

export function dipsOf(node: Node): Dips | null {
  let current: Node | null = node;
  while (current) {
    const found = (current as Node & { dips?: unknown }).dips;
    if (found instanceof Dips) return found;
    current = current.parentNode ?? (current as ShadowRoot).host ?? null;
  }
  return null;
}
