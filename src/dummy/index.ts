import type { SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { DummyBrowser } from './browser.ts';
import { clock } from './clock.ts';
import * as extras from './extras.ts';
import { DummyFiles, type MountScenario } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummyMemory } from './memory.ts';
import { DummyMonitor } from './monitor.ts';
import { DummySettings } from './settings.ts';
import { DummySprinkles } from './sprinkles.ts';
import { DummyTerminals } from './terminals.ts';
import { DummyTray } from './tray.ts';
import { DummyUpdates, type UpdateScenario } from './updates.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
  updates?: UpdateScenario;
  mounts?: MountScenario | 'off';
}

export interface DummyModel extends SliccModel {
  updates: DummyUpdates;
}

export function createDummyModel({
  delay = 30,
  storage = null,
  updates = 'current',
  mounts = 'off',
}: DummyOptions = {}): DummyModel {
  const time = clock(delay);
  const mount =
    mounts === 'off'
      ? null
      : { scenario: mounts, point: fixtures.mountPoint, files: fixtures.mounted };
  const files = new DummyFiles(fixtures.files, fixtures.directories, fixtures.pending, time, mount);
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
    updates: new DummyUpdates(updates, time),
  };
  return { ...base, monitor: new DummyMonitor(base) };
}
