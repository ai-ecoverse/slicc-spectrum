import swc from '@adobe/spectrum-wc/swc.css';

export function registrations(text: string): string {
  return (
    text.match(
      /@media[^{]*\{\s*(?:@property\s+[\w-]+\s*\{[^}]*\}\s*)+\}|@property\s+[\w-]+\s*\{[^}]*\}/g
    ) ?? []
  ).join('\n');
}

export function installProperties(document: Document, text: string = swc): HTMLStyleElement {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-slicc-properties]');
  if (existing) return existing;
  const style = document.createElement('style');
  style.dataset.sliccProperties = '';
  style.textContent = registrations(text);
  document.head.append(style);
  return style;
}
