import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/conversation-turn/swc-conversation-turn.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/message-sources/swc-message-sources.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/response-status/response-status-step/swc-response-status-step.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/response-status/swc-response-status.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/suggestion/swc-suggestion-group.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/suggestion-item/swc-suggestion-item.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/system-message/swc-system-message.js';
import '@adobe/spectrum-wc/patterns/ai-toolkit/user-message/swc-user-message.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-cancel.js';
import '@adobe/spectrum-wc-icons/swc-icon-checkmark-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-file.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-lock.js';
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
  ToolStatus,
  UserMessage,
} from '../model/types.ts';
import { markdown } from './markdown.ts';

export interface Handlers {
  color: 'light' | 'dark';
  model: SliccModel | null;
  readOnly: boolean;
  answer(questionId: string, answer: string): void;
  resolve(messageId: string, state: Exclude<LickState, 'pending'>): void;
  action(action: ErrorAction, messageId?: string): void;
  dropping(messageId: string): number;
  open(path: string): void;
  show(surfaceId: string): void;
  suggest(text: string): void;
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

const toolStates = {
  done: [
    'done',
    html`<swc-icon-checkmark-circle size="s" aria-hidden="true"></swc-icon-checkmark-circle>`,
  ],
  error: [
    'failed',
    html`<swc-icon-alert-diamond size="s" aria-hidden="true"></swc-icon-alert-diamond>`,
  ],
  cancelled: ['cancelled', html`<swc-icon-cancel size="s" aria-hidden="true"></swc-icon-cancel>`],
} as const;

const stepStates: Record<ToolStatus, string> = {
  running: 'active',
  done: 'complete',
  error: 'stopped',
  cancelled: 'stopped',
};

const actionLabels: Record<ErrorAction, string> = {
  retry: 'Retry',
  settings: 'Open settings',
  'change-model': 'Change model',
  login: 'Log in',
  'drop-turn': 'Drop the last turn',
};

function actionLabel(action: ErrorAction, handlers: Handlers, messageId: string): string {
  const count = action === 'drop-turn' ? handlers.dropping(messageId) : 1;
  return count > 1 ? `Drop ${count} failed turns` : actionLabels[action];
}

export function time(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function day(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function host(url: string): string | null {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.host : null;
  } catch {
    return null;
  }
}

function body(call: ToolCall, color: 'light' | 'dark'): TemplateResult {
  if (call.diff) {
    return html`<slicc-diff-view class="input" path=${call.paths[0] ?? call.title} color=${color} .oldText=${call.diff.before} .newText=${call.diff.after}></slicc-diff-view>`;
  }
  return html`<pre class="input">${call.name === 'bash' ? `$ ${call.input}` : call.input}</pre>`;
}

export function tool(call: ToolCall, color: 'light' | 'dark' = 'light'): TemplateResult {
  let state: TemplateResult;
  if (call.status === 'running') {
    state = html`<swc-progress-circle size="s" label="Running"></swc-progress-circle>`;
  } else {
    const [label, icon] = toolStates[call.status];
    state = html`<span class="state">${icon}${label}</span>`;
  }
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
      ${failed ? html`<span class="state failed">${toolStates.error[1]}${failed} failed</span>` : nothing}
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
        html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="answer" ?disabled=${handlers.readOnly} @click=${() => answer(option)}>${option}</swc-button>`
    )}</div>`;
  } else {
    const submit = (event: Event) => {
      event.preventDefault();
      const field = (event.currentTarget as HTMLElement).querySelector('input') as HTMLInputElement;
      if (field.value.trim()) answer(field.value.trim());
    };
    body = html`<form class="options" @submit=${submit}>
      <input class="input" type=${item.kind === 'email' ? 'email' : item.kind === 'number' ? 'number' : item.kind === 'date' ? 'date' : 'text'} aria-label=${item.question} ?disabled=${handlers.readOnly} />
      <swc-button size="s" variant="accent" data-action="answer" ?disabled=${handlers.readOnly} @click=${(event: Event) => (event.currentTarget as HTMLElement).closest('form')?.requestSubmit()}>Answer</swc-button>
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

function delegation(
  entry: Extract<MessagePart, { type: 'delegation' }>,
  handlers: Handlers
): TemplateResult {
  const model = handlers.model;
  let target: TemplateResult = html`<code>${entry.scoop}</code>`;
  if (entry.kind === 'sprinkle') {
    const sprinkle = model?.sprinkles
      .list()
      .find((item) => item.id === entry.scoop || item.name === entry.scoop);
    if (sprinkle) {
      target = html`<swc-action-button size="s" quiet data-action="open-sprinkle" data-target=${sprinkle.id} accessible-label=${`Open the ${entry.scoop} sprinkle`} @click=${() => handlers.show(`sprinkle:${sprinkle.id}`)}>${entry.scoop}</swc-action-button>`;
    }
  } else {
    const agent = model?.agent
      .list()
      .find((item) => item.id === entry.scoop || item.name === entry.scoop);
    if (agent) {
      target = html`<swc-action-button size="s" quiet data-action="open-scoop" data-target=${agent.id} accessible-label=${`Open the ${entry.scoop} chat`} @click=${() => model?.agent.select(agent.id)}>${entry.scoop}</swc-action-button>`;
    }
  }
  return html`<div class="delegation" data-kind=${entry.kind}><span aria-hidden="true">↳</span><strong>${delegationVerbs[entry.kind]}</strong>${target}<span>${entry.text}</span></div>`;
}

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
      return delegation(entry, handlers);
    case 'sprinkle':
      return html`<slicc-sprinkle inline .model=${handlers.model} sprinkle=${entry.sprinkle}></slicc-sprinkle>`;
    case 'link':
      return host(entry.url) ? nothing : html`<div class="link-text">${entry.title}</div>`;
    default:
      return html`<div class="error-card" role="alert">
        <div class="error-text"><span class="lead">${entry.message}</span>${entry.detail ? html`<span class="detail">${entry.detail}</span>` : nothing}</div>
        ${entry.action ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action=${entry.action} ?disabled=${handlers.readOnly} @click=${() => handlers.action(entry.action as ErrorAction)}>${actionLabel(entry.action, handlers, '')}</swc-button>` : nothing}
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

const attachmentIcons = {
  image: html`<swc-icon-file slot="thumbnail" aria-hidden="true"></swc-icon-file>`,
  text: html`<swc-icon-file-text slot="thumbnail" aria-hidden="true"></swc-icon-file-text>`,
  file: html`<swc-icon-file slot="thumbnail" aria-hidden="true"></swc-icon-file>`,
  secret: html`<swc-icon-lock slot="thumbnail" aria-hidden="true"></swc-icon-lock>`,
};

function attachment(item: Attachment): TemplateResult {
  const image = item.kind === 'image' && item.url && !item.error;
  const detail = item.error ? item.error : item.kind === 'secret' ? 'Secret' : size(item.size);
  return html`<swc-user-message type="card" class=${image ? 'attachment image' : 'attachment chip'} data-kind=${item.kind} ?data-error=${!!item.error} title=${item.error ?? item.path ?? item.name}>
    ${image ? html`<img slot="thumbnail" src=${item.url as string} alt="" />` : attachmentIcons[item.kind]}
    <span slot="title" class="name">${item.name}</span>
    <span slot="subtitle" class="size">${detail}</span>
  </swc-user-message>`;
}

const deliveries = { steer: 'Steered', 'follow-up': 'Follow-up' } as const;

export function user(message: UserMessage): TemplateResult {
  const delivered = message.delivered ?? (message.mode === 'steer' ? 'steer' : undefined);
  const tag = delivered === 'steer' || delivered === 'follow-up' ? deliveries[delivered] : null;
  const agent = message.origin === 'agent';
  const name = message.from ?? 'an agent';
  const who = agent ? name : message.from ? `From ${message.from}` : 'You';
  const label = agent
    ? `Request from ${name}`
    : message.from
      ? `Message from ${message.from}`
      : 'Your message';
  return html`<swc-conversation-turn type="user" class="message user" accessible-label=${label} data-id=${message.id} data-mode=${message.mode ?? 'send'} data-delivered=${delivered ?? 'run'} data-origin=${message.origin ?? 'user'}>
    <div class="bubble">
      <div class="meta">
        <span class="who">${who}</span><span>${time(message.createdAt)}</span>
        ${agent ? html`<swc-badge class="origin" size="s" variant="indigo">Agent</swc-badge>` : nothing}
        ${tag ? html`<swc-badge class="tag" size="s" variant=${delivered === 'steer' ? 'notice' : 'informative'} subtle>${tag}</swc-badge>` : nothing}
      </div>
      ${message.text ? html`<swc-user-message class="body"><span class="text">${message.text}</span></swc-user-message>` : nothing}
      ${message.attachments?.length ? html`<div class="attachments">${message.attachments.map(attachment)}</div>` : nothing}
    </div>
  </swc-conversation-turn>`;
}

function status(message: AssistantMessage): TemplateResult | typeof nothing {
  if (message.status === 'stopped') {
    return html`<swc-response-status slot="status" status="stopped"></swc-response-status>`;
  }
  if (message.status !== 'streaming') return nothing;
  const calls = message.parts.flatMap((entry) => (entry.type === 'tool' ? [entry.tool] : []));
  return html`<swc-response-status slot="status" status="active">
    ${calls.map((call) => html`<swc-response-status-step status=${stepStates[call.status]}><span slot="label">${call.name} ${call.title}</span></swc-response-status-step>`)}
  </swc-response-status>`;
}

function sources(entries: MessagePart[]): TemplateResult | typeof nothing {
  const links = entries.flatMap((entry) => {
    if (entry.type !== 'link') return [];
    const name = host(entry.url);
    return name ? [{ ...entry, host: name }] : [];
  });
  if (!links.length) return nothing;
  return html`<swc-message-sources slot="sources" label=${links.length === 1 ? 'Source' : `${links.length} sources`}>
    ${links.map((link) => html`<a class="link-card" href=${link.url} target="_blank" rel="noopener noreferrer" title=${link.description}>${link.title} · ${link.host}</a>`)}
  </swc-message-sources>`;
}

function suggestions(text: string | null, handlers: Handlers): TemplateResult | typeof nothing {
  if (!text) return nothing;
  return html`<swc-suggestion-group slot="suggestions" accessible-label="Suggested follow-up" @swc-suggestion=${() => handlers.suggest(text)}>
    <swc-suggestion-item data-action="suggestion">${text}</swc-suggestion-item>
  </swc-suggestion-group>`;
}

export function assistant(
  message: AssistantMessage,
  name: string,
  model: string,
  handlers: Handlers,
  showThinking: boolean,
  suggestion: string | null = null
): TemplateResult {
  const usage = message.usage
    ? `${message.usage.input.toLocaleString('en')} in · ${message.usage.output.toLocaleString('en')} out · $${message.usage.cost.toFixed(2)}`
    : '';
  return html`<swc-conversation-turn type="system" class="message assistant" accessible-label=${`Reply from ${name}`} data-id=${message.id} data-status=${message.status}>
    <div class="reply">
      <div class="meta">
        <span class="who">${name}</span><span>${time(message.createdAt)}</span>
        ${model ? html`<span title=${usage}>${model}</span>` : nothing}
        ${message.status === 'error' ? html`<swc-badge class="tag" size="s" variant="negative" subtle><swc-icon-alert-diamond slot="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond>Failed</swc-badge>` : nothing}
      </div>
      <swc-system-message>
        ${status(message)}
        ${parts(
          message.parts,
          {
            ...handlers,
            action: (action) => handlers.action(action, message.id),
            dropping: () => handlers.dropping(message.id),
          },
          showThinking,
          message.status === 'streaming'
        )}
        ${sources(message.parts)}
        ${suggestions(suggestion, handlers)}
      </swc-system-message>
    </div>
  </swc-conversation-turn>`;
}

export function toolMessage(
  message: ToolMessage,
  color: 'light' | 'dark' = 'light'
): TemplateResult {
  return html`<swc-conversation-turn type="system" class="message tool-message" accessible-label=${`Tool ${message.tool.name}`} data-id=${message.id}>
    <div class="reply">
      <div class="meta"><span class="who">Tool</span><span>${time(message.createdAt)}</span></div>
      ${tool(message.tool, color)}
    </div>
  </swc-conversation-turn>`;
}

function event(label: string, content: TemplateResult): TemplateResult {
  return html`<swc-conversation-turn type="system" class="event" accessible-label=${label}>${content}</swc-conversation-turn>`;
}

export function system(message: SystemMessage, handlers: Handlers): TemplateResult {
  if (message.kind === 'compaction') {
    const title = message.title ?? 'Context compacted';
    return event(
      title,
      html`<div class="marker" role="status" data-id=${message.id} data-state=${message.state ?? 'summarized'}>
        <span class="line"></span>
        <span class="marker-text">${title} · ${message.state === 'summarizing' ? html`<swc-progress-circle size="s" label="Summarizing"></swc-progress-circle>` : message.text}</span>
        <span class="line"></span>
      </div>`
    );
  }
  if (message.kind === 'notice') {
    return event(
      'Notice',
      html`<div class="notice" role="note" data-id=${message.id}><strong>${message.title}</strong> ${message.text}</div>`
    );
  }
  return event(
    'Error',
    html`<div class="error-card system-error" role="alert" data-id=${message.id}>
      <div class="error-text"><strong>${message.title}</strong><span>${message.text}</span></div>
      ${message.action ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action=${message.action} ?disabled=${handlers.readOnly} @click=${() => handlers.action(message.action as ErrorAction, message.id)}>${actionLabel(message.action, handlers, message.id)}</swc-button>` : nothing}
    </div>`
  );
}

const severities = {
  error: {
    prefix: 'Error: ',
    variant: 'negative',
    icon: html`<swc-icon-alert-diamond slot="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond>`,
  },
  warn: {
    prefix: 'Warning: ',
    variant: 'notice',
    icon: html`<swc-icon-alert-triangle slot="icon" size="s" aria-hidden="true"></swc-icon-alert-triangle>`,
  },
} as const;

function severityBadge(message: LickMessage, label: string): TemplateResult | null {
  if (!message.severity) return null;
  const { prefix, variant, icon } = severities[message.severity];
  return html`<span class="sr">${prefix}</span><swc-badge class="severity" size="s" variant=${variant} subtle>${icon}${label}</swc-badge>`;
}

export function lick(message: LickMessage, handlers: Handlers): TemplateResult {
  const [label, variant] = lickLabels[message.channel];
  const decide = message.channel === 'sudo-request' && message.state === 'pending';
  const outcome =
    message.state === 'confirmed' ? 'Allowed' : message.state === 'dismissed' ? 'Denied' : '';
  const head = html`${severityBadge(message, label) ?? html`<swc-badge class="channel" size="s" variant=${variant} subtle>${label}</swc-badge>`}
    <strong>${message.title}</strong>
    <span class="text">${message.text}</span>
    ${message.count && message.count > 1 ? html`<span class="times" title="Coalesced events">×${message.count}</span>` : nothing}
    ${outcome ? html`<swc-badge class="tag" size="s" variant=${message.state === 'confirmed' ? 'positive' : 'neutral'} subtle>${outcome}</swc-badge>` : nothing}
    <span class="when">${time(message.createdAt)}</span>`;
  const actions = decide
    ? html`<div class="decide">
        <swc-button size="s" variant="accent" data-action="allow" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'confirmed')}>Allow</swc-button>
        <swc-button size="s" variant="secondary" fill-style="outline" data-action="deny" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'dismissed')}>Deny</swc-button>
      </div>`
    : nothing;
  const name = `${message.severity ? severities[message.severity].prefix : ''}${label} event`;
  if (!message.body) {
    return event(
      name,
      html`<div class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${message.severity ?? nothing}><div class="lick-head">${head}</div>${actions}</div>`
    );
  }
  const details = html`<details class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${message.severity ?? nothing}>
    <summary class="lick-head"><span class="chevron" aria-hidden="true">▸</span>${head}</summary>
    <pre class="output">${message.body}</pre>
  </details>`;
  return event(name, decide ? html`<div class="pending">${details}${actions}</div>` : details);
}

export const messageCss = css`
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--swc-spacing-100);
    align-items: center;
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .meta .who {
    font-weight: 700;
    color: var(--swc-neutral-content-color-default);
  }
  .bubble,
  .reply {
    display: flex;
    flex-direction: column;
    gap: var(--swc-spacing-75);
    min-inline-size: 0;
  }
  .bubble {
    align-items: flex-end;
    max-inline-size: 100%;
  }
  .user[data-origin='agent'] .bubble {
    align-self: flex-start;
    align-items: flex-start;
  }
  .user[data-origin='agent'] swc-user-message.body {
    background: var(--swc-background-layer-1-color);
    border-color: var(--swc-gray-300);
  }
  swc-user-message.body {
    font-size: var(--swc-font-size-100);
  }
  swc-user-message.body .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .attachments {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--swc-spacing-85);
  }
  .attachment {
    font-size: var(--swc-font-size-75);
  }
  .attachment[data-error] {
    border-color: var(--swc-negative-visual-color);
  }
  .attachment[data-error] .size {
    color: var(--swc-negative-content-color-default);
  }
  .text p,
  .text ul,
  .text ol,
  .text .table,
  .text pre,
  .text blockquote {
    margin: var(--swc-spacing-85) 0;
  }
  .text > :first-child {
    margin-block-start: 0;
  }
  .text > :last-child {
    margin-block-end: 0;
  }
  .text ul,
  .text ol,
  .plan ol {
    padding-inline-start: var(--swc-spacing-350);
  }
  .text .heading {
    font-weight: 700;
    margin: var(--swc-spacing-200) 0 var(--swc-spacing-75);
  }
  .text img {
    max-inline-size: 100%;
    border-radius: var(--swc-corner-radius-100);
  }
  blockquote {
    border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
    padding-inline-start: var(--swc-spacing-200);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  hr {
    border: 0;
    border-block-start: var(--swc-border-width-100) solid var(--swc-gray-200);
  }
  li:has(> .task) {
    list-style: none;
    margin-inline-start: calc(-1 * var(--swc-spacing-350));
  }
  .task {
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .task[data-done='true'] {
    color: var(--swc-positive-color-1000);
  }
  code,
  pre {
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-75);
  }
  :not(pre) > code {
    background: var(--swc-gray-100);
    border-radius: var(--swc-corner-radius-75);
    padding: 0 var(--swc-spacing-50);
    overflow-wrap: anywhere;
  }
  pre {
    background: var(--swc-background-layer-1-color);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-100) var(--swc-spacing-200);
    overflow-x: auto;
    white-space: pre;
  }
  .table {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: var(--swc-font-size-75);
  }
  th,
  td {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    padding: var(--swc-spacing-50) var(--swc-spacing-100);
    text-align: start;
  }
  th {
    background: var(--swc-background-layer-1-color);
  }
  a {
    color: var(--swc-accent-content-color-default);
  }
  .thinking {
    color: var(--swc-neutral-subdued-content-color-default);
    font-style: italic;
    font-size: var(--swc-font-size-75);
    border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
    padding-inline-start: var(--swc-spacing-100);
  }
  details.tool,
  details.cluster,
  .lick {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-75);
  }
  details.cluster > details.tool {
    margin: var(--swc-spacing-75) var(--swc-spacing-100);
  }
  summary,
  .lick-head {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-100);
    padding: var(--swc-spacing-50) var(--swc-spacing-100);
    min-block-size: var(--swc-spacing-400);
    list-style: none;
  }
  summary {
    cursor: pointer;
    border-radius: var(--swc-corner-radius-100);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible,
  .diff-head:focus-visible,
  .input:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
  }
  .chevron {
    transition: transform var(--swc-animation-duration-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  details[open] > summary .chevron {
    transform: rotate(90deg);
  }
  .tool .name,
  .cluster .names {
    font-family: var(--swc-code-font-family-stack);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .title,
  .lick .text {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cluster .title {
    flex: none;
    font-weight: 700;
  }
  .cluster .names {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--swc-spacing-75);
    flex: none;
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .tool[data-status='done'] > summary .state {
    color: var(--swc-positive-color-1000);
  }
  .tool[data-status='error'] > summary .state,
  .state.failed {
    color: var(--swc-negative-content-color-default);
  }
  .tool-meta {
    flex: none;
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .tool > slicc-diff-view {
    display: block;
    margin: 0 var(--swc-spacing-100) var(--swc-spacing-100);
    max-block-size: 240px;
    overflow: auto;
  }
  .tool pre,
  .lick pre {
    margin: 0 var(--swc-spacing-100) var(--swc-spacing-100);
    max-block-size: 240px;
    overflow: auto;
  }
  .lick pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .shot {
    display: block;
    max-inline-size: calc(100% - 2 * var(--swc-spacing-100));
    margin: 0 var(--swc-spacing-100) var(--swc-spacing-100);
    border-radius: var(--swc-corner-radius-100);
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--swc-spacing-85);
  }
  .gallery .media {
    inline-size: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: var(--swc-corner-radius-100);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    background: var(--swc-gray-100);
  }
  .gallery .audio {
    grid-column: 1 / -1;
    inline-size: 100%;
  }
  .card {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-inline-start: var(--swc-border-width-400) solid var(--tone);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-85) var(--swc-spacing-200);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-75);
    --tone: var(--swc-gray-400);
    --tone-text: var(--swc-neutral-subdued-content-color-default);
  }
  [data-tone='informative'] {
    --tone: var(--swc-informative-visual-color);
    --tone-text: var(--swc-informative-color-1000);
  }
  [data-tone='positive'] {
    --tone: var(--swc-positive-visual-color);
    --tone-text: var(--swc-positive-color-1000);
  }
  [data-tone='notice'] {
    --tone: var(--swc-notice-visual-color);
    --tone-text: var(--swc-notice-color-1000);
  }
  [data-tone='negative'] {
    --tone: var(--swc-negative-visual-color);
    --tone-text: var(--swc-negative-content-color-default);
  }
  .card-head,
  .card-meta,
  .card.light {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-85);
  }
  .card-meta {
    margin-block-start: var(--swc-spacing-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .tone-text {
    color: var(--tone-text);
  }
  .pill {
    border-radius: var(--swc-corner-radius-1000);
    padding: 0 var(--swc-spacing-85);
    background: var(--swc-gray-200);
    font-size: var(--swc-font-size-75);
    font-weight: 700;
  }
  .add {
    color: var(--swc-positive-color-1000);
  }
  .del {
    color: var(--swc-negative-content-color-default);
  }
  .plan .label {
    font-size: var(--swc-font-size-75);
    font-weight: 700;
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .plan ol {
    margin: var(--swc-spacing-75) 0;
  }
  ul.check {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  ul.check li {
    display: flex;
    gap: var(--swc-spacing-85);
  }
  ul.check .mark {
    color: var(--tone);
    font-weight: 700;
  }
  .inline-diff {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    overflow: hidden;
  }
  .inline-diff slicc-diff-view {
    max-block-size: 260px;
    block-size: auto;
  }
  .diff-head {
    display: block;
    inline-size: 100%;
    margin: 0;
    padding: var(--swc-spacing-50) var(--swc-spacing-100);
    border: 0;
    border-block-end: var(--swc-border-width-100) solid var(--swc-gray-200);
    background: var(--swc-background-layer-1-color);
    color: var(--swc-accent-content-color-default);
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-75);
    text-align: start;
    cursor: pointer;
  }
  .diff-head:hover {
    text-decoration: underline;
  }
  .question {
    border: var(--swc-border-width-100) solid var(--swc-gray-300);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-100) var(--swc-spacing-200);
  }
  .question[data-state='open'] {
    border-color: var(--swc-accent-visual-color);
  }
  .question[data-state='inert'] {
    opacity: 0.6;
  }
  .question .q {
    font-weight: 700;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-85);
    margin-block-start: var(--swc-spacing-85);
  }
  .input {
    font: inherit;
    padding: var(--swc-spacing-75) var(--swc-spacing-100);
    border: var(--swc-border-width-100) solid var(--swc-gray-400);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-background-layer-2-color);
    color: inherit;
  }
  .answer {
    color: var(--swc-positive-color-1000);
    margin-block-start: var(--swc-spacing-75);
  }
  .hint {
    color: var(--swc-neutral-subdued-content-color-default);
    font-size: var(--swc-font-size-75);
    margin-block-start: var(--swc-spacing-75);
  }
  .delegation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-75);
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .delegation strong {
    color: var(--swc-neutral-content-color-default);
  }
  .error-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--swc-spacing-100);
    border: var(--swc-border-width-100) solid var(--swc-negative-visual-color);
    border-inline-start-width: var(--swc-border-width-400);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-85) var(--swc-spacing-200);
    font-size: var(--swc-font-size-75);
  }
  .error-card .error-text {
    display: grid;
    gap: var(--swc-spacing-50);
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .error-card .detail {
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .error-card swc-button {
    flex: none;
    white-space: nowrap;
  }
  .marker,
  .day {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-100);
    margin: var(--swc-spacing-100) 0;
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .marker-text {
    display: inline-flex;
    align-items: center;
    gap: var(--swc-spacing-75);
  }
  .marker .line,
  .day .line {
    flex: 1;
    block-size: var(--swc-border-width-100);
    background: var(--swc-gray-200);
  }
  .notice {
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
    text-align: center;
  }
  .lick {
    border-style: dashed;
  }
  .channel,
  .lick .severity {
    flex: none;
  }
  .lick strong {
    white-space: nowrap;
  }
  .lick[data-severity] {
    border-inline-start: var(--swc-border-width-400) solid var(--severity);
  }
  .lick[data-severity='error'] {
    --severity: var(--swc-negative-visual-color);
  }
  .lick[data-severity='warn'] {
    --severity: var(--swc-notice-visual-color);
  }
  .lick .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .lick .times,
  .lick .when {
    color: var(--swc-neutral-subdued-content-color-default);
    white-space: nowrap;
  }
  .decide {
    display: flex;
    gap: var(--swc-spacing-85);
    padding: 0 var(--swc-spacing-100) var(--swc-spacing-100);
  }
  .pending {
    border: var(--swc-border-width-100) solid var(--swc-notice-visual-color);
    border-radius: var(--swc-corner-radius-100);
  }
  .pending > details.lick {
    border: 0;
  }
  .pending > details.lick[data-severity] {
    border-inline-start: var(--swc-border-width-400) solid var(--severity);
  }
`;
