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
        gap: 6px;
        align-items: center;
        padding: 6px 8px;
        border-bottom: 1px solid var(--spectrum-gray-200);
      }
      sp-search {
        flex: 1;
        min-width: 120px;
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 8px 12px;
      }
      h3 {
        font-size: var(--spectrum-font-size-50);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--spectrum-neutral-subdued-content-color-default);
        margin: 10px 4px 4px;
      }
      .row {
        border: 1px solid var(--spectrum-gray-200);
        border-radius: var(--spectrum-corner-radius-75);
        margin: 4px 0;
        background: var(--spectrum-background-layer-1-color);
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: flex;
        gap: 8px;
        align-items: baseline;
        width: 100%;
        padding: 5px 8px;
        cursor: pointer;
      }
      .head:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
        outline-offset: -2px;
      }
      .head strong {
        flex: none;
      }
      .summary {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .tag {
        flex: none;
        font-size: var(--spectrum-font-size-50);
        border-radius: 3px;
        padding: 0 5px;
        background: var(--spectrum-gray-200);
      }
      .body {
        padding: 0 10px 8px;
      }
      .body p {
        margin: 4px 0;
      }
      .actions {
        display: flex;
        gap: 4px;
        padding: 0 6px 6px;
      }
      .editor {
        display: grid;
        gap: 6px;
        padding: 8px;
      }
      .editor sp-textfield {
        width: 100%;
      }
      code {
        font-family: var(--spectrum-code-font-family-stack, monospace);
        font-size: var(--spectrum-font-size-75);
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
        <sp-button size="s" variant="accent" @click=${() => this.#save(memory)}>Save</sp-button>
        <sp-button size="s" variant="secondary" treatment="outline" @click=${() => (this.editing = null)}>Cancel</sp-button>
      </div>
    </div>`;
  }

  async #forget(memory: Memory): Promise<void> {
    const body = "Agents won't remember this anymore. You can't undo this.";
    if (await confirm({ title: `Forget “${memory.title}”?`, body, action: 'Forget' }))
      this.model?.memory.remove(memory.id);
  }

  #row(memory: Memory): TemplateResult {
    if (this.editing === memory.id)
      return html`<div class="row" data-id=${memory.id}>${this.#form(memory)}</div>`;
    const open = this.open === memory.id;
    return html`<div class="row" data-id=${memory.id}>
      <button class="head" aria-expanded=${open ? 'true' : 'false'} @click=${() => (this.open = open ? null : memory.id)}>
        <strong>${memory.title}</strong>
        <span class="summary">${memory.body}</span>
        ${memory.tag ? html`<span class="tag">${memory.tag}</span>` : nothing}
      </button>
      ${
        open
          ? html`<div class="body">${markdown(memory.body)}</div>
            <div class="actions">
              <sp-action-button size="s" quiet @click=${() => (this.editing = memory.id)}>Edit</sp-action-button>
              <sp-action-button size="s" quiet @click=${() => this.#forget(memory)}>Forget</sp-action-button>
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
        <sp-action-button size="s" quiet @click=${() => (this.editing = 'new')}><swc-icon-add slot="icon"></swc-icon-add>Remember</sp-action-button>
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
