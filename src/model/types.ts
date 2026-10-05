import type { TerminalBackend } from '../backend.ts';
import type { Subscribable } from './emitter.ts';

export type AgentKind = 'cone' | 'scoop';
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'error';

export interface Agent {
  id: string;
  name: string;
  kind: AgentKind;
  parentId: string | null;
  status: AgentStatus;
  model: string;
  contextFill: number;
  unread: number;
}

export type ToolStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  title: string;
  input: string;
  output: string;
  status: ToolStatus;
  paths: string[];
  image?: string;
}

export type AttachmentKind = 'image' | 'text' | 'file' | 'secret';

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  url?: string;
  text?: string;
  path?: string;
  error?: string;
}

export type MediaKind = 'image' | 'video' | 'audio';

export interface Media {
  kind: MediaKind;
  src: string;
  alt: string;
  poster?: string;
  width?: number;
  height?: number;
}

export type CardTone = 'neutral' | 'informative' | 'positive' | 'notice' | 'negative';

export type ActionCard =
  | {
      variant: 'tool';
      title: string;
      badge: string;
      status: string;
      files: string[];
      tone: CardTone;
    }
  | {
      variant: 'pr';
      number: number;
      title: string;
      branch: string;
      checks: string;
      additions: number;
      deletions: number;
      files: number;
      tone: CardTone;
    }
  | { variant: 'light'; title: string; detail: string; tone: CardTone };

export type QuestionKind = 'yes-no' | 'choice' | 'text' | 'number' | 'date' | 'email';
export type QuestionState = 'open' | 'answered' | 'inert';

export interface Question {
  id: string;
  kind: QuestionKind;
  question: string;
  options: string[];
  state: QuestionState;
  answer?: string;
}

export type DelegationKind = 'feed' | 'scoop' | 'drop' | 'sprinkle';

export type ErrorAction = 'retry' | 'settings' | 'change-model' | 'login';

export interface CheckItem {
  text: string;
  tone?: CardTone;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; tool: ToolCall }
  | { type: 'media'; items: Media[] }
  | { type: 'card'; card: ActionCard }
  | { type: 'plan'; items: string[] }
  | { type: 'check'; items: CheckItem[] }
  | { type: 'diff'; path: string; before: string | null; after: string | null }
  | { type: 'question'; question: Question }
  | { type: 'delegation'; kind: DelegationKind; scoop: string; text: string }
  | { type: 'link'; url: string; title: string; description: string }
  | { type: 'error'; message: string; action?: ErrorAction };

export type SendMode = 'send' | 'steer' | 'queue';

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  mode?: SendMode;
  queued?: boolean;
  from?: string;
}

export type AssistantStatus = 'streaming' | 'done' | 'stopped' | 'error';

export interface Usage {
  input: number;
  output: number;
  cost: number;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  parts: MessagePart[];
  status: AssistantStatus;
  createdAt: number;
  model?: string;
  usage?: Usage;
}

export type SystemKind = 'compaction' | 'error' | 'notice';
export type CompactionState = 'summarizing' | 'summarized' | 'fallback' | 'discarded';

export interface SystemMessage {
  id: string;
  role: 'system';
  kind: SystemKind;
  text: string;
  createdAt: number;
  title?: string;
  trigger?: 'threshold' | 'overflow' | 'idle' | 'manual';
  state?: CompactionState;
  action?: ErrorAction;
}

export interface ToolMessage {
  id: string;
  role: 'tool';
  tool: ToolCall;
  createdAt: number;
}

export type LickChannel =
  | 'webhook'
  | 'cron'
  | 'sprinkle'
  | 'fswatch'
  | 'session-reload'
  | 'navigate'
  | 'discovery'
  | 'upgrade'
  | 'workflow'
  | 'bash'
  | 'jshd'
  | 'preview'
  | 'cherry'
  | 'scoop-notify'
  | 'scoop-idle'
  | 'scoop-wait'
  | 'sudo-request';

export type LickState = 'pending' | 'confirmed' | 'dismissed';

export interface LickMessage {
  id: string;
  role: 'lick';
  channel: LickChannel;
  title: string;
  text: string;
  createdAt: number;
  body?: string;
  count?: number;
  state?: LickState;
}

export type Message = UserMessage | AssistantMessage | SystemMessage | ToolMessage | LickMessage;

export interface Outgoing {
  text: string;
  attachments?: Attachment[];
  mode?: SendMode;
}

export interface AgentEvents {
  agents: readonly Agent[];
  active: string;
  message: { agentId: string; message: Message };
  messages: string;
}

export interface AgentPort extends Subscribable<AgentEvents> {
  list(): readonly Agent[];
  active(): string;
  select(id: string): void;
  messages(agentId: string): readonly Message[];
  send(agentId: string, input: string | Outgoing): Promise<void>;
  stop(agentId: string): void;
  busy(agentId: string): boolean;
  queue(agentId: string): readonly UserMessage[];
  unqueue(agentId: string, messageId: string): void;
  suggestion(agentId: string): string | null;
  answer(agentId: string, questionId: string, answer: string): void;
  resolveLick(agentId: string, messageId: string, state: Exclude<LickState, 'pending'>): void;
  compact(agentId: string): void;
  clear(agentId: string): void;
  setModel(agentId: string, model: string): void;
  createScoop(parentId: string, name: string): Agent;
}

export type FileKind = 'file' | 'directory';

export interface FileEntry {
  path: string;
  kind: FileKind;
  size: number;
  modified: number;
}

export type ChangeStatus = 'added' | 'modified' | 'deleted';

export interface Change {
  path: string;
  status: ChangeStatus;
  before: string | null;
  after: string | null;
  agentId: string | null;
}

export interface FileEvents {
  files: readonly FileEntry[];
  file: string;
  changes: readonly Change[];
}

export interface FilePort extends Subscribable<FileEvents> {
  list(): Promise<readonly FileEntry[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string, agentId?: string | null): Promise<void>;
  remove(path: string, agentId?: string | null): Promise<void>;
  changes(): readonly Change[];
  accept(path: string): void;
  revert(path: string): Promise<void>;
}

export interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  agentId: string | null;
}

export interface TerminalEvents {
  terminals: readonly TerminalInfo[];
}

export interface TerminalPort extends Subscribable<TerminalEvents> {
  list(): readonly TerminalInfo[];
  open(options?: { cwd?: string; agentId?: string | null }): TerminalInfo;
  close(id: string): void;
  backend(id: string): TerminalBackend;
}

export type TabStatus = 'loading' | 'complete';

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  status: TabStatus;
  agentId: string | null;
}

export interface BrowserEvents {
  tabs: readonly BrowserTab[];
  active: string | null;
}

export interface BrowserPort extends Subscribable<BrowserEvents> {
  list(): readonly BrowserTab[];
  active(): string | null;
  activate(id: string): void;
  open(url: string, agentId?: string | null): BrowserTab;
  navigate(id: string, url: string): void;
  close(id: string): void;
  screenshot(id: string): Promise<string>;
}

export type ColorScheme = 'light' | 'dark' | 'system';
export type Thinking = 'off' | 'low' | 'medium' | 'high';

export interface Settings {
  color: ColorScheme;
  model: string;
  thinking: Thinking;
  sendOnEnter: boolean;
  showThinking: boolean;
  diffStyle: 'unified' | 'split';
}

export type AccountStatus = 'connected' | 'expired' | 'disconnected';

export interface Account {
  id: string;
  provider: string;
  identity: string;
  status: AccountStatus;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export interface SettingsEvents {
  settings: Settings;
  accounts: readonly Account[];
}

export interface SettingsPort extends Subscribable<SettingsEvents> {
  get(): Settings;
  update(patch: Partial<Settings>): void;
  models(): readonly ModelOption[];
  accounts(): readonly Account[];
  connect(id: string): Promise<void>;
  disconnect(id: string): void;
}

export interface SliccModel {
  agent: AgentPort;
  files: FilePort;
  terminals: TerminalPort;
  browser: BrowserPort;
  settings: SettingsPort;
}
