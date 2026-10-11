import { html, type TemplateResult } from 'lit';
import { encode } from 'uqr';

export function qrPath(text: string): { size: number; path: string } {
  const { size, data } = encode(text, { border: 2 });
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return { size, path };
}

export function qrCode(text: string, label: string): TemplateResult {
  const { size, path } = qrPath(text);
  return html`<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label=${label} shape-rendering="crispEdges" data-qr><rect width=${size} height=${size} fill="#fff"></rect><path d=${path} fill="#000"></path></svg>`;
}
