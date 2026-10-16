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

export interface ToolNote {
  severity: 'error' | 'warn' | 'info';
  text: string;
}

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
  notes?: ToolNote[];
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
  expiresAt?: number;
}

export type Message = UserMessage | AssistantMessage | SystemMessage | ToolMessage | LickMessage;

export interface Outgoing {
  text: string;
  attachments?: Attachment[];
  mode?: SendMode;
}

export interface AgentHold {
  reason: 'waiting' | 'locked';
  held: number;
}

export interface AgentEvents {
  agents: readonly Agent[];
  active: string;
  message: { agentId: string; message: Message };
  messages: string;
  frozen: readonly FrozenCone[];
  hold: AgentHold | null;
  readOnly: string | null;
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
  toolLabel?(agentId: string, callIds: readonly string[]): Promise<string | null>;
  ready(): Promise<void>;
  createScoop(parentId: string, name: string): Agent;
  frozen(): readonly FrozenCone[];
  freeze?(agentId: string): void;
  thaw(id: string): Agent | null;
  discard(id: string): void;
  rewind?(agentId: string, messageId: string): Promise<Outgoing | null>;
  drop?(agentId: string): Promise<void>;
  createCone?(name: string): Promise<Agent>;
  hold?(): AgentHold | null;
  readOnly?(): string | null;
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
  commands?(): readonly string[];
}

export interface FileEvents {
  files: readonly FileEntry[];
  file: string;
  changes: readonly Change[];
  mounts: readonly string[];
}

export interface MountInfo {
  target: string;
  source?: string;
  type: string;
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
  mountInfo?(): readonly MountInfo[];
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
  controlled?: boolean;
  favicon?: string;
}

export type BrowserActionKind =
  | 'open'
  | 'goto'
  | 'back'
  | 'reload'
  | 'close'
  | 'select'
  | 'snapshot'
  | 'screenshot'
  | 'eval'
  | 'click'
  | 'fill'
  | 'type'
  | 'press'
  | 'scroll'
  | 'request';

export interface BrowserAction {
  id: string;
  tabId: string | null;
  agentId: string | null;
  kind: BrowserActionKind;
  target?: string;
  value?: string;
  length?: number;
  status: 'running' | 'done' | 'failed';
  error?: string;
  at: number;
}

export interface BrowserFrame {
  tabId: string;
  src: string;
  at: number;
}

export interface BrowserEvents {
  tabs: readonly BrowserTab[];
  active: string | null;
  action?: BrowserAction;
  frame?: BrowserFrame;
}

export interface BrowserPort extends Subscribable<BrowserEvents> {
  list(): readonly BrowserTab[];
  active(): string | null;
  activate(id: string): void;
  open(url: string, agentId?: string | null): BrowserTab;
  navigate(id: string, url: string): void;
  close(id: string): void;
  screenshot(id: string): Promise<string>;
  actions?(tabId?: string): readonly BrowserAction[];
  watch?(tabId: string, size?: { width: number; height: number }): () => void;
}

export type ColorScheme = 'light' | 'dark' | 'system';
export type Thinking = 'off' | 'low' | 'medium' | 'high';

export interface Settings {
  color: ColorScheme;
  model: string;
  thinking: Thinking;
  sendOnEnter: boolean;
  pushToTalk?: boolean;
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
  group?: 'providers' | 'mcp';
  secret?: 'api-key' | 'token';
  store?: 'vault';
  fields?: AccountField[];
}

export interface AccountField {
  name: string;
  label: string;
  required?: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  kind?: 'chat' | 'classifier';
  reasoning?: boolean;
  tools?: boolean;
  images?: boolean;
  default?: boolean;
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
  connect(id: string, secret?: string, fields?: Record<string, string>): Promise<void>;
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
  hint?: string;
}

export interface MonitorRow {
  id?: string;
  name: string;
  meta: string;
  status: MonitorStatus;
  badges?: string[];
  depth?: number;
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
  command?: string;
  commandLabel?: string;
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
  device: 'browser' | 'phone' | 'extension' | 'cli';
  since: number;
}

export interface TrayBudget {
  percent: number;
  window: 'daily' | 'weekly' | 'monthly';
  resets: string;
}

export interface TrayStatus {
  name: string;
  kind: FloatKind;
  connection: TrayConnection;
  role: TrayRole;
  followers: Follower[];
  spent?: number;
  rate?: number;
  budget?: TrayBudget;
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
export type PackageAction = 'install' | 'update' | 'remove' | 'retry' | 'unpin';

export interface PackagePin {
  base: string | null;
  range: string;
  project: string;
}

export interface PackageItem {
  id: string;
  package: string;
  label: string;
  description: string;
  commands: readonly string[];
  requires?: readonly string[];
  notes?: readonly string[];
  warnings?: readonly string[];
  state: PackageState;
  version: string | null;
  offered: string | null;
  size?: number;
  progress: { phase: 'download' | 'link'; done: number; total: number } | null;
  error: string | null;
  actions: readonly PackageAction[];
  log?: string;
  origin?: 'catalog' | 'user';
  pin?: PackagePin;
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

export type NetworkRoute = 'proxy' | 'extension' | 'tailnet' | 'page' | 'link';

export interface NetworkFailure {
  url: string;
  error: string;
  at: number;
}

export interface BrowserAutomation {
  via: 'extension' | 'proxy' | 'link' | null;
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
  links?: NetworkLinks;
  exit?: NetworkExit;
  leaders?: readonly Leader[];
}

export type LeaderState =
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'unlinked';

export interface Leader {
  id: string;
  name: string;
  hub: string;
  state: LeaderState;
  error?: string;
}

export type LinkMode = 'local' | 'remote';

export type LinkOffer = 'net' | 'http' | 'ssh';

export type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface RemoteControl {
  allowed: boolean;
  fixed?: boolean;
}

export type RemoteControlMode = 'prompt' | 'watch';

export type LinkKind = 'cli' | 'seven';

export type AccessKey = 'view' | 'control' | 'terminal';

export interface DeviceAccess {
  view?: boolean;
  control?: boolean;
  terminal?: boolean;
  fixed?: boolean;
}

export interface LinkedBrowser {
  runtime: string;
  name: string;
}

export interface LinkedDevice {
  id: string;
  name: string;
  host: string;
  address: string;
  mode: LinkMode;
  offers: readonly LinkOffer[];
  policy?: string;
  exit: boolean;
  state: LinkState;
  browsers?: readonly LinkedBrowser[];
  control?: RemoteControl;
  controlling?: RemoteControlMode;
  kind?: LinkKind;
  access?: DeviceAccess;
  asking?: boolean;
  terminals?: number;
  folders?: readonly LinkedFolder[];
}

export interface LinkedFolder {
  name: string;
  source: string;
  readonly: boolean;
  mounted?: string;
}

export interface NetworkLinks {
  joinUrl: string | null;
  joinCommand: string | null;
  followUrl?: string | null;
  devices: readonly LinkedDevice[];
  permission?: 'prompt' | 'denied' | null;
}

export type NetworkExit =
  | null
  | { kind: 'tailnet'; node: string | 'auto' }
  | { kind: 'link'; id: string };

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
  setExit?(exit: NetworkExit): Promise<void>;
  unlink?(id: string): Promise<void>;
  setRemoteControl?(id: string, allowed: boolean): Promise<void>;
  setAccess?(id: string, key: AccessKey, allowed: boolean): Promise<void>;
  rotateJoinUrl?(): Promise<void>;
  retryLinks?(): Promise<void>;
  mountFolder?(source: string): Promise<string>;
  ejectFolder?(source: string): Promise<void>;
  retryLeader?(id: string): Promise<void>;
  disconnectLeader?(id: string): Promise<void>;
  reconnectLeader?(id: string): Promise<void>;
  forgetLeader?(id: string): Promise<void>;
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
  dismissible?: false;
}

export interface NoticesPort extends Subscribable<{ notices: readonly Notice[] }> {
  list(): readonly Notice[];
  act(id: string, action: string): Promise<void>;
  dismiss(id: string): void;
}

export type ApprovalDecision = 'once' | 'always' | 'deny';

export interface ApprovalRequester {
  kind: 'agent' | 'user' | 'guest';
  name: string;
  agentId?: string;
  where?: string;
}

export interface ApprovalVerdict {
  decision: 'allow' | 'deny';
  reason: string;
}

export interface SudoApproval {
  id: string;
  kind: 'sudo';
  requester: ApprovalRequester;
  command: string;
  target?: string;
  cwd?: string;
  createdAt: number;
  expiresAt: number;
  always: boolean;
  alwaysScope?: 'cwd';
}

export interface GuestMessageApproval {
  id: string;
  kind: 'guest-message';
  requester: ApprovalRequester;
  agentId: string;
  agentName?: string;
  text: string;
  attachments?: readonly { name: string; mimeType: string; size: number }[];
  createdAt: number;
  expiresAt: number;
  always: false;
  verdict?: ApprovalVerdict;
}

export interface GuestToolApproval {
  id: string;
  kind: 'guest-tool';
  requester: ApprovalRequester;
  agentId: string;
  agentName?: string;
  tool: string;
  summary: string;
  createdAt: number;
  expiresAt: number;
  always: false;
  verdict?: ApprovalVerdict;
}

export type Approval = SudoApproval | GuestMessageApproval | GuestToolApproval;

export type ApprovalEnd = 'answered' | 'withdrawn' | 'expired';

export interface ApprovalsEvents {
  approvals: readonly Approval[];
  ended: { id: string; reason: ApprovalEnd };
}

export interface ApprovalsPort extends Subscribable<ApprovalsEvents> {
  list(): readonly Approval[];
  decide?(id: string, decision: ApprovalDecision, reason?: string): Promise<void>;
}

export type TabRole = 'owner' | 'follower' | 'connecting' | 'alone';

export type TabSkew = 'newer' | 'older';

export interface TabsState {
  role: TabRole;
  stalled: boolean;
  skew: TabSkew | null;
}

export interface TabsPort extends Subscribable<{ tabs: TabsState }> {
  state(): TabsState;
  reload(): void;
}

export type FollowLink = 'connecting' | 'connected' | 'reconnecting' | 'unlinked' | 'failed';

export interface FollowState {
  owner: string;
  link: FollowLink;
  access: DeviceAccess;
  name?: string;
  error?: string;
}

export interface FollowPort extends Subscribable<{ follow: FollowState }> {
  state(): FollowState;
  leave(): Promise<void>;
  retry?(): Promise<void>;
}

export type DeviceId = string;

export type RecordKind = 'secret' | 'grant' | 'model' | 'mcp';

export type RecordState = 'active' | 'inert' | 'removed';

export type RecordSource =
  | 'settings'
  | 'popup'
  | 'process'
  | `jerk:${string}@${DeviceId}`
  | `oauth:${string}`
  | `import:${string}`;

export type LockMode = 'auto' | 'passkey' | 'passphrase';

export type RequestKind = 'value' | 'oauth' | 'jerk-seal' | 'jerk' | 'unseal';

export type RequestState = 'pending' | 'done' | 'cancelled' | 'expired';

export type ErrorCode =
  | 'EINVAL'
  | 'ENOENT'
  | 'EACCES'
  | 'EEXIST'
  | 'EAGAIN'
  | 'ETIMEDOUT'
  | 'ENOTCONN'
  | 'ENOTSUP';

export interface VaultError {
  code: ErrorCode;
  message: string;
}

export type VaultFailure = Error & VaultError;

export type ExitName =
  | 'page'
  | 'proxy'
  | 'vault-direct'
  | 'local-proxy'
  | 'cli-v'
  | 'tailscale'
  | 'local-link'
  | `device:${DeviceId}`;

export type ExecGrant = boolean | { argv: string[][] };

export type ExecMode = false | 'any' | 'argv' | 'shell';

export interface Rule {
  domain: string;
  header: string;
  methods: string[];
  paths: string[];
}

export interface RefusedRule {
  secret: string;
  rule: Rule;
  reason: string;
}

export interface SecretView {
  name: string;
  kind: RecordKind;
  placeholder: string;
  state: RecordState;
  source: RecordSource;
  sourceDevice: DeviceId | null;
  provider?: string;
  account?: string;
  server?: string;
  settings?: Record<string, string>;
  domains: string[];
  rules: Rule[];
  exits?: ExitName[];
  exec: ExecMode | ExecGrant;
  execArgv?: string[][];
  createdAt: number;
  usedAt?: number;
  expiresAt?: number;
  removedAt?: number;
}

export interface PendingRequest {
  id: string;
  kind: RequestKind;
  name?: string;
  provider?: string;
  prompt?: string;
  uid: number;
  tag: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface ScrubState {
  needed: boolean;
  version: number;
  ready: boolean;
}

export type BackupReminder = 'due' | 'dismissed' | null;

export interface VaultStatus {
  version: string;
  protocol: 1;
  origin: string;
  locked: boolean;
  lock: LockMode;
  scrub?: ScrubState;
  waiting: PendingRequest[];
  notices?: number;
  exportedAt?: number | null;
  backupReminder?: BackupReminder;
}

export type Availability = 'connecting' | 'waiting' | 'locked' | 'ready';

export type Widening =
  | { kind: 'rule'; secret: string; rule: Rule }
  | { kind: 'methods'; secret: string; domain: string; methods: string[] }
  | { kind: 'paths'; secret: string; domain: string; paths: string[] }
  | { kind: 'exec'; secret: string; grant: ExecGrant }
  | { kind: 'exit'; secret: string; exit: ExitName }
  | { kind: 'limits'; field: string; from: number; to: number };

export type PolicyChange =
  | { kind: 'rule'; secret: string; rule: Rule; change: 'added' | 'removed' }
  | { kind: 'exec'; secret: string; from: ExecMode; to: ExecMode }
  | { kind: 'exits'; secret: string; from: ExitName[] | null; to: ExitName[] | null }
  | { kind: 'limits'; field: string; from: number; to: number };

export type PolicyFile = '/etc/fnox/config.toml' | '/etc/slicc/secrets-policy.toml';

export interface PolicyNotice {
  id: string;
  at: number;
  file: PolicyFile;
  sha256: string;
  widened: Widening[];
  acknowledged: boolean;
}

interface AuditBase {
  seq: number;
  id: string;
  at: number;
  name: string;
  uid: number | null;
  tag: string | null;
}

export interface InjectionEntry extends AuditBase {
  type: 'inject' | 'forward';
  domain: string;
  method: string;
  path: string;
  rule: Rule;
  exit: ExitName;
}

export interface RevealEntry extends AuditBase {
  type: 'materialize';
  grant?: ExecGrant;
  exec?: ExecMode;
  path: string;
  argv: string;
  argvSha256: string;
  cwd: string;
  pid: number;
  ppid: number;
  ticket: string;
  consumed: boolean;
}

export interface SealEntry extends AuditBase {
  type: 'seal';
  source: RecordSource;
  rotated: boolean;
}

export interface RemoveEntry extends AuditBase {
  type: 'remove' | 'restore';
}

export interface McpEntry extends AuditBase {
  type: 'mcp';
  server: string;
  domain: string;
  method: string;
  path: string;
  exit: ExitName;
}

export interface RefreshEntry extends AuditBase {
  type: 'refresh';
  grant?: string;
}

export interface PolicyEntry {
  type: 'policy';
  seq: number;
  id: string;
  at: number;
  file: PolicyFile;
  sha256: string;
  accepted: boolean;
  widened?: Widening[];
  changes?: PolicyChange[];
  warning?: string;
}

export type AuditEntry =
  | InjectionEntry
  | McpEntry
  | RevealEntry
  | SealEntry
  | RemoveEntry
  | RefreshEntry
  | PolicyEntry;

export interface AuditPage {
  audit: AuditEntry[];
  more: boolean;
  next?: number;
}

export interface ExitPolicyView {
  file: '/etc/slicc/secrets-policy.toml';
  sha256: string | null;
  restricted: { name: string; exits: ExitName[] }[];
}

export interface VaultList {
  secrets: SecretView[];
  notices?: PolicyNotice[];
  refused?: RefusedRule[];
  audit: AuditEntry[];
  auditMore: boolean;
  exits?: ExitPolicyView;
}

export interface SealResult {
  name: string;
  placeholder: string;
  state: RecordState;
}

export type ImportKind = 'bundle' | 'keepass' | 'six';

export interface ImportCandidate {
  name: string;
  kind?: RecordKind;
  exists: boolean;
  suggestedRules?: string;
  refused?: string;
}

export type ImportPick = string | { name: string; kind: RecordKind };

export type ImportResult =
  | { stage: 'pick'; candidates: ImportCandidate[] }
  | {
      stage: 'done';
      imported: SealResult[];
      skipped: string[];
      reasons?: Record<string, string>;
    };

export type PopupIntent =
  | { kind: 'unlock' }
  | { kind: 'protect' }
  | { kind: 'enter'; name: string; request?: string }
  | { kind: 'request'; request: string }
  | { kind: 'import'; format?: 'bundle' | 'keepass' | 'six' }
  | { kind: 'export' }
  | { kind: 'signin'; provider: string; request?: string }
  | { kind: 'manage'; name?: string };

export type PopupState = 'opened' | 'done' | 'cancelled' | 'closed' | 'blocked';

export interface PopupResult {
  name: string;
  placeholder: string;
  state: RecordState;
}

export interface ButtonConfig {
  intent: PopupIntent | 'auto';
  label?: string;
  size?: 's' | 'm' | 'l';
  variant?: 'accent' | 'primary' | 'secondary';
  treatment?: 'fill' | 'outline';
  quiet?: boolean;
  scale?: 'medium' | 'large';
  theme?: 'light' | 'dark';
  dir?: 'ltr' | 'rtl';
  lang?: string;
  disabled?: boolean;
}

export type ButtonMessage =
  | { type: 'slicc-vault'; v: 1; op: 'button'; button: ButtonConfig }
  | { type: 'slicc-vault'; v: 1; op: 'focus' };

export type ButtonEvent = { type: 'slicc-vault'; v: 1 } & (
  | { event: 'ready' }
  | { event: 'size'; width: number; height: number; inset: number }
  | { event: 'label'; label: string }
  | { event: 'focus'; direction: 'next' | 'previous' }
  | { event: 'popup'; intent: PopupIntent; state: PopupState; result?: PopupResult }
);

export interface VaultButton {
  element: HTMLElement;
  post(message: ButtonMessage): void;
  listen(listener: (event: ButtonEvent) => void): () => void;
}

export interface VaultEvents {
  status: VaultStatus;
  list: VaultList;
  notice: PolicyNotice;
  availability: Availability;
}

export interface PutOptions {
  kind?: 'secret' | 'model' | 'mcp';
  provider?: string;
  server?: string;
  settings?: Record<string, string>;
}

export interface VaultPort extends Subscribable<VaultEvents> {
  status(): VaultStatus | null;
  list(): VaultList | null;
  audit(before?: number, limit?: number): Promise<AuditPage>;
  acknowledge?(notice: string): Promise<void>;
  availability?(): Availability;
  put?(name: string, value: string, request?: string, options?: PutOptions): Promise<SealResult>;
  cancel?(request: string): Promise<RequestState>;
  remove?(name: string, kind?: RecordKind): Promise<SealResult>;
  restore?(name: string, kind?: RecordKind): Promise<SealResult>;
  import?(
    kind: ImportKind,
    bytes: Uint8Array,
    options?: { password?: string; pick?: ImportPick[] }
  ): Promise<ImportResult>;
  export?(passphrase: string): Promise<Uint8Array>;
  lock?(): Promise<void>;
  dismissBackupReminder?(): Promise<void>;
  button(): VaultButton;
}

export type GuestGate = 'user' | 'cone' | 'agent' | `scoop:${string}` | 'off';

export interface GuestGates {
  messages: GuestGate;
  tools: GuestGate;
}

export interface GuestSeat {
  id: string;
  label: string;
  agentId: string;
  createdAt: number;
  expiresAt: number | null;
  gates: GuestGates;
  connected: boolean;
  pending: number;
}

export interface GuestDraft {
  label: string;
  expiresAt: number | null;
  gates: GuestGates;
}

export interface GuestEvents {
  seats: readonly GuestSeat[];
  unavailable: string | null;
}

export interface GuestPort extends Subscribable<GuestEvents> {
  list(): readonly GuestSeat[];
  mint(agentId: string, draft: GuestDraft): Promise<{ seat: GuestSeat; url: string }>;
  revoke(id: string): Promise<void>;
  unavailable?(): string | null;
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
  tabs?: TabsPort;
  approvals?: ApprovalsPort;
  follow?: FollowPort;
  vault?: VaultPort;
  guests?: GuestPort;
}
