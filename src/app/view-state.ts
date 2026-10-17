import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { SliccModel } from '../model/types.ts';

interface Slot {
  value: unknown;
  listeners: Set<() => void>;
}

export type ViewHost = ReactiveControllerHost & { model: SliccModel | null };

const stores = new WeakMap<object, Map<string, Slot>>();
const loose = {};

function slotOf(model: SliccModel | null, key: string, initial: () => unknown): Slot {
  const owner = model ?? loose;
  const slots = stores.get(owner) ?? new Map<string, Slot>();
  stores.set(owner, slots);
  const found = slots.get(key);
  if (found) return found;
  const slot: Slot = { value: initial(), listeners: new Set() };
  slots.set(key, slot);
  return slot;
}

export class ViewState<T> implements ReactiveController {
  #host: ViewHost;
  #key: string;
  #initial: (model: SliccModel | null) => T;
  #watched: Slot | null = null;
  #connected = false;
  #listener = () => this.#host.requestUpdate();

  constructor(host: ViewHost, key: string, initial: (model: SliccModel | null) => T) {
    this.#host = host;
    this.#key = key;
    this.#initial = initial;
    host.addController(this);
  }

  #slot(): Slot {
    const model = this.#host.model;
    return slotOf(model, this.#key, () => this.#initial(model));
  }

  get value(): T {
    return this.#slot().value as T;
  }

  set value(value: T) {
    const slot = this.#slot();
    if (Object.is(slot.value, value)) return;
    slot.value = value;
    for (const listener of [...slot.listeners]) listener();
  }

  #watch(): void {
    const slot = this.#slot();
    if (slot === this.#watched) return;
    this.#unwatch();
    slot.listeners.add(this.#listener);
    this.#watched = slot;
  }

  #unwatch(): void {
    this.#watched?.listeners.delete(this.#listener);
    this.#watched = null;
  }

  hostConnected(): void {
    this.#connected = true;
    this.#watch();
  }

  hostUpdate(): void {
    if (this.#connected) this.#watch();
  }

  hostDisconnected(): void {
    this.#connected = false;
    this.#unwatch();
  }
}

export class ViewSet extends ViewState<ReadonlySet<string>> {
  constructor(
    host: ViewHost,
    key: string,
    initial: (model: SliccModel | null) => Iterable<string> = () => []
  ) {
    super(host, key, (model) => new Set(initial(model)));
  }

  has(id: string): boolean {
    return this.value.has(id);
  }

  toggle(id: string, open = !this.has(id)): void {
    if (open === this.has(id)) return;
    const next = new Set(this.value);
    if (open) next.add(id);
    else next.delete(id);
    this.value = next;
  }

  details(id: string): (event: Event) => void {
    return (event) => this.toggle(id, (event.currentTarget as HTMLDetailsElement).open);
  }
}
