import { css, LitElement, type PropertyValues } from 'lit';
import type {
  ButtonConfig,
  ButtonEvent,
  ExecGrant,
  ExecMode,
  ExitName,
  LinkedDevice,
  PolicyChange,
  PopupIntent,
  PopupState,
  Rule,
  SliccModel,
  VaultButton,
  VaultPort,
  Widening,
} from '../model/types.ts';
import { isVaultFailure } from '../model/values.ts';

const exitNames: Record<string, string> = {
  page: 'This page',
  proxy: 'Local proxy',
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

export function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

export function execLine(
  exec: ExecMode | ExecGrant,
  argv: readonly string[][] = []
): string | null {
  if (typeof exec === 'object') return execLine('argv', exec.argv);
  if (exec === 'any' || exec === true) return 'Revealed to any command';
  if (exec === 'shell') return 'Revealed in every bash';
  if (exec === false) return null;
  if (!argv.length) return 'Revealed only to listed commands';
  return `Revealed only to ${list(argv.map((words) => words.map(shellWord).join(' ')))}`;
}

function lower(line: string): string {
  return `${line[0].toLowerCase()}${line.slice(1)}`;
}

function mode(exec: ExecMode | ExecGrant): string {
  return lower(execLine(exec) ?? 'Never revealed to commands');
}

export function changeLine(change: PolicyChange, devices: readonly LinkedDevice[]): string {
  switch (change.kind) {
    case 'rule':
      return `${change.secret} ${change.change === 'added' ? 'may now' : 'may no longer'} be sent to ${ruleLine(change.rule)}`;
    case 'exec':
      return `${change.secret} was ${mode(change.from)}, now ${mode(change.to)}`;
    case 'exits':
      if (change.to?.length === 0) return `${change.secret} now has no exit`;
      return `${change.secret} now leaves through ${change.to ? list(change.to.map((exit) => exitLabel(exit, devices))) : 'any exit'}`;
    default:
      return `The limit ${change.field} changed from ${change.from} to ${change.to}`;
  }
}

const codeTexts: Partial<Record<string, string>> = {
  EACCES: 'Unlock the vault first',
  ENOTSUP: 'This arrives with a later vault version',
};

export function widening(change: Widening, devices: readonly LinkedDevice[]): string {
  switch (change.kind) {
    case 'rule':
      return `${change.secret} may now be sent to ${ruleLine(change.rule)}`;
    case 'methods':
      return `${change.secret} may now use ${list(change.methods)} on ${change.domain}`;
    case 'paths':
      return `${change.secret} may now reach ${list(change.paths)} on ${change.domain}`;
    case 'exec':
      return `${change.secret} is now ${mode(change.grant)}`;
    case 'exit':
      return `${change.secret} may now leave through ${exitLabel(change.exit, devices)}`;
    default:
      return `The limit ${change.field} rose from ${change.from} to ${change.to}`;
  }
}

export function failureText(error: unknown): string {
  const text = isVaultFailure(error) ? codeTexts[error.code] : undefined;
  return text ?? (error instanceof Error ? error.message : 'The vault did not answer');
}

export function take(input: HTMLInputElement): string {
  const value = input.value;
  input.value = '';
  return value;
}

export function clearValues(root: ParentNode): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type=password]'))
    input.value = '';
}

export const fieldStyles = css`
  .field {
    display: grid;
    gap: var(--swc-spacing-75);
    min-width: 0;
  }
  .field > span {
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .field input:not([type='checkbox']) {
    box-sizing: border-box;
    inline-size: 100%;
    font: inherit;
    min-height: var(--swc-component-height-100);
    padding: 0 var(--swc-spacing-100);
    border: var(--swc-border-width-100) solid var(--swc-gray-400);
    border-radius: var(--swc-corner-radius-small-default);
    background: var(--swc-background-layer-2-color);
    color: inherit;
  }
  .field input[type='file'] {
    padding: var(--swc-spacing-75) var(--swc-spacing-100);
  }
  .field input[type='file']::file-selector-button {
    font: inherit;
    font-weight: var(--swc-bold-font-weight);
    margin-inline-end: var(--swc-spacing-200);
    padding: var(--swc-spacing-50) var(--swc-spacing-300);
    border: none;
    border-radius: var(--swc-corner-radius-full);
    background: var(--swc-gray-200);
    color: inherit;
  }
  .field input:focus-visible,
  input[type='checkbox']:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: var(--swc-focus-ring-gap);
  }
`;

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

function reachable(element: HTMLElement): boolean {
  const radio = element as HTMLInputElement;
  if (radio.localName !== 'input' || radio.type !== 'radio' || !radio.name) return true;
  const root = radio.getRootNode() as ParentNode;
  const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter(
    (other) => other.name === radio.name && other.form === radio.form
  );
  const checked = group.find((other) => other.checked);
  return checked ? checked === radio : radio === group[0] || radio === group.at(-1);
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
      if (
        summary &&
        shown(summary) &&
        getComputedStyle(summary).visibility !== 'hidden' &&
        !(summary.hasAttribute('tabindex') && summary.tabIndex < 0)
      )
        out.push(summary);
      continue;
    }
    if (
      child.tabIndex >= 0 &&
      !disabled(child) &&
      style.visibility !== 'hidden' &&
      reachable(child)
    )
      out.push(child);
    if (child.shadowRoot) tabbables(child.shadowRoot, stop, out);
    tabbables(child, stop, out);
  }
  return out;
}

export function sequential(order: Array<HTMLElement | null>): Array<HTMLElement | null> {
  const rank = (element: HTMLElement | null) =>
    element && element.tabIndex > 0 ? element.tabIndex : Number.POSITIVE_INFINITY;
  return [...order].sort((a, b) => rank(a) - rank(b) || 0);
}

export interface PopupDetail {
  intent: PopupIntent;
  state: PopupState;
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
      const order = sequential(tabbables(this.ownerDocument, this));
      const at = order.indexOf(null);
      order[event.direction === 'next' ? at + 1 : at - 1]?.focus();
    } else if (event.event === 'popup') {
      const { intent, state } = event;
      this.dispatchEvent(
        new CustomEvent<PopupDetail>('vault-popup', {
          detail: { intent, state },
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}
