import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-briefcase.js';
import '@adobe/spectrum-wc-icons/swc-icon-comment.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import '@adobe/spectrum-wc-icons/swc-icon-edit.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-user.js';
import '@adobe/spectrum-wc-icons/swc-icon-people-group.js';
import '@adobe/spectrum-wc-icons/swc-icon-user.js';
import '@adobe/spectrum-wc-icons/swc-icon-user-settings.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { Memory, MemoryScope, MemoryTag, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';
import { chevron } from './disclosure.ts';
import { panelCss } from './files.ts';
import { markdown, markdownCss } from './markdown.ts';
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

export const tagIcons: Record<MemoryTag, TemplateResult> = {
  user: html`<swc-icon-file-user size="s" aria-hidden="true"></swc-icon-file-user>`,
  feedback: html`<swc-icon-comment size="s" aria-hidden="true"></swc-icon-comment>`,
  project: html`<swc-icon-briefcase size="s" aria-hidden="true"></swc-icon-briefcase>`,
};

export type ScopeKind = 'shared' | 'cone' | 'role';

export const scopeIcons: Record<ScopeKind, TemplateResult> = {
  shared: html`<swc-icon-people-group size="s" aria-hidden="true"></swc-icon-people-group>`,
  cone: html`<swc-icon-user size="s" aria-hidden="true"></swc-icon-user>`,
  role: html`<swc-icon-user-settings size="s" aria-hidden="true"></swc-icon-user-settings>`,
};

export function scopeKind(scope: MemoryScope): ScopeKind {
  if (scope.id === 'global') return 'shared';
  return scope.group === 'roles' || scope.id.startsWith('role:') ? 'role' : 'cone';
}

export function scopeMark(scope: MemoryScope): string {
  return scope.id === 'global' ? 'Shared' : `${scope.label} only`;
}

export function tagRepeated(tag: MemoryTag, section: string, filter: TagFilter): boolean {
  return filter === tag || section.trim().toLowerCase().replace(/s$/, '') === tag;
}

interface Mark {
  kind: 'tag' | 'from' | 'scope';
  label: string;
  icon: TemplateResult;
  tag?: MemoryTag;
  scope?: string;
}

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
    markdownCss,
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
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-200);
        interpolate-size: allow-keywords;
      }
      section {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-75);
      }
      ul {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      h3 {
        margin: 0;
        padding: 0 var(--swc-spacing-100);
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-line-height-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .row {
        --lead: var(--swc-spacing-300);
        --indent: calc(var(--swc-spacing-100) + var(--lead) + var(--swc-spacing-75));
        position: relative;
        border-radius: var(--swc-corner-radius-medium-default);
      }
      li.row + li.row::before {
        content: '';
        position: absolute;
        inset-block-start: 0;
        inset-inline: 0;
        block-size: var(--swc-border-width-100);
        background: var(--swc-gray-200);
        pointer-events: none;
      }
      .row:not([data-open]):hover,
      .row[data-open] .head:hover {
        background: var(--swc-gray-100);
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: var(--lead) minmax(0, 1fr) auto;
        column-gap: var(--swc-spacing-75);
        align-items: start;
        width: 100%;
        padding: var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-50);
        border-radius: var(--swc-corner-radius-medium-default);
        line-height: var(--swc-line-height-100);
        cursor: pointer;
      }
      .head:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .lead {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 1lh;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .chevron {
        transition: transform var(--swc-animation-duration-100) var(--swc-animation-ease-in-out);
      }
      .row[data-open] .chevron {
        transform: rotate(90deg);
      }
      :host(:dir(rtl)) .row:not([data-open]) .chevron {
        transform: scaleX(-1);
      }
      .title {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        font-weight: var(--swc-bold-font-weight);
      }
      .marks {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
        height: 1lh;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .mark {
        display: inline-flex;
      }
      .row[data-open] .head :is(.tag, .scope) {
        visibility: hidden;
      }
      .content {
        overflow: hidden;
        max-height: calc(2lh + var(--swc-spacing-100));
        margin: 0 var(--swc-spacing-100) var(--swc-spacing-100) var(--indent);
        line-height: var(--swc-line-height-100);
        color: var(--swc-neutral-subdued-content-color-default);
        overflow-wrap: anywhere;
        cursor: pointer;
      }
      .row[data-open] .content {
        max-height: none;
        cursor: auto;
      }
      @supports (height: calc-size(auto, size)) {
        .content {
          max-height: none;
          height: calc-size(auto, min(size, 2lh + var(--swc-spacing-100)));
          transition: height var(--swc-animation-duration-100) var(--swc-animation-ease-in-out);
        }
        .row[data-open] .content {
          height: calc-size(auto, size);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .content,
        .chevron {
          transition: none;
        }
      }
      .row:not([data-open]) .body {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .body.markdown :is(p, ul, ol, .table, pre, blockquote) {
        margin-block: var(--swc-spacing-100);
      }
      .body.markdown > :first-child {
        margin-block-start: 0;
      }
      .body.markdown > :last-child {
        margin-block-end: 0;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--swc-spacing-75);
        padding-block-start: var(--swc-spacing-100);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-50) var(--swc-spacing-200);
        margin-inline-end: auto;
        font-size: var(--swc-font-size-75);
      }
      .meta .label {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      .buttons {
        display: flex;
        gap: var(--swc-spacing-75);
        margin-inline-start: auto;
      }
      .actions [data-action='forget'] {
        --swc-action-button-content-color-default: var(--swc-negative-content-color-default);
        --swc-action-button-content-color-hover: var(--swc-negative-content-color-hover);
        --swc-action-button-content-color-down: var(--swc-negative-content-color-down);
        --swc-action-button-content-color-focus: var(--swc-negative-content-color-key-focus);
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
      .markdown :not(pre) > code {
        font-size: 0.85em;
        padding: 0 var(--swc-spacing-50);
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

  async #forget(memory: Memory, trigger: HTMLElement): Promise<void> {
    const body = 'Agents won’t remember this anymore. You can’t undo this.';
    const title = `Forget “${memory.title}”?`;
    if (await confirm({ title, body, action: 'Forget', variant: 'destructive', trigger }))
      this.model?.memory.remove(memory.id);
  }

  #scopeOf(id: string): MemoryScope {
    return this.#scopes.find((item) => item.id === id) ?? { id, label: id };
  }

  #marks(memory: Memory, section: string): Mark[] {
    const marks: Mark[] = [];
    const tag = memory.tag;
    if (tag && !tagRepeated(tag, section, this.tag))
      marks.push({ kind: 'tag', label: tagLabels[tag], icon: tagIcons[tag], tag });
    if (memory.source === 'notes')
      marks.push({
        kind: 'from',
        label: 'From MEMORY.md',
        icon: html`<swc-icon-file-text size="s" aria-hidden="true"></swc-icon-file-text>`,
      });
    if (this.scope === everyone) {
      const scope = this.#scopeOf(memory.scope);
      marks.push({
        kind: 'scope',
        label: scopeMark(scope),
        icon: scopeIcons[scopeKind(scope)],
        scope: memory.scope,
      });
    }
    return marks;
  }

  #meta(marks: Mark[]): TemplateResult | typeof nothing {
    const labelled = marks.filter((mark) => mark.kind !== 'from');
    return labelled.length
      ? html`<div class="meta">${labelled.map(
          (mark) =>
            html`<span class="label" data-label=${mark.kind}>${mark.icon}${mark.label}</span>`
        )}</div>`
      : nothing;
  }

  #row(memory: Memory, section: string): TemplateResult {
    if (this.editing === memory.id)
      return html`<li class="row" data-id=${memory.id}>${this.#form(memory)}</li>`;
    const open = this.open === memory.id;
    const toggle = () => (this.open = open ? null : memory.id);
    const marks = this.#marks(memory, section);
    const id = (mark: Mark) => `${mark.kind}-${memory.id}`;
    return html`<li class="row" data-id=${memory.id} ?data-open=${open}>
      <button class="head" aria-expanded=${open ? 'true' : 'false'} aria-controls=${`content-${memory.id}`} @click=${toggle}>
        <span class="lead">${chevron}</span>
        <span class="title">${memory.title}</span>
        <span class="marks">${marks.map(
          (mark) =>
            html`<span class="mark ${mark.kind}" id=${id(mark)} role="img" aria-label=${mark.label} data-tag=${mark.tag ?? nothing} data-scope=${mark.scope ?? nothing}>${mark.icon}</span>`
        )}</span>
      </button>
      ${marks.map((mark) => html`<swc-tooltip for=${id(mark)} placement="top">${mark.label}</swc-tooltip>`)}
      <div class="content" id=${`content-${memory.id}`} @click=${() => open || toggle()}>
        <div class="body markdown">${markdown(memory.body)}</div>
        ${
          open
            ? html`<div class="actions">
              ${this.#meta(marks)}
              <div class="buttons">
              <swc-action-button size="s" quiet data-action="edit" @click=${() => (this.editing = memory.id)}>
                <swc-icon-edit slot="icon"></swc-icon-edit>Edit
              </swc-action-button>
              <swc-action-button size="s" quiet data-action="forget" @click=${(event: Event) => this.#forget(memory, event.currentTarget as HTMLElement)}>
                <swc-icon-delete slot="icon"></swc-icon-delete>Forget
              </swc-action-button>
              </div>
            </div>`
            : nothing
        }
      </div>
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
                  html`<section><h3>${section}</h3><ul>${items.map((memory) => this.#row(memory, section))}</ul></section>`
              )
            : html`<div class="note">${emptyNote(total, filtered, current)}</div>`
        }
      </div>`;
  }
}
