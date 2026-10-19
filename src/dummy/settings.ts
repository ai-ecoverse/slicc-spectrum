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

export const dummySettingsKey = 'slicc-ui.settings';
export const signInClosed = 'The sign-in window was closed before it finished.';

export class DummySettings extends Emitter<SettingsEvents> implements SettingsPort {
  #settings: Settings;
  #accounts: Account[];
  #models: readonly ModelOption[];
  #storage: Storage | null;
  #clock: Clock;
  #keys: readonly string[];
  #signIns = new Map<string, { before: AccountStatus; stop: () => void }>();
  #gated: boolean;
  #fails: boolean;
  readonly connects: Array<{
    id: string;
    gesture: boolean | null;
    fields?: Record<string, string>;
  }> = [];

  constructor(
    defaults: Settings,
    models: readonly ModelOption[],
    accounts: readonly Account[],
    storage: Storage | null,
    clock: Clock,
    keys: readonly string[] = [dummySettingsKey],
    gated = false,
    login?: 'ok' | 'fail'
  ) {
    super();
    this.#fails = login === 'fail';
    this.#gated = gated;
    this.#keys = keys;
    this.#storage = storage;
    this.#clock = clock;
    this.#models = models;
    this.#accounts = accounts.map((account) => ({ ...account }));
    this.#settings = { ...defaults, ...this.#load() };
  }

  #load(): Partial<Settings> {
    try {
      const saved = this.#keys
        .map((key) => this.#storage?.getItem(key))
        .find((value) => value != null);
      return JSON.parse(saved ?? '{}');
    } catch {
      return {};
    }
  }

  get(): Settings {
    return { ...this.#settings };
  }

  update(patch: Partial<Settings>): void {
    this.#settings = { ...this.#settings, ...patch };
    this.#storage?.setItem(this.#keys[0], JSON.stringify(this.#settings));
    this.emit('settings', this.get());
  }

  models(): readonly ModelOption[] {
    if (!this.#gated) return this.#models;
    const live = new Set(
      this.#accounts
        .filter((account) => account.status === 'connected')
        .map((account) => account.provider)
    );
    return this.#models.filter((option) => live.has(option.provider));
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

  async connect(id: string, secret?: string, fields?: Record<string, string>): Promise<void> {
    const activation = (globalThis.navigator as Navigator | undefined)?.userActivation;
    this.connects.push({
      id,
      gesture: activation ? activation.isActive : null,
      ...(fields ? { fields } : {}),
    });
    const account = this.#accounts.find((candidate) => candidate.id === id);
    if (account && account.auth !== 'api-key' && !(await this.#signIn(account))) return;
    if (account && account.auth !== 'api-key' && this.#fails) {
      this.#set(id, { status: account.status });
      throw new Error(signInClosed);
    }
    if (account?.auth === 'api-key' || !account) await this.#clock.sleep(10);
    if (account?.auth === 'api-key' && account.store !== 'vault' && !secret)
      throw new Error(
        `${account.provider} needs ${account.secret === 'token' ? 'a token' : 'an API key'}`
      );
    const identity =
      account?.group === 'mcp'
        ? account.identity
        : account?.auth === 'api-key'
          ? 'API key'
          : account?.identity || `${id}-user@example.com`;
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
