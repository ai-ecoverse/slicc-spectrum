import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-add.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-left.js';
import '@adobe/spectrum-wc-icons/swc-icon-people-group.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type {
  SliccModel,
  SupportConversation,
  SupportMessage,
  SupportPort,
  SupportThread,
} from '../model/types.ts';
import { since } from './approvals-panel.ts';
import { ModelElement, shared } from './base.ts';
import { errorCss, panelCss } from './files.ts';
import { markdown, markdownCss } from './markdown.ts';
import { ViewState } from './view-state.ts';

export const titleLimit = 120;
export const bodyLimit = 2000;
export const newRequest = 'new';

export function supportOffered(model: SliccModel | null | undefined): boolean {
  return !!model?.support && model.support.status().state !== 'not-enrolled';
}

export function unreadLabel(count: number): string {
  return `${count} unread`;
}

export function audienceNote(audience: string | undefined): string {
  return `${audience ?? 'Your team and Adobe Support'} can read this. Only what you write here is sent.`;
}

export function validTitle(title: string): boolean {
  const trimmed = title.trim();
  return !!trimmed && !/[\r\n]/.test(trimmed) && trimmed.length <= titleLimit;
}

export function validBody(body: string): boolean {
  return !!body.trim() && body.length <= bodyLimit;
}

export function newKey(): string {
  return crypto.randomUUID();
}

export class IntentKeys {
  #keys = new Map<string, { payload: string; key: string }>();

  key(intent: string, payload: unknown): string {
    const text = JSON.stringify(payload);
    const saved = this.#keys.get(intent);
    if (saved?.payload === text) return saved.key;
    const key = newKey();
    this.#keys.set(intent, { payload: text, key });
    return key;
  }

  done(intent: string): void {
    this.#keys.delete(intent);
  }
}

function sendKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey);
}

export class SliccSupport extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    conversation: { state: true },
    loading: { state: true },
    sending: { state: true },
    error: { state: true },
    subject: { state: true },
    body: { state: true },
    topic: { state: true },
    replies: { state: true },
  };
  declare conversation: SupportConversation | null;
  declare loading: boolean;
  declare sending: boolean;
  declare error: string | null;
  declare subject: string;
  declare body: string;
  declare topic: string;
  declare replies: ReadonlyMap<string, string>;
  #open = new ViewState<string | null>(this, 'support', () => null);
  #keys = new IntentKeys();
  #loads = 0;
  #reading = new Set<string>();
  #port: SupportPort | null = null;

  constructor() {
    super();
    this.conversation = null;
    this.loading = false;
    this.sending = false;
    this.error = null;
    this.subject = '';
    this.body = '';
    this.topic = '';
    this.replies = new Map();
  }

  get open(): string | null {
    return this.#open.value;
  }

  set open(value: string | null) {
    if (value === this.#open.value) return;
    this.#open.value = value;
    this.error = null;
    this.conversation = null;
    void this.#load();
  }

  static styles = [
    shared,
    panelCss,
    errorCss,
    markdownCss,
    css`
      .bar {
        gap: var(--swc-spacing-75);
      }
      .bar .heading {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-content-color-default);
      }
      .bar swc-badge {
        flex: none;
      }
      .offline {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        flex: none;
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-75) var(--swc-spacing-200);
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
        color: var(--swc-neutral-subdued-content-color-default);
        white-space: normal;
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        margin: 0;
        padding: var(--swc-spacing-100);
        list-style: none;
      }
      .row {
        position: relative;
      }
      .row + .row::before {
        content: '';
        position: absolute;
        inset-block-start: 0;
        inset-inline: var(--swc-spacing-100);
        block-size: var(--swc-border-width-100);
        background: var(--swc-gray-200);
        pointer-events: none;
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
        width: 100%;
        padding: var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-medium-default);
        line-height: var(--swc-line-height-100);
        cursor: pointer;
      }
      .head:hover {
        background: var(--swc-gray-100);
      }
      .head:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .title {
        overflow: hidden;
        overflow-wrap: anywhere;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .row[data-unread] .title {
        font-weight: var(--swc-bold-font-weight);
      }
      .marks {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
        height: 1lh;
      }
      .when {
        grid-column: 1 / -1;
        font-size: var(--swc-font-size-50);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200) var(--swc-spacing-200) var(--swc-spacing-100);
      }
      .message {
        display: grid;
        gap: var(--swc-spacing-50);
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        line-height: var(--swc-line-height-100);
        overflow-wrap: anywhere;
      }
      .message[data-author='support'] {
        background: var(--swc-gray-100);
      }
      .byline {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
      }
      .name {
        font-weight: var(--swc-bold-font-weight);
      }
      .byline .at,
      .byline .edited {
        font-size: var(--swc-font-size-50);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .deleted {
        font-style: italic;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .markdown > :first-child {
        margin-block-start: 0;
      }
      .markdown > :last-child {
        margin-block-end: 0;
      }
      .composer,
      .form {
        display: grid;
        gap: var(--swc-spacing-100);
        flex: none;
        padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-200);
      }
      .composer {
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
      }
      .form {
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        align-content: start;
        padding-block-start: var(--swc-spacing-200);
      }
      .form sp-textfield,
      .form sp-picker,
      .composer sp-textfield {
        width: 100%;
      }
      .audience {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin: 0;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .audience swc-icon-people-group {
        flex: none;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--swc-spacing-75);
      }
      .error:not(:empty) {
        border: none;
        padding: 0;
        background: none;
      }
      .note {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.support;
    if (!port) return [];
    const update = () => this.requestUpdate();
    return [
      port.on('status', update),
      port.on('threads', update),
      port.on('thread', (id) => {
        if (id === this.open) void this.#load();
      }),
    ];
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const port = this.model?.support ?? null;
    if (port === this.#port) return;
    this.#port = port;
    this.#loads += 1;
    this.#keys = new IntentKeys();
    this.#reading.clear();
    this.conversation = null;
    this.loading = false;
    this.sending = false;
    this.error = null;
    this.subject = '';
    this.body = '';
    this.topic = '';
    this.replies = new Map();
    void this.#load();
  }

  focus(): void {
    this.focusOn(
      '.row .head',
      '.form sp-textfield',
      '.composer sp-textfield',
      '.bar swc-action-button'
    );
  }

  reveal(id: string): void {
    this.open = id;
  }

  #thread(id: string | null): SupportThread | undefined {
    return this.#port?.threads().find((thread) => thread.id === id);
  }

  async #load(): Promise<void> {
    const port = this.#port;
    const id = this.open;
    const load = ++this.#loads;
    if (!port || !id || id === newRequest) {
      this.loading = false;
      return;
    }
    this.loading = !this.conversation;
    try {
      const conversation = await port.thread(id);
      if (load !== this.#loads) return;
      this.conversation = conversation;
      this.error = null;
      void this.#acknowledge(port, conversation);
    } catch (error) {
      if (load !== this.#loads) return;
      this.error = (error as Error).message;
    } finally {
      if (load === this.#loads) this.loading = false;
    }
  }

  async #acknowledge(port: SupportPort, conversation: SupportConversation): Promise<void> {
    const last = conversation.messages.at(-1);
    const thread = this.#thread(conversation.id);
    if (!last || !thread?.unread || this.#reading.has(last.id)) return;
    this.#reading.add(last.id);
    try {
      await port.read(conversation.id, last.id);
    } catch {
      this.#reading.delete(last.id);
    }
  }

  async #create(): Promise<void> {
    const port = this.#port;
    const title = this.subject.trim();
    const body = this.body;
    if (!port || this.sending || !validTitle(title) || !validBody(body)) return;
    const topic = this.topic || undefined;
    const key = this.#keys.key(newRequest, [title, body, topic]);
    this.sending = true;
    this.error = null;
    try {
      const { id } = await port.create({ key, title, body, ...(topic ? { topic } : {}) });
      if (port !== this.#port) return;
      this.#keys.done(newRequest);
      this.subject = '';
      this.body = '';
      this.topic = '';
      this.open = id;
    } catch (error) {
      if (port === this.#port) this.error = (error as Error).message;
    } finally {
      if (port === this.#port) this.sending = false;
    }
  }

  async #reply(thread: string): Promise<void> {
    const port = this.#port;
    const body = this.replies.get(thread) ?? '';
    if (!port || this.sending || !validBody(body)) return;
    const key = this.#keys.key(thread, [thread, body]);
    this.sending = true;
    this.error = null;
    try {
      await port.reply({ key, thread, body });
      if (port !== this.#port) return;
      this.#keys.done(thread);
      this.#draft(thread, '');
      void this.#load();
    } catch (error) {
      if (port === this.#port) this.error = (error as Error).message;
    } finally {
      if (port === this.#port) this.sending = false;
    }
  }

  #draft(thread: string, value: string): void {
    const replies = new Map(this.replies);
    if (value) replies.set(thread, value);
    else replies.delete(thread);
    this.replies = replies;
  }

  async #back(): Promise<void> {
    const from = this.open as string;
    this.open = null;
    await this.updateComplete;
    this.focusOn(
      `.row[data-id="${CSS.escape(from)}"] .head`,
      '.row .head',
      '.bar swc-action-button'
    );
  }

  #audience(): TemplateResult {
    return html`<p class="audience" data-audience><swc-icon-people-group size="s" aria-hidden="true"></swc-icon-people-group>${audienceNote(this.#port?.status().audience)}</p>`;
  }

  #error(): TemplateResult | typeof nothing {
    return this.error
      ? html`<div class="error" role="alert" data-error><swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond><span>${this.error}</span></div>`
      : nothing;
  }

  #offline(): TemplateResult | typeof nothing {
    const status = this.#port?.status();
    return status?.state === 'offline'
      ? html`<div class="offline" role="status" data-offline>${status.detail ?? 'Support can’t be reached right now.'}</div>`
      : nothing;
  }

  #backButton(): TemplateResult {
    return html`<swc-action-button size="s" quiet data-action="back" accessible-label="All requests" @click=${() => this.#back()}><swc-icon-chevron-left slot="icon"></swc-icon-chevron-left></swc-action-button>`;
  }

  #row(thread: SupportThread): TemplateResult {
    return html`<li class="row" data-id=${thread.id} ?data-unread=${thread.unread > 0} ?data-resolved=${thread.resolved}>
      <button class="head" @click=${() => (this.open = thread.id)}>
        <span class="title">${thread.title}</span>
        <span class="marks">
          ${thread.resolved ? html`<swc-badge size="s" variant="positive" subtle data-badge="resolved">Resolved</swc-badge>` : nothing}
          ${thread.unread ? html`<swc-badge size="s" variant="informative" data-badge="unread">${unreadLabel(thread.unread)}</swc-badge>` : nothing}
        </span>
        <span class="when">${since(thread.lastActivity)}</span>
      </button>
    </li>`;
  }

  #list(port: SupportPort): TemplateResult {
    const status = port.status();
    const threads = port.threads();
    const body =
      status.state === 'loading'
        ? html`<p class="note" data-empty="loading"><swc-progress-circle size="s" indeterminate label="Loading requests"></swc-progress-circle>Loading requests…</p>`
        : status.state === 'not-enrolled'
          ? html`<p class="note" data-empty="not-enrolled">Support isn’t set up for this account.</p>`
          : threads.length
            ? html`<ul class="list">${threads.map((thread) => this.#row(thread))}</ul>`
            : html`<p class="note" data-empty="none">No requests yet. Ask Adobe Support about anything that gets in your way.</p>`;
    const ready = status.state === 'ready' || status.state === 'offline';
    return html`<div class="bar" data-surface="support"><span class="heading" data-channel>${status.channel ?? 'Support'}</span><span class="spacer"></span>
        ${ready ? html`<swc-action-button size="s" quiet data-action="new-request" @click=${() => (this.open = newRequest)}><swc-icon-add slot="icon"></swc-icon-add>New request</swc-action-button>` : nothing}
      </div>
      ${this.#offline()}
      ${body}`;
  }

  #form(port: SupportPort): TemplateResult {
    const topics = port.topics?.() ?? [];
    const ready = validTitle(this.subject) && validBody(this.body);
    return html`<div class="bar" data-surface="support">${this.#backButton()}<span class="heading">New request</span></div>
      ${this.#offline()}
      <div class="form">
        <sp-textfield size="s" name="title" label="Title" placeholder="What do you need help with?" maxlength=${titleLimit} .value=${this.subject} @input=${(event: Event) => (this.subject = (event.target as HTMLInputElement).value)}></sp-textfield>
        ${
          topics.length
            ? html`<sp-picker size="s" name="topic" label="Topic" value=${this.topic || 'none'} @change=${(
                event: Event
              ) => {
                const value = (event.target as HTMLInputElement).value;
                this.topic = value === 'none' ? '' : value;
              }}>
                <sp-menu-item value="none">No topic</sp-menu-item>
                ${topics.map((topic) => html`<sp-menu-item value=${topic.id}>${topic.label}</sp-menu-item>`)}
              </sp-picker>`
            : nothing
        }
        <sp-textfield size="s" name="body" multiline grows label="Description" placeholder="What happened, and what did you expect?" maxlength=${bodyLimit} .value=${this.body} @input=${(event: Event) => (this.body = (event.target as HTMLInputElement).value)} @keydown=${(event: KeyboardEvent) => sendKey(event) && void this.#create()}></sp-textfield>
        ${this.#audience()}
        ${this.#error()}
        <div class="actions">
          <swc-button size="s" variant="secondary" fill-style="outline" data-action="cancel" @click=${() => this.#back()}>Cancel</swc-button>
          <swc-button size="s" variant="accent" data-action="send" ?pending=${this.sending} ?disabled=${!ready} @click=${() => void this.#create()}>Send request</swc-button>
        </div>
      </div>`;
  }

  #message(message: SupportMessage): TemplateResult {
    return html`<article class="message" data-id=${message.id} data-author=${message.author}>
      <div class="byline"><span class="name">${message.name}</span><span class="at">${since(message.at)}</span>${message.edited && !message.deleted ? html`<span class="edited">Edited</span>` : nothing}</div>
      ${
        message.deleted
          ? html`<div class="deleted">This message was deleted.</div>`
          : html`<div class="body markdown">${markdown(message.body, { strict: true })}</div>`
      }
    </article>`;
  }

  #conversation(id: string): TemplateResult {
    const thread = this.#thread(id);
    const conversation = this.conversation?.id === id ? this.conversation : null;
    const title = conversation?.title ?? thread?.title ?? '';
    const resolved = conversation?.resolved ?? thread?.resolved ?? false;
    const draft = this.replies.get(id) ?? '';
    const content = conversation
      ? html`<div class="messages" role="log" aria-label=${title}>${conversation.messages.map((message) => this.#message(message))}</div>`
      : this.loading
        ? html`<p class="note" data-empty="loading"><swc-progress-circle size="s" indeterminate label="Loading the conversation"></swc-progress-circle>Loading the conversation…</p>`
        : html`<div class="messages"></div>`;
    return html`<div class="bar" data-surface="support">${this.#backButton()}<span class="heading" data-title>${title}</span>${resolved ? html`<swc-badge size="s" variant="positive" subtle data-badge="resolved">Resolved</swc-badge>` : nothing}</div>
      ${this.#offline()}
      ${content}
      ${
        conversation
          ? html`<div class="composer">
          <sp-textfield size="s" name="reply" multiline grows label="Reply" placeholder="Write a reply" maxlength=${bodyLimit} .value=${draft} @input=${(event: Event) => this.#draft(id, (event.target as HTMLInputElement).value)} @keydown=${(event: KeyboardEvent) => sendKey(event) && void this.#reply(id)}></sp-textfield>
          ${this.#audience()}
          ${this.#error()}
          <div class="actions">
            <swc-button size="s" variant="accent" data-action="send" ?pending=${this.sending} ?disabled=${!validBody(draft)} @click=${() => void this.#reply(id)}>Send</swc-button>
          </div>
        </div>`
          : this.#error()
      }`;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('conversation') && this.conversation) {
      const log = this.renderRoot.querySelector<HTMLElement>('.messages');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  render(): TemplateResult {
    const port = this.#port;
    if (!port) return html`<p class="note" data-empty="off">Support isn’t available here.</p>`;
    const open = this.open;
    if (open === newRequest) return this.#form(port);
    if (open && port.status().state !== 'loading') return this.#conversation(open);
    return this.#list(port);
  }
}
