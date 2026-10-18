import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { Memory, MemoryScope, MemoryTag, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';
import { markdown } from './markdown.ts';
import { search, searchCss } from './search.ts';
import { ViewScroll, ViewState } from './view-state.ts';

export type TagFilter = MemoryTag | 'all' | 'untagged';

export const everyone = '*';

export function visible(
  memories: readonly Memory[],
  scope: string,
  tag: TagFilter,
  query: string
): Memory[] {
  const needle = query.trim().toLowerCase();
  return memories.filter(
    (memory) =>
      (scope === everyone || memory.scope === scope) &&
      (tag === 'all' || (tag === 'untagged' ? memory.tag === null : memory.tag === tag)) &&
      (!needle || `${memory.title} ${memory.body} ${memory.section}`.toLowerCase().includes(needle))
  );
}

export function inScope(memories: readonly Memory[], scope: string): number {
  return scope === everyone
    ? memories.length
    : memories.filter((memory) => memory.scope === scope).length;
}

export function emptyNote(total: number, filtered: boolean, scope: MemoryScope | null): string {
  if (filtered && total) return 'No memories match.';
  if (!scope) return 'No memories yet.';
  if (scope.id === 'global') return 'No shared memories yet.';
  return `No memories for ${scope.label} yet.`;
}

export function scopeLabel(scope: MemoryScope): MemoryScope {
  return scope.id === 'global' ? { ...scope, label: 'Shared' } : scope;
}

export const scopeGroups = { cones: 'Cones', roles: 'Roles' } as const;

export const tagLabels: Record<MemoryTag, string> = {
  user: 'User',
  feedback: 'Feedback',
  project: 'Project',
};

export const tagVariants: Record<MemoryTag, string> = {
  user: 'indigo',
  feedback: 'purple',
  project: 'seafoam',
};

export function sections(memories: readonly Memory[]): Array<[string, Memory[]]> {
  const groups = new Map<string, Memory[]>();
  for (const memory of memories)
    groups.set(memory.section, [...(groups.get(memory.section) ?? []), memory]);
  return [...groups];
}

export class SliccMemory extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    query: { state: true },
    tag: { state: true },
    scope: { state: true },
    editing: { state: true },
  };
  declare query: string;
  declare tag: TagFilter;
  declare scope: string;
  declare editing: string | null;
  #open = new ViewState<string | null>(this, 'memory', () => null);
  #scroll = new ViewScroll(this, 'memory:scroll', {
    scroller: () => this.renderRoot.querySelector<HTMLElement>('.list'),
    rows: '.row[data-id]',
    current: '.row[data-open]',
  });

  constructor() {
    super();
    this.query = '';
    this.tag = 'all';
    this.scope = everyone;
    this.editing = null;
  }

  get open(): string | null {
    return this.#open.value;
  }

  set open(value: string | null) {
    this.#open.value = value;
  }

  static styles = [
    shared,
    panelCss,
    searchCss,
    css`
      :host {
        container-type: inline-size;
      }
      .tools {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--swc-spacing-100);
        align-items: center;
        flex: none;
        padding: var(--swc-spacing-100);
      }
      .tools sp-search {
        grid-column: 1 / -1;
      }
      .tools sp-picker {
        width: 100%;
        min-width: 0;
      }
      @container (min-width: 560px) {
        .tools {
          grid-template-columns: minmax(0, 1fr) auto auto;
        }
        .tools sp-search {
          grid-column: auto;
        }
        .tools sp-picker {
          width: auto;
        }
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-50) var(--swc-spacing-100) var(--swc-spacing-200);
      }
      section,
      ul {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-50);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      h3 {
        margin: 0;
        padding: var(--swc-spacing-50) var(--swc-spacing-100) 0;
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .row {
        border-radius: var(--swc-corner-radius-medium-default);
      }
      .row[data-open] {
        background: var(--swc-accent-subtle-background-color-default);
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        column-gap: var(--swc-spacing-75);
        row-gap: var(--swc-spacing-50);
        align-items: start;
        width: 100%;
        padding: var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-medium-default);
        cursor: pointer;
      }
      .row:not([data-open]) .head:hover {
        background: var(--swc-gray-100);
      }
      .head:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .lead {
        display: flex;
        align-items: center;
        height: 1lh;
        line-height: var(--swc-line-height-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .chevron {
        transition: transform var(--swc-animation-duration-100);
      }
      .row[data-open] .chevron {
        transform: rotate(90deg);
      }
      .head > :not(.lead) {
        grid-column: 2;
      }
      .title,
      .summary {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .title {
        grid-row: 1;
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-line-height-100);
      }
      .summary {
        color: var(--swc-neutral-subdued-content-color-default);
        line-height: var(--swc-line-height-100);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .body {
        padding: 0 var(--swc-spacing-100) var(--swc-spacing-50) var(--swc-spacing-400);
      }
      .body p {
        margin: var(--swc-spacing-75) 0;
      }
      .actions {
        display: flex;
        gap: var(--swc-spacing-75);
        padding: 0 var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-300);
      }
      .editor {
        display: grid;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100);
      }
      .editor sp-textfield {
        width: 100%;
      }
      .editor .actions {
        padding: 0;
      }
      code {
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-code-size-xs);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const update = () => this.requestUpdate();
    return [model.memory.on('memories', update), model.agent.on('agents', update)];
  }

  focus(): void {
    this.focusOn('.head', '.bar swc-action-button');
  }

  #save(memory: Partial<Memory>): void {
    const form = this.renderRoot.querySelector('.editor') as HTMLElement;
    const field = (name: string) =>
      (form.querySelector(`[name=${name}]`) as HTMLInputElement).value.trim();
    if (!field('title')) return;
    const tag = field('tag');
    const saved = this.model?.memory.save({
      ...(memory.id ? { id: memory.id } : {}),
      scope: memory.scope as string,
      section: field('section') || 'Notes',
      title: field('title'),
      body: field('body'),
      tag: tag !== 'none' ? (tag as MemoryTag) : null,
    });
    this.editing = null;
    this.open = saved?.id ?? null;
  }

  #form(memory: Partial<Memory>): TemplateResult {
    return html`<div class="editor">
      <sp-textfield size="s" name="title" placeholder="Title" label="Title" .value=${memory.title ?? ''}></sp-textfield>
      <sp-textfield size="s" name="section" placeholder="Section" label="Section" .value=${memory.section ?? ''}></sp-textfield>
      <sp-picker size="s" name="tag" label="Tag" value=${memory.tag ?? 'none'}>
        <sp-menu-item value="none">No tag</sp-menu-item>
        <sp-menu-item value="user">User</sp-menu-item>
        <sp-menu-item value="feedback">Feedback</sp-menu-item>
        <sp-menu-item value="project">Project</sp-menu-item>
      </sp-picker>
      <sp-textfield size="s" name="body" multiline grows label="Memory" placeholder="What to remember" .value=${memory.body ?? ''}></sp-textfield>
      <div class="actions">
        <swc-button size="s" variant="accent" @click=${() => this.#save(memory)}>Save</swc-button>
        <swc-button size="s" variant="secondary" fill-style="outline" @click=${() => (this.editing = null)}>Cancel</swc-button>
      </div>
    </div>`;
  }

  async #forget(memory: Memory): Promise<void> {
    const body = 'Agents won’t remember this anymore. You can’t undo this.';
    if (await confirm({ title: `Forget “${memory.title}”?`, body, action: 'Forget' }))
      this.model?.memory.remove(memory.id);
  }

  #scopeName(id: string): string {
    return this.#scopes.find((item) => item.id === id)?.label ?? id;
  }

  #meta(memory: Memory): TemplateResult | typeof nothing {
    const scope = this.scope === everyone;
    const notes = memory.source === 'notes';
    if (!memory.tag && !scope && !notes) return nothing;
    return html`<span class="meta">
      ${memory.tag ? html`<swc-badge size="s" variant=${tagVariants[memory.tag]} subtle data-tag=${memory.tag}>${tagLabels[memory.tag]}</swc-badge>` : nothing}
      ${scope ? html`<span class="scope" data-scope=${memory.scope}>${this.#scopeName(memory.scope)}</span>` : nothing}
      ${notes ? html`<span class="from">From MEMORY.md</span>` : nothing}
    </span>`;
  }

  #row(memory: Memory): TemplateResult {
    if (this.editing === memory.id)
      return html`<li class="row" data-id=${memory.id}>${this.#form(memory)}</li>`;
    const open = this.open === memory.id;
    return html`<li class="row" data-id=${memory.id} ?data-open=${open}>
      <button class="head" aria-expanded=${open ? 'true' : 'false'} @click=${() => (this.open = open ? null : memory.id)}>
        <span class="lead"><swc-icon-chevron-right class="chevron" size="s" aria-hidden="true"></swc-icon-chevron-right></span>
        <span class="title">${memory.title}</span>
        ${open ? nothing : html`<span class="summary">${memory.body}</span>`}
        ${this.#meta(memory)}
      </button>
      ${
        open
          ? html`<div class="body">${markdown(memory.body)}</div>
            <div class="actions">
              <swc-action-button size="s" quiet data-action="edit" @click=${() => (this.editing = memory.id)}>
                <swc-icon-edit slot="icon"></swc-icon-edit>Edit
              </swc-action-button>
              <swc-action-button size="s" quiet data-action="forget" @click=${() => this.#forget(memory)}>
                <swc-icon-delete slot="icon"></swc-icon-delete>Forget
              </swc-action-button>
            </div>`
          : nothing
      }
    </li>`;
  }

  #scopes: readonly MemoryScope[] = [];

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const model = this.model;
    this.#scopes = (
      model?.memory.scopes?.() ?? [
        { id: 'global', label: 'Shared' },
        ...(model?.agent.list() ?? [])
          .filter((agent) => agent.kind === 'cone')
          .map((cone) => ({ id: cone.id, label: cone.name })),
      ]
    ).map(scopeLabel);
    if (this.scope !== everyone && !this.#scopes.some((item) => item.id === this.scope))
      this.scope = everyone;
  }

  render(): TemplateResult {
    const all = this.model?.memory.list() ?? [];
    const scopes = this.#scopes;
    const scope = this.scope;
    const option = (item: MemoryScope) =>
      html`<sp-menu-item value=${item.id}>${item.label}</sp-menu-item>`;
    const shown = visible(all, scope, this.tag, this.query);
    const total = inScope(all, scope);
    const filtered = this.tag !== 'all' || this.query.trim() !== '';
    const current = scopes.find((item) => item.id === scope) ?? null;
    return html`<div class="bar"><span>${shown.length} of ${total} memories</span><span class="spacer"></span>
        <swc-action-button size="s" quiet data-action="remember" @click=${() => (this.editing = 'new')}><swc-icon-add slot="icon"></swc-icon-add>Remember</swc-action-button>
      </div>
      <div class="tools">
        ${search({ label: 'Search memories', value: this.query, input: (value) => (this.query = value) })}
        <sp-picker size="s" label="Scope" data-action="scope" value=${scope} @change=${(event: Event) => (this.scope = (event.target as HTMLInputElement).value)}>
          <sp-menu-item value=${everyone}>Everyone</sp-menu-item>
          ${scopes.filter((item) => !item.group).map(option)}
          ${(['cones', 'roles'] as const).map((group) => {
            const items = scopes.filter((item) => item.group === group);
            return items.length
              ? html`<sp-menu-group size="s"><span slot="header">${scopeGroups[group]}</span>${items.map(option)}</sp-menu-group>`
              : nothing;
          })}
        </sp-picker>
        <sp-picker size="s" label="Tag" data-action="tag" value=${this.tag} @change=${(event: Event) => (this.tag = (event.target as HTMLInputElement).value as TagFilter)}>
          <sp-menu-item value="all">All tags</sp-menu-item>
          <sp-menu-item value="user">User</sp-menu-item>
          <sp-menu-item value="feedback">Feedback</sp-menu-item>
          <sp-menu-item value="project">Project</sp-menu-item>
          <sp-menu-item value="untagged">No tag</sp-menu-item>
        </sp-picker>
      </div>
      <div class="list">
        ${this.editing === 'new' ? html`<div class="row">${this.#form({ scope: scope === everyone ? 'global' : scope })}</div>` : nothing}
        ${
          shown.length
            ? sections(shown).map(
                ([section, items]) =>
                  html`<section><h3>${section}</h3><ul>${items.map((memory) => this.#row(memory))}</ul></section>`
              )
            : html`<div class="note">${emptyNote(total, filtered, current)}</div>`
        }
      </div>`;
  }
}
