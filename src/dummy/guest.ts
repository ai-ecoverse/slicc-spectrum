import { Emitter } from '../model/emitter.ts';
import type {
  Agent,
  AgentEvents,
  AgentPort,
  AgentStatus,
  AssistantMessage,
  BrowserPort,
  FilePort,
  MemoryPort,
  Message,
  MonitorPort,
  Outgoing,
  Seat,
  SliccModel,
  Sprinkle,
  SprinkleEvents,
  SprinklePort,
  TerminalPort,
  TrayPort,
} from '../model/types.ts';
import { type Clock, clock } from './clock.ts';
import { agents, defaults } from './fixtures.ts';
import { DummySettings } from './settings.ts';

export type SeatScenario = 'review' | 'off' | 'expiring';

export const guestOnly = 'a guest can only watch and send messages';

export const guestReview =
  "Messages from guests need a review, and this agent can't review them yet.";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const guestLabel = 'Seat 2 (Mara)';

export const guestSettingsKey = 'slicc-guest-settings';

export const otherGuest = 'Seat 3 (Jonas)';

export function guestSeat(scenario: SeatScenario, now = Date.now()): Seat {
  return {
    id: 'seat-mara',
    label: guestLabel,
    agentId: 'cone-sliccy',
    expiresAt: scenario === 'expiring' ? now + 3 * hour + 20 * minute : now + 6 * day,
    gates: { messages: scenario === 'off' ? 'off' : 'user', tools: 'user' },
  };
}

export const forecastSprinkle: Sprinkle = {
  id: 'cone-sliccy/forecast',
  name: 'forecast',
  title: 'Forecast',
  icon: 'sun',
  agentId: 'cone-sliccy',
  inline: true,
  html: "<style>body { font-family: var(--s2-font-family); color: var(--s2-content-default); padding: var(--s2-spacing-200) var(--s2-spacing-300); } table { border-collapse: collapse; } td { padding: 4px 12px 4px 0; }</style><table><tr><td>Fri</td><td>21°</td><td>Sunny</td></tr><tr><td>Sat</td><td>19°</td><td>Cloudy</td></tr><tr><td>Sun</td><td>18°</td><td>Showers</td></tr></table><script>window.slicc.lick({ action: 'viewed', data: { rows: 3 } });</script>",
};

export function guestTranscript(now = Date.now()): Message[] {
  const at = (minutes: number) => now - minutes * minute;
  return [
    {
      id: 'g-1',
      role: 'user',
      text: 'Check the Porto forecast endpoint before Mara joins.',
      createdAt: at(42),
    },
    {
      id: 'g-2',
      role: 'assistant',
      status: 'done',
      createdAt: at(41),
      model: 'claude-sonnet-5-5',
      parts: [
        { type: 'text', text: 'I read the handler and ran its tests.' },
        {
          type: 'tool',
          tool: {
            id: 'g-t1',
            name: 'read_file',
            title: 'Read forecast.ts',
            input: '/workspace/harbor/src/forecast.ts',
            output: 'export async function forecast(city: string) { … }',
            status: 'done',
            paths: ['/workspace/harbor/src/forecast.ts'],
          },
        },
        {
          type: 'tool',
          tool: {
            id: 'g-t2',
            name: 'bash',
            title: 'npm test -- forecast',
            input: 'npm test -- forecast',
            output: '12 passing',
            status: 'done',
            paths: [],
          },
        },
        { type: 'text', text: 'The endpoint answers for Porto, and all 12 tests pass.' },
      ],
    },
    {
      id: 'g-3',
      role: 'user',
      text: 'Hi! Could you add the weekend to the forecast table?',
      createdAt: at(30),
      origin: 'guest',
      from: guestLabel,
      delivered: 'follow-up',
    },
    {
      id: 'g-4',
      role: 'assistant',
      status: 'done',
      createdAt: at(29),
      model: 'claude-sonnet-5-5',
      parts: [
        { type: 'text', text: 'Here is the table with Friday to Sunday.' },
        { type: 'sprinkle', sprinkle: forecastSprinkle.id },
      ],
    },
    {
      id: 'g-5',
      role: 'user',
      text: 'Does it cover Lisbon too?',
      createdAt: at(12),
      origin: 'guest',
      from: otherGuest,
      delivered: 'follow-up',
    },
    {
      id: 'g-6',
      role: 'assistant',
      status: 'done',
      createdAt: at(11),
      model: 'claude-sonnet-5-5',
      parts: [
        { type: 'text', text: 'Not yet. I can add it.' },
        {
          type: 'question',
          question: {
            id: 'g-q1',
            kind: 'yes-no',
            question: 'Add Lisbon to the forecast?',
            options: [],
            state: 'open',
          },
        },
      ],
    },
    {
      id: 'g-7',
      role: 'lick',
      channel: 'sudo-request',
      title: 'sliccy',
      text: 'wants to fetch the Lisbon forecast',
      body: 'curl -s https://api.example.com/forecast?city=lisbon',
      state: 'pending',
      createdAt: at(10),
      expiresAt: now + 20 * minute,
    },
    {
      id: 'g-8',
      role: 'system',
      kind: 'error',
      title: 'The model is busy',
      text: 'The provider asked to slow down.',
      action: 'retry',
      createdAt: at(9),
    },
  ];
}

export function refusal(): Error {
  return Object.assign(new Error(guestOnly), { code: 'EACCES' });
}

function closed<T extends object>(name: string, refused: string[]): T {
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'on') return () => () => undefined;
        if (typeof key !== 'string' || key === 'then') return undefined;
        return () => {
          refused.push(`${name}.${key}`);
          return Promise.reject(refusal());
        };
      },
    }
  ) as T;
}

export class DummyGuestAgent extends Emitter<AgentEvents> implements AgentPort {
  readonly refused: string[];
  #cone: Agent;
  #messages: Message[];
  #seat: Seat;
  #clock: Clock;
  #next = 1;

  constructor(
    cone: Agent,
    messages: readonly Message[],
    seat: Seat,
    time: Clock,
    refused: string[]
  ) {
    super();
    this.#cone = { ...cone };
    this.#messages = structuredClone([...messages]);
    this.#seat = seat;
    this.#clock = time;
    this.refused = refused;
  }

  list(): readonly Agent[] {
    return [{ ...this.#cone }];
  }

  active(): string {
    return this.#cone.id;
  }

  messages(agentId: string): readonly Message[] {
    return agentId === this.#cone.id ? [...this.#messages] : [];
  }

  busy(): boolean {
    return this.#cone.status !== 'idle';
  }

  queue(): readonly never[] {
    return [];
  }

  suggestion(): null {
    return null;
  }

  commands(): readonly never[] {
    return [];
  }

  frozen(): readonly never[] {
    return [];
  }

  hold(): null {
    return null;
  }

  readOnly(): null {
    return null;
  }

  async ready(): Promise<void> {}

  async older(): Promise<readonly Message[]> {
    return [];
  }

  #refuse(name: string): Promise<never> {
    this.refused.push(`agent.${name}`);
    return Promise.reject(refusal());
  }

  #throw(name: string): never {
    this.refused.push(`agent.${name}`);
    throw refusal();
  }

  select(): Promise<never> {
    return this.#refuse('select');
  }

  stop(): Promise<never> {
    return this.#refuse('stop');
  }

  unqueue(): Promise<never> {
    return this.#refuse('unqueue');
  }

  answer(): Promise<never> {
    return this.#refuse('answer');
  }

  resolveLick(): Promise<never> {
    return this.#refuse('resolveLick');
  }

  compact(): Promise<never> {
    return this.#refuse('compact');
  }

  clear(): Promise<never> {
    return this.#refuse('clear');
  }

  setModel(): Promise<never> {
    return this.#refuse('setModel');
  }

  setThinking(): Promise<never> {
    return this.#refuse('setThinking');
  }

  discard(): Promise<never> {
    return this.#refuse('discard');
  }

  createScoop(): never {
    return this.#throw('createScoop');
  }

  thaw(): never {
    return this.#throw('thaw');
  }

  #status(status: AgentStatus): void {
    this.#cone.status = status;
    this.emit('agents', this.list());
  }

  #post(message: Message): void {
    this.#messages.push(message);
    this.emit('message', { agentId: this.#cone.id, message });
  }

  async send(agentId: string, input: string | Outgoing): Promise<void> {
    const text = (typeof input === 'string' ? input : input.text).trim();
    if (agentId !== this.#cone.id || !text) return;
    if (this.#seat.gates.messages !== 'off') throw new Error(guestReview);
    this.#post({
      id: `guest-${this.#next++}`,
      role: 'user',
      text,
      createdAt: Date.now(),
      origin: 'guest',
      from: this.#seat.label,
      delivered: 'follow-up',
    });
    this.#status('thinking');
    const reply: AssistantMessage = {
      id: `guest-${this.#next++}`,
      role: 'assistant',
      status: 'streaming',
      createdAt: Date.now(),
      model: this.#cone.model,
      parts: [{ type: 'text', text: '' }],
    };
    this.#post(reply);
    await this.#clock.sleep(4);
    reply.parts = [{ type: 'text', text: `Hello ${this.#seat.label}. I’m on it.` }];
    reply.status = 'done';
    this.emit('message', { agentId: this.#cone.id, message: reply });
    this.#status('idle');
  }
}

class GuestSprinkles extends Emitter<SprinkleEvents> implements SprinklePort {
  #refused: string[];

  constructor(refused: string[]) {
    super();
    this.#refused = refused;
  }

  list(): readonly Sprinkle[] {
    return [forecastSprinkle];
  }

  send(): void {
    this.#refused.push('sprinkles.send');
  }
}

export interface GuestOptions {
  seat?: SeatScenario;
  history?: 'on' | 'none';
  delay?: number;
  storage?: Storage | null;
}

export interface GuestModel extends SliccModel {
  seat: Seat;
  agent: DummyGuestAgent;
  refused: string[];
}

export function createGuestModel({
  seat: scenario = 'review',
  history = 'on',
  delay = 30,
  storage = null,
}: GuestOptions = {}): GuestModel {
  const time = clock(delay);
  const refused: string[] = [];
  const seat = guestSeat(scenario);
  const cone = agents.find((agent) => agent.id === seat.agentId) as Agent;
  const agent = new DummyGuestAgent(
    cone,
    history === 'on' ? guestTranscript() : [],
    seat,
    time,
    refused
  );
  return {
    seat,
    agent,
    refused,
    settings: new DummySettings(defaults, [], [], storage, time, [guestSettingsKey]),
    sprinkles: new GuestSprinkles(refused),
    files: closed<FilePort>('files', refused),
    terminals: closed<TerminalPort>('terminals', refused),
    browser: closed<BrowserPort>('browser', refused),
    memory: closed<MemoryPort>('memory', refused),
    monitor: closed<MonitorPort>('monitor', refused),
    tray: closed<TrayPort>('tray', refused),
  };
}
