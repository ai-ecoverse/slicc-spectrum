import type { Account, AgentHold, Message, SecretView, SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { type ApprovalScenario, DummyApprovals } from './approvals.ts';
import { type BrowserScenario, browserHistory, DummyBrowser, drive } from './browser.ts';
import { type ChangesScenario, DummyChanges } from './changes.ts';
import { type Clock, clock } from './clock.ts';
import type { BudgetScenario } from './extras.ts';
import * as extras from './extras.ts';
import { DummyFiles, type MountScenario } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummyFollow, type FollowScenario } from './follow.ts';
import { DummyGuests, type GuestsScenario } from './guests.ts';
import { DummyImport, type ImportScenario } from './import.ts';
import { DummyMemory } from './memory.ts';
import { agentSections, DummyMonitor } from './monitor.ts';
import {
  DummyNetwork,
  type LeadersScenario,
  type LinksScenario,
  type NetworkScenario,
  type TailnetScenario,
} from './network.ts';
import { DummyNotices, type NoticeScenario, readOnlyText, startingText } from './notices.ts';
import { providerAccounts, providerFixtures } from './providers.ts';
import {
  type DummyLogin,
  type DummyServers,
  DummySettings,
  type DummyTransport,
} from './settings.ts';
import { longAsk } from './showcase.ts';
import { DummySprinkles } from './sprinkles.ts';
import { DummyTabs, type TabsScenario } from './tabs.ts';
import { DummyTerminals } from './terminals.ts';
import { DummyTray } from './tray.ts';
import {
  type BetaScenario,
  DummyUpdates,
  type PackageConfirm,
  type PackageScenario,
  type UpdateScenario,
} from './updates.ts';
import { accountRecords, DummyVault, type VaultScenario } from './vault.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
  updates?: UpdateScenario;
  packages?: PackageScenario | 'off';
  confirm?: PackageConfirm;
  beta?: BetaScenario | 'off';
  mounts?: MountScenario | 'off';
  network?: NetworkScenario | 'off';
  tailnet?: TailnetScenario;
  links?: LinksScenario;
  leaders?: LeadersScenario;
  changes?: ChangesScenario;
  notices?: NoticeScenario | 'off';
  tabs?: TabsScenario | 'off';
  approvals?: ApprovalScenario | 'off';
  asks?: 'long' | 'off';
  follow?: FollowScenario | 'off';
  vault?: VaultScenario | 'off';
  guests?: GuestsScenario | 'off';
  accounts?: 'settings' | 'vault' | 'dual';
  providers?: 'connected' | 'none' | 'all';
  mcp?: 'moved' | 'states';
  servers?: DummyServers;
  transport?: DummyTransport;
  hold?: AgentHold['reason'] | 'off';
  readonly?: 'version' | 'off';
  agent?: 'ready' | 'starting' | 'waiting';
  browser?: BrowserScenario;
  sprinkles?: 'builtin' | 'cones';
  monitor?: 'dummy' | 'agent';
  import?: ImportScenario | 'off';
  login?: DummyLogin;
  budget?: BudgetScenario;
}

export interface DummyModel extends SliccModel {
  settings: DummySettings;
  browser: DummyBrowser;
  updates: DummyUpdates;
  network?: DummyNetwork;
  notices?: DummyNotices;
  tabs?: DummyTabs;
  approvals?: DummyApprovals;
  follow?: DummyFollow;
  vault?: DummyVault;
  guests?: DummyGuests;
}

export function vaultAccounts(accounts: readonly Account[]): Account[] {
  return accounts.map((account) =>
    account.auth === 'api-key' || account.id === 'github'
      ? { ...account, store: 'vault' as const }
      : account
  );
}

export const docsUrl = 'https://docs.example/mcp';
export const movedDocs = 'https://docs.eu.example/mcp';

function hinted(login?: DummyLogin): boolean {
  return login === 'code' || login === 'url' || login === 'lookalike';
}

function signInChat(
  conversations: Record<string, Message[]>,
  login?: DummyLogin
): Record<string, Message[]> {
  if (!hinted(login)) return conversations;
  return {
    ...conversations,
    'cone-kitchen': conversations['cone-kitchen'].map((message) =>
      message.id === 'k-s3'
        ? {
            ...message,
            account: 'openai-codex',
            text: 'The OpenAI Codex session expired. Log in again to continue.',
          }
        : message
    ),
  };
}

function settingsAccounts(
  accounts: 'settings' | 'vault' | 'dual',
  providers: 'connected' | 'none' | 'all',
  transport?: DummyTransport,
  mcp?: 'moved' | 'states'
): Account[] {
  const rows = listedAccounts(accounts, providers, transport).map((account) =>
    mcp === 'moved' && account.id === 'mcp:docs' ? { ...account, url: movedDocs } : account
  );
  return mcp === 'states' ? [...rows, ...fixtures.serverStates] : rows;
}

function listedAccounts(
  accounts: 'settings' | 'vault' | 'dual',
  providers: 'connected' | 'none' | 'all',
  transport?: DummyTransport
): Account[] {
  const all =
    accounts === 'settings'
      ? fixtures.accounts
      : [
          ...vaultAccounts(fixtures.accounts),
          ...(accounts === 'dual' ? [fixtures.dualAccount] : []),
        ];
  if (providers === 'all') return providerAccounts(all, transport === 'none' ? 'none' : undefined);
  return all.map((account) =>
    providers === 'none' && account.group !== 'mcp'
      ? { ...account, status: 'disconnected' as const, identity: '' }
      : account
  );
}

function vaultRecords(
  accounts: 'settings' | 'vault' | 'dual',
  mcp?: 'moved' | 'states'
): SecretView[] {
  if (accounts === 'settings') return [];
  return accountRecords(Date.now(), mcp === 'moved' ? docsUrl : undefined);
}

function guestsPort(guests: GuestsScenario | 'off', time: Clock): { guests?: DummyGuests } {
  return guests === 'off' ? {} : { guests: new DummyGuests(guests, time) };
}

function importPort(scenario: ImportScenario | 'off', agent: DummyAgent, time: Clock): void {
  if (scenario === 'off') return;
  const port = new DummyImport(scenario, agent, time);
  agent.importProfile = port.importProfile.bind(port);
  agent.importCancel = port.importCancel.bind(port);
  agent.importing = port.importing.bind(port);
}

function noticesPort(
  agent: DummyAgent,
  time: Clock,
  notices: NoticeScenario | 'off',
  readonly: 'version' | 'off',
  arrival: 'ready' | 'starting' | 'waiting'
): DummyNotices | null {
  if (readonly !== 'off') agent.setReadOnly(readOnlyText);
  if (arrival !== 'ready') agent.withhold(startingText, arrival === 'starting' ? 100 : undefined);
  const notice = readonly !== 'off' ? 'readonly' : arrival !== 'ready' ? 'starting' : notices;
  const port = notice === 'off' ? null : new DummyNotices(notice, time);
  if (port && readonly !== 'off') agent.on('readOnly', (text) => port.readOnly(Boolean(text)));
  if (port && arrival !== 'ready') agent.on('starting', (line) => port.starting(Boolean(line)));
  return port;
}

export function createDummyModel({
  delay = 30,
  storage = null,
  updates = 'current',
  packages = 'off',
  confirm,
  beta = 'off',
  mounts = 'off',
  network = 'limited',
  tailnet,
  links,
  leaders,
  changes = 'files',
  notices = 'off',
  tabs = 'off',
  approvals = 'off',
  asks = 'off',
  follow = 'off',
  vault = 'off',
  guests = 'off',
  accounts = 'settings',
  providers = 'connected',
  mcp,
  servers = 'owner',
  transport,
  hold = 'off',
  readonly = 'off',
  agent: arrival = 'ready',
  browser: scenario = 'idle',
  sprinkles = 'builtin',
  monitor = 'dummy',
  import: imports = 'off',
  login,
  budget = 'plain',
}: DummyOptions = {}): DummyModel {
  const time = clock(delay);
  const mount =
    mounts === 'off'
      ? null
      : { scenario: mounts, point: fixtures.mountPoint, files: fixtures.mounted };
  const pending = changes === 'git' ? [...fixtures.pending, fixtures.skillEdit] : fixtures.pending;
  const files = new DummyFiles(fixtures.files, fixtures.directories, pending, time, mount);
  const browser = new DummyBrowser(scenario === 'off' ? [] : fixtures.tabs, time, {
    history: browserHistory(scenario),
    controlled: scenario === 'driving' ? ['tab-preview', 'tab-pull'] : [],
  });
  const chats = signInChat(fixtures.conversations, login);
  const agent = new DummyAgent(
    fixtures.agents,
    asks === 'long' ? { ...chats, 'cone-kitchen': [...chats['cone-kitchen'], longAsk()] } : chats,
    { files, browser },
    time,
    fixtures.queues,
    extras.frozen
  );
  const stop = agent.stop.bind(agent);
  agent.stop = (agentId: string) => {
    stop(agentId);
    browser.release(agentId);
  };
  importPort(imports, agent, time);
  if (hold !== 'off') agent.setHold({ reason: hold, held: 2 });
  const noticePort = noticesPort(agent, time, notices, readonly, arrival);
  if (scenario === 'driving') void browser.run(drive);
  const base = {
    agent,
    files,
    browser,
    terminals: new DummyTerminals(fixtures.terminals, files, time),
    settings: new DummySettings(
      fixtures.defaults,
      providers === 'none' ? [...fixtures.models, ...fixtures.laterModels] : fixtures.models,
      [
        ...settingsAccounts(accounts, providers, transport, mcp),
        ...(hinted(login) ? [fixtures.codexAccount] : []),
      ],
      storage,
      time,
      undefined,
      providers === 'none',
      login,
      providers === 'all' ? providerFixtures : undefined,
      transport,
      servers
    ),
    memory: new DummyMemory(extras.memories, () => [
      { id: 'global', label: 'Everyone' },
      ...agent
        .list()
        .filter((cone) => cone.kind === 'cone')
        .map((cone) => ({ id: cone.id, label: cone.name, group: 'cones' as const })),
      { id: 'role:reviewer', label: 'reviewer', group: 'roles' },
    ]),
    sprinkles: new DummySprinkles(
      sprinkles === 'cones' ? [...extras.sprinkles, ...extras.coneSprinkles] : extras.sprinkles,
      agent,
      files
    ),
    tray: new DummyTray(extras.trayWith(budget), time),
    updates: new DummyUpdates(updates, time, {
      ...(packages === 'off' ? {} : { packages }),
      ...(beta === 'off' ? {} : { beta }),
      confirm,
    }),
    ...(network === 'off'
      ? {}
      : { network: new DummyNetwork(network, time, tailnet, links, files, leaders) }),
    ...(changes === 'files' ? {} : { changes: new DummyChanges(files, changes === 'git') }),
    ...(noticePort ? { notices: noticePort } : {}),
    ...(tabs === 'off' ? {} : { tabs: new DummyTabs(tabs, time) }),
    ...(approvals === 'off' ? {} : { approvals: new DummyApprovals(approvals, time) }),
    ...(follow === 'off' ? {} : { follow: new DummyFollow(follow, time) }),
    ...(vault === 'off'
      ? {}
      : {
          vault: new DummyVault(vault, time, vaultRecords(accounts, mcp)),
        }),
    ...guestsPort(guests, time),
  };
  base.vault?.on('status', (status) => {
    if (!status.locked && agent.hold()?.reason === 'locked') agent.setHold(null);
  });
  return {
    ...base,
    monitor: new DummyMonitor(base, monitor === 'agent' ? agentSections : undefined),
  };
}
