import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, LitElement, type TemplateResult } from 'lit';

export type ConfirmVariant = 'destructive' | 'confirmation';

export interface ConfirmOptions {
  title: string;
  body: string;
  action: string;
  variant?: ConfirmVariant;
  trigger?: HTMLElement | null;
}

function focused(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

function themeOf(node: Node | null): Element {
  for (let at = node; at; at = at.parentNode ?? (at as ShadowRoot).host ?? null) {
    if ((at as Element).localName === 'sp-theme') return at as Element;
  }
  return (
    document.querySelector('slicc-app')?.shadowRoot?.querySelector('sp-theme') ?? document.body
  );
}

export class SliccConfirm extends LitElement {
  static properties = { heading: {}, body: {}, action: {}, variant: {} };
  declare heading: string;
  declare body: string;
  declare action: string;
  declare variant: ConfirmVariant;
  trigger: HTMLElement | null = null;
  readonly #result = Promise.withResolvers<boolean>();

  constructor() {
    super();
    this.heading = '';
    this.body = '';
    this.action = '';
    this.variant = 'destructive';
  }

  static styles = css`
    dialog {
      box-sizing: border-box;
      max-inline-size: calc(100vw - 2 * var(--swc-spacing-300));
      max-block-size: calc(100dvh - 2 * var(--swc-spacing-300));
      padding: 0;
      border: none;
      border-radius: var(--swc-corner-radius-extra-large-default);
      background: var(--swc-background-layer-2-color);
      color: inherit;
      box-shadow: var(--swc-drop-shadow-elevated);
      overflow: auto;
      overscroll-behavior: contain;
    }
    dialog::backdrop {
      background: light-dark(
        color-mix(in srgb, var(--swc-overlay-color) calc(var(--swc-overlay-opacity-light) * 100%), transparent),
        color-mix(in srgb, var(--swc-overlay-color) calc(var(--swc-overlay-opacity-dark) * 100%), transparent)
      );
    }
    sp-alert-dialog {
      --mod-alert-dialog-min-width: min(
        var(--swc-alert-dialog-minimum-width),
        calc(100vw - 2 * var(--swc-spacing-300))
      );
      --mod-alert-dialog-max-width: min(
        var(--swc-alert-dialog-maximum-width),
        calc(100vw - 2 * var(--swc-spacing-300))
      );
      --mod-alert-dialog-padding: clamp(var(--swc-spacing-400), 6vw, var(--swc-spacing-500));
      --mod-alert-dialog-title-font-size: var(--swc-alert-dialog-title-font-size);
      --mod-alert-dialog-body-font-size: var(--swc-alert-dialog-description-font-size);
      --mod-alert-dialog-description-to-buttons: var(--swc-spacing-500);
      --system-alert-dialog-divider-background-color: transparent;
    }
    p {
      margin: 0;
    }
  `;

  get result(): Promise<boolean> {
    return this.#result.promise;
  }

  get #dialog(): HTMLDialogElement {
    return this.renderRoot.querySelector('dialog') as HTMLDialogElement;
  }

  protected async firstUpdated(): Promise<void> {
    const cancel = this.renderRoot.querySelector('[data-cancel]') as LitElement;
    this.#dialog.showModal();
    await cancel.updateComplete;
    cancel.focus();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#result.resolve(false);
  }

  #closed(): void {
    this.#result.resolve(this.#dialog.returnValue === 'confirm');
    this.remove();
    if (this.trigger?.isConnected) this.trigger.focus();
  }

  render(): TemplateResult {
    return html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="body" @close=${this.#closed}>
      <sp-alert-dialog variant=${this.variant}>
        <h2 id="title" slot="heading">${this.heading}</h2>
        <p id="body">${this.body}</p>
        <swc-button slot="button" variant="secondary" fill-style="outline" data-cancel @click=${() => this.#dialog.close()}>Cancel</swc-button>
        <swc-button
          slot="button"
          variant=${this.variant === 'destructive' ? 'negative' : 'accent'}
          data-action
          @click=${() => this.#dialog.close('confirm')}
          >${this.action}</swc-button
        >
      </sp-alert-dialog>
    </dialog>`;
  }
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  const trigger = options.trigger ?? focused();
  const element = document.createElement('slicc-confirm') as SliccConfirm;
  element.heading = options.title;
  element.body = options.body;
  element.action = options.action;
  element.variant = options.variant ?? 'destructive';
  element.trigger = trigger;
  themeOf(trigger).append(element);
  return element.result;
}
