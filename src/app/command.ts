import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-down.js';
import { css, html, nothing, type TemplateResult } from 'lit';

export const toShow = 'Show the full command to allow it.';
export const toScroll = 'Scroll to the end of the command to allow it.';

export const clampCss = css`
  .command [data-clamp] {
    display: block;
    max-block-size: 4lh;
    overflow: hidden;
  }
  .full-command .chevron {
    transition: transform var(--swc-animation-duration-100) var(--swc-animation-ease-out);
  }
  .full-command[data-shown] .chevron {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .full-command .chevron {
      transition: none;
    }
  }
`;

export class Cuts {
  #cuts = new Map<string, boolean>();
  #root: () => ParentNode;
  #changed: () => void;
  #observer = new ResizeObserver(() => this.measure());

  constructor(root: () => ParentNode, changed: () => void) {
    this.#root = root;
    this.#changed = changed;
  }

  get(id: string): boolean | undefined {
    return this.#cuts.get(id);
  }

  measure(): void {
    let changed = false;
    for (const command of this.#root().querySelectorAll<HTMLElement>('.command [data-clamp]')) {
      this.#observer.observe(command);
      const id = command.dataset.clamp as string;
      const cut = command.clientHeight
        ? command.scrollHeight > command.clientHeight + 1
        : undefined;
      if (this.#cuts.get(id) === cut) continue;
      changed = true;
      if (cut === undefined) this.#cuts.delete(id);
      else this.#cuts.set(id, cut);
    }
    if (changed) this.#changed();
  }

  disconnect(): void {
    this.#observer.disconnect();
  }
}

export class Ends {
  #seen = new Set<string>();
  #root: () => ParentNode;
  #changed: () => void;
  #observer = new IntersectionObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.end as string;
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

  clear(): void {
    this.#seen.clear();
  }

  observe(): void {
    for (const end of this.#root().querySelectorAll<HTMLElement>('[data-end]'))
      this.#observer.observe(end);
  }

  disconnect(): void {
    this.#observer.disconnect();
  }
}

export function fullCommand(shown: boolean, toggle: () => void): TemplateResult {
  return html`<swc-action-button size="s" quiet class="full-command" data-action="full-command" data-shown=${shown ? '' : nothing} aria-expanded=${shown ? 'true' : 'false'} @click=${toggle}><swc-icon-chevron-down slot="icon" class="chevron" aria-hidden="true"></swc-icon-chevron-down>${shown ? 'Hide the full command' : 'Show the full command'}</swc-action-button>`;
}
