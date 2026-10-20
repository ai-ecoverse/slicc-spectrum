import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import { css, html, type TemplateResult } from 'lit';

export const clampCss = css`
  .command[data-clamp] {
    box-sizing: content-box;
    max-block-size: 4lh;
    overflow: hidden;
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
    for (const command of this.#root().querySelectorAll<HTMLElement>('.command[data-clamp]')) {
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

export function fullCommand(shown: boolean, toggle: () => void): TemplateResult {
  return html`<swc-action-button size="s" quiet class="full-command" data-action="full-command" aria-expanded=${shown ? 'true' : 'false'} @click=${toggle}>${shown ? 'Hide the full command' : 'Show the full command'}</swc-action-button>`;
}
