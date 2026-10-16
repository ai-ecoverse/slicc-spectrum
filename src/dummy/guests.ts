import { Emitter } from '../model/emitter.ts';
import type { GuestDraft, GuestEvents, GuestPort, GuestSeat } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type GuestsScenario = 'on' | 'none' | 'unavailable' | 'fail';

const hour = 3_600_000;
const day = 24 * hour;
const cap = 30 * day;

export const guestsUnavailable =
  'Guests need the tray hub. Connect this SLICC to a tray to invite one.';

export const guestsRefused = 'The hub couldn’t make a link right now. Try again in a minute.';

export function guestsFixtures(scenario: GuestsScenario, now = Date.now()): GuestSeat[] {
  if (scenario === 'none' || scenario === 'unavailable') return [];
  return [
    {
      id: 'seat-mara',
      label: 'Seat 1 (Mara)',
      agentId: 'cone-sliccy',
      createdAt: now - 2 * hour,
      expiresAt: now + 5 * day + 3 * hour,
      gates: { messages: 'user', tools: 'user' },
      connected: true,
      pending: 2,
    },
    {
      id: 'seat-ole',
      label: 'Seat 2 (Ole)',
      agentId: 'cone-harbor',
      createdAt: now - 3 * day,
      expiresAt: null,
      gates: { messages: 'scoop:quiet-otter', tools: 'agent' },
      connected: false,
      pending: 0,
    },
  ];
}

export class DummyGuests extends Emitter<GuestEvents> implements GuestPort {
  scenario: GuestsScenario;
  #seats: GuestSeat[];
  #clock: Clock;
  #count = 0;

  constructor(scenario: GuestsScenario, clock: Clock) {
    super();
    this.scenario = scenario;
    this.#clock = clock;
    this.#seats = guestsFixtures(scenario);
  }

  list(): readonly GuestSeat[] {
    return this.#seats;
  }

  unavailable(): string | null {
    return this.scenario === 'unavailable' ? guestsUnavailable : null;
  }

  setScenario(scenario: GuestsScenario): void {
    this.scenario = scenario;
    this.#seats = guestsFixtures(scenario);
    this.emit('unavailable', this.unavailable());
    this.emit('seats', this.#seats);
  }

  async mint(agentId: string, draft: GuestDraft): Promise<{ seat: GuestSeat; url: string }> {
    await this.#clock.sleep(4);
    const refused = this.unavailable() ?? (this.scenario === 'fail' ? guestsRefused : null);
    if (refused) throw new Error(refused);
    this.#count += 1;
    const now = Date.now();
    const seat: GuestSeat = {
      id: `seat-${now.toString(36)}-${this.#count}`,
      label: draft.label,
      agentId,
      createdAt: now,
      expiresAt: draft.expiresAt === null ? null : Math.min(draft.expiresAt, now + cap),
      gates: draft.gates,
      connected: false,
      pending: 0,
    };
    this.#seats = [...this.#seats, seat];
    this.emit('seats', this.#seats);
    return { seat, url: `https://www.example.com/guest/${seat.id}#k=Tq7Lm2Vx9Rb4` };
  }

  async revoke(id: string): Promise<void> {
    await this.#clock.sleep(4);
    if (!this.#seats.some((seat) => seat.id === id)) throw new Error('That guest is already gone.');
    this.#seats = this.#seats.filter((seat) => seat.id !== id);
    this.emit('seats', this.#seats);
  }
}
