import { css, html, nothing, type TemplateResult } from 'lit';
import type { Agent, ErrorAction, Message, SliccModel, UserMessage } from '../model/types.ts';
import { dot, shared, ThemedElement } from './base.ts';
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
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        height: 32px;
        flex: none;
        border-bottom: 1px solid var(--spectrum-gray-200);
        font-size: var(--spectrum-font-size-75);
        color: var(--spectrum-neutral-subdued-content-color-default);
        white-space: nowrap;
        overflow: hidden;
      }
      header strong {
        color: var(--spectrum-neutral-content-color-default);
        font-weight: 600;
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
    action: (action) => this.#action(action),
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

  #refresh(jump: boolean): void {
    const log = this.renderRoot.querySelector('.log');
    const stuck = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    this.requestUpdate();
    void this.updateComplete.then(() => {
      const next = this.renderRoot.querySelector('.log');
      if (next && (jump || stuck)) next.scrollTop = next.scrollHeight;
    });
  }

  protected firstUpdated(): void {
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

  #action(action: ErrorAction): void {
    const model = this.model;
    if (!model) return;
    const id = this.#id();
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
        return toolMessage(message);
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

  render(): TemplateResult {
    this.#handlers.color = this.color;
    this.#handlers.model = this.model ?? null;
    const agent = this.#agent();
    const messages = agent ? (this.model?.agent.messages(agent.id) ?? []) : [];
    const model = this.model?.settings.models().find((option) => option.id === agent?.model);
    return html`
      <header>
        ${
          agent
            ? html`${dot(agent.status)}<strong>${agent.name}</strong><span>${agent.kind}</span><span>·</span>
              <span>${agent.status}</span><span>·</span><span>${model?.label ?? agent.model}</span>`
            : html`<span>No agent</span>`
        }
      </header>
      <div class="log" role="log" aria-live="polite" aria-label="Conversation">
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
