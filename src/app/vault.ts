import { css, LitElement, type PropertyValues } from 'lit';
import type {
  ButtonConfig,
  ButtonEvent,
  ExecGrant,
  ExitName,
  LinkedDevice,
  PopupIntent,
  PopupResult,
  PopupState,
  Rule,
  SliccModel,
  VaultButton,
  VaultPort,
  Widening,
} from '../model/types.ts';

const exitNames: Record<string, string> = {
  'vault-direct': 'Straight from the vault',
  'local-proxy': 'Local proxy',
  'cli-v': 'Local SLICC, direct',
  tailscale: 'Tailscale',
  'local-link': 'Linked SLICC, through this page',
};

export function devicesOf(model: SliccModel | null): readonly LinkedDevice[] {
  return model?.network?.status().links?.devices ?? [];
}

export function deviceName(id: string, devices: readonly LinkedDevice[]): string {
  return (devices.find((device) => device.id === id)?.name ?? id).replace(/^slicc\b/i, 'SLICC');
}

export function exitLabel(exit: ExitName, devices: readonly LinkedDevice[]): string {
  if (exit.startsWith('device:')) return deviceName(exit.slice('device:'.length), devices);
  return exitNames[exit];
}

export function list(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function ruleLine(rule: Rule): string {
  const methods = rule.methods.length ? rule.methods.join(' or ') : 'any method';
  const paths = rule.paths.length ? rule.paths.join(' or ') : 'any path';
  return `${rule.domain}, in ${rule.header}, ${methods}, ${paths}`;
}

export function execLine(grant: ExecGrant): string {
  if (grant === false) return 'Never revealed to programs';
  if (grant === true) return 'Revealed to any program that asks';
  return `Revealed only to ${list(grant.argv.map((argv) => argv.join(' ')))}`;
}

export function widening(change: Widening, devices: readonly LinkedDevice[]): string {
  switch (change.kind) {
    case 'rule':
      return `${change.secret} may now be sent to ${ruleLine(change.rule)}`;
    case 'methods':
      return `${change.secret} may now use ${list(change.methods)} on ${change.domain}`;
    case 'paths':
      return `${change.secret} may now reach ${list(change.paths)} on ${change.domain}`;
    case 'exec':
      return `${change.secret}: ${execLine(change.grant).toLowerCase()}`;
    case 'exit':
      return `${change.secret} may now leave through ${exitLabel(change.exit, devices)}`;
    default:
      return `The limit ${change.field} rose from ${change.from} to ${change.to}`;
  }
}

function shown(element: HTMLElement, style = getComputedStyle(element)): boolean {
  return !element.hidden && !element.inert && style.display !== 'none';
}

function disabled(element: HTMLElement): boolean {
  if (element.matches(':disabled')) return true;
  if (!element.matches('button, input, select, textarea')) return false;
  let fieldset = element.closest('fieldset[disabled]');
  while (fieldset) {
    if (!fieldset.querySelector(':scope > legend')?.contains(element)) return true;
    fieldset = fieldset.parentElement?.closest('fieldset[disabled]') ?? null;
  }
  return false;
}

export function tabbables(
  root: ParentNode,
  stop: Element,
  out: Array<HTMLElement | null> = []
): Array<HTMLElement | null> {
  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child === stop) {
      out.push(null);
      continue;
    }
    const style = getComputedStyle(child);
    if (!shown(child, style)) continue;
    if (child.localName === 'details' && !(child as HTMLDetailsElement).open) {
      const summary = child.querySelector<HTMLElement>(':scope > summary');
      if (summary && shown(summary) && getComputedStyle(summary).visibility !== 'hidden')
        out.push(summary);
      continue;
    }
    if (child.tabIndex >= 0 && !disabled(child) && style.visibility !== 'hidden') out.push(child);
    if (child.shadowRoot) tabbables(child.shadowRoot, stop, out);
    tabbables(child, stop, out);
  }
  return out;
}

export interface PopupDetail {
  intent: PopupIntent;
  state: PopupState;
  result?: PopupResult;
}

export class SliccVaultButton extends LitElement {
  static properties = {
    vault: { attribute: false },
    config: { attribute: false },
  };
  declare vault: VaultPort | null | undefined;
  declare config: ButtonConfig | null;
  #button: VaultButton | null = null;
  #off: (() => void) | null = null;
  #ready = false;
  #sent = '';

  static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    iframe {
      border: 0;
      background: transparent;
      color-scheme: normal;
    }
  `;

  constructor() {
    super();
    this.vault = null;
    this.config = null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#drop();
  }

  focus(): void {
    this.#button?.post({ type: 'slicc-vault', v: 1, op: 'focus' });
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('vault')) this.#drop();
    if (!this.#button && this.vault) this.#mount(this.vault);
    this.#send();
  }

  #mount(vault: VaultPort): void {
    const button = vault.button();
    this.#button = button;
    this.#off = button.listen((event) => this.#event(event));
    this.renderRoot.append(button.element);
  }

  #drop(): void {
    this.#off?.();
    this.#button?.element.remove();
    this.#button = null;
    this.#off = null;
    this.#ready = false;
    this.#sent = '';
  }

  #send(): void {
    if (!(this.#ready && this.#button && this.config)) return;
    const sent = JSON.stringify(this.config);
    if (sent === this.#sent) return;
    this.#sent = sent;
    this.#button.post({ type: 'slicc-vault', v: 1, op: 'button', button: this.config });
  }

  #event(event: ButtonEvent): void {
    const element = this.#button?.element as HTMLElement;
    if (event.event === 'ready') {
      this.#ready = true;
      this.#send();
    } else if (event.event === 'size') {
      element.style.width = `${event.width}px`;
      element.style.height = `${event.height}px`;
      element.style.margin = `${-event.inset}px`;
    } else if (event.event === 'label') {
      element.title = event.label;
    } else if (event.event === 'focus') {
      const order = tabbables(this.ownerDocument, this);
      const at = order.indexOf(null);
      order[event.direction === 'next' ? at + 1 : at - 1]?.focus();
    } else if (event.event === 'popup') {
      const { intent, state, result } = event;
      this.dispatchEvent(
        new CustomEvent<PopupDetail>('vault-popup', {
          detail: { intent, state, ...(result ? { result } : {}) },
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}
