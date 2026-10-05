const adobeClean = [
  ['Regular', 400],
  ['Medium', 500],
  ['Bold', 700],
  ['ExtraBold', 800],
] as const;

const code = [400, 600] as const;

export function defaultFontBase(location: { hostname: string }): string | null {
  return /(^|\.)sliccy\.ai$/.test(location.hostname) ? 'https://www.sliccy.ai/fonts/' : null;
}

export function fontFaces(base: string | null, codeBase: string): string {
  const faces = code.map(
    (weight) =>
      `@font-face{font-family:"Source Code Pro";font-style:normal;font-weight:${weight};font-display:swap;src:url("${codeBase}source-code-pro-latin-${weight}-normal.woff2") format("woff2");}`
  );
  if (base) {
    for (const family of ['adobe-clean', 'Adobe Clean']) {
      for (const [name, weight] of adobeClean) {
        faces.push(
          `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${base}AdobeClean-${name}.otf") format("opentype");}`
        );
      }
    }
  }
  return faces.join('\n');
}

export function installFonts(
  document: Document,
  base: string | null,
  codeBase: string
): HTMLStyleElement {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-slicc-fonts]');
  const style = existing ?? document.createElement('style');
  style.dataset.sliccFonts = '';
  style.textContent = fontFaces(base, codeBase);
  if (!existing) document.head.append(style);
  return style;
}
