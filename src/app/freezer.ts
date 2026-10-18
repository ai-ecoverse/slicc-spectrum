import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/dropzone/swc-dropzone.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, FrozenCone, FrozenKind, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { carriesFiles } from './chat.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';
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

export const frozenKinds: Record<FrozenKind, readonly ['indigo' | 'seafoam' | 'purple', string]> = {
  cone: ['indigo', 'Cone'],
  scoop: ['seafoam', 'Scoop'],
  agent: ['purple', 'Agent run'],
};

export function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || /zip/.test(file.type);
}

export function freezerOrder(rows: readonly FrozenCone[]): FrozenCone[] {
  return [...rows].sort((a, b) => Number(!!b.live) - Number(!!a.live) || b.frozenAt - a.frozenAt);
}

export class SliccFreezer extends ModelElement {
  static properties = { ...ModelElement.properties, dropping: { state: true } };
  declare dropping: boolean;
  #scroll = new ViewScroll(this, 'freezer:scroll', {
    scroller: () => this.renderRoot.querySelector<HTMLElement>('.list'),
    rows: '.card[data-id]',
  });
  constructor() {
    super();
    this.dropping = false;
    this.addEventListener('dragenter', this.#over);
    this.addEventListener('dragover', this.#over);
    this.addEventListener('dragleave', this.#leave);
    this.addEventListener('drop', this.#drop);
  }

  static styles = [
    shared,
    panelCss,
    css`
      :host {
        position: relative;
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
        padding: var(--swc-spacing-100);
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-content: start;
        gap: var(--swc-spacing-100);
      }
      .card {
        display: grid;
        gap: var(--swc-spacing-50);
        border-radius: var(--swc-corner-radius-medium-default);
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        background: var(--swc-background-layer-1-color);
      }
      .card:focus {
        outline: none;
      }
      .card:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      .name {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-100);
        font-weight: var(--swc-bold-font-weight);
      }
      .title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        line-height: var(--swc-line-height-100);
      }
      .meta {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .name swc-status-light {
        font-weight: normal;
      }
      .actions {
        display: flex;
        gap: var(--swc-spacing-75);
        margin-inline-start: calc(-1 * var(--swc-spacing-100));
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [
      model.agent.on('frozen', update),
      model.agent.on('active', update),
      model.agent.on('agents', update),
      ...onWatch(model, update),
    ];
  }

  focus(): void {
    this.focusOn('.card swc-action-button', 'swc-action-button');
  }

  get importable(): boolean {
    const model = this.model;
    return !!model?.agent.importProfile && !watchOnly(model) && !model.seat;
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
    const file = [...(event.dataTransfer as DataTransfer).files].find(isZip);
    if (file) void this.#import(file, this);
  };

  #pick(): void {
    this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
  }

  #picked(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const trigger = this.renderRoot.querySelector<HTMLElement>('[data-action=import-v6]');
    if (file) void this.#import(file, trigger);
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
    const card = [...this.renderRoot.querySelectorAll<HTMLElement>('.card[data-id]')].find(
      (row) => row.dataset.id === first
    );
    card?.scrollIntoView({ block: 'nearest' });
    card?.focus();
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

  #actions(cone: FrozenCone): TemplateResult {
    const model = this.model as SliccModel;
    if (cone.live) {
      return html`<swc-action-button size="s" quiet data-action="open" accessible-label=${`Open ${this.#named(cone)}`} @click=${() => model.agent.select(cone.id)}>Open</swc-action-button>`;
    }
    if (watchOnly(model)) return html``;
    return html`<swc-action-button size="s" quiet data-action="thaw" accessible-label=${`Thaw ${this.#named(cone)}`} @click=${() => model.agent.thaw(cone.id)}>Thaw</swc-action-button>
      <swc-action-button size="s" quiet data-action="remove" accessible-label=${`Remove ${this.#named(cone)}`} @click=${(event: Event) => this.#remove(cone, event.currentTarget as HTMLElement)}>Remove</swc-action-button>`;
  }

  #card(cone: FrozenCone): TemplateResult {
    const model = this.model as SliccModel;
    const label =
      model.settings.models().find((option) => option.id === cone.model)?.label ?? cone.model;
    const kind = frozenKinds[cone.kind ?? 'cone'];
    const meta = [
      `${cone.messages} ${cone.messages === 1 ? 'message' : 'messages'}`,
      ...(cone.live ? [] : [`frozen ${ago(cone.frozenAt)}`]),
      ...(cone.thawedAs ? [`thawed as ${this.#thawedAs(cone.thawedAs)}`] : []),
    ];
    return html`<div class="card" tabindex="-1" data-id=${cone.id} data-kind=${cone.kind ?? 'cone'} ?data-live=${cone.live} ?data-v6=${cone.v6}>
      <div class="name">${cone.name}<swc-badge size="s" variant=${kind[0]} subtle data-badge="kind">${kind[1]}</swc-badge>${cone.v6 ? html`<swc-badge size="s" variant="neutral" subtle data-badge="v6">SLICC 6</swc-badge>` : nothing}<swc-badge size="s" variant="neutral" subtle>${label}</swc-badge>${cone.live ? html`<swc-status-light size="s" variant="positive" data-live>Live</swc-status-light>` : nothing}</div>
      <div class="title" title=${cone.title}>${cone.title}</div>
      <div class="meta">${meta.join(' · ')}</div>
      <div class="actions">${this.#actions(cone)}</div>
    </div>`;
  }

  render(): TemplateResult {
    const rows = freezerOrder(this.model?.agent.frozen() ?? []);
    return html`<div class="bar">
        <span>${rows.length} ${rows.length === 1 ? 'conversation' : 'conversations'}</span>
        ${
          this.importable
            ? html`<swc-action-button size="s" quiet data-action="import-v6" @click=${() => this.#pick()}>Import from SLICC 6…</swc-action-button><input type="file" accept=".zip,application/zip" hidden data-action="import-file" @change=${this.#picked} />`
            : nothing
        }
      </div>
      <div class="list">
        ${rows.length ? rows.map((cone) => this.#card(cone)) : html`<div class="note">No conversations yet. A new conversation or a deleted cone leaves the old one here.</div>`}
      </div>
      ${this.dropping ? html`<swc-dropzone dragged size="l" aria-label="Import from SLICC 6" dragged-message="Drop to import"><p>Drop to import</p></swc-dropzone>` : nothing}`;
  }
}
