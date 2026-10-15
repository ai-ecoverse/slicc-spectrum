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
import '@adobe/spectrum-wc-icons/swc-icon-chevron-right.js';
import '@adobe/spectrum-wc-icons/swc-icon-cancel.js';
import '@adobe/spectrum-wc-icons/swc-icon-checkmark.js';
import '@adobe/spectrum-wc-icons/swc-icon-clock-pending.js';
import '@adobe/spectrum-wc-icons/swc-icon-code.js';
import '@adobe/spectrum-wc-icons/swc-icon-data.js';
import '@adobe/spectrum-wc-icons/swc-icon-edit.js';
import '@adobe/spectrum-wc-icons/swc-icon-file.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-globe-grid.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-lock.js';
import '@adobe/spectrum-wc-icons/swc-icon-plugin.js';
import '@adobe/spectrum-wc-icons/swc-icon-search.js';
import '@adobe/spectrum-wc-icons/swc-icon-tools.js';
import '@adobe/spectrum-wc-icons/swc-icon-user-group.js';
import '@adobe/spectrum-wc-icons/swc-icon-web-page.js';
import { createFileTreeIconResolver, getBuiltInSpriteSheet } from '@pierre/trees';
import { css, html, nothing, svg, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type {
  ActionCard,
  AssistantMessage,
  Attachment,
  CheckItem,
  CompactionState,
  ErrorAction,
  LickChannel,
  LickMessage,
  LickState,
  Media,
  Message,
  MessagePart,
  Question,
  SliccModel,
  SystemMessage,
  ToolCall,
  ToolMessage,
  ToolNote,
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
  owners?: ReadonlyMap<string, Owner>;
  agentId?: string;
}

export interface Owner {
  id?: string;
  at: number;
  stamp?: boolean;
}

export type RunContext = Pick<Handlers, 'color' | 'model' | 'owners' | 'agentId'>;

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

const toolStates: Record<ToolStatus, string> = {
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Cancelled',
};

const stepStates: Record<ToolStatus, string> = {
  running: 'active',
  done: 'complete',
  error: 'stopped',
  cancelled: 'stopped',
};

interface ToolKind {
  id: string;
  one: string;
  many: string;
  icon: TemplateResult;
}

const toolKinds: Array<ToolKind & { match: RegExp }> = [
  {
    id: 'mcp',
    match: /^mcp__/,
    one: 'MCP tool',
    many: 'MCP tools',
    icon: html`<swc-icon-plugin size="s" aria-hidden="true"></swc-icon-plugin>`,
  },
  {
    id: 'command',
    match: /^(bash|shell|javascript)$/,
    one: 'command',
    many: 'commands',
    icon: html`<swc-icon-code size="s" aria-hidden="true"></swc-icon-code>`,
  },
  {
    id: 'edit',
    match: /^(edit|edit_file|write_file)$/,
    one: 'edit',
    many: 'edits',
    icon: html`<swc-icon-edit size="s" aria-hidden="true"></swc-icon-edit>`,
  },
  {
    id: 'read',
    match: /^(read|read_file|ls)$/,
    one: 'read',
    many: 'reads',
    icon: html`<swc-icon-file-text size="s" aria-hidden="true"></swc-icon-file-text>`,
  },
  {
    id: 'search',
    match: /^(grep|glob|find|web_search)$/,
    one: 'search',
    many: 'searches',
    icon: html`<swc-icon-search size="s" aria-hidden="true"></swc-icon-search>`,
  },
  {
    id: 'fetch',
    match: /^web_fetch$/,
    one: 'fetch',
    many: 'fetches',
    icon: html`<swc-icon-globe-grid size="s" aria-hidden="true"></swc-icon-globe-grid>`,
  },
  {
    id: 'browser',
    match: /^browser/,
    one: 'browser step',
    many: 'browser steps',
    icon: html`<swc-icon-web-page size="s" aria-hidden="true"></swc-icon-web-page>`,
  },
  {
    id: 'agent',
    match: /scoop|^send_message$/,
    one: 'agent step',
    many: 'agent steps',
    icon: html`<swc-icon-user-group size="s" aria-hidden="true"></swc-icon-user-group>`,
  },
  {
    id: 'memory',
    match: /memory/,
    one: 'memory update',
    many: 'memory updates',
    icon: html`<swc-icon-data size="s" aria-hidden="true"></swc-icon-data>`,
  },
];

const otherKind: ToolKind = {
  id: 'other',
  one: 'other tool',
  many: 'other tools',
  icon: html`<swc-icon-tools size="s" aria-hidden="true"></swc-icon-tools>`,
};

export function toolKind(name: string): ToolKind {
  return toolKinds.find((kind) => kind.match.test(name)) ?? otherKind;
}

export function toolSummary(calls: ToolCall[]): string {
  const counts = new Map<ToolKind, number>();
  for (const call of calls) {
    const kind = toolKind(call.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${count} ${count === 1 ? kind.one : kind.many}`)
    .join(', ');
}

export function statusLabel(status: ToolStatus): string {
  return toolStates[status];
}

export function overall(calls: readonly ToolCall[]): [ToolStatus, string] {
  const count = (status: ToolStatus) => calls.filter((call) => call.status === status).length;
  const [running, failed, cancelled] = [count('running'), count('error'), count('cancelled')];
  const status: ToolStatus = running
    ? 'running'
    : failed
      ? 'error'
      : cancelled
        ? 'cancelled'
        : 'done';
  const label = [
    running ? 'Running' : '',
    failed ? `${failed} failed` : '',
    cancelled ? `${cancelled} cancelled` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return [status, label || 'Done'];
}

const glyphs: Record<ToolStatus, TemplateResult> = {
  running: html`<swc-icon-clock-pending size="xs"></swc-icon-clock-pending>`,
  done: html`<swc-icon-checkmark size="xs"></swc-icon-checkmark>`,
  error: html`<swc-icon-alert-diamond size="xs"></swc-icon-alert-diamond>`,
  cancelled: html`<swc-icon-cancel size="xs"></swc-icon-cancel>`,
};

type Target = { type: 'site'; host: string } | { type: 'file'; path: string };

const urlPattern = /\bhttps?:\/\/([a-z0-9.-]+)/i;
const hostPattern =
  /(?:^|[\s'"@=(])((?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|cloud|page|site|example|test|edu|gov)|localhost)(?=$|[\s'"/:)])/i;
const filePattern =
  /(?:^|[\s'"=(<>])((?:[\w.~-]*\/)*[\w-][\w.-]*\.[a-z][a-z0-9]{0,7})(?=$|[\s'"):,;<>|])/i;

export function target(command: string): Target | null {
  const site = urlPattern.exec(command)?.[1] ?? hostPattern.exec(command)?.[1];
  if (site) return { type: 'site', host: site.toLowerCase() };
  const path = filePattern.exec(command)?.[1];
  return path ? { type: 'file', path } : null;
}

const fileIcons = createFileTreeIconResolver({ set: 'complete', colored: false });
let sprite: Map<string, [string, string]> | undefined;

function fileIcon(path: string): TemplateResult {
  sprite ??= new Map(
    [
      ...getBuiltInSpriteSheet('complete').matchAll(
        /<symbol id="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g
      ),
    ].map((match) => [match[1], [match[2], match[3]]])
  );
  const [box, body] = sprite.get(fileIcons.resolveIcon('file-tree-icon-file', path).name) as [
    string,
    string,
  ];
  return html`<svg class="file-icon" viewBox=${box} aria-hidden="true">${svg`${unsafeSVG(body)}`}</svg>`;
}

function favicon(name: string, model: SliccModel | null): string | undefined {
  return model?.browser
    .list()
    .find((tab) => tab.favicon?.startsWith('data:') && sameHost(tab.url, name))?.favicon;
}

function sameHost(url: string, name: string): boolean {
  try {
    return new URL(url).hostname === name;
  } catch {
    return false;
  }
}

const globe = html`<swc-icon-globe-grid size="s" aria-hidden="true"></swc-icon-globe-grid>`;

export function chip(call: ToolCall, model: SliccModel | null = null): TemplateResult {
  const kind = toolKind(call.name);
  const found = kind.id === 'command' ? target(call.input) : null;
  let face = kind.icon;
  let source = kind.id;
  if (found?.type === 'site') {
    const src = favicon(found.host, model);
    face = src ? html`<img class="favicon" src=${src} alt="" />` : globe;
    source = src ? 'favicon' : 'site';
  } else if (found?.type === 'file') {
    face = fileIcon(found.path);
    source = 'file';
  }
  return html`<span class="chip" data-state=${call.status} data-icon=${source} data-target=${found ? (found.type === 'site' ? found.host : found.path) : nothing} aria-hidden="true"><span class="face">${face}</span><span class="glyph">${glyphs[call.status]}</span></span>`;
}

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

function errorCard(
  item: { id?: string; title: string; text?: string; action?: ErrorAction },
  handlers: Handlers
): TemplateResult {
  const id = item.id ?? '';
  const action = item.action
    ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action=${item.action} ?disabled=${handlers.readOnly} @click=${() => handlers.action(item.action as ErrorAction, item.id)}>${actionLabel(item.action, handlers, id)}</swc-button>`
    : nothing;
  return html`<div class="error-card" role="alert" data-id=${id || nothing}>
    <swc-icon-alert-diamond class="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond>
    <span class="sr">Error: </span><span class="lead">${item.title}</span>
    ${item.text ? html`<span class="detail">${item.text}</span>` : nothing}
    ${action}
  </div>`;
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

const stampGap = 2 * 60_000;

export function stamps(messages: readonly Message[]): Set<string> {
  const shown = new Set<string>();
  let last = -Infinity;
  let seen = '';
  for (const message of messages) {
    const label = day(message.createdAt);
    if (label !== seen) {
      seen = label;
      last = -Infinity;
    }
    if (message.role === 'system' || message.createdAt - last < stampGap) continue;
    shown.add(message.id);
    last = message.createdAt;
  }
  return shown;
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

function body(call: ToolCall, color: 'light' | 'dark'): TemplateResult | typeof nothing {
  if (call.diff) {
    return html`<slicc-diff-view class="diff" path=${call.paths[0] ?? call.title} color=${color} .oldText=${call.diff.before} .newText=${call.diff.after}></slicc-diff-view>`;
  }
  if (!call.input) return nothing;
  if (call.name === 'bash') {
    return html`<pre class="input"><span class="prompt">$ </span>${call.input}</pre>`;
  }
  return html`<pre class="input">${call.input}</pre>`;
}

const severityWords: Record<ToolNote['severity'], string> = {
  error: 'Error: ',
  warn: 'Warning: ',
  info: 'Note: ',
};

function notes(list: readonly ToolNote[]): TemplateResult {
  return html`<ul class="notes">${list.map(
    (note) =>
      html`<li data-note data-severity=${note.severity}>${
        note.severity === 'info'
          ? html`<swc-icon-info-circle size="s" aria-hidden="true"></swc-icon-info-circle>`
          : html`<swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>`
      }<span><span class="sr">${severityWords[note.severity]}</span>${note.text}</span></li>`
  )}</ul>`;
}

export interface CardOptions {
  open?: boolean;
  run?: boolean;
  owner?: Owner;
  model?: SliccModel | null;
  toggle?: (event: Event) => void;
}

export function tool(
  call: ToolCall,
  color: 'light' | 'dark' = 'light',
  options: CardOptions = {}
): TemplateResult {
  const kind = toolKind(call.name);
  const label = `${call.title}, ${statusLabel(call.status)}`;
  const content = html`<div class="call">
      ${body(call, color)}
      ${call.output ? html`<pre class="output">${call.output}</pre>` : nothing}
      ${call.notes?.length ? notes(call.notes) : nothing}
      ${call.image ? html`<img class="shot" src=${call.image} alt=${call.title} />` : nothing}
      ${call.meta ? html`<span class="tool-meta">${call.meta}</span>` : nothing}
      ${options.owner ? html`<span class=${options.owner.stamp === false ? 'sr' : 'ran'}>Ran at ${when(options.owner.at)}</span>` : nothing}
    </div>`;
  if (!options.run) {
    return html`<div class="tool" id=${`run-${call.id}`} role="region" aria-label=${label} data-id=${options.owner?.id ?? nothing} data-status=${call.status} data-tool=${call.name} data-kind=${kind.id}>${content}</div>`;
  }
  return html`<details class="tool run" id=${`run-${call.id}`} data-id=${options.owner?.id ?? nothing} data-status=${call.status} data-tool=${call.name} data-kind=${kind.id} ?open=${!!options.open} @toggle=${options.toggle ?? nothing}>
    <summary class="strip" aria-label=${label}>
      <span class="icons"><span class="run">${chip(call, options.model ?? null)}</span></span>
      <span class="label">${call.title}</span>
    </summary>
    ${content}
  </details>`;
}

export const clusterSize = 3;

function runs(calls: ToolCall[], handlers: RunContext): TemplateResult[] {
  const groups = calls.length >= clusterSize ? [calls] : calls.map((call) => [call]);
  return groups.map(
    (group) =>
      html`<slicc-tool-runs .calls=${group} .agent=${handlers.agentId ?? ''} .model=${handlers.model} .owners=${handlers.owners ?? null} .color=${handlers.color}></slicc-tool-runs>`
  );
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

function part(entry: Exclude<MessagePart, { type: 'tool' }>, handlers: Handlers): TemplateResult {
  switch (entry.type) {
    case 'text':
      return html`<div class="text">${markdown(entry.text)}</div>`;
    case 'thinking':
      return html`<div class="thinking">${entry.text}</div>`;
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
      return html`<slicc-sprinkle inline ?readonly=${handlers.readOnly} .model=${handlers.model} sprinkle=${entry.sprinkle}></slicc-sprinkle>`;
    case 'link':
      return html`<div class="link-text">${entry.title}</div>`;
    default:
      return errorCard(
        { title: entry.message, text: entry.detail, action: entry.action },
        handlers
      );
  }
}

function silent(entry: MessagePart, showThinking: boolean): boolean {
  return (
    (entry.type === 'thinking' && !showThinking) || (entry.type === 'link' && !!host(entry.url))
  );
}

export function parts(
  entries: MessagePart[],
  handlers: Handlers,
  showThinking: boolean,
  extra: ToolCall[] = []
): Array<TemplateResult | typeof nothing> {
  const out: Array<TemplateResult | typeof nothing> = [];
  let run: ToolCall[] = [];
  const flush = () => {
    out.push(...runs(run, handlers));
    run = [];
  };
  for (const entry of entries) {
    if (entry.type === 'tool') run.push(entry.tool);
    else if (!silent(entry, showThinking)) {
      flush();
      out.push(part(entry, handlers));
    }
  }
  run.push(...extra);
  flush();
  return out;
}

export function toolTail(message: Message, showThinking: boolean): boolean {
  if (message.role === 'tool') return true;
  if (message.role !== 'assistant') return false;
  return message.parts.filter((entry) => !silent(entry, showThinking)).at(-1)?.type === 'tool';
}

export function toolOnly(message: Message, showThinking: boolean): ToolCall[] | null {
  if (message.role === 'tool') return [message.tool];
  if (message.role !== 'assistant' || message.status !== 'done') return null;
  const shown = message.parts.filter((entry) => !silent(entry, showThinking));
  if (!shown.length || shown.some((entry) => entry.type !== 'tool')) return null;
  return shown.map((entry) => (entry as Extract<MessagePart, { type: 'tool' }>).tool);
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

function when(at: number, title: string = ''): TemplateResult {
  return html`<time class="when" datetime=${new Date(at).toISOString()} title=${title || nothing}>${time(at)}</time>`;
}

function unseen(at: number): TemplateResult {
  return html`<time class="sr" datetime=${new Date(at).toISOString()}>${time(at)}</time>`;
}

export function user(message: UserMessage, stamp = true): TemplateResult {
  const delivered = message.delivered ?? (message.mode === 'steer' ? 'steer' : undefined);
  const agent = message.origin === 'agent';
  const name = message.from ?? 'an agent';
  const who = agent ? name : message.from ? `From ${message.from}` : '';
  const label = agent
    ? `Request from ${name}`
    : message.from
      ? `Message from ${message.from}`
      : 'Your message';
  const remote = agent || (!!message.from && !people.has(message.origin ?? 'user'));
  return html`<swc-conversation-turn type="user" class="message user" accessible-label=${label} data-id=${message.id} data-mode=${message.mode ?? 'send'} data-delivered=${delivered ?? 'run'} data-origin=${message.origin ?? 'user'} data-remote=${remote ? '' : nothing}>
    <div class="bubble">
      ${byline(message, who, stamp)}${stamp ? nothing : unseen(message.createdAt)}
      ${message.text ? html`<swc-user-message class="body"><span class="text">${message.text}</span></swc-user-message>` : nothing}
      ${message.attachments?.length ? html`<div class="attachments">${message.attachments.map(attachment)}</div>` : nothing}
      ${remote ? html`<span class="reactions"><span class="reaction" aria-hidden="true">🤖</span></span>` : nothing}
    </div>
  </swc-conversation-turn>`;
}

const people = new Set(['follower', 'guest']);

function byline(
  message: UserMessage,
  who: string,
  stamp: boolean
): TemplateResult | typeof nothing {
  if (!who && !stamp) return nothing;
  return html`<div class="meta">
    ${who ? html`<span class="who">${who}</span>` : nothing}${stamp ? when(message.createdAt) : nothing}
    ${message.origin === 'agent' ? html`<swc-badge class="origin" size="s" variant="indigo">Agent</swc-badge>` : nothing}
  </div>`;
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

function suggestions(
  text: string | null,
  handlers: Pick<Handlers, 'suggest'>
): TemplateResult | typeof nothing {
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
  suggestion: string | null = null,
  extra: ToolCall[] = [],
  stamp = true
): TemplateResult {
  const usage = message.usage
    ? `${message.usage.input.toLocaleString('en')} in · ${message.usage.output.toLocaleString('en')} out · $${message.usage.cost.toFixed(2)}`
    : '';
  const failed = message.status === 'error';
  return html`<swc-conversation-turn type="system" class="message assistant" accessible-label=${`Reply from ${name}`} aria-description=${usage || nothing} data-id=${message.id} data-status=${message.status}>
    <div class="reply" title=${(!stamp && !model && usage) || nothing}>
      ${
        stamp || model || failed
          ? html`<div class="meta">
        ${stamp ? when(message.createdAt, model ? '' : usage) : nothing}
        ${model ? html`<span class="model" title=${usage}>${model}</span>` : nothing}
        ${failed ? html`<swc-badge class="tag" size="s" variant="negative" subtle><swc-icon-alert-diamond slot="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond>Failed</swc-badge>` : nothing}
      </div>`
          : nothing
      }${stamp ? nothing : unseen(message.createdAt)}
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
          extra
        )}
        ${sources(message.parts)}
        ${suggestions(suggestion, handlers)}
      </swc-system-message>
    </div>
  </swc-conversation-turn>`;
}

export function toolMessage(
  message: ToolMessage,
  context: RunContext & Partial<Pick<Handlers, 'suggest'>> = { color: 'light', model: null },
  extra: ToolCall[] = [],
  suggestion: string | null = null,
  stamp = true
): TemplateResult {
  const owners = new Map(context.owners);
  owners.set(message.tool.id, { at: message.createdAt, stamp });
  const shown = runs([message.tool, ...extra], { ...context, owners });
  return html`<swc-conversation-turn type="system" class="message tool-message" accessible-label=${`Tool ${message.tool.name}`} data-id=${message.id}>
    ${suggestion && context.suggest ? html`<swc-system-message>${shown}${suggestions(suggestion, context as Pick<Handlers, 'suggest'>)}</swc-system-message>` : shown}
  </swc-conversation-turn>`;
}

const compactionTitles: Record<CompactionState, string> = {
  summarizing: 'Context compacted',
  summarized: 'Context compacted',
  fallback: 'Compaction failed, transcript truncated',
  discarded: 'Context discarded',
};

function event(label: string, content: TemplateResult): TemplateResult {
  return html`<swc-conversation-turn type="system" class="event" accessible-label=${label}>${content}</swc-conversation-turn>`;
}

function outside(label: string, byline: TemplateResult, content: TemplateResult): TemplateResult {
  return html`<swc-conversation-turn type="user" class="event lick-turn" accessible-label=${label}><div class="bubble">${byline}${content}</div></swc-conversation-turn>`;
}

export function system(message: SystemMessage, handlers: Handlers): TemplateResult {
  if (message.kind === 'compaction') {
    const failed = message.state === 'fallback' || message.state === 'discarded';
    const title = message.title ?? compactionTitles[message.state ?? 'summarized'];
    return event(
      title,
      html`<div class="marker" role="status" data-id=${message.id} data-state=${message.state ?? 'summarized'}>
        <span class="line"></span>
        <span class="marker-text">${failed ? html`<swc-icon-alert-diamond class="fault" size="xs" aria-hidden="true"></swc-icon-alert-diamond>` : nothing}${title}${message.state === 'summarizing' ? html`<swc-progress-circle size="s" label="Summarizing"></swc-progress-circle>` : nothing}${message.text ? html`<span class="sr">. ${message.text}</span>` : nothing}</span>
        <span class="line"></span>
      </div>`
    );
  }
  if (message.kind === 'notice') {
    return event(
      'Notice',
      html`<div class="marker notice" role="note" data-id=${message.id}>
        <span class="line"></span>
        <span class="marker-text"><span>${message.title}</span> ${message.text}</span>
        <span class="line"></span>
      </div>`
    );
  }
  return event(
    'Error',
    errorCard(
      {
        id: message.id,
        title: message.title ?? 'Error',
        text: message.text,
        action: message.action,
      },
      handlers
    )
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

const lickIcons: Record<LickChannel, string> = {
  webhook: '🪝',
  cron: '⏰',
  sprinkle: '✨',
  fswatch: '👀',
  'session-reload': '🔄',
  navigate: '🧭',
  discovery: '🔎',
  upgrade: '⬆️',
  workflow: '📋',
  bash: '💻',
  jshd: '📜',
  preview: '👁️',
  cherry: '🍒',
  'scoop-notify': '✅',
  'scoop-idle': '💤',
  'scoop-wait': '⏳',
  'sudo-request': '🔐',
};

export function lick(message: LickMessage, handlers: Handlers, stamp = true): TemplateResult {
  const [label] = lickLabels[message.channel];
  const decide = message.channel === 'sudo-request' && message.state === 'pending';
  const outcome =
    message.state === 'confirmed' ? 'Allowed' : message.state === 'dismissed' ? 'Denied' : '';
  const head = html`${message.severity ? html`<span class="sr">${severities[message.severity].prefix}</span>` : nothing}
    ${outcome ? html`<span class="sr">${outcome}. </span>` : nothing}
    <span class="text">${message.text}</span>
    ${message.count && message.count > 1 ? html`<span class="times" title="Coalesced events">×${message.count}</span>` : nothing}`;
  const outcomeIcon =
    message.state === 'confirmed' ? '👍' : message.state === 'dismissed' ? '👎' : '';
  const reaction = html`<span class="reactions"><span class="reaction" title=${label} aria-hidden="true">${lickIcons[message.channel]}</span>${outcomeIcon ? html`<span class="reaction" title=${outcome} aria-hidden="true">${outcomeIcon}</span>` : nothing}</span>`;
  const actions = decide
    ? html`<div class="decide">
        <swc-button size="s" variant="accent" data-action="allow" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'confirmed')}>Allow</swc-button>
        <swc-button size="s" variant="secondary" fill-style="outline" data-action="deny" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'dismissed')}>Deny</swc-button>
      </div>`
    : nothing;
  const name = `${message.severity ? severities[message.severity].prefix : ''}${label} event`;
  const byline = html`<div class="meta">${message.severity ? html`<span class="severity-icon">${severities[message.severity].icon}</span>` : nothing}<span class="who">${message.title}</span>${stamp ? when(message.createdAt) : unseen(message.createdAt)}</div>`;
  if (!message.body) {
    return outside(
      name,
      byline,
      html`<div class="lick-frame"><div class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${message.severity ?? nothing}><div class="lick-head">${head}</div>${actions}</div>${reaction}</div>`
    );
  }
  const details = html`<details class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${message.severity ?? nothing}>
    <summary class="lick-head">${head}<swc-icon-chevron-right class="chevron" size="s" aria-hidden="true"></swc-icon-chevron-right></summary>
    <pre class="output">${message.body}</pre>
  </details>`;
  return outside(
    name,
    byline,
    html`<div class="lick-frame">${decide ? html`<div class="pending">${details}${actions}</div>` : details}${reaction}</div>`
  );
}

export const messageCss = css`
  swc-conversation-thread > .message,
  swc-conversation-thread > .event {
    margin-block-start: var(--swc-spacing-300);
  }
  swc-conversation-thread > .event + .event,
  swc-conversation-thread > :first-child,
  swc-conversation-thread > .day + * {
    margin-block-start: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--swc-spacing-50) var(--swc-spacing-100);
    align-items: baseline;
    font-size: var(--swc-font-size-75);
    line-height: var(--swc-line-height-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .meta .who {
    font-size: var(--swc-font-size-100);
    font-weight: 700;
    color: var(--swc-neutral-content-color-default);
  }
  .meta swc-badge {
    align-self: center;
  }
  .bubble,
  .reply {
    display: flex;
    flex-direction: column;
    gap: var(--swc-spacing-100);
    min-inline-size: 0;
  }
  .assistant swc-system-message {
    line-height: var(--swc-line-height-200);
  }
  swc-system-message > :not([slot]) + :not([slot]) {
    margin-block-start: var(--swc-spacing-100);
  }
  swc-system-message > .tool + .tool {
    margin-block-start: 0;
  }
  .text > :is(p, ul, ol, blockquote, .heading),
  .thinking,
  .plan,
  .delegation {
    max-inline-size: 72ch;
  }
  .bubble {
    align-items: flex-end;
    max-inline-size: 100%;
  }
  .user[data-origin='agent'] .bubble {
    align-self: flex-start;
    align-items: flex-start;
  }
  .user[data-remote] swc-user-message.body {
    background: light-dark(
      var(--swc-indigo-subtle-background-color-default),
      color-mix(in srgb, var(--swc-indigo-900) 8%, var(--swc-gray-50))
    );
    border-color: transparent;
  }
  .user[data-remote] .bubble {
    position: relative;
    margin-block-end: var(--swc-spacing-300);
  }
  .reactions {
    position: absolute;
    inset-block-end: calc(var(--swc-spacing-300) * -1);
    inset-inline-end: var(--swc-spacing-200);
    display: inline-flex;
    gap: var(--swc-spacing-50);
  }
  .reaction {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--swc-spacing-400);
    block-size: var(--swc-spacing-400);
    padding-inline: var(--swc-spacing-75);
    border-radius: calc(var(--swc-spacing-400) / 2);
    border: var(--swc-border-width-100) solid var(--swc-gray-300);
    background: var(--swc-background-layer-2-color);
    box-shadow: var(--swc-drop-shadow-emphasized-default-x) var(--swc-drop-shadow-emphasized-default-y)
      var(--swc-drop-shadow-emphasized-default-blur) var(--swc-drop-shadow-emphasized-default-color);
    font-size: var(--swc-font-size-100);
    line-height: 1;
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
    margin: var(--swc-spacing-200) 0;
  }
  .text ul,
  .text ol,
  .plan ol {
    padding-inline-start: var(--swc-spacing-400);
  }
  .text li + li,
  .text li > :is(ul, ol) {
    margin-block-start: var(--swc-spacing-75);
  }
  .text li > :is(ul, ol) {
    margin-block-end: 0;
  }
  .text .heading {
    font-weight: 700;
    line-height: var(--swc-line-height-100);
    margin: var(--swc-spacing-400) 0 var(--swc-spacing-100);
  }
  .text .heading[aria-level='3'] {
    font-size: var(--swc-font-size-400);
  }
  .text .heading[aria-level='4'] {
    font-size: var(--swc-font-size-300);
  }
  .text > :first-child {
    margin-block-start: 0;
  }
  .text > :last-child {
    margin-block-end: 0;
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
    margin-inline-start: calc(-1 * var(--swc-spacing-400));
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
    font-size: var(--swc-font-size-100);
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
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
    line-height: var(--swc-line-height-200);
    overflow-x: auto;
    white-space: pre;
  }
  .table {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: var(--swc-font-size-100);
  }
  th,
  td {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    padding: var(--swc-spacing-75) var(--swc-spacing-200);
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
    font-size: var(--swc-font-size-100);
    border-inline-start: var(--swc-border-width-200) solid var(--swc-gray-300);
    padding-inline-start: var(--swc-spacing-200);
  }
  details.tool,
  .runs {
    font-size: var(--swc-font-size-100);
    border-radius: var(--swc-corner-radius-100);
  }
  .lick {
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-700);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-200);
  }
  summary,
  .lick-head {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-100);
    padding: var(--swc-spacing-75) var(--swc-spacing-200);
    min-block-size: var(--swc-spacing-500);
    list-style: none;
  }
  summary {
    cursor: pointer;
    border-radius: var(--swc-corner-radius-100);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  details.tool > summary:hover,
  .runs button:hover {
    background: var(--swc-gray-100);
  }
  summary:focus-visible,
  .diff-head:focus-visible,
  input.input:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
  }
  .chevron {
    flex: none;
    transition: transform var(--swc-animation-duration-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  details[open] > summary .chevron {
    transform: rotate(90deg);
  }
  .lick .text,
  .runs .label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lick .text {
    flex: 1;
  }
  swc-system-message > slicc-tool-runs + slicc-tool-runs {
    margin-block-start: var(--swc-spacing-75);
  }
  slicc-tool-runs {
    display: block;
    container-type: inline-size;
  }
  .runs {
    --run-size: var(--swc-spacing-500);
    --run-gap: var(--swc-spacing-25);
    --run-icons: calc(5 * var(--run-size) + 4 * var(--run-gap));
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin-inline: var(--swc-spacing-700);
  }
  .strip {
    display: grid;
    grid-template-columns: var(--run-icons) minmax(0, 1fr);
    align-items: center;
    gap: var(--swc-spacing-50) var(--swc-spacing-200);
    min-block-size: 0;
    padding: var(--swc-spacing-50);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-500);
    background: var(--swc-background-layer-1-color);
    box-sizing: border-box;
  }
  details.run[open] > summary {
    margin-block-end: var(--swc-spacing-75);
  }
  .icons {
    display: flex;
    gap: var(--run-gap);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .icons > .run {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--run-size);
    block-size: var(--run-size);
  }
  .runs .label {
    block-size: var(--run-size);
    padding-inline: var(--swc-spacing-100);
    line-height: var(--run-size);
    text-align: end;
    font-weight: var(--swc-medium-font-weight);
  }
  .runs button {
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--swc-corner-radius-100);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .runs button:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
  }
  button.run[aria-expanded='true'] {
    background: var(--swc-accent-subtle-background-color-default);
  }
  @container (inline-size < 480px) {
    .runs {
      margin-inline: var(--swc-spacing-300);
    }
    .strip {
      grid-template-columns: minmax(0, 1fr);
    }
    .icons {
      inline-size: calc(
        round(down, 100% + var(--run-gap), var(--run-size) + var(--run-gap)) - var(--run-gap)
      );
    }
  }
  .cards {
    margin-block-start: var(--swc-spacing-75);
  }
  .cards[hidden],
  .cards > [hidden] {
    display: none;
  }
  .chip {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--swc-spacing-400);
    block-size: var(--swc-spacing-400);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-neutral-subtle-background-color-default);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .chip .face {
    display: inline-flex;
  }
  .chip :is(.file-icon, .favicon) {
    inline-size: var(--swc-workflow-icon-small);
    block-size: var(--swc-workflow-icon-small);
    fill: currentColor;
  }
  .chip[data-state='done'] .favicon,
  .chip[data-state='cancelled'] .favicon {
    filter: grayscale(1);
    opacity: 0.6;
  }
  .chip .glyph {
    position: absolute;
    inset-inline-end: calc(-1 * var(--swc-spacing-75));
    inset-block-end: calc(-1 * var(--swc-spacing-75));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--swc-spacing-300);
    block-size: var(--swc-spacing-300);
    border-radius: var(--swc-corner-radius-1000);
    background: var(--swc-background-layer-2-color);
  }
  .chip .glyph > * {
    --swc-icon-inline-size: calc(var(--swc-spacing-100) + var(--swc-spacing-50));
    --swc-icon-block-size: calc(var(--swc-spacing-100) + var(--swc-spacing-50));
  }
  .chip[data-state='running'] {
    background: var(--swc-accent-subtle-background-color-default);
    color: var(--swc-neutral-content-color-default);
  }
  .chip[data-state='running'] .face {
    animation: run-pulse var(--swc-animation-duration-2000) var(--swc-animation-ease-in-out) infinite;
  }
  .chip[data-state='error'] {
    background: var(--swc-negative-subtle-background-color-default);
    color: var(--swc-negative-content-color-default);
  }
  .chip[data-state='error'] .glyph {
    color: var(--swc-negative-content-color-default);
  }
  @keyframes run-pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip[data-state='running'] .face {
      animation: none;
    }
    .chip[data-state='running'] {
      outline: var(--swc-border-width-100) dashed var(--swc-neutral-content-color-default);
      outline-offset: calc(-1 * var(--swc-border-width-100));
    }
  }
  .call {
    display: flex;
    flex-direction: column;
    gap: var(--swc-spacing-100);
    padding-block: var(--swc-spacing-75) var(--swc-spacing-200);
  }
  .call:empty {
    display: none;
  }
  .call > :is(.ran, .tool-meta) {
    font-size: var(--swc-font-size-75);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .call > pre,
  .call > slicc-diff-view {
    display: block;
    margin: 0;
    max-block-size: calc(var(--swc-spacing-1000) * 2.5);
    overflow: auto;
  }
  .call > pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--swc-spacing-75);
    margin: var(--swc-spacing-100) 0 0;
    padding: 0;
    list-style: none;
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .notes li {
    display: flex;
    align-items: flex-start;
    gap: var(--swc-spacing-75);
    overflow-wrap: anywhere;
  }
  .notes swc-icon-alert-triangle,
  .notes swc-icon-info-circle {
    flex: none;
    margin-block-start: var(--swc-spacing-50);
  }
  .notes [data-severity='error'] {
    color: var(--swc-negative-content-color-default);
  }
  .call > pre.input:has(+ pre.output) {
    margin-block-end: calc(-1 * var(--swc-spacing-100));
    border-block-end: 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  .call > pre.input + pre.output {
    border-block-start-style: dashed;
    border-start-start-radius: 0;
    border-start-end-radius: 0;
  }
  .prompt {
    color: var(--swc-neutral-subdued-content-color-default);
    user-select: none;
  }
  .lick pre {
    margin: 0 var(--swc-spacing-100) var(--swc-spacing-100);
    max-block-size: calc(var(--swc-spacing-1000) * 2.5);
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .shot {
    display: block;
    max-inline-size: min(100%, calc(var(--swc-spacing-1000) * 5));
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
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-100);
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
    margin-block-start: var(--swc-spacing-100);
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
    font-size: var(--swc-font-size-100);
    font-weight: 700;
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .plan ol {
    margin: var(--swc-spacing-100) 0 0;
  }
  .plan li + li,
  ul.check li + li {
    margin-block-start: var(--swc-spacing-75);
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
    padding: var(--swc-spacing-75) var(--swc-spacing-200);
    border: 0;
    border-block-end: var(--swc-border-width-100) solid var(--swc-gray-200);
    background: var(--swc-background-layer-1-color);
    color: var(--swc-accent-content-color-default);
    font-family: var(--swc-code-font-family-stack);
    font-size: var(--swc-font-size-100);
    text-align: start;
    cursor: pointer;
  }
  .diff-head:hover {
    text-decoration: underline;
  }
  .question {
    border: var(--swc-border-width-100) solid var(--swc-gray-300);
    border-radius: var(--swc-corner-radius-100);
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
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
    gap: var(--swc-spacing-100);
    margin-block-start: var(--swc-spacing-200);
  }
  input.input {
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
    font-size: var(--swc-font-size-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .delegation strong {
    color: var(--swc-neutral-content-color-default);
  }
  .error-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--swc-spacing-50) var(--swc-spacing-200);
    margin-inline: var(--swc-spacing-700);
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .error-card .icon {
    grid-row: span 2;
    color: var(--swc-negative-visual-color);
  }
  .error-card .lead {
    grid-column: 2;
    font-weight: var(--swc-bold-font-weight);
    color: var(--swc-neutral-content-color-default);
  }
  .error-card .detail {
    grid-column: 2;
    overflow-wrap: anywhere;
  }
  .error-card swc-button {
    grid-column: 3;
    grid-row: span 2;
    white-space: nowrap;
  }
  @container (inline-size < 480px) {
    .error-card {
      margin-inline: var(--swc-spacing-300);
    }
  }
  @container (inline-size < 360px) {
    .error-card swc-button {
      grid-column: 2;
      grid-row: auto;
      justify-self: start;
    }
  }
  .marker,
  .day {
    display: flex;
    align-items: center;
    gap: var(--swc-spacing-200);
    font-size: var(--swc-font-size-100);
    color: var(--swc-neutral-subdued-content-color-default);
  }
  .day {
    margin: var(--swc-spacing-400) 0 var(--swc-spacing-100);
    font-size: var(--swc-font-size-75);
    font-weight: 700;
  }
  .day:first-child {
    margin-block-start: 0;
  }
  .marker-text {
    text-align: center;
    display: inline-flex;
    align-items: center;
    gap: var(--swc-spacing-75);
  }
  .marker-text .fault {
    color: var(--swc-negative-visual-color);
  }
  .marker .line {
    min-inline-size: var(--swc-spacing-300);
  }
  .marker .line,
  .day .line {
    flex: 1;
    block-size: var(--swc-border-width-100);
    background: var(--swc-gray-200);
  }
  .notice {
    font-size: var(--swc-font-size-100);
    color: var(--swc-neutral-subdued-content-color-default);
    text-align: center;
  }
  .lick-frame {
    position: relative;
    min-inline-size: 0;
    max-inline-size: 100%;
    margin-block-end: var(--swc-spacing-300);
  }
  .lick {
    border-style: dashed;
  }
  .severity-icon {
    display: inline-flex;
    align-self: center;
    color: var(--severity);
  }
  .lick-turn:has(.lick[data-severity='error']) {
    --severity: var(--swc-negative-visual-color);
  }
  .lick-turn:has(.lick[data-severity='warn']) {
    --severity: var(--swc-notice-visual-color);
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
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .lick .times {
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
    border-radius: var(--swc-corner-radius-700);
  }
  .pending > details.lick {
    border: 0;
  }
  .pending > details.lick[data-severity] {
    border-inline-start: var(--swc-border-width-400) solid var(--severity);
  }
`;
