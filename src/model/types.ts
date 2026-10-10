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
  thinking?: Thinking;
  frozen?: boolean;
  title?: string;
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
  agentId?: string;
  pid?: number;
  meta?: string;
  diff?: { before: string; after: string };
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

export type ErrorAction = 'retry' | 'settings' | 'change-model' | 'login' | 'drop-turn';

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
  | { type: 'sprinkle'; sprinkle: string }
  | { type: 'error'; message: string; detail?: string; action?: ErrorAction };

export type SendMode = 'send' | 'steer' | 'queue';
export type DeliveredAs = 'run' | 'steer' | 'follow-up';
export type MessageOrigin = 'user' | 'follower' | 'guest' | 'agent';

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  mode?: SendMode;
  queued?: boolean;
  from?: string;
  delivered?: DeliveredAs;
  origin?: MessageOrigin;
}

export type AssistantStatus = 'streaming' | 'done' | 'stopped' | 'error';

export interface Usage {
  input: number;
  output: number;
  cost: number;
  cacheRead?: number;
  cacheWrite?: number;
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
  severity?: 'warn' | 'error';
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
  frozen: readonly FrozenCone[];
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
  setThinking(agentId: string, thinking: Thinking): void;
  older(agentId: string, before: string): Promise<readonly Message[]>;
  commands(agentId: string): readonly SlashCommand[];
  ready(): Promise<void>;
  createScoop(parentId: string, name: string): Agent;
  frozen(): readonly FrozenCone[];
  freeze?(agentId: string): void;
  thaw(id: string): Agent | null;
  discard(id: string): void;
  rewind?(agentId: string, messageId: string): Promise<Outgoing | null>;
  drop?(agentId: string): Promise<void>;
  createCone?(name: string): Promise<Agent>;
}

export interface SlashCommand {
  name: string;
  description: string;
  kind?: 'prompt' | 'skill';
}

export type FrozenKind = 'cone' | 'scoop' | 'agent';

export interface FrozenCone {
  id: string;
  name: string;
  title: string;
  model: string;
  messages: number;
  frozenAt: number;
  kind?: FrozenKind;
  live?: boolean;
  thawedAs?: string;
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
  repo?: string;
}

export interface ChangesPort extends Subscribable<{ changes: readonly Change[] }> {
  changes(): readonly Change[];
  accept(path: string): void;
  revert(path: string): Promise<void>;
  unavailable?(): string | null;
}

export interface FileEvents {
  files: readonly FileEntry[];
  file: string;
  changes: readonly Change[];
  mounts: readonly string[];
}

export interface FilePort extends Subscribable<FileEvents> {
  list(): Promise<readonly FileEntry[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string, agentId?: string | null): Promise<void>;
  remove(path: string, agentId?: string | null): Promise<void>;
  changes(): readonly Change[];
  accept(path: string): void;
  revert(path: string): Promise<void>;
  mountFolder?(path?: string): Promise<string | null>;
  mounts?(): readonly string[];
  eject?(path: string): Promise<void>;
  needsFolder?(): readonly string[];
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

export type AccountStatus = 'connected' | 'expired' | 'disconnected' | 'signing-in';

export interface Account {
  id: string;
  provider: string;
  identity: string;
  status: AccountStatus;
  auth?: 'oauth' | 'api-key' | 'local';
  needs?: 'cors-free-transport';
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  kind?: 'chat' | 'classifier';
  reasoning?: boolean;
  tools?: boolean;
  images?: boolean;
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
  connect(id: string, secret?: string): Promise<void>;
  disconnect(id: string): void;
  cancel?(id: string): void;
}

export type MemoryTag = 'user' | 'feedback' | 'project';

export interface Memory {
  id: string;
  scope: string;
  section: string;
  title: string;
  body: string;
  tag: MemoryTag | null;
  updatedAt: number;
  source?: 'entry' | 'notes';
}

export interface MemoryScope {
  id: string;
  label: string;
  group?: 'cones' | 'roles';
}

export type MemoryDraft = Omit<Memory, 'id' | 'updatedAt' | 'source'> & { id?: string };

export interface MemoryEvents {
  memories: readonly Memory[];
}

export interface MemoryPort extends Subscribable<MemoryEvents> {
  list(): readonly Memory[];
  save(memory: MemoryDraft): Memory;
  remove(id: string): void;
  scopes?(): readonly MemoryScope[];
}

export type MonitorStatus = 'active' | 'idle' | 'warn' | 'error';

export interface MonitorVital {
  id: string;
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  series?: number[];
  ratio?: number;
}

export interface MonitorRow {
  name: string;
  meta: string;
  status: MonitorStatus;
  badges?: string[];
}

export interface MonitorSection {
  id: string;
  label: string;
  rows: MonitorRow[];
}

export interface MonitorAlert {
  id: string;
  title: string;
  detail: string;
  severity: 'warn' | 'error';
}

export interface MonitorSnapshot {
  vitals: MonitorVital[];
  alerts: MonitorAlert[];
  sections: MonitorSection[];
  updatedAt: number;
}

export interface MonitorEvents {
  snapshot: MonitorSnapshot;
}

export interface MonitorPort extends Subscribable<MonitorEvents> {
  snapshot(): MonitorSnapshot;
  resync(): void;
}

export interface Sprinkle {
  id: string;
  name: string;
  title: string;
  icon: string;
  agentId: string;
  html: string;
  inline?: boolean;
}

export interface SprinkleEvents {
  sprinkles: readonly Sprinkle[];
}

export type SprinkleMethod = 'readFile' | 'exists' | 'getState' | 'setState';

export interface SprinklePort extends Subscribable<SprinkleEvents> {
  list(): readonly Sprinkle[];
  send(id: string, payload: unknown): void;
  call?(id: string, method: SprinkleMethod, args: readonly unknown[]): Promise<unknown>;
}

export type TrayConnection =
  | 'offline'
  | 'connecting'
  | 'live'
  | 'stalled'
  | 'reconnecting'
  | 'error';
export type FloatKind =
  | 'npx'
  | 'sliccstart'
  | 'extension'
  | 'standalone'
  | 'cherry'
  | 'electron'
  | 'hosted';
export type TrayRole = 'none' | 'leader' | 'follower';

export interface Follower {
  id: string;
  name: string;
  device: 'browser' | 'phone' | 'extension';
  since: number;
}

export interface TrayStatus {
  name: string;
  kind: FloatKind;
  connection: TrayConnection;
  role: TrayRole;
  followers: Follower[];
  spent: number;
  rate: number;
  budget: { percent: number; window: 'daily' | 'weekly' | 'monthly'; resets: string };
  joinUrl: string;
}

export interface TrayEvents {
  status: TrayStatus;
}

export interface TrayPort extends Subscribable<TrayEvents> {
  status(): TrayStatus;
  reconnect(): void;
  disconnect(): void;
}

export type UpdateKind = 'bios' | 'kernel' | 'agent' | 'grammars' | 'global' | 'skills' | 'ui';
export type UpdateState =
  | 'current'
  | 'queued'
  | 'starting'
  | 'checking'
  | 'downloading'
  | 'linking'
  | 'installed'
  | 'available'
  | 'ready'
  | 'failed';
export type UpdateAction = 'retry' | 'restart-agent' | 'reload' | 'update-now';

export interface UpdateItem {
  id: string;
  label: string;
  kind: UpdateKind;
  state: UpdateState;
  progress: { phase: 'download' | 'link'; done: number; total: number } | null;
  from: string | null;
  to: string | null;
  checkedAt: number | null;
  error: string | null;
  actions: readonly UpdateAction[];
  log?: string;
}

export type PackageState =
  | 'available'
  | 'queued'
  | 'installing'
  | 'installed'
  | 'outdated'
  | 'updating'
  | 'removing'
  | 'failed';
export type PackageAction = 'install' | 'update' | 'remove' | 'retry';

export interface PackageItem {
  id: string;
  package: string;
  label: string;
  description: string;
  commands: readonly string[];
  requires?: readonly string[];
  notes?: readonly string[];
  state: PackageState;
  version: string | null;
  offered: string | null;
  size?: number;
  progress: { phase: 'download' | 'link'; done: number; total: number } | null;
  error: string | null;
  actions: readonly PackageAction[];
  log?: string;
}

export interface UpdatesEvents {
  items: readonly UpdateItem[];
  packages: readonly PackageItem[];
}

export interface UpdatesPort extends Subscribable<UpdatesEvents> {
  list(): readonly UpdateItem[];
  ready(): boolean;
  act(id: string, action: UpdateAction): Promise<void>;
  packages?(): readonly PackageItem[];
  actPackage?(id: string, action: PackageAction): Promise<void>;
}

export type NetworkRoute = 'proxy' | 'extension' | 'tailnet' | 'page';

export interface NetworkFailure {
  url: string;
  error: string;
  at: number;
}

export interface BrowserAutomation {
  via: 'extension' | 'proxy' | null;
  detail?: string;
  declined?: boolean;
}

export interface NetworkStatus {
  route: NetworkRoute | null;
  health: 'ok' | 'limited' | 'failing';
  detail: string | null;
  failures: readonly NetworkFailure[];
  extensionUrl?: string;
  browser?: BrowserAutomation;
  tailnet?: TailnetStatus;
}

export type TailnetState = 'off' | 'loading' | 'needs-login' | 'starting' | 'running' | 'failed';

export interface TailnetExitNode {
  id: string;
  name: string;
  online: boolean;
}

export interface TailnetStatus {
  state: TailnetState;
  detail?: string;
  loginUrl?: string;
  node?: { name: string; addresses: readonly string[] };
  exitNode?: string | null;
  exitNodes?: readonly TailnetExitNode[];
  autoExitNode?: boolean;
  shieldsUp?: boolean;
  peers?: number;
}

export interface NetworkPort extends Subscribable<{ network: NetworkStatus }> {
  status(): NetworkStatus;
  check?(): Promise<void>;
  setTailnet?(on: boolean): Promise<void>;
  setExitNode?(id: string | 'auto' | null): Promise<void>;
  submitAuthKey?(key: string): Promise<void>;
  logoutTailnet?(): Promise<void>;
}

export interface NoticeAction {
  id: string;
  label: string;
}

export interface Notice {
  id: string;
  tone: 'info' | 'warning';
  title: string;
  body: string;
  actions: readonly NoticeAction[];
}

export interface NoticesPort extends Subscribable<{ notices: readonly Notice[] }> {
  list(): readonly Notice[];
  act(id: string, action: string): Promise<void>;
  dismiss(id: string): void;
}

export interface SliccModel {
  agent: AgentPort;
  files: FilePort;
  terminals: TerminalPort;
  browser: BrowserPort;
  settings: SettingsPort;
  memory: MemoryPort;
  monitor: MonitorPort;
  sprinkles: SprinklePort;
  tray: TrayPort;
  updates?: UpdatesPort;
  network?: NetworkPort;
  changes?: ChangesPort;
  notices?: NoticesPort;
}
