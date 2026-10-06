import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  Agent,
  AssistantMessage,
  EventMessage,
  Message,
  MessagePart,
  SliccModel,
  ToolCall,
} from '../model/types.ts';
import { dot, ModelElement, shared } from './base.ts';
import { markdown } from './markdown.ts';

const eventLabels = {
  webhook: 'Webhook',
  cron: 'Schedule',
  scoop: 'Scoop',
  compaction: 'Compacted',
  error: 'Error',
} as const;

const eventVariants = {
  webhook: 'informative',
  cron: 'neutral',
  scoop: 'neutral',
  compaction: 'neutral',
  error: 'negative',
} as const;

function time(at: number): string {
  return new Date(at).toISOString().slice(11, 16);
}

export class SliccChat extends ModelElement {
  static properties = { ...ModelElement.properties, draft: { state: true } };
  declare draft: string;

  constructor() {
    super();
    this.draft = '';
  }

  static styles = [
    shared,
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
    .message {
      padding: 8px 0;
    }
    .meta {
      display: flex;
      gap: 8px;
      align-items: baseline;
      font-size: var(--spectrum-font-size-75);
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
    .meta .who {
      font-weight: 600;
      color: var(--spectrum-neutral-content-color-default);
    }
    .user .body {
      background: var(--spectrum-background-layer-1-color);
      border: 1px solid var(--spectrum-gray-200);
      border-radius: var(--spectrum-corner-radius-75);
      padding: 6px 10px;
      margin-top: 4px;
      white-space: pre-wrap;
    }
    .text p,
    .text ul,
    .text ol,
    .text table,
    .text pre {
      margin: 6px 0;
    }
    .text ul,
    .text ol {
      padding-left: 20px;
    }
    .text .heading {
      font-weight: 700;
      margin: 10px 0 4px;
    }
    code,
    pre {
      font-family: var(--spectrum-code-font-family-stack, ui-monospace, monospace);
      font-size: var(--spectrum-font-size-75);
    }
    :not(pre) > code {
      background: var(--spectrum-gray-100);
      border-radius: 3px;
      padding: 0 3px;
    }
    pre {
      background: var(--spectrum-background-layer-1-color);
      border: 1px solid var(--spectrum-gray-200);
      border-radius: var(--spectrum-corner-radius-75);
      padding: 8px 10px;
      overflow-x: auto;
      white-space: pre;
    }
    table {
      border-collapse: collapse;
      font-size: var(--spectrum-font-size-75);
    }
    th,
    td {
      border: 1px solid var(--spectrum-gray-200);
      padding: 3px 8px;
      text-align: left;
    }
    th {
      background: var(--spectrum-background-layer-1-color);
    }
    a {
      color: var(--spectrum-accent-content-color-default);
    }
    .thinking {
      color: var(--spectrum-neutral-subdued-content-color-default);
      font-style: italic;
      font-size: var(--spectrum-font-size-75);
      border-left: 2px solid var(--spectrum-gray-300);
      padding-left: 8px;
      margin: 6px 0;
    }
    details.tool {
      border: 1px solid var(--spectrum-gray-200);
      border-radius: var(--spectrum-corner-radius-75);
      margin: 4px 0;
      background: var(--spectrum-background-layer-1-color);
      font-size: var(--spectrum-font-size-75);
    }
    details.tool > summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 8px;
      cursor: pointer;
      list-style: none;
      min-height: 22px;
    }
    details.tool > summary::-webkit-details-marker {
      display: none;
    }
    details.tool > summary:focus-visible {
      outline: 2px solid var(--spectrum-focus-indicator-color);
      outline-offset: -2px;
    }
    .chevron {
      transition: transform 0.1s;
      color: var(--spectrum-gray-600);
    }
    details[open] > summary .chevron {
      transform: rotate(90deg);
    }
    .tool .name {
      font-family: var(--spectrum-code-font-family-stack, monospace);
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
    .tool .title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tool .state {
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
    .tool[data-status='done'] .state {
      color: var(--spectrum-positive-visual-color);
    }
    .tool[data-status='error'] .state {
      color: var(--spectrum-negative-visual-color);
    }
    .tool pre {
      margin: 0 8px 8px;
      max-height: 240px;
      overflow: auto;
    }
    .event {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--spectrum-font-size-75);
      color: var(--spectrum-neutral-subdued-content-color-default);
      border-top: 1px dashed var(--spectrum-gray-300);
      padding: 6px 0;
      margin: 6px 0;
    }
    .event strong {
      color: var(--spectrum-neutral-content-color-default);
      font-weight: 600;
    }
    .caret {
      display: inline-block;
      width: 7px;
      height: 14px;
      vertical-align: text-bottom;
      background: var(--spectrum-accent-visual-color);
      animation: blink 1s steps(1) infinite;
    }
    @keyframes blink {
      50% {
        opacity: 0;
      }
    }
    .empty {
      color: var(--spectrum-neutral-subdued-content-color-default);
      text-align: center;
      padding: 48px 0;
      font-size: var(--spectrum-font-size-75);
    }
    form {
      flex: none;
      border-top: 1px solid var(--spectrum-gray-200);
      padding: 8px 12px;
      background: var(--spectrum-background-layer-1-color);
    }
    .composer {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    sp-textfield {
      flex: 1;
      width: auto;
    }
    .hint {
      max-width: 860px;
      margin: 4px auto 0;
      font-size: var(--spectrum-font-size-50);
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
  `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [
      model.agent.on('active', () => this.#refresh(true)),
      model.agent.on('agents', () => this.requestUpdate()),
      model.agent.on('message', ({ agentId }) => {
        if (agentId === model.agent.active()) this.#refresh(false);
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

  #agent(): Agent | undefined {
    const model = this.model;
    return model?.agent.list().find((agent) => agent.id === model.agent.active());
  }

  #streaming(): boolean {
    const id = this.model?.agent.active() ?? '';
    const last = this.model?.agent.messages(id).at(-1);
    return last?.role === 'assistant' && last.status === 'streaming';
  }

  focus(): void {
    this.renderRoot.querySelector<HTMLElement>('sp-textfield')?.focus();
  }

  send(): void {
    const model = this.model;
    const text = this.draft.trim();
    if (!model || !text) return;
    this.draft = '';
    void model.agent.send(model.agent.active(), text);
  }

  stop(): void {
    this.model?.agent.stop(this.model.agent.active());
  }

  #submit(event: Event): void {
    event.preventDefault();
    if (this.#streaming()) this.stop();
    else this.send();
  }

  #keydown(event: KeyboardEvent): void {
    const sendOnEnter = this.model?.settings.get().sendOnEnter ?? true;
    if (event.key === 'Escape' && this.#streaming()) {
      event.preventDefault();
      this.stop();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    const wants = sendOnEnter ? !event.shiftKey : event.metaKey || event.ctrlKey;
    if (!wants) return;
    event.preventDefault();
    this.send();
  }

  #input(event: Event): void {
    this.draft = (event.target as HTMLInputElement).value;
  }

  #tool(tool: ToolCall): TemplateResult {
    const state =
      tool.status === 'running'
        ? html`<sp-progress-circle size="s" indeterminate label="Running"></sp-progress-circle>`
        : html`<span class="state">${tool.status === 'done' ? 'done' : 'failed'}</span>`;
    return html`<details class="tool" data-status=${tool.status} data-tool=${tool.name}>
      <summary>
        <span class="chevron" aria-hidden="true">▸</span>
        <span class="name">${tool.name}</span>
        <span class="title">${tool.title}</span>
        ${state}
      </summary>
      <pre class="input">${tool.name === 'bash' ? `$ ${tool.input}` : tool.input}</pre>
      ${tool.output ? html`<pre class="output">${tool.output}</pre>` : nothing}
    </details>`;
  }

  #part(part: MessagePart, showThinking: boolean): TemplateResult | typeof nothing {
    if (part.type === 'tool') return this.#tool(part.tool);
    if (part.type === 'thinking') {
      return showThinking ? html`<div class="thinking">${part.text}</div>` : nothing;
    }
    return html`<div class="text">${markdown(part.text)}</div>`;
  }

  #assistant(message: AssistantMessage, name: string): TemplateResult {
    const showThinking = this.model?.settings.get().showThinking ?? true;
    return html`<article class="message assistant" data-id=${message.id} data-status=${message.status}>
      <div class="meta"><span class="who">${name}</span><span>${time(message.createdAt)}</span>${
        message.status === 'stopped' ? html`<span>stopped</span>` : nothing
      }</div>
      ${message.parts.map((part) => this.#part(part, showThinking))}
      ${message.status === 'streaming' ? html`<span class="caret" aria-hidden="true"></span>` : nothing}
    </article>`;
  }

  #event(message: EventMessage): TemplateResult {
    return html`<div class="event" role="note" data-id=${message.id} data-kind=${message.kind}>
      <sp-badge size="s" variant=${eventVariants[message.kind]}>${eventLabels[message.kind]}</sp-badge>
      <strong>${message.title}</strong>
      <span>${message.text}</span>
    </div>`;
  }

  #message(message: Message, name: string): TemplateResult {
    if (message.role === 'assistant') return this.#assistant(message, name);
    if (message.role === 'event') return this.#event(message);
    return html`<article class="message user" data-id=${message.id}>
      <div class="meta"><span class="who">You</span><span>${time(message.createdAt)}</span></div>
      <div class="body">${message.text}</div>
    </article>`;
  }

  render(): TemplateResult {
    const agent = this.#agent();
    const messages = agent ? (this.model?.agent.messages(agent.id) ?? []) : [];
    const name = agent?.name ?? '';
    const streaming = this.#streaming();
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
            messages.length === 0
              ? html`<div class="empty">No messages yet. Ask ${agent?.name ?? 'the agent'} something.</div>`
              : repeat(
                  messages,
                  (message) => message.id,
                  (message) => this.#message(message, name)
                )
          }
        </div>
      </div>
      <form @submit=${this.#submit}>
        <div class="composer">
          <sp-textfield
            multiline
            grows
            rows="1"
            label="Message"
            placeholder=${`Message ${agent?.name ?? ''}`}
            .value=${this.draft}
            @input=${this.#input}
            @keydown=${this.#keydown}
          ></sp-textfield>
          ${
            streaming
              ? html`<sp-button variant="secondary" size="m" treatment="outline" @click=${this.#submit}>
                  Stop
                </sp-button>`
              : html`<sp-button variant="accent" size="m" ?disabled=${!this.draft.trim()} @click=${this.#submit}>
                  <sp-icon-send slot="icon"></sp-icon-send>Send
                </sp-button>`
          }
        </div>
        <div class="hint">Enter to send · Shift+Enter for a new line · Esc to stop</div>
      </form>
    `;
  }
}
