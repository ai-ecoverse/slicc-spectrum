import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/prompt-field/swc-prompt-field.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/upload-attachment/swc-upload-attachment.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-clock.js';
import '@adobe/spectrum-wc-icons/swc-icon-file.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-lock.js';
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  Attachment,
  Outgoing,
  SendMode,
  SliccModel,
  Thinking,
  UserMessage,
} from '../model/types.ts';
import { chatModels, ModelElement, shared } from './base.ts';
import { size } from './messages.ts';

export const limit = 25 * 1024 * 1024;

export interface Choice {
  value: string;
  label: string;
  detail: string;
  group?: string;
}

export interface Command {
  name: string;
  detail: string;
  args?(model: SliccModel): Choice[];
  available?(model: SliccModel): boolean;
  run(model: SliccModel, agentId: string, arg: string): void;
}

export function available(model: SliccModel): Command[] {
  return commands.filter((command) => command.available?.(model) ?? true);
}

export const commands: Command[] = [
  {
    name: 'clear',
    detail: 'Start a new chat',
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
      chatModels(model.settings.models()).map((option) => ({
        value: option.id,
        label: option.label,
        detail: option.provider,
      })),
    run: (model, id, arg) => {
      if (chatModels(model.settings.models()).some((option) => option.id === arg))
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
    available: (model) => typeof model.agent.freeze === 'function',
    run: (model, id) => model.agent.freeze?.(id),
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

export function filter(items: Choice[], query: string, limit = 8): Choice[] {
  const needle = query.toLowerCase();
  return items
    .filter(
      (item) =>
        item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle)
    )
    .slice(0, limit);
}

export function trigger(
  text: string,
  caret: number
): { kind: PopupKind; start: number; query: string } | null {
  const before = text.slice(0, caret);
  const argument = before.match(/^\/(\w+)\s+(\S*)$/);
  if (argument)
    return { kind: 'argument', start: before.length - argument[2].length, query: argument[2] };
  const command = before.match(/^\/([\w:-]*)$/);
  if (command) return { kind: 'command', start: 0, query: command[1] };
  const mention = before.match(/(^|\s)@([\w./-]*)$/);
  if (mention)
    return { kind: 'mention', start: before.length - mention[2].length - 1, query: mention[2] };
  return null;
}

type Field = HTMLElement & { updateComplete: Promise<boolean> };

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
  #keys = { capture: true, handleEvent: (event: KeyboardEvent) => this.#keydown(event) };

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
        padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-200);
        background: var(--swc-background-layer-1-color);
        font-size: var(--swc-font-size-100);
        position: relative;
      }
      .column {
        max-width: 860px;
        margin: 0 auto;
        position: relative;
      }
      swc-prompt-field {
        display: block;
      }
      .queue {
        list-style: none;
        margin: 0 0 var(--swc-spacing-100);
        padding: 0;
        display: grid;
        gap: var(--swc-spacing-75);
      }
      .queued {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-50) var(--swc-spacing-50) var(--swc-spacing-50) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-neutral-subtle-background-color-default);
        border: var(--swc-border-width-100) dashed var(--swc-gray-300);
        color: var(--swc-neutral-content-color-default);
      }
      .queued swc-icon-clock {
        flex: none;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .queued .text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sr {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .thumb {
        display: grid;
        place-items: center;
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-gray-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .thumb[data-error] {
        color: var(--swc-negative-content-color-default);
      }
      img[slot='thumbnail'] {
        object-fit: cover;
        border-radius: var(--swc-corner-radius-medium-default);
      }
      .failed {
        color: var(--swc-negative-content-color-default);
      }
      .below {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        max-width: 860px;
        margin: var(--swc-spacing-75) auto 0;
        min-height: var(--swc-component-height-75);
      }
      .hint {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .below swc-action-button {
        margin-inline-start: auto;
      }
      swc-action-button.selected {
        --swc-action-button-background-color-default: var(--swc-neutral-background-color-selected-default);
        --swc-action-button-background-color-hover: var(--swc-neutral-background-color-selected-hover);
        --swc-action-button-background-color-down: var(--swc-neutral-background-color-selected-down);
        --swc-action-button-background-color-focus: var(--swc-neutral-background-color-selected-key-focus);
        --swc-action-button-content-color-default: var(--swc-gray-25);
        --swc-action-button-content-color-hover: var(--swc-gray-25);
        --swc-action-button-content-color-down: var(--swc-gray-25);
        --swc-action-button-content-color-focus: var(--swc-gray-25);
      }
      @media (pointer: coarse), (hover: none) {
        .hint {
          display: none;
        }
      }
      .popup {
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + var(--swc-spacing-75));
        z-index: 3;
        max-height: 280px;
        overflow-y: auto;
        background: var(--swc-background-elevated-color);
        border: var(--swc-border-width-100) solid var(--swc-popover-border-color);
        border-radius: var(--swc-corner-radius-medium-default);
        box-shadow: var(--swc-drop-shadow-elevated);
        padding: var(--swc-spacing-75);
      }
      .item {
        display: flex;
        gap: var(--swc-spacing-100);
        align-items: baseline;
        padding: var(--swc-spacing-75) var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-small-default);
        cursor: pointer;
      }
      .item[aria-selected='true'] {
        background: var(--swc-gray-200);
      }
      .item .label {
        font-family: var(--swc-code-font-family-stack);
      }
      .heading {
        padding: var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-50);
        font-size: var(--swc-font-size-75);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .item .detail,
      .empty,
      .secret .lead {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .item .detail {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .empty {
        padding: var(--swc-spacing-75) var(--swc-spacing-100);
      }
      .secret {
        display: grid;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-100);
      }
      .secret input {
        font: inherit;
        min-height: var(--swc-component-height-100);
        padding: 0 var(--swc-spacing-100);
        border: var(--swc-border-width-100) solid var(--swc-gray-400);
        border-radius: var(--swc-corner-radius-small-default);
        background: var(--swc-background-layer-2-color);
        color: inherit;
      }
      .secret input:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      .secret swc-button {
        justify-self: start;
      }
      sp-menu {
        min-width: 240px;
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

  connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.#wire();
  }

  protected firstUpdated(): void {
    this.#wire();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('popup'))
      this.renderRoot
        .querySelector('.item[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }

  #wire(): void {
    const field = this.#field as Field;
    void field.updateComplete.then(() => {
      const popover = this.renderRoot.querySelector('swc-popover') as HTMLElement & {
        triggerElement: HTMLElement | null;
      };
      popover.triggerElement = null;
      popover.triggerElement = (field.shadowRoot as ShadowRoot).querySelector<HTMLElement>(
        '.swc-PromptField-upload'
      );
    });
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
    void this.updateComplete
      .then(() => this.#field?.updateComplete)
      .then(() => this.#textarea?.focus());
  }

  restore(message: Outgoing): void {
    this.value = message.text;
    this.attachments = [...(message.attachments ?? [])];
    this.#history = -1;
    this.focus();
  }

  get #field(): Field | null {
    return this.renderRoot.querySelector<Field>('swc-prompt-field');
  }

  get #textarea(): HTMLTextAreaElement | null {
    return this.#field?.shadowRoot?.querySelector('textarea') ?? null;
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
    const known = command && available(model).find((candidate) => candidate.name === command[1]);
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
      const usable = available(model);
      const builtins = usable.map((command) => ({
        value: command.name,
        label: `/${command.name}`,
        detail: command.detail,
      }));
      const own = model.agent
        .commands(this.#agent)
        .filter((command) => !usable.some((builtin) => builtin.name === command.name))
        .map((command) => ({
          value: command.name,
          label: `/${command.name}`,
          detail: command.description,
          group: command.kind === 'skill' ? 'Skills' : 'Prompts',
        }))
        .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Prompts' ? -1 : 1));
      return filter([...builtins, ...own], query, Number.POSITIVE_INFINITY);
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
    const name = this.value.match(/^\/(\w+)/)?.[1];
    const takes = commands.some((command) => command.name === name && command.args);
    this.popup =
      found && (found.kind !== 'argument' || takes)
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
    void this.updateComplete
      .then(() => this.#field?.updateComplete)
      .then(() => {
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
    const area = this.#textarea;
    if (event.isComposing || !area || event.composedPath()[0] !== area) return;
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
    if (handled || event.key === 'Enter') event.stopPropagation();
  }

  #input(event: CustomEvent<{ value: string }>): void {
    this.value = event.detail.value;
    this.#history = -1;
    this.#refresh();
  }

  async #paste(event: ClipboardEvent): Promise<void> {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    await this.addFiles(files);
  }

  #add(event: Event): void {
    const value = (event.target as HTMLElement & { value: string }).value;
    const popover = this.renderRoot.querySelector('swc-popover') as HTMLElement & { open: boolean };
    popover.open = false;
    if (value === 'upload')
      this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click();
    else if (value === 'screenshot') void this.screenshot();
    else {
      this.openPopup(value as 'file' | 'secret');
      void this.updateComplete.then(() =>
        value === 'file'
          ? this.#textarea?.focus()
          : this.renderRoot.querySelector<HTMLInputElement>('.secret input')?.focus()
      );
    }
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

  #thumbnail(attachment: Attachment): TemplateResult {
    if (attachment.kind === 'image' && attachment.url && !attachment.error)
      return html`<img slot="thumbnail" src=${attachment.url} alt="" />`;
    const icon = attachment.error
      ? html`<swc-icon-alert-triangle></swc-icon-alert-triangle>`
      : attachment.kind === 'secret'
        ? html`<swc-icon-lock></swc-icon-lock>`
        : attachment.kind === 'text'
          ? html`<swc-icon-file-text></swc-icon-file-text>`
          : html`<swc-icon-file></swc-icon-file>`;
    return html`<span slot="thumbnail" class="thumb" ?data-error=${!!attachment.error} aria-hidden="true">${icon}</span>`;
  }

  #attachment(attachment: Attachment): TemplateResult {
    const detail =
      attachment.error ?? (attachment.kind === 'secret' ? 'Secret' : size(attachment.size));
    return html`<swc-upload-attachment
      slot="attachment"
      type="card"
      dismissible
      data-id=${attachment.id}
      data-kind=${attachment.kind}
      ?data-error=${!!attachment.error}
      title=${attachment.path ?? attachment.name}
      @swc-upload-attachment-dismiss=${() => this.detach(attachment.id)}
    >
      ${this.#thumbnail(attachment)}
      <span slot="title">${attachment.name}</span>
      <span slot="subtitle" class=${attachment.error ? 'failed' : ''}>${detail}</span>
    </swc-upload-attachment>`;
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
        <span class="lead">The value goes to the secret store; the agent only sees its name.</span>
        <input name="name" placeholder="Name, e.g. API_TOKEN" aria-label="Secret name" />
        <input name="value" type="password" placeholder="Value" aria-label="Secret value" autocomplete="off" />
        <swc-button size="s" variant="accent" @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Share</swc-button>
      </form>`;
    }
    const title = {
      command: 'Commands',
      argument: 'Options',
      mention: 'Mention',
      file: 'Attach a file from SLICC',
    }[popup.kind];
    const option = (item: Choice, index: number) => html`<div
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
    </div>`;
    const sections: { group?: string; entries: [Choice, number][] }[] = [];
    popup.items.forEach((item, index) => {
      const last = sections.at(-1);
      if (last && last.group === item.group) last.entries.push([item, index]);
      else sections.push({ group: item.group, entries: [[item, index]] });
    });
    return html`<div class="popup" role="listbox" aria-label=${title} data-kind=${popup.kind}>
      ${
        popup.items.length
          ? sections.map(({ group, entries }) =>
              group
                ? html`<div class="section" role="group" aria-label=${group} data-group=${group}>
                    <div class="heading" aria-hidden="true">${group}</div>
                    ${entries.map(([item, index]) => option(item, index))}
                  </div>`
                : entries.map(([item, index]) => option(item, index))
            )
          : html`<div class="empty">Nothing matches.</div>`
      }
    </div>`;
  }

  #queue(): TemplateResult | typeof nothing {
    const queued = this.model?.agent.queue(this.#agent) ?? [];
    if (queued.length === 0) return nothing;
    const model = this.model as SliccModel;
    return html`<ul class="queue" aria-label="Queued messages">
      ${queued.map(
        (message) => html`<li class="queued" data-id=${message.id}>
          <swc-icon-clock size="s" aria-hidden="true"></swc-icon-clock>
          <span class="text"><span class="sr">Queued: </span>${message.text}</span>
          <swc-action-button size="s" quiet data-action="send-now" @click=${() => {
            model.agent.unqueue(this.#agent, message.id);
            void model.agent.send(this.#agent, {
              text: message.text,
              attachments: message.attachments,
              mode: 'steer',
            });
          }}>Send now</swc-action-button>
          <swc-close-button size="s" data-action="unqueue" accessible-label="Remove from queue" @click=${() => model.agent.unqueue(this.#agent, message.id)}></swc-close-button>
        </li>`
      )}
    </ul>`;
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
        <swc-prompt-field
          label="Message"
          upload-label="Add"
          stop-label="Stop"
          send-label=${busy ? 'Steer' : 'Send'}
          max-rows="10"
          animate-loader
          ?generating=${busy && !canSend}
          placeholder=${suggestion ? `${suggestion}  (Tab)` : `Message ${agent?.name ?? ''}`}
          .value=${live(this.value)}
          @keydown=${this.#keys}
          @swc-prompt-field-input=${this.#input}
          @swc-prompt-field-submit=${() => this.send()}
          @swc-prompt-field-stop=${() => this.model?.agent.stop(this.#agent)}
          @swc-prompt-field-drop=${(event: CustomEvent<{ files: File[] }>) => void this.addFiles(event.detail.files)}
          @paste=${this.#paste}
          @click=${() => this.#refresh()}
          @focusout=${() => {
            if (this.popup && this.popup.kind !== 'file' && this.popup.kind !== 'secret')
              this.popup = null;
          }}
        >
          ${this.attachments.map((attachment) => this.#attachment(attachment))}
        </swc-prompt-field>
        <swc-popover placement="top-start" accessible-label="Add to the message" @swc-after-open=${() => this.renderRoot.querySelector<HTMLElement>('sp-menu')?.focus()}>
          <sp-menu label="Add to the message" @change=${this.#add}>
            <sp-menu-item value="upload">Upload from this computer</sp-menu-item>
            <sp-menu-item value="screenshot">Take a screenshot of the browser tab</sp-menu-item>
            <sp-menu-item value="file">Attach a file from SLICC</sp-menu-item>
            <sp-menu-item value="secret">Share a secret</sp-menu-item>
          </sp-menu>
        </swc-popover>
        <input type="file" multiple @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          void this.addFiles([...(input.files ?? [])]);
          input.value = '';
        }} />
      </div>
      <div class="below">
        <div class="hint">
          <kbd>Enter</kbd> ${busy ? 'steer' : 'send'} · <kbd>Ctrl+Enter</kbd> queue · <kbd>Shift+Enter</kbd> new line · <kbd>/</kbd> commands ·
          <kbd>@</kbd> mention · <kbd>↑</kbd> history${busy ? html` · <kbd>Esc</kbd> stop` : nothing}
        </div>
        ${
          speech
            ? html`<swc-action-button
                size="s"
                quiet
                class=${this.dictating ? 'selected' : ''}
                accessible-label=${this.dictating ? 'Stop dictation' : 'Dictate'}
                data-action="dictate"
                @click=${() => this.dictate()}
              ><swc-icon-microphone slot="icon"></swc-icon-microphone></swc-action-button>`
            : nothing
        }
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
