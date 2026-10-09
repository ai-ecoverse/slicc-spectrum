import { Emitter } from '../model/emitter.ts';
import type {
  PackageAction,
  PackageItem,
  UpdateAction,
  UpdateItem,
  UpdateKind,
  UpdatesEvents,
  UpdatesPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type UpdateScenario = 'current' | 'boot' | 'starting' | 'available' | 'restart' | 'failure';
export type PackageScenario = 'mixed' | 'empty' | 'fail';
export type PackageConfirm = (options: {
  title: string;
  body: string;
  action: string;
  variant: 'confirmation';
}) => Promise<boolean>;

const checkedAt = Date.UTC(2026, 9, 8, 8, 42);

export function updateFixtures(scenario: UpdateScenario): readonly UpdateItem[] {
  const components: readonly [UpdateKind, string, string][] = [
    ['bios', 'BIOS packages', '0.8.2'],
    ['kernel', 'Kernel', '1.12.0'],
    ['agent', 'Agent (/opt/agent)', '0.24.0'],
    ['grammars', 'Syntax grammars', '4.5.0'],
    ['global', 'Global pnpm packages', '2.3.0'],
    ['skills', 'Skills', '1.6.0'],
  ];
  const items: UpdateItem[] = components.map(([kind, label, version]) => ({
    id: kind,
    label,
    kind,
    state: 'current',
    progress: null,
    from: version,
    to: version,
    checkedAt,
    error: null,
    actions: [],
  }));
  const agent = items[2];
  if (scenario === 'boot') {
    Object.assign(agent, {
      state: 'downloading',
      from: null,
      progress: { phase: 'download', done: 63, total: 95 },
      log: 'Packages: +95\nProgress: resolved 95, reused 0, downloaded 63, added 0\nDownloading @slicc/demo-agent...',
    });
    Object.assign(items[3], {
      state: 'linking',
      progress: { phase: 'link', done: 12, total: 15 },
      log: 'Linking syntax grammars\nProgress: linked 12 of 15',
    });
    items[4].state = 'checking';
    Object.assign(items[5], { state: 'queued', from: null });
  } else if (scenario === 'starting') {
    agent.state = 'starting';
  } else if (scenario === 'available' || scenario === 'restart') {
    Object.assign(agent, {
      state: scenario === 'available' ? 'available' : 'ready',
      to: '0.25.0',
      actions: [scenario === 'available' ? 'update-now' : 'restart-agent'],
      log:
        scenario === 'restart'
          ? 'Packages: +95\nProgress: resolved 95, downloaded 95, added 95\nDone in 48.2s'
          : undefined,
    });
    Object.assign(items[1], { state: 'ready', to: '1.13.0', actions: ['reload'] });
  } else if (scenario === 'failure') {
    Object.assign(items[4], {
      state: 'failed',
      to: '2.4.0',
      error: 'The package registry did not respond. Installed commands are still available.',
      actions: ['retry'],
      log: 'pnpm add -g @harbor/demo-cli@2.4.0\nERR_PNPM_FETCH_TIMEOUT Request timed out after 30000ms',
    });
  }
  return items;
}

const offer = (
  id: string,
  label: string,
  description: string,
  commands: readonly string[],
  offered: string,
  size: number,
  requires?: readonly string[]
): PackageItem => ({
  id,
  package: `@harbor/${id}-wasm`,
  label,
  description,
  commands,
  ...(requires ? { requires } : {}),
  state: 'available',
  version: null,
  offered,
  size,
  progress: null,
  error: null,
  actions: ['install'],
});

const fetchFailed = 'The download stopped. Check the connection and try again.';

export function packageFixtures(scenario: PackageScenario): readonly PackageItem[] {
  if (scenario === 'empty') return [];
  const items = [
    offer('git', 'git', 'Version control for your projects.', ['git'], '2.47.1', 4_300_000),
    offer(
      'python',
      'Python',
      'Python with pip, for scripts and data work.',
      ['python3', 'pip'],
      '3.13.1',
      28_400_000
    ),
    offer(
      'uv',
      'uv',
      'Fast Python package and project manager.',
      ['uv', 'uvx'],
      '0.9.2',
      6_100_000,
      ['python']
    ),
    offer('ruff', 'Ruff', 'Python linter and formatter.', ['ruff'], '0.14.0', 9_800_000, [
      'python',
    ]),
    offer(
      'esbuild',
      'esbuild',
      'Bundles and minifies JavaScript and TypeScript.',
      ['esbuild'],
      '0.25.10',
      10_100_000
    ),
    offer(
      'tsc',
      'TypeScript',
      'Type-checks and compiles TypeScript.',
      ['tsc'],
      '5.9.3',
      23_600_000
    ),
    offer(
      'biome',
      'Biome',
      'Formats and lints JavaScript, TypeScript and JSON.',
      ['biome'],
      '2.2.4',
      19_200_000
    ),
    offer(
      'pdf',
      'PDF tools',
      'Extract text, pages and details from PDF files.',
      ['pdftotext', 'pdfinfo', 'pdfseparate'],
      '24.8.0',
      7_900_000
    ),
  ];
  const at = (id: string) => items.findIndex((item) => item.id === id);
  const patch = (id: string, change: Partial<PackageItem>) => {
    items[at(id)] = { ...items[at(id)], ...change };
  };
  patch('python', { state: 'installed', version: '3.13.1', actions: ['remove'] });
  patch('uv', { state: 'outdated', version: '0.8.1', actions: ['update', 'remove'] });
  patch('esbuild', {
    state: 'installing',
    actions: [],
    log: 'Packages: +1\nProgress: resolved 1, downloaded 0, added 0',
  });
  patch('biome', { state: 'installed', version: '2.2.4', actions: ['remove'] });
  patch('pdf', {
    state: 'failed',
    error: fetchFailed,
    actions: ['retry'],
    log: 'Packages: +1\nERR_PNPM_FETCH_TIMEOUT Request timed out after 30000ms',
  });
  return items;
}

export interface DummyUpdatesOptions {
  packages?: PackageScenario;
  confirm?: PackageConfirm;
}

export class DummyUpdates extends Emitter<UpdatesEvents> implements UpdatesPort {
  #items: readonly UpdateItem[];
  #ready: boolean;
  #clock: Clock;
  #packages: readonly PackageItem[] = [];
  #fail = false;
  #confirm: PackageConfirm | undefined;
  declare packages?: () => readonly PackageItem[];
  declare actPackage?: (id: string, action: PackageAction) => Promise<void>;

  constructor(scenario: UpdateScenario, clock: Clock, options: DummyUpdatesOptions = {}) {
    super();
    this.#items = updateFixtures(scenario);
    this.#ready = scenario !== 'boot' && scenario !== 'starting';
    this.#clock = clock;
    this.#confirm = options.confirm;
    if (options.packages) {
      this.#packages = packageFixtures(options.packages);
      this.#fail = options.packages === 'fail';
      this.packages = () => this.#packages;
      this.actPackage = (id, action) => this.#actPackage(id, action);
    }
  }

  #patchPackage(id: string, patch: Partial<PackageItem>): void {
    this.#packages = this.#packages.map((item) => (item.id === id ? { ...item, ...patch } : item));
    this.emit('packages', this.#packages);
  }

  async #actPackage(id: string, action: PackageAction): Promise<void> {
    const item = this.#packages.find((candidate) => candidate.id === id);
    if (!item?.actions.includes(action)) throw new Error(`Package action unavailable: ${id}`);
    if (action === 'remove') {
      const users = this.#packages
        .filter((other) => other.version !== null && other.requires?.includes(id))
        .map((other) => other.label);
      if (users.length && this.#confirm) {
        const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(users);
        const verb = users.length === 1 ? 'needs it and stops' : 'need it and stop';
        const ok = await this.#confirm({
          title: `Remove ${item.label}?`,
          body: `${names} ${verb} working until ${item.label} is back.`,
          action: 'Remove',
          variant: 'confirmation',
        });
        if (!ok) return;
      }
      this.#patchPackage(id, { state: 'removing', error: null, actions: [] });
      await this.#clock.sleep(2);
      this.#patchPackage(id, {
        state: 'available',
        version: null,
        actions: ['install'],
        log: undefined,
      });
      return;
    }
    const log = 'Packages: +1';
    this.#patchPackage(id, {
      state: action === 'update' ? 'updating' : 'installing',
      error: null,
      actions: [],
      log: `${log}\nProgress: resolved 1, downloaded 0, added 0`,
    });
    await this.#clock.sleep(4);
    if (this.#fail) {
      this.#patchPackage(id, {
        state: 'failed',
        error: fetchFailed,
        actions: ['retry'],
        log: `${log}\nERR_PNPM_FETCH_TIMEOUT Request timed out after 30000ms`,
      });
      throw new Error(fetchFailed);
    }
    for (const need of item.requires ?? []) {
      const required = this.#packages.find((candidate) => candidate.id === need);
      if (required && required.version === null) {
        this.#patchPackage(need, {
          state: 'installed',
          version: required.offered,
          error: null,
          actions: ['remove'],
        });
      }
    }
    this.#patchPackage(id, {
      state: 'installed',
      version: item.offered,
      progress: null,
      actions: ['remove'],
      log: `${log}\nProgress: resolved 1, downloaded 1, added 1\nDone in 3.8s`,
    });
  }

  list(): readonly UpdateItem[] {
    return this.#items;
  }

  ready(): boolean {
    return this.#ready;
  }

  setScenario(scenario: UpdateScenario): void {
    this.#items = updateFixtures(scenario);
    this.#ready = scenario !== 'boot' && scenario !== 'starting';
    this.emit('items', this.#items);
  }

  #patch(id: string, patch: Partial<UpdateItem>): void {
    this.#items = this.#items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    this.emit('items', this.#items);
  }

  async act(id: string, action: UpdateAction): Promise<void> {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item?.actions.includes(action)) throw new Error(`Update action unavailable: ${id}`);
    if (action === 'update-now' || action === 'retry') {
      this.#patch(id, {
        state: 'downloading',
        progress: { phase: 'download', done: 0, total: 95 },
        error: null,
        actions: [],
        log: 'Packages: +95\nProgress: resolved 95, downloaded 0, added 0',
      });
      await this.#clock.sleep(4);
      this.#patch(id, {
        state: 'linking',
        progress: { phase: 'link', done: 95, total: 95 },
        log: 'Packages: +95\nProgress: resolved 95, downloaded 95, added 95',
      });
      await this.#clock.sleep(2);
    }
    const apply = action === 'update-now' && ['agent', 'bios', 'kernel', 'ui'].includes(item.kind);
    this.#patch(id, {
      state: apply ? 'ready' : 'installed',
      from: apply ? item.from : item.to,
      progress: null,
      checkedAt,
      actions: apply ? [item.kind === 'agent' ? 'restart-agent' : 'reload'] : [],
    });
  }
}
