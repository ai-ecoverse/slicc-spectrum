import type { SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { DummyBrowser } from './browser.ts';
import { type ChangesScenario, DummyChanges } from './changes.ts';
import { clock } from './clock.ts';
import * as extras from './extras.ts';
import { DummyFiles, type MountScenario } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummyMemory } from './memory.ts';
import { DummyMonitor } from './monitor.ts';
import { DummyNetwork, type NetworkScenario, type TailnetScenario } from './network.ts';
import { DummySettings } from './settings.ts';
import { DummySprinkles } from './sprinkles.ts';
import { DummyTerminals } from './terminals.ts';
import { DummyTray } from './tray.ts';
import {
  DummyUpdates,
  type PackageConfirm,
  type PackageScenario,
  type UpdateScenario,
} from './updates.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
  updates?: UpdateScenario;
  packages?: PackageScenario | 'off';
  confirm?: PackageConfirm;
  mounts?: MountScenario | 'off';
  network?: NetworkScenario | 'off';
  tailnet?: TailnetScenario;
  changes?: ChangesScenario;
}

export interface DummyModel extends SliccModel {
  updates: DummyUpdates;
  network?: DummyNetwork;
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
  changes = 'files',
}: DummyOptions = {}): DummyModel {
  const time = clock(delay);
  const mount =
    mounts === 'off'
      ? null
      : { scenario: mounts, point: fixtures.mountPoint, files: fixtures.mounted };
  const pending = changes === 'git' ? [...fixtures.pending, fixtures.skillEdit] : fixtures.pending;
  const files = new DummyFiles(fixtures.files, fixtures.directories, pending, time, mount);
  const browser = new DummyBrowser(fixtures.tabs, time);
  const agent = new DummyAgent(
    fixtures.agents,
    fixtures.conversations,
    { files, browser },
    time,
    fixtures.queues,
    extras.frozen
  );
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
    sprinkles: new DummySprinkles(extras.sprinkles, agent, files),
    tray: new DummyTray(extras.tray, time),
    updates: new DummyUpdates(updates, time, {
      ...(packages === 'off' ? {} : { packages }),
      confirm,
    }),
    ...(network === 'off' ? {} : { network: new DummyNetwork(network, time, tailnet) }),
    ...(changes === 'files' ? {} : { changes: new DummyChanges(files, changes === 'git') }),
  };
  return { ...base, monitor: new DummyMonitor(base) };
}
