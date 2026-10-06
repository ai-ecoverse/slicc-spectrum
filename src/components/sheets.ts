const cache = new WeakMap<Document, Map<string, CSSStyleSheet>>();

export function adoptStyles(root: ShadowRoot, ...texts: string[]): void {
  const document = root.ownerDocument;
  let sheets = cache.get(document);
  if (!sheets) {
    sheets = new Map();
    cache.set(document, sheets);
  }
  const adopted = texts.map((text) => {
    let sheet = sheets.get(text);
    if (!sheet) {
      const view = document.defaultView as Window & typeof globalThis;
      sheet = new view.CSSStyleSheet();
      sheet.replaceSync(text);
      sheets.set(text, sheet);
    }
    return sheet;
  });
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...adopted];
}
