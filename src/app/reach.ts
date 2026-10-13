import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import { css, html, nothing, type TemplateResult } from 'lit';

export const command = 'curl -fsSL https://get.sliccy.ai/slicc | sh';

export const startCommand = 'slicc';

export const nodeCommand = 'npx sliccy@next';

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
    overflow-wrap: break-word;
    word-break: normal;
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-75);
    color: var(--swc-code-color);
    user-select: all;
  }
  .commands {
    display: grid;
    gap: var(--swc-spacing-100);
  }
  .commands p {
    margin: 0;
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
`;

export interface Reach {
  intro: string;
  extensionUrl?: string;
  copied: string | null;
  uncopied: boolean;
  copy: (text: string) => void;
}

function block(
  text: string,
  copied: string | null,
  copy: (text: string) => void,
  first = false
): TemplateResult {
  const done = copied === text;
  return html`<div class="command" data-command=${text}>
      <code>${breakable(text)}</code>
      <swc-action-button size="s" quiet data-action=${first ? 'copy-command' : nothing} accessible-label=${done ? 'Copied' : `Copy ${text}`} @click=${() => copy(text)}>
        <swc-icon-copy slot="icon"></swc-icon-copy>${done ? 'Copied' : 'Copy'}
      </swc-action-button>
    </div>`;
}

export function breakable(text: string): TemplateResult[] {
  return text
    .split('/')
    .map(
      (part, index, parts) => html`${part}${index < parts.length - 1 ? html`/<wbr />` : nothing}`
    );
}

export function reach({ intro, extensionUrl, copied, uncopied, copy }: Reach): TemplateResult {
  return html`<p>${intro}</p>
    ${
      extensionUrl
        ? html`<p><a class="swc-Link" href=${extensionUrl} target="_blank" rel="noopener noreferrer" data-action="install-extension">Install the Chrome extension</a></p>`
        : nothing
    }
    <p>To run slicc, enter this in a terminal:</p>
    <div class="commands">
      ${block(command, copied, copy, true)}
      ${block(startCommand, copied, copy)}
    </div>
    <div class="commands" data-commands="node">
      <p>With Node:</p>
      ${block(nodeCommand, copied, copy)}
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
