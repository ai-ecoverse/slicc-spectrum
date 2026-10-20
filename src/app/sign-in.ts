import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { AccountSignIn } from '../model/types.ts';

export const continuing = 'Continue in the sign-in window that opened.';
export const closed = 'Closed the sign-in window? Cancel, then Log in again.';

export const signInWait = { closedAfter: 20_000 };

export function signInText(waited?: boolean): string {
  return waited ? closed : continuing;
}

export class SignInWaits {
  #since = new Map<string, number>();
  #update: () => void;

  constructor(update: () => void) {
    this.#update = update;
  }

  waited(key: string): boolean {
    const now = Date.now();
    const since = this.#since.get(key);
    if (since === undefined) {
      this.#since.set(key, now);
      setTimeout(this.#update, signInWait.closedAfter);
      return false;
    }
    return now - since >= signInWait.closedAfter;
  }

  done(key: string): void {
    this.#since.delete(key);
  }
}

export const signInCopy = { shownFor: 2_000 };

export type Copied = 'done' | 'failed';

export class SignInCopies {
  #copied = new Map<string, { state: Copied }>();
  #update: () => void;

  constructor(update: () => void) {
    this.#update = update;
  }

  state(key: string): Copied | undefined {
    return this.#copied.get(key)?.state;
  }

  async copy(key: string, code: string): Promise<void> {
    let state: Copied = 'done';
    try {
      await globalThis.navigator.clipboard.writeText(code);
    } catch {
      state = 'failed';
    }
    const entry = { state };
    this.#copied.set(key, entry);
    this.#update();
    setTimeout(() => {
      if (this.#copied.get(key) !== entry) return;
      this.#copied.delete(key);
      this.#update();
    }, signInCopy.shownFor);
  }
}

export function signInPage(url: string): string | null {
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const copyLabels: Record<Copied, string> = { done: 'Copied', failed: 'Couldn’t copy' };

function codeBlock(
  code: string,
  copied: Copied | undefined,
  copy: (code: string) => void
): TemplateResult {
  const label = copied ? copyLabels[copied] : 'Copy';
  return html`<p class="enter">Enter this code on the sign-in page:</p>
    <div class="code-row">
      <span class="code" data-id="sign-in-code">${code}</span>
      <swc-action-button size="m" quiet data-action="copy-sign-in-code" accessible-label=${copied ? label : 'Copy the code'} @click=${() => copy(code)}><swc-icon-copy slot="icon"></swc-icon-copy>${label}</swc-action-button>
      <span class="sr" role="status">${copied ? label : ''}</span>
    </div>`;
}

export function signInDetails(
  signIn: AccountSignIn | undefined,
  copied: Copied | undefined,
  copy: (code: string) => void
): TemplateResult | typeof nothing {
  const url = signIn ? signInPage(signIn.url) : null;
  if (!(signIn?.code || url)) return nothing;
  return html`<div class="sign-in" data-sign-in>
    ${signIn?.code ? codeBlock(signIn.code, copied, copy) : nothing}
    ${url ? html`<a class="swc-Link swc-Link--standalone swc-Link--quiet" href=${url} target="_blank" rel="noopener noreferrer" data-action="open-sign-in">Open the sign-in page</a>` : nothing}
  </div>`;
}

export const signInCss = css`
  .sign-in {
    display: grid;
    justify-items: start;
    gap: var(--swc-spacing-75);
  }
  .sign-in .enter {
    margin: 0;
  }
  .sign-in .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-100);
  }
  .sign-in .code {
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-heading-size-s);
    font-weight: var(--swc-bold-font-weight);
    line-height: var(--swc-heading-line-height);
    color: var(--swc-neutral-content-color-default);
    overflow-wrap: anywhere;
    user-select: all;
  }
`;
