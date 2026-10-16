import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/help-text/sp-help-text.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
import '@spectrum-web-components/picker/sp-picker.js';
import '@spectrum-web-components/textfield/sp-textfield.js';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type { Agent, GuestGate, GuestPort, GuestSeat } from '../model/types.ts';
import { dialogStyles, focused, themeOf } from './confirm.ts';
import { failure } from './files.ts';

const hour = 3_600_000;
const day = 24 * hour;

export const guestExpiries: ReadonlyArray<readonly [string, string, number]> = [
  ['1h', '1 hour', hour],
  ['1d', '1 day', day],
  ['7d', '7 days', 7 * day],
  ['30d', '30 days', 30 * day],
];

export const guestNameLimit = 40;

export interface GuestCone {
  id: string;
  name: string;
  scoops: readonly string[];
}

export interface GateOption {
  value: GuestGate;
  label: string;
  description: string;
}

export type GateField = 'messages' | 'tools';

const approve = 'A person with Control approves each one.';

const defaultGates: Record<GateField, readonly GuestGate[]> = {
  messages: ['user', 'agent', 'cone', 'scoop:*', 'off'],
  tools: ['user', 'agent', 'scoop:*'],
};

function gateChoice(field: GateField, cone: GuestCone, gate: GuestGate): GateOption[] {
  if (gate === 'scoop:*')
    return cone.scoops.flatMap((name) => gateChoice(field, cone, `scoop:${name}`));
  if (gate.startsWith('scoop:')) {
    const name = gate.slice(6);
    return cone.scoops.includes(name)
      ? [{ value: gate, label: `${name} decides`, description: `The scoop ${name} decides.` }]
      : [];
  }
  const choices: Record<string, GateOption> = {
    user: { value: 'user', label: 'You approve each one', description: approve },
    agent: {
      value: 'agent',
      label: 'The automatic check decides',
      description: 'It decides by your intent, and asks a person when unsure.',
    },
    cone: {
      value: 'cone',
      label: `${cone.name} decides`,
      description: 'The shared cone itself decides.',
    },
    off: {
      value: 'off',
      label: 'No review',
      description:
        field === 'messages'
          ? 'Messages go straight in as follow-ups.'
          : 'Tool calls run without review.',
    },
  };
  return choices[gate] ? [choices[gate]] : [];
}

export function gateOptions(
  field: GateField,
  cone: GuestCone,
  allowed: readonly GuestGate[] = defaultGates[field]
): GateOption[] {
  const options = allowed
    .flatMap((gate) => gateChoice(field, cone, gate))
    .filter((option, index, all) => all.findIndex(({ value }) => value === option.value) === index);
  return options.length ? options : gateChoice(field, cone, 'user');
}

export function defaultGate(options: readonly GateOption[]): GuestGate {
  return options.some(({ value }) => value === 'user') ? 'user' : (options[0] as GateOption).value;
}

export function guestCones(agents: readonly Agent[]): GuestCone[] {
  return agents
    .filter((agent) => agent.kind === 'cone' && !agent.frozen)
    .map((cone) => ({
      id: cone.id,
      name: cone.name,
      scoops: agents
        .filter((agent) => agent.kind === 'scoop' && agent.parentId === cone.id)
        .map((scoop) => scoop.name),
    }));
}

export function activeCone(agents: readonly Agent[], active: string): string {
  const agent = agents.find((item) => item.id === active);
  return (agent?.kind === 'scoop' ? agent.parentId : agent?.id) ?? '';
}

export function guestNameProblem(label: string): string | null {
  if (!label) return 'Enter a name for the guest.';
  if (label.length > guestNameLimit)
    return `Keep the name to ${guestNameLimit} characters or fewer.`;
  return null;
}

export function guestExpiry(seat: GuestSeat, now = Date.now()): string {
  if (seat.expiresAt === null) return 'No expiry';
  const hours = Math.max(1, Math.ceil((seat.expiresAt - now) / hour));
  if (hours < 24) return `Expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function pendingLabel(count: number): string {
  return `${count} waiting for review`;
}

export class SliccGuestInvite extends LitElement {
  static properties = {
    cone: { state: true },
    label: { state: true },
    expiry: { state: true },
    messages: { state: true },
    tools: { state: true },
    pending: { state: true },
    error: { state: true },
    problem: { state: true },
    url: { state: true },
    copied: { state: true },
    uncopied: { state: true },
  };
  declare cone: string;
  declare label: string;
  declare expiry: string;
  declare messages: GuestGate;
  declare tools: GuestGate;
  declare pending: boolean;
  declare error: string;
  declare problem: string;
  declare url: string;
  declare copied: boolean;
  declare uncopied: boolean;
  port: GuestPort | null = null;
  cones: readonly GuestCone[] = [];
  trigger: HTMLElement | null = null;
  readonly #result = Promise.withResolvers<GuestSeat | null>();
  #seat: GuestSeat | null = null;

  constructor() {
    super();
    this.cone = '';
    this.label = '';
    this.expiry = '7d';
    this.messages = 'user';
    this.tools = 'user';
    this.pending = false;
    this.error = '';
    this.problem = '';
    this.url = '';
    this.copied = false;
    this.uncopied = false;
  }

  static styles = [
    dialogStyles,
    css`
      .fields,
      .link,
      .once {
        inline-size: calc(var(--mod-alert-dialog-max-width) - 2 * var(--mod-alert-dialog-padding));
        box-sizing: border-box;
      }
      .fields {
        display: grid;
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-75);
      }
      .field {
        display: grid;
        gap: var(--swc-spacing-75);
        min-width: 0;
      }
      .fields sp-field-label,
      .fields sp-textfield,
      .link sp-textfield {
        margin: 0;
        inline-size: 100%;
      }
      sp-picker {
        inline-size: 100%;
      }
      .link {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-75);
      }
      .link sp-textfield {
        flex: 1 1 200px;
        inline-size: auto;
      }
      .once {
        margin-block-start: var(--swc-spacing-200);
        padding-inline: var(--swc-spacing-75);
      }
      .problem {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin: var(--swc-spacing-200) var(--swc-spacing-75) 0;
        color: var(--swc-negative-content-color-default);
        overflow-wrap: anywhere;
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      .problem swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
    `,
  ];

  get result(): Promise<GuestSeat | null> {
    return this.#result.promise;
  }

  get #dialog(): HTMLDialogElement {
    return this.renderRoot.querySelector('dialog') as HTMLDialogElement;
  }

  #focus(selector: string): void {
    const target = this.renderRoot.querySelector(selector) as LitElement;
    void target.updateComplete.then(() => target.focus());
  }

  protected firstUpdated(): void {
    this.#dialog.showModal();
    this.#focus('#guest-name');
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.url = '';
    this.#result.resolve(this.#seat);
  }

  get #current(): GuestCone {
    return this.cones.find((cone) => cone.id === this.cone) ?? (this.cones[0] as GuestCone);
  }

  #options(field: GateField, cone: GuestCone): GateOption[] {
    return gateOptions(field, cone, this.port?.gates?.()[field]);
  }

  #keep(gate: GuestGate, field: GateField, cone: GuestCone): GuestGate {
    const options = this.#options(field, cone);
    return options.some((option) => option.value === gate) ? gate : defaultGate(options);
  }

  protected willUpdate(): void {
    if (this.hasUpdated) return;
    this.messages = this.#keep(this.messages, 'messages', this.#current);
    this.tools = this.#keep(this.tools, 'tools', this.#current);
  }

  #pick(event: Event): string {
    return (event.target as HTMLElement & { value: string }).value;
  }

  #setCone(event: Event): void {
    this.cone = this.#pick(event);
    this.messages = this.#keep(this.messages, 'messages', this.#current);
    this.tools = this.#keep(this.tools, 'tools', this.#current);
  }

  #input(event: Event): void {
    this.label = (event.currentTarget as HTMLInputElement).value;
    this.problem = '';
  }

  #key(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void this.create();
  }

  async create(): Promise<void> {
    if (this.pending) return;
    const label = this.label.trim();
    const problem = guestNameProblem(label);
    this.problem = problem ?? '';
    this.error = '';
    if (problem) {
      this.#focus('#guest-name');
      return;
    }
    const ms = (guestExpiries.find(([key]) => key === this.expiry) as (typeof guestExpiries)[0])[2];
    this.pending = true;
    try {
      const { seat, url } = await (this.port as GuestPort).mint(this.#current.id, {
        label,
        expiresAt: Date.now() + ms,
        gates: { messages: this.messages, tools: this.tools },
      });
      this.#seat = seat;
      this.url = url;
      this.pending = false;
      await this.updateComplete;
      this.#focus('[data-action=copy-guest-url]');
    } catch (error) {
      this.pending = false;
      this.error = failure(error);
    }
  }

  async copy(): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(this.url);
      this.copied = true;
      this.uncopied = false;
    } catch {
      this.copied = false;
      this.uncopied = true;
    }
  }

  #cancel(event: Event): void {
    if (this.pending) event.preventDefault();
  }

  #closed(): void {
    this.url = '';
    this.remove();
    if (this.trigger?.isConnected) this.trigger.focus();
  }

  #gate(field: GateField, title: string, value: GuestGate): TemplateResult {
    const options = this.#options(field, this.#current);
    const chosen = options.find((option) => option.value === value) as GateOption;
    const id = `guest-${field}`;
    return html`<div class="field">
      <sp-field-label for=${id} size="m">${title}</sp-field-label>
      <sp-picker id=${id} size="m" label=${title} data-action=${`guest-${field}`} .value=${live(value)} ?disabled=${this.pending} @change=${(
        event: Event
      ) => {
        this[field] = this.#pick(event) as GuestGate;
      }}>
        ${options.map((option) => html`<sp-menu-item value=${option.value}>${option.label}<span slot="description">${option.description}</span></sp-menu-item>`)}
      </sp-picker>
      <sp-help-text size="m" data-help=${field}>${chosen.description}</sp-help-text>
    </div>`;
  }

  #form(): TemplateResult {
    const cone = this.#current;
    return html`<h2 id="title" slot="heading">Invite a guest</h2>
      <div class="fields">
        <div class="field">
          <sp-field-label for="guest-cone" size="m">Cone</sp-field-label>
          <sp-picker id="guest-cone" size="m" label="Cone" data-action="guest-cone" .value=${live(cone.id)} ?disabled=${this.pending} @change=${this.#setCone}>
            ${this.cones.map((item) => html`<sp-menu-item value=${item.id}>${item.name}</sp-menu-item>`)}
          </sp-picker>
        </div>
        <div class="field">
          <sp-field-label for="guest-name" size="m">Name</sp-field-label>
          <sp-textfield id="guest-name" size="m" data-action="guest-name" autocomplete="off" .value=${live(this.label)} ?invalid=${Boolean(this.problem)} ?readonly=${this.pending} @input=${this.#input} @keydown=${this.#key}>
            <sp-help-text slot="help-text">Shown to you and in the cone, never set by the guest.</sp-help-text>
            ${this.problem ? html`<sp-help-text slot="negative-help-text" icon>${this.problem}</sp-help-text>` : nothing}
          </sp-textfield>
        </div>
        <div class="field">
          <sp-field-label for="guest-expiry" size="m">Link expires</sp-field-label>
          <sp-picker id="guest-expiry" size="m" label="Link expires" data-action="guest-expiry" .value=${live(this.expiry)} ?disabled=${this.pending} @change=${(
            event: Event
          ) => {
            this.expiry = this.#pick(event);
          }}>
            ${guestExpiries.map(([key, label]) => html`<sp-menu-item value=${key}>${label}</sp-menu-item>`)}
          </sp-picker>
        </div>
        ${this.#gate('messages', 'Their messages', this.messages)}
        ${this.#gate('tools', 'Their tool calls', this.tools)}
      </div>
      ${this.error ? html`<p class="problem" role="alert" data-error="guest"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.error}</span></p>` : nothing}
      <swc-button slot="button" variant="secondary" fill-style="outline" data-cancel data-action="cancel-guest" ?disabled=${this.pending} @click=${() => this.#dialog.close()}>Cancel</swc-button>
      <swc-button slot="button" variant="accent" data-action="create-guest-link" ?pending=${this.pending} @click=${() => this.create()}>Create link</swc-button>`;
  }

  #link(): TemplateResult {
    const label = this.#seat?.label ?? '';
    return html`<h2 id="title" slot="heading">Link for ${label}</h2>
      <div class="link" data-guest-link>
        <sp-textfield size="m" readonly label="Guest link" aria-label="Guest link" data-copy="guest-url" .value=${this.url}></sp-textfield>
        <swc-action-button size="m" data-action="copy-guest-url" accessible-label=${this.copied ? 'Copied' : 'Copy guest link'} @click=${() => this.copy()}>
          <swc-icon-copy slot="icon"></swc-icon-copy>${this.copied ? 'Copied' : 'Copy'}
        </swc-action-button>
      </div>
      <p class="once" data-once>This link is shown only once. Copy it now.</p>
      ${this.uncopied ? html`<p class="problem" role="alert" data-error="guest-copy"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>Couldn’t copy. Select the link and copy it.</span></p>` : nothing}
      <swc-button slot="button" variant="accent" data-action="done-guest" @click=${() => this.#dialog.close()}>Done</swc-button>`;
  }

  render(): TemplateResult {
    return html`<dialog aria-labelledby="title" data-guest-invite=${this.url ? 'link' : 'form'} @cancel=${this.#cancel} @close=${this.#closed}>
      <sp-alert-dialog variant="confirmation">${this.url ? this.#link() : this.#form()}</sp-alert-dialog>
    </dialog>`;
  }
}

export interface InviteOptions {
  port: GuestPort;
  agents: readonly Agent[];
  active: string;
  trigger?: HTMLElement | null;
}

export function invite(options: InviteOptions): Promise<GuestSeat | null> {
  const trigger = options.trigger ?? focused();
  const element = document.createElement('slicc-guest-invite') as SliccGuestInvite;
  const cones = guestCones(options.agents);
  const active = activeCone(options.agents, options.active);
  element.port = options.port;
  element.cones = cones;
  element.cone = cones.some((cone) => cone.id === active) ? active : (cones[0]?.id ?? '');
  element.trigger = trigger;
  themeOf(trigger).append(element);
  return element.result;
}
