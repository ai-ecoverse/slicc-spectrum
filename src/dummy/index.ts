import type { SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { DummyBrowser } from './browser.ts';
import { clock } from './clock.ts';
import * as extras from './extras.ts';
import { DummyFiles } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummyMemory } from './memory.ts';
import { DummyMonitor } from './monitor.ts';
import { DummySettings } from './settings.ts';
import { DummySprinkles } from './sprinkles.ts';
import { DummyTerminals } from './terminals.ts';
import { DummyTray } from './tray.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
}

export function createDummyModel({ delay = 30, storage = null }: DummyOptions = {}): SliccModel {
  const time = clock(delay);
  const files = new DummyFiles(fixtures.files, fixtures.directories, fixtures.pending, time);
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
    memory: new DummyMemory(extras.memories),
    sprinkles: new DummySprinkles(extras.sprinkles, agent),
    tray: new DummyTray(extras.tray, time),
  };
  return { ...base, monitor: new DummyMonitor(base) };
}
