import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/dropzone/swc-dropzone.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-close.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import '@adobe/spectrum-wc-icons/swc-icon-import.js';
import '@adobe/spectrum-wc-icons/swc-icon-open-in.js';
import '@adobe/spectrum-wc-icons/swc-icon-play.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Agent, FrozenCone, FrozenKind, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { carriesFiles } from './chat.ts';
import { confirm } from './confirm.ts';
import { errorCss, panelCss } from './files.ts';
import { onWatch, watchOnly } from './follow.ts';
import { importProfile } from './freezer-import.ts';
import { coneLabel, twinned, withTitle } from './names.ts';
import { ViewScroll } from './view-state.ts';

export function ago(at: number, now = Date.now()): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

export async function deleteCone(
  model: SliccModel,
  agent: Agent,
  trigger?: HTMLElement | null
): Promise<boolean> {
  const ok = await confirm({
    title: `Delete cone ${coneLabel(model, agent)}?`,
    body: 'It stops, with its scoops. Its conversation stays in the Freezer, where you can thaw it.',
    action: 'Delete cone',
    variant: 'confirmation',
    trigger,
  });
  const allowed = ok && !watchOnly(model);
  if (allowed) model.agent.freeze?.(agent.id);
  return allowed;
}

export const frozenKinds: Record<FrozenKind, string> = {
  cone: 'Cone',
  scoop: 'Scoop',
  agent: 'Agent run',
};

type Tooltip = HTMLElement & { triggerElement: HTMLElement | null };

export const zipTypes = ['application/zip', 'application/x-zip-compressed'];

export const notZip = 'That’s not a SLICC 6 export. Use the .zip from Export for SLICC 7.';

export function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || zipTypes.includes(file.type);
}

export function freezerOrder(rows: readonly FrozenCone[]): FrozenCone[] {
  return [...rows].sort((a, b) => Number(!!b.live) - Number(!!a.live) || b.frozenAt - a.frozenAt);
}

export class SliccFreezer extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    dropping: { state: true },
    refused: { state: true },
  };
  declare dropping: boolean;
  declare refused: boolean;
  #scroll = new ViewScroll(this, 'freezer:scroll', {
    scroller: () => this.renderRoot.querySelector<HTMLElement>('.list'),
    rows: '.row[data-id]',
  });
  constructor() {
    super();
    this.dropping = false;
    this.refused = false;
    this.addEventListener('dragenter', this.#over);
    this.addEventListener('dragover', this.#over);
    this.addEventListener('dragleave', this.#leave);
    this.addEventListener('drop', this.#drop);
  }

  static styles = [
    shared,
    panelCss,
    errorCss,
    css`
      :host {
        position: relative;
        container: freezer / inline-size;
      }
      .bar .long {
        display: none;
      }
      @container freezer (min-width: 26rem) {
        .bar .long {
          display: inline;
        }
        .bar .short {
          display: none;
        }
      }
      .bar {
        flex-wrap: wrap;
        row-gap: 0;
      }
      .bar > span {
        display: inline-flex;
        align-items: center;
        min-height: var(--swc-component-height-100);
      }
      .bar [data-action='import-v6'] {
        margin-inline-start: auto;
      }
      .note[data-empty='starting'] {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .error span {
        flex: 1;
        min-width: 0;
      }
      swc-dropzone {
        position: absolute;
        inset: var(--swc-spacing-100);
        z-index: 3;
        display: grid;
        pointer-events: none;
        --swc-dropzone-background-color: color-mix(
          in srgb,
          var(--swc-accent-visual-color) 14%,
          color-mix(in srgb, var(--swc-background-layer-2-color) 82%, transparent)
        );
      }
      swc-dropzone p {
        padding: var(--swc-spacing-100) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-1000);
        background: var(--swc-background-elevated-color);
        box-shadow: var(--swc-drop-shadow-elevated);
        font-size: var(--swc-font-size-300);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-accent-content-color-default);
        white-space: nowrap;
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-100) 0;
        background: var(--swc-background-layer-1-color);
      }
      section {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
      }
      h3 {
        margin: 0;
        padding: 0 var(--swc-spacing-200);
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-line-height-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      ul {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        column-gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
      }
      .row:focus {
        outline: none;
      }
      .row:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-25);
        min-width: 0;
      }
      .title,
      .meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: var(--swc-line-height-100);
      }
      .title {
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-content-color-default);
      }
      .meta {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .actions {
        display: flex;
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      model.agent.on('frozen', update),
      model.agent.on('active', update),
      model.agent.on('agents', update),
      ...(model.agent.starting ? [model.agent.on('starting', update)] : []),
      ...onWatch(model, update),
    ];
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.importable) this.refused = false;
  }

  focus(): void {
    this.focusOn('.row swc-action-button', 'swc-action-button');
  }

  get importable(): boolean {
    const model = this.model;
    return (
      !!model?.agent.importProfile && !!model.agent.importCancel && !watchOnly(model) && !model.seat
    );
  }

  #over = (event: DragEvent): void => {
    if (!(carriesFiles(event) && this.importable)) return;
    event.preventDefault();
    (event.dataTransfer as DataTransfer).dropEffect = 'copy';
    if (this.dropping) return;
    this.dropping = true;
    globalThis.addEventListener('keydown', this.#escape, true);
  };

  #leave = (event: DragEvent): void => {
    const to = event.relatedTarget;
    if (!(to instanceof Node && this.contains(to))) this.#clear();
  };

  #escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#clear();
  };

  #clear(): void {
    this.dropping = false;
    globalThis.removeEventListener('keydown', this.#escape, true);
  }

  #drop = (event: DragEvent): void => {
    this.#clear();
    if (!(carriesFiles(event) && this.importable)) return;
    event.preventDefault();
    const files = [...(event.dataTransfer as DataTransfer).files];
    this.#take(files.find(isZip) ?? files[0], this);
  };

  #take(file: File | undefined, trigger: HTMLElement | null): void {
    if (!file) return;
    this.refused = !isZip(file);
    if (!this.refused) void this.#import(file, trigger);
  }

  #dismiss(): void {
    this.refused = false;
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('[data-action=import-v6]')?.focus()
    );
  }

  #pick(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
  }

  #picked(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.#take(file, this.renderRoot.querySelector<HTMLElement>('[data-action=import-v6]'));
  }

  async #import(file: File, trigger: HTMLElement | null): Promise<void> {
    const model = this.model as SliccModel;
    const outcome = await importProfile({
      agent: model.agent,
      accounts: model.settings.accounts(),
      file,
      trigger,
      allowed: () => this.importable,
    });
    if (outcome === 'retry') return this.#pick();
    const first = outcome?.cones[0];
    if (!first) return;
    await this.updateComplete;
    const row = [...this.renderRoot.querySelectorAll<HTMLElement>('.row[data-id]')].find(
      (item) => item.dataset.id === first
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus();
  }

  async #remove(cone: FrozenCone, trigger: HTMLElement): Promise<void> {
    const ok = await confirm({
      title: `Remove ${this.#named(cone)} from the Freezer?`,
      body: 'Its working folders are deleted. The conversation stays in the session database. You can’t undo this.',
      action: 'Remove',
      variant: 'destructive',
      trigger,
    });
    if (ok && !watchOnly(this.model)) this.model?.agent.discard(cone.id);
  }

  #named(cone: FrozenCone): string {
    const rows = this.model?.agent.frozen() ?? [];
    return twinned(cone.name, cone.id, rows) ? withTitle(cone.name, cone.title) : cone.name;
  }

  #thawedAs(id: string): string {
    const model = this.model as SliccModel;
    return (
      model.agent.list().find((agent) => agent.id === id)?.name ??
      model.agent.frozen().find((row) => row.id === id)?.name ??
      id
    );
  }

  #action(
    cone: FrozenCone,
    action: string,
    label: string,
    icon: TemplateResult,
    run: (trigger: HTMLElement) => void
  ): TemplateResult {
    const id = `${action}-${cone.id}`;
    const named = `${label} ${this.#named(cone)}`;
    return html`<swc-action-button id=${id} size="s" quiet data-action=${action} accessible-label=${named} @click=${(event: Event) => run(event.currentTarget as HTMLElement)}>${icon}</swc-action-button><swc-tooltip for=${id} placement="top">${named}</swc-tooltip>`;
  }

  #actions(cone: FrozenCone): TemplateResult | typeof nothing {
    const model = this.model as SliccModel;
    if (cone.live) {
      return html`<div class="actions">${this.#action(cone, 'open', 'Open', html`<swc-icon-open-in slot="icon"></swc-icon-open-in>`, () => model.agent.select(cone.id))}</div>`;
    }
    if (watchOnly(model)) return nothing;
    return html`<div class="actions">${this.#action(cone, 'thaw', 'Thaw', html`<swc-icon-play slot="icon"></swc-icon-play>`, () => model.agent.thaw(cone.id))}${this.#action(cone, 'remove', 'Remove', html`<swc-icon-delete slot="icon"></swc-icon-delete>`, (trigger) => void this.#remove(cone, trigger))}</div>`;
  }

  #meta(cone: FrozenCone): TemplateResult[] {
    const kind = cone.kind ?? 'cone';
    const parts: Array<readonly [string, string] | false> = [
      kind !== 'cone' && ['kind', frozenKinds[kind]],
      !cone.live && ['when', ago(cone.frozenAt)],
      ['messages', `${cone.messages} ${cone.messages === 1 ? 'message' : 'messages'}`],
      cone.thawedAs ? ['thawed', `thawed as ${this.#thawedAs(cone.thawedAs)}`] : false,
    ];
    return parts
      .filter((part) => part !== false)
      .map(
        ([key, text], index) => html`${index ? ' · ' : ''}<span data-meta=${key}>${text}</span>`
      );
  }

  #row(cone: FrozenCone): TemplateResult {
    const heading = cone.title.trim() || cone.name;
    return html`<li class="row" tabindex="-1" data-id=${cone.id} data-kind=${cone.kind ?? 'cone'} ?data-live=${cone.live} ?data-v6=${cone.v6}>
      <div class="text">
        <span class="title" title=${heading}>${heading}</span>
        <span class="meta">${this.#meta(cone)}</span>
      </div>
      ${this.#actions(cone)}
    </li>`;
  }

  #section(
    id: string,
    heading: string,
    rows: readonly FrozenCone[]
  ): TemplateResult | typeof nothing {
    if (!rows.length) return nothing;
    return html`<section data-section=${id} aria-labelledby=${`${id}-heading`}>
      <h3 id=${`${id}-heading`}>${heading}</h3>
      <ul>${repeat(
        rows,
        (cone) => cone.id,
        (cone) => this.#row(cone)
      )}</ul>
    </section>`;
  }

  protected updated(): void {
    for (const tip of this.renderRoot.querySelectorAll<Tooltip>('swc-tooltip')) {
      tip.triggerElement = tip.previousElementSibling as HTMLElement;
    }
  }

  render(): TemplateResult {
    const rows = freezerOrder(this.model?.agent.frozen() ?? []);
    const starting = !rows.length && !!this.model?.agent.starting?.();
    return html`<div class="bar">
        <span>${starting ? 'Starting…' : `${rows.length} ${rows.length === 1 ? 'conversation' : 'conversations'}`}</span>
        ${
          this.importable
            ? html`<swc-action-button id="import-v6" size="s" quiet data-action="import-v6" accessible-label="Import from SLICC 6" @click=${() => this.#pick()}><swc-icon-import slot="icon"></swc-icon-import><span class="long">Import from SLICC 6</span><span class="short">Import</span></swc-action-button><swc-tooltip for="import-v6" placement="bottom">Import from SLICC 6</swc-tooltip><input type="file" accept=${['.zip', ...zipTypes].join(',')} hidden data-action="import-file" @change=${this.#picked} />`
            : nothing
        }
      </div>
      <div class="error" role="status" aria-live="polite" data-error="not-zip">${
        this.refused && this.importable
          ? html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond><span>${notZip}</span><swc-action-button size="s" quiet data-action="dismiss-not-zip" accessible-label="Dismiss" @click=${() => this.#dismiss()}><swc-icon-close slot="icon"></swc-icon-close></swc-action-button>`
          : nothing
      }</div>
      <div class="list">
        ${
          rows.length
            ? html`${this.#section(
                'live',
                'Live',
                rows.filter((cone) => cone.live)
              )}${this.#section(
                'frozen',
                'Frozen',
                rows.filter((cone) => !cone.live)
              )}`
            : starting
              ? html`<div class="note" data-empty="starting"><swc-progress-circle size="s" indeterminate label="Starting the agent"></swc-progress-circle>Conversations show up here once the agent starts.</div>`
              : html`<div class="note">No conversations yet. A new conversation or a deleted cone leaves the old one here.</div>`
        }
      </div>
      ${this.dropping ? html`<swc-dropzone dragged size="l" aria-label="Import from SLICC 6" dragged-message="Drop to import"><p>Drop to import</p></swc-dropzone>` : nothing}`;
  }
}
