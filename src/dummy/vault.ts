import { Emitter } from '../model/emitter.ts';
import type {
  AuditEntry,
  AuditPage,
  Availability,
  ButtonConfig,
  ButtonEvent,
  ButtonMessage,
  EndpointSet,
  EnterOptions,
  EnterResult,
  ErrorCode,
  ImportCandidate,
  ImportKind,
  ImportPick,
  ImportResult,
  PendingRequest,
  PolicyNotice,
  PopupIntent,
  PutOptions,
  RecordKind,
  RefusedRule,
  RequestState,
  SealResult,
  SecretView,
  ValueConfig,
  ValueEvent,
  ValueMessage,
  VaultButton,
  VaultEndpointChange,
  VaultError,
  VaultEvents,
  VaultList,
  VaultPort,
  VaultStatus,
  VaultValueFrame,
} from '../model/types.ts';
import { nameProblem, valueProblem, vaultFailure } from '../model/values.ts';
import type { Clock } from './clock.ts';

export type VaultScenario =
  | 'empty'
  | 'secrets'
  | 'policy'
  | 'notice'
  | 'locked'
  | 'paused'
  | 'request'
  | 'backup'
  | 'waiting'
  | 'purged'
  | 'session'
  | 'endpoints-fail';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const harbor = { domain: 'api.harbor.example', header: 'Authorization', methods: [], paths: [] };
const pier = {
  domain: 'packages.pier.example',
  header: 'Authorization',
  methods: ['PUT'],
  paths: ['/-/package/*'],
};

export function vaultSecrets(now = Date.now()): SecretView[] {
  return [
    {
      name: 'HARBOR_API_KEY',
      kind: 'secret',
      placeholder: 'fnox_proxy_harbor01',
      state: 'active',
      source: 'settings',
      sourceDevice: null,
      domains: ['api.harbor.example'],
      rules: [harbor],
      exits: ['proxy', 'tailscale', 'device:link-pier'],
      exec: false,
      createdAt: now - 12 * day,
      usedAt: now - 4 * minute,
    },
    {
      name: 'PIER_PUBLISH_TOKEN',
      kind: 'secret',
      placeholder: 'fnox_proxy_pier0002',
      state: 'active',
      source: 'jerk:cone@link-pier',
      sourceDevice: 'link-pier',
      domains: ['packages.pier.example'],
      rules: [pier],
      exec: 'argv',
      execArgv: [['pier', 'publish']],
      createdAt: now - 3 * day,
      usedAt: now - 2 * hour,
      expiresAt: now + 3 * day,
    },
    {
      name: 'TIDE_MAIL',
      kind: 'grant',
      placeholder: 'fnox_proxy_tide0003',
      state: 'active',
      source: 'oauth:tide-mail',
      sourceDevice: null,
      provider: 'Tide Mail',
      account: 'cone@tide.example',
      domains: ['mail.tide.example'],
      rules: [
        {
          domain: 'mail.tide.example',
          header: 'Authorization',
          methods: ['GET', 'POST'],
          paths: ['/v1/messages/*'],
        },
        {
          domain: 'files.tide.example',
          header: 'Authorization',
          methods: ['GET'],
          paths: ['/v1/attachments/*'],
        },
      ],
      exec: false,
      createdAt: now - 20 * day,
      expiresAt: now + 50 * minute,
    },
    {
      name: 'REEF_DEPLOY_KEY',
      kind: 'secret',
      placeholder: 'fnox_proxy_reef0004',
      state: 'inert',
      source: 'process',
      sourceDevice: null,
      domains: [],
      rules: [],
      exec: 'any',
      createdAt: now - 2 * hour,
    },
    {
      name: 'BUOY_OLD_TOKEN',
      kind: 'secret',
      placeholder: 'fnox_proxy_buoy0005',
      state: 'removed',
      source: 'import:six',
      sourceDevice: null,
      domains: ['buoy.example'],
      rules: [{ domain: 'buoy.example', header: 'X-Buoy-Key', methods: ['GET'], paths: [] }],
      exec: 'shell',
      createdAt: now - 40 * day,
      removedAt: now - day,
    },
  ];
}

function refused(settings: Record<string, string>): void {
  const bad = Object.entries(settings).find(([, value]) => value.startsWith('bad'));
  if (bad)
    throw vaultFailure('EINVAL', `The vault refused ${bad[0]}. Check that value and try again.`);
}

export function accountRecords(now = Date.now(), pin?: string): SecretView[] {
  return [
    {
      name: 'MCP_DOCS_TOKEN',
      kind: 'mcp',
      placeholder: 'fnox_proxy_docs0006',
      state: 'active',
      source: 'settings',
      sourceDevice: null,
      server: 'docs',
      ...(pin ? { url: pin, pinned: true as const } : {}),
      domains: ['docs.example'],
      rules: [{ domain: 'docs.example', header: 'Authorization', methods: [], paths: [] }],
      exec: false,
      createdAt: now - 6 * day,
      usedAt: now - 20 * minute,
    },
  ];
}

export function vaultAudit(now = Date.now()): AuditEntry[] {
  const who = { uid: 1000, tag: 'cone' };
  return [
    {
      ...who,
      type: 'forward',
      seq: 12,
      id: 'audit-12',
      at: now - 4 * minute,
      name: 'HARBOR_API_KEY',
      domain: 'api.harbor.example',
      method: 'GET',
      path: '/v2/ships',
      rule: harbor,
      exit: 'proxy',
    },
    {
      ...who,
      type: 'materialize',
      seq: 11,
      id: 'audit-11',
      at: now - 2 * hour,
      name: 'PIER_PUBLISH_TOKEN',
      exec: 'argv',
      path: '/usr/bin/pier',
      argv: 'pier publish --tag next',
      argvSha256: 'b1946ac92492d2347c6235b4d2611184',
      cwd: '/home/cone/harbor',
      pid: 4211,
      ppid: 4100,
      ticket: 'ticket-11',
      consumed: true,
    },
    {
      type: 'materialize',
      seq: 10,
      id: 'audit-10',
      at: now - 3 * hour,
      name: 'PIER_PUBLISH_TOKEN',
      uid: 1001,
      tag: 'docs-pass',
      exec: 'argv',
      path: '/usr/bin/pier',
      argv: 'pier publish --dry-run',
      argvSha256: '591785b794601e212b260e25925636fd',
      cwd: '/home/cone/harbor/docs',
      pid: 3980,
      ppid: 3901,
      ticket: 'ticket-10',
      consumed: true,
    },
    {
      ...who,
      type: 'forward',
      seq: 9,
      id: 'audit-9',
      at: now - 6 * hour,
      name: 'HARBOR_API_KEY',
      domain: 'api.harbor.example',
      method: 'POST',
      path: '/v2/ships/quay/berths',
      rule: harbor,
      exit: 'device:link-pier',
    },
    {
      type: 'policy',
      seq: 8,
      id: 'audit-8',
      at: now - day,
      file: '/etc/slicc/secrets-policy.toml',
      sha256: '4e07408562bedb8b60ce05c1decfe3ad',
      accepted: true,
      changes: [
        {
          kind: 'exits',
          secret: 'HARBOR_API_KEY',
          from: ['proxy', 'device:link-pier'],
          to: ['proxy', 'tailscale', 'device:link-pier'],
        },
        { kind: 'reveal', field: 'agent', from: true, to: false },
      ],
    },
    {
      ...who,
      type: 'remove',
      seq: 7,
      id: 'audit-7',
      at: now - day - hour,
      name: 'BUOY_OLD_TOKEN',
    },
    {
      ...who,
      type: 'seal',
      seq: 6,
      id: 'audit-6',
      at: now - 3 * day,
      name: 'PIER_PUBLISH_TOKEN',
      source: 'jerk:cone@link-pier',
      rotated: false,
    },
  ];
}

export function vaultOlder(now = Date.now()): AuditEntry[] {
  return [
    {
      type: 'materialize',
      seq: 5,
      id: 'audit-5',
      at: now - 4 * day,
      name: 'PIER_PUBLISH_TOKEN',
      uid: 1000,
      tag: null,
      exec: 'argv',
      path: '/usr/bin/pier',
      argv: 'pier publish',
      argvSha256: '2c26b46b68ffc68ff99b453c1d304134',
      cwd: '/home/cone/harbor',
      pid: 2210,
      ppid: 2200,
      ticket: 'ticket-5',
      consumed: true,
    },
    {
      type: 'policy',
      seq: 4,
      id: 'audit-4',
      at: now - 5 * day,
      file: '/etc/fnox/config.toml',
      sha256: '8f14e45fceea167a5a36dedd4bea2543',
      accepted: false,
      changes: [],
      warning: 'The file did not parse, so the vault kept the last good rules.',
    },
    {
      type: 'restore',
      seq: 3,
      id: 'audit-3',
      at: now - 6 * day,
      name: 'TIDE_MAIL',
      uid: 0,
      tag: null,
    },
    {
      type: 'mcp',
      seq: 2,
      id: 'audit-2',
      at: now - 7 * day,
      name: 'DOCS_MCP_TOKEN',
      uid: 1000,
      tag: 'cone',
      server: 'docs',
      domain: 'docs.example',
      method: 'POST',
      path: '/mcp',
      exit: 'page',
    },
  ];
}

export function vaultRefused(): RefusedRule[] {
  return [
    {
      secret: 'PIER_PUBLISH_TOKEN',
      rule: {
        domain: 'packages.pier.example',
        header: 'Authorization',
        methods: ['DELETE'],
        paths: ['/-/package/*'],
      },
      reason: 'DELETE on a publish token needs a rule of its own in /etc/fnox/config.toml.',
    },
  ];
}

export function vaultPurged(now = Date.now()): AuditEntry {
  return {
    type: 'endpoints',
    seq: 13,
    id: 'audit-13',
    at: now - 2 * minute,
    uid: null,
    tag: null,
    purged: [
      { provider: 'openai', host: 'models.harbor.example' },
      { provider: 'anthropic', host: 'relay.harbor.example' },
    ],
    adopted: [{ server: 'docs', host: 'docs.example' }],
  };
}

export function vaultPinned(now = Date.now()): AuditEntry {
  return {
    type: 'endpoints',
    seq: 14,
    id: 'audit-14',
    at: now - minute,
    uid: null,
    tag: null,
    pinned: { name: 'DOCS_MCP_TOKEN', server: 'docs', host: 'docs.example' },
  };
}

export function vaultSessions(now = Date.now()): AuditEntry[] {
  const who = { uid: 1000, tag: 'cone' };
  return [
    {
      ...who,
      type: 'session',
      seq: 15,
      id: 'audit-15',
      at: now - minute,
      name: 'TIDE_MAIL',
      session: 'kernel-session-tide-0015',
      domain: 'mail.tide.example',
      port: 587,
      protocol: 'smtp',
      position: 'auth-plain',
      rule: 2,
      verifiedBy: 'roots',
      exit: 'proxy',
    },
    {
      ...who,
      type: 'session',
      seq: 14,
      id: 'audit-14',
      at: now - 2 * minute,
      name: 'REEF_DEPLOY_KEY',
      session: 'kernel-session-reef-0014',
      domain: 'db.reef.example',
      port: 5432,
      protocol: 'pg',
      position: 'scram-sha-256',
      rule: 3,
      verifiedBy: 'anchored',
      anchor: 'q83vEjRWeJA=',
      exit: 'device:link-pier',
    },
    {
      ...who,
      type: 'session',
      seq: 13,
      id: 'audit-13',
      at: now - 3 * minute,
      name: 'HARBOR_API_KEY',
      session: 'kernel-session-harbor-0013',
      domain: 'quay.harbor.example',
      port: 8443,
      protocol: 'http1',
      position: 'header:authorization',
      rule: 1,
      exit: 'tailscale',
    },
  ];
}

export function vaultPolicy(now = Date.now()): AuditEntry {
  return {
    type: 'policy',
    seq: 13,
    id: 'audit-13',
    at: now - 20 * minute,
    file: '/etc/fnox/config.toml',
    sha256: 'c9f0f895fb98ab9159f51fd0297e236d',
    accepted: true,
    changes: [
      {
        kind: 'rule',
        secret: 'HARBOR_API_KEY',
        rule: { domain: 'quay.harbor.example', header: 'Authorization', methods: [], paths: [] },
        change: 'added',
      },
      { kind: 'exec', secret: 'REEF_DEPLOY_KEY', from: false, to: 'any' },
    ],
    warning: 'One rule was refused; it is listed under Rules SLICC refused.',
  };
}

export function vaultPaused(now = Date.now()): AuditEntry[] {
  const entry = {
    type: 'policy' as const,
    accepted: true,
    changes: [],
  };
  return [
    {
      ...entry,
      seq: 15,
      id: 'audit-15',
      at: now - minute,
      file: '/etc/slicc/secrets-policy.toml',
      sha256: null,
      absent: true,
    },
    {
      ...entry,
      seq: 14,
      id: 'audit-14',
      at: now - 2 * minute,
      file: '/etc/fnox/config.toml',
      sha256: 'a87ff679a2f3e71d9181a67b7542122c',
    },
    {
      ...entry,
      seq: 13,
      id: 'audit-13',
      at: now - 3 * minute,
      file: '/etc/fnox/config.toml',
      sha256: null,
      absent: true,
    },
  ];
}

export function vaultNotice(now = Date.now()): PolicyNotice {
  return {
    id: 'notice-widened',
    at: now - 20 * minute,
    file: '/etc/slicc/secrets-policy.toml',
    sha256: 'c9f0f895fb98ab9159f51fd0297e236d',
    acknowledged: false,
    widened: [
      { kind: 'exit', secret: 'HARBOR_API_KEY', exit: 'device:link-quay' },
      {
        kind: 'methods',
        secret: 'PIER_PUBLISH_TOKEN',
        domain: 'packages.pier.example',
        methods: ['PUT', 'DELETE'],
      },
    ],
  };
}

function waiting(scenario: VaultScenario, now: number): PendingRequest[] {
  if (scenario === 'locked')
    return [
      {
        id: 'request-reef',
        kind: 'value',
        name: 'REEF_DEPLOY_KEY',
        prompt:
          'Needed to deploy the reef preview. It is the deploy key from the reef dashboard, under Settings > Keys.',
        uid: 1001,
        tag: 'docs-pass',
        createdAt: now - minute,
        expiresAt: now + 4 * minute,
      },
    ];
  if (scenario === 'request')
    return [
      {
        id: 'request-tide',
        kind: 'value',
        name: 'TIDE_STATION_TOKEN',
        prompt: 'Token for the tide station API, from the ops vault',
        uid: 1000,
        tag: 'docs-pass',
        createdAt: now,
        expiresAt: now + 5 * minute,
      },
    ];
  return [];
}

export function vaultFixtures(
  scenario: VaultScenario,
  now = Date.now()
): { status: VaultStatus; list: VaultList } {
  const empty = scenario === 'empty';
  const policy = scenario === 'policy' || scenario === 'notice';
  const backup = scenario === 'backup';
  const paused = scenario === 'paused';
  const status: VaultStatus = {
    version: '0.1.0',
    protocol: 1,
    origin: 'https://vault.sliccy.ai',
    locked: scenario === 'locked',
    lock: 'passkey',
    scrub: { needed: !empty, version: 3, ready: scenario !== 'locked' },
    waiting: waiting(scenario, now),
    ...(backup ? { backupReminder: 'due' as const, exportedAt: null } : {}),
    ...(paused
      ? {
          policy: [
            {
              path: '/etc/fnox/config.toml',
              sha256: 'a87ff679a2f3e71d9181a67b7542122c',
              accepted: true,
              warnings: [],
            },
            {
              path: '/etc/slicc/secrets-policy.toml',
              sha256: null,
              accepted: true,
              warnings: [],
              absent: true as const,
              paused: true as const,
            },
          ],
        }
      : {}),
  };
  const quay = { domain: 'quay.harbor.example', header: 'Authorization', methods: [], paths: [] };
  const secrets = (empty ? [] : vaultSecrets(now)).map((secret) =>
    policy && secret.name === 'HARBOR_API_KEY'
      ? { ...secret, domains: [...secret.domains, quay.domain], rules: [...secret.rules, quay] }
      : secret
  );
  const list: VaultList = {
    secrets,
    refused: policy ? vaultRefused() : [],
    audit: empty
      ? []
      : [
          ...(policy ? [vaultPolicy(now)] : []),
          ...(paused ? vaultPaused(now) : []),
          ...(scenario === 'purged' ? [vaultPinned(now), vaultPurged(now)] : []),
          ...(scenario === 'session' ? vaultSessions(now) : []),
          ...vaultAudit(now),
        ],
    auditMore: !empty,
    exits: {
      file: '/etc/slicc/secrets-policy.toml',
      sha256: empty ? null : '4e07408562bedb8b60ce05c1decfe3ad',
      restricted: secrets.flatMap(({ name, exits }) => (exits ? [{ name, exits }] : [])),
    },
  };
  return { status, list };
}

const labels: Record<string, string> = {
  unlock: 'Unlock the vault',
  protect: 'Protect with a passkey',
};

const candidates: ImportCandidate[] = [
  {
    name: 'LAGOON_API_KEY',
    exists: false,
    suggestedRules: 'api.lagoon.example, in Authorization, any method, any path',
  },
  { name: 'HARBOR_API_KEY', exists: true },
  {
    name: 'KELP_WEBHOOK_SECRET',
    exists: false,
    suggestedRules: 'Send to hooks.kelp.example in X-Kelp-Signature, and to evil.example too',
  },
  { name: 'LAGOON_MODEL_KEY', kind: 'model', exists: false },
  {
    name: 'MOORING_TOKEN',
    exists: false,
    refused:
      'another app that uses this vault already has this secret; use it there, or add it here by hand',
  },
];

const duplicate: ImportCandidate = { name: 'KELP_WEBHOOK_SECRET_2', exists: false };

export class DummyVaultButton implements VaultButton {
  element: HTMLElement;
  config: ButtonConfig | null = null;
  #listeners = new Set<(event: ButtonEvent) => void>();
  #vault: DummyVault;
  #button: HTMLElement & { variant?: string; size?: string };

  constructor(vault: DummyVault, time: Clock) {
    this.#vault = vault;
    this.element = document.createElement('span');
    this.element.dataset.vaultButton = '';
    this.#button = document.createElement('swc-button');
    this.element.append(this.#button);
    this.#button.addEventListener('click', () => void this.#click());
    void time.sleep(0).then(() => this.#emit({ event: 'ready' }));
  }

  post(message: ButtonMessage): void {
    if (message.op === 'focus') {
      this.#button.focus();
      return;
    }
    this.config = message.button;
    const { intent, label, size = 'm', variant = 'secondary', treatment = 'fill' } = message.button;
    this.#button.textContent =
      label ?? (intent === 'auto' ? this.#vault.autoLabel() : labels[intent.kind]);
    this.#button.setAttribute('size', size);
    this.#button.setAttribute('variant', variant);
    this.#button.setAttribute('fill-style', treatment);
    this.#button.toggleAttribute('disabled', !!message.button.disabled);
  }

  listen(listener: (event: ButtonEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: ButtonEvent | Record<string, unknown>): void {
    const message = { type: 'slicc-vault', v: 1, ...event } as ButtonEvent;
    for (const listener of [...this.#listeners]) listener(message);
  }

  async #click(): Promise<void> {
    const intent = this.config?.intent ?? 'auto';
    const resolved = intent === 'auto' ? this.#vault.autoIntent() : intent;
    this.#emit({ event: 'popup', intent: resolved, state: 'opened' });
    await this.#vault.answer(resolved);
    this.#emit({ event: 'popup', intent: resolved, state: 'done' });
  }
}

type FrameView = 'locked' | 'enter' | 'reveal' | 'gone';

export class DummyValueFrame implements VaultValueFrame {
  element: HTMLElement;
  request: string;
  config: ValueConfig | null = null;
  messages: ValueMessage[] = [];
  arming = 500;
  #listeners = new Set<(event: ValueEvent) => void>();
  #vault: DummyVault;
  #box: HTMLElement;
  #view: FrameView | '' = '';
  #armed = false;
  #finished = false;
  #sizes = new ResizeObserver(() => this.#size());

  constructor(vault: DummyVault, time: Clock, request: string) {
    this.#vault = vault;
    this.request = request;
    this.element = document.createElement('div');
    this.element.dataset.vaultValue = '';
    this.#box = document.createElement('div');
    this.#box.style.padding = '2px';
    this.element.append(this.#box);
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      this.#emit({ event: 'escape' });
    });
    vault.on('status', () => this.#render());
    this.#sizes.observe(this.#box);
    void time.sleep(0).then(() => this.#emit({ event: 'ready' }));
  }

  post(message: ValueMessage): void {
    this.messages.push(message);
    if (message.op === 'focus') {
      this.#box.querySelector<HTMLElement>('input, swc-button')?.focus();
      return;
    }
    this.request = message.request;
    this.config = message.config;
    this.element.style.colorScheme = message.config.theme ?? '';
    this.#render();
  }

  listen(listener: (event: ValueEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: Record<string, unknown>): void {
    const message = { type: 'slicc-vault', v: 1, ...event } as ValueEvent;
    for (const listener of [...this.#listeners]) listener(message);
  }

  #size(): void {
    const { width, height } = this.#box.getBoundingClientRect();
    this.#emit({ event: 'size', width: Math.ceil(width), height: Math.ceil(height), inset: 2 });
  }

  #render(): void {
    if (!this.config || this.#finished) return;
    const ask = this.#vault.ask(this.request);
    if (!ask) {
      this.#finished = true;
      this.#box.replaceChildren();
      this.#emit({ event: 'gone', request: this.request, state: 'cancelled' });
      return;
    }
    const view: FrameView = this.#vault.status()?.locked ? 'locked' : (ask.mode ?? 'enter');
    if (view === this.#view) return;
    if (view !== 'locked' && (this.#view === '' || this.#view === 'locked'))
      setTimeout(() => {
        this.#armed = true;
        this.#arm();
      }, this.arming);
    this.#view = view;
    this.#box.replaceChildren(...this.#controls(view, ask));
    this.#arm();
    this.#size();
  }

  #arm(): void {
    for (const button of this.#box.querySelectorAll('[data-action=save], [data-action=allow]'))
      button.toggleAttribute('disabled', !this.#armed);
  }

  #button(action: string, label: string, variant: string, click: () => void): HTMLElement {
    const button = document.createElement('swc-button');
    button.dataset.action = action;
    button.setAttribute('variant', variant);
    button.textContent = label;
    button.addEventListener('click', click);
    return button;
  }

  #controls(view: FrameView, ask: PendingRequest): HTMLElement[] {
    const text = document.createElement('p');
    text.style.margin = '0 0 8px';
    const problem = document.createElement('p');
    problem.dataset.problem = '';
    problem.style.margin = '8px 0 0';
    if (view === 'locked') {
      text.textContent = 'Unlock the vault to answer.';
      return [
        text,
        this.#button('unlock', 'Unlock', 'accent', () => {
          void this.#vault.answer({ kind: 'unlock' });
        }),
      ];
    }
    if (view === 'reveal') {
      text.textContent = `${ask.requester?.exe} gets the plaintext of ${ask.name}`;
      return [
        text,
        this.#button('allow', 'Allow', 'negative', () => void this.#answer(problem, '')),
        problem,
      ];
    }
    const label = document.createElement('label');
    label.textContent = `Value for ${ask.name}`;
    label.style.display = 'grid';
    const input = document.createElement('input');
    input.type = 'password';
    input.dataset.field = 'value';
    input.autocomplete = 'off';
    label.append(input);
    text.append(label);
    return [
      text,
      this.#button('save', 'Save', 'accent', () => {
        const value = input.value;
        input.value = '';
        void this.#answer(problem, value);
      }),
      problem,
    ];
  }

  async #answer(problem: HTMLElement, value: string): Promise<void> {
    const reveal = this.#view === 'reveal';
    problem.textContent = '';
    this.#finished = true;
    try {
      if (reveal) {
        await this.#vault.allow(this.request);
        this.#emit({ event: 'done', request: this.request, state: 'allowed' });
      } else {
        const { name, placeholder, state } = await this.#vault.seal(this.request, value);
        this.#emit({
          event: 'done',
          request: this.request,
          state: 'sealed',
          name,
          placeholder,
          record: state,
        });
      }
    } catch (error) {
      this.#finished = false;
      const { code, message } = error as VaultError;
      if (code === 'EINVAL') problem.textContent = message;
      else this.#emit({ event: 'error', code, message });
    }
  }
}

export interface DummyImport {
  kind: ImportKind;
  size: number;
  password: boolean;
  pick?: ImportPick[];
}

export class DummyVault extends Emitter<VaultEvents> implements VaultPort {
  #status: VaultStatus;
  #list: VaultList;
  #available: Availability;
  #fail: VaultError | null = null;
  #time: Clock;
  #older: AuditEntry[] = vaultOlder();
  #serial = 0;
  buttons: DummyVaultButton[] = [];
  frames: DummyValueFrame[] = [];
  entered: EnterOptions[] = [];
  #entries = new Map<string, { options: EnterOptions; pending: PendingRequest }>();
  answered = new Set<string>();
  revealed: string[] = [];
  puts: { name: string; request?: string; options?: PutOptions }[] = [];
  endpointChanges: VaultEndpointChange[] = [];
  settingsCalls: Array<{ name: string; kind: RecordKind; settings: Record<string, string> }> = [];
  #refuses: boolean;
  cancelled: string[] = [];
  imports: DummyImport[] = [];
  exported = 0;
  acknowledged: string[] = [];

  constructor(scenario: VaultScenario, time: Clock, records: readonly SecretView[] = []) {
    super();
    const { status, list } = vaultFixtures(scenario);
    this.#status = status;
    this.#list = { ...list, secrets: [...list.secrets, ...records] };
    this.#time = time;
    this.#available = scenario === 'waiting' ? 'waiting' : 'ready';
    this.#refuses = scenario === 'endpoints-fail';
  }

  async endpoints(change: VaultEndpointChange): Promise<void> {
    await this.#time.sleep(5);
    const server = change.add?.mcp?.[0]?.url;
    if (this.#refuses && server)
      throw vaultFailure(
        'EINVAL',
        `The vault refused ${server} for this token. Check the server's address, then try again.`
      );
    if (this.#refuses)
      throw vaultFailure(
        'EINVAL',
        'The vault refused that endpoint. Check the address and try again.'
      );
    this.endpointChanges.push(change);
    const overrides = (secret: SecretView, list: EndpointSet | undefined) =>
      secret.pinned && list?.mcp?.some((entry) => entry.server === secret.server);
    this.#list = {
      ...this.#list,
      secrets: this.#list.secrets.map((secret) => {
        if (!overrides(secret, change.add)) return secret;
        const { url: _, pinned: __, ...rest } = secret;
        return rest;
      }),
    };
    this.emit('list', this.#list);
  }

  status(): VaultStatus | null {
    return this.#available === 'waiting' ? null : this.#status;
  }

  list(): VaultList | null {
    return this.#available === 'waiting' ? null : this.#list;
  }

  availability(): Availability {
    if (this.#available === 'waiting') return 'waiting';
    return this.#status.locked ? 'locked' : 'ready';
  }

  wait(): void {
    this.#available = 'waiting';
    this.emit('availability', this.availability());
  }

  arrive(): void {
    this.#available = 'ready';
    this.emit('availability', this.availability());
    this.emit('status', this.#status);
    this.emit('list', this.#list);
  }

  fail(code: ErrorCode, message: string, cause?: VaultError['cause']): void {
    this.#fail = { code, message, cause };
  }

  #failed(): void {
    const fail = this.#fail;
    this.#fail = null;
    if (fail) throw vaultFailure(fail.code, fail.message, fail.cause);
  }

  async acknowledge(notice: string): Promise<void> {
    await this.#time.sleep(5);
    this.acknowledged.push(notice);
  }

  async dismissBackupReminder(): Promise<void> {
    await this.#time.sleep(5);
    this.#failed();
    this.#status = { ...this.#status, backupReminder: 'dismissed' };
    this.emit('status', this.#status);
  }

  async audit(before?: number, limit = 50): Promise<AuditPage> {
    await this.#time.sleep(5);
    const all = [...this.#list.audit, ...this.#older];
    const page = all.filter((entry) => before === undefined || entry.seq < before).slice(0, limit);
    const more = page.length > 0 && all.some((entry) => entry.seq < page[page.length - 1].seq);
    return { audit: page, more, ...(more ? { next: page[page.length - 1].seq } : {}) };
  }

  #unlocked(): void {
    this.#failed();
    if (this.#status.locked) throw vaultFailure('EACCES', 'vault is locked');
  }

  #find(name: string, kind: RecordKind): SecretView {
    this.#failed();
    const secret = this.#list.secrets.find((item) => item.name === name && item.kind === kind);
    if (!secret) throw vaultFailure('ENOENT', `There is no secret named ${name}.`);
    return secret;
  }

  #log(name: string, entry: Record<string, unknown>): void {
    const seq = Math.max(0, ...this.#list.audit.map((item) => item.seq)) + 1;
    const audit = [
      { seq, id: `audit-${seq}`, at: Date.now(), name, uid: null, tag: null, ...entry },
      ...this.#list.audit,
    ] as AuditEntry[];
    this.#list = { ...this.#list, audit };
  }

  #save(secret: SecretView, rotated: boolean): SealResult {
    this.#list = {
      ...this.#list,
      secrets: [
        ...this.#list.secrets.filter(
          (item) => item.name !== secret.name || item.kind !== secret.kind
        ),
        secret,
      ],
    };
    this.#log(secret.name, { type: 'seal', source: secret.source, rotated });
    this.emit('list', this.#list);
    return { name: secret.name, placeholder: secret.placeholder, state: secret.state };
  }

  #seal(
    name: string,
    source: SecretView['source'],
    kind: RecordKind = 'secret',
    binding: { provider?: string; server?: string; settings?: Record<string, string> } = {}
  ): SealResult {
    const old = this.#list.secrets.find((item) => item.name === name && item.kind === kind);
    if (old) {
      const state = old.state === 'removed' ? (old.rules.length ? 'active' : 'inert') : old.state;
      const { removedAt: _, ...kept } = old;
      return this.#save({ ...kept, ...binding, state, source }, true);
    }
    this.#serial += 1;
    return this.#save(
      {
        name,
        kind,
        placeholder: `fnox_proxy_new${String(this.#serial).padStart(5, '0')}`,
        state: 'inert',
        source,
        sourceDevice: null,
        ...binding,
        domains: [],
        rules: [],
        exec: false,
        createdAt: Date.now(),
      },
      false
    );
  }

  async put(
    name: string,
    value: string,
    request?: string,
    options?: PutOptions
  ): Promise<SealResult> {
    await this.#time.sleep(5);
    this.#unlocked();
    const problem = nameProblem(name) ?? valueProblem(value);
    if (problem) throw vaultFailure('EINVAL', problem);
    if (request !== undefined) this.#take(request, name);
    if (options?.settings) refused(options.settings);
    this.puts.push({
      name,
      ...(request === undefined ? {} : { request }),
      ...(options ? { options: { ...options } } : {}),
    });
    const { kind = 'secret', provider, server, settings } = options ?? {};
    return this.#seal(name, 'settings', kind, {
      ...(provider === undefined ? {} : { provider }),
      ...(server === undefined ? {} : { server }),
      ...(settings === undefined ? {} : { settings: { ...settings } }),
    });
  }

  async settings(name: string, kind: RecordKind, settings: Record<string, string>): Promise<void> {
    await this.#time.sleep(5);
    this.#unlocked();
    const secret = this.#find(name, kind);
    refused(settings);
    this.settingsCalls.push({ name, kind, settings: { ...settings } });
    this.#list = {
      ...this.#list,
      secrets: this.#list.secrets.map((item) =>
        item === secret ? { ...item, settings: { ...settings } } : item
      ),
    };
    this.emit('list', this.#list);
  }

  #take(request: string, name?: string): void {
    const found = this.#status.waiting.find((item) => item.id === request);
    if (!found) throw vaultFailure('ENOENT', 'That request is no longer waiting.');
    if (name !== undefined && found.name !== undefined && found.name !== name)
      throw vaultFailure('EINVAL', `That request asks for ${found.name}.`);
    this.#status = {
      ...this.#status,
      waiting: this.#status.waiting.filter((item) => item.id !== request),
    };
    this.emit('status', this.#status);
  }

  async cancel(request: string, only?: PendingRequest): Promise<RequestState> {
    await this.#time.sleep(5);
    this.#failed();
    if (only !== undefined && this.ask(request) !== only) {
      this.cancelled.push(request);
      return 'cancelled';
    }
    if (!this.#ended(request)) this.#take(request);
    this.cancelled.push(request);
    return 'cancelled';
  }

  async unpin(names: string[]): Promise<void> {
    await this.#time.sleep(5);
    this.#unlocked();
    for (const name of names) {
      const pin = this.#list.audit.find(
        (entry) => entry.type === 'endpoints' && entry.pinned?.name === name
      );
      if (pin?.type === 'endpoints' && pin.pinned)
        this.#log(name, { type: 'endpoints', unpinned: pin.pinned });
    }
    this.emit('list', this.#list);
  }

  async remove(name: string, kind: RecordKind = 'secret'): Promise<SealResult> {
    await this.#time.sleep(5);
    const secret = { ...this.#find(name, kind), state: 'removed' as const, removedAt: Date.now() };
    return this.#flip(secret, 'remove');
  }

  async restore(name: string, kind: RecordKind = 'secret'): Promise<SealResult> {
    await this.#time.sleep(5);
    const { removedAt: _, ...secret } = this.#find(name, kind);
    return this.#flip({ ...secret, state: secret.rules.length ? 'active' : 'inert' }, 'restore');
  }

  #flip(secret: SecretView, type: 'remove' | 'restore'): SealResult {
    this.#list = {
      ...this.#list,
      secrets: this.#list.secrets.map((item) =>
        item.name === secret.name && item.kind === secret.kind ? secret : item
      ),
    };
    this.#log(secret.name, { type });
    this.emit('list', this.#list);
    return { name: secret.name, placeholder: secret.placeholder, state: secret.state };
  }

  async import(
    kind: ImportKind,
    bytes: Uint8Array,
    options: { password?: string; pick?: ImportPick[] } = {}
  ): Promise<ImportResult> {
    await this.#time.sleep(5);
    this.#unlocked();
    if (kind === 'six') throw vaultFailure('ENOTSUP', 'six imports are not supported yet.');
    if (!bytes.length) throw vaultFailure('EINVAL', 'The file is empty.');
    const { pick } = options;
    this.imports.push({
      kind,
      size: bytes.length,
      password: !!options.password,
      ...(pick ? { pick: [...pick] } : {}),
    });
    const offered = kind === 'keepass' ? [...candidates, duplicate] : candidates;
    if (!pick) return { stage: 'pick', candidates: offered.map((item) => ({ ...item })) };
    const chosen = new Map(
      pick.map((item) =>
        typeof item === 'string' ? [item, 'secret' as const] : [item.name, item.kind]
      )
    );
    const taken = offered.filter((item) => chosen.has(item.name) && !item.refused);
    return {
      stage: 'done',
      imported: taken.map((item) => this.#seal(item.name, `import:${kind}`, chosen.get(item.name))),
      skipped: offered.filter((item) => !taken.includes(item)).map((item) => item.name),
      reasons: Object.fromEntries(
        offered.flatMap((item) => (item.refused ? [[item.name, item.refused]] : []))
      ),
    };
  }

  async export(passphrase: string): Promise<Uint8Array> {
    await this.#time.sleep(5);
    this.#unlocked();
    if (new TextEncoder().encode(passphrase).length < 8)
      throw vaultFailure('EINVAL', 'Passphrases need at least 8 bytes.');
    this.exported += 1;
    this.#status = { ...this.#status, exportedAt: Date.now(), backupReminder: null };
    this.emit('status', this.#status);
    return new TextEncoder().encode('slicc-vault invented bundle');
  }

  async lock(): Promise<void> {
    await this.#time.sleep(5);
    this.#failed();
    this.#status = { ...this.#status, locked: true };
    this.emit('status', this.#status);
  }

  button(): DummyVaultButton {
    const button = new DummyVaultButton(this, this.#time);
    this.buttons.push(button);
    return button;
  }

  valueFrame(request: string): DummyValueFrame {
    const frame = new DummyValueFrame(this, this.#time, request);
    this.frames.push(frame);
    return frame;
  }

  hold(request: PendingRequest): void {
    this.#status = {
      ...this.#status,
      waiting: [...this.#status.waiting.filter(({ id }) => id !== request.id), request],
    };
    this.emit('status', this.#status);
  }

  ask(request: string): PendingRequest | undefined {
    return (
      this.#entries.get(request)?.pending ??
      this.#status.waiting.find(({ id, kind }) => id === request && kind === 'ask')
    );
  }

  enter?: (options: EnterOptions) => Promise<EnterResult> = (options) => this.#open(options);

  async #open(options: EnterOptions): Promise<EnterResult> {
    await this.#time.sleep(5);
    this.#failed();
    const { name, kind = 'secret', replace } = options;
    const bad = nameProblem(name);
    if (bad) throw vaultFailure('EINVAL', bad);
    const live = this.#list.secrets.some(
      (secret) => secret.name === name && secret.kind === kind && secret.state !== 'removed'
    );
    if (live && !replace)
      throw vaultFailure('EEXIST', `${name} already holds a value; replace it instead`);
    if (options.settings) refused(options.settings);
    this.#serial += 1;
    const request = `enter-${this.#serial}`;
    const now = Date.now();
    this.entered.push({ ...options });
    this.#entries.set(request, {
      options,
      pending: {
        id: request,
        kind: 'ask',
        name,
        mode: 'enter',
        uid: 0,
        tag: null,
        createdAt: now,
        expiresAt: now + 5 * minute,
      },
    });
    return { request };
  }

  #ended(request: string): boolean {
    if (!this.#entries.delete(request)) return false;
    this.emit('status', this.#status);
    return true;
  }

  #asked(request: string): PendingRequest {
    this.#unlocked();
    const found = this.ask(request);
    if (!found) throw vaultFailure('ENOENT', 'That request is no longer waiting.');
    return found;
  }

  async seal(request: string, value: string): Promise<SealResult> {
    await this.#time.sleep(5);
    const found = this.#asked(request);
    const problem = valueProblem(value);
    if (problem) throw vaultFailure('EINVAL', problem);
    this.answered.add(request);
    const entry = this.#entries.get(request);
    if (!entry) {
      this.#take(request);
      return this.#seal(found.name as string, 'settings');
    }
    this.#ended(request);
    const { kind = 'secret', provider, server, settings } = entry.options;
    return this.#seal(found.name as string, 'settings', kind, {
      ...(provider === undefined ? {} : { provider }),
      ...(server === undefined ? {} : { server }),
      ...(settings === undefined ? {} : { settings: { ...settings } }),
    });
  }

  async allow(request: string): Promise<void> {
    await this.#time.sleep(5);
    const found = this.#asked(request);
    this.answered.add(request);
    this.revealed.push(request);
    this.#take(request);
    const { exe, argv, cwd, kind } = found.requester as NonNullable<PendingRequest['requester']>;
    this.#log(found.name as string, {
      type: 'reveal',
      uid: found.uid,
      tag: found.tag,
      exe,
      argv: argv.join(' '),
      cwd,
      requester: kind,
      request,
    });
    this.emit('list', this.#list);
  }

  autoLabel(): string {
    return this.#status.locked ? 'Vault locked' : 'Vault unlocked';
  }

  autoIntent(): PopupIntent {
    return this.#status.locked ? { kind: 'unlock' } : { kind: 'protect' };
  }

  async answer(intent: PopupIntent): Promise<void> {
    await this.#time.sleep(10);
    this.#status =
      intent.kind === 'unlock'
        ? {
            ...this.#status,
            locked: false,
            scrub: { needed: false, version: 0, ...this.#status.scrub, ready: true },
          }
        : { ...this.#status, lock: 'passkey' };
    this.emit('status', this.#status);
  }
}
