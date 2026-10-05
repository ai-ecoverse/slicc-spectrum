import { Emitter } from '../model/emitter.ts';
import type { Memory, MemoryDraft, MemoryEvents, MemoryPort } from '../model/types.ts';

export class DummyMemory extends Emitter<MemoryEvents> implements MemoryPort {
  #memories: Memory[];
  #next = 1;

  constructor(memories: readonly Memory[]) {
    super();
    this.#memories = memories.map((memory) => ({ ...memory }));
  }

  list(): readonly Memory[] {
    return this.#memories.map((memory) => ({ ...memory }));
  }

  save(draft: MemoryDraft): Memory {
    const memory: Memory = {
      ...draft,
      id: draft.id ?? `mem-new-${this.#next++}`,
      updatedAt: Date.now(),
    };
    const index = this.#memories.findIndex((candidate) => candidate.id === memory.id);
    if (index < 0) this.#memories.push(memory);
    else this.#memories[index] = memory;
    this.emit('memories', this.list());
    return { ...memory };
  }

  remove(id: string): void {
    this.#memories = this.#memories.filter((memory) => memory.id !== id);
    this.emit('memories', this.list());
  }
}
