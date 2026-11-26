import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc-icons/swc-icon-add.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-left.js';
import '@adobe/spectrum-wc-icons/swc-icon-clock.js';
import '@adobe/spectrum-wc-icons/swc-icon-code.js';
import '@adobe/spectrum-wc-icons/swc-icon-link.js';
import '@adobe/spectrum-wc-icons/swc-icon-list-bulleted.js';
import '@adobe/spectrum-wc-icons/swc-icon-people-group.js';
import '@adobe/spectrum-wc-icons/swc-icon-preview.js';
import '@adobe/spectrum-wc-icons/swc-icon-send.js';
import '@adobe/spectrum-wc-icons/swc-icon-text-bold.js';
import '@adobe/spectrum-wc-icons/swc-icon-text-italic.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  SliccModel,
  SupportConversation,
  SupportMessage,
  SupportPort,
  SupportStatus,
  SupportThread,
} from '../model/types.ts';
import { since } from './approvals-panel.ts';
import { ModelElement, shared } from './base.ts';
import { errorCss, panelCss } from './files.ts';
import { markdown, markdownCss } from './markdown.ts';
import { ViewState } from './view-state.ts';

export const titleLimit = 120;
export const bodyLimit = 2000;
export const countFrom = 1800;
export const newRequest = 'new';

export function signedIn(status: SupportStatus): boolean {
  return status.state !== 'signed-out' && status.state !== 'signing-in';
}

export function accountOf(status: SupportStatus): string {
  return signedIn(status) ? [status.identity, status.org].filter(Boolean).join(', ') : '';
}

export function unreadLabel(count: number): string {
  return `${count} unread`;
}

export function audienceNote(audience: string | undefined): string {
  return `${audience ?? 'Your team and Adobe Support'} can read this. Only what you write here is sent.`;
}

export function validBody(body: string): boolean {
  return !!body.trim() && body.length <= bodyLimit;
}

export function requestOf(message: string): { title: string; body: string } {
  const lines = message.split('\n');
  const at = Math.max(
    0,
    lines.findIndex((line) => line.trim())
  );
  const line = lines[at].trim();
  const rest = lines.slice(at + 1).join('\n');
  if (line.length <= titleLimit) return { title: line, body: rest.trim() || line };
  const head = line.slice(0, titleLimit);
  const space = head.search(/\s\S*$/);
  const cut = space > 0 ? space : titleLimit - 1;
  return {
    title: `${line.slice(0, cut).trimEnd()}…`,
    body: `…${line.slice(cut).trimStart()}\n${rest}`.trimEnd(),
  };
}

export function countLabel(length: number): string {
  return `${length.toLocaleString('en-US')} / ${bodyLimit.toLocaleString('en-US')}`;
}

export function enrollmentNote(status: SupportStatus): string {
  const org = status.org ?? 'this account';
  if (status.request === 'pending')
    return `Adobe is reviewing your request for ${org}. You can start once it’s approved, or sign in with another account.`;
  if (status.request === 'declined')
    return `Adobe declined your request for ${org}. Ask your Adobe contact, or sign in with another account.`;
  return `Support isn’t set up for ${org} yet. Ask your Adobe contact to add you, or sign in with another account.`;
}

export type Format = 'bold' | 'italic' | 'code' | 'link' | 'list';

export interface Edit {
  value: string;
  start: number;
  end: number;
}

const wraps: Record<'bold' | 'italic' | 'code', [string, string]> = {
  bold: ['**', 'bold text'],
  italic: ['_', 'italic text'],
  code: ['`', 'code'],
};

export function format(value: string, start: number, end: number, kind: Format): Edit {
  const before = value.slice(0, start);
  const picked = value.slice(start, end);
  const after = value.slice(end);
  if (kind === 'list') {
    const from = before.lastIndexOf('\n') + 1;
    const lines = value.slice(from, end).split('\n');
    const listed = lines.map((line) => (line.startsWith('- ') ? line : `- ${line}`)).join('\n');
    return {
      value: value.slice(0, from) + listed + after,
      start: from,
      end: from + listed.length,
    };
  }
  if (kind === 'link') {
    const label = picked || 'link text';
    const url = start + label.length + 3;
    return { value: `${before}[${label}](https://)${after}`, start: url, end: url + 8 };
  }
  if (kind === 'code' && picked.includes('\n')) {
    const block = `\`\`\`\n${picked}\n\`\`\``;
    return { value: before + block + after, start: start + 4, end: start + 4 + picked.length };
  }
  const [mark, placeholder] = wraps[kind];
  const text = picked || placeholder;
  return {
    value: before + mark + text + mark + after,
    start: start + mark.length,
    end: start + mark.length + text.length,
  };
}

const formats: ReadonlyArray<[Format, string, TemplateResult]> = [
  ['bold', 'Bold', html`<swc-icon-text-bold slot="icon"></swc-icon-text-bold>`],
  ['italic', 'Italic', html`<swc-icon-text-italic slot="icon"></swc-icon-text-italic>`],
  ['code', 'Code', html`<swc-icon-code slot="icon"></swc-icon-code>`],
  ['link', 'Link', html`<swc-icon-link slot="icon"></swc-icon-link>`],
  ['list', 'Bulleted list', html`<swc-icon-list-bulleted slot="icon"></swc-icon-list-bulleted>`],
];

const shortcuts: Record<string, Format> = { b: 'bold', i: 'italic' };

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

interface Session {
  port: SupportPort | null;
  drafts: ReadonlyMap<string, string>;
  topic: string;
  keys: IntentKeys;
}

function fresh(port: SupportPort | null): Session {
  return { port, drafts: new Map(), topic: '', keys: new IntentKeys() };
}

export class SliccSupport extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    conversation: { state: true },
    loading: { state: true },
    sending: { state: true },
    signing: { state: true },
    error: { state: true },
    previews: { state: true },
  };
  declare conversation: SupportConversation | null;
  declare loading: boolean;
  declare sending: boolean;
  declare signing: boolean;
  declare error: string | null;
  declare previews: ReadonlySet<string>;
  #open = new ViewState<string | null>(this, 'support', () => null);
  #scope = new ViewState<string>(this, 'support:account', () => '');
  #session = new ViewState<Session>(this, 'support:drafts', (model) =>
    fresh(model?.support ?? null)
  );
  #loads = 0;
  #reading = new Set<string>();
  #unseen: SupportConversation | null = null;
  #port: SupportPort | null = null;
  #shown: string | null | undefined = undefined;
  #epoch = 0;
  #selection: Edit | null = null;

  constructor() {
    super();
    this.conversation = null;
    this.loading = false;
    this.sending = false;
    this.signing = false;
    this.error = null;
    this.previews = new Set();
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
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-200);
      }
      .composer {
        flex: none;
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
      }
      .form {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-block-start: var(--swc-spacing-200);
      }
      .form sp-picker {
        width: 100%;
        flex: none;
      }
      .editor {
        display: flex;
        flex-direction: column;
        flex: none;
        border: var(--swc-border-width-200) solid var(--swc-gray-300);
        border-radius: var(--swc-corner-radius-large-default);
        background: var(--swc-gray-25);
        overflow: hidden;
        cursor: text;
      }
      .editor:hover {
        border-color: var(--swc-gray-400);
      }
      .editor:focus-within {
        border-color: var(--swc-gray-800);
      }
      .form .editor {
        flex: 1 0 auto;
        min-height: 14lh;
      }
      .editor textarea,
      .editor .preview {
        box-sizing: border-box;
        display: block;
        width: 100%;
        margin: 0;
        border: none;
        outline: none;
        padding: var(--swc-spacing-200) var(--swc-spacing-200) var(--swc-spacing-75);
        background: transparent;
        color: var(--swc-neutral-content-color-default);
        font: inherit;
        font-size: var(--swc-font-size-100);
        line-height: var(--swc-line-height-100);
        overflow-wrap: anywhere;
      }
      .editor textarea {
        resize: none;
        field-sizing: content;
        min-block-size: calc(3lh + var(--swc-spacing-200) + var(--swc-spacing-75));
        max-block-size: 40vh;
        overflow-y: auto;
      }
      .editor textarea::placeholder {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .editor .preview {
        min-block-size: calc(3lh + var(--swc-spacing-200) + var(--swc-spacing-75));
        max-block-size: 40vh;
        overflow-y: auto;
        cursor: default;
      }
      .form .editor textarea,
      .form .editor .preview {
        flex: 1;
        max-block-size: none;
      }
      .preview .empty {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-50);
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-100);
        cursor: default;
      }
      .tools .divider {
        inline-size: var(--swc-border-width-100);
        block-size: var(--swc-spacing-300);
        margin-inline: var(--swc-spacing-50);
        background: var(--swc-gray-300);
      }
      .tools swc-action-button.selected {
        --swc-action-button-background-color-default: var(--swc-neutral-background-color-selected-default);
        --swc-action-button-background-color-hover: var(--swc-neutral-background-color-selected-hover);
        --swc-action-button-background-color-down: var(--swc-neutral-background-color-selected-down);
        --swc-action-button-background-color-focus: var(--swc-neutral-background-color-selected-key-focus);
        --swc-action-button-content-color-default: var(--swc-gray-25);
        --swc-action-button-content-color-hover: var(--swc-gray-25);
        --swc-action-button-content-color-down: var(--swc-gray-25);
        --swc-action-button-content-color-focus: var(--swc-gray-25);
      }
      .tools .count {
        margin-inline-start: auto;
        padding-inline: var(--swc-spacing-75);
        font-size: var(--swc-font-size-75);
        font-variant-numeric: tabular-nums;
        color: var(--swc-neutral-subdued-content-color-default);
        white-space: nowrap;
      }
      .tools .count[data-full] {
        color: var(--swc-negative-content-color-default);
      }
      .tools .send {
        margin-inline-start: auto;
      }
      .tools .count + .send {
        margin-inline-start: 0;
      }
      .hint,
      .derived,
      .audience {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin: 0;
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .derived span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--swc-neutral-content-color-default);
        font-weight: var(--swc-bold-font-weight);
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
      .banner {
        flex: none;
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-75) var(--swc-spacing-200);
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
      }
      .account {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        flex: none;
        padding: var(--swc-spacing-50) var(--swc-spacing-100) var(--swc-spacing-50) var(--swc-spacing-200);
        margin-block-start: auto;
        border-top: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .account .who {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .account swc-action-button {
        flex: none;
      }
      .sign-in {
        display: grid;
        gap: var(--swc-spacing-200);
        justify-items: start;
        padding: var(--swc-spacing-400) var(--swc-spacing-300);
        line-height: var(--swc-line-height-100);
      }
      .sign-in h3 {
        margin: 0;
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
      }
      .sign-in p {
        margin: 0;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .note {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
      }
      .enrollment {
        display: grid;
        gap: var(--swc-spacing-100);
        margin: 0;
        padding: var(--swc-spacing-200);
        line-height: var(--swc-line-height-100);
      }
      .enrollment p {
        margin: 0;
      }
      .enrollment .state {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
        font-weight: var(--swc-bold-font-weight);
      }
      .enrollment .state swc-icon-clock {
        color: var(--swc-notice-visual-color);
      }
      .enrollment .state swc-icon-alert-diamond {
        color: var(--swc-negative-visual-color);
      }
      .enrollment [data-reason] {
        padding: var(--swc-spacing-100) var(--swc-spacing-200);
        border-inline-start: var(--swc-border-width-400) solid var(--swc-gray-300);
        background: var(--swc-gray-100);
        border-radius: var(--swc-corner-radius-small-default);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .enrollment .more {
        color: var(--swc-neutral-subdued-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.support;
    if (!port) return [];
    const update = () => this.requestUpdate();
    const off = [
      port.on('status', (status) => {
        this.#check(status);
        update();
      }),
      port.on('threads', () => {
        this.#check(port.status());
        update();
      }),
      port.on('thread', (id) => {
        if (id === this.open) void this.#load();
      }),
    ];
    this.#check(port.status());
    return off;
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const port = this.model?.support ?? null;
    if (port !== this.#port) {
      this.#port = port;
      this.#reset();
      if (this.#session.value.port !== port) this.#session.value = fresh(port);
      if (port) this.#check(port.status());
      this.#shown = undefined;
    }
    if (this.open === this.#shown) return;
    this.#shown = this.open;
    this.error = null;
    this.conversation = null;
    void this.#load();
  }

  #check(status: SupportStatus): void {
    const lost = status.state === 'not-enrolled' && this.open !== null;
    if (accountOf(status) === this.#scope.value && !lost) return;
    this.#scope.value = accountOf(status);
    this.#open.value = null;
    this.#reset();
    this.#session.value = fresh((this.model as SliccModel).support as SupportPort);
  }

  #reset(): void {
    this.#epoch += 1;
    this.#loads += 1;
    this.#reading.clear();
    this.conversation = null;
    this.loading = false;
    this.sending = false;
    this.signing = false;
    this.error = null;
    this.previews = new Set();
  }

  async #signing(port: SupportPort, action: 'signIn' | 'signOut'): Promise<void> {
    if (this.signing) return;
    const epoch = this.#epoch;
    this.signing = true;
    this.error = null;
    try {
      await port[action]?.();
    } catch (error) {
      if (epoch === this.#epoch) this.error = (error as Error).message;
    } finally {
      if (epoch === this.#epoch) this.signing = false;
    }
  }

  focus(): void {
    this.focusOn('.row .head', '.editor textarea', '.bar swc-action-button');
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
    if (!port || !id || id === newRequest || !signedIn(port.status())) {
      this.loading = false;
      return;
    }
    this.loading = !this.conversation;
    try {
      const conversation = await port.thread(id);
      if (load !== this.#loads) return;
      this.conversation = this.#unseen = conversation;
      this.error = null;
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

  #draftOf(id: string): string {
    return this.#session.value.drafts.get(id) ?? '';
  }

  #draft(id: string, value: string): void {
    const session = this.#session.value;
    const drafts = new Map(session.drafts);
    if (value) drafts.set(id, value);
    else drafts.delete(id);
    this.#session.value = { ...session, drafts };
  }

  #topic(topic: string): void {
    this.#session.value = { ...this.#session.value, topic };
  }

  async #send(id: string): Promise<void> {
    const port = this.#port;
    const session = this.#session.value;
    const text = this.#draftOf(id);
    if (!port || this.sending || !validBody(text)) return;
    const creating = id === newRequest;
    const topic = creating ? session.topic || undefined : undefined;
    const key = session.keys.key(id, creating ? [text, topic] : [id, text]);
    const epoch = this.#epoch;
    const current = () => epoch === this.#epoch && session.keys === this.#session.value.keys;
    this.sending = true;
    this.error = null;
    try {
      const made = creating
        ? await port.create({ key, ...requestOf(text), ...(topic ? { topic } : {}) })
        : await port.reply({ key, thread: id, body: text });
      if (!current()) return;
      session.keys.done(id);
      this.#settle(id, text);
      if (creating) this.open = made.id;
      else void this.#load();
    } catch (error) {
      if (current()) this.error = (error as Error).message;
    } finally {
      if (current()) this.sending = false;
    }
  }

  #settle(id: string, text: string): void {
    this.#preview(id, false);
    if (this.#draftOf(id) !== text) return;
    this.#draft(id, '');
    if (id === newRequest) this.#topic('');
  }

  #preview(id: string, on: boolean): void {
    const previews = new Set(this.previews);
    if (on) previews.add(id);
    else previews.delete(id);
    this.previews = previews;
  }

  #format(id: string, kind: Format): void {
    const area = this.renderRoot.querySelector<HTMLTextAreaElement>('.editor textarea');
    if (!area) return;
    const edit = format(area.value, area.selectionStart, area.selectionEnd, kind);
    this.#selection = edit;
    this.#draft(id, edit.value);
  }

  #key(id: string, event: KeyboardEvent): void {
    if (event.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    const shortcut = mod && !event.shiftKey && !event.altKey && shortcuts[event.key.toLowerCase()];
    if (shortcut) {
      event.preventDefault();
      this.#format(id, shortcut);
      return;
    }
    if (event.key !== 'Enter') return;
    const enter = id !== newRequest && this.#enterSends();
    if (!(mod || (enter && !event.shiftKey))) return;
    event.preventDefault();
    void this.#send(id);
  }

  #hint(id: string): string {
    if (id === newRequest)
      return 'The first line is the title. Ctrl+Enter sends, Enter adds a new line. Markdown works.';
    return this.#enterSends()
      ? 'Enter sends, Shift+Enter adds a new line. Markdown works.'
      : 'Ctrl+Enter sends, Enter adds a new line. Markdown works.';
  }

  #enterSends(): boolean {
    return (this.model as SliccModel).settings.get().sendOnEnter !== false;
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

  #editor(
    id: string,
    label: string,
    placeholder: string,
    title: TemplateResult | typeof nothing = nothing
  ): TemplateResult {
    const text = this.#draftOf(id);
    const preview = this.previews.has(id);
    const length = text.length;
    const name = id === newRequest ? 'message' : 'reply';
    const body = preview
      ? html`<div class="preview markdown" data-preview role="region" aria-label=${`${label}, preview`} tabindex="0">${text.trim() ? markdown(text, { strict: true }) : html`<p class="empty">Nothing to preview yet.</p>`}</div>`
      : html`<textarea name=${name} aria-label=${label} aria-describedby="hint" placeholder=${placeholder} maxlength=${bodyLimit} .value=${live(text)} @input=${(event: Event) => this.#draft(id, (event.target as HTMLTextAreaElement).value)} @keydown=${(event: KeyboardEvent) => this.#key(id, event)}></textarea>`;
    return html`<div class="editor" data-editor=${id} ?data-previewing=${preview}>
        ${body}
        <div class="tools">
          ${formats.map(
            ([kind, title, icon]) =>
              html`<swc-action-button id=${`format-${kind}`} size="s" quiet data-format=${kind} accessible-label=${title} ?disabled=${preview} @click=${() => this.#format(id, kind)}>${icon}</swc-action-button><swc-tooltip for=${`format-${kind}`} placement="top">${title}</swc-tooltip>`
          )}
          <span class="divider" aria-hidden="true"></span>
          <swc-action-button id="preview" size="s" quiet class=${preview ? 'selected' : ''} data-action="preview" accessible-label="Preview" aria-pressed=${preview ? 'true' : 'false'} @click=${() => this.#preview(id, !preview)}><swc-icon-preview slot="icon"></swc-icon-preview></swc-action-button><swc-tooltip for="preview" placement="top">Preview</swc-tooltip>
          ${length >= countFrom ? html`<span class="count" data-count ?data-full=${length >= bodyLimit}>${countLabel(length)}<span class="sr"> characters</span></span>` : nothing}
          <swc-button class="send" size="s" variant="accent" data-action="send" ?pending=${this.sending} ?disabled=${!validBody(text)} @click=${() => void this.#send(id)}><swc-icon-send slot="icon"></swc-icon-send>Send</swc-button>
        </div>
      </div>
      ${title}
      <p class="hint" id="hint">${this.#hint(id)}</p>`;
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

  #enrollment(status: SupportStatus): TemplateResult {
    const request = status.request;
    if (!request)
      return html`<p class="note" data-empty="not-enrolled">${enrollmentNote(status)}</p>`;
    const pending = request === 'pending';
    const reason = !pending && status.reason?.trim();
    return html`<div class="enrollment" data-empty="not-enrolled" data-request=${request} role="status">
      <p class="state">${pending ? html`<swc-icon-clock size="s" aria-hidden="true"></swc-icon-clock>Your request is waiting for approval` : html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond>Your request was declined`}</p>
      <p class="more">${enrollmentNote(status)}</p>
      ${reason ? html`<p data-reason>${reason}</p>` : nothing}
    </div>`;
  }

  #list(port: SupportPort): TemplateResult {
    const status = port.status();
    const threads = port.threads();
    const body =
      status.state === 'loading'
        ? html`<p class="note" data-empty="loading"><swc-progress-circle size="s" indeterminate label="Loading requests"></swc-progress-circle>Loading requests…</p>`
        : status.state === 'not-enrolled'
          ? this.#enrollment(status)
          : threads.length
            ? html`<ul class="list">${threads.map((thread) => this.#row(thread))}</ul>`
            : html`<p class="note" data-empty="none">No requests yet. Ask Adobe Support about anything that gets in your way.</p>`;
    const ready = status.state === 'ready' || status.state === 'offline';
    return html`<div class="bar" data-surface="support"><span class="heading" data-channel>${status.channel ?? 'Support'}</span><span class="spacer"></span>
        ${ready ? html`<swc-action-button size="s" quiet data-action="new-request" @click=${() => (this.open = newRequest)}><swc-icon-add slot="icon"></swc-icon-add>New request</swc-action-button>` : nothing}
      </div>
      ${this.#offline()}
      ${this.error ? html`<div class="banner">${this.#error()}</div>` : nothing}
      ${body}
      ${this.#scope.value ? this.#accountBar(port) : nothing}`;
  }

  #accountBar(port: SupportPort): TemplateResult {
    return html`<div class="account" data-account><span class="who">Signed in as ${this.#scope.value}</span>
      ${port.signOut ? html`<swc-action-button size="s" quiet data-action="sign-out" ?disabled=${this.signing} @click=${() => void this.#signing(port, 'signOut')}>Sign out</swc-action-button>` : nothing}
    </div>`;
  }

  #signIn(port: SupportPort): TemplateResult {
    const busy = this.signing || port.status().state === 'signing-in';
    return html`<div class="bar" data-surface="support"><span class="heading">Support</span></div>
      <div class="sign-in" data-sign-in>
        <h3>Get help from Adobe Support</h3>
        <p>Sign in with your Adobe account to see your organization’s requests and ask for help. You choose the organization when you sign in.</p>
        ${this.#error()}
        ${port.signIn ? html`<swc-button size="s" variant="accent" data-action="sign-in" ?pending=${busy} @click=${() => void this.#signing(port, 'signIn')}>Sign in with Adobe</swc-button>` : nothing}
      </div>`;
  }

  #form(port: SupportPort): TemplateResult {
    const topics = port.topics?.() ?? [];
    const topic = this.#session.value.topic;
    const text = this.#draftOf(newRequest);
    return html`<div class="bar" data-surface="support">${this.#backButton()}<span class="heading">New request</span><span class="spacer"></span>
        <swc-action-button size="s" quiet data-action="cancel" @click=${() => this.#back()}>Cancel</swc-action-button>
      </div>
      ${this.#offline()}
      <div class="form">
        ${
          topics.length
            ? html`<sp-picker size="s" name="topic" label="Topic" value=${topic || 'none'} @change=${(
                event: Event
              ) => {
                const value = (event.target as HTMLInputElement).value;
                this.#topic(value === 'none' ? '' : value);
              }}>
                <sp-menu-item value="none">No topic</sp-menu-item>
                ${topics.map((item) => html`<sp-menu-item value=${item.id}>${item.label}</sp-menu-item>`)}
              </sp-picker>`
            : nothing
        }
        ${this.#editor(newRequest, 'Message', 'What do you need help with? Start with a short summary on the first line, then the details.', text.trim() ? html`<p class="derived" data-derived-title>Title:<span>${requestOf(text).title}</span></p>` : nothing)}
        ${this.#audience()}
        ${this.#error()}
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
          ${this.#editor(id, 'Reply', 'Write a reply')}
          ${this.#audience()}
          ${this.#error()}
        </div>`
          : this.#error()
      }`;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const edit = this.#selection;
    const area = this.renderRoot.querySelector<HTMLTextAreaElement>('.editor textarea');
    if (edit && area) {
      this.#selection = null;
      area.focus();
      area.setSelectionRange(edit.start, edit.end);
    }
    if (changed.has('conversation') && this.conversation) {
      const log = this.renderRoot.querySelector<HTMLElement>('.messages');
      if (log) log.scrollTop = log.scrollHeight;
    }
    const unseen = this.#unseen;
    if (!unseen || unseen !== this.conversation || !this.isConnected) return;
    if (!this.renderRoot.querySelector('.messages[role=log]')) return;
    this.#unseen = null;
    void this.#acknowledge(this.#port as SupportPort, unseen);
  }

  render(): TemplateResult {
    const port = this.#port;
    if (!port) return html`<p class="note" data-empty="off">Support isn’t available here.</p>`;
    if (!signedIn(port.status())) return this.#signIn(port);
    const open = this.open;
    if (open === newRequest) return this.#form(port);
    if (open && port.status().state !== 'loading') return this.#conversation(open);
    return this.#list(port);
  }
}
