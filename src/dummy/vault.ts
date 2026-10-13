import { Emitter } from '../model/emitter.ts';
import type {
  AuditEntry,
  AuditPage,
  Availability,
  ButtonConfig,
  ButtonEvent,
  ButtonMessage,
  ErrorCode,
  ImportCandidate,
  ImportKind,
  ImportPick,
  ImportResult,
  PendingRequest,
  PolicyNotice,
  PopupIntent,
  RecordKind,
  RefusedRule,
  RequestState,
  SealResult,
  SecretView,
  VaultButton,
  VaultEvents,
  VaultList,
  VaultPort,
  VaultStatus,
} from '../model/types.ts';
import { nameProblem, valueProblem, vaultFailure } from '../model/values.ts';
import type { Clock } from './clock.ts';

export type VaultScenario =
  | 'empty'
  | 'secrets'
  | 'policy'
  | 'notice'
  | 'locked'
  | 'request'
  | 'backup'
  | 'waiting';

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
  const status: VaultStatus = {
    version: '0.1.0',
    protocol: 1,
    origin: 'https://vault.sliccy.ai',
    locked: scenario === 'locked',
    lock: 'passkey',
    scrub: { needed: !empty, version: 3, ready: scenario !== 'locked' },
    waiting: waiting(scenario, now),
    ...(backup ? { backupReminder: 'due' as const, exportedAt: null } : {}),
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
    audit: empty ? [] : [...(policy ? [vaultPolicy(now)] : []), ...vaultAudit(now)],
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
  #fail: { code: ErrorCode; message: string } | null = null;
  #time: Clock;
  #older: AuditEntry[] = vaultOlder();
  #serial = 0;
  buttons: DummyVaultButton[] = [];
  puts: { name: string; request?: string }[] = [];
  cancelled: string[] = [];
  imports: DummyImport[] = [];
  exported = 0;
  acknowledged: string[] = [];

  constructor(scenario: VaultScenario, time: Clock) {
    super();
    const { status, list } = vaultFixtures(scenario);
    this.#status = status;
    this.#list = list;
    this.#time = time;
    this.#available = scenario === 'waiting' ? 'waiting' : 'ready';
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

  arrive(): void {
    this.#available = 'ready';
    this.emit('availability', this.availability());
    this.emit('status', this.#status);
    this.emit('list', this.#list);
  }

  fail(code: ErrorCode, message: string): void {
    this.#fail = { code, message };
  }

  #failed(): void {
    const fail = this.#fail;
    this.#fail = null;
    if (fail) throw vaultFailure(fail.code, fail.message);
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
      secrets: [...this.#list.secrets.filter((item) => item.name !== secret.name), secret],
    };
    this.#log(secret.name, { type: 'seal', source: secret.source, rotated });
    this.emit('list', this.#list);
    return { name: secret.name, placeholder: secret.placeholder, state: secret.state };
  }

  #seal(name: string, source: SecretView['source'], kind: RecordKind = 'secret'): SealResult {
    const old = this.#list.secrets.find((item) => item.name === name && item.kind === kind);
    if (old) {
      const state = old.state === 'removed' ? (old.rules.length ? 'active' : 'inert') : old.state;
      const { removedAt: _, ...kept } = old;
      return this.#save({ ...kept, state, source }, true);
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
        domains: [],
        rules: [],
        exec: false,
        createdAt: Date.now(),
      },
      false
    );
  }

  async put(name: string, value: string, request?: string): Promise<SealResult> {
    await this.#time.sleep(5);
    this.#unlocked();
    const problem = nameProblem(name) ?? valueProblem(value);
    if (problem) throw vaultFailure('EINVAL', problem);
    if (request !== undefined) this.#take(request, name);
    this.puts.push({ name, ...(request === undefined ? {} : { request }) });
    return this.#seal(name, 'settings');
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

  async cancel(request: string): Promise<RequestState> {
    await this.#time.sleep(5);
    this.#failed();
    this.#take(request);
    this.cancelled.push(request);
    return 'cancelled';
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
