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
import '@adobe/spectrum-wc-icons/swc-icon-file.js';
import '@adobe/spectrum-wc-icons/swc-icon-file-text.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-lock.js';
import '@spectrum-web-components/help-text/sp-help-text.js';
import { css, html, nothing, type TemplateResult } from 'lit';
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
  Seat,
  SliccModel,
  SystemMessage,
  ToolCall,
  ToolMessage,
  ToolNote,
  ToolStatus,
  UserMessage,
} from '../model/types.ts';
import { ansi } from './ansi.ts';
import { fullCommand, toShow } from './command.ts';
import { guard } from './guard.ts';
import { markdown } from './markdown.ts';
import { signInText } from './sign-in.ts';
import type { ViewSet } from './view-state.ts';

export interface Handlers {
  color: 'light' | 'dark';
  model: SliccModel | null;
  readOnly: boolean;
  answer(questionId: string, answer: string): void;
  resolve(messageId: string, state: Exclude<LickState, 'pending'>): void;
  action(action: ErrorAction, messageId?: string, account?: string): void;
  login?(account: string, messageId: string): Login | undefined;
  cancelLogin?(account: string, messageId: string): void;
  dropping(messageId: string): number;
  open(path: string): void;
  show(surfaceId: string): void;
  suggest(text: string): void;
  owners?: ReadonlyMap<string, Owner>;
  agentId?: string;
  seat?: string;
  licks?: ViewSet;
  runs?: ViewSet;
  detail?: { has(id: string): boolean; toggle(id: string): void };
  commands?: {
    cut(id: string): boolean | undefined;
    has(id: string): boolean;
    toggle(id: string): void;
  };
}

export interface Login {
  state: 'idle' | 'signing-in' | 'connected';
  error?: string;
  cancel?: boolean;
  window?: boolean;
  waited?: boolean;
  provider?: string;
}

export interface Owner {
  id?: string;
  at: number;
  stamp?: boolean;
}

export type RunContext = Pick<Handlers, 'color' | 'model' | 'owners' | 'agentId' | 'runs'> & {
  anchor?: string;
};

export interface Joined {
  calls: ToolCall[];
  live: boolean;
}

export const alone: Joined = { calls: [], live: false };

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
}

const toolKinds: Array<ToolKind & { match: RegExp }> = [
  {
    id: 'mcp',
    match: /^mcp__/,
    one: 'MCP tool',
    many: 'MCP tools',
  },
  {
    id: 'command',
    match: /^(bash|shell|javascript)$/,
    one: 'command',
    many: 'commands',
  },
  {
    id: 'edit',
    match: /^(edit|edit_file|write_file)$/,
    one: 'edit',
    many: 'edits',
  },
  {
    id: 'read',
    match: /^(read|read_file|ls)$/,
    one: 'read',
    many: 'reads',
  },
  {
    id: 'search',
    match: /^(grep|glob|find|web_search)$/,
    one: 'search',
    many: 'searches',
  },
  {
    id: 'fetch',
    match: /^web_fetch$/,
    one: 'fetch',
    many: 'fetches',
  },
  {
    id: 'browser',
    match: /^browser/,
    one: 'browser step',
    many: 'browser steps',
  },
  {
    id: 'agent',
    match: /scoop|^send_message$/,
    one: 'agent step',
    many: 'agent steps',
  },
  {
    id: 'memory',
    match: /memory/,
    one: 'memory update',
    many: 'memory updates',
  },
];

const otherKind: ToolKind = {
  id: 'other',
  one: 'other tool',
  many: 'other tools',
};

export function toolKind(name: string): ToolKind {
  return toolKinds.find((kind) => kind.match.test(name)) ?? otherKind;
}

export function toolSummary(calls: readonly ToolCall[]): string {
  const counts = new Map<ToolKind, number>();
  for (const call of calls) {
    const kind = toolKind(call.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const named = sorted
    .slice(0, 2)
    .map(([kind, count]) => `${count} ${count === 1 ? kind.one : kind.many}`)
    .join(', ');
  const rest = sorted.slice(2).reduce((sum, [, count]) => sum + count, 0);
  return rest ? `${named} and ${rest} more` : named;
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

const signedIn = 'Signed in. Retry to send it again.';

function stopSigningIn(event: Event, handlers: Handlers, account: string, id: string): void {
  const main = (event.currentTarget as HTMLElement).nextElementSibling as HTMLElement;
  main.focus();
  handlers.cancelLogin?.(account, id);
}

function fixButton(
  fix: ErrorAction,
  item: { id?: string; account?: string },
  handlers: Handlers,
  login: Login | undefined
): TemplateResult {
  const id = item.id ?? '';
  const signing = login?.state === 'signing-in';
  const shown = login?.state === 'connected' ? 'retry' : fix;
  const cancel = signing && login.cancel;
  return html`${
    cancel
      ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="cancel-login" @click=${(event: Event) => stopSigningIn(event, handlers, item.account as string, id)}>Cancel</swc-button>`
      : nothing
  }<swc-button size="s" variant="secondary" fill-style="outline" data-action=${shown} ?pending=${signing} ?disabled=${handlers.readOnly} @click=${() => handlers.action(shown, item.id, item.account)}>${signing ? 'Signing in…' : actionLabel(shown, handlers, id)}</swc-button>`;
}

function errorCard(
  item: { id?: string; title: string; text?: string; action?: ErrorAction; account?: string },
  handlers: Handlers
): TemplateResult {
  const id = item.id ?? '';
  const fix = handlers.seat === undefined ? item.action : undefined;
  const login =
    fix === 'login' && item.account && !handlers.readOnly
      ? handlers.login?.(item.account, id)
      : undefined;
  const resolved = login?.state === 'connected';
  const signing = login?.state === 'signing-in' && login.window;
  const text = resolved ? signedIn : signing ? signInText(login.waited) : item.text;
  const title = resolved && login.provider ? `Signed in to ${login.provider} again.` : item.title;
  const failure = login?.state === 'idle' ? login.error : undefined;
  return html`<div class="error-card" role=${resolved ? nothing : 'alert'} aria-atomic=${resolved ? nothing : 'false'} data-id=${id || nothing} data-login=${login?.state ?? nothing}>
    ${resolved ? html`<swc-icon-info-circle class="icon" size="s" aria-hidden="true"></swc-icon-info-circle>` : html`<swc-icon-alert-diamond class="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond>`}
    ${resolved ? nothing : html`<span class="sr">Error: </span>`}<span class="lead">${title}</span>
    ${text ? html`<span class="detail" role=${login ? 'status' : nothing}>${text}</span>` : nothing}
    ${fix ? html`<div class="fix" aria-live="off">${fixButton(fix, item, handlers, login)}</div>` : nothing}
    ${
      failure
        ? html`<div class="help" data-error="login"><sp-help-text size="s" variant="negative" icon>${failure}</sp-help-text><swc-action-button size="s" quiet data-action="settings" @click=${() => handlers.action('settings', item.id, item.account)}>Open settings</swc-action-button></div>`
        : nothing
    }
  </div>`;
}

export function time(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function deadline(at: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(at);
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

function described(call: ToolCall, owner: Owner | undefined): boolean {
  return !!(
    call.diff ||
    call.input ||
    call.output ||
    call.notes?.length ||
    call.image ||
    call.meta ||
    owner
  );
}

const verdicts: Partial<Record<ToolStatus, string>> = { error: 'Failed', cancelled: 'Cancelled' };

function hosted(event: Event): boolean {
  return event.composedPath()[0] === event.currentTarget;
}

function openStep(event: Event, call: ToolCall, runs: ViewSet | undefined, key: string): void {
  if (!hosted(event)) return;
  const step = event.currentTarget as HTMLElement & { open: boolean };
  step.open = runs ? !runs.has(call.id) : !step.open;
  runs?.toggle(call.id, step.open);
  const status = step.closest('swc-response-status') as (HTMLElement & { open: boolean }) | null;
  if (!step.open || !status) return;
  status.open = true;
  runs?.toggle(key, true);
}

function openStatus(event: Event, runs: ViewSet | undefined, key: string): void {
  if (!hosted(event)) return;
  const status = event.currentTarget as HTMLElement & { open: boolean };
  status.open = !status.open;
  runs?.toggle(key, status.open);
}

export function step(
  call: ToolCall,
  context: RunContext,
  id?: string
): TemplateResult | TemplateResult[] {
  const kind = toolKind(call.name);
  const owner = context.owners?.get(call.id);
  const runs = context.runs;
  const verdict = verdicts[call.status];
  const label = `${headline(call)}${verdict ? ` · ${verdict}` : ''}`;
  const open = described(call, owner) && (runs?.has(call.id) ?? false);
  const toggle = described(call, owner)
    ? html`<button type="button" class="run-toggle" aria-expanded=${open ? 'true' : 'false'} aria-controls=${`detail-${call.id}`} @click=${() => runs?.toggle(call.id)}>${label}</button>`
    : label;
  const row = html`<swc-response-status-step id=${`run-${call.id}`} status=${stepStates[call.status]} data-id=${owner?.id ?? id ?? nothing} data-status=${call.status} data-tool=${call.name} data-kind=${kind.id} data-action="open-run" data-target=${call.id} ?data-open=${open} @click=${(event: Event) => openStep(event, call, runs, `status:${context.anchor ?? call.id}`)}><span slot="label">${toggle}</span></swc-response-status-step>`;
  if (!described(call, owner)) return row;
  return [
    row,
    html`<div class="call run-detail" id=${`detail-${call.id}`} role="listitem" aria-label=${label} data-target=${call.id} ?hidden=${!open}>
      ${body(call, context.color)}
      ${call.output ? html`<pre class="output">${ansi(call.output, call.status === 'running')}</pre>` : nothing}
      ${call.notes?.length ? notes(call.notes) : nothing}
      ${call.image ? html`<img class="shot" src=${call.image} alt=${call.title} />` : nothing}
      ${call.meta ? html`<span class="tool-meta">${call.meta}</span>` : nothing}
      ${owner ? html`<span class=${owner.stamp === false ? 'sr' : 'ran'}>Ran at ${when(owner.at)}</span>` : nothing}
    </div>`,
  ];
}

function headline(call: ToolCall): string {
  return guard(`${call.name} ${call.title}`.trim(), call.status === 'running');
}

type Phase = 'active' | 'complete' | 'stopped';

function phase(
  status: AssistantMessage['status'],
  calls: readonly ToolCall[],
  live: boolean,
  said = false
): Phase | null {
  if (status === 'stopped') return 'stopped';
  if (!calls.length) return status === 'streaming' && !said ? 'active' : null;
  return status === 'streaming' || live ? 'active' : 'complete';
}

function loader(calls: readonly ToolCall[]): string {
  const running = calls.findLast((call) => call.status === 'running');
  return running ? (toolLoaders[toolKind(running.name).id] ?? 'hourglass') : 'aiLogo';
}

function settled(calls: readonly ToolCall[]): string {
  return calls.length > 1 ? toolSummary(calls) : headline(calls[0] as ToolCall);
}

function tally(calls: readonly ToolCall[]): string {
  const count = (status: ToolStatus) => calls.filter((call) => call.status === status).length;
  const [failed, cancelled] = [count('error'), count('cancelled')];
  return [failed ? `${failed} failed` : '', cancelled ? `${cancelled} cancelled` : '']
    .filter(Boolean)
    .join(', ');
}

function caption(state: Phase, calls: readonly ToolCall[]): string {
  if (state === 'stopped') return '';
  if (state === 'complete') return settled(calls);
  const current = calls.findLast((call) => call.status === 'running') ?? calls.at(-1);
  return current ? headline(current) : 'Generating response';
}

function status(
  state: Phase | null,
  key: string,
  calls: ToolCall[],
  context: RunContext
): TemplateResult | typeof nothing {
  if (!state) return nothing;
  const text = caption(state, calls);
  const runs = context.runs;
  const anchor = calls[0]?.id ?? key;
  const open = `status:${anchor}`;
  return html`<swc-response-status slot="status" status=${state} loader=${loader(calls)} accessible-label="Tool calls" data-id=${key} data-action="open-cluster" ?open=${runs?.has(open) ?? false} @click=${(event: Event) => openStatus(event, runs, open)} @swc-response-status-toggle=${(event: CustomEvent<{ open: boolean }>) => runs?.toggle(open, event.detail.open)}>
    <slicc-status-label slot="label" .text=${text} .note=${tally(calls)} .state=${state} .calls=${calls} .agent=${context.agentId ?? ''} .model=${context.model}></slicc-status-label>
    ${calls.map((call) => step(call, { ...context, anchor }, key))}
  </swc-response-status>`;
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

const hostAnswers = html`<div class="hint" data-host-answers>The host answers this.</div>`;

function question(item: Question, handlers: Handlers): TemplateResult {
  const answer = (value: string) => handlers.answer(item.id, value);
  const guest = handlers.seat !== undefined && item.state === 'open';
  let body: TemplateResult;
  if (guest) {
    body = hostAnswers;
  } else if (item.state === 'answered') {
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
  return html`<div class="question decision" data-state=${item.state} data-kind=${item.kind} data-guest=${guest ? '' : nothing}>
    <div class="q">${item.question}</div>
    ${body}
  </div>`;
}

export function questionTurn(item: Question, handlers: Handlers): TemplateResult {
  return html`<swc-conversation-turn type="system" class="message decision-turn" tabindex="-1" data-id=${item.id} data-state=${item.state} data-pending=${item.state === 'open' && handlers.seat === undefined ? '' : nothing} accessible-label=${`Question: ${item.question}`} @click=${reveal} @keydown=${reveal}>${question(item, handlers)}</swc-conversation-turn>`;
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
      return html`<div class="text markdown">${markdown(entry.text)}</div>`;
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
        { title: entry.message, text: entry.detail, action: entry.action, account: entry.account },
        handlers
      );
  }
}

function silent(entry: MessagePart, showThinking: boolean): boolean {
  return (
    entry.type === 'question' ||
    (entry.type === 'thinking' && !showThinking) ||
    (entry.type === 'link' && !!host(entry.url))
  );
}

export function parts(
  entries: MessagePart[],
  handlers: Handlers,
  showThinking: boolean
): TemplateResult[] {
  return entries.flatMap((entry) =>
    entry.type === 'tool' || silent(entry, showThinking) ? [] : [part(entry, handlers)]
  );
}

export function toolTail(message: Message, showThinking: boolean): boolean {
  if (message.role === 'tool') return true;
  if (message.role !== 'assistant') return false;
  return message.parts.filter((entry) => !silent(entry, showThinking)).at(-1)?.type === 'tool';
}

export function toolOnly(message: Message, showThinking: boolean): ToolCall[] | null {
  if (message.role === 'tool') return [message.tool];
  if (message.role !== 'assistant' || (message.status !== 'done' && message.status !== 'streaming'))
    return null;
  if (message.parts.some((entry) => entry.type === 'question')) return null;
  const shown = message.parts.filter((entry) => !silent(entry, showThinking));
  if (shown.some((entry) => entry.type !== 'tool')) return null;
  if (!shown.length && message.status === 'done') return null;
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

export function mine(message: UserMessage, seat: Pick<Seat, 'id' | 'label'>): boolean {
  if (message.origin !== 'guest') return false;
  return message.seat === undefined ? message.from === seat.label : message.seat === seat.id;
}

function sender(message: UserMessage, seat?: Seat): string | undefined {
  if (seat === undefined) return message.from;
  if (mine(message, seat)) return undefined;
  return message.from ?? (message.origin === 'agent' ? undefined : 'the host');
}

export function user(message: UserMessage, stamp = true, seat?: Seat): TemplateResult {
  const delivered = message.delivered ?? (message.mode === 'steer' ? 'steer' : undefined);
  const agent = message.origin === 'agent';
  const from = sender(message, seat);
  const name = from ?? 'an agent';
  const who = agent ? name : from ? `From ${from}` : '';
  const label = agent ? `Request from ${name}` : from ? `Message from ${from}` : 'Your message';
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

const toolLoaders: Record<string, string> = {
  edit: 'pencil',
  read: 'page',
  search: 'mag',
  browser: 'eye',
};

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
  joined: Joined = alone,
  stamp = true
): TemplateResult {
  const calls = [
    ...message.parts.flatMap((entry) => (entry.type === 'tool' ? [entry.tool] : [])),
    ...joined.calls,
  ];
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
        ${status(
          phase(
            message.status,
            calls,
            joined.live,
            message.parts.some((entry) => entry.type !== 'tool' && !silent(entry, showThinking))
          ),
          message.id,
          calls,
          handlers
        )}
        ${parts(
          message.parts,
          {
            ...handlers,
            action: (action, _id, account) => handlers.action(action, message.id, account),
            login: (account) => handlers.login?.(account, message.id),
            cancelLogin: (account) => handlers.cancelLogin?.(account, message.id),
            dropping: () => handlers.dropping(message.id),
          },
          showThinking
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
  joined: Joined = alone,
  suggestion: string | null = null,
  stamp = true
): TemplateResult {
  const owners = new Map(context.owners);
  owners.set(message.tool.id, { at: message.createdAt, stamp });
  const calls = [message.tool, ...joined.calls];
  return html`<swc-conversation-turn type="system" class="message tool-message" accessible-label=${`Tool ${message.tool.name}`} data-id=${message.id}>
    <swc-system-message>${status(phase('done', calls, joined.live), message.id, calls, { ...context, owners })}${suggestion && context.suggest ? suggestions(suggestion, context as Pick<Handlers, 'suggest'>) : nothing}</swc-system-message>
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

const ended = new Set([
  'Nobody approved this in time.',
  'It was declined.',
  'It was withdrawn.',
  'It was approved.',
]);

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
  if (message.kind === 'notice' && handlers.seat !== undefined && ended.has(message.title ?? '')) {
    return event(
      'Notice',
      html`<div class="marker notice" role="note" data-id=${message.id} data-ended>
        <span class="line"></span>
        <span class="marker-text">${message.title === 'It was approved.' ? nothing : html`<span class="said" title=${message.text}>“${message.text}”</span> `}<span class="outcome">${message.title}</span></span>
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
        account: message.account,
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

export function pendingApproval(message: Message): boolean {
  return (
    message.role === 'lick' && message.channel === 'sudo-request' && message.state === 'pending'
  );
}

export function waiting(message: Message, now = Date.now()): boolean {
  const at = message.role === 'lick' ? message.expiresAt : undefined;
  return pendingApproval(message) && !(at !== undefined && at <= now);
}

function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const still = (): boolean => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function reveal(event: Event): void {
  if ((event.target as Element).closest('swc-button, swc-action-button, input, textarea')) return;
  if (
    event instanceof KeyboardEvent &&
    (event.key !== 'Enter' || event.target !== event.currentTarget)
  )
    return;
  show(event.currentTarget as HTMLElement);
}

export function show(turn: HTMLElement): void {
  const place = [
    ...(turn.getRootNode() as ParentNode).querySelectorAll<HTMLElement>('.ask-place'),
  ].find((candidate) => candidate.dataset.place === turn.dataset.id);
  const log = place?.closest<HTMLElement>('.log');
  if (!log) return;
  const end = Number.parseFloat(getComputedStyle(log).scrollPaddingBlockEnd) || 0;
  const at = (place as HTMLElement).getBoundingClientRect().top - log.getBoundingClientRect().top;
  log.scrollTo({
    top: log.scrollTop + at - log.clientHeight + end,
    behavior: still() ? 'auto' : 'smooth',
  });
}

export function askTimer(at: number, now = Date.now()): TemplateResult {
  const left = at - now;
  return html`<span class="timer" data-timer aria-hidden="true">${left <= 0 ? 'Timed out' : clock(left)}</span><span class="sr">${spokenLeft(left, at)}</span>`;
}

function spokenLeft(left: number, at: number): string {
  if (left <= 0) return 'Timed out';
  return left <= 60_000 ? 'Less than a minute left' : `Expires at ${deadline(at)}`;
}

function decide(message: LickMessage, handlers: Handlers, settled: boolean) {
  const commands = settled || !message.body ? undefined : handlers.commands;
  const full = commands?.has(message.id) ?? true;
  const cut = commands?.cut(message.id);
  const toggle =
    commands && (full || cut) ? fullCommand(full, () => commands.toggle(message.id)) : nothing;
  const actions = html`${commands && !full && cut ? html`<p class="allow-hint" data-allow-hint>${toShow}</p>` : nothing}<div class="decide">
    ${toggle}
    <swc-button size="s" variant="secondary" fill-style="outline" data-action="deny" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'dismissed')}>Deny</swc-button>
    ${full || cut === false ? html`<swc-button size="s" variant="accent" data-action="allow" ?disabled=${handlers.readOnly} @click=${() => handlers.resolve(message.id, 'confirmed')}>Allow</swc-button>` : nothing}
  </div>`;
  const command = message.body
    ? html`<pre class="command"><span class="lines" data-clamp=${full ? nothing : message.id}>${message.body}</span></pre>`
    : nothing;
  return { actions, command };
}

function decision(message: LickMessage, handlers: Handlers): TemplateResult {
  const at = message.expiresAt;
  const now = Date.now();
  const expired = at !== undefined && at <= now;
  const guest = handlers.seat !== undefined;
  const timer = at === undefined || (guest && !expired) ? nothing : askTimer(at, now);
  const settled = expired || guest;
  const { actions, command } = decide(message, handlers, settled);
  const detail = settled ? undefined : handlers.detail;
  const shown = !!detail?.has(message.id);
  const more = detail
    ? html`<swc-action-button size="s" quiet class="detail" data-action="ask-detail" aria-expanded=${shown ? 'true' : 'false'} accessible-label=${shown ? 'Hide details' : 'Show details'} @click=${() => detail.toggle(message.id)}><swc-icon-chevron-right slot="icon" class="chevron"></swc-icon-chevron-right></swc-action-button>`
    : nothing;
  return html`<swc-conversation-turn type="system" class="message decision-turn" tabindex="-1" accessible-label=${`Permission request from ${message.title}`} data-id=${message.id} data-pending=${settled ? nothing : ''} data-expired=${expired ? '' : nothing} data-detail=${shown ? '' : nothing} @click=${reveal} @keydown=${reveal}>
    <div class="decision" data-kind="approval">
      <div class="decision-head"><span class="who">${message.title}</span>${timer}${more}</div>
      <p class="decision-text">${message.text}</p>
      ${command}
      ${expired ? nothing : guest ? hostAnswers : actions}
    </div>
  </swc-conversation-turn>`;
}

const scoopWords: Record<string, string> = {
  completed: 'finished',
  failed: 'failed',
  stopped: 'stopped',
};

const scoopBracket = /^\[(?:scoop |@)[^\]\n]* (completed|failed|stopped)\][^\S\n]*(?:\n|$)/;

function scoopLine(message: LickMessage): [string, boolean, string, string] {
  const icon = lickIcons[message.channel];
  const [label] = lickLabels[message.channel];
  const bracket = message.channel === 'scoop-notify' && scoopBracket.exec(message.text);
  if (!bracket) return [message.text, false, icon, label];
  const name = message.title.replace(/\s*\([^)]*\)$/, '');
  const word = scoopWords[bracket[1]];
  if (bracket[1] === 'completed') return [`Scoop ${name} ${word}`, false, icon, label];
  return [`Scoop ${name} ${word}`, true, '❌', `Scoop ${word}`];
}

function lickBody(message: LickMessage): string | undefined {
  return message.channel === 'scoop-notify'
    ? (message.body ?? '').replace(scoopBracket, '').trim()
    : message.body;
}

function lickContent(
  message: LickMessage,
  body: string | undefined,
  handlers: Handlers
): TemplateResult {
  const scoop = message.channel === 'scoop-notify';
  const report = message.report;
  if (!scoop && !report) return html`<pre class="output">${body}</pre>`;
  const shown = !body
    ? nothing
    : scoop
      ? html`<div class="text">${markdown(body)}</div>`
      : html`<pre class="output">${body}</pre>`;
  return html`<div class="report">${shown}${report ? html`<swc-button size="s" variant="secondary" fill-style="outline" data-action="open-report" @click=${() => handlers.open(report)}>Open the report</swc-button>` : nothing}</div>`;
}

export function lick(message: LickMessage, handlers: Handlers, stamp = true): TemplateResult {
  if (pendingApproval(message)) return decision(message, handlers);
  const [line, failed, icon, label] = scoopLine(message);
  const severity = message.severity ?? (failed ? 'error' : undefined);
  const outcome =
    message.state === 'confirmed' ? 'Allowed' : message.state === 'dismissed' ? 'Denied' : '';
  const head = html`${severity ? html`<span class="sr">${severities[severity].prefix}</span>` : nothing}
    ${outcome ? html`<span class="sr">${outcome}. </span>` : nothing}
    <span class="text" data-summary=${message.summary ? '' : nothing}>${message.summary || line}</span>
    ${message.count && message.count > 1 ? html`<span class="times" title="Coalesced events">×${message.count}</span>` : nothing}`;
  const outcomeIcon =
    message.state === 'confirmed' ? '👍' : message.state === 'dismissed' ? '👎' : '';
  const reaction = html`<span class="reactions"><span class="reaction" title=${label} aria-hidden="true">${icon}</span>${outcomeIcon ? html`<span class="reaction" title=${outcome} aria-hidden="true">${outcomeIcon}</span>` : nothing}</span>`;
  const name = `${severity ? severities[severity].prefix : ''}${label} event`;
  const byline = html`<div class="meta">${severity ? html`<span class="severity-icon">${severities[severity].icon}</span>` : nothing}<span class="who">${message.title}</span>${stamp ? when(message.createdAt) : unseen(message.createdAt)}</div>`;
  const body = lickBody(message);
  if (!body && !message.report) {
    return outside(
      name,
      byline,
      html`<div class="lick-frame"><div class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${severity ?? nothing}><div class="lick-head">${head}</div></div>${reaction}</div>`
    );
  }
  const details = html`<details class="lick" data-id=${message.id} data-channel=${message.channel} data-severity=${severity ?? nothing} ?open=${handlers.licks?.has(message.id) ?? false} @toggle=${handlers.licks?.details(message.id) ?? nothing}>
    <summary class="lick-head">${head}<swc-icon-chevron-right class="chevron" size="s" aria-hidden="true"></swc-icon-chevron-right></summary>
    ${lickContent(message, body, handlers)}
  </details>`;
  return outside(name, byline, html`<div class="lick-frame">${details}${reaction}</div>`);
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
  .plan ol {
    padding-inline-start: var(--swc-spacing-400);
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
  swc-response-status {
    --_swc-response-status-label-line-size: var(--swc-line-height-font-size-100);
    --swc-response-status-label-max-lines: 1;
    --swc-response-status-step-detail-max-block-size: none;
    line-height: 0;
  }
  swc-response-status-step {
    line-height: var(--swc-line-height-200);
  }
  .run-toggle {
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .run-toggle:focus-visible {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    border-radius: var(--swc-corner-radius-75);
  }
  .run-detail {
    margin-inline-start: calc(var(--swc-spacing-300) + var(--swc-spacing-75) + var(--swc-spacing-85));
    margin-block-end: var(--swc-spacing-200);
    padding: var(--swc-spacing-100);
    border-radius: var(--swc-corner-radius-500);
    background: var(--swc-background-layer-1-color);
    color: var(--swc-neutral-content-color-default);
    line-height: var(--swc-line-height-200);
    min-inline-size: 0;
  }
  .call.run-detail[hidden] {
    display: none;
  }
  .call.run-detail > pre {
    white-space: pre;
    overflow-wrap: normal;
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
  .lick-head .text {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lick-head .text {
    flex: 1;
  }
  .lick-head .text[data-summary] {
    white-space: normal;
  }
  .lick .report {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--swc-spacing-200);
    padding: var(--swc-spacing-75) var(--swc-spacing-200) var(--swc-spacing-200);
    overflow-wrap: anywhere;
  }
  .lick .report .heading {
    font-size: inherit;
  }
  .lick .report > .text {
    align-self: stretch;
    max-block-size: calc(var(--swc-spacing-1000) * 4);
    overflow: auto;
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
  .question[data-state='open']:not([data-guest]) {
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
  .error-card[data-login='connected'] .icon {
    color: var(--swc-neutral-subdued-content-color-default);
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
  .error-card .fix {
    grid-column: 3;
    grid-row: 1 / span 2;
    display: flex;
    gap: var(--swc-spacing-100);
  }
  .error-card swc-button {
    white-space: nowrap;
  }
  .error-card .help {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--swc-spacing-50) var(--swc-spacing-100);
  }
  @container (inline-size < 480px) {
    .error-card {
      margin-inline: var(--swc-spacing-300);
    }
    .error-card .fix {
      flex-direction: column-reverse;
      align-items: flex-end;
    }
  }
  @container (inline-size < 360px) {
    .error-card .fix {
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
  .marker[data-ended] .marker-text {
    min-inline-size: 0;
    max-inline-size: 80%;
  }
  .marker[data-ended] .said {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marker[data-ended] .outcome {
    flex: none;
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
    flex-wrap: wrap;
    gap: var(--swc-spacing-85);
    padding: 0 var(--swc-spacing-100) var(--swc-spacing-100);
  }
  swc-conversation-turn.decision-turn {
    container-type: inline-size;
  }
  slicc-sprinkle[inline] {
    position: relative;
    inset-inline-start: 50%;
    inline-size: calc(100cqw + var(--swc-spacing-300) * 2);
    transform: translateX(-50%);
  }
  .decision-turn[data-pending] .decision {
    border-color: var(--swc-gray-300);
  }
  .decision-turn[data-pending]:focus-visible {
    outline: none;
  }
  .decision-turn[data-pending]:focus-visible .decision {
    outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
    outline-offset: var(--swc-focus-ring-gap);
  }
  .decision {
    display: flex;
    flex-direction: column;
    gap: var(--swc-spacing-100);
    margin-inline: var(--swc-spacing-700);
    padding: var(--swc-spacing-200) var(--swc-spacing-300);
    border: var(--swc-border-width-100) solid var(--swc-gray-200);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-background-layer-1-color);
    font-size: var(--swc-font-size-200);
  }
  .decision-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--swc-spacing-100);
    font-size: var(--swc-font-size-100);
  }
  .decision-head .who {
    font-weight: var(--swc-bold-font-weight);
  }
  .decision-head .detail {
    display: none;
  }
  .decision-turn[data-detail] .detail .chevron {
    transform: rotate(90deg);
  }
  .timer {
    color: var(--swc-neutral-subdued-content-color-default);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .decision-text {
    margin: 0;
  }
  .command {
    margin: 0;
    padding: var(--swc-spacing-75) var(--swc-spacing-100);
    border-radius: var(--swc-corner-radius-100);
    background: var(--swc-background-layer-2-color);
    font-size: var(--swc-font-size-75);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .decision .decide,
  .question.decision .options {
    justify-content: flex-end;
    padding: 0;
  }
  .decide .full-command {
    margin-inline-end: auto;
  }
  .decision .allow-hint {
    margin: 0;
    color: var(--swc-neutral-subdued-content-color-default);
    font-size: var(--swc-font-size-75);
  }
  .question.decision .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--swc-spacing-85);
  }
  @container (inline-size < 480px) {
    .decision {
      margin-inline: var(--swc-spacing-300);
    }
  }
`;
