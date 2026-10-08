import { css, html, nothing, type TemplateResult } from 'lit';
import type {
  Agent,
  ErrorAction,
  Message,
  SliccModel,
  Thinking,
  UserMessage,
} from '../model/types.ts';
import { meterVariant, shared, statusLight, ThemedElement } from './base.ts';
import type { SliccComposer } from './composer.ts';
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

export class SliccChat extends ThemedElement {
  static properties = { ...ThemedElement.properties, agent: {} };
  declare agent: string;

  constructor() {
    super();
    this.agent = '';
  }

  static styles = [
    shared,
    messageCss,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--spectrum-background-layer-2-color);
        color: var(--spectrum-neutral-content-color-default);
        font-size: var(--spectrum-font-size-100);
        line-height: 1.5;
      }
      header {
        display: flex;
        flex-wrap: wrap;
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
        min-width: 0;
        width: auto;
      }
      header swc-status-light {
        align-self: center;
      }
      header swc-meter {
        flex: 0 1 calc(var(--swc-spacing-400) * 6);
        min-width: calc(var(--swc-spacing-400) * 4);
        margin-inline-start: auto;
      }
      .log {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px 16px 24px;
      }
      .column {
        max-width: 860px;
        margin: 0 auto;
      }
      .empty {
        color: var(--spectrum-neutral-subdued-content-color-default);
        text-align: center;
        padding: 48px 0;
        font-size: var(--spectrum-font-size-75);
      }
    `,
  ];

  #handlers: Handlers = {
    color: 'light',
    model: null,
    answer: (questionId, answer) => this.model?.agent.answer(this.#id(), questionId, answer),
    resolve: (messageId, state) => this.model?.agent.resolveLick(this.#id(), messageId, state),
    action: (action, messageId) => this.#action(action, messageId),
    open: (path) =>
      this.dispatchEvent(
        new CustomEvent('open-file', { detail: { path }, bubbles: true, composed: true })
      ),
  };

  protected subscribe(model: SliccModel): Array<() => void> {
    return [
      ...super.subscribe(model),
      model.agent.on('active', () => {
        if (!this.agent) this.#refresh(true);
      }),
      model.agent.on('agents', () => this.requestUpdate()),
      model.agent.on('messages', (agentId) => {
        if (agentId === this.#id()) this.#refresh(true);
      }),
      model.agent.on('message', ({ agentId }) => {
        if (agentId === this.#id()) this.#refresh(false);
      }),
    ];
  }

  #stuck = true;
  #last = 0;
  #resize = new ResizeObserver(() => this.#pin());

  #log(): HTMLElement {
    return this.renderRoot.querySelector<HTMLElement>('.log') as HTMLElement;
  }

  #pin(): void {
    if (!this.#stuck) return;
    const log = this.#log();
    log.scrollTop = log.scrollHeight;
    this.#last = log.scrollTop;
  }

  #scroll = (): void => {
    const log = this.#log();
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 48) this.#stuck = true;
    else if (log.scrollTop < this.#last) this.#stuck = false;
    this.#last = log.scrollTop;
  };

  #refresh(jump: boolean): void {
    if (jump) this.#stuck = true;
    this.requestUpdate();
    void this.updateComplete.then(() => this.#pin());
  }

  protected firstUpdated(): void {
    const log = this.#log();
    this.#resize.observe(log);
    this.#resize.observe(log.firstElementChild as Element);
    this.#refresh(true);
  }

  focus(): void {
    this.focusOn('slicc-composer');
  }

  #id(): string {
    return this.agent || (this.model?.agent.active() ?? '');
  }

  #agent(): Agent | undefined {
    const id = this.#id();
    return this.model?.agent.list().find((agent) => agent.id === id);
  }

  async #rewind(id: string, messageId: string): Promise<void> {
    const restored = await this.model?.agent.rewind?.(id, messageId);
    if (!restored) return;
    this.renderRoot.querySelector<SliccComposer>('slicc-composer')?.restore(restored);
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

  #message(message: Message, agent: Agent): TemplateResult {
    const model = this.model as SliccModel;
    switch (message.role) {
      case 'assistant': {
        const label =
          model.settings.models().find((option) => option.id === (message.model ?? ''))?.label ??
          message.model ??
          '';
        return assistant(
          message,
          agent.name,
          label,
          this.#handlers,
          model.settings.get().showThinking
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

  #items(messages: readonly Message[], agent: Agent): TemplateResult[] {
    const out: TemplateResult[] = [];
    let previous = '';
    for (const message of messages) {
      const label = day(message.createdAt);
      if (label !== previous) {
        out.push(
          html`<div class="day" role="separator" data-day=${label}><span class="line"></span><span>${label}</span><span class="line"></span></div>`
        );
        previous = label;
      }
      out.push(this.#message(message, agent));
    }
    return out;
  }

  #meta(agent: Agent): TemplateResult {
    const model = this.model as SliccModel;
    const fill = Math.round(agent.contextFill * 100);
    return html`${statusLight(agent.status)}
      <sp-picker size="s" quiet label="Model" value=${agent.model} @change=${(event: Event) => model.agent.setModel(agent.id, (event.target as HTMLInputElement).value)}>
        ${model.settings.models().map((option) => html`<sp-menu-item value=${option.id}>${option.label}</sp-menu-item>`)}
      </sp-picker>
      <sp-picker size="s" quiet label="Thinking" value=${model.settings.get().thinking} @change=${(event: Event) => model.settings.update({ thinking: (event.target as HTMLInputElement).value as Thinking })}>
        <sp-menu-item value="off">No thinking</sp-menu-item>
        <sp-menu-item value="low">Think a little</sp-menu-item>
        <sp-menu-item value="medium">Think</sp-menu-item>
        <sp-menu-item value="high">Think hard</sp-menu-item>
      </sp-picker>
      <swc-meter size="s" label-position="side" value=${fill} variant=${meterVariant(fill)}><span slot="label">Context</span></swc-meter>`;
  }

  render(): TemplateResult {
    this.#handlers.color = this.color;
    this.#handlers.model = this.model ?? null;
    const agent = this.#agent();
    const messages = agent ? (this.model?.agent.messages(agent.id) ?? []) : [];
    return html`
      <header>
        ${agent ? this.#meta(agent) : html`<span>No agent</span>`}
      </header>
      <div class="log" role="log" aria-live="polite" aria-label="Conversation" @scroll=${this.#scroll}>
        <div class="column">
          ${
            agent && messages.length > 0
              ? this.#items(messages, agent)
              : html`<div class="empty">No messages yet. Ask ${agent?.name ?? 'the agent'} something.</div>`
          }
        </div>
      </div>
      ${this.model ? html`<slicc-composer .model=${this.model} .agent=${this.agent}></slicc-composer>` : nothing}
    `;
  }
}
