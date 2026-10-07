import { Emitter } from '../model/emitter.ts';
import type {
  Account,
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
    await this.#clock.sleep(10);
    const account = this.#accounts.find((candidate) => candidate.id === id);
    if (account?.auth === 'api-key' && !secret)
      throw new Error(`${account.provider} needs an API key`);
    const identity =
      account?.auth === 'api-key' ? 'API key' : account?.identity || `${id}-user@example.com`;
    this.#set(id, { status: 'connected', identity });
  }

  disconnect(id: string): void {
    this.#set(id, { status: 'disconnected' });
  }
}
