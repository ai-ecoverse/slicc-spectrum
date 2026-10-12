import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { PendingRequest, SliccModel, VaultPort } from '../model/types.ts';
import { nameProblem, valueProblem } from '../model/values.ts';
import { ThemedElement } from './base.ts';
import { dialogStyles, focused } from './confirm.ts';
import { prompt, until } from './secrets.ts';
import { clearValues, failureText, fieldStyles, type PopupDetail, take } from './vault.ts';

export function valueRequests(vault: VaultPort | undefined, now: number): PendingRequest[] {
  return [...(vault?.status()?.waiting ?? [])]
    .filter((request) => request.kind === 'value' && request.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function askedBy(request: PendingRequest): string {
  return `Asked by ${request.tag ?? `uid ${request.uid}`}`;
}

export class SliccValueRequest extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    now: { state: true },
    busy: { state: true },
    problem: { state: true },
    blocked: { state: true },
  };
  declare now: number;
  declare busy: boolean;
  declare problem: { id: string; text: string } | null;
  declare blocked: boolean;
  #later = new Set<string>();
  #done = new Set<string>();
  #front = '';
  #shown = '';
  #trigger: HTMLElement | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #port: VaultPort | undefined;
  #open = (event: Event) => this.reopen((event as CustomEvent<{ id: string }>).detail.id);

  constructor() {
    super();
    this.now = Date.now();
    this.busy = false;
    this.problem = null;
    this.blocked = false;
  }

  static styles = [
    dialogStyles,
    fieldStyles,
    css`
      :host {
        display: contents;
      }
      .asked,
      .timer,
      .more,
      .locked {
        margin-block-start: var(--swc-spacing-100);
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .prompt {
        margin-block-start: var(--swc-spacing-200);
        padding-inline-start: var(--swc-spacing-200);
        border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
        overflow-wrap: anywhere;
      }
      .said {
        white-space: pre-wrap;
      }
      .from {
        display: block;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .fields {
        display: grid;
        gap: var(--swc-spacing-200);
        margin-block-start: var(--swc-spacing-300);
      }
      .unlock {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-200);
        margin-block-start: var(--swc-spacing-200);
      }
      .problem {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin-block-start: var(--swc-spacing-200);
        color: var(--swc-negative-content-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      code {
        font-family: var(--swc-code-font-family-stack);
        overflow-wrap: anywhere;
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('value-request', this.#open);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('value-request', this.#open);
    clearValues(this.renderRoot);
    this.#tick(false);
    this.#shown = '';
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    if (model.vault !== this.#port) {
      clearValues(this.renderRoot);
      this.#port = model.vault;
      this.#later.clear();
      this.#done.clear();
      this.#front = '';
      this.busy = false;
      this.problem = null;
      this.blocked = false;
    }
    const update = () => {
      this.now = Date.now();
      this.requestUpdate();
    };
    return [...super.subscribe(model), ...(model.vault ? [model.vault.on('status', update)] : [])];
  }

  reopen(id: string): void {
    this.#later.delete(id);
    this.#front = id;
    this.now = Date.now();
  }

  later(id: string): void {
    clearValues(this.renderRoot);
    this.#later.add(id);
    if (this.#front === id) this.#front = '';
    this.problem = null;
    this.requestUpdate();
  }

  #queue(): PendingRequest[] {
    return valueRequests(this.model?.vault, this.now).filter(({ id }) => !this.#done.has(id));
  }

  #current(queue: readonly PendingRequest[]): PendingRequest | null {
    return (
      queue.find(({ id }) => id === this.#front) ??
      queue.find(({ id }) => !this.#later.has(id)) ??
      null
    );
  }

  #tick(on: boolean): void {
    if (on && !this.#timer) this.#timer = setInterval(() => (this.now = Date.now()), 1000);
    if (!on && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #mine(vault: VaultPort): boolean {
    return this.model?.vault === vault && this.isConnected;
  }

  #field(name: string): HTMLInputElement {
    return this.renderRoot.querySelector(`input[data-field=${name}]`) as HTMLInputElement;
  }

  async save(request: PendingRequest): Promise<void> {
    const vault = this.model?.vault as VaultPort;
    const value = take(this.#field('value'));
    if (this.busy) return;
    const name = request.name ?? this.#field('name').value.trim();
    const text = nameProblem(name) ?? valueProblem(value);
    this.problem = text ? { id: request.id, text } : null;
    if (text) return;
    this.busy = true;
    try {
      await vault.put?.(name, value, request.id);
      if (!this.#mine(vault)) return;
      this.#done.add(request.id);
    } catch (error) {
      if (this.#mine(vault)) this.problem = { id: request.id, text: failureText(error) };
    } finally {
      if (this.model?.vault === vault) this.busy = false;
    }
  }

  async cancelRequest(request: PendingRequest): Promise<void> {
    const vault = this.model?.vault as VaultPort;
    clearValues(this.renderRoot);
    if (this.busy) return;
    this.busy = true;
    this.problem = null;
    try {
      await vault.cancel?.(request.id);
      if (this.#mine(vault)) this.#done.add(request.id);
    } catch (error) {
      if (this.#mine(vault)) this.problem = { id: request.id, text: failureText(error) };
    } finally {
      if (this.model?.vault === vault) this.busy = false;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const current = this.#current(this.#queue());
    if ((current?.id ?? '') !== this.#shown) clearValues(this.renderRoot);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const dialog = this.renderRoot.querySelector('dialog');
    this.#tick(this.isConnected && !!dialog);
    const key = dialog?.dataset.request ?? '';
    if (key === this.#shown) return;
    if (dialog && !this.#shown) this.#trigger = focused();
    this.#shown = key;
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    const target = (dialog.querySelector('input') ??
      dialog.querySelector('[data-action=later]')) as HTMLElement;
    void (dialog.querySelector('sp-alert-dialog') as LitElement).updateComplete.then(() =>
      target.focus()
    );
  }

  #onKey(event: KeyboardEvent, request: PendingRequest): void {
    if (event.key !== 'Enter' || (event.target as HTMLElement).localName !== 'input') return;
    event.preventDefault();
    void this.save(request);
  }

  #unlock(vault: VaultPort): TemplateResult {
    return html`<div class="unlock" data-locked>
      <span class="locked">Unlock the vault first</span>
      <slicc-vault-button
        data-action="unlock"
        .vault=${vault}
        .config=${{ intent: { kind: 'unlock' }, label: 'Unlock', size: 'm', variant: 'accent', theme: this.color }}
        @vault-popup=${(event: CustomEvent<PopupDetail>) => {
          this.blocked = event.detail.state === 'blocked';
        }}
      ></slicc-vault-button>
      ${this.blocked ? html`<span class="problem" role="alert" data-popup="blocked"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>The browser blocked the vault window. Allow pop-ups for this site, then try again.</span></span>` : nothing}
    </div>`;
  }

  render(): unknown {
    const vault = this.model?.vault;
    const queue = this.#queue();
    const request = this.#current(queue);
    if (!vault || !request) return nothing;
    const locked = !!vault.status()?.locked;
    const rest = queue.length - 1;
    const problem = this.problem?.id === request.id ? this.problem.text : '';
    return keyed(
      request.id,
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asked" data-request=${request.id} @cancel=${(
        event: Event
      ) => {
        event.preventDefault();
        this.later(request.id);
      }}>
        <sp-alert-dialog variant="confirmation">
          <h2 id="title" slot="heading">${request.name ? html`Enter a value for <code>${request.name}</code>` : 'Enter a value'}</h2>
          <p class="asked" id="asked" data-asked>${askedBy(request)}</p>
          ${request.prompt ? html`<p class="prompt" data-prompt><span class="from">From the agent, not checked by SLICC:</span> <span class="said">${prompt(request.prompt)}</span></p>` : nothing}
          ${
            vault.put
              ? html`<div class="fields" @keydown=${(event: KeyboardEvent) => this.#onKey(event, request)}>
                  ${
                    request.name
                      ? nothing
                      : html`<label class="field"><span>Name</span><input type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" data-field="name" @input=${(
                          event: Event
                        ) => {
                          const input = event.currentTarget as HTMLInputElement;
                          input.value = input.value.toUpperCase();
                        }} /></label>`
                  }
                  <label class="field"><span>Value</span><input type="password" autocomplete="off" spellcheck="false" data-field="value" /></label>
                </div>`
              : nothing
          }
          ${locked ? this.#unlock(vault) : nothing}
          ${problem ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${problem}</span></p>` : nothing}
          <p class="timer" data-timer>Expires ${until(request.expiresAt, this.now)}</p>
          ${rest > 0 ? html`<p class="more" data-more>${rest} more waiting</p>` : nothing}
          <swc-button slot="button" variant="secondary" fill-style="outline" data-action="later" @click=${() => this.later(request.id)}>Later</swc-button>
          ${vault.cancel ? html`<swc-button slot="button" variant="secondary" fill-style="outline" data-action="cancel-request" ?disabled=${this.busy} @click=${() => this.cancelRequest(request)}>Cancel request</swc-button>` : nothing}
          ${vault.put ? html`<swc-button slot="button" variant="accent" data-action="save" ?pending=${this.busy} ?disabled=${locked} @click=${() => this.save(request)}>Save</swc-button>` : nothing}
        </sp-alert-dialog>
      </dialog>`
    );
  }
}
