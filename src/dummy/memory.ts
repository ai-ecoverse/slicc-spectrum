import { Emitter } from '../model/emitter.ts';
import type { Memory, MemoryDraft, MemoryEvents, MemoryPort, MemoryScope } from '../model/types.ts';

export class DummyMemory extends Emitter<MemoryEvents> implements MemoryPort {
  #memories: Memory[];
  #scopes: () => readonly MemoryScope[];
  #next = 1;

  constructor(
    memories: readonly Memory[],
    scopes: () => readonly MemoryScope[] = () => [{ id: 'global', label: 'Everyone' }]
  ) {
    super();
    this.#memories = memories.map((memory) => ({ ...memory }));
    this.#scopes = scopes;
  }

  scopes(): readonly MemoryScope[] {
    return this.#scopes();
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
