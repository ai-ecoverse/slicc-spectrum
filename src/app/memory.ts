import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-delete.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Memory, MemoryTag, SliccModel } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { confirm } from './confirm.ts';
import { panelCss } from './files.ts';
import { markdown } from './markdown.ts';

export type TagFilter = MemoryTag | 'all' | 'untagged';

export function visible(
  memories: readonly Memory[],
  scope: string,
  tag: TagFilter,
  query: string
): Memory[] {
  const needle = query.trim().toLowerCase();
  return memories.filter(
    (memory) =>
      memory.scope === scope &&
      (tag === 'all' || (tag === 'untagged' ? memory.tag === null : memory.tag === tag)) &&
      (!needle || `${memory.title} ${memory.body} ${memory.section}`.toLowerCase().includes(needle))
  );
}

export const tagBadges: Record<MemoryTag, { label: string; variant: string }> = {
  user: { label: 'User', variant: 'fuchsia' },
  feedback: { label: 'Feedback', variant: 'seafoam' },
  project: { label: 'Project', variant: 'indigo' },
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
    open: { state: true },
    editing: { state: true },
  };
  declare query: string;
  declare tag: TagFilter;
  declare scope: string;
  declare open: string | null;
  declare editing: string | null;

  constructor() {
    super();
    this.query = '';
    this.tag = 'all';
    this.scope = 'global';
    this.open = null;
    this.editing = null;
  }

  static styles = [
    shared,
    panelCss,
    css`
      .tools {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100);
        align-items: center;
        padding: var(--swc-spacing-100);
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      sp-search {
        flex: 1;
        min-width: 120px;
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-200);
      }
      h3 {
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-content-color-default);
        margin: var(--swc-spacing-200) var(--swc-spacing-75) var(--swc-spacing-75);
      }
      .row {
        border-radius: var(--swc-corner-radius-medium-default);
        margin: var(--swc-spacing-75) 0;
        background: var(--swc-background-layer-1-color);
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
        align-items: start;
        width: 100%;
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        cursor: pointer;
      }
      .head:hover {
        background: var(--swc-gray-100);
      }
      .head:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
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
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-line-height-100);
      }
      .summary {
        grid-column: 1 / -1;
        color: var(--swc-neutral-subdued-content-color-default);
        line-height: var(--swc-line-height-100);
      }
      swc-badge {
        justify-self: end;
      }
      .body {
        padding: 0 var(--swc-spacing-200) var(--swc-spacing-100);
      }
      .body p {
        margin: var(--swc-spacing-75) 0;
      }
      .actions {
        display: flex;
        gap: var(--swc-spacing-75);
        padding: 0 var(--swc-spacing-100) var(--swc-spacing-100);
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
    this.focusOn('sp-search');
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

  #row(memory: Memory): TemplateResult {
    if (this.editing === memory.id)
      return html`<div class="row" data-id=${memory.id}>${this.#form(memory)}</div>`;
    const open = this.open === memory.id;
    return html`<div class="row" data-id=${memory.id}>
      <button class="head" aria-expanded=${open ? 'true' : 'false'} @click=${() => (this.open = open ? null : memory.id)}>
        <span class="title">${memory.title}</span>
        ${memory.tag ? html`<swc-badge size="s" variant=${tagBadges[memory.tag].variant}>${tagBadges[memory.tag].label}</swc-badge>` : nothing}
        ${open ? nothing : html`<span class="summary">${memory.body}</span>`}
      </button>
      ${
        open
          ? html`<div class="body">${markdown(memory.body)}</div>
            <div class="actions">
              <swc-action-button size="s" quiet @click=${() => (this.editing = memory.id)}>
                <swc-icon-edit slot="icon"></swc-icon-edit>Edit
              </swc-action-button>
              <swc-action-button size="s" quiet @click=${() => this.#forget(memory)}>
                <swc-icon-delete slot="icon"></swc-icon-delete>Forget
              </swc-action-button>
            </div>`
          : nothing
      }
    </div>`;
  }

  render(): TemplateResult {
    const model = this.model;
    const all = model?.memory.list() ?? [];
    const shown = visible(all, this.scope, this.tag, this.query);
    const cones = (model?.agent.list() ?? []).filter((agent) => agent.kind === 'cone');
    return html`<div class="bar"><span>${shown.length} of ${all.filter((memory) => memory.scope === this.scope).length} memories</span><span class="spacer"></span>
        <swc-action-button size="s" quiet @click=${() => (this.editing = 'new')}><swc-icon-add slot="icon"></swc-icon-add>Remember</swc-action-button>
      </div>
      <div class="tools">
        <sp-search size="s" label="Search memories" placeholder="Search memories" .value=${this.query} @input=${(event: Event) => (this.query = (event.target as HTMLInputElement).value)} @submit=${(event: Event) => event.preventDefault()}></sp-search>
        <sp-picker size="s" label="Scope" value=${this.scope} @change=${(event: Event) => (this.scope = (event.target as HTMLInputElement).value)}>
          <sp-menu-item value="global">Everyone</sp-menu-item>
          ${cones.map((cone) => html`<sp-menu-item value=${cone.id}>${cone.name}</sp-menu-item>`)}
        </sp-picker>
        <sp-picker size="s" label="Tag" value=${this.tag} @change=${(event: Event) => (this.tag = (event.target as HTMLInputElement).value as TagFilter)}>
          <sp-menu-item value="all">All tags</sp-menu-item>
          <sp-menu-item value="user">User</sp-menu-item>
          <sp-menu-item value="feedback">Feedback</sp-menu-item>
          <sp-menu-item value="project">Project</sp-menu-item>
          <sp-menu-item value="untagged">No tag</sp-menu-item>
        </sp-picker>
      </div>
      <div class="list">
        ${this.editing === 'new' ? html`<div class="row">${this.#form({ scope: this.scope })}</div>` : nothing}
        ${
          shown.length
            ? sections(shown).map(
                ([section, items]) =>
                  html`<h3>${section}</h3>${items.map((memory) => this.#row(memory))}`
              )
            : html`<div class="note">${all.length ? 'No memories match.' : 'No memories yet.'}</div>`
        }
      </div>`;
  }
}
