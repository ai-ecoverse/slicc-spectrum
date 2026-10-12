import { Emitter } from '../model/emitter.ts';
import type {
  AuditEntry,
  AuditPage,
  ButtonConfig,
  ButtonEvent,
  ButtonMessage,
  PolicyNotice,
  SecretView,
  VaultButton,
  VaultEvents,
  VaultList,
  VaultPort,
  VaultStatus,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type VaultScenario = 'empty' | 'secrets' | 'notice' | 'locked';

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
      source: 'popup',
      sourceDevice: null,
      domains: ['api.harbor.example'],
      rules: [harbor],
      exits: ['vault-direct', 'local-proxy', 'tailscale', 'device:link-pier'],
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
      exits: ['local-proxy'],
      exec: { argv: [['pier', 'publish']] },
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
      exits: ['vault-direct'],
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
      exits: ['vault-direct', 'local-proxy', 'cli-v'],
      exec: true,
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
      exits: ['vault-direct'],
      exec: false,
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
      type: 'inject',
      seq: 12,
      id: 'audit-12',
      at: now - 4 * minute,
      name: 'HARBOR_API_KEY',
      domain: 'api.harbor.example',
      method: 'GET',
      path: '/v2/ships',
      rule: harbor,
      exit: 'local-proxy',
    },
    {
      ...who,
      type: 'materialize',
      seq: 11,
      id: 'audit-11',
      at: now - 2 * hour,
      name: 'PIER_PUBLISH_TOKEN',
      grant: { argv: [['pier', 'publish']] },
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
      grant: { argv: [['pier', 'publish']] },
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
      widened: [{ kind: 'exit', secret: 'HARBOR_API_KEY', exit: 'tailscale' }],
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
      grant: { argv: [['pier', 'publish']] },
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
      widened: [],
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

export function vaultFixtures(
  scenario: VaultScenario,
  now = Date.now()
): { status: VaultStatus; list: VaultList } {
  const empty = scenario === 'empty';
  const notices = scenario === 'notice' ? [vaultNotice(now)] : [];
  const status: VaultStatus = {
    version: '0.1.0',
    protocol: 1,
    origin: 'https://vault.sliccy.ai',
    locked: scenario === 'locked',
    lock: 'passkey',
    waiting:
      scenario === 'locked'
        ? [
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
          ]
        : [],
    notices: notices.length,
  };
  const list: VaultList = {
    secrets: empty ? [] : vaultSecrets(now),
    notices,
    audit: empty ? [] : vaultAudit(now),
    auditMore: !empty,
  };
  return { status, list };
}

const labels = {
  unlock: 'Unlock the vault',
  enter: 'Enter the value',
  request: 'Answer in the vault',
  import: 'Import',
  export: 'Export',
  signin: 'Sign in',
  manage: 'Open the vault',
};

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
    const result = await this.#vault.answer(resolved);
    this.#emit({ event: 'popup', intent: resolved, state: 'done', ...(result ? { result } : {}) });
  }
}

export class DummyVault extends Emitter<VaultEvents> implements VaultPort {
  #status: VaultStatus;
  #list: VaultList;
  #time: Clock;
  buttons: DummyVaultButton[] = [];
  acknowledged: string[] = [];

  constructor(scenario: VaultScenario, time: Clock) {
    super();
    const { status, list } = vaultFixtures(scenario);
    this.#status = status;
    this.#list = list;
    this.#time = time;
  }

  status(): VaultStatus {
    return this.#status;
  }

  list(): VaultList {
    return this.#list;
  }

  async audit(before?: number, limit = 50): Promise<AuditPage> {
    await this.#time.sleep(5);
    const all = [...this.#list.audit, ...vaultOlder()];
    const page = all.filter((entry) => before === undefined || entry.seq < before).slice(0, limit);
    const more = page.length > 0 && all.some((entry) => entry.seq < page[page.length - 1].seq);
    return { audit: page, more, ...(more ? { next: page[page.length - 1].seq } : {}) };
  }

  async acknowledge(notice: string): Promise<void> {
    await this.#time.sleep(5);
    this.acknowledged.push(notice);
    const notices = this.#list.notices.filter((item) => item.id !== notice);
    this.#list = { ...this.#list, notices };
    this.#status = { ...this.#status, notices: notices.length };
    this.emit('list', this.#list);
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

  autoIntent(): { kind: 'unlock' } | { kind: 'manage' } {
    return this.#status.locked ? { kind: 'unlock' } : { kind: 'manage' };
  }

  async answer(
    intent: Exclude<ButtonConfig['intent'], 'auto'>
  ): Promise<{ name: string; placeholder: string; state: 'active' } | null> {
    await this.#time.sleep(10);
    if (intent.kind === 'unlock') {
      this.#status = { ...this.#status, locked: false };
      this.emit('status', this.#status);
      return null;
    }
    if (intent.kind !== 'request' && intent.kind !== 'enter') return null;
    const request = this.#status.waiting.find((item) => item.id === intent.request);
    const name = intent.kind === 'enter' ? intent.name : (request?.name ?? 'NEW_SECRET');
    this.#status = {
      ...this.#status,
      locked: false,
      waiting: this.#status.waiting.filter((item) => item !== request),
    };
    this.emit('status', this.#status);
    const record = this.#list.secrets.find((secret) => secret.name === name);
    return { name, placeholder: record?.placeholder ?? 'fnox_proxy_new00001', state: 'active' };
  }
}
