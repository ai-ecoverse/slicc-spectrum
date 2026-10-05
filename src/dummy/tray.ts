import { Emitter } from '../model/emitter.ts';
import type { TrayEvents, TrayPort, TrayStatus } from '../model/types.ts';
import type { Clock } from './clock.ts';

export class DummyTray extends Emitter<TrayEvents> implements TrayPort {
  #status: TrayStatus;
  #followers: TrayStatus['followers'];
  #clock: Clock;

  constructor(status: TrayStatus, clock: Clock) {
    super();
    this.#status = structuredClone(status);
    this.#followers = structuredClone(status.followers);
    this.#clock = clock;
  }

  status(): TrayStatus {
    return structuredClone(this.#status);
  }

  #set(patch: Partial<TrayStatus>): void {
    this.#status = { ...this.#status, ...patch };
    this.emit('status', this.status());
  }

  reconnect(): void {
    this.#set({ connection: 'reconnecting' });
    void this.#clock
      .sleep(15)
      .then(() => this.#set({ connection: 'live', followers: structuredClone(this.#followers) }));
  }

  disconnect(): void {
    this.#set({ connection: 'offline', followers: [] });
  }
}
