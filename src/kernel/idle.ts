import { Emitter } from '../model/emitter.ts';
import type {
  Agent,
  AgentEvents,
  AgentPort,
  BrowserEvents,
  BrowserPort,
  BrowserTab,
  FrozenCone,
  Memory,
  MemoryEvents,
  MemoryPort,
  Message,
  MonitorEvents,
  MonitorPort,
  MonitorSnapshot,
  SprinkleEvents,
  SprinklePort,
  TrayEvents,
  TrayPort,
  TrayStatus,
  UserMessage,
} from '../model/types.ts';

function missing(what: string): Error {
  return new Error(`No ${what} in this SLICC yet`);
}

export class IdleAgent extends Emitter<AgentEvents> implements AgentPort {
  list(): readonly Agent[] {
    return [];
  }
  active(): string {
    return '';
  }
  select(): void {}
  messages(): readonly Message[] {
    return [];
  }
  async send(): Promise<void> {
    throw missing('agent');
  }
  stop(): void {}
  busy(): boolean {
    return false;
  }
  queue(): readonly UserMessage[] {
    return [];
  }
  unqueue(): void {}
  suggestion(): string | null {
    return null;
  }
  answer(): void {}
  resolveLick(): void {}
  compact(): void {}
  clear(): void {}
  setModel(): void {}
  createScoop(): Agent {
    throw missing('agent');
  }
  frozen(): readonly FrozenCone[] {
    return [];
  }
  freeze(): void {}
  thaw(): Agent | null {
    return null;
  }
  discard(): void {}
}

export class IdleBrowser extends Emitter<BrowserEvents> implements BrowserPort {
  list(): readonly BrowserTab[] {
    return [];
  }
  active(): string | null {
    return null;
  }
  activate(): void {}
  open(): BrowserTab {
    throw missing('browser');
  }
  navigate(): void {}
  close(): void {}
  async screenshot(): Promise<string> {
    throw missing('browser');
  }
}

export class IdleMemory extends Emitter<MemoryEvents> implements MemoryPort {
  list(): readonly Memory[] {
    return [];
  }
  save(): Memory {
    throw missing('memory');
  }
  remove(): void {}
}

export class IdleMonitor extends Emitter<MonitorEvents> implements MonitorPort {
  snapshot(): MonitorSnapshot {
    return { vitals: [], alerts: [], sections: [], updatedAt: 0 };
  }
  resync(): void {}
}

export class IdleSprinkles extends Emitter<SprinkleEvents> implements SprinklePort {
  list(): readonly [] {
    return [];
  }
  send(): void {}
}

export class IdleTray extends Emitter<TrayEvents> implements TrayPort {
  status(): TrayStatus {
    return {
      name: 'slicc',
      kind: 'hosted',
      connection: 'offline',
      role: 'none',
      followers: [],
      spent: 0,
      rate: 0,
      budget: { percent: 0, window: 'daily', resets: '' },
      joinUrl: '',
    };
  }
  reconnect(): void {}
  disconnect(): void {}
}
