import { Emitter } from '../model/emitter.ts';
import type {
  PackageAction,
  PackageItem,
  UpdateAction,
  UpdateItem,
  UpdateKind,
  UpdateNpm,
  UpdateRelease,
  UpdatesEvents,
  UpdatesPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type UpdateScenario = 'current' | 'boot' | 'starting' | 'available' | 'restart' | 'failure';
export type PackageScenario =
  | 'mixed'
  | 'empty'
  | 'fail'
  | 'user'
  | 'elsewhere'
  | 'npm'
  | 'checking'
  | 'offline';
export type BetaScenario = 'offered' | 'installed' | 'blocked' | 'failed';
export type PackageConfirm = (options: {
  title: string;
  body: string;
  action: string;
  variant: 'confirmation';
}) => Promise<boolean>;

const checkedAt = Date.UTC(2026, 9, 8, 8, 42);

const tag = (
  repo: string,
  version: string,
  notes?: string,
  owner = 'ai-ecoverse'
): UpdateRelease => ({
  version,
  url: `https://github.com/${owner}/${repo}/releases/tag/v${version}`,
  ...(notes ? { notes } : {}),
});

const certified = (name: string, version: string) =>
  `\n\n<!-- cert-verify -->\ncertified @harbor/${name}@${version} sha256=0f3c9a1e (covers ${version}; downstream: PASS)\n<!-- /cert-verify -->\n`;

const notes = (repo: string, version: string, sections: string) =>
  `# [${version}](https://github.com/ai-ecoverse/${repo}/compare/v${version}) (2026-10-07)\n\n${sections}`;

const releaseFixtures: Readonly<Record<string, readonly UpdateRelease[]>> = {
  kernel: [
    tag(
      'harbor-kernel',
      '1.13.0',
      notes(
        'harbor-kernel',
        '1.13.0',
        '### Features\n\n* **fs:** watch a folder and get one event per batch of changes\n* **jobs:** `wait -n` returns the first job that finishes'
      ) + certified('harbor-kernel', '1.13.0')
    ),
    tag(
      'harbor-kernel',
      '1.12.2',
      notes(
        'harbor-kernel',
        '1.12.2',
        '### Bug Fixes\n\n* **net:** a slow DNS answer no longer stalls the next request'
      ) + certified('harbor-kernel', '1.12.2')
    ),
    tag(
      'harbor-kernel',
      '1.12.1',
      notes(
        'harbor-kernel',
        '1.12.1',
        '### Bug Fixes\n\n* **tty:** resizing a terminal mid-line keeps the cursor on its column'
      )
    ),
    tag('harbor-kernel', '1.12.0'),
  ],
  agent: [
    tag(
      'harbor-agent',
      '0.25.0',
      notes(
        'harbor-agent',
        '0.25.0',
        '### Features\n\n* **tools:** the agent can read a tide table from a CSV file\n\n### Bug Fixes\n\n* **chat:** a long answer keeps its code blocks intact when it is cut'
      ) + certified('harbor-agent', '0.25.0'),
      'some-fork'
    ),
    tag('harbor-agent', '0.24.0'),
  ],
  grammars: [tag('harbor-grammars', '4.5.0')],
};

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
    ...(releaseFixtures[kind] ? { releases: releaseFixtures[kind] } : {}),
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

const pin = '6.6.0';
const latest = '6.13.5';
const betaReleases: readonly UpdateRelease[] = [
  tag(
    'harbor-agent',
    '6.13.5',
    notes(
      'harbor-agent',
      '6.13.5',
      '### Bug Fixes\n\n* **tools:** a tide table with a blank row no longer stops the import'
    )
  ),
  tag(
    'harbor-agent',
    '6.10.0',
    notes(
      'harbor-agent',
      '6.10.0',
      '### Features\n\n* **chat:** answers can quote a buoy reading with its time and place'
    )
  ),
  tag(
    'harbor-agent',
    '6.6.0',
    notes('harbor-agent', '6.6.0', '### Bug Fixes\n\n* **chat:** a pasted chart keeps its axes') +
      certified('harbor-agent', '6.6.0')
  ),
];
const offered: UpdateNpm = { state: 'offered', latest, changes: { count: 12, gated: [] } };
const blocked: UpdateNpm = {
  state: 'not-offered',
  latest,
  reason: 'it needs kernel 1.14.0 or later',
};
const betaFailed =
  'Couldn’t install the beta: pnpm stopped with an error, shown in the install log. Retry.';

function betaActions(item: UpdateItem): UpdateAction[] {
  return [
    ...(item.beta ? (['back-to-certified'] as const) : []),
    ...(item.npm?.state === 'offered' ? (['install-beta'] as const) : []),
  ];
}

function withNpm(items: readonly UpdateItem[], npm: UpdateNpm | null): readonly UpdateItem[] {
  return items.map((item) => {
    if (item.kind !== 'agent') return item;
    const next = { ...item, npm };
    const kept = item.actions.filter(
      (action) => action !== 'install-beta' && action !== 'back-to-certified'
    );
    return { ...next, actions: [...kept, ...betaActions(next)] };
  });
}

export function betaFixtures(
  items: readonly UpdateItem[],
  scenario: BetaScenario
): readonly UpdateItem[] {
  return items.map((item) => {
    if (item.kind !== 'agent') return item;
    const base = {
      ...item,
      from: pin,
      to: pin,
      beta: null,
      npm: offered,
      releases: betaReleases,
    };
    const next: UpdateItem =
      scenario === 'installed'
        ? {
            ...base,
            from: latest,
            to: latest,
            beta: { version: latest, certified: pin },
            npm: { state: 'current', latest },
          }
        : scenario === 'blocked'
          ? { ...base, npm: blocked }
          : scenario === 'failed'
            ? {
                ...base,
                state: 'failed',
                to: latest,
                error: betaFailed,
                log: `pnpm add @slicc/demo-agent@${latest}\nERR_PNPM_FETCH_TIMEOUT Request timed out after 30000ms`,
              }
            : base;
    const extra = betaActions(next);
    return {
      ...next,
      actions: [...(scenario === 'failed' ? (['retry'] as const) : item.actions), ...extra],
    };
  });
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

const yours = (
  project: 'agent' | 'grammars' | 'user',
  name: string,
  description: string,
  version: string,
  pin: { base: string | null; range: string },
  change: Partial<PackageItem> = {}
): PackageItem => ({
  id: `user:${project}:${name}`,
  package: name,
  label: name.replace(/^@[^/]+\//, ''),
  description,
  commands: [],
  state: 'installed',
  version,
  offered: null,
  progress: null,
  error: null,
  actions: [pin.base === null ? 'remove' : 'unpin'],
  origin: 'user',
  pin: { ...pin, project: `/opt/${project}` },
  ...change,
});

const userPackages = (): PackageItem[] => [
  yours('agent', '@harbor/agent-kit', 'Agent toolkit, held at your version.', '0.24.0', {
    base: '0.25.0',
    range: '0.24.0',
  }),
  yours(
    'user',
    '@harbor/tide-math',
    'Tide tables and harmonic constants.',
    '1.2.4',
    { base: null, range: '^1.2.0' },
    { warnings: ['Needs @harbor/wasm-x@1.2.3-4, which seven hasn’t tested.'] }
  ),
  yours('grammars', '@harbor/grammar-tides', 'Syntax highlighting for .tide files.', '0.3.1', {
    base: null,
    range: '^0.3.0',
  }),
];

const longDescription =
  'Type-checks and compiles **TypeScript** to JavaScript. ' +
  'See [the handbook](https://example.test/handbook) and `tsc --init`, ' +
  '<b>projects</b>, _watch mode_ and incremental builds for large monorepos with many references. '.repeat(
    3
  );

function fromNpm(items: readonly PackageItem[]): PackageItem[] {
  const disk: Readonly<Record<string, number>> = { git: 58_400_000, python: 85_100_000 };
  const npm = items.map((item) => ({
    ...item,
    size: disk[item.id] ?? (item.size as number) * 3,
    unpacked: true as const,
  }));
  const at = (id: string) => npm.findIndex((item) => item.id === id);
  const patch = (id: string, change: Partial<PackageItem>) => {
    npm[at(id)] = { ...npm[at(id)], ...change };
  };
  patch('tsc', { description: longDescription });
  patch('ruff', { notes: ['Rules that need a native plugin are left out in seven.'] });
  patch('esbuild', {
    state: 'available',
    actions: ['install'],
    log: undefined,
    newer: { version: '0.26.0', reason: 'needs slicc-kernel 1.48.0 or newer' },
  });
  patch('pdf', {
    state: 'available',
    offered: null,
    size: undefined,
    unpacked: undefined,
    error: null,
    log: undefined,
    actions: [],
    withheld: 'needs slicc-kernel 1.48.0 or newer',
  });
  patch('biome', {
    state: 'outdated',
    offered: '2.3.0',
    actions: ['update', 'remove'],
    withheld: 'version 2.3.0 needs slicc-kernel 1.48.0 or newer',
  });
  return npm;
}

function unknown(items: readonly PackageItem[], registry: 'checking' | 'unreachable') {
  return items.map((item): PackageItem => {
    const installed = item.version !== null;
    return {
      id: item.id,
      package: item.package,
      label: item.label,
      description: '',
      commands: [],
      ...(item.requires ? { requires: item.requires } : {}),
      state: installed ? 'installed' : 'available',
      version: item.version,
      offered: null,
      progress: null,
      error: null,
      actions: installed ? ['remove'] : registry === 'unreachable' ? ['retry'] : [],
      registry,
    };
  });
}

export function packageFixtures(scenario: PackageScenario): readonly PackageItem[] {
  if (scenario === 'empty') return [];
  if (scenario === 'npm') return fromNpm(packageFixtures('mixed'));
  if (scenario === 'checking' || scenario === 'offline')
    return unknown(packageFixtures('npm'), scenario === 'offline' ? 'unreachable' : 'checking');
  const items: PackageItem[] = [
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
  patch('python', {
    state: 'installed',
    version: '3.13.1',
    notes: ['1 untested dependency: @harbor/wasi-sockets@0.4.2-1'],
    actions: ['remove'],
  });
  patch('python', {
    releases: [
      { version: '3.13.1', url: 'https://github.com/harbor-demo/python-wasm/releases/tag/v3.13.1' },
    ],
  });
  patch('uv', {
    state: 'outdated',
    version: '0.8.1',
    actions: ['update', 'remove'],
    releases: [
      {
        version: '0.9.2',
        url: 'https://github.com/harbor-demo/uv-wasm/releases/tag/v0.9.2',
        notes: '## 0.9.2\n\n### Bug Fixes\n\n* `uv run` finds the project in a parent folder again',
      },
      {
        version: '0.9.0',
        url: 'https://github.com/harbor-demo/uv-wasm/releases/tag/v0.9.0',
        notes: '## 0.9.0\n\n### Features\n\n* `uv add` keeps the comments in `pyproject.toml`',
      },
    ],
  });
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
  if (scenario === 'elsewhere') {
    const cone = (version: string) => [
      { version, where: '/home/cone/.local/share/pnpm', user: 'cone', manager: 'pnpm' as const },
    ];
    patch('git', { state: 'installed', version: '2.47.1', actions: [], installs: cone('2.47.1') });
    patch('tsc', {
      state: 'outdated',
      version: '5.8.2',
      actions: ['update'],
      installs: cone('5.8.2'),
    });
    patch('biome', {
      installs: [
        { version: '2.2.4', where: '/usr/local/share/pnpm', manager: 'panel' },
        ...cone('2.2.4'),
      ],
    });
  }
  return scenario === 'user' ? [...items, ...userPackages()] : items;
}

export interface DummyUpdatesOptions {
  packages?: PackageScenario;
  confirm?: PackageConfirm;
  beta?: BetaScenario;
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
  declare refreshPackages?: () => Promise<void>;
  #offline = false;
  declare developer?: () => boolean;
  declare setDeveloper?: (on: boolean) => Promise<void>;
  #beta: BetaScenario | undefined;
  #developer = true;

  constructor(scenario: UpdateScenario, clock: Clock, options: DummyUpdatesOptions = {}) {
    super();
    this.#beta = options.beta;
    this.#items = this.#fixtures(scenario);
    if (options.beta) {
      this.developer = () => this.#developer;
      this.setDeveloper = (on) => this.#setDeveloper(on);
    }
    this.#ready = scenario !== 'boot' && scenario !== 'starting';
    this.#clock = clock;
    this.#confirm = options.confirm;
    if (options.packages) {
      this.#packages = packageFixtures(options.packages);
      this.#fail = options.packages === 'fail';
      this.packages = () => this.#packages;
      this.actPackage = (id, action) =>
        action === 'retry' && this.#packages.find((item) => item.id === id)?.registry
          ? this.#refresh()
          : this.#actPackage(id, action);
      this.#offline = options.packages === 'offline';
      if (options.packages === 'npm' || options.packages === 'checking' || this.#offline)
        this.refreshPackages = () => this.#refresh();
    }
  }

  #patchPackage(id: string, patch: Partial<PackageItem>): void {
    const next = this.#packages.map((item) => (item.id === id ? { ...item, ...patch } : item));
    this.#packages = next.map((item) => {
      if (item.origin === 'user') return item;
      const missing =
        item.version === null
          ? []
          : next.filter((other) => item.requires?.includes(other.id) && other.version === null);
      if (!missing.length) return item.warnings ? { ...item, warnings: undefined } : item;
      const warnings = missing.map(
        (other) =>
          `Needs ${other.label}, which isn’t installed. Install ${other.label} again to use it.`
      );
      return { ...item, warnings };
    });
    this.emit('packages', this.#packages);
  }

  async #actPackage(id: string, action: PackageAction): Promise<void> {
    const item = this.#packages.find((candidate) => candidate.id === id);
    if (!item?.actions.includes(action)) throw new Error(`Package action unavailable: ${id}`);
    if (item.origin === 'user') {
      this.#patchPackage(id, { state: 'removing', error: null, actions: [] });
      await this.#clock.sleep(2);
      this.#packages = this.#packages.filter((candidate) => candidate.id !== id);
      this.emit('packages', this.#packages);
      return;
    }
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
      const kept = item.installs?.filter((install) => install.manager !== 'panel') ?? [];
      if (kept.length) {
        this.#patchPackage(id, {
          state: 'installed',
          version: kept[0].version,
          installs: kept,
          log: undefined,
        });
        return;
      }
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
    await this.#clock.sleep(2);
    if (item.size !== undefined) {
      const half = Math.round(item.size / 2);
      this.#patchPackage(id, {
        progress: { phase: 'download', done: 0, total: 1, bytes: { done: half, total: item.size } },
        log: `${log}\nProgress: resolved 1, downloaded 0, added 0\nDownloading ${item.package}@${item.offered}: ${half} B/${item.size} B`,
      });
    }
    await this.#clock.sleep(2);
    if (this.#fail) {
      this.#patchPackage(id, {
        state: 'failed',
        progress: null,
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
      actions: item.installs ? [] : ['remove'],
      ...(item.installs
        ? {
            installs: item.installs.map((install) => ({
              ...install,
              version: item.offered as string,
            })),
          }
        : {}),
      log: `${log}\nProgress: resolved 1, downloaded 1, added 1\nDone in 3.8s`,
    });
  }

  async #refresh(): Promise<void> {
    const before = this.#packages;
    this.#packages = before.map((item) =>
      item.registry
        ? { ...item, registry: 'checking', actions: item.version ? ['remove'] : [] }
        : item
    );
    this.emit('packages', this.#packages);
    await this.#clock.sleep(4);
    if (this.#offline) {
      this.#offline = false;
      this.#packages = before;
    } else {
      const fresh = packageFixtures('npm');
      this.#packages = this.#packages.map((item) =>
        item.registry ? (fresh.find((next) => next.id === item.id) as PackageItem) : item
      );
    }
    this.emit('packages', this.#packages);
  }

  list(): readonly UpdateItem[] {
    return this.#items;
  }

  ready(): boolean {
    return this.#ready;
  }

  #fixtures(scenario: UpdateScenario): readonly UpdateItem[] {
    const items = updateFixtures(scenario);
    if (!this.#beta) return items;
    const fixed = betaFixtures(items, this.#beta);
    return this.#developer ? fixed : withNpm(fixed, null);
  }

  async #setDeveloper(on: boolean): Promise<void> {
    await this.#clock.sleep(4);
    this.#developer = on;
    this.#npm(on ? { state: 'checking' } : null);
    if (!on) return;
    await this.#clock.sleep(4);
    const agent = this.#items.find((item) => item.kind === 'agent') as UpdateItem;
    this.#npm(this.#check(agent.from));
  }

  #check(version: string | null): UpdateNpm | null {
    if (!this.#developer) return null;
    if (version === latest) return { state: 'current', latest };
    return this.#beta === 'blocked' ? blocked : offered;
  }

  #npm(npm: UpdateNpm | null): void {
    this.#items = withNpm(this.#items, npm);
    this.emit('items', this.#items);
  }

  setScenario(scenario: UpdateScenario): void {
    this.#items = this.#fixtures(scenario);
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
    const back = action === 'back-to-certified';
    const beta = back || action === 'install-beta' || (action === 'retry' && item.to === latest);
    if (action === 'update-now' || action === 'retry' || beta) {
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
    if (beta) {
      const version = back ? pin : latest;
      const next: UpdateItem = {
        ...(this.#items.find((candidate) => candidate.id === id) as UpdateItem),
        state: 'ready',
        from: version,
        to: version,
        progress: null,
        error: null,
        checkedAt,
        beta: back ? null : { version, certified: pin },
        npm: this.#check(version),
      };
      this.#patch(id, { ...next, actions: ['restart-agent', ...betaActions(next)] });
      return;
    }
    const apply = action === 'update-now' && ['agent', 'bios', 'kernel', 'ui'].includes(item.kind);
    this.#patch(id, {
      state: apply ? 'ready' : 'installed',
      from: apply ? item.from : item.to,
      progress: null,
      checkedAt,
      actions: apply ? [item.kind === 'agent' ? 'restart-agent' : 'reload'] : [],
      ...(apply ? {} : { actions: betaActions(item) }),
    });
  }
}
