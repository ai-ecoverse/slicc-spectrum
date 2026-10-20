import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/dropzone/swc-dropzone.js';
import '@adobe/spectrum-wc/components/illustrated-message/swc-illustrated-message.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/conversation-thread/swc-conversation-thread.js';
import '@adobe/spectrum-wc-icons/swc-icon-attach.js';
import '@adobe/spectrum-wc-icons/swc-icon-chevron-down.js';
import '@adobe/spectrum-wc-icons/swc-icon-new.js';
import link from '@adobe/spectrum-wc/link.css';
import { css, html, nothing, type TemplateResult, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  Agent,
  ErrorAction,
  LickMessage,
  Message,
  Seat,
  SliccModel,
  Thinking,
  UserMessage,
} from '../model/types.ts';
import { readSurface } from './ansi.ts';
import { chatModels, meterVariant, shared, statusLight, ThemedElement } from './base.ts';
import { Cuts, clampCss } from './command.ts';
import { fade, folders, limit, type SliccComposer } from './composer.ts';
import { dipType } from './dips.ts';
import { following, onWatch, watchOnly } from './follow.ts';
import { markdownCss } from './markdown.ts';
import {
  alone,
  askTimer,
  assistant,
  day,
  type Handlers,
  type Joined,
  type Login,
  lick,
  messageCss,
  mine,
  type Owner,
  questionTurn,
  stamps,
  system,
  toolMessage,
  toolOnly,
  toolTail,
  user,
  waiting,
} from './messages.ts';
import { settleModels } from './models.ts';
import { SignInCopies, SignInWaits, signInCss, signInWait } from './sign-in.ts';
import { connecting } from './tabs.ts';
import { ViewSet } from './view-state.ts';

function joins(
  messages: readonly Message[],
  showThinking: boolean,
  stamped: ReadonlySet<string>,
  busy: boolean
): { joined: Map<string, Joined>; owners: Map<string, Owner>; into: Map<string, string> } {
  const joined = new Map<string, Joined>();
  const owners = new Map<string, Owner>();
  const into = new Map<string, string>();
  let anchor: Message | null = null;
  for (const message of messages) {
    const calls = toolOnly(message, showThinking);
    if (anchor && calls && day(message.createdAt) === day(anchor.createdAt)) {
      const before = joined.get(anchor.id);
      joined.set(anchor.id, {
        calls: [...(before?.calls ?? []), ...calls],
        live: !!before?.live || (message.role === 'assistant' && message.status === 'streaming'),
        stopped:
          !!before?.stopped || (message.role === 'assistant' && message.status === 'stopped'),
      });
      for (const call of calls)
        owners.set(call.id, {
          id: message.id,
          at: message.createdAt,
          stamp: stamped.has(message.id),
        });
      into.set(message.id, anchor.id);
      continue;
    }
    anchor = toolTail(message, showThinking) ? message : null;
  }
  if (anchor && busy)
    joined.set(anchor.id, {
      ...joined.get(anchor.id),
      calls: joined.get(anchor.id)?.calls ?? [],
      live: true,
    });
  return { joined, owners, into };
}

const navigation = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

const upward = new Set(['ArrowUp', 'PageUp', 'Home']);

const compactWidth = 560;

interface Ask {
  key: string;
  id: string;
  at?: number;
  card: TemplateResult;
}

type Entry = [string, TemplateResult];

function pendingAsks(messages: readonly Message[]): Array<[string, { id: string; at?: number }]> {
  return messages.flatMap((message): Array<[string, { id: string; at?: number }]> => {
    if (waiting(message))
      return [[message.id, { id: message.id, at: (message as LickMessage).expiresAt }]];
    if (message.role !== 'assistant') return [];
    return message.parts.flatMap(
      (part): Array<[string, { id: string }]> =>
        part.type === 'question' && part.question.state === 'open'
          ? [[`${message.id}:${part.question.id}`, { id: part.question.id }]]
          : []
    );
  });
}

function into(card: Element, dock: HTMLElement): void {
  const box = card.getBoundingClientRect();
  const view = dock.getBoundingClientRect();
  const start = view.top + (Number.parseFloat(getComputedStyle(dock).scrollPaddingBlockStart) || 0);
  if (box.top < start) dock.scrollTop -= start - box.top;
  else if (box.bottom > view.bottom)
    dock.scrollTop += Math.min(box.bottom - view.bottom, box.top - start);
}

const place = (id: string): TemplateResult =>
  html`<div class="ask-place" data-place=${id} aria-hidden="true"></div>`;

function dock(
  entries: Entry[],
  messages: readonly Message[],
  seat: Seat | undefined
): { items: Entry[]; asks: Ask[] } {
  const docked = new Map(seat ? [] : pendingAsks(messages));
  const asks: Ask[] = [];
  const items = entries.map(([key, card]): Entry => {
    const ask = docked.get(key);
    if (!ask) return [key, card];
    asks.push({ key, id: ask.id, at: ask.at, card });
    return [key, place(ask.id)];
  });
  return { items, asks };
}

const failed = (message: Message): boolean =>
  message.role === 'assistant'
    ? message.status === 'error'
    : message.role === 'system' && message.kind === 'error';

function empty(watch: string, seat: Seat | undefined, name: string): string {
  if (watch) return 'No messages yet.';
  return seat
    ? `No messages yet. Say hello to ${name}.`
    : `No messages yet. Ask ${name} something.`;
}

export function carriesFiles(event: DragEvent): boolean {
  const types = [...(event.dataTransfer?.types ?? [])];
  return types.includes('Files') && !types.includes(dipType);
}

export function failedTurns(messages: readonly Message[], messageId: string): string[] {
  const at = messages.findIndex((message) => message.id === messageId);
  const turns = messages.flatMap((message, index) =>
    message.role === 'user' && index < at ? [index] : []
  );
  const ids = [messageId];
  for (let turn = turns.length - 1; turn > 0; turn--) {
    const error = messages.slice(turns[turn - 1], turns[turn]).find(failed);
    if (!error) break;
    ids.push(error.id);
  }
  return ids;
}

let touched = false;
document.addEventListener(
  'pointerdown',
  (event) => {
    touched = event.pointerType !== 'mouse';
  },
  true
);
document.addEventListener(
  'keydown',
  () => {
    touched = false;
  },
  true
);

export class SliccChat extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    agent: {},
    dropping: { state: true },
    compact: { state: true },
    behind: { state: true },
  };
  static leaveAfter = 100;
  declare agent: string;
  declare dropping: boolean;
  declare compact: boolean;
  declare behind: boolean;

  constructor() {
    super();
    this.agent = '';
    this.dropping = false;
    this.compact = false;
    this.behind = false;
    this.addEventListener('dragenter', this.#over);
    this.addEventListener('dragover', this.#over);
    this.addEventListener('dragleave', this.#leave);
    this.addEventListener('drop', this.#drop);
  }

  #composer(): SliccComposer | null {
    return this.renderRoot.querySelector<SliccComposer>('slicc-composer');
  }

  #accepts(event: DragEvent): boolean {
    return carriesFiles(event) && !this.model?.seat && !!this.#composer()?.attachable();
  }

  #over = (event: DragEvent): void => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    const transfer = event.dataTransfer as DataTransfer;
    if (!this.#accepts(event)) {
      transfer.dropEffect = 'none';
      if (this.dropping) this.#clear();
      return;
    }
    transfer.dropEffect = 'copy';
    clearTimeout(this.#leaving);
    if (this.dropping) return;
    this.dropping = true;
    globalThis.addEventListener('keydown', this.#escape, true);
  };

  #leaving: ReturnType<typeof setTimeout> | undefined;

  #leave = (event: DragEvent): void => {
    const to = event.relatedTarget;
    if (to instanceof Node && this.contains(to)) return;
    clearTimeout(this.#leaving);
    this.#leaving = setTimeout(() => this.#clear(), SliccChat.leaveAfter);
  };

  #escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#clear();
  };

  #clear(): void {
    clearTimeout(this.#leaving);
    this.dropping = false;
    globalThis.removeEventListener('keydown', this.#escape, true);
  }

  #drop = (event: DragEvent): void => {
    this.#clear();
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (!this.#accepts(event)) return;
    if (event.composedPath().some((node) => (node as Element).localName === 'swc-prompt-field'))
      return;
    const transfer = event.dataTransfer as DataTransfer;
    void (this.#composer() as SliccComposer).addFiles([...transfer.files], folders(transfer));
  };

  static styles = [
    shared,
    fade,
    markdownCss,
    messageCss,
    clampCss,
    unsafeCSS(link),
    signInCss,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--swc-background-layer-2-color);
        color: var(--swc-neutral-content-color-default);
        font-size: var(--swc-font-size-100);
        line-height: var(--swc-line-height-200);
      }
      header {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: var(--swc-spacing-50) var(--swc-spacing-100);
        padding: var(--swc-spacing-75) var(--swc-spacing-200);
        flex: none;
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        font-size: var(--swc-font-size-75);
        color: var(--swc-neutral-subdued-content-color-default);
        white-space: nowrap;
      }
      header sp-picker {
        --mod-picker-spacing-label-to-picker-quiet: calc(-1 * var(--swc-border-width-100));
        flex: none;
        min-width: 0;
        width: auto;
      }
      header sp-picker[label='Model'] {
        flex: 0 1 auto;
      }
      header swc-status-light,
      header swc-action-button {
        flex: none;
      }
      header swc-status-light {
        align-self: center;
      }
      header swc-meter {
        flex: 0 1 calc(var(--swc-spacing-400) * 6);
        min-width: calc(var(--swc-spacing-400) * 4.5);
        margin-inline-start: auto;
      }
      header .cone {
        color: var(--swc-neutral-content-color-default);
        font-weight: var(--swc-bold-font-weight);
      }
      header .frozen,
      header .model {
        color: var(--swc-neutral-content-color-default);
      }
      .watch-only {
        margin: 0;
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-block-start: var(--swc-border-width-100) solid var(--swc-gray-200);
        font-size: var(--swc-font-size-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .stage {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .log {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        container-type: inline-size;
        padding: var(--swc-spacing-400) var(--swc-spacing-300) calc(var(--composer-height, 0px) + var(--composer-fade) + 1lh);
        scroll-padding-block-end: calc(var(--composer-height, 0px) + var(--composer-fade) + var(--swc-spacing-200));
        font-size: var(--swc-font-size-200);
      }
      .ask-place {
        block-size: 0;
        margin-block-end: calc(-1 * var(--swc-spacing-400));
      }
      .asks {
        flex: 0 1 auto;
        min-block-size: 0;
        max-block-size: 50%;
        overflow-y: auto;
        container-type: inline-size;
        position: relative;
        z-index: 1;
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-block-end: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-2-color);
        box-shadow: 0 var(--swc-drop-shadow-elevated-y) var(--swc-drop-shadow-elevated-blur) var(--swc-drop-shadow-color-100);
        font-size: var(--swc-font-size-200);
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }
      .asks:hover,
      .asks:focus-within {
        scrollbar-color: var(--swc-gray-500) transparent;
      }
      .asks::after {
        content: '';
        position: sticky;
        bottom: calc(-1 * var(--swc-spacing-200));
        display: none;
        block-size: var(--swc-spacing-500);
        margin-block-start: calc(-1 * var(--swc-spacing-500));
        background: linear-gradient(to bottom, transparent, var(--swc-background-layer-2-color));
        pointer-events: none;
      }
      .asks[data-more]::after {
        display: block;
      }
      .asks {
        scroll-padding-block-end: var(--swc-spacing-500);
      }
      .asks:has(.waiting) {
        scroll-padding-block-start: calc(var(--swc-component-height-100) + var(--swc-spacing-100));
      }
      .asks + .stage {
        min-block-size: calc(var(--composer-height, 0px) + var(--composer-fade, 0px) + var(--swc-spacing-1000));
      }
      .asks[data-open] + .stage {
        min-block-size: calc(var(--composer-height, 0px) + var(--composer-fade, 0px));
      }
      .asks[data-open] .decision {
        gap: var(--swc-spacing-75);
        padding-block: var(--swc-spacing-100);
      }
      .asks[data-open] .decide {
        padding: 0;
      }
      .asks[data-open] .question.decision .options {
        margin-block-start: 0;
      }
      .asks[data-open] .decision-head {
        align-items: center;
      }
      .asks[data-open] .decision-head .who {
        margin-inline-end: auto;
      }
      .asks[data-open] .decision-head .detail {
        display: inline-flex;
      }
      .asks[data-open] .decision-turn:not([data-detail]) .decision-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .waiting {
        position: sticky;
        top: calc(-1 * var(--swc-spacing-200));
        z-index: 1;
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        margin-block: calc(-1 * var(--swc-spacing-200)) var(--swc-spacing-100);
        padding: var(--swc-spacing-200) var(--swc-spacing-700) 0;
        background: var(--swc-background-layer-2-color);
        font-size: var(--swc-font-size-100);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      @container (inline-size < 480px) {
        .waiting {
          padding-inline: var(--swc-spacing-300);
        }
      }
      .ask-list {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-200);
      }
      .waiting .timer {
        margin-inline: auto var(--swc-spacing-300);
      }
      .waiting swc-icon-chevron-down {
        transition: transform var(--swc-animation-duration-100) var(--swc-animation-ease-out);
      }
      .asks[data-open] .waiting swc-icon-chevron-down {
        transform: rotate(180deg);
      }
      @media (prefers-reduced-motion: reduce) {
        .waiting swc-icon-chevron-down {
          transition: none;
        }
      }
      @container (min-width: 600px) {
        .column {
          padding-inline: var(--swc-spacing-300);
        }
      }
      .log:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
      }
      .column {
        max-inline-size: calc(var(--swc-spacing-1000) * 10);
        margin: 0 auto;
      }
      swc-dropzone {
        position: absolute;
        inset: var(--swc-spacing-100);
        z-index: 3;
        display: grid;
        pointer-events: none;
      }
      swc-dropzone swc-illustrated-message {
        --swc-illustrated-message-illustration-size: var(--swc-spacing-700);
      }
      swc-dropzone swc-icon-attach {
        --swc-icon-inline-size: 100%;
        --swc-icon-block-size: 100%;
      }
      .jump {
        position: absolute;
        inset-inline: 0;
        bottom: calc(var(--composer-height, 0px) + var(--swc-spacing-200));
        z-index: 3;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }
      .jump swc-action-button {
        pointer-events: auto;
        border-radius: var(--swc-corner-radius-1000);
        background: var(--swc-background-elevated-color);
        box-shadow: var(--swc-drop-shadow-elevated);
      }
      .empty {
        color: var(--swc-neutral-subdued-content-color-default);
        text-align: center;
        padding: var(--swc-spacing-700) 0;
        font-size: var(--swc-font-size-100);
      }
    `,
  ];

  #licks = new ViewSet(this, 'chat:licks');
  #runs = new ViewSet(this, 'chat:runs');
  #details = new Set<string>();
  #commands = new ViewSet(this, 'chat:commands');
  #cuts = new Cuts(
    () => this.renderRoot,
    () => this.requestUpdate()
  );
  #handlers: Handlers = {
    licks: this.#licks,
    runs: this.#runs,
    detail: {
      has: (id) => this.#details.has(id),
      toggle: (id) => {
        if (!this.#details.delete(id)) this.#details.add(id);
        this.requestUpdate();
      },
    },
    commands: {
      cut: (id) => this.#cuts.get(id),
      has: (id) => this.#commands.has(id),
      toggle: (id) => {
        this.#commands.toggle(id);
        void this.updateComplete.then(() => this.#reach(id));
      },
    },
    color: 'light',
    model: null,
    readOnly: false,
    answer: (questionId, answer) => this.model?.agent.answer(this.#id(), questionId, answer),
    resolve: (messageId, state) => this.model?.agent.resolveLick(this.#id(), messageId, state),
    action: (action, messageId, account) => this.#action(action, messageId, account),
    login: (account, messageId) => this.#loginState(account, messageId),
    cancelLogin: (account, messageId) => this.#cancelLogin(account, messageId),
    copySignIn: (account, messageId, code) => {
      void this.#copies.copy(`${messageId}:${account}`, code);
    },
    dropping: (messageId) =>
      failedTurns((this.model as SliccModel).agent.messages(this.#id()), messageId).length,
    open: (path) =>
      this.dispatchEvent(
        new CustomEvent('open-file', { detail: { path }, bubbles: true, composed: true })
      ),
    show: (id) =>
      this.dispatchEvent(
        new CustomEvent('show-surface', { detail: { id }, bubbles: true, composed: true })
      ),
    suggest: (text) => void this.model?.agent.send(this.#id(), text),
  };

  #keys = {
    capture: true,
    handleEvent: (event: KeyboardEvent): void => {
      const target = event.composedPath()[0];
      if (
        navigation.has(event.key) &&
        target instanceof HTMLElement &&
        target.matches('input, textarea, select')
      )
        event.stopPropagation();
    },
  };

  protected subscribe(model: SliccModel): Array<() => void> {
    const settle = () => {
      settleModels(model);
      this.requestUpdate();
    };
    queueMicrotask(() => settleModels(model));
    this.#stuck = true;
    this.behind = false;
    const width = new ResizeObserver(([entry]) => {
      const size = (entry as ResizeObserverEntry).contentRect.width;
      this.compact = size > 0 && size < compactWidth;
    });
    width.observe(this);
    return [
      ...super.subscribe(model),
      () => width.disconnect(),
      model.settings.on('settings', settle),
      model.settings.on('accounts', settle),
      model.agent.on('active', () => {
        if (!this.agent) this.#refresh(true);
      }),
      model.agent.on('agents', settle),
      ...(model.tabs ? [model.tabs.on('tabs', () => this.requestUpdate())] : []),
      ...onWatch(model, settle),
      ...(model.agent.starting ? [model.agent.on('starting', () => this.requestUpdate())] : []),
      model.agent.on('messages', (agentId) => {
        if (agentId === this.#id()) this.#refresh(this.#sent(agentId));
      }),
      model.agent.on('message', ({ agentId }) => {
        if (agentId === this.#id()) this.#refresh(this.#sent(agentId));
      }),
    ];
  }

  #stuck = true;
  #last = 0;
  #height = 0;
  #input = Number.NEGATIVE_INFINITY;
  #up = Number.NEGATIVE_INFINITY;
  #tick: ReturnType<typeof setInterval> | undefined;
  #tail = '';
  #held = '';
  #mark = 0;

  #all = false;
  #seen = '';

  #focused = (event: FocusEvent): void => {
    const target = event.target as Element;
    this.#held = target.closest<HTMLElement>('.decision-turn[data-pending]')?.dataset.id ?? '';
    const card = target.closest('.ask');
    if (card) into(card, card.closest('.asks') as HTMLElement);
  };

  #more = (): void => {
    const dock = this.renderRoot.querySelector<HTMLElement>('.asks');
    if (!dock) return;
    const end = Number.parseFloat(getComputedStyle(dock).paddingBlockEnd) || 0;
    dock.toggleAttribute(
      'data-more',
      dock.scrollHeight - dock.scrollTop - dock.clientHeight > end + 1
    );
  };

  #reach(id: string): void {
    const dock = this.renderRoot.querySelector<HTMLElement>('.asks');
    const turn = [...(dock?.querySelectorAll<HTMLElement>('.decision-turn') ?? [])].find(
      (candidate) => candidate.dataset.id === id
    );
    if (!dock || !turn) return;
    const style = getComputedStyle(dock);
    const room =
      dock.clientHeight -
      (Number.parseFloat(style.scrollPaddingBlockStart) || 0) -
      (Number.parseFloat(style.scrollPaddingBlockEnd) || 0);
    const target = turn.offsetHeight <= room ? turn : turn.querySelector('.decide');
    target?.scrollIntoView({ block: 'nearest' });
  }

  #refocus(): void {
    if (!this.#held || (this.renderRoot as ShadowRoot).activeElement) return;
    this.#held = '';
    const next = [
      ...this.renderRoot.querySelectorAll<HTMLElement>('.asks .decision-turn[data-pending]'),
    ].at(-1);
    if (next) next.focus();
    else this.renderRoot.querySelector<SliccComposer>('slicc-composer')?.focus();
  }

  #sent(agentId: string): boolean {
    const last = this.model?.agent.messages(agentId).at(-1);
    if (last?.role !== 'user' || last.id === this.#tail) return false;
    const seat = this.model?.seat;
    return seat ? mine(last, seat) : (last.origin ?? 'user') === 'user';
  }

  #resize = new ResizeObserver(() => {
    this.#more();
    const log = this.#log();
    if (!this.#stuck && log.scrollHeight <= log.clientHeight) this.#follow();
    else this.#pin();
  });
  #fitted: Element | null | undefined;
  #fit = new ResizeObserver(([entry]) => {
    this.style.setProperty('--composer-height', `${(entry.target as HTMLElement).offsetHeight}px`);
    this.#pin();
  });

  #log(): HTMLElement {
    return this.renderRoot.querySelector<HTMLElement>('.log') as HTMLElement;
  }

  #slack(): number {
    return Number.parseFloat(getComputedStyle(this.#log()).lineHeight) || 0;
  }

  #gap(): number {
    const log = this.#log();
    return log.scrollHeight - log.scrollTop - log.clientHeight;
  }

  #bottom(): boolean {
    return this.#gap() <= this.#slack();
  }

  #pin(): void {
    if (!this.#stuck) return;
    const log = this.#log();
    log.scrollTop = log.scrollHeight;
    this.#last = log.scrollTop;
    this.#height = log.scrollHeight;
  }

  #follow(): void {
    this.#stuck = true;
    this.behind = false;
    this.#pin();
  }

  #jump = (): void => {
    this.#follow();
    this.#log().focus({ preventScroll: true });
  };

  #scroll = (): void => {
    const log = this.#log();
    const top = log.scrollTop;
    const before = this.#height - top - log.clientHeight;
    const down = top - this.#last;
    if (this.#bottom()) {
      if (!this.#stuck && down > 1 && (performance.now() - this.#up > 1000 || down > this.#slack()))
        this.#follow();
    } else if (
      top < this.#last &&
      (performance.now() - this.#input < 1000 || before > 2 * this.#slack())
    )
      this.#stuck = false;
    this.#last = log.scrollTop;
    this.#height = log.scrollHeight;
  };

  #intent = {
    passive: true,
    handleEvent: (event: Event): void => {
      this.#input = performance.now();
      const up =
        event instanceof WheelEvent
          ? event.deltaY < 0 && !event.ctrlKey
          : event instanceof KeyboardEvent &&
            (upward.has(event.key) || (event.key === ' ' && event.shiftKey));
      this.#up = up ? this.#input : Number.NEGATIVE_INFINITY;
      const log = this.#log();
      if (!up || log.scrollTop <= 0) return;
      this.#stuck = false;
      this.#last = log.scrollTop;
      this.#height = log.scrollHeight;
    },
  };

  #hold = (event: PointerEvent): void => {
    if (event.target === event.currentTarget) this.#input = Number.POSITIVE_INFINITY;
  };

  #release = (): void => {
    if (this.#input === Number.POSITIVE_INFINITY) this.#input = performance.now();
  };

  #refresh(jump: boolean): void {
    if (jump) {
      this.#stuck = true;
      this.behind = false;
    } else if (!this.#stuck) this.behind = true;
    this.requestUpdate();
    void this.updateComplete.then(() => this.#pin());
  }

  #observe(): void {
    const log = this.#log();
    this.#resize.observe(log);
    this.#resize.observe(log.firstElementChild as Element);
    this.#attach();
    this.#refresh(true);
  }

  #attach(): void {
    const composer = this.renderRoot.querySelector('slicc-composer');
    if (composer === this.#fitted) return;
    this.#fit.disconnect();
    this.#fitted = composer;
    this.style.setProperty('--composer-fade', composer ? '' : '0px');
    if (composer) this.#fit.observe(composer);
    else this.style.setProperty('--composer-height', '0px');
  }

  connectedCallback(): void {
    super.connectedCallback();
    globalThis.addEventListener('pointerup', this.#release, true);
    globalThis.addEventListener('pointercancel', this.#release, true);
    if (this.hasUpdated) this.#observe();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    globalThis.removeEventListener('pointerup', this.#release, true);
    globalThis.removeEventListener('pointercancel', this.#release, true);
    this.#resize.disconnect();
    this.#fit.disconnect();
    this.#cuts.disconnect();
    this.#fitted = undefined;
    clearInterval(this.#tick);
    this.#tick = undefined;
  }

  protected updated(): void {
    this.#attach();
    const timed = this.isConnected && this.#timed();
    if (timed && this.#tick === undefined)
      this.#tick = setInterval(() => this.requestUpdate(), 1000);
    if (!timed && this.#tick !== undefined) {
      clearInterval(this.#tick);
      this.#tick = undefined;
    }
    this.#refocus();
    const asks = [...this.renderRoot.querySelectorAll<HTMLElement>('.ask-list .decision-turn')];
    for (const turn of asks) turn.tabIndex = 0;
    this.#more();
    this.#cuts.measure();
  }

  #timed(): boolean {
    const model = this.model as SliccModel | undefined;
    if (!model) return false;
    return model.agent
      .messages(this.#id())
      .some(
        (message) => waiting(message) && 'expiresAt' in message && message.expiresAt !== undefined
      );
  }

  protected firstUpdated(): void {
    this.renderRoot.addEventListener('focusin', this.#focused as EventListener);
    this.#observe();
  }

  focus(): void {
    if (touched) return;
    if (globalThis.matchMedia('(pointer: fine)').matches) this.focusOn('slicc-composer', '.log');
    else this.focusOn('.log');
  }

  #id(): string {
    return this.agent || (this.model?.agent.active() ?? '');
  }

  get busyReason(): string | null {
    const open = (this.model?.agent.messages(this.#id()) ?? []).some((message) =>
      ('parts' in message ? message.parts : []).some(
        (part) => part.type === 'question' && part.question.state === 'open'
      )
    );
    return open ? 'a question waits for an answer' : null;
  }

  #agent(): Agent | undefined {
    const id = this.#id();
    return this.model?.agent.list().find((agent) => agent.id === id);
  }

  async #rewind(id: string, messageId: string): Promise<void> {
    const messages = this.model?.agent.messages(id) ?? [];
    const at = messages.findIndex((message) => message.id === messageId);
    const latest = messages.findLast(
      (message, index): message is UserMessage => index < at && message.role === 'user'
    );
    const first = failedTurns(messages, messageId).at(-1) as string;
    const restored = await this.model?.agent.rewind?.(id, first);
    if (!restored) return;
    this.renderRoot
      .querySelector<SliccComposer>('slicc-composer')
      ?.restore(latest ? { text: latest.text, attachments: latest.attachments } : restored);
  }

  static get closedAfter(): number {
    return signInWait.closedAfter;
  }

  static set closedAfter(after: number) {
    signInWait.closedAfter = after;
  }

  #logins = new Map<string, { pending: boolean; error?: string; cancelled?: boolean }>();
  #waits = new SignInWaits(() => this.requestUpdate());
  #copies = new SignInCopies(() => this.requestUpdate());

  #loginState(accountId: string, messageId: string): Login {
    const settings = (this.model as SliccModel).settings;
    const account = settings.accounts().find((candidate) => candidate.id === accountId);
    const local = this.#logins.get(`${messageId}:${accountId}`);
    const cancel = !!settings.cancel;
    const window = account?.auth === 'oauth';
    const key = `${messageId}:${accountId}`;
    if (account?.status === 'signing-in' || local?.pending)
      return {
        state: 'signing-in',
        cancel,
        window,
        waited: window && this.#waits.waited(key),
        signIn: account?.status === 'signing-in' ? account.signIn : undefined,
        copied: this.#copies.state(key),
      };
    this.#waits.done(key);
    if (account?.status === 'connected') return { state: 'connected', provider: account.provider };
    return { state: 'idle', error: local?.error };
  }

  #cancelLogin(accountId: string, messageId: string): void {
    const local = this.#logins.get(`${messageId}:${accountId}`);
    if (local) local.cancelled = true;
    this.model?.settings.cancel?.(accountId);
  }

  #settings(section?: string): void {
    this.dispatchEvent(
      new CustomEvent('show-surface', {
        detail: section ? { id: 'settings', section } : { id: 'settings' },
        bubbles: true,
        composed: true,
      })
    );
  }

  #login(model: SliccModel, messageId: string, accountId?: string): void {
    const account = model.settings.accounts().find((candidate) => candidate.id === accountId);
    if (!account || account.auth === 'api-key' || account.secret || account.fields?.length) {
      this.#settings(accountId ?? 'accounts');
      return;
    }
    const local: { pending: boolean; error?: string; cancelled?: boolean } = { pending: true };
    this.#logins.set(`${messageId}:${account.id}`, local);
    const done = (error?: string) => {
      local.pending = false;
      local.error = local.cancelled ? undefined : error;
      this.requestUpdate();
    };
    model.settings.connect(account.id).then(
      () => done(),
      (error: unknown) => done((error as Error).message)
    );
    this.requestUpdate();
  }

  #action(action: ErrorAction, messageId = '', account?: string): void {
    const model = this.model;
    if (!model) return;
    if (action === 'login') {
      this.#login(model, messageId, account);
      return;
    }
    const id = this.#id();
    if (action === 'drop-turn') {
      void this.#rewind(id, messageId);
      return;
    }
    if (action === 'retry') {
      const last = model.agent
        .messages(id)
        .filter((message): message is UserMessage => message.role === 'user')
        .at(-1);
      if (last) void model.agent.send(id, { text: last.text, attachments: last.attachments });
      return;
    }
    this.#settings(account);
  }

  #message(
    message: Message,
    agent: Agent,
    suggestion: string | null,
    changed: boolean,
    joined: Joined,
    owners: ReadonlyMap<string, Owner>,
    stamp: boolean
  ): TemplateResult {
    const model = this.model as SliccModel;
    const handlers = { ...this.#handlers, owners };
    switch (message.role) {
      case 'assistant': {
        const label = changed
          ? (model.settings.models().find((option) => option.id === message.model)?.label ??
            message.model)
          : '';
        return assistant(
          message,
          agent.name,
          label as string,
          handlers,
          model.settings.get().showThinking,
          suggestion,
          joined,
          stamp
        );
      }
      case 'user':
        return user(message, stamp, model.seat);
      case 'tool':
        return toolMessage(message, handlers, joined, suggestion, stamp);
      case 'system':
        return system(message, this.#handlers);
      default:
        return lick(message, this.#handlers, stamp);
    }
  }

  #items(messages: readonly Message[], agent: Agent): Entry[] {
    const out: Entry[] = [];
    let previous = '';
    let shown: string | undefined;
    const model = this.model as SliccModel;
    const last = messages.at(-1);
    const suggestion =
      last?.role === 'assistant' &&
      !agent.frozen &&
      !watchOnly(model) &&
      !model.seat &&
      !model.agent.busy(agent.id)
        ? model.agent.suggestion(agent.id)
        : null;
    const showThinking = model.settings.get().showThinking;
    const stamped = stamps(messages);
    const { joined, owners, into } = joins(
      messages,
      showThinking,
      stamped,
      model.agent.busy(agent.id)
    );
    const target = last && (into.get(last.id) ?? last.id);
    for (const message of messages) {
      if (into.has(message.id)) continue;
      const label = day(message.createdAt);
      if (label !== previous) {
        out.push([
          `day:${message.id}`,
          html`<div class="day" role="separator" aria-label=${label} data-day=${label}>
            <span class="line"></span><span>${label}</span><span class="line"></span>
          </div>`,
        ]);
        previous = label;
      }
      const next = message.role === 'assistant' ? message.model : undefined;
      const changed = !!next && next !== shown;
      if (changed) shown = next;
      out.push([
        message.id,
        this.#message(
          message,
          agent,
          message.id === target ? suggestion : null,
          changed,
          joined.get(message.id) ?? alone,
          owners,
          stamped.has(message.id)
        ),
      ]);
      out.push(...this.#questions(message));
    }
    return out;
  }

  #questions(message: Message): Entry[] {
    if (message.role !== 'assistant') return [];
    return message.parts.flatMap((part): Entry[] =>
      part.type === 'question'
        ? [[`${message.id}:${part.question.id}`, questionTurn(part.question, this.#handlers)]]
        : []
    );
  }

  #asks(asks: Ask[]): TemplateResult | typeof nothing {
    if (!asks.length) return nothing;
    const older = asks.slice(0, -1);
    const focused = (this.renderRoot as ShadowRoot).activeElement?.closest<HTMLElement>(
      '.asks .decision-turn'
    )?.dataset.id;
    this.#all ||= older.some(({ id }) => id === focused);
    this.#all &&= older.length > 0;
    const open = this.#all;
    const timed = open ? [] : older.flatMap(({ at }) => (at === undefined ? [] : [at]));
    const toggle = () => {
      this.#all = !open;
      this.requestUpdate();
    };
    return html`<section class="asks" aria-label="Waiting for you" ?data-open=${open} @scroll=${this.#more}><div class="column">
      ${
        older.length
          ? html`<div class="waiting"><swc-action-button size="s" quiet data-action="show-waiting" aria-expanded=${open ? 'true' : 'false'} @click=${toggle}><swc-icon-chevron-down slot="icon"></swc-icon-chevron-down>${asks.length} waiting</swc-action-button>${timed.length ? askTimer(Math.min(...timed)) : nothing}</div>`
          : nothing
      }
      <div class="ask-list" aria-live="polite">${repeat(
        asks,
        ({ key }) => key,
        ({ card }, index) =>
          html`<div class="ask" ?hidden=${!open && index < older.length}>${card}</div>`
      )}</div>
    </div></section>`;
  }

  #newChat(agent: Agent): void {
    (this.model as SliccModel).agent.clear(agent.id);
    this.renderRoot.querySelector<SliccComposer>('slicc-composer')?.focus();
  }

  #meta(agent: Agent, empty: boolean): TemplateResult {
    const model = this.model as SliccModel;
    const fill = Math.round(agent.contextFill * 100);
    if (model.seat)
      return html`<span class="cone" data-seat-cone>${agent.name}</span>${statusLight(agent.status)}`;
    const meter = html`<swc-meter size="s" label-position="side" value=${fill} variant=${meterVariant(fill)}><span slot="label">Context</span></swc-meter>`;
    if (agent.frozen) {
      return html`<swc-badge size="s" variant="informative" subtle>Frozen</swc-badge>
        <span class="frozen">Read only</span>
        ${watchOnly(model) ? nothing : html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="thaw" @click=${() => model.agent.thaw(agent.id)}>Thaw</swc-button>`}
        ${meter}`;
    }
    if (watchOnly(model)) {
      const label = model.settings.models().find((option) => option.id === agent.model)?.label;
      return html`${statusLight(agent.status)}
        <span class="model" data-model>${label ?? agent.model}</span>
        ${meter}`;
    }
    const offered = chatModels(model.settings.models());
    return html`${statusLight(agent.status)}
      ${
        offered.length
          ? html`<sp-picker size="s" quiet label="Model" value=${agent.model} @change=${(event: Event) => model.agent.setModel(agent.id, (event.target as HTMLInputElement).value)}>
        ${offered.map((option) => html`<sp-menu-item value=${option.id}>${option.label}<span slot="description">${option.provider}</span></sp-menu-item>`)}
      </sp-picker>`
          : html`<swc-action-button size="s" quiet data-action="set-up-model" @click=${() => this.#action('settings')}>Set up a model</swc-action-button>`
      }
      <sp-picker size="s" quiet label="Thinking" value=${model.settings.get().thinking} @change=${(event: Event) => model.settings.update({ thinking: (event.target as HTMLInputElement).value as Thinking })}>
        <sp-menu-item value="off">No thinking</sp-menu-item>
        <sp-menu-item value="low">Think a little</sp-menu-item>
        <sp-menu-item value="medium">Think</sp-menu-item>
        <sp-menu-item value="high">Think hard</sp-menu-item>
      </sp-picker>
      ${meter}
      <swc-action-button id="new-chat" size="s" quiet data-action="new-chat" accessible-label=${this.compact ? 'New conversation' : nothing} ?disabled=${empty} @click=${() => this.#newChat(agent)}><swc-icon-new slot="icon"></swc-icon-new>${this.compact ? nothing : 'New conversation'}</swc-action-button>
      <swc-tooltip for="new-chat" placement="bottom">${agent.kind === 'cone' && model.agent.freeze ? 'Start a new conversation. This one stays in the Freezer.' : 'Start a new conversation'}</swc-tooltip>`;
  }

  #latest(fresh: number): TemplateResult {
    const label = fresh > 0 ? `Jump to latest (${fresh} new)` : 'Jump to latest';
    const spoken =
      fresh > 0
        ? `Jump to latest, ${fresh} new ${fresh === 1 ? 'message' : 'messages'}`
        : 'Jump to latest';
    return html`<div class="jump"><swc-action-button size="s" data-action="jump-latest" accessible-label=${spoken} @click=${this.#jump}><swc-icon-chevron-down slot="icon"></swc-icon-chevron-down>${label}</swc-action-button><span class="sr" role="status" aria-live="polite" data-jump-status>${fresh > 0 ? `${fresh} new ${fresh === 1 ? 'message' : 'messages'} below` : ''}</span></div>`;
  }

  #switched(agent: Agent | undefined): void {
    const id = agent?.id ?? '';
    if (id === this.#seen) return;
    this.#seen = id;
    this.#all = false;
    this.#details.clear();
  }

  render(): TemplateResult {
    this.#handlers.color = this.color;
    this.#handlers.model = this.model ?? null;
    this.#handlers.surface ??= readSurface(this.renderRoot);
    const agent = this.#agent();
    this.#switched(agent);
    const watch = watchOnly(this.model);
    const seat = this.model?.seat;
    this.#handlers.readOnly = !!agent?.frozen || !!watch || !!seat;
    this.#handlers.agentId = agent?.id;
    this.#handlers.seat = seat?.label;
    const messages = agent ? (this.model?.agent.messages(agent.id) ?? []) : [];
    this.#tail = messages.at(-1)?.id ?? '';
    const { items, asks } = dock(agent ? this.#items(messages, agent) : [], messages, seat);
    const count = items.filter(([key]) => !key.startsWith('day:')).length;
    if (!this.behind) this.#mark = count;
    return html`
      <header ?data-compact=${this.compact}>
        ${agent ? this.#meta(agent, !messages.length) : html`<span>No agent</span>`}
      </header>
      <slicc-notices .model=${this.model}></slicc-notices>
      ${this.#asks(asks)}
      <div class="stage">
        <div
          class="log"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          tabindex="-1"
          @scroll=${this.#scroll}
          @wheel=${this.#intent}
          @touchstart=${this.#intent}
          @touchmove=${this.#intent}
          @keydown=${this.#intent}
          @pointerdown=${this.#hold}
        >
          <div class="column" @keydown=${this.#keys}>
            ${
              items.length
                ? html`<swc-conversation-thread>${repeat(
                    items,
                    ([key]) => key,
                    ([, item]) => item
                  )}</swc-conversation-thread>`
                : this.model?.tabs?.state().role === 'connecting'
                  ? html`<div class="empty" data-connecting>${connecting}</div>`
                  : this.model?.agent.starting?.()
                    ? nothing
                    : html`<div class="empty" data-empty>${empty(watch, seat, agent?.name ?? 'the agent')}</div>`
            }
          </div>
        </div>
        ${this.behind ? this.#latest(count - this.#mark) : nothing}
      </div>
      ${
        this.dropping
          ? html`<swc-dropzone dragged size="l" aria-label="Attach files" dragged-message="" data-surface="drop">
              <swc-illustrated-message>
                <swc-icon-attach></swc-icon-attach>
                <h2 slot="heading">Drop files to attach</h2>
                <span slot="description">Images, text and other files up to ${limit / 1024 / 1024} MB each join your next message. Folders can’t be attached.</span>
              </swc-illustrated-message>
            </swc-dropzone>`
          : nothing
      }
      <p class="sr" role="status" data-announce="drop">${this.dropping ? 'Drop to attach files to your message' : ''}</p>
      ${
        watch
          ? watch === following(this.model)?.refused
            ? nothing
            : html`<p class="watch-only" role="note" data-follow="watch">${watch}</p>`
          : this.model && !agent?.frozen
            ? html`<slicc-composer .model=${this.model} .agent=${this.agent}></slicc-composer>`
            : nothing
      }
    `;
  }
}
