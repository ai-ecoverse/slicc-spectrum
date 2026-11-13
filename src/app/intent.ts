import { guard } from './guard.ts';

export const intentLimit = 80;
export const intentHold = 1000;

export function intentText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.replace(/[\p{Cc}\s]+/gu, ' ').trim();
  const plain = raw
    .replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  const cut = guard(plain);
  const text = cut === plain ? raw : cut;
  if (text.length <= intentLimit) return text;
  return `${text.slice(0, intentLimit - 2).trimEnd()} …`;
}

interface Held {
  shown: string;
  at: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class IntentHold {
  #held = new Map<string, Held>();
  #changed: () => void;

  constructor(changed: () => void) {
    this.#changed = changed;
  }

  shown(key: string): string {
    return this.#held.get(key)?.shown ?? '';
  }

  set(key: string, wanted: string, now = performance.now()): boolean {
    const held = this.#held.get(key);
    if (!held) {
      this.#held.set(key, { shown: wanted, at: now });
      return !!wanted;
    }
    if (wanted === held.shown) {
      this.#cancel(held);
      return false;
    }
    const wait = held.at + intentHold - now;
    if (!held.shown || wait <= 0) {
      this.#cancel(held);
      held.shown = wanted;
      held.at = now;
      return true;
    }
    held.timer ??= setTimeout(() => {
      held.timer = undefined;
      this.#changed();
    }, wait);
    return false;
  }

  keep(keys: ReadonlySet<string>): void {
    for (const [key, held] of this.#held)
      if (!keys.has(key)) {
        this.#cancel(held);
        this.#held.delete(key);
      }
  }

  clear(): void {
    this.keep(new Set());
  }

  #cancel(held: Held): void {
    clearTimeout(held.timer);
    held.timer = undefined;
  }
}
