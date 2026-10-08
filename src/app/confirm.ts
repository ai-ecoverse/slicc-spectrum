import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/help-text/sp-help-text.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';

export type ConfirmVariant = 'destructive' | 'confirmation';

export interface ConfirmOptions {
  title: string;
  body: string;
  action: string;
  variant?: ConfirmVariant;
  trigger?: HTMLElement | null;
}

export interface PromptOptions {
  title: string;
  label: string;
  action: string;
  value?: string;
  trigger?: HTMLElement | null;
  submit?: (value: string) => Promise<void>;
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

const dialogStyles = css`
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
  sp-field-label,
  sp-textfield {
    margin-inline: var(--swc-spacing-75);
  }
  sp-textfield {
    inline-size: calc(100% - 2 * var(--swc-spacing-75));
    margin-block-end: var(--swc-spacing-75);
  }
`;

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

  static styles = dialogStyles;

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

export class SliccPrompt extends LitElement {
  static properties = {
    heading: {},
    label: {},
    action: {},
    value: {},
    error: { state: true },
    pending: { state: true },
  };
  declare heading: string;
  declare label: string;
  declare action: string;
  declare value: string;
  declare error: string;
  declare pending: boolean;
  trigger: HTMLElement | null = null;
  submit: ((value: string) => Promise<void>) | null = null;
  readonly #result = Promise.withResolvers<string | null>();

  constructor() {
    super();
    this.heading = '';
    this.label = '';
    this.action = '';
    this.value = '';
    this.error = '';
    this.pending = false;
  }

  static styles = dialogStyles;

  get result(): Promise<string | null> {
    return this.#result.promise;
  }

  get #dialog(): HTMLDialogElement {
    return this.renderRoot.querySelector('dialog') as HTMLDialogElement;
  }

  get #field(): LitElement {
    return this.renderRoot.querySelector('sp-textfield') as LitElement;
  }

  protected async firstUpdated(): Promise<void> {
    this.#dialog.showModal();
    await this.#field.updateComplete;
    this.#field.focus();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#result.resolve(null);
  }

  #input(event: Event): void {
    this.value = (event.currentTarget as HTMLInputElement).value;
    this.error = '';
  }

  #key(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void this.#submit();
  }

  async #submit(): Promise<void> {
    const value = this.value.trim();
    if (!value || this.pending) return;
    this.pending = true;
    this.error = '';
    try {
      await this.submit?.(value);
    } catch (error) {
      this.pending = false;
      this.error = error instanceof Error ? error.message : String(error);
      await this.updateComplete;
      this.#field.focus();
      return;
    }
    this.#result.resolve(value);
    this.#dialog.close();
  }

  #cancel(event: Event): void {
    if (this.pending) event.preventDefault();
  }

  #closed(): void {
    this.#result.resolve(null);
    this.remove();
    if (this.trigger?.isConnected) this.trigger.focus();
  }

  render(): TemplateResult {
    return html`<dialog aria-labelledby="title" @cancel=${this.#cancel} @close=${this.#closed}>
      <sp-alert-dialog>
        <h2 id="title" slot="heading">${this.heading}</h2>
        <sp-field-label for="field" size="m">${this.label}</sp-field-label>
        <sp-textfield
          id="field"
          size="m"
          .value=${this.value}
          ?invalid=${Boolean(this.error)}
          ?readonly=${this.pending}
          @input=${this.#input}
          @keydown=${this.#key}
          >${this.error ? html`<sp-help-text slot="negative-help-text" icon>${this.error}</sp-help-text>` : nothing}</sp-textfield
        >
        <swc-button slot="button" variant="secondary" fill-style="outline" data-cancel ?disabled=${this.pending} @click=${() => this.#dialog.close()}>Cancel</swc-button>
        <swc-button
          slot="button"
          variant="accent"
          data-action
          ?disabled=${!this.value.trim()}
          ?pending=${this.pending}
          @click=${() => this.#submit()}
          >${this.action}</swc-button
        >
      </sp-alert-dialog>
    </dialog>`;
  }
}

export function prompt(options: PromptOptions): Promise<string | null> {
  const trigger = options.trigger ?? focused();
  const element = document.createElement('slicc-prompt') as SliccPrompt;
  element.heading = options.title;
  element.label = options.label;
  element.action = options.action;
  element.value = options.value ?? '';
  element.submit = options.submit ?? null;
  element.trigger = trigger;
  themeOf(trigger).append(element);
  return element.result;
}
