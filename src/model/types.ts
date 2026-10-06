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

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  title: string;
  input: string;
  output: string;
  status: ToolStatus;
  paths: string[];
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; tool: ToolCall };

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: number;
}

export type AssistantStatus = 'streaming' | 'done' | 'stopped';

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  parts: MessagePart[];
  status: AssistantStatus;
  createdAt: number;
}

export type EventKind = 'webhook' | 'cron' | 'scoop' | 'compaction' | 'error';

export interface EventMessage {
  id: string;
  role: 'event';
  kind: EventKind;
  title: string;
  text: string;
  createdAt: number;
}

export type Message = UserMessage | AssistantMessage | EventMessage;

export interface AgentEvents {
  agents: readonly Agent[];
  active: string;
  message: { agentId: string; message: Message };
}

export interface AgentPort extends Subscribable<AgentEvents> {
  list(): readonly Agent[];
  active(): string;
  select(id: string): void;
  messages(agentId: string): readonly Message[];
  send(agentId: string, text: string): Promise<void>;
  stop(agentId: string): void;
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
