import type { SliccModel } from '../model/types.ts';
import { DummyAgent } from './agent.ts';
import { DummyBrowser } from './browser.ts';
import { clock } from './clock.ts';
import { DummyFiles } from './files.ts';
import * as fixtures from './fixtures.ts';
import { DummySettings } from './settings.ts';
import { DummyTerminals } from './terminals.ts';

export interface DummyOptions {
  delay?: number;
  storage?: Storage | null;
}

export function createDummyModel({ delay = 30, storage = null }: DummyOptions = {}): SliccModel {
  const time = clock(delay);
  const files = new DummyFiles(fixtures.files, fixtures.directories, fixtures.pending, time);
  const browser = new DummyBrowser(fixtures.tabs, time);
  return {
    agent: new DummyAgent(
      fixtures.agents,
      fixtures.conversations,
      { files, browser },
      time,
      fixtures.queues
    ),
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
  };
}
