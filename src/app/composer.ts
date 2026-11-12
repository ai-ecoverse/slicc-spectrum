import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/prompt-field/swc-prompt-field.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/upload-attachment/swc-upload-attachment.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-attach.js';
import '@adobe/spectrum-wc-icons/swc-icon-clock.js';
import '@adobe/spectrum-wc-icons/swc-icon-file.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-lock.js';
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type ReactiveController,
  type TemplateResult,
} from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  AgentPort,
  Attachment,
  AttachmentLimits,
  CaptureKind,
  Outgoing,
  Recording,
  Seat,
  SendMode,
  SliccModel,
  Thinking,
  UserMessage,
  VaultPort,
} from '../model/types.ts';
import { looksLikeText, mimeOf, nameProblem, valueProblem } from '../model/values.ts';
import { chatModels, shared, speech, ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { deadline, mine, size } from './messages.ts';
import {
  away,
  clearValues,
  drop,
  enters,
  failureText,
  fieldOf,
  goneText,
  ours,
  type PopupDetail,
  take,
  type ValueDetail,
  valueConfig,
  valueField,
} from './vault.ts';

export const limit = 100 * 1024 * 1024;

export function tooLarge(bytes: number): string {
  return `Too large: attachments are limited to ${size(bytes)}`;
}

export function smallest(limits: AttachmentLimits = {}): number {
  return Math.min(limit, limits.image ?? limit, limits.text ?? limit, limits.file ?? limit);
}

export function together(bytes: number): string {
  return `These attachments add up to more than ${size(bytes)}; send them in separate messages.`;
}

function carried(attachment: Attachment): boolean {
  return (
    attachment.url !== undefined || attachment.text !== undefined || attachment.path === undefined
  );
}

type Kept = Pick<Attachment, 'name' | 'mimeType' | 'size'>;
type Waiting = {
  id: string;
  text: string;
  mode: SendMode;
  attachments: Attachment[];
  lost?: Kept[];
  agent?: string;
};

export const startingKey = 'slicc-spectrum.starting';

const names = (files: readonly Kept[]): string => files.map((file) => file.name).join(', ');

export function reattach(files: readonly { name: string }[]): string {
  const all = files.map((file) => file.name);
  if (all.length > 3) return `Attach these ${all.length} files again: ${all.join(', ')}.`;
  const listed =
    all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : (all[0] as string);
  return `Attach ${listed} again.`;
}

const notKept = (files: readonly Kept[]): string =>
  files.length === 1
    ? `Not sent: ${files[0].name} wasn’t kept after reload.`
    : `Not sent: ${files.length} files weren’t kept after reload.`;

function session(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

type Stored = Omit<Waiting, 'attachments'> & { attachments: Kept[] };

function stored(): Stored[] {
  try {
    const rows = JSON.parse(session()?.getItem(startingKey) ?? '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function write(rows: readonly Stored[]): void {
  try {
    if (rows.length) session()?.setItem(startingKey, JSON.stringify(rows));
    else session()?.removeItem(startingKey);
  } catch {
    return;
  }
}

function reloaded(): boolean {
  const [entry] = globalThis.performance?.getEntriesByType?.('navigation') ?? [];
  return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload';
}

let claimed: Set<string> | null = null;

function restore(owned: Set<string>): Waiting[] {
  if (!claimed) {
    claimed = new Set();
    if (!reloaded()) write([]);
  }
  const taken = claimed;
  const fresh = stored().filter((row) => !taken.has(row.id));
  for (const row of fresh) {
    taken.add(row.id);
    owned.add(row.id);
  }
  return fresh.map(({ id, text, mode, attachments, lost = [], agent }) => ({
    id,
    text,
    mode,
    attachments: [],
    lost: [...lost, ...attachments],
    ...(agent ? { agent } : {}),
  }));
}

function keep(owned: Set<string>, rows: readonly Waiting[]): void {
  const meta = ({ name, mimeType, size }: Kept): Kept => ({ name, mimeType, size });
  const others = stored().filter((row) => !owned.has(row.id));
  owned.clear();
  for (const row of rows) {
    owned.add(row.id);
    claimed?.add(row.id);
  }
  write([
    ...others,
    ...rows.map((row) => ({
      id: row.id,
      text: row.text,
      mode: row.mode,
      attachments: row.attachments.map(meta),
      lost: (row.lost ?? []).map(meta),
      ...(row.agent ? { agent: row.agent } : {}),
    })),
  ]);
}
type Draft = { value: string; attachments: Attachment[]; reattach?: Kept[] | null };

type Page = {
  rows: readonly Waiting[];
  owned: Set<string>;
  draft: Draft | null;
  hosts: Set<HTMLElement & { requestUpdate(): void }>;
  watched: Map<SliccModel, { count: number; off(): void }>;
};

const pages = new WeakMap<object, Page>();

function owner(node: Node): object {
  let at: Node | null = node;
  while (at) {
    if (at instanceof Element && at.localName === 'slicc-app') return at;
    at = at.parentNode ?? (at instanceof ShadowRoot ? at.host : null);
  }
  return node.ownerDocument as Document;
}

function pageOf(key: object): Page {
  const known = pages.get(key);
  if (known) return known;
  const owned = new Set<string>();
  const found: Page = {
    rows: restore(owned),
    owned,
    draft: null,
    hosts: new Set(),
    watched: new Map(),
  };
  pages.set(key, found);
  return found;
}

function settle(page: Page, rows: readonly Waiting[]): void {
  page.rows = rows;
  keep(page.owned, rows);
  for (const host of [...page.hosts]) host.requestUpdate();
}

function post(model: SliccModel, id: string, message: Outgoing): void {
  const attachments = message.attachments ?? [];
  const done = () => retire(model.agent, id, attachments);
  model.agent.send(id, { ...message, attachments }).then(done, done);
}

function deliver(model: SliccModel, id: string, message: Outgoing, mode: SendMode): void {
  const busy = model.agent.busy(id);
  const resolved: SendMode =
    mode === 'queue' ? (busy ? 'queue' : 'send') : busy || mode === 'steer' ? 'steer' : 'send';
  post(model, id, { text: message.text, attachments: message.attachments, mode: resolved });
}

function arrived(page: Page, model: SliccModel): void {
  const waiting = page.rows;
  const agents = model.agent.list();
  if (!(waiting.length && agents.length) || model.agent.starting?.()) return;
  const active = model.agent.active();
  const fallback = agents.some((agent) => agent.id === active) ? active : agents[0].id;
  const sendable = (row: Waiting) =>
    !!(row.text || row.attachments.length) && !row.lost?.length && !stray(model, row);
  const going = waiting.filter(sendable);
  if (!going.length) return;
  settle(
    page,
    waiting.filter((row) => !sendable(row))
  );
  const started = new Set<string>();
  for (const row of going) {
    const id = row.agent ?? fallback;
    if (started.has(id))
      post(model, id, { text: row.text, attachments: row.attachments, mode: 'queue' });
    else deliver(model, id, row, 'queue');
    started.add(id);
  }
}

function stray(model: SliccModel | null | undefined, row: Waiting): boolean {
  if (!(row.agent && model) || model.agent.starting?.()) return false;
  const agents = model.agent.list();
  return agents.length > 0 && !agents.some((agent) => agent.id === row.agent);
}

function watch(page: Page, model: SliccModel): () => void {
  const arrive = () => arrived(page, model);
  let live = true;
  queueMicrotask(() => {
    if (live) arrive();
  });
  const known = page.watched.get(model);
  if (known) known.count++;
  else {
    const offs = [
      model.agent.on('agents', arrive),
      ...(model.agent.starting ? [model.agent.on('starting', arrive)] : []),
    ];
    page.watched.set(model, {
      count: 1,
      off: () => {
        for (const off of offs) off();
      },
    });
  }
  return () => {
    live = false;
    const entry = page.watched.get(model) as { count: number; off(): void };
    if (--entry.count) return;
    entry.off();
    page.watched.delete(model);
  };
}

export function flushStarting(node: Node, model: SliccModel): () => void {
  return watch(pageOf(owner(node)), model);
}

class PageQueue implements ReactiveController {
  #host: SliccComposer;
  #owner: object | null = null;

  constructor(host: SliccComposer) {
    this.#host = host;
    host.addController(this);
  }

  #page(): Page {
    this.#owner ??= this.#host.isConnected ? owner(this.#host) : null;
    return pageOf(this.#owner ?? this.#host.ownerDocument);
  }

  get value(): readonly Waiting[] {
    return this.#page().rows;
  }

  set value(rows: readonly Waiting[]) {
    settle(this.#page(), rows);
  }

  get draft(): Draft | null {
    return this.#page().draft;
  }

  set draft(draft: Draft | null) {
    this.#page().draft = draft;
  }

  watch(model: SliccModel): Array<() => void> {
    return this.#owner === this.#host.ownerDocument ? [watch(this.#page(), model)] : [];
  }

  hostConnected(): void {
    this.#owner = owner(this.#host);
    this.#page().hosts.add(this.#host);
  }

  hostDisconnected(): void {
    this.#page().hosts.delete(this.#host);
  }
}

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
    detail: 'Start a new conversation',
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
    run: (model, id, arg) => {
      if (['off', 'low', 'medium', 'high'].includes(arg))
        model.agent.setThinking(id, arg as Thinking);
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
    detail: 'Delete this cone; its conversation stays in the Freezer',
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

export function folders(transfer: DataTransfer | null): Set<File> {
  const found = new Set<File>();
  const items = [...(transfer?.items ?? [])].filter((item) => item.kind === 'file');
  items.forEach((item, index) => {
    if (item.webkitGetAsEntry?.()?.isDirectory) found.add((transfer as DataTransfer).files[index]);
  });
  return found;
}

async function readable(file: Blob): Promise<string> {
  await file.slice(0, 1).arrayBuffer();
  return '';
}

export const linger = 60_000;

export const fade = css`
  :host {
    --composer-fade: 72px;
  }
  @media (prefers-reduced-transparency: reduce), (forced-colors: active) {
    :host {
      --composer-fade: 0px;
    }
  }
`;

export function release(attachments: readonly Attachment[]): void {
  for (const attachment of attachments)
    if (attachment.url?.startsWith('blob:')) URL.revokeObjectURL(attachment.url);
}

export function retire(agent: AgentPort, id: string, attachments: readonly Attachment[]): void {
  const urls = new Set(attachments.flatMap((attachment) => attachment.url ?? []));
  const waiting = () =>
    agent
      .queue(id)
      .some((message) => message.attachments?.some((attachment) => urls.has(attachment.url ?? '')));
  const later = () => void setTimeout(() => release(attachments), linger);
  if (!waiting()) {
    later();
    return;
  }
  const off = agent.on('messages', () => {
    if (waiting()) return;
    off();
    later();
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

const day = 24 * 60 * 60 * 1000;

export function reviewer(seat: Seat, cone: string): string | null {
  const gate = seat.gates.messages;
  if (gate === 'off') return null;
  if (gate === 'user') return 'The host';
  if (gate === 'agent') return 'An automatic check';
  return cone;
}

export function seatNote(seat: Seat, cone: string, now = Date.now()): string {
  const who = reviewer(seat, cone);
  const note = who
    ? `${who} reviews what you send before it reaches the agent.`
    : `You’re chatting with ${cone} as ${seat.label}.`;
  const at = seat.expiresAt;
  return at !== null && at - now < day ? `${note} Your link expires at ${deadline(at)}.` : note;
}

export function blocked(vault: VaultPort): string | null {
  if (away(vault)) return 'Waiting for the vault';
  return vault.status()?.locked ? 'Unlock the vault first' : null;
}

export class SliccComposer extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    value: { state: true },
    attachments: { state: true },
    popup: { state: true },
    dictating: { state: true },
    erasing: { state: true },
    blocked: { state: true },
    sharing: { state: true },
    secretError: { state: true },
    secretField: { state: true },
    secretName: { state: true },
    entry: { state: true },
    failure: { state: true },
    reattach: { state: true },
    recording: { state: true },
    agent: {},
  };
  declare value: string;
  declare attachments: Attachment[];
  declare popup: Popup | null;
  declare dictating: boolean;
  declare erasing: boolean;
  declare blocked: boolean;
  declare sharing: boolean;
  declare secretError: string | null;
  declare secretField: string | null;
  declare secretName: string;
  declare entry: { request: string; name: string; vault: VaultPort } | null;
  declare failure: string | null;
  declare reattach: Kept[] | null;
  declare recording: CaptureKind | null;
  declare agent: string;
  #drafts = new Map<string, Draft>();
  #waiting = new PageQueue(this);
  #history = -1;
  #paths: string[] = [];
  #pathsGen = 0;
  #agent = '';
  #next = 1;
  #session: Recording | null = null;
  #abandon: ReturnType<typeof setTimeout> | undefined;
  #recognition: { stop(): void } | null = null;
  #erase: ReturnType<typeof setTimeout> | undefined;
  #release = (event: Event): void => {
    const released =
      event instanceof KeyboardEvent && (event.code === 'KeyM' || event.key === 'Alt');
    if (this.dictating && (released || event.type === 'blur')) this.dictate();
  };
  #outside = (event: Event): void => {
    const form = this.renderRoot.querySelector('form.secret');
    if (form && !this.sharing && !event.composedPath().includes(form)) this.closeSecret();
  };
  #keys = { capture: true, handleEvent: (event: KeyboardEvent) => this.#keydown(event) };

  constructor() {
    super();
    this.value = '';
    this.attachments = [];
    this.popup = null;
    this.dictating = false;
    this.erasing = false;
    this.blocked = false;
    this.sharing = false;
    this.secretError = null;
    this.secretField = null;
    this.secretName = '';
    this.entry = null;
    this.failure = null;
    this.reattach = null;
    this.recording = null;
    this.agent = '';
  }

  static styles = [
    shared,
    fade,
    css`
      :host {
        display: block;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2;
        padding: var(--swc-spacing-100) var(--swc-spacing-200) var(--swc-spacing-200);
        font-size: var(--swc-font-size-100);
      }
      :host::before {
        content: '';
        position: absolute;
        top: calc(-1 * var(--composer-fade));
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        pointer-events: none;
        background: color-mix(in srgb, var(--swc-background-layer-1-color) 72%, transparent);
        backdrop-filter: blur(16px) saturate(1.4);
        -webkit-backdrop-filter: blur(16px) saturate(1.4);
        mask-image: linear-gradient(to bottom, transparent, black var(--composer-fade));
        -webkit-mask-image: linear-gradient(to bottom, transparent, black var(--composer-fade));
      }
      @media (prefers-reduced-transparency: reduce) {
        :host::before {
          background: var(--swc-background-layer-1-color);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          mask-image: none;
          -webkit-mask-image: none;
        }
      }
      @media (forced-colors: active) {
        :host::before {
          background: Canvas;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          mask-image: none;
          -webkit-mask-image: none;
          border-block-start: var(--swc-border-width-100) solid CanvasText;
        }
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
        grid-template-columns: minmax(0, 1fr);
        gap: var(--swc-spacing-75);
      }
      .queued {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-50) var(--swc-spacing-50) var(--swc-spacing-50) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-neutral-subtle-background-color-default);
        border: var(--swc-border-width-100) dashed var(--swc-neutral-visual-color);
        color: var(--swc-neutral-content-color-default);
      }
      .hold {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--swc-spacing-100);
        margin: 0 0 var(--swc-spacing-100);
        padding: var(--swc-spacing-75) var(--swc-spacing-100) var(--swc-spacing-75) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-informative-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
      }
      .hold[data-hold='locked'] {
        background: var(--swc-notice-subtle-background-color-default);
      }
      .hold swc-icon-lock,
      .hold swc-progress-circle {
        flex: none;
      }
      .hold .text {
        flex: 1;
        min-inline-size: 12em;
      }
      .hold .blocked {
        flex-basis: 100%;
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-75);
        color: var(--swc-negative-content-color-default);
      }
      .hold .held {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .queued swc-icon-clock,
      .queued > swc-icon-file {
        flex: none;
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .queued .next {
        flex: none;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .queued .body {
        flex: 1;
        min-inline-size: 0;
        display: grid;
      }
      .queued > swc-icon-alert-triangle {
        flex: none;
        --swc-icon-color: var(--swc-notice-visual-color);
      }
      .queued [data-lost] {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .queued [data-files] {
        display: inline-flex;
        align-items: center;
        gap: var(--swc-spacing-50);
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
      .send-error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin: 0 0 var(--swc-spacing-100);
        padding: var(--swc-spacing-75) var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-negative-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      .send-error swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .seat-note,
      .reattach {
        margin: var(--swc-spacing-100) 0 0;
        padding-inline: var(--swc-spacing-200);
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
        text-align: center;
      }
      .reattach {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--swc-spacing-75);
      }
      .reattach swc-action-button {
        color: var(--swc-neutral-subdued-content-color-default);
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
      .secret .field {
        display: grid;
        gap: var(--swc-spacing-75);
      }
      .secret .field > span {
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
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
      .secret input[aria-invalid='true'] {
        border-color: var(--swc-negative-border-color-default);
      }
      .secret input:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      .secret .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100);
      }
      .secret .value-field {
        min-inline-size: min(22rem, 70vw);
      }
      .secret-error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        color: var(--swc-negative-content-color-default);
        font-size: var(--swc-font-size-75);
        --swc-icon-color: var(--swc-negative-content-color-default);
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
    if (changed.has('popup') && this.popup?.kind !== 'secret') {
      clearValues(this.renderRoot);
      this.#leave();
      this.secretName = '';
    }
    if (changed.has('agent') && this.agent && this.model && this.agent !== this.#agent) {
      this.#switch(this.agent);
    }
    if (this.reattach && !this.value.trim()) this.reattach = null;
    const edited = changed.has('value') || changed.has('attachments') || changed.has('reattach');
    if (edited && this.hasUpdated && !this.#agent && this.#starting())
      this.#waiting.draft = {
        value: this.value,
        attachments: this.attachments,
        reattach: this.reattach,
      };
  }

  connectedCallback(): void {
    super.connectedCallback();
    clearTimeout(this.#abandon);
    globalThis.addEventListener('keyup', this.#release);
    globalThis.addEventListener('blur', this.#release);
    globalThis.addEventListener('pointerdown', this.#outside, true);
    if (this.hasUpdated) this.#wire();
  }

  protected firstUpdated(): void {
    this.#wire();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    globalThis.removeEventListener('keyup', this.#release);
    globalThis.removeEventListener('blur', this.#release);
    globalThis.removeEventListener('pointerdown', this.#outside, true);
    clearValues(this.renderRoot);
    this.#leave();
    const kept = this.#waiting.draft?.attachments;
    const held = [
      this.attachments === kept ? [] : this.attachments,
      ...[...this.#drafts.values()].map((draft) => draft.attachments),
    ];
    if (held.flat().some((attachment) => attachment.url?.startsWith('blob:')))
      this.#abandon = setTimeout(() => {
        for (const attachments of held) release(attachments);
      }, linger);
  }

  protected updated(changed: Map<string, unknown>): void {
    this.#guard();
    if (changed.has('popup'))
      this.renderRoot
        .querySelector('.item[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }

  #wire(): void {
    const field = this.#field as Field;
    void field.updateComplete.then(() => {
      const popover = this.renderRoot.querySelector('swc-popover') as
        | (HTMLElement & { triggerElement: HTMLElement | null })
        | null;
      if (popover) {
        popover.triggerElement = null;
        popover.triggerElement = (field.shadowRoot as ShadowRoot).querySelector<HTMLElement>(
          '.swc-PromptField-upload'
        );
      }
      const area = this.#textarea as HTMLTextAreaElement & { ariaDescribedByElements: Element[] };
      area.ariaDescribedByElements = [this.renderRoot.querySelector('#keys') as Element];
    });
  }

  #takePaths(entries: readonly { kind: string; path: string }[]): void {
    this.#paths = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path);
    if (this.popup?.kind === 'file') {
      const items = this.#choices('file', this.popup.query);
      const index = items.length ? Math.min(this.popup.index, items.length - 1) : 0;
      this.popup = { ...this.popup, items, index };
    }
  }

  async #loadPaths(): Promise<void> {
    const model = this.model;
    if (!model || model.seat) return;
    const gen = ++this.#pathsGen;
    const entries = await model.files.list();
    if (this.model !== model || gen !== this.#pathsGen) return;
    this.#takePaths(entries);
    this.requestUpdate();
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#switch(this.agent || model.agent.active());
    void this.#loadPaths();
    const update = () => this.requestUpdate();
    return [
      ...super.subscribe(model),
      ...this.#waiting.watch(model),
      model.agent.on('active', (id) => {
        if (!this.agent) this.#switch(id);
      }),
      model.agent.on('hold', (hold) => {
        if (hold?.reason !== 'locked') this.blocked = false;
        update();
      }),
      model.agent.on('agents', update),
      ...(model.agent.starting
        ? [
            model.agent.on('starting', () => {
              if (this.#starting() && this.popup?.kind !== 'file' && this.popup?.kind !== 'secret')
                this.popup = null;
              update();
            }),
          ]
        : []),
      model.agent.on('messages', update),
      model.agent.on('message', update),
      model.settings.on('settings', update),
      ...(model.follow ? [model.follow.on('follow', update)] : []),
      ...(model.vault
        ? [model.vault.on('availability', update), model.vault.on('status', update)]
        : []),
      ...(model.seat
        ? []
        : [
            model.files.on('files', (entries) => {
              this.#pathsGen++;
              this.#takePaths(entries);
              update();
            }),
          ]),
    ];
  }

  attachable(): boolean {
    return !this.#held();
  }

  #starting(): string | null {
    return this.model?.agent.starting?.() ?? null;
  }

  #putBack(row: Waiting): void {
    this.value = this.value.trim() ? `${this.value}\n${row.text}` : row.text;
    const listed = new Set((this.reattach ?? []).map((file) => file.name));
    const fresh = (row.lost ?? []).filter(
      (file) => !listed.has(file.name) && listed.add(file.name)
    );
    this.reattach = [...(this.reattach ?? []), ...fresh];
    this.#history = -1;
    this.#unwait(row.id);
    this.focus();
  }

  #unwait(id: string): void {
    const waiting = this.#waiting.value;
    release(waiting.find((message) => message.id === id)?.attachments ?? []);
    this.#waiting.value = waiting.filter((message) => message.id !== id);
  }

  #held(): string | null {
    const state = this.model?.follow?.state();
    return state?.link === 'reconnecting' ? state.owner : null;
  }

  #switch(id: string): void {
    if (this.#agent)
      this.#drafts.set(this.#agent, {
        value: this.value,
        attachments: this.attachments,
        reattach: this.reattach,
      });
    const shared = this.#agent || !this.isConnected ? null : this.#waiting.draft;
    if (shared && id && !this.#drafts.has(id)) this.#waiting.draft = null;
    const draft = this.#drafts.get(id) ?? shared ?? undefined;
    this.#agent = id;
    this.value = draft?.value ?? '';
    this.attachments = draft?.attachments ?? [];
    this.reattach = draft?.reattach ?? null;
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

  #limits(): AttachmentLimits {
    return this.model?.agent.attachmentLimits?.() ?? {};
  }

  #cap(attachment: Attachment): number {
    return Math.min(limit, this.#limits()[attachment.kind] ?? limit);
  }

  #over(attachment: Attachment): boolean {
    return (
      carried(attachment) && attachment.size > (attachment.error ? limit : this.#cap(attachment))
    );
  }

  #problem(attachment: Attachment): string | undefined {
    return (
      attachment.error ?? (this.#over(attachment) ? tooLarge(this.#cap(attachment)) : undefined)
    );
  }

  #together(): string | null {
    const total = this.#limits().total;
    if (total === undefined) return null;
    const sum = this.attachments
      .filter((attachment) => !attachment.error && carried(attachment))
      .reduce((bytes, attachment) => bytes + attachment.size, 0);
    return sum > total ? together(total) : null;
  }

  #blocked(): boolean {
    return this.attachments.some((attachment) => this.#over(attachment)) || !!this.#together();
  }

  #guard(): void {
    const field = this.#field as Field & { disabled: boolean; generating: boolean };
    const blocked = this.#blocked();
    void field.updateComplete.then(() => {
      const button = (field.shadowRoot as ShadowRoot).querySelector(
        '.swc-PromptField-send, .swc-PromptField-stop'
      ) as HTMLElement & { disabled: boolean };
      button.disabled = (field.disabled || blocked) && !field.generating;
    });
  }

  send(mode: SendMode = 'send'): void {
    const model = this.model;
    const text = this.value.trim();
    const attachments = this.attachments.filter((attachment) => !attachment.error);
    if (!model || (!text && attachments.length === 0) || this.#held() || this.#blocked()) return;
    if (model.seat) {
      this.#propose(model, text);
      return;
    }
    const command = text.match(/^\/(\w+)(?:\s+(.*))?$/);
    const known = command && available(model).find((candidate) => candidate.name === command[1]);
    this.value = '';
    this.attachments = [];
    this.popup = null;
    this.#history = -1;
    if (this.#starting()) {
      const row = { id: this.#id(), text, mode, attachments };
      this.#waiting.value = [
        ...this.#waiting.value,
        this.#agent ? { ...row, agent: this.#agent } : row,
      ];
      return;
    }
    if (known) {
      release(attachments);
      known.run(model, this.#agent, (command[2] ?? '').trim());
      return;
    }
    deliver(model, this.#agent, { text, attachments }, mode);
  }

  #propose(model: SliccModel, text: string): void {
    this.value = '';
    this.failure = null;
    this.#history = -1;
    model.agent.send(this.#agent, text).catch((error: unknown) => {
      const draft = this.value.trim();
      this.value = draft && draft !== text ? `${text}\n${this.value}` : text;
      this.failure = error instanceof Error ? error.message : String(error);
    });
  }

  #id(): string {
    return `a-${Date.now().toString(36)}-${this.#next++}`;
  }

  #folders: ReadonlySet<File> = new Set();

  #mark = {
    handleEvent: (event: DragEvent) => {
      this.#folders = folders(event.dataTransfer);
    },
    capture: true,
  };

  async addFiles(
    files: readonly File[],
    dropped: ReadonlySet<File> = new Set()
  ): Promise<Attachment[]> {
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
          error: tooLarge(limit),
        });
        continue;
      }
      const image = file.type.startsWith('image/');
      const textual =
        file.type.startsWith('text/') ||
        /\.(md|txt|json|ts|js|css|html|ya?ml|toml|csv)$/i.test(file.name);
      const content = await (image || textual ? readFile(file) : readable(file)).catch(() => null);
      if (content === null)
        added.push({
          ...base,
          kind: 'file',
          error: dropped.has(file) ? 'Folders can’t be attached' : 'Could not read the file',
        });
      else if (image) added.push({ ...base, kind: 'image', url: content });
      else if (textual) added.push({ ...base, kind: 'text', text: content });
      else added.push({ ...base, kind: 'file', url: URL.createObjectURL(file) });
    }
    this.attachments = [...this.attachments, ...added];
    return added;
  }

  detach(id: string): void {
    release(this.attachments.filter((attachment) => attachment.id === id));
    this.attachments = this.attachments.filter((attachment) => attachment.id !== id);
  }

  #failAttach(name: string, error: string, mimeType = 'application/octet-stream'): void {
    this.attachments = [
      ...this.attachments,
      {
        id: this.#id(),
        name,
        kind: 'file',
        mimeType,
        size: 0,
        error,
      },
    ];
  }

  #switchOff(key: 'screen' | 'camera' | 'microphone'): boolean {
    const found = this.model?.switches?.list().find((item) => item.key === key);
    return !!found && !found.on;
  }

  #captureError(
    error: unknown,
    fallback: string,
    switchKey?: 'screen' | 'camera' | 'microphone'
  ): string {
    if (!(error instanceof Error)) return fallback;
    if (error.name === 'AbortError') return '';
    if (error.name === 'NotAllowedError' && switchKey && this.#switchOff(switchKey)) {
      const labels = {
        screen: 'Screen capture',
        camera: 'Camera',
        microphone: 'Microphone',
      } as const;
      return `${labels[switchKey]} is switched off. Turn it on in Settings, Capture and devices.`;
    }
    if (error.name === 'NotAllowedError') return error.message || fallback;
    if (error.name === 'NotSupportedError')
      return error.message || 'Recording isn’t supported here';
    return error.message || fallback;
  }

  #errorDetail(error: string): string {
    return error.replace(' is switched off.', ' is off.').replace(', Capture and devices.', '.');
  }

  async screenshot(): Promise<void> {
    const capture = this.model?.capture;
    if (capture?.still) {
      try {
        const shot = await capture.still();
        await this.addFiles([new File([shot.blob], shot.name, { type: shot.mimeType })]);
      } catch (error) {
        const message = this.#captureError(error, 'Screen capture was denied', 'screen');
        if (message) this.#failAttach('screenshot.png', message, 'image/png');
      }
      return;
    }
    const browser = this.model?.browser;
    const tab = browser?.list().find((candidate) => candidate.id === browser.active());
    if (!(browser && tab)) {
      this.#failAttach('screenshot.png', 'No screen or browser tab to screenshot', 'image/png');
      return;
    }
    try {
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
    } catch (error) {
      const message = this.#captureError(error, 'Could not take a screenshot');
      if (message) this.#failAttach('screenshot.png', message, 'image/png');
    }
  }

  async record(kind: CaptureKind): Promise<void> {
    const capture = this.model?.capture;
    if (!capture || this.#session) return;
    try {
      const session = await capture.record(kind);
      this.#session = session;
      this.recording = kind;
      const take = await session.finished;
      this.#session = null;
      this.recording = null;
      await this.addFiles([new File([take.blob], take.name, { type: take.mimeType })]);
    } catch (error) {
      this.#session = null;
      this.recording = null;
      const mic = kind === 'audio';
      const fallback = mic ? 'Microphone access was denied' : 'Camera access was denied';
      const message = this.#captureError(error, fallback, mic ? 'microphone' : 'camera');
      if (message) this.#failAttach('recording.webm', message, mic ? 'audio/webm' : 'video/webm');
    }
  }

  async attachPath(path: string): Promise<void> {
    const port = this.model?.files;
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!port) {
      this.#failAttach(name, 'Could not read the file');
      return;
    }
    if (port.readBytes) {
      try {
        const bytes = await port.readBytes(path);
        let type = (bytes instanceof Blob && bytes.type) || mimeOf(name);
        if (type === 'application/octet-stream')
          type = (await looksLikeText(bytes)) ? 'text/plain' : 'application/octet-stream';
        const blob = new Blob([bytes instanceof Blob ? bytes : (bytes as BlobPart)], { type });
        const added = await this.addFiles([new File([blob], name, { type })]);
        const ids = new Set(added.map((attachment) => attachment.id));
        this.attachments = this.attachments.map((attachment) =>
          ids.has(attachment.id) ? { ...attachment, path } : attachment
        );
      } catch {
        this.#failAttach(name, 'Could not read the file');
      }
      return;
    }
    const text = await port.read(path).catch(() => null);
    const base = { id: this.#id(), name, path, mimeType: 'text/plain' };
    this.attachments = [
      ...this.attachments,
      text === null || text === undefined
        ? { ...base, kind: 'file', size: 0, error: 'Could not read the file' }
        : { ...base, kind: 'text', size: text.length, text },
    ];
  }

  async shareSecret(name: string, field: HTMLInputElement | null = null): Promise<void> {
    const clean = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    if (this.sharing) return;
    if (!clean) {
      if (field) this.#refuse('Enter a name', 'name', true);
      return;
    }
    const value = field ? take(field) : '';
    const vault = this.model?.vault;
    if (field && vault?.put && !(await this.#store(vault, clean, value))) return;
    this.#refuse(null);
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

  #clean(name: string): string {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
  }

  #exists(vault: VaultPort | undefined, name: string): boolean {
    return !!vault
      ?.list()
      ?.secrets.some(
        (secret) => secret.name === name && secret.kind === 'secret' && secret.state !== 'removed'
      );
  }

  #attach(name: string): void {
    this.#refuse(null);
    this.attachments = [
      ...this.attachments,
      { id: this.#id(), name, kind: 'secret', mimeType: 'application/octet-stream', size: 0 },
    ];
    this.popup = null;
  }

  #leave(): void {
    const entry = this.entry;
    if (!entry) return;
    this.entry = null;
    drop(entry.vault, entry.request);
  }

  async enterSecret(name: string, replace = false): Promise<void> {
    const vault = this.model?.vault as VaultPort;
    const clean = this.#clean(name);
    if (this.sharing) return;
    const bad = clean ? nameProblem(clean) : 'Enter a name';
    if (bad) {
      this.#refuse(bad, 'name', true);
      return;
    }
    if (!replace && this.#exists(vault, clean)) {
      this.#attach(clean);
      return;
    }
    const agent = this.#agent;
    const mine = () => this.#agent === agent && this.model?.vault === vault;
    this.sharing = true;
    try {
      if (replace) {
        const sure = await confirm({
          title: `Replace ${clean}?`,
          body: 'A secret with this name exists. Sharing replaces its value, and its placeholder stays.',
          action: 'Replace',
          variant: 'confirmation',
        });
        if (!sure || !mine()) return;
      }
      const { request } = await (vault.enter as NonNullable<VaultPort['enter']>)({
        name: clean,
        ...(replace ? { replace: true } : {}),
      });
      if (!mine() || this.popup?.kind !== 'secret') {
        drop(vault, request);
        return;
      }
      this.#refuse(null);
      this.entry = { request, name: clean, vault };
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLElement>('slicc-vault-value')?.focus()
      );
    } catch (error) {
      if (mine()) this.#refuse(failureText(error), fieldOf(error, 'name'), true);
    } finally {
      this.sharing = false;
    }
  }

  #entered(detail: ValueDetail, request: string): void {
    const entry = this.entry;
    if (!entry || !ours(detail, request, entry.request)) return;
    if (detail.event === 'error') {
      this.#refuse(detail.message);
      return;
    }
    if (detail.event === 'escape') {
      this.closeSecret();
      return;
    }
    this.entry = null;
    if (detail.event === 'done') this.#attach(entry.name);
    else this.#refuse(goneText(detail.state));
  }

  #refuse(text: string | null, field: string | null = null, focus = false): void {
    this.secretError = text;
    this.secretField = text ? field : null;
    if (focus && text && field)
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLInputElement>(`form.secret input[name=${field}]`)?.focus()
      );
  }

  async #store(vault: VaultPort, clean: string, value: string): Promise<boolean> {
    if (blocked(vault)) {
      this.#refuse(blocked(vault));
      return false;
    }
    const exists = !!vault
      .list()
      ?.secrets.some((secret) => secret.name === clean && secret.state !== 'removed');
    if (exists && value === '') return true;
    const bad = nameProblem(clean);
    const problem = bad ?? valueProblem(value);
    this.#refuse(problem, bad ? 'name' : 'value', true);
    if (problem) return false;
    const agent = this.#agent;
    const mine = () => this.#agent === agent && this.model?.vault === vault;
    this.sharing = true;
    try {
      if (exists) {
        const sure = await confirm({
          title: `Replace ${clean}?`,
          body: 'A secret with this name exists. Sharing replaces its value, and its placeholder stays.',
          action: 'Replace',
          variant: 'confirmation',
        });
        if (!sure || !mine()) return false;
        if (blocked(vault)) {
          this.#refuse(blocked(vault));
          return false;
        }
      }
      await vault.put?.(clean, value);
      return mine();
    } catch (error) {
      if (mine()) this.#refuse(failureText(error), fieldOf(error, 'value'));
      return false;
    } finally {
      this.sharing = false;
    }
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
    if (!area || this.model?.seat) return;
    if (this.#starting()) {
      this.popup = null;
      return;
    }
    if (this.popup?.kind === 'file' || this.popup?.kind === 'secret') return;
    const found = trigger(this.value, area.selectionStart ?? this.value.length);
    const name = this.value.match(/^\/(\w+)/)?.[1];
    const takes = commands.some((command) => command.name === name && command.args);
    this.popup =
      found && (found.kind !== 'argument' || takes)
        ? { ...found, items: this.#choices(found.kind, found.query), index: 0 }
        : null;
  }

  closeSecret(): void {
    clearValues(this.renderRoot);
    this.#leave();
    this.popup = null;
  }

  openPopup(kind: 'file' | 'secret'): void {
    clearValues(this.renderRoot);
    this.secretError = null;
    this.secretField = null;
    this.popup = {
      kind,
      start: 0,
      query: '',
      items: kind === 'file' ? this.#choices('file', '') : [],
      index: 0,
    };
    if (kind === 'file') void this.#loadPaths();
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
    const seat = this.model?.seat;
    const own = (this.model?.agent.messages(this.#agent) ?? []).filter(
      (message): message is UserMessage =>
        message.role === 'user' && (seat ? mine(message, seat) : !message.from)
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

  #talking(): boolean {
    return !this.model?.seat && !!this.model?.settings.get().pushToTalk && !!speech();
  }

  #shortcut(event: KeyboardEvent): boolean {
    if (event.key === 'Backspace' || event.key === 'Delete') this.#flash();
    const chord = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!chord || event.code !== 'KeyM' || !this.#talking()) return false;
    event.preventDefault();
    if (!event.repeat) this.dictate();
    return true;
  }

  #keydown(event: KeyboardEvent): void {
    const area = this.#textarea;
    if (event.isComposing || !area || event.composedPath()[0] !== area) return;
    if (this.#shortcut(event)) return;
    if (this.model?.seat) {
      this.#guestKey(event, area);
      return;
    }
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

  #guestKey(event: KeyboardEvent, area: HTMLTextAreaElement): void {
    const send = event.key === 'Enter' && !event.shiftKey;
    if (send) this.send();
    if (send || this.#historyKey(event, area)) event.preventDefault();
    if (event.key === 'Enter') event.stopPropagation();
  }

  #flash(): void {
    if (!this.value) return;
    this.erasing = true;
    clearTimeout(this.#erase);
    this.#erase = setTimeout(() => (this.erasing = false), 700);
  }

  #loader(busy: boolean): string {
    if (busy) return 'aiLogo';
    if (this.dictating) return 'microphone';
    if (this.erasing) return 'brush';
    return this.value ? 'pencil' : 'aiLogo';
  }

  #instructions(busy: boolean): string {
    if (this.model?.seat) return 'Enter sends, Shift+Enter adds a new line.';
    const enter = this.model?.settings.get().sendOnEnter ?? true;
    const keys = enter
      ? [`Enter ${busy ? 'steers' : 'sends'}`, ...(busy ? ['Ctrl+Enter queues'] : [])]
      : [`Ctrl+Enter ${busy ? 'queues' : 'sends'}`];
    if (busy) keys.push('Escape stops');
    keys.push(
      `${enter ? 'Shift+Enter' : 'Enter'} adds a new line`,
      '/ lists commands',
      '@ mentions',
      ...(this.#talking() ? ['hold Alt+M to dictate'] : [])
    );
    return `${keys.join(', ')}.`;
  }

  #input(event: CustomEvent<{ value: string }>): void {
    this.value = event.detail.value;
    this.#history = -1;
    this.#refresh();
  }

  async #paste(event: ClipboardEvent): Promise<void> {
    const data = event.clipboardData;
    const listed = [...(data?.files ?? [])];
    const files = listed.length
      ? listed
      : [...(data?.items ?? [])].flatMap((item) => {
          const file = item.kind === 'file' ? item.getAsFile() : null;
          return file ? [file] : [];
        });
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
    else if (value === 'record-audio') void this.record('audio');
    else if (value === 'record-video') void this.record('video');
    else {
      this.openPopup(value as 'file' | 'secret');
      void this.updateComplete.then(() =>
        value === 'file'
          ? this.#textarea?.focus()
          : this.renderRoot.querySelector<HTMLInputElement>('.secret input')?.focus()
      );
    }
  }

  #menuKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement & { open: boolean }).open = false;
  }

  #toggleTalk = (event: Event): void => {
    event.stopPropagation();
    const settings = this.model?.settings;
    settings?.update({ pushToTalk: !settings.get().pushToTalk });
  };

  dictate(): void {
    if (this.#recognition) {
      this.#recognition.stop();
      return;
    }
    const Speech = speech<SpeechLike>();
    if (!Speech) return;
    const recognition = new Speech();
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const text = [...event.results]
        .slice(event.resultIndex ?? 0)
        .map((result) => result[0].transcript)
        .join(' ');
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

  #thumbnail(attachment: Attachment, problem: string | undefined): TemplateResult {
    if (attachment.kind === 'image' && attachment.url && !problem)
      return html`<img slot="thumbnail" src=${attachment.url} alt="" />`;
    const icon = problem
      ? html`<swc-icon-alert-triangle></swc-icon-alert-triangle>`
      : attachment.kind === 'secret'
        ? html`<swc-icon-lock></swc-icon-lock>`
        : attachment.kind === 'text'
          ? html`<swc-icon-file-text></swc-icon-file-text>`
          : html`<swc-icon-file></swc-icon-file>`;
    return html`<span slot="thumbnail" class="thumb" ?data-error=${!!problem} aria-hidden="true">${icon}</span>`;
  }

  #attachment(attachment: Attachment): TemplateResult {
    const problem = this.#problem(attachment);
    const detail = problem
      ? this.#errorDetail(problem)
      : attachment.kind === 'secret'
        ? 'Secret'
        : size(attachment.size);
    return html`<swc-upload-attachment
      slot="attachment"
      type="card"
      dismissible
      data-id=${attachment.id}
      data-kind=${attachment.kind}
      ?data-error=${!!problem}
      title=${problem ?? attachment.path ?? attachment.name}
      @swc-upload-attachment-dismiss=${() => this.detach(attachment.id)}
    >
      ${this.#thumbnail(attachment, problem)}
      <span slot="title">${attachment.name}</span>
      <span slot="subtitle" class=${problem ? 'failed' : ''} title=${problem ?? nothing}>${detail}</span>
    </swc-upload-attachment>`;
  }

  #popup(): TemplateResult | typeof nothing {
    const popup = this.popup;
    if (!popup) return nothing;
    if (popup.kind === 'secret' && this.#framed())
      return this.#entering(this.model?.vault as VaultPort);
    if (popup.kind === 'secret') {
      const vault = this.model?.vault;
      const valued = !!vault?.put && !vault.enter && !blocked(vault);
      const waiting = vault?.put ? blocked(vault) : null;
      if (!valued) clearValues(this.renderRoot);
      const submit = (event: Event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        void this.shareSecret(
          (form.elements.namedItem('name') as HTMLInputElement).value,
          form.elements.namedItem('value') as HTMLInputElement | null
        );
      };
      const close = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.closeSecret();
      };
      const bad = (name: string) => (this.secretField === name ? 'true' : nothing);
      const described = (name: string) => (this.secretField === name ? 'secret-error' : nothing);
      return html`<form class="popup secret" data-vault=${valued ? 'on' : 'off'} @submit=${submit} @keydown=${close} @input=${() => (this.secretField = null)}>
        <strong>Share a secret</strong>
        <span class="lead">${valued ? 'The value goes to the vault; the agent only sees its name. Leave the value empty to share a secret the vault already has.' : waiting === 'Unlock the vault first' ? 'The vault is locked. You can share the name now and add the value once it is unlocked.' : waiting ? 'Waiting for the vault. You can share the name now and add the value in Settings › Secrets later.' : 'Add the value in Settings › Secrets. The agent only sees the name.'}</span>
        <label class="field"><span>Name</span><input name="name" placeholder="API_TOKEN" autocomplete="off" spellcheck="false" aria-invalid=${bad('name')} aria-describedby=${described('name')} /></label>
        ${valued ? html`<label class="field"><span>Value</span><input name="value" type="password" autocomplete="off" spellcheck="false" aria-invalid=${bad('value')} aria-describedby=${described('value')} /></label>` : nothing}
        ${this.secretError ? html`<span class="secret-error" role="alert" id="secret-error" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.secretError}</span></span>` : nothing}
        <span class="buttons">
          <swc-button size="s" variant="accent" data-action="share-secret" ?pending=${this.sharing} @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Share</swc-button>
          <swc-button size="s" variant="secondary" fill-style="outline" data-action="cancel-secret" ?disabled=${this.sharing} @click=${() => this.closeSecret()}>Cancel</swc-button>
        </span>
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

  #framed(): boolean {
    const vault = this.model?.vault;
    return enters(vault) && (!!this.entry || !away(vault as VaultPort));
  }

  #entering(vault: VaultPort): TemplateResult {
    const entry = this.entry;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.closeSecret();
    };
    const cancel = html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="cancel-secret" ?disabled=${this.sharing} @click=${() => this.closeSecret()}>Cancel</swc-button>`;
    const error = this.secretError
      ? html`<span class="secret-error" role="alert" id="secret-error" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.secretError}</span></span>`
      : nothing;
    if (entry)
      return html`<form class="popup secret" data-vault="on" data-entry @submit=${(event: Event) => event.preventDefault()} @keydown=${close}>
        <strong>Share a secret</strong>
        <span class="lead">Type the value of <code>${entry.name}</code> in the vault’s own field. The agent only sees its name.</span>
        ${valueField(vault, entry.request, valueConfig(this.ownerDocument, this.color), (detail, request) => this.#entered(detail, request))}
        ${error}
        <span class="buttons">
          <swc-button size="s" variant="secondary" fill-style="outline" data-action="back-secret" @click=${() => this.#leave()}>Back</swc-button>
          ${cancel}
        </span>
      </form>`;
    const name = this.#clean(this.secretName);
    const exists = !!name && this.#exists(vault, name);
    const bad = this.secretField === 'name' ? 'true' : nothing;
    const submit = (event: Event) => {
      event.preventDefault();
      void this.enterSecret(this.secretName);
    };
    return html`<form class="popup secret" data-vault="on" @submit=${submit} @keydown=${close} @input=${(
      event: Event
    ) => {
      this.secretField = null;
      this.secretName = (event.target as HTMLInputElement).value;
    }}>
        <strong>Share a secret</strong>
        <span class="lead">${exists ? html`<code>${name}</code> is in the vault. Share it as it is, or replace its value first.` : 'You type the value in the vault’s own field next; the agent only sees its name.'}</span>
        <label class="field"><span>Name</span><input name="name" placeholder="API_TOKEN" autocomplete="off" spellcheck="false" .value=${this.secretName} aria-invalid=${bad} aria-describedby=${this.secretField === 'name' ? 'secret-error' : nothing} /></label>
        ${error}
        <span class="buttons">
          <swc-button size="s" variant="accent" data-action="share-secret" ?pending=${this.sharing} @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Share</swc-button>
          ${exists ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="replace-secret" ?disabled=${this.sharing} @click=${() => void this.enterSecret(this.secretName, true)}>Replace value</swc-button>` : nothing}
          ${cancel}
        </span>
      </form>`;
  }

  #hold(): TemplateResult | typeof nothing {
    const hold = this.model?.agent.hold?.();
    if (!hold) return nothing;
    const locked = hold.reason === 'locked';
    const vault = this.model?.vault;
    const held = hold.held === 1 ? '1 tool result held' : `${hold.held} tool results held`;
    return html`<div class="hold" role="status" data-hold=${hold.reason}>
      ${locked ? html`<swc-icon-lock size="s" aria-hidden="true"></swc-icon-lock>` : html`<swc-progress-circle size="s" label="Waiting" aria-hidden="true"></swc-progress-circle>`}
      <span class="text">${locked ? 'Unlock the vault to continue' : 'Waiting for the vault'}${hold.held ? html`<span class="held"> · ${held}</span>` : nothing}</span>
      ${
        locked && vault
          ? html`<slicc-vault-button
              data-action="unlock-vault"
              .vault=${vault}
              .config=${{ intent: { kind: 'unlock' }, label: 'Unlock', size: 's', variant: 'accent', theme: this.color }}
              @vault-popup=${(event: CustomEvent<PopupDetail>) => {
                this.blocked = event.detail.state === 'blocked';
              }}
            ></slicc-vault-button>`
          : nothing
      }
      ${
        locked && this.blocked
          ? html`<span class="blocked" role="alert" data-popup="blocked"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>The browser blocked the vault window. Allow pop-ups for this site, then try again.</span>`
          : nothing
      }
    </div>`;
  }

  #queue(): TemplateResult | typeof nothing {
    const queued = this.model?.agent.queue(this.#agent) ?? [];
    if (queued.length === 0) return nothing;
    const model = this.model as SliccModel;
    return html`<ul class="queue" aria-label="Queued messages">
      ${queued.map(
        (
          message
        ) => html`<li class="queued" data-id=${message.id} data-mode=${message.mode ?? 'queue'}>
          <swc-icon-clock size="s" aria-hidden="true"></swc-icon-clock>
          <span class="text"><span class="sr">${message.mode === 'steer' ? 'Steering: ' : 'Queued: '}</span>${message.text}</span>
          ${
            message.mode === 'steer'
              ? html`<span class="next">Sends at the next step</span>`
              : html`<swc-action-button size="s" quiet data-action="send-now" @click=${() => {
                  model.agent.unqueue(this.#agent, message.id);
                  void model.agent.send(this.#agent, {
                    text: message.text,
                    attachments: message.attachments,
                    mode: 'steer',
                  });
                }}>Send now</swc-action-button>`
          }
          <swc-close-button size="s" data-action="unqueue" accessible-label="Remove from queue" @click=${() => model.agent.unqueue(this.#agent, message.id)}></swc-close-button>
        </li>`
      )}
    </ul>`;
  }

  #starters(): TemplateResult | typeof nothing {
    const waiting = this.#waiting.value.filter(
      (row) => !row.agent || row.agent === this.#agent || stray(this.model, row)
    );
    if (waiting.length === 0) return nothing;
    return html`<ul class="queue" aria-label="Waiting for the agent">
      ${waiting.map((message) => this.#starter(message))}
    </ul>`;
  }

  #starter(message: Waiting): TemplateResult {
    const lost = message.lost ?? [];
    const empty = !(message.text || message.attachments.length);
    const gone = stray(this.model, message);
    const held = !empty && (lost.length > 0 || gone);
    const alert = empty || held;
    const files = message.attachments.length;
    return html`<li class="queued" data-id=${message.id} data-mode="starting" ?data-unsent=${empty} ?data-held=${held}>
      ${alert ? html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>` : html`<swc-icon-clock size="s" aria-hidden="true"></swc-icon-clock>`}
      ${message.text ? nothing : html`<swc-icon-file size="xs" aria-hidden="true"></swc-icon-file>`}
      <span class="body">
        <span class="text"><span class="sr">${held ? 'Held: ' : 'Queued: '}</span>${message.text || names(message.attachments) || names(lost)}</span>
        ${gone && !lost.length ? html`<span class="lost" data-gone><span class="sr">, </span>Not sent: its conversation isn’t here anymore.</span>` : nothing}
        ${lost.length ? html`<span class="lost" data-lost title=${names(lost)}><span class="sr">, </span>${held ? notKept(lost) : 'Not kept after reload'}${lost.length > 1 ? html`<span class="sr"> (${names(lost)})</span>` : nothing}</span>` : nothing}
      </span>
      ${message.text && files ? html`<span class="next" data-files><swc-icon-file size="xs" aria-hidden="true"></swc-icon-file><span class="sr">, </span>${files === 1 ? '1 file' : `${files} files`}</span>` : nothing}
      ${
        held
          ? html`<swc-action-button size="s" quiet data-action="restore-starting" accessible-label=${`Put back: ${message.text}`} @click=${() => this.#putBack(message)}>Put back</swc-action-button>`
          : html`<span class="next">${empty ? 'Not sent. Attach the files again.' : 'Sent when the agent starts'}</span>`
      }
      <swc-close-button size="s" data-action="unqueue" accessible-label=${alert ? 'Dismiss' : 'Remove from queue'} @click=${() => this.#unwait(message.id)}></swc-close-button>
    </li>`;
  }

  #review(): TemplateResult | typeof nothing {
    const queued = this.model?.agent.queue(this.#agent) ?? [];
    if (queued.length === 0) return nothing;
    return html`<ul class="queue" aria-label="Waiting for review">
      ${queued.map(
        (message) => html`<li class="queued" data-id=${message.id} data-mode="review">
          <swc-icon-clock size="s" aria-hidden="true"></swc-icon-clock>
          <span class="text">${message.text}</span>
          <span class="next">Waiting for review</span>
        </li>`
      )}
    </ul>`;
  }

  #guest(seat: Seat): TemplateResult {
    const agent = this.model?.agent.list().find((candidate) => candidate.id === this.#agent);
    const cone = agent?.name ?? 'the agent';
    return html`<div class="column">
        <span id="keys" class="sr" aria-hidden="true">${this.#instructions(false)}</span>
        ${this.#review()}
        ${
          this.failure
            ? html`<p class="send-error" role="alert" data-send-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${this.failure}</span></p>`
            : nothing
        }
        <swc-prompt-field
          accessible-label="Message"
          collapsed
          loader=${this.#loader(false)}
          send-accessible-label="Send"
          attachment-scroll-prev-accessible-label="Show previous attachments"
          attachment-scroll-next-accessible-label="Show more attachments"
          attachment-strip-accessible-label="Uploaded assets strip"
          max-rows="10"
          placeholder=${`Message ${cone}`}
          .value=${live(this.value)}
          @keydown=${this.#keys}
          @swc-prompt-field-input=${this.#input}
          @swc-prompt-field-submit=${() => this.send()}
        ></swc-prompt-field>
        <p class="seat-note" data-seat-note>${seatNote(seat, cone)}</p>
      </div>`;
  }

  render(): TemplateResult {
    const seat = this.model?.seat;
    if (seat) return this.#guest(seat);
    const busy = this.#busy();
    const agent = this.model?.agent.list().find((candidate) => candidate.id === this.#agent);
    const suggestion = this.model?.agent.suggestion(this.#agent);
    const canSend = !!this.value.trim() || this.attachments.some((attachment) => !attachment.error);
    const pushToTalk = this.model?.settings.get().pushToTalk ?? false;
    const talk = !!speech();
    const held = this.#held();
    const starting = this.#starting();
    const back = new Set(
      this.attachments
        .filter((attachment) => !attachment.error)
        .map((attachment) => attachment.name)
    );
    const missing = (this.reattach ?? []).filter((file) => !back.has(file.name));
    const crowded = this.#together();
    return html`<div class="column" @drop=${this.#mark}>
        <span id="keys" class="sr" aria-hidden="true">${this.#instructions(busy)}</span>
        ${this.#hold()}
        ${this.#starters()}
        ${this.#queue()}
        ${this.#popup()}
        ${
          crowded
            ? html`<p class="send-error" role="alert" data-send-error="together"><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${crowded}</span></p>`
            : nothing
        }
        <swc-prompt-field
          accessible-label="Message"
          loader=${this.#loader(busy)}
          upload-accessible-label="Add"
          stop-accessible-label="Stop"
          send-accessible-label=${busy ? 'Steer' : 'Send'}
          attachment-scroll-prev-accessible-label="Show previous attachments"
          attachment-scroll-next-accessible-label="Show more attachments"
          attachment-strip-accessible-label="Uploaded assets strip"
          max-rows="10"
          ?generating=${busy && !canSend}
          ?disabled=${!!held}
          placeholder=${held ? `Reconnecting to ${held}…` : starting ? starting : suggestion ? `${suggestion}  (Tab)` : `Message ${agent?.name ?? ''}`}
          .value=${live(this.value)}
          @keydown=${this.#keys}
          @swc-prompt-field-input=${this.#input}
          @swc-prompt-field-submit=${() => this.send()}
          @swc-prompt-field-stop=${() => this.model?.agent.stop(this.#agent)}
          @swc-prompt-field-drop=${(event: CustomEvent<{ files: File[] }>) => void this.addFiles(event.detail.files, this.#folders)}
          @paste=${this.#paste}
          @click=${() => this.#refresh()}
          @focusout=${() => {
            if (this.popup && this.popup.kind !== 'file' && this.popup.kind !== 'secret')
              this.popup = null;
          }}
        >
          ${this.attachments.map((attachment) => this.#attachment(attachment))}
        </swc-prompt-field>
        ${missing.length ? html`<p class="reattach" data-reattach><swc-action-button size="s" quiet data-action="reattach" @click=${() => this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click()}><swc-icon-attach slot="icon"></swc-icon-attach>${reattach(missing)}</swc-action-button></p>` : nothing}
        <swc-popover placement="top-start" accessible-label="Add to the message" @keydown=${this.#menuKey} @swc-after-open=${() => this.renderRoot.querySelector<HTMLElement>('sp-menu')?.focus()}>
          <sp-menu label="Add to the message" @change=${this.#add}>
            <sp-menu-item value="upload">Upload from this computer</sp-menu-item>
            <sp-menu-item value="screenshot" ?disabled=${!!this.recording}>Take a screenshot</sp-menu-item>
            ${
              this.model?.capture
                ? html`<sp-menu-item value="record-audio" data-action="record-audio" ?disabled=${!!this.recording}>Record audio</sp-menu-item>`
                : nothing
            }
            ${
              this.model?.capture?.kinds?.includes('video')
                ? html`<sp-menu-item value="record-video" data-action="record-video" ?disabled=${!!this.recording}>Record video</sp-menu-item>`
                : nothing
            }
            <sp-menu-item value="file">Attach a file from SLICC</sp-menu-item>
            <sp-menu-item value="secret">Share a secret</sp-menu-item>
            ${
              talk
                ? html`<sp-menu-divider></sp-menu-divider>
            <sp-menu-group selects="multiple" data-group="talk" @change=${this.#toggleTalk}>
              <sp-menu-item value="push-to-talk" data-action="push-to-talk" ?selected=${pushToTalk}>Enable push to talk<span slot="description">Hold Alt+M to dictate</span></sp-menu-item>
            </sp-menu-group>`
                : nothing
            }
          </sp-menu>
        </swc-popover>
        <input type="file" multiple @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          void this.addFiles([...(input.files ?? [])]);
          input.value = '';
        }} />
      </div>`;
  }
}

interface SpeechLike {
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: ArrayLike<ArrayLike<{ transcript: string }>> &
          Iterable<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
