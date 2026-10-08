import '@adobe/spectrum-wc/components/ui-icons/swc-ui-icon.js';
import type { DockviewIDisposable, ITabRenderer, TabPartInitParameters } from 'dockview-core';

export class SliccTab implements ITabRenderer {
  readonly element = document.createElement('div');
  #label = document.createElement('span');
  #close = document.createElement('div');
  #disposables: DockviewIDisposable[] = [];

  constructor() {
    this.element.className = 'slicc-tab';
    this.#label.className = 'slicc-tab-label';
    this.#close.className = 'slicc-tab-close';
    this.#close.setAttribute('role', 'button');
    this.#close.tabIndex = -1;
    const cross = document.createElement('swc-ui-icon');
    cross.setAttribute('icon', 'cross');
    cross.setAttribute('size', 's');
    cross.setAttribute('aria-hidden', 'true');
    this.#close.append(cross);
    this.element.append(this.#label, this.#close);
  }

  init({ api, containerApi, title }: TabPartInitParameters): void {
    const render = (text: string) => {
      this.#label.textContent = text;
      this.#close.setAttribute(
        'aria-label',
        text ? containerApi.messages.closeTab(text) : containerApi.messages.closeTabPlain()
      );
    };
    render(title);
    const pointerdown = (event: Event) => event.preventDefault();
    const click = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      api.close();
    };
    this.#close.addEventListener('pointerdown', pointerdown);
    this.#close.addEventListener('click', click);
    this.#disposables.push(
      api.onDidTitleChange(({ title }) => render(title)),
      {
        dispose: () => {
          this.#close.removeEventListener('pointerdown', pointerdown);
          this.#close.removeEventListener('click', click);
        },
      }
    );
  }

  dispose(): void {
    for (const disposable of this.#disposables.splice(0)) disposable.dispose();
  }
}
