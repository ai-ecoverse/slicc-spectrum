import { css, html, type TemplateResult } from 'lit';

export const toScroll = 'Scroll to the end of the command to allow it.';

export const endCss = css`
  .command .end {
    display: inline-block;
    inline-size: 0;
    block-size: 0;
  }
`;

export const end = (id: string): TemplateResult => html`<span class="end" data-end=${id}></span>`;

export class Ends {
  #seen = new Set<string>();
  #looked = new Set<string>();
  #root: () => ParentNode;
  #changed: () => void;
  #observer = new IntersectionObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.end as string;
      if (!this.#looked.has(id)) {
        this.#looked.add(id);
        changed = true;
      }
      if (!entry.isIntersecting || this.#seen.has(id)) continue;
      this.#seen.add(id);
      changed = true;
    }
    if (changed) this.#changed();
  });

  constructor(root: () => ParentNode, changed: () => void) {
    this.#root = root;
    this.#changed = changed;
  }

  has(id: string): boolean {
    return this.#seen.has(id);
  }

  hidden(id: string): boolean {
    return this.#looked.has(id) && !this.#seen.has(id);
  }

  clear(): void {
    this.#seen.clear();
    this.#looked.clear();
  }

  forget(id: string): void {
    this.#seen.delete(id);
    this.#looked.delete(id);
  }

  observe(): void {
    for (const end of this.#root().querySelectorAll<HTMLElement>('[data-end]'))
      this.#observer.observe(end);
  }

  disconnect(): void {
    this.#observer.disconnect();
  }
}

export class Arming {
  #ms: () => number;
  #changed = 0;
  #pressed = 0;
  #layout = '';

  constructor(ms: () => number) {
    this.#ms = ms;
  }

  arm(): void {
    this.#changed = performance.now();
  }

  press = (): void => {
    this.#pressed = performance.now();
  };

  settled(at = performance.now()): boolean {
    return at - this.#changed >= this.#ms();
  }

  counts(event: MouseEvent): boolean {
    return this.settled(event.detail ? this.#pressed : performance.now());
  }

  watch(layout: string): void {
    if (layout === this.#layout) return;
    this.#layout = layout;
    this.arm();
  }

  forget(): void {
    this.#layout = '';
  }
}

export function layout(
  buttons: readonly HTMLElement[],
  head: readonly unknown[] = [],
  frame?: HTMLElement | null
): string {
  const box = frame?.getBoundingClientRect();
  const x = box ? box.left - (frame as HTMLElement).scrollLeft : 0;
  const y = box ? box.top - (frame as HTMLElement).scrollTop : 0;
  return JSON.stringify([
    ...head,
    box ? [box.left, box.top].map(Math.round) : null,
    buttons.map((button) => {
      const { left, top, width, height } = button.getBoundingClientRect();
      return [
        button.closest<HTMLElement>('[data-id]')?.dataset.id ?? null,
        button.dataset.action,
        button.textContent,
        button.hasAttribute('disabled'),
        button.hasAttribute('pending'),
        ...(width || height ? [left - x, top - y, width, height].map(Math.round) : []),
      ];
    }),
  ]);
}
