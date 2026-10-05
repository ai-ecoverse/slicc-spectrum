import wterm from '@wterm/dom/css';
import theme from './slicc-terminal.css';

let sheet: CSSStyleSheet | undefined;

export function adopt(root: Document | ShadowRoot): void {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(`${wterm}\n${theme}`);
  }
  if (root.adoptedStyleSheets.includes(sheet)) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}
