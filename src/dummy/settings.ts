import { Emitter } from '../model/emitter.ts';
import type {
  Account,
  AccountStatus,
  ModelOption,
  Settings,
  SettingsEvents,
  SettingsPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

const key = 'slicc-ui.settings';

export class DummySettings extends Emitter<SettingsEvents> implements SettingsPort {
  #settings: Settings;
  #accounts: Account[];
  #models: readonly ModelOption[];
  #storage: Storage | null;
  #clock: Clock;
  #signIns = new Map<string, { before: AccountStatus; stop: () => void }>();

  constructor(
    defaults: Settings,
    models: readonly ModelOption[],
    accounts: readonly Account[],
    storage: Storage | null,
    clock: Clock
  ) {
    super();
    this.#storage = storage;
    this.#clock = clock;
    this.#models = models;
    this.#accounts = accounts.map((account) => ({ ...account }));
    this.#settings = { ...defaults, ...this.#load() };
  }

  #load(): Partial<Settings> {
    try {
      return JSON.parse(this.#storage?.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  }

  get(): Settings {
    return { ...this.#settings };
  }

  update(patch: Partial<Settings>): void {
    this.#settings = { ...this.#settings, ...patch };
    this.#storage?.setItem(key, JSON.stringify(this.#settings));
    this.emit('settings', this.get());
  }

  models(): readonly ModelOption[] {
    return this.#models;
  }

  accounts(): readonly Account[] {
    return this.#accounts.map((account) => ({ ...account }));
  }

  #set(id: string, patch: Partial<Account>): void {
    this.#accounts = this.#accounts.map((account) =>
      account.id === id ? { ...account, ...patch } : account
    );
    this.emit('accounts', this.accounts());
  }

  async connect(id: string, secret?: string): Promise<void> {
    const account = this.#accounts.find((candidate) => candidate.id === id);
    if (account && account.auth !== 'api-key' && !(await this.#signIn(account))) return;
    if (account?.auth === 'api-key' || !account) await this.#clock.sleep(10);
    if (account?.auth === 'api-key' && !secret)
      throw new Error(`${account.provider} needs an API key`);
    const identity =
      account?.auth === 'api-key' ? 'API key' : account?.identity || `${id}-user@example.com`;
    this.#set(id, { status: 'connected', identity });
  }

  #signIn(account: Account): Promise<boolean> {
    const before = this.#signIns.get(account.id)?.before ?? account.status;
    this.#signIns.get(account.id)?.stop();
    this.#set(account.id, { status: 'signing-in' });
    return new Promise((resolve) => {
      const stop = () => {
        this.#signIns.delete(account.id);
        this.#set(account.id, { status: before });
        resolve(false);
      };
      this.#signIns.set(account.id, { before, stop });
      void this.#clock.sleep(100).then(() => {
        if (this.#signIns.get(account.id)?.stop !== stop) return;
        this.#signIns.delete(account.id);
        resolve(true);
      });
    });
  }

  cancel(id: string): void {
    this.#signIns.get(id)?.stop();
  }

  disconnect(id: string): void {
    this.#set(id, { status: 'disconnected' });
  }
}
