const adobeClean = [
  ['Regular', 400],
  ['Medium', 500],
  ['Bold', 700],
  ['ExtraBold', 800],
] as const;

const code = [400, 600] as const;

export const defaultFontBase = '/fonts/';

export const defaultVariableFont =
  'https://use.typekit.net/af/ca4cba/0000000000000000775c55a1/31/l?primer=f592e0a4b9356877842506ce344308576437e4f677d7c9b78ca2162e6cad991a&fvd=n1&v=3';

export interface FontFile {
  family: string;
  weight: number;
  url: string;
  format: 'woff2' | 'opentype';
}

let installed: readonly FontFile[] = [];

export function fontFiles(base: string | null, codeBase: string): FontFile[] {
  const files: FontFile[] = code.map((weight) => ({
    family: 'Source Code Pro',
    weight,
    url: `${codeBase}source-code-pro-latin-${weight}-normal.woff2`,
    format: 'woff2',
  }));
  if (base) {
    for (const family of ['adobe-clean', 'Adobe Clean']) {
      for (const [name, weight] of adobeClean) {
        files.push({ family, weight, url: `${base}AdobeClean-${name}.otf`, format: 'opentype' });
      }
    }
  }
  return files;
}

export function variableFace(url: string | null): string[] {
  return url
    ? [
        `@font-face{font-family:"adobe-clean-spectrum-vf";font-style:normal;font-weight:100 900;font-display:swap;src:url("${url}") format("woff2");}`,
      ]
    : [];
}

export function fontFaces(base: string | null, codeBase: string, variable: string | null): string {
  return [
    ...variableFace(variable),
    ...fontFiles(base, codeBase).map(
      (file) =>
        `@font-face{font-family:"${file.family}";font-style:normal;font-weight:${file.weight};font-display:swap;src:url("${file.url}") format("${file.format}");}`
    ),
  ].join('\n');
}

export function installedFonts(): readonly FontFile[] {
  return installed;
}

export function installFonts(
  document: Document,
  base: string | null,
  codeBase: string,
  variable: string | null
): HTMLStyleElement {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-slicc-fonts]');
  const style = existing ?? document.createElement('style');
  style.dataset.sliccFonts = '';
  style.textContent = fontFaces(base, codeBase, variable);
  installed = fontFiles(base, codeBase);
  if (!existing) document.head.append(style);
  return style;
}
