import type { SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { type ApprovalScenario, DummyApprovals } from './approvals.ts';
import { type BrowserScenario, browserHistory, DummyBrowser, drive } from './browser.ts';
import { type ChangesScenario, DummyChanges } from './changes.ts';
import { clock } from './clock.ts';
import * as extras from './extras.ts';
import { DummyFiles, type MountScenario } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummyFollow, type FollowScenario } from './follow.ts';
import { DummyMemory } from './memory.ts';
import { agentSections, DummyMonitor } from './monitor.ts';
import {
  DummyNetwork,
  type LinksScenario,
  type NetworkScenario,
  type TailnetScenario,
} from './network.ts';
import { DummyNotices, type NoticeScenario } from './notices.ts';
import { DummySettings } from './settings.ts';
import { DummySprinkles } from './sprinkles.ts';
import { DummyTabs, type TabsScenario } from './tabs.ts';
import { DummyTerminals } from './terminals.ts';
import { DummyTray } from './tray.ts';
import {
  DummyUpdates,
  type PackageConfirm,
  type PackageScenario,
  type UpdateScenario,
} from './updates.ts';
import { DummyVault, type VaultScenario } from './vault.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
  updates?: UpdateScenario;
  packages?: PackageScenario | 'off';
  confirm?: PackageConfirm;
  mounts?: MountScenario | 'off';
  network?: NetworkScenario | 'off';
  tailnet?: TailnetScenario;
  links?: LinksScenario;
  changes?: ChangesScenario;
  notices?: NoticeScenario | 'off';
  tabs?: TabsScenario | 'off';
  approvals?: ApprovalScenario | 'off';
  follow?: FollowScenario | 'off';
  vault?: VaultScenario | 'off';
  browser?: BrowserScenario;
  sprinkles?: 'builtin' | 'cones';
  monitor?: 'dummy' | 'agent';
}

export interface DummyModel extends SliccModel {
  browser: DummyBrowser;
  updates: DummyUpdates;
  network?: DummyNetwork;
  notices?: DummyNotices;
  tabs?: DummyTabs;
  approvals?: DummyApprovals;
  follow?: DummyFollow;
  vault?: DummyVault;
}

export function createDummyModel({
  delay = 30,
  storage = null,
  updates = 'current',
  packages = 'off',
  confirm,
  mounts = 'off',
  network = 'limited',
  tailnet,
  links,
  changes = 'files',
  notices = 'off',
  tabs = 'off',
  approvals = 'off',
  follow = 'off',
  vault = 'off',
  browser: scenario = 'idle',
  sprinkles = 'builtin',
  monitor = 'dummy',
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
  const agent = new DummyAgent(
    fixtures.agents,
    fixtures.conversations,
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
  if (scenario === 'driving') void browser.run(drive);
  const base = {
    agent,
    files,
    browser,
    terminals: new DummyTerminals(fixtures.terminals, files, time),
    settings: new DummySettings(
      fixtures.defaults,
      fixtures.models,
      fixtures.accounts,
      storage,
      time
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
    tray: new DummyTray(extras.tray, time),
    updates: new DummyUpdates(updates, time, {
      ...(packages === 'off' ? {} : { packages }),
      confirm,
    }),
    ...(network === 'off'
      ? {}
      : { network: new DummyNetwork(network, time, tailnet, links, files) }),
    ...(changes === 'files' ? {} : { changes: new DummyChanges(files, changes === 'git') }),
    ...(notices === 'off' ? {} : { notices: new DummyNotices(notices, time) }),
    ...(tabs === 'off' ? {} : { tabs: new DummyTabs(tabs, time) }),
    ...(approvals === 'off' ? {} : { approvals: new DummyApprovals(approvals, time) }),
    ...(follow === 'off' ? {} : { follow: new DummyFollow(follow, time) }),
    ...(vault === 'off' ? {} : { vault: new DummyVault(vault, time) }),
  };
  return {
    ...base,
    monitor: new DummyMonitor(base, monitor === 'agent' ? agentSections : undefined),
  };
}
