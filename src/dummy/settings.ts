import { Emitter } from '../model/emitter.ts';
import type {
  Account,
  AccountStatus,
  ModelOption,
  ProviderOption,
  Settings,
  SettingsEvents,
  SettingsPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';
import { providerAccount } from './providers.ts';

export const dummySettingsKey = 'slicc-ui.settings';
export const signInClosed = 'The sign-in window was closed before it finished.';

export type DummyTransport = 'none' | 'extension' | 'link';

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
  #transport: DummyTransport | undefined;
  #options: readonly ProviderOption[] = [];
  readonly connects: Array<{
    id: string;
    gesture: boolean | null;
    fields?: Record<string, string>;
  }> = [];
  providers?: () => readonly ProviderOption[];
  remove?: (id: string) => Promise<void>;

  constructor(
    defaults: Settings,
    models: readonly ModelOption[],
    accounts: readonly Account[],
    storage: Storage | null,
    clock: Clock,
    keys: readonly string[] = [dummySettingsKey],
    gated = false,
    login?: 'ok' | 'fail',
    providers?: readonly ProviderOption[],
    transport?: DummyTransport
  ) {
    super();
    this.#transport = transport;
    if (providers) {
      this.#options = providers;
      this.providers = () =>
        this.#transport === 'none' ? providers.map((option) => this.#block(option)) : providers;
      this.remove = async (id) => this.#drop(id);
    }
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
    return this.#accounts.map((account) => this.#block({ ...account }));
  }

  #block<T extends Account | ProviderOption>(row: T): T {
    if (this.#transport !== 'none' || !row.needs) return row;
    return { ...row, blocked: row.needs };
  }

  setTransport(transport: DummyTransport): void {
    this.#transport = transport;
    if (this.providers) this.emit('providers', this.providers());
    this.emit('accounts', this.accounts());
  }

  #set(id: string, patch: Partial<Account>): void {
    this.#accounts = this.#accounts.map((account) =>
      account.id === id ? { ...account, ...patch } : account
    );
    this.emit('accounts', this.accounts());
  }

  #drop(id: string): void {
    this.#signIns.get(id)?.stop();
    this.#accounts = this.#accounts.filter((account) => account.id !== id);
    this.emit('accounts', this.accounts());
  }

  #add(id: string): boolean {
    const option = this.#options.find((candidate) => candidate.id === id);
    if (!option || this.#accounts.some((account) => account.id === id)) return false;
    this.#accounts = [...this.#accounts, providerAccount(option)];
    this.emit('accounts', this.accounts());
    return true;
  }

  async connect(id: string, secret?: string, fields?: Record<string, string>): Promise<void> {
    const activation = (globalThis.navigator as Navigator | undefined)?.userActivation;
    this.connects.push({
      id,
      gesture: activation ? activation.isActive : null,
      ...(fields ? { fields } : {}),
    });
    const fresh = this.#add(id);
    try {
      if (!(await this.#connect(id, secret, fields)) && fresh) this.#drop(id);
    } catch (error) {
      if (fresh) this.#drop(id);
      throw error;
    }
  }

  async #connect(id: string, secret?: string, fields?: Record<string, string>): Promise<boolean> {
    const account = this.#accounts.find((candidate) => candidate.id === id);
    const local = account?.auth === 'local';
    const window = !!account && account.auth !== 'api-key' && !local;
    if (window && !(await this.#signIn(account))) return false;
    if (window && this.#fails) {
      this.#set(id, { status: account.status });
      throw new Error(signInClosed);
    }
    if (!window) await this.#clock.sleep(10);
    if (account?.auth === 'api-key' && account.store !== 'vault' && !secret)
      throw new Error(
        `${account.provider} needs ${account.secret === 'token' ? 'a token' : 'an API key'}`
      );
    if ([secret, ...Object.values(fields ?? {})].some((value) => value?.startsWith('bad')))
      throw new Error(`${account?.provider} didn’t accept that key.`);
    if (fields?.endpoint?.includes('://') && !fields.endpoint.startsWith('https://'))
      throw new Error('The endpoint must use https://.');
    const identity =
      account?.group === 'mcp'
        ? account.identity
        : local
          ? 'On this device'
          : account?.auth === 'api-key'
            ? 'API key'
            : account?.identity || `${id}-user@example.com`;
    this.#set(id, { status: 'connected', identity });
    return true;
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
