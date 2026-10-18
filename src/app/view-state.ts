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

interface Spot {
  top: number;
  key: string | null;
  offset: number;
}

export interface ScrollOptions {
  scroller: () => HTMLElement | null;
  rows?: string;
  current?: string;
}

const gestures = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;

function keyOf(row: Element): string | null {
  return row.getAttribute('data-id') ?? row.getAttribute('data-path');
}

function within(row: Element, box: DOMRect): boolean {
  const rect = row.getBoundingClientRect();
  return rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom;
}

export class ViewScroll implements ReactiveController {
  #state: ViewState<{ spot: Spot | null }>;
  #options: ScrollOptions;
  #el: HTMLElement | null = null;
  #pending = false;
  #user = false;
  #resize = new ResizeObserver(() => {
    this.#pending = true;
    this.#restore();
  });
  #scrolled = (): void => this.#save();
  #gesture = (): void => {
    this.#user = true;
  };

  constructor(host: ViewHost, key: string, options: ScrollOptions) {
    this.#state = new ViewState(host, key, () => ({ spot: null }));
    this.#options = options;
    host.addController(this);
  }

  #rows(el: HTMLElement): Element[] {
    const rows = this.#options.rows;
    const found = rows ? [...(el.shadowRoot ?? el).querySelectorAll(rows)] : [];
    return found.filter((row) => keyOf(row) !== null);
  }

  #bind(el: HTMLElement | null): void {
    if (el === this.#el) return;
    const old = this.#el;
    for (const type of gestures) old?.removeEventListener(type, this.#gesture);
    old?.removeEventListener('scroll', this.#scrolled);
    this.#resize.disconnect();
    this.#el = el;
    this.#pending = true;
    this.#user = false;
    if (!el) return;
    for (const type of gestures) el.addEventListener(type, this.#gesture, { passive: true });
    el.addEventListener('scroll', this.#scrolled, { passive: true });
    this.#resize.observe(el);
  }

  #save(): void {
    const el = this.#el;
    if (!el?.clientHeight || (this.#pending && !this.#user)) return;
    this.#pending = false;
    this.#user = false;
    const box = el.getBoundingClientRect();
    const current = this.#options.current;
    const chosen = current
      ? ((el.shadowRoot ?? el).querySelector(current)?.closest('[data-id], [data-path]') ?? null)
      : null;
    const rows = this.#rows(el);
    const row =
      (chosen && within(chosen, box) ? chosen : null) ??
      rows.find((item) => within(item, box)) ??
      rows.find((item) => item.getBoundingClientRect().bottom > box.top);
    this.#state.value.spot = {
      top: el.scrollTop,
      key: row ? keyOf(row) : null,
      offset: row ? row.getBoundingClientRect().top - box.top : 0,
    };
  }

  #restore(): void {
    const el = this.#el;
    if (!el?.clientHeight || !this.#pending) return;
    const spot = this.#state.value.spot;
    if (!spot) {
      this.#pending = false;
      return;
    }
    const max = el.scrollHeight - el.clientHeight;
    const row = spot.key ? this.#rows(el).find((item) => keyOf(item) === spot.key) : undefined;
    let target = spot.top;
    if (row) {
      const rect = row.getBoundingClientRect();
      const offset = Math.min(spot.offset, Math.max(0, el.clientHeight - rect.height));
      target = el.scrollTop + rect.top - el.getBoundingClientRect().top - offset;
    }
    el.scrollTop = Math.min(target, max);
    if (target <= max + 1 && (row || !spot.key)) this.#pending = false;
  }

  hostUpdated(): void {
    const el = this.#options.scroller();
    this.#bind(el);
    if (!el) return;
    for (const child of (el.shadowRoot ?? el).children) this.#resize.observe(child);
    this.#restore();
  }

  hostDisconnected(): void {
    this.#bind(null);
  }
}
