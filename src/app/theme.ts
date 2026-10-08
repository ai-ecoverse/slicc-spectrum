import swc from '@adobe/spectrum-wc/swc.css';
import tokens from '@adobe/spectrum-wc/tokens.css';
import { type CSSResult, unsafeCSS } from 'lit';

export function scoped(text: string): string {
  return text.replace(/@import[^;]*;/g, '').replace(/:root\b/g, '.swc-theme');
}

export const theme: CSSResult = unsafeCSS(scoped(`${tokens}\n${swc}`));
