import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/dropzone/swc-dropzone.js';
import '@adobe/spectrum-wc/components/tooltip/swc-tooltip.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/conversation-thread/swc-conversation-thread.js';
import '@adobe/spectrum-wc-icons/swc-icon-new.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  Agent,
  ErrorAction,
  Message,
  SliccModel,
  Thinking,
  UserMessage,
} from '../model/types.ts';
import { chatModels, meterVariant, shared, statusLight, ThemedElement } from './base.ts';
import type { SliccComposer } from './composer.ts';
import { dipType } from './dips.ts';
import { watchOnly } from './follow.ts';
import {
  assistant,
  day,
  type Handlers,
  lick,
  messageCss,
  system,
  toolMessage,
  user,
} from './messages.ts';
import { settleModels } from './models.ts';
import { connecting } from './tabs.ts';

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

const failed = (message: Message): boolean =>
  message.role === 'assistant'
    ? message.status === 'error'
    : message.role === 'system' && message.kind === 'error';

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
  };
  declare agent: string;
  declare dropping: boolean;
  declare compact: boolean;

  constructor() {
    super();
    this.agent = '';
    this.dropping = false;
    this.compact = false;
    this.addEventListener('dragenter', this.#over);
    this.addEventListener('dragover', this.#over);
    this.addEventListener('dragleave', this.#leave);
    this.addEventListener('drop', this.#drop);
  }

  #composer(): SliccComposer | null {
    return this.renderRoot.querySelector<SliccComposer>('slicc-composer');
  }

  #over = (event: DragEvent): void => {
    if (!(carriesFiles(event) && this.#composer())) return;
    event.preventDefault();
    (event.dataTransfer as DataTransfer).dropEffect = 'copy';
    if (this.dropping) return;
    this.dropping = true;
    globalThis.addEventListener('keydown', this.#escape, true);
  };

  #leave = (event: DragEvent): void => {
    const to = event.relatedTarget;
    if (!(to instanceof Node && this.contains(to))) this.#clear();
  };

  #escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#clear();
  };

  #clear(): void {
    this.dropping = false;
    globalThis.removeEventListener('keydown', this.#escape, true);
  }

  #drop = (event: DragEvent): void => {
    this.#clear();
    const composer = this.#composer();
    if (!(carriesFiles(event) && composer)) return;
    if (event.composedPath().some((node) => (node as Element).localName === 'swc-prompt-field'))
      return;
    event.preventDefault();
    void composer.addFiles([...(event.dataTransfer as DataTransfer).files]);
  };

  static styles = [
    shared,
    messageCss,
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
      .log {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        container-type: inline-size;
        padding: var(--swc-spacing-400) var(--swc-spacing-300) var(--swc-spacing-500);
        font-size: var(--swc-font-size-200);
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
        --swc-dropzone-background-color: color-mix(
          in srgb,
          var(--swc-accent-visual-color) 14%,
          color-mix(in srgb, var(--swc-background-layer-2-color) 82%, transparent)
        );
      }
      swc-dropzone p {
        padding: var(--swc-spacing-100) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-1000);
        background: var(--swc-background-elevated-color);
        box-shadow: var(--swc-drop-shadow-elevated);
        font-size: var(--swc-font-size-300);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-accent-content-color-default);
      }
      .empty {
        color: var(--swc-neutral-subdued-content-color-default);
        text-align: center;
        padding: var(--swc-spacing-700) 0;
        font-size: var(--swc-font-size-100);
      }
    `,
  ];

  #handlers: Handlers = {
    color: 'light',
    model: null,
    readOnly: false,
    answer: (questionId, answer) => this.model?.agent.answer(this.#id(), questionId, answer),
    resolve: (messageId, state) => this.model?.agent.resolveLick(this.#id(), messageId, state),
    action: (action, messageId) => this.#action(action, messageId),
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
      ...(model.follow ? [model.follow.on('follow', settle)] : []),
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
  #from = 0;
  #start = 0;
  #settle: ReturnType<typeof setTimeout> | undefined;
  #tail = '';

  #sent(agentId: string): boolean {
    const last = this.model?.agent.messages(agentId).at(-1);
    return last?.role === 'user' && last.id !== this.#tail && (last.origin ?? 'user') === 'user';
  }

  #resize = new ResizeObserver(() => this.#pin());

  #log(): HTMLElement {
    return this.renderRoot.querySelector<HTMLElement>('.log') as HTMLElement;
  }

  #pin(): void {
    if (!this.#stuck) return;
    const log = this.#log();
    log.scrollTop = log.scrollHeight;
    this.#last = log.scrollTop;
    this.#height = log.scrollHeight;
  }

  #scroll = (): void => {
    const log = this.#log();
    const reader =
      log.scrollHeight <= this.#height ||
      this.#height - log.scrollTop - log.clientHeight >= 48 ||
      performance.now() - this.#input < 1000;
    const rising = performance.now() - this.#up < 1000 && log.scrollTop <= this.#from;
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 48) this.#stuck ||= !rising;
    else if (reader && log.scrollTop < this.#last) this.#stuck = false;
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
      const at = this.#log().scrollTop;
      if (!up || at <= 0) return;
      this.#from = at;
      this.#up = this.#input;
      if (this.#settle === undefined) this.#start = Math.max(at, this.#last);
      this.#stuck = false;
      clearTimeout(this.#settle);
      this.#settle = setTimeout(() => {
        this.#settle = undefined;
        if (this.#start - this.#log().scrollTop >= 48) return;
        this.#stuck = true;
        this.#pin();
      }, 400);
    },
  };

  #hold = (event: PointerEvent): void => {
    if (event.target === event.currentTarget) this.#input = Number.POSITIVE_INFINITY;
  };

  #release = (): void => {
    if (this.#input === Number.POSITIVE_INFINITY) this.#input = performance.now();
  };

  #refresh(jump: boolean): void {
    if (jump) this.#stuck = true;
    this.requestUpdate();
    void this.updateComplete.then(() => this.#pin());
  }

  #observe(): void {
    const log = this.#log();
    this.#resize.observe(log);
    this.#resize.observe(log.firstElementChild as Element);
    this.#refresh(true);
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
    clearTimeout(this.#settle);
  }

  protected firstUpdated(): void {
    this.#observe();
  }

  focus(): void {
    if (!touched && globalThis.matchMedia('(pointer: fine)').matches)
      this.focusOn('slicc-composer', '.log');
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

  #action(action: ErrorAction, messageId = ''): void {
    const model = this.model;
    if (!model) return;
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
    this.dispatchEvent(
      new CustomEvent('show-surface', { detail: { id: 'settings' }, bubbles: true, composed: true })
    );
  }

  #message(
    message: Message,
    agent: Agent,
    suggestion: string | null,
    changed: boolean
  ): TemplateResult {
    const model = this.model as SliccModel;
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
          this.#handlers,
          model.settings.get().showThinking,
          suggestion
        );
      }
      case 'user':
        return user(message);
      case 'tool':
        return toolMessage(message, this.#handlers.color);
      case 'system':
        return system(message, this.#handlers);
      default:
        return lick(message, this.#handlers);
    }
  }

  #items(messages: readonly Message[], agent: Agent): Array<[string, TemplateResult]> {
    const out: Array<[string, TemplateResult]> = [];
    let previous = '';
    let shown: string | undefined;
    const model = this.model as SliccModel;
    const last = messages.at(-1);
    const suggestion =
      last?.role === 'assistant' &&
      !agent.frozen &&
      !watchOnly(model) &&
      !model.agent.busy(agent.id)
        ? model.agent.suggestion(agent.id)
        : null;
    for (const message of messages) {
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
        this.#message(message, agent, message === last ? suggestion : null, changed),
      ]);
    }
    return out;
  }

  #newChat(agent: Agent): void {
    (this.model as SliccModel).agent.clear(agent.id);
    this.renderRoot.querySelector<SliccComposer>('slicc-composer')?.focus();
  }

  #meta(agent: Agent, empty: boolean): TemplateResult {
    const model = this.model as SliccModel;
    const fill = Math.round(agent.contextFill * 100);
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

  render(): TemplateResult {
    this.#handlers.color = this.color;
    this.#handlers.model = this.model ?? null;
    const agent = this.#agent();
    const watch = watchOnly(this.model);
    this.#handlers.readOnly = !!agent?.frozen || !!watch;
    const messages = agent ? (this.model?.agent.messages(agent.id) ?? []) : [];
    this.#tail = messages.at(-1)?.id ?? '';
    return html`
      <header ?data-compact=${this.compact}>
        ${agent ? this.#meta(agent, !messages.length) : html`<span>No agent</span>`}
      </header>
      <slicc-notices .model=${this.model}></slicc-notices>
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
            agent && messages.length > 0
              ? html`<swc-conversation-thread>${repeat(
                  this.#items(messages, agent),
                  ([key]) => key,
                  ([, item]) => item
                )}</swc-conversation-thread>`
              : this.model?.tabs?.state().role === 'connecting'
                ? html`<div class="empty" data-connecting>${connecting}</div>`
                : html`<div class="empty">No messages yet. Ask ${agent?.name ?? 'the agent'} something.</div>`
          }
        </div>
      </div>
      ${
        this.dropping
          ? html`<swc-dropzone dragged size="l" aria-label="Attach files" dragged-message="Drop to attach"><p>Drop to attach</p></swc-dropzone>`
          : nothing
      }
      ${
        watch
          ? html`<p class="watch-only" role="note" data-follow="watch">${watch}</p>`
          : this.model && !agent?.frozen
            ? html`<slicc-composer .model=${this.model} .agent=${this.agent}></slicc-composer>`
            : nothing
      }
    `;
  }
}
