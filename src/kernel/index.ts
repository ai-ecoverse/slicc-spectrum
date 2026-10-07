import { clock } from '../dummy/clock.ts';
import { DummySettings } from '../dummy/settings.ts';
import type { TerminalKernel } from '../kernel-backend.ts';
import type { Settings, SliccModel } from '../model/types.ts';
import { KernelFiles, type KernelFilesOptions } from './files.ts';
import {
  IdleAgent,
  IdleBrowser,
  IdleMemory,
  IdleMonitor,
  IdleSprinkles,
  IdleTray,
} from './idle.ts';
import { KernelTerminals, type KernelTerminalsOptions } from './terminals.ts';

export interface KernelModelOptions {
  kernel: TerminalKernel;
  root: FileSystemDirectoryHandle;
  files?: KernelFilesOptions;
  terminals?: KernelTerminalsOptions;
  storage?: Storage | null;
}

export interface KernelModel extends SliccModel {
  files: KernelFiles;
  terminals: KernelTerminals;
}

const defaults: Settings = {
  color: 'system',
  model: '',
  thinking: 'off',
  sendOnEnter: true,
  showThinking: false,
  diffStyle: 'unified',
};

export function idleModel(storage: Storage | null = null): Omit<SliccModel, 'files' | 'terminals'> {
  return {
    agent: new IdleAgent(),
    browser: new IdleBrowser(),
    settings: new DummySettings(defaults, [], [], storage, clock(0)),
    memory: new IdleMemory(),
    monitor: new IdleMonitor(),
    sprinkles: new IdleSprinkles(),
    tray: new IdleTray(),
  };
}

export function createKernelModel({
  kernel,
  root,
  files,
  terminals,
  storage = null,
}: KernelModelOptions): KernelModel {
  const model: KernelModel = {
    ...idleModel(storage),
    files: new KernelFiles(root, files),
    terminals: new KernelTerminals(kernel, terminals),
  };
  model.files.start();
  return model;
}
