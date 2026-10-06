import { File, FileDiff } from '@pierre/diffs';
import css from './code.css';
import { adoptStyles } from './sheets.ts';

export type CodeColor = 'light' | 'dark';

const themes = { light: 'pierre-light', dark: 'pierre-dark' };

interface Viewer {
  cleanUp(): void;
}

abstract class PierreView extends HTMLElement {
  static observedAttributes = ['path', 'color'];
  #viewer: Viewer | null = null;
  #container: HTMLElement | null = null;
  #scheduled = false;

  get path(): string {
    return this.getAttribute('path') ?? '';
  }

  set path(value: string) {
    this.setAttribute('path', value);
  }

  get color(): CodeColor {
    return this.getAttribute('color') === 'dark' ? 'dark' : 'light';
  }

  set color(value: CodeColor) {
    this.setAttribute('color', value);
  }

  protected options() {
    return {
      theme: themes,
      themeType: this.color,
      overflow: 'scroll' as const,
      disableFileHeader: true,
    };
  }

  protected abstract draw(container: HTMLElement): Viewer | null;

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!this.#container) {
      adoptStyles(root, css);
      this.#container = document.createElement('div');
      root.append(this.#container);
    }
    this.refresh();
  }

  disconnectedCallback(): void {
    this.#viewer?.cleanUp();
    this.#viewer = null;
  }

  attributeChangedCallback(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#draw();
    });
  }

  #draw(): void {
    const container = this.#container;
    if (!container || !this.isConnected) return;
    this.#viewer?.cleanUp();
    container.replaceChildren();
    this.#viewer = this.draw(container);
  }

  protected empty(container: HTMLElement, text: string): null {
    const note = document.createElement('div');
    note.className = 'empty';
    note.textContent = text;
    container.append(note);
    return null;
  }
}

export class SliccCodeView extends PierreView {
  #contents: string | null = null;

  get contents(): string | null {
    return this.#contents;
  }

  set contents(value: string | null) {
    if (value === this.#contents) return;
    this.#contents = value;
    this.refresh();
  }

  protected draw(container: HTMLElement): Viewer | null {
    if (this.#contents === null) return this.empty(container, 'Nothing to show');
    const viewer = new File(this.options());
    viewer.render({
      file: { name: this.path, contents: this.#contents },
      containerWrapper: container,
    });
    return viewer;
  }
}

export type DiffStyle = 'unified' | 'split';

export class SliccDiffView extends PierreView {
  static observedAttributes = [...PierreView.observedAttributes, 'diff-style'];
  #before: string | null = null;
  #after: string | null = null;

  get oldText(): string | null {
    return this.#before;
  }

  set oldText(value: string | null) {
    if (value === this.#before) return;
    this.#before = value;
    this.refresh();
  }

  get newText(): string | null {
    return this.#after;
  }

  set newText(value: string | null) {
    if (value === this.#after) return;
    this.#after = value;
    this.refresh();
  }

  get diffStyle(): DiffStyle {
    return this.getAttribute('diff-style') === 'split' ? 'split' : 'unified';
  }

  set diffStyle(value: DiffStyle) {
    this.setAttribute('diff-style', value);
  }

  protected draw(container: HTMLElement): Viewer | null {
    if (this.#before === null && this.#after === null) return this.empty(container, 'No changes');
    const viewer = new FileDiff({
      ...this.options(),
      diffStyle: this.diffStyle,
      hunkSeparators: 'line-info',
    });
    const side = (contents: string | null) =>
      contents === null ? null : { name: this.path, contents };
    viewer.render({
      oldFile: side(this.#before),
      newFile: side(this.#after),
      containerWrapper: container,
    } as Parameters<typeof viewer.render>[0]);
    return viewer;
  }
}

export function defineCodeViews(): void {
  if (!customElements.get('slicc-code-view'))
    customElements.define('slicc-code-view', SliccCodeView);
  if (!customElements.get('slicc-diff-view'))
    customElements.define('slicc-diff-view', SliccDiffView);
}
