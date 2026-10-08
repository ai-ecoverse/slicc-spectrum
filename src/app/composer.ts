import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { Attachment, SendMode, SliccModel, Thinking, UserMessage } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';
import { size } from './messages.ts';

export const limit = 25 * 1024 * 1024;

export interface Choice {
  value: string;
  label: string;
  detail: string;
}

export interface Command {
  name: string;
  detail: string;
  args?(model: SliccModel): Choice[];
  run(model: SliccModel, agentId: string, arg: string): void;
}

export const commands: Command[] = [
  {
    name: 'clear',
    detail: 'Start the conversation over',
    run: (model, id) => model.agent.clear(id),
  },
  {
    name: 'compact',
    detail: 'Summarize the conversation to free context',
    run: (model, id) => model.agent.compact(id),
  },
  {
    name: 'model',
    detail: 'Switch this agent’s model',
    args: (model) =>
      model.settings
        .models()
        .map((option) => ({ value: option.id, label: option.label, detail: option.provider })),
    run: (model, id, arg) => {
      if (model.settings.models().some((option) => option.id === arg))
        model.agent.setModel(id, arg);
    },
  },
  {
    name: 'thinking',
    detail: 'Set the thinking level',
    args: () =>
      ['off', 'low', 'medium', 'high'].map((value) => ({ value, label: value, detail: '' })),
    run: (model, _id, arg) => {
      if (['off', 'low', 'medium', 'high'].includes(arg))
        model.settings.update({ thinking: arg as Thinking });
    },
  },
  {
    name: 'scoop',
    detail: 'Start a scoop with a name',
    run: (model, id, arg) => {
      if (arg) model.agent.createScoop(id, arg);
    },
  },
  { name: 'stop', detail: 'Stop the running reply', run: (model, id) => model.agent.stop(id) },
  {
    name: 'freeze',
    detail: 'Archive this cone and its scoops in the freezer',
    run: (model, id) => model.agent.freeze(id),
  },
  {
    name: 'theme',
    detail: 'Switch between light, dark and system',
    args: () => ['light', 'dark', 'system'].map((value) => ({ value, label: value, detail: '' })),
    run: (model, _id, arg) => {
      if (['light', 'dark', 'system'].includes(arg))
        model.settings.update({ color: arg as 'light' | 'dark' | 'system' });
    },
  },
];

export type PopupKind = 'command' | 'argument' | 'mention' | 'file' | 'secret';

export interface Popup {
  kind: PopupKind;
  start: number;
  query: string;
  items: Choice[];
  index: number;
}

export function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    if (file.type.startsWith('image/')) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export function filter(items: Choice[], query: string): Choice[] {
  const needle = query.toLowerCase();
  return items
    .filter(
      (item) =>
        item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle)
    )
    .slice(0, 8);
}

export function trigger(
  text: string,
  caret: number
): { kind: PopupKind; start: number; query: string } | null {
  const before = text.slice(0, caret);
  const argument = before.match(/^\/(\w+)\s+(\S*)$/);
  if (argument)
    return { kind: 'argument', start: before.length - argument[2].length, query: argument[2] };
  const command = before.match(/^\/(\w*)$/);
  if (command) return { kind: 'command', start: 0, query: command[1] };
  const mention = before.match(/(^|\s)@([\w./-]*)$/);
  if (mention)
    return { kind: 'mention', start: before.length - mention[2].length - 1, query: mention[2] };
  return null;
}

export class SliccComposer extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    value: { state: true },
    attachments: { state: true },
    popup: { state: true },
    dictating: { state: true },
    agent: {},
  };
  declare value: string;
  declare attachments: Attachment[];
  declare popup: Popup | null;
  declare dictating: boolean;
  declare agent: string;
  #drafts = new Map<string, { value: string; attachments: Attachment[] }>();
  #history = -1;
  #paths: string[] = [];
  #agent = '';
  #next = 1;
  #recognition: { stop(): void } | null = null;

  constructor() {
    super();
    this.value = '';
    this.attachments = [];
    this.popup = null;
    this.dictating = false;
    this.agent = '';
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        flex: none;
        border-top: 1px solid var(--spectrum-gray-200);
        padding: 8px 12px;
        background: var(--spectrum-background-layer-1-color);
        font-size: var(--spectrum-font-size-100);
        position: relative;
      }
      .column {
        max-width: 860px;
        margin: 0 auto;
        position: relative;
      }
      .queue {
        display: grid;
        gap: 4px;
        margin-bottom: 6px;
      }
      .queued {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-radius: var(--spectrum-corner-radius-75);
        background: var(--spectrum-gray-100);
        border: 1px dashed var(--spectrum-gray-300);
        font-size: var(--spectrum-font-size-75);
      }
      .queued .text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .card {
        border: 1px solid var(--spectrum-gray-400);
        border-radius: var(--spectrum-corner-radius-100);
        background: var(--spectrum-background-layer-2-color);
        padding: 6px 8px 4px;
      }
      .card:focus-within {
        border-color: var(--spectrum-focus-indicator-color);
        box-shadow: 0 0 0 1px var(--spectrum-focus-indicator-color);
      }
      .card[data-drop] {
        border-style: dashed;
        border-color: var(--spectrum-accent-visual-color);
      }
      textarea {
        display: block;
        width: 100%;
        box-sizing: border-box;
        border: 0;
        outline: none;
        resize: none;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: 1.45;
        min-height: 22px;
        max-height: 220px;
        padding: 2px 2px 4px;
      }
      textarea::placeholder {
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 6px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 240px;
        padding: 2px 4px 2px 6px;
        border: 1px solid var(--spectrum-gray-300);
        border-radius: var(--spectrum-corner-radius-75);
        font-size: var(--spectrum-font-size-75);
      }
      .chip[data-error] {
        border-color: var(--spectrum-negative-visual-color);
      }
      .chip img {
        width: 20px;
        height: 20px;
        object-fit: cover;
        border-radius: 3px;
      }
      .chip .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chip .size {
        color: var(--spectrum-neutral-subdued-content-color-default);
        white-space: nowrap;
      }
      .x {
        all: unset;
        cursor: pointer;
        width: 16px;
        height: 16px;
        display: inline-grid;
        place-items: center;
        border-radius: 3px;
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .x:hover {
        background: var(--spectrum-gray-200);
      }
      .x:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .spacer {
        flex: 1;
      }
      .toolbar sp-picker {
        min-width: 0;
        width: auto;
      }
      .hint {
        max-width: 860px;
        margin: 4px auto 0;
        font-size: var(--spectrum-font-size-50);
        color: var(--spectrum-neutral-subdued-content-color-default);
      }
      .popup {
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + 4px);
        z-index: 3;
        max-height: 280px;
        overflow-y: auto;
        background: var(--spectrum-background-elevated-color, var(--spectrum-background-layer-2-color));
        border: 1px solid var(--spectrum-gray-300);
        border-radius: var(--spectrum-corner-radius-100);
        box-shadow: 0 6px 18px var(--spectrum-drop-shadow-color);
        padding: 4px;
      }
      .item {
        display: flex;
        gap: 8px;
        align-items: baseline;
        padding: 4px 8px;
        border-radius: var(--spectrum-corner-radius-75);
        cursor: pointer;
        font-size: var(--spectrum-font-size-75);
      }
      .item[aria-selected='true'] {
        background: color-mix(in srgb, var(--spectrum-accent-visual-color) 16%, transparent);
      }
      .item .label {
        font-family: var(--spectrum-code-font-family-stack, monospace);
      }
      .item .detail {
        color: var(--spectrum-neutral-subdued-content-color-default);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .empty {
        padding: 6px 8px;
        color: var(--spectrum-neutral-subdued-content-color-default);
        font-size: var(--spectrum-font-size-75);
      }
      .secret {
        display: grid;
        gap: 6px;
        padding: 6px;
        font-size: var(--spectrum-font-size-75);
      }
      .secret input {
        font: inherit;
        padding: 4px 8px;
        border: 1px solid var(--spectrum-gray-400);
        border-radius: var(--spectrum-corner-radius-75);
        background: var(--spectrum-background-layer-2-color);
        color: inherit;
      }
      input[type='file'] {
        display: none;
      }
    `,
  ];

  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has('agent') && this.agent && this.model && this.agent !== this.#agent) {
      this.#switch(this.agent);
    }
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#switch(this.agent || model.agent.active());
    void model.files.list().then((entries) => {
      this.#paths = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path);
    });
    const update = () => this.requestUpdate();
    return [
      model.agent.on('active', (id) => {
        if (!this.agent) this.#switch(id);
      }),
      model.agent.on('agents', update),
      model.agent.on('messages', update),
      model.agent.on('message', update),
      model.settings.on('settings', update),
    ];
  }

  #switch(id: string): void {
    if (this.#agent)
      this.#drafts.set(this.#agent, { value: this.value, attachments: this.attachments });
    const draft = this.#drafts.get(id);
    this.#agent = id;
    this.value = draft?.value ?? '';
    this.attachments = draft?.attachments ?? [];
    this.popup = null;
    this.#history = -1;
  }

  focus(): void {
    this.focusOn('textarea');
  }

  get #textarea(): HTMLTextAreaElement | null {
    return this.renderRoot.querySelector('textarea');
  }

  #busy(): boolean {
    return this.model?.agent.busy(this.#agent) ?? false;
  }

  send(mode: SendMode = 'send'): void {
    const model = this.model;
    const text = this.value.trim();
    const attachments = this.attachments.filter((attachment) => !attachment.error);
    if (!model || (!text && attachments.length === 0)) return;
    const command = text.match(/^\/(\w+)(?:\s+(.*))?$/);
    const known = command && commands.find((candidate) => candidate.name === command[1]);
    this.value = '';
    this.attachments = [];
    this.popup = null;
    this.#history = -1;
    if (known) {
      known.run(model, this.#agent, (command[2] ?? '').trim());
      return;
    }
    const busy = this.#busy();
    const resolved: SendMode =
      mode === 'queue' ? (busy ? 'queue' : 'send') : busy || mode === 'steer' ? 'steer' : 'send';
    void model.agent.send(this.#agent, { text, attachments, mode: resolved });
  }

  #id(): string {
    return `a-${Date.now().toString(36)}-${this.#next++}`;
  }

  async addFiles(files: readonly File[]): Promise<void> {
    const added: Attachment[] = [];
    for (const file of files) {
      const base = {
        id: this.#id(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      };
      if (file.size > limit) {
        added.push({
          ...base,
          kind: 'file',
          error: `Too large: attachments are limited to ${size(limit)}`,
        });
        continue;
      }
      const image = file.type.startsWith('image/');
      const textual =
        file.type.startsWith('text/') ||
        /\.(md|txt|json|ts|js|css|html|ya?ml|toml|csv)$/i.test(file.name);
      if (image || textual) {
        const content = await readFile(file);
        added.push(
          image
            ? { ...base, kind: 'image', url: content }
            : { ...base, kind: 'text', text: content }
        );
      } else {
        added.push({ ...base, kind: 'file' });
      }
    }
    this.attachments = [...this.attachments, ...added];
  }

  detach(id: string): void {
    this.attachments = this.attachments.filter((attachment) => attachment.id !== id);
  }

  async screenshot(): Promise<void> {
    const browser = this.model?.browser;
    const tab = browser?.list().find((candidate) => candidate.id === browser.active());
    if (!(browser && tab)) return;
    const url = await browser.screenshot(tab.id);
    this.attachments = [
      ...this.attachments,
      {
        id: this.#id(),
        name: `${tab.title}.png`,
        kind: 'image',
        mimeType: 'image/png',
        size: url.length,
        url,
      },
    ];
  }

  async attachPath(path: string): Promise<void> {
    const text = await this.model?.files.read(path).catch(() => null);
    const name = path.slice(path.lastIndexOf('/') + 1);
    const base = { id: this.#id(), name, path, mimeType: 'text/plain' };
    this.attachments = [
      ...this.attachments,
      text === null || text === undefined
        ? { ...base, kind: 'file', size: 0, error: 'Could not read the file' }
        : { ...base, kind: 'text', size: text.length, text },
    ];
  }

  shareSecret(name: string): void {
    const clean = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    if (!clean) return;
    this.attachments = [
      ...this.attachments,
      {
        id: this.#id(),
        name: clean,
        kind: 'secret',
        mimeType: 'application/octet-stream',
        size: 0,
      },
    ];
    this.popup = null;
  }

  #choices(kind: PopupKind, query: string): Choice[] {
    const model = this.model as SliccModel;
    if (kind === 'command') {
      return filter(
        commands.map((command) => ({
          value: command.name,
          label: `/${command.name}`,
          detail: command.detail,
        })),
        query
      );
    }
    if (kind === 'argument') {
      const name = this.value.match(/^\/(\w+)/)?.[1];
      return filter(commands.find((command) => command.name === name)?.args?.(model) ?? [], query);
    }
    const files = this.#paths.map((path) => ({
      value: path,
      label: path.slice(path.lastIndexOf('/') + 1),
      detail: path,
    }));
    if (kind === 'file') return filter(files, query);
    const agents = model.agent
      .list()
      .map((agent) => ({ value: agent.name, label: `@${agent.name}`, detail: agent.kind }));
    return filter(
      [...agents, ...files.map((file) => ({ ...file, label: `@${file.label}` }))],
      query
    );
  }

  #refresh(): void {
    const area = this.#textarea;
    if (!area) return;
    if (this.popup?.kind === 'file' || this.popup?.kind === 'secret') return;
    const found = trigger(this.value, area.selectionStart ?? this.value.length);
    this.popup = found
      ? { ...found, items: this.#choices(found.kind, found.query), index: 0 }
      : null;
  }

  openPopup(kind: 'file' | 'secret'): void {
    this.popup = {
      kind,
      start: 0,
      query: '',
      items: kind === 'file' ? this.#choices('file', '') : [],
      index: 0,
    };
  }

  pick(choice: Choice): void {
    const popup = this.popup;
    if (!popup) return;
    if (popup.kind === 'file') {
      this.popup = null;
      void this.attachPath(choice.value);
      return;
    }
    const area = this.#textarea as HTMLTextAreaElement;
    const caret = area.selectionStart ?? this.value.length;
    const insert =
      popup.kind === 'command'
        ? `/${choice.value} `
        : popup.kind === 'mention'
          ? `@${choice.value} `
          : `${choice.value} `;
    this.value = this.value.slice(0, popup.start) + insert + this.value.slice(caret);
    this.popup = null;
    const position = popup.start + insert.length;
    void this.updateComplete.then(() => {
      area.focus();
      area.setSelectionRange(position, position);
      this.#refresh();
    });
  }

  #recall(delta: number): boolean {
    const own = (this.model?.agent.messages(this.#agent) ?? []).filter(
      (message): message is UserMessage => message.role === 'user' && !message.from
    );
    const texts = own.map((message) => message.text).reverse();
    const next = this.#history + delta;
    if (next < -1 || next >= texts.length) return false;
    this.#history = next;
    this.value = next === -1 ? '' : texts[next];
    return true;
  }

  #popupKey(event: KeyboardEvent): boolean {
    const popup = this.popup;
    if (!popup || popup.kind === 'secret') return false;
    if (event.key === 'Escape') {
      this.popup = null;
      return true;
    }
    const count = popup.items.length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.popup = { ...popup, index: (popup.index + step + count) % count };
      return true;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && count && !event.shiftKey) {
      this.pick(popup.items[popup.index]);
      return true;
    }
    return false;
  }

  #historyKey(event: KeyboardEvent, area: HTMLTextAreaElement): boolean {
    if (event.key === 'ArrowUp' && area.selectionStart === 0 && area.selectionEnd === 0)
      return this.#recall(1);
    if (event.key === 'ArrowDown' && area.selectionStart === this.value.length)
      return this.#recall(-1);
    return false;
  }

  #keydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const area = event.currentTarget as HTMLTextAreaElement;
    const sendOnEnter = this.model?.settings.get().sendOnEnter ?? true;
    let handled = this.#popupKey(event) || this.#historyKey(event, area);
    if (!handled && event.key === 'Tab' && !event.shiftKey && !this.value) {
      const suggestion = this.model?.agent.suggestion(this.#agent);
      if (suggestion) {
        this.value = suggestion;
        handled = true;
      }
    } else if (!handled && event.key === 'Escape' && this.#busy()) {
      this.model?.agent.stop(this.#agent);
      handled = true;
    } else if (!handled && event.key === 'Enter') {
      const modified = event.metaKey || event.ctrlKey;
      if (modified) this.send('queue');
      else if (!event.shiftKey && sendOnEnter) this.send();
      handled = modified || (!event.shiftKey && sendOnEnter);
    }
    if (handled) event.preventDefault();
  }

  #input(event: Event): void {
    this.value = (event.target as HTMLTextAreaElement).value;
    this.#history = -1;
    this.#refresh();
  }

  async #paste(event: ClipboardEvent): Promise<void> {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    await this.addFiles(files);
  }

  async #drop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.removeAttribute('dropping');
    await this.addFiles([...(event.dataTransfer?.files ?? [])]);
  }

  #add(event: Event): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    if (value === 'upload')
      this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
    else if (value === 'screenshot') void this.screenshot();
    else this.openPopup(value as 'file' | 'secret');
  }

  dictate(): void {
    if (this.#recognition) {
      this.#recognition.stop();
      return;
    }
    const Speech =
      (
        globalThis as {
          SpeechRecognition?: new () => SpeechLike;
          webkitSpeechRecognition?: new () => SpeechLike;
        }
      ).SpeechRecognition ??
      (globalThis as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition;
    if (!Speech) return;
    const recognition = new Speech();
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = [...event.results].map((result) => result[0].transcript).join(' ');
      this.value = `${this.value}${this.value && !this.value.endsWith(' ') ? ' ' : ''}${text}`;
    };
    recognition.onend = () => {
      this.#recognition = null;
      this.dictating = false;
    };
    this.#recognition = recognition;
    this.dictating = true;
    recognition.start();
  }

  #chip(attachment: Attachment): TemplateResult {
    return html`<span class="chip" data-kind=${attachment.kind} ?data-error=${!!attachment.error} title=${attachment.error ?? attachment.path ?? attachment.name}>
      ${attachment.kind === 'image' && attachment.url ? html`<img src=${attachment.url} alt="" />` : nothing}
      <span class="name">${attachment.kind === 'secret' ? `🔒 ${attachment.name}` : attachment.name}</span>
      <span class="size">${attachment.error ? 'too large' : attachment.kind === 'secret' ? 'secret' : size(attachment.size)}</span>
      <button class="x" aria-label=${`Remove ${attachment.name}`} @click=${() => this.detach(attachment.id)}>×</button>
    </span>`;
  }

  #popup(): TemplateResult | typeof nothing {
    const popup = this.popup;
    if (!popup) return nothing;
    if (popup.kind === 'secret') {
      const submit = (event: Event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        this.shareSecret((form.elements.namedItem('name') as HTMLInputElement).value);
      };
      return html`<form class="popup secret" @submit=${submit} @keydown=${(event: KeyboardEvent) => event.key === 'Escape' && ((this.popup = null))}>
        <strong>Share a secret</strong>
        <span>The value goes to the secret store; the agent only sees its name.</span>
        <input name="name" placeholder="Name, e.g. API_TOKEN" aria-label="Secret name" />
        <input name="value" type="password" placeholder="Value" aria-label="Secret value" autocomplete="off" />
        <sp-button size="s" variant="accent" @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Share</sp-button>
      </form>`;
    }
    const title = {
      command: 'Commands',
      argument: 'Options',
      mention: 'Mention',
      file: 'Attach a file from SLICC',
    }[popup.kind];
    return html`<div class="popup" role="listbox" aria-label=${title} data-kind=${popup.kind}>
      ${
        popup.items.length
          ? popup.items.map(
              (item, index) => html`<div
                class="item"
                role="option"
                aria-selected=${index === popup.index ? 'true' : 'false'}
                data-value=${item.value}
                @mousedown=${(event: Event) => {
                  event.preventDefault();
                  this.pick(item);
                }}
              >
                <span class="label">${item.label}</span><span class="detail">${item.detail}</span>
              </div>`
            )
          : html`<div class="empty">Nothing matches.</div>`
      }
    </div>`;
  }

  #queue(): TemplateResult | typeof nothing {
    const queued = this.model?.agent.queue(this.#agent) ?? [];
    if (queued.length === 0) return nothing;
    const model = this.model as SliccModel;
    return html`<div class="queue" aria-label="Queued messages">
      ${queued.map(
        (message) => html`<div class="queued" data-id=${message.id}>
          <span aria-hidden="true">⏱</span><span class="text">${message.text}</span>
          <sp-action-button size="xs" quiet @click=${() => {
            model.agent.unqueue(this.#agent, message.id);
            void model.agent.send(this.#agent, {
              text: message.text,
              attachments: message.attachments,
              mode: 'steer',
            });
          }}>Send now</sp-action-button>
          <button class="x" aria-label="Remove from queue" @click=${() => model.agent.unqueue(this.#agent, message.id)}>×</button>
        </div>`
      )}
    </div>`;
  }

  #meta(): TemplateResult | typeof nothing {
    const model = this.model;
    const agent = model?.agent.list().find((candidate) => candidate.id === this.#agent);
    if (!(model && agent)) return nothing;
    const thinking = model.settings.get().thinking;
    return html`<sp-picker size="s" quiet label="Model" value=${agent.model} @change=${(event: Event) => model.agent.setModel(agent.id, (event.target as HTMLInputElement).value)}>
        ${model.settings.models().map((option) => html`<sp-menu-item value=${option.id}>${option.label}</sp-menu-item>`)}
      </sp-picker>
      <sp-picker size="s" quiet label="Thinking" value=${thinking} @change=${(event: Event) => model.settings.update({ thinking: (event.target as HTMLInputElement).value as Thinking })}>
        <sp-menu-item value="off">No thinking</sp-menu-item>
        <sp-menu-item value="low">Think a little</sp-menu-item>
        <sp-menu-item value="medium">Think</sp-menu-item>
        <sp-menu-item value="high">Think hard</sp-menu-item>
      </sp-picker>`;
  }

  render(): TemplateResult {
    const busy = this.#busy();
    const agent = this.model?.agent.list().find((candidate) => candidate.id === this.#agent);
    const suggestion = this.model?.agent.suggestion(this.#agent);
    const canSend = !!this.value.trim() || this.attachments.some((attachment) => !attachment.error);
    const speech = 'SpeechRecognition' in globalThis || 'webkitSpeechRecognition' in globalThis;
    return html`<div class="column">
        ${this.#queue()}
        ${this.#popup()}
        <div
          class="card"
          ?data-drop=${this.hasAttribute('dropping')}
          @dragover=${(event: DragEvent) => {
            event.preventDefault();
            this.setAttribute('dropping', '');
            this.requestUpdate();
          }}
          @dragleave=${() => {
            this.removeAttribute('dropping');
            this.requestUpdate();
          }}
          @drop=${this.#drop}
        >
          ${this.attachments.length ? html`<div class="chips">${this.attachments.map((attachment) => this.#chip(attachment))}</div>` : nothing}
          <textarea
            rows="1"
            aria-label="Message"
            placeholder=${suggestion ? `${suggestion}  (Tab)` : `Message ${agent?.name ?? ''}`}
            .value=${this.value}
            @input=${this.#input}
            @keydown=${this.#keydown}
            @paste=${this.#paste}
            @click=${() => this.#refresh()}
            @blur=${() => {
              if (this.popup && this.popup.kind !== 'file' && this.popup.kind !== 'secret')
                this.popup = null;
            }}
          ></textarea>
          <div class="toolbar">
            <sp-action-menu size="s" quiet label="Add" @change=${this.#add}>
              <sp-icon-add slot="icon"></sp-icon-add>
              <sp-menu-item value="upload">Upload from this computer</sp-menu-item>
              <sp-menu-item value="screenshot">Take a screenshot of the browser tab</sp-menu-item>
              <sp-menu-item value="file">Attach a file from SLICC</sp-menu-item>
              <sp-menu-item value="secret">Share a secret</sp-menu-item>
            </sp-action-menu>
            ${this.#meta()}
            <span class="spacer"></span>
            ${speech ? html`<sp-action-button size="s" quiet ?selected=${this.dictating} label="Dictate" @click=${() => this.dictate()}><sp-icon-microphone slot="icon"></sp-icon-microphone></sp-action-button>` : nothing}
            ${
              busy && !canSend
                ? html`<sp-button size="s" variant="secondary" treatment="outline" @click=${() => this.model?.agent.stop(this.#agent)}>Stop</sp-button>`
                : html`<sp-button size="s" variant="accent" ?disabled=${!canSend} @click=${() => this.send()}>
                    <sp-icon-send slot="icon"></sp-icon-send>${busy ? 'Queue' : 'Send'}
                  </sp-button>`
            }
          </div>
        </div>
        <input type="file" multiple @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          void this.addFiles([...(input.files ?? [])]);
          input.value = '';
        }} />
      </div>
      <div class="hint">
        <kbd>Enter</kbd> ${busy ? 'steer' : 'send'} · <kbd>Ctrl+Enter</kbd> queue · <kbd>Shift+Enter</kbd> new line · <kbd>/</kbd> commands ·
        <kbd>@</kbd> mention · <kbd>↑</kbd> history${busy ? html` · <kbd>Esc</kbd> stop` : nothing}
      </div>`;
  }
}

interface SpeechLike {
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>> &
          Iterable<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
