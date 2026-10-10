import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import { css, html, nothing, type TemplateResult } from 'lit';

export const command = 'npx @ai-ecoverse/slicc-node';

export const reachStyles = css`
  .command {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-100);
    padding: var(--swc-spacing-75) var(--swc-spacing-75) var(--swc-spacing-75) var(--swc-spacing-200);
    border-radius: var(--swc-corner-radius-medium-default);
    background: var(--swc-background-layer-1-color);
  }
  code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-75);
    color: var(--swc-code-color);
    user-select: all;
  }
`;

export interface Reach {
  intro: string;
  extensionUrl?: string;
  copied: boolean;
  uncopied: boolean;
  copy: () => void;
}

export function reach({ intro, extensionUrl, copied, uncopied, copy }: Reach): TemplateResult {
  return html`<p>${intro}</p>
    ${
      extensionUrl
        ? html`<p><a class="swc-Link" href=${extensionUrl} target="_blank" rel="noopener noreferrer" data-action="install-extension">Install the Chrome extension</a></p>`
        : nothing
    }
    <p>To run slicc-node, enter this in a terminal:</p>
    <div class="command">
      <code>${command}</code>
      <swc-action-button size="s" quiet data-action="copy-command" accessible-label=${copied ? 'Copied' : 'Copy command'} @click=${copy}>
        <swc-icon-copy slot="icon"></swc-icon-copy>${copied ? 'Copied' : 'Copy'}
      </swc-action-button>
    </div>
    ${
      uncopied
        ? html`<div class="error" role="alert" data-error="copy"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>Couldn’t copy. Select the command and copy it.</span></div>`
        : nothing
    }`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
