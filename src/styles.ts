import wterm from '@wterm/dom/css';
import theme from './slicc-terminal.css';

const sheets = new WeakMap<Document, CSSStyleSheet>();

function sheetFor(document: Document): CSSStyleSheet {
  let sheet = sheets.get(document);
  if (!sheet) {
    const view = document.defaultView as Window & typeof globalThis;
    sheet = new view.CSSStyleSheet();
    sheet.replaceSync(`${wterm}\n${theme}`);
    sheets.set(document, sheet);
  }
  return sheet;
}

export function adopt(root: Document | ShadowRoot): void {
  const sheet = sheetFor((root.ownerDocument ?? root) as Document);
  if (root.adoptedStyleSheets.includes(sheet)) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
