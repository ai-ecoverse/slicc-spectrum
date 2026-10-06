import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

type IconNode = Array<[string, Record<string, string | number>]>;
type Library = Record<string, unknown> & { icons: Record<string, IconNode> };

let library: Promise<Library> | null = null;

export function load(): Promise<Library> {
  library ??= import('lucide') as unknown as Promise<Library>;
  return library;
}

export function pascal(name: string): string {
  return name.replace(/(^|-)([a-z0-9])/g, (_, _dash, char: string) => char.toUpperCase());
}

const escape = (value: string | number) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function svg(name: string, node: IconNode): string {
  const attributes: Record<string, string> = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: `lucide lucide-${name}`,
  };
  const attrs = (entries: Record<string, string | number>) =>
    Object.entries(entries)
      .map(([key, value]) => ` ${key}="${escape(value)}"`)
      .join('');
  const children = node.map(([tag, child]) => `<${tag}${attrs(child)}/>`).join('');
  return `<svg${attrs(attributes)}>${children}</svg>`;
}

export async function icons(names: readonly unknown[]): Promise<Record<string, string>> {
  const lib = await load();
  const out: Record<string, string> = {};
  for (const name of names) {
    if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) continue;
    const node = lib[pascal(name)] ?? lib.icons[pascal(name)];
    if (Array.isArray(node)) out[name] = svg(name, node as IconNode);
  }
  return out;
}

export class SliccLucide extends LitElement {
  static properties = { name: {}, markup: { state: true } };
  declare name: string;
  declare markup: string;

  static styles = css`
    :host {
      display: inline-flex;
      width: 18px;
      height: 18px;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `;

  constructor() {
    super();
    this.name = '';
    this.markup = '';
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('name')) return;
    const name = this.name;
    void icons([name]).then((found) => {
      if (this.name === name) this.markup = found[name] ?? '';
    });
  }

  render(): TemplateResult {
    return html`${unsafeSVG(this.markup)}`;
  }
}
