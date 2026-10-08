import { css, html, nothing, type TemplateResult } from 'lit';
import type {
  ActionCard,
  AssistantMessage,
  Attachment,
  CheckItem,
  ErrorAction,
  LickChannel,
  LickMessage,
  LickState,
  Media,
  MessagePart,
  Question,
  SliccModel,
  SystemMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '../model/types.ts';
import { markdown } from './markdown.ts';

export interface Handlers {
  color: 'light' | 'dark';
  model: SliccModel | null;
  answer(questionId: string, answer: string): void;
  resolve(messageId: string, state: Exclude<LickState, 'pending'>): void;
  action(action: ErrorAction, messageId?: string): void;
  open(path: string): void;
}

export const lickLabels: Record<LickChannel, [string, string]> = {
  webhook: ['Webhook', 'informative'],
  cron: ['Schedule', 'neutral'],
  sprinkle: ['Sprinkle', 'fuchsia'],
  fswatch: ['File watch', 'seafoam'],
  'session-reload': ['Session', 'neutral'],
  navigate: ['Navigation', 'indigo'],
  discovery: ['Discovery', 'purple'],
  upgrade: ['Upgrade', 'positive'],
  workflow: ['Workflow', 'orange'],
  bash: ['Shell job', 'neutral'],
  jshd: ['Script', 'neutral'],
  preview: ['Preview', 'cyan'],
  cherry: ['Host event', 'magenta'],
  'scoop-notify': ['Scoop done', 'celery'],
  'scoop-idle': ['Scoop idle', 'neutral'],
  'scoop-wait': ['Scoop wait', 'yellow'],
  'sudo-request': ['Permission', 'notice'],
};

const toolStates = { done: 'done', error: 'failed', cancelled: 'cancelled' } as const;

const actionLabels: Record<ErrorAction, string> = {
  retry: 'Retry',
  settings: 'Open settings',
  'change-model': 'Change model',
  login: 'Log in',
  'drop-turn': 'Drop the last turn',
};

export function time(at: number): string {
  return new Date(at).toISOString().slice(11, 16);
}

export function day(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function body(call: ToolCall, color: 'light' | 'dark'): TemplateResult {
  if (call.diff) {
    return html`<slicc-diff-view class="input" path=${call.paths[0] ?? call.title} color=${color} .oldText=${call.diff.before} .newText=${call.diff.after}></slicc-diff-view>`;
  }
  return html`<pre class="input">${call.name === 'bash' ? `$ ${call.input}` : call.input}</pre>`;
}

export function tool(call: ToolCall, color: 'light' | 'dark' = 'light'): TemplateResult {
  const state =
    call.status === 'running'
      ? html`<sp-progress-circle size="s" indeterminate label="Running"></sp-progress-circle>`
      : html`<span class="state">${toolStates[call.status]}</span>`;
  return html`<details class="tool" data-status=${call.status} data-tool=${call.name}>
    <summary>
      <span class="chevron" aria-hidden="true">▸</span>
      <span class="name">${call.name}</span>
      <span class="title">${call.title}</span>
      ${call.meta ? html`<span class="tool-meta">${call.meta}</span>` : nothing}
      ${state}
    </summary>
    ${body(call, color)}
    ${call.output ? html`<pre class="output">${call.output}</pre>` : nothing}
    ${call.image ? html`<img class="shot" src=${call.image} alt=${call.title} />` : nothing}
  </details>`;
}

function cluster(calls: ToolCall[], open: boolean, color: 'light' | 'dark'): TemplateResult {
  const failed = calls.filter((call) => call.status === 'error').length;
  const running = calls.some((call) => call.status === 'running');
  return html`<details class="cluster" ?open=${open || running}>
    <summary>
      <span class="chevron" aria-hidden="true">▸</span>
      <span class="title">${calls.length} steps</span>
      <span class="names">${[...new Set(calls.map((call) => call.name))].join(' · ')}</span>
      ${failed ? html`<span class="state failed">${failed} failed</span>` : nothing}
    </summary>
    ${calls.map((call) => tool(call, color))}
  </details>`;
}

function media(items: Media[]): TemplateResult {
  return html`<div class="gallery" data-count=${items.length}>
    ${items.map((item) => {
      if (item.kind === 'image')
        return html`<img class="media" src=${item.src} alt=${item.alt} loading="lazy" />`;
      if (item.kind === 'video') {
        return html`<video class="media" controls preload="none" poster=${item.poster ?? nothing} src=${item.src || nothing} aria-label=${item.alt}></video>`;
      }
      return html`<audio class="audio" controls preload="none" src=${item.src} aria-label=${item.alt}></audio>`;
    })}
  </div>`;
}

function card(item: ActionCard): TemplateResult {
  if (item.variant === 'pr') {
    return html`<div class="card pr" data-tone=${item.tone}>
      <div class="card-head"><span class="pill">PR #${item.number}</span><strong>${item.title}</strong></div>
      <div class="card-meta">
        <code>${item.branch}</code><span>·</span><span class="tone-text">${item.checks}</span><span>·</span>
        <span class="add">+${item.additions}</span><span class="del">−${item.deletions}</span><span>${item.files} files</span>
      </div>
    </div>`;
  }
  if (item.variant === 'tool') {
    return html`<div class="card tool-card" data-tone=${item.tone}>
      <div class="card-head"><span class="pill">${item.badge}</span><strong>${item.title}</strong><span class="tone-text">${item.status}</span></div>
      <div class="card-meta">${item.files.map((file) => html`<code>${file}</code>`)}</div>
    </div>`;
  }
  return html`<div class="card light" data-tone=${item.tone}><strong>${item.title}</strong><span>${item.detail}</span></div>`;
}

function check(items: CheckItem[]): TemplateResult {
  return html`<ul class="check">
    ${items.map((entry) => html`<li data-tone=${entry.tone ?? 'positive'}><span class="mark" aria-hidden="true">✓</span>${entry.text}</li>`)}
  </ul>`;
}

function question(item: Question, handlers: Handlers): TemplateResult {
  const answer = (value: string) => handlers.answer(item.id, value);
  let body: TemplateResult;
  if (item.state === 'answered') {
    body = html`<div class="answer">✓ ${item.answer}</div>`;
  } else if (item.state === 'inert') {
    body = html`<div class="hint">Only the latest question can be answered here.</div>`;
  } else if (item.kind === 'yes-no' || item.kind === 'choice') {
    const options = item.kind === 'yes-no' ? ['Yes', 'No'] : item.options;
    body = html`<div class="options">${options.map(
      (option) =>
        html`<sp-button size="s" variant="secondary" treatment="outline" @click=${() => answer(option)}>${option}</sp-button>`
    )}</div>`;
  } else {
    const submit = (event: Event) => {
      event.preventDefault();
      const field = (event.currentTarget as HTMLElement).querySelector('input') as HTMLInputElement;
      if (field.value.trim()) answer(field.value.trim());
    };
    body = html`<form class="options" @submit=${submit}>
      <input class="input" type=${item.kind === 'email' ? 'email' : item.kind === 'number' ? 'number' : item.kind === 'date' ? 'date' : 'text'} aria-label=${item.question} />
      <sp-button size="s" variant="accent" @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Answer</sp-button>
    </form>`;
  }
  return html`<div class="question" data-state=${item.state} data-kind=${item.kind}>
    <div class="q">${item.question}</div>
    ${body}
  </div>`;
}

const delegationVerbs = {
  feed: 'fed',
  scoop: 'started',
  drop: 'dropped',
  sprinkle: 'opened',
} as const;

function part(
  entry: MessagePart,
  handlers: Handlers,
  showThinking: boolean
): TemplateResult | typeof nothing {
  switch (entry.type) {
    case 'text':
      return html`<div class="text">${markdown(entry.text)}</div>`;
    case 'thinking':
      return showThinking ? html`<div class="thinking">${entry.text}</div>` : nothing;
    case 'tool':
      return tool(entry.tool, handlers.color);
    case 'media':
      return media(entry.items);
    case 'card':
      return card(entry.card);
    case 'plan':
      return html`<div class="plan"><div class="label">Plan</div><ol>${entry.items.map((step) => html`<li>${step}</li>`)}</ol></div>`;
    case 'check':
      return check(entry.items);
    case 'diff':
      return html`<div class="inline-diff">
        <button class="diff-head" @click=${() => handlers.open(entry.path)}>${entry.path}</button>
        <slicc-diff-view path=${entry.path} color=${handlers.color} .oldText=${entry.before} .newText=${entry.after}></slicc-diff-view>
      </div>`;
    case 'question':
      return question(entry.question, handlers);
    case 'delegation':
      return html`<div class="delegation" data-kind=${entry.kind}>↳ <strong>${delegationVerbs[entry.kind]}</strong> <code>${entry.scoop}</code> ${entry.text}</div>`;
    case 'sprinkle':
      return html`<slicc-sprinkle inline .model=${handlers.model} sprinkle=${entry.sprinkle}></slicc-sprinkle>`;
    case 'link':
      return html`<a class="link-card" href=${entry.url} target="_blank" rel="noopener noreferrer">
        <strong>${entry.title}</strong><span class="host">${new URL(entry.url).host}</span><span>${entry.description}</span>
      </a>`;
    default:
      return html`<div class="error-card" role="alert">
        <div class="error-text"><span class="lead">${entry.message}</span>${entry.detail ? html`<span class="detail">${entry.detail}</span>` : nothing}</div>
        ${entry.action ? html`<sp-button size="s" variant="secondary" treatment="outline" @click=${() => handlers.action(entry.action as ErrorAction)}>${actionLabels[entry.action]}</sp-button>` : nothing}
      </div>`;
  }
}

export function parts(
  entries: MessagePart[],
  handlers: Handlers,
  showThinking: boolean,
  streaming: boolean
): Array<TemplateResult | typeof nothing> {
  const out: Array<TemplateResult | typeof nothing> = [];
  let i = 0;
  while (i < entries.length) {
    let end = i;
    while (end < entries.length && entries[end].type === 'tool') end++;
    if (end - i >= 3) {
      const calls = entries
        .slice(i, end)
        .map((entry) => (entry as Extract<MessagePart, { type: 'tool' }>).tool);
      out.push(cluster(calls, streaming && end === entries.length, handlers.color));
      i = end;
    } else {
      out.push(part(entries[i], handlers, showThinking));
      i++;
    }
  }
  return out;
}

function attachment(item: Attachment): TemplateResult {
  if (item.kind === 'image' && item.url && !item.error) {
    return html`<figure class="attachment image" title=${item.name}><img src=${item.url} alt=${item.name} /><figcaption>${item.name}</figcaption></figure>`;
  }
  const glyph = { image: '🖼', text: '¶', file: '⎘', secret: '🔒' }[item.kind];
  return html`<div class="attachment chip" data-kind=${item.kind} ?data-error=${!!item.error} title=${item.error ?? item.path ?? item.name}>
    <span class="glyph" aria-hidden="true">${glyph}</span>
    <span class="name">${item.name}</span>
    <span class="size">${item.error ? item.error : item.kind === 'secret' ? 'secret' : size(item.size)}</span>
  </div>`;
}

const deliveries = { steer: 'steered', 'follow-up': 'follow-up' } as const;

export function user(message: UserMessage): TemplateResult {
  const delivered = message.delivered ?? (message.mode === 'steer' ? 'steer' : undefined);
  const tag = delivered === 'steer' || delivered === 'follow-up' ? deliveries[delivered] : null;
  return html`<article class="message user" data-id=${message.id} data-mode=${message.mode ?? 'send'} data-delivered=${delivered ?? 'run'}>
    <div class="meta">
      <span class="who">${message.from ? `From ${message.from}` : 'You'}</span><span>${time(message.createdAt)}</span>
      ${tag ? html`<span class="tag">${tag}</span>` : nothing}
    </div>
    ${message.text ? html`<div class="body">${message.text}</div>` : nothing}
    ${message.attachments?.length ? html`<div class="attachments">${message.attachments.map(attachment)}</div>` : nothing}
  </article>`;
}

export function assistant(
  message: AssistantMessage,
  name: string,
  model: string,
  handlers: Handlers,
  showThinking: boolean
): TemplateResult {
  const usage = message.usage
    ? `${message.usage.input.toLocaleString('en')} in · ${message.usage.output.toLocaleString('en')} out · $${message.usage.cost.toFixed(2)}`
    : '';
  return html`<article class="message assistant" data-id=${message.id} data-status=${message.status}>
    <div class="meta">
      <span class="who">${name}</span><span>${time(message.createdAt)}</span>
      ${model ? html`<span title=${usage}>${model}</span>` : nothing}
      ${message.status === 'stopped' ? html`<span class="tag">stopped</span>` : nothing}
      ${message.status === 'error' ? html`<span class="tag negative">failed</span>` : nothing}
    </div>
    ${parts(
      message.parts,
      { ...handlers, action: (action) => handlers.action(action, message.id) },
      showThinking,
      message.status === 'streaming'
    )}
    ${message.status === 'streaming' ? html`<span class="caret" aria-hidden="true"></span>` : nothing}
  </article>`;
}

export function toolMessage(
  message: ToolMessage,
  color: 'light' | 'dark' = 'light'
): TemplateResult {
  return html`<article class="message tool-message" data-id=${message.id}>
    <div class="meta"><span class="who">Tool</span><span>${time(message.createdAt)}</span></div>
    ${tool(message.tool, color)}
  </article>`;
}

export function system(message: SystemMessage, handlers: Handlers): TemplateResult {
  if (message.kind === 'compaction') {
    return html`<div class="marker" role="status" data-id=${message.id} data-state=${message.state ?? 'summarized'}>
      <span class="line"></span>
      <span>${message.title ?? 'Context compacted'} · ${message.state === 'summarizing' ? html`<sp-progress-circle size="s" indeterminate label="Summarizing"></sp-progress-circle>` : message.text}</span>
      <span class="line"></span>
    </div>`;
  }
  if (message.kind === 'notice') {
    return html`<div class="notice" role="note" data-id=${message.id}><strong>${message.title}</strong> ${message.text}</div>`;
  }
  return html`<div class="error-card system-error" role="alert" data-id=${message.id}>
    <div class="error-text"><strong>${message.title}</strong><span>${message.text}</span></div>
    ${message.action ? html`<sp-button size="s" variant="secondary" treatment="outline" @click=${() => handlers.action(message.action as ErrorAction, message.id)}>${actionLabels[message.action]}</sp-button>` : nothing}
  </div>`;
}

export function lick(message: LickMessage, handlers: Handlers): TemplateResult {
  const [label, variant] = lickLabels[message.channel];
  const decide = message.channel === 'sudo-request' && message.state === 'pending';
  const outcome =
    message.state === 'confirmed' ? 'Allowed' : message.state === 'dismissed' ? 'Denied' : '';
  const head = html`<span class="channel" data-hue=${variant}>${label}</span>
    <strong>${message.title}</strong>
    <span class="text">${message.text}</span>
    ${message.count && message.count > 1 ? html`<span class="times" title="Coalesced events">×${message.count}</span>` : nothing}
    ${outcome ? html`<span class="tag">${outcome}</span>` : nothing}
    <span class="when">${time(message.createdAt)}</span>`;
  const actions = decide
    ? html`<div class="decide">
        <sp-button size="s" variant="accent" @click=${() => handlers.resolve(message.id, 'confirmed')}>Allow</sp-button>
        <sp-button size="s" variant="secondary" treatment="outline" @click=${() => handlers.resolve(message.id, 'dismissed')}>Deny</sp-button>
      </div>`
    : nothing;
  if (!message.body) {
    return html`<div class="lick" data-id=${message.id} data-channel=${message.channel}><div class="lick-head">${head}</div>${actions}</div>`;
  }
  const details = html`<details class="lick" data-id=${message.id} data-channel=${message.channel}>
    <summary class="lick-head"><span class="chevron" aria-hidden="true">▸</span>${head}</summary>
    <pre class="output">${message.body}</pre>
  </details>`;
  return decide ? html`<div class="pending">${details}${actions}</div>` : details;
}

export const messageCss = css`
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
  .tag {
    font-size: var(--spectrum-font-size-50);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: 3px;
    padding: 0 4px;
  }
  .tag.negative {
    color: var(--spectrum-negative-visual-color);
    border-color: currentColor;
  }
  .user .body {
    background: var(--spectrum-background-layer-1-color);
    border: 1px solid var(--spectrum-gray-200);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 6px 10px;
    margin-top: 4px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .user[data-delivered='steer'] .body {
    border-left: 3px solid var(--spectrum-notice-visual-color);
  }
  .user[data-delivered='follow-up'] .body {
    border-left: 3px solid var(--spectrum-informative-visual-color);
  }
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .attachment.image {
    margin: 0;
    width: 96px;
    font-size: var(--spectrum-font-size-50);
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .attachment.image img {
    width: 96px;
    height: 64px;
    object-fit: cover;
    border-radius: var(--spectrum-corner-radius-75);
    border: 1px solid var(--spectrum-gray-200);
    display: block;
  }
  .attachment.image figcaption {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 280px;
    padding: 3px 8px;
    border: 1px solid var(--spectrum-gray-300);
    border-radius: var(--spectrum-corner-radius-75);
    background: var(--spectrum-background-layer-1-color);
    font-size: var(--spectrum-font-size-75);
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
  .chip[data-error] {
    border-color: var(--spectrum-negative-visual-color);
  }
  .chip[data-error] .size {
    color: var(--spectrum-negative-visual-color);
  }
  .text p,
  .text ul,
  .text ol,
  .text .table,
  .text pre,
  .text blockquote {
    margin: 6px 0;
  }
  .text ul,
  .text ol,
  .plan ol {
    padding-left: 20px;
  }
  .text .heading {
    font-weight: 700;
    margin: 10px 0 4px;
  }
  .text img {
    max-width: 100%;
    border-radius: var(--spectrum-corner-radius-75);
  }
  blockquote {
    border-left: 3px solid var(--spectrum-gray-300);
    padding-left: 10px;
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  hr {
    border: 0;
    border-top: 1px solid var(--spectrum-gray-200);
  }
  li:has(> .task) {
    list-style: none;
    margin-left: -18px;
  }
  .task {
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .task[data-done='true'] {
    color: var(--spectrum-positive-visual-color);
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
    overflow-wrap: anywhere;
  }
  pre {
    background: var(--spectrum-background-layer-1-color);
    border: 1px solid var(--spectrum-gray-200);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 8px 10px;
    overflow-x: auto;
    white-space: pre;
  }
  .table {
    overflow-x: auto;
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
  details.tool,
  details.cluster,
  details.lick,
  .lick {
    border: 1px solid var(--spectrum-gray-200);
    border-radius: var(--spectrum-corner-radius-75);
    margin: 4px 0;
    background: var(--spectrum-background-layer-1-color);
    font-size: var(--spectrum-font-size-75);
  }
  details.cluster > details.tool {
    margin: 4px 8px;
  }
  summary,
  .lick-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    min-height: 22px;
    list-style: none;
  }
  summary {
    cursor: pointer;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
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
  .tool .name,
  .cluster .names {
    font-family: var(--spectrum-code-font-family-stack, monospace);
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .title,
  .lick .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cluster .title {
    flex: none;
    font-weight: 600;
  }
  .cluster .names {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .tool[data-status='done'] > summary .state {
    color: var(--spectrum-positive-visual-color);
  }
  .tool[data-status='error'] > summary .state,
  .state.failed {
    color: var(--spectrum-negative-visual-color);
  }
  .tool-meta {
    flex: none;
    color: var(--spectrum-neutral-subdued-content-color-default);
    font-size: var(--spectrum-font-size-50);
  }
  .tool > slicc-diff-view {
    display: block;
    margin: 0 8px 8px;
    max-height: 240px;
    overflow: auto;
  }
  .tool pre,
  .lick pre {
    margin: 0 8px 8px;
    max-height: 240px;
    overflow: auto;
  }
  .shot {
    display: block;
    max-width: calc(100% - 16px);
    margin: 0 8px 8px;
    border-radius: var(--spectrum-corner-radius-75);
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
    margin: 6px 0;
  }
  .gallery .media {
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: var(--spectrum-corner-radius-75);
    border: 1px solid var(--spectrum-gray-200);
    background: var(--spectrum-gray-100);
  }
  .gallery .audio {
    grid-column: 1 / -1;
    width: 100%;
  }
  .card {
    border: 1px solid var(--spectrum-gray-200);
    border-left: 3px solid var(--tone);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 6px 10px;
    margin: 6px 0;
    background: var(--spectrum-background-layer-1-color);
    font-size: var(--spectrum-font-size-75);
    --tone: var(--spectrum-gray-400);
  }
  [data-tone='informative'] {
    --tone: var(--spectrum-informative-visual-color);
  }
  [data-tone='positive'] {
    --tone: var(--spectrum-positive-visual-color);
  }
  [data-tone='notice'] {
    --tone: var(--spectrum-notice-visual-color);
  }
  [data-tone='negative'] {
    --tone: var(--spectrum-negative-visual-color);
  }
  .card-head,
  .card-meta,
  .card.light {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .card-meta {
    margin-top: 4px;
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .tone-text {
    color: var(--tone);
  }
  .pill {
    border-radius: 999px;
    padding: 0 6px;
    background: var(--spectrum-gray-200);
    font-size: var(--spectrum-font-size-50);
    font-weight: 700;
  }
  .add {
    color: var(--spectrum-positive-visual-color);
  }
  .del {
    color: var(--spectrum-negative-visual-color);
  }
  .plan .label {
    font-size: var(--spectrum-font-size-50);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .plan ol {
    margin: 4px 0;
  }
  ul.check {
    list-style: none;
    padding: 0;
    margin: 6px 0;
  }
  ul.check li {
    display: flex;
    gap: 6px;
  }
  ul.check .mark {
    color: var(--tone);
    font-weight: 700;
  }
  .inline-diff {
    border: 1px solid var(--spectrum-gray-200);
    border-radius: var(--spectrum-corner-radius-75);
    margin: 6px 0;
    overflow: hidden;
  }
  .inline-diff slicc-diff-view {
    max-height: 260px;
    height: auto;
  }
  .diff-head {
    all: unset;
    display: block;
    padding: 3px 8px;
    font-family: var(--spectrum-code-font-family-stack, monospace);
    font-size: var(--spectrum-font-size-75);
    background: var(--spectrum-background-layer-1-color);
    border-bottom: 1px solid var(--spectrum-gray-200);
    cursor: pointer;
  }
  .diff-head:hover {
    text-decoration: underline;
  }
  .diff-head:focus-visible {
    outline: 2px solid var(--spectrum-focus-indicator-color);
  }
  .question {
    border: 1px solid var(--spectrum-gray-300);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 8px 10px;
    margin: 6px 0;
  }
  .question[data-state='open'] {
    border-color: var(--spectrum-accent-visual-color);
  }
  .question[data-state='inert'] {
    opacity: 0.6;
  }
  .question .q {
    font-weight: 600;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .input {
    font: inherit;
    padding: 4px 8px;
    border: 1px solid var(--spectrum-gray-400);
    border-radius: var(--spectrum-corner-radius-75);
    background: var(--spectrum-background-layer-2-color);
    color: inherit;
  }
  .answer {
    color: var(--spectrum-positive-visual-color);
    margin-top: 4px;
  }
  .hint {
    color: var(--spectrum-neutral-subdued-content-color-default);
    font-size: var(--spectrum-font-size-75);
    margin-top: 4px;
  }
  .delegation {
    font-size: var(--spectrum-font-size-75);
    color: var(--spectrum-neutral-subdued-content-color-default);
    margin: 2px 0;
  }
  .link-card {
    display: grid;
    gap: 2px;
    border: 1px solid var(--spectrum-gray-200);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 6px 10px;
    margin: 6px 0;
    color: inherit;
    text-decoration: none;
    font-size: var(--spectrum-font-size-75);
  }
  .link-card .host {
    color: var(--spectrum-accent-content-color-default);
  }
  .error-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--spectrum-negative-visual-color);
    border-radius: var(--spectrum-corner-radius-75);
    padding: 6px 10px;
    margin: 6px 0;
    font-size: var(--spectrum-font-size-75);
  }
  .error-card .error-text {
    display: grid;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .error-card .detail {
    font-size: var(--spectrum-font-size-50);
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .error-card sp-button {
    flex: none;
    white-space: nowrap;
  }
  .marker,
  .day {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0;
    font-size: var(--spectrum-font-size-75);
    color: var(--spectrum-neutral-subdued-content-color-default);
  }
  .marker .line,
  .day .line {
    flex: 1;
    height: 1px;
    background: var(--spectrum-gray-200);
  }
  .notice {
    font-size: var(--spectrum-font-size-75);
    color: var(--spectrum-neutral-subdued-content-color-default);
    text-align: center;
    margin: 8px 0;
  }
  .lick {
    border-style: dashed;
  }
  .channel {
    flex: none;
    font-size: var(--spectrum-font-size-50);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 3px;
    color: var(--hue);
    background: color-mix(in srgb, var(--hue) 12%, transparent);
    --hue: var(--spectrum-gray-700);
  }
  .channel[data-hue='informative'] {
    --hue: var(--spectrum-informative-visual-color);
  }
  .channel[data-hue='positive'] {
    --hue: var(--spectrum-positive-visual-color);
  }
  .channel[data-hue='notice'] {
    --hue: var(--spectrum-notice-visual-color);
  }
  .channel[data-hue='fuchsia'] {
    --hue: var(--spectrum-fuchsia-visual-color, #b539c8);
  }
  .channel[data-hue='seafoam'] {
    --hue: var(--spectrum-seafoam-visual-color, #0f8a85);
  }
  .channel[data-hue='indigo'] {
    --hue: var(--spectrum-indigo-visual-color, #6c55f2);
  }
  .channel[data-hue='purple'] {
    --hue: var(--spectrum-purple-visual-color, #8f3ac0);
  }
  .channel[data-hue='orange'] {
    --hue: var(--spectrum-orange-visual-color, #c45200);
  }
  .channel[data-hue='cyan'] {
    --hue: var(--spectrum-cyan-visual-color, #0b7a8f);
  }
  .channel[data-hue='magenta'] {
    --hue: var(--spectrum-magenta-visual-color, #c4277f);
  }
  .channel[data-hue='celery'] {
    --hue: var(--spectrum-celery-visual-color, #3c8a00);
  }
  .channel[data-hue='yellow'] {
    --hue: var(--spectrum-yellow-visual-color, #8a6d00);
  }
  .lick strong {
    white-space: nowrap;
  }
  .lick .times,
  .lick .when {
    color: var(--spectrum-neutral-subdued-content-color-default);
    white-space: nowrap;
  }
  .decide {
    display: flex;
    gap: 6px;
    padding: 0 8px 8px;
  }
  .pending {
    border: 1px solid var(--spectrum-notice-visual-color);
    border-radius: var(--spectrum-corner-radius-75);
    margin: 4px 0;
  }
  .pending > details.lick {
    border: 0;
    margin: 0;
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
`;
