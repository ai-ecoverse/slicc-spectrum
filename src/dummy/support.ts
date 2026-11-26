import { Emitter } from '../model/emitter.ts';
import type {
  SupportConversation,
  SupportDraft,
  SupportEvents,
  SupportMessage,
  SupportPort,
  SupportReply,
  SupportStatus,
  SupportThread,
  SupportTopic,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type SupportScenario =
  | 'on'
  | 'signed-out'
  | 'sign-in-fail'
  | 'empty'
  | 'loading'
  | 'offline'
  | 'not-enrolled'
  | 'pending'
  | 'declined'
  | 'fail';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const supportChannel = 'Mill support';
export const supportAudience = 'Everyone approved at Paper Mill and Adobe Support';
export const supportMember = 'Mara Lind';
export const supportOrg = 'Paper Mill';
export const supportOtherOrg = 'Quay Labs';
export const supportSignInFailed = 'The sign-in window was closed before it finished.';
export const supportOffline =
  'Support can’t be reached right now. These are the requests loaded last.';
export const supportRefused = 'Support didn’t get that. Try again.';
export const supportConflict = 'That request key was already used for something else.';
export const supportDeclined =
  'We only open Support to the people your admin named. Ask Ilse Varga to add you.';
export const supportAnswer =
  'Thanks, we’re on it. We’ll reply here as soon as we know more, usually within the hour.';

export const supportTopics: readonly SupportTopic[] = [
  { id: 'access', label: 'Access and sign-in' },
  { id: 'builds', label: 'Builds and publishing' },
  { id: 'billing', label: 'Plan and billing' },
];

export function plainTitle(line: string): string {
  return line.replace(/^#+\s*/, '').replace(/[*_`~]/g, '');
}

interface Entry {
  thread: SupportThread;
  messages: SupportMessage[];
}

export function supportFixtures(now = Date.now()): Entry[] {
  const message = (
    id: string,
    ago: number,
    author: SupportMessage['author'],
    name: string,
    body: string,
    extra: Partial<SupportMessage> = {}
  ): SupportMessage => ({ id, at: now - ago, author, name, body, ...extra });
  return [
    {
      thread: {
        id: 'sup-preview',
        title: 'Preview builds stop after the first page',
        lastActivity: now - 25 * minute,
        resolved: false,
        unread: 1,
      },
      messages: [
        message(
          'sup-preview-1',
          2 * hour,
          'customer',
          'Mara Lind',
          'Preview builds stop after the first page\n\nBuilds and publishing\n\nSince this morning our preview builds stop after the first page. The publish step reports success, but only `/index` updates.'
        ),
        message(
          'sup-preview-2',
          40 * minute,
          'support',
          'Adobe Support',
          'Thanks, Mara. We see the same on two of your sites. When did the last build that worked run?'
        ),
        message(
          'sup-preview-3',
          30 * minute,
          'customer',
          'Ole Brandt',
          'The last good one was yesterday at 17:40.'
        ),
        message(
          'sup-preview-4',
          25 * minute,
          'support',
          'Adobe Support',
          'That helps. A queue for your region was stuck and we restarted it. Can you try **one more build**?'
        ),
      ],
    },
    {
      thread: {
        id: 'sup-editor',
        title: 'Add a new editor to the docs site',
        lastActivity: now - 2 * day,
        resolved: true,
        unread: 0,
      },
      messages: [
        message(
          'sup-editor-1',
          3 * day,
          'customer',
          'Ole Brandt',
          'Add a new editor to the docs site\n\nAccess and sign-in\n\nJonas joins the docs team next week. Can you give him editor access to the docs site?'
        ),
        message(
          'sup-editor-2',
          2 * day,
          'support',
          'Adobe Support',
          'Done. Jonas can sign in now and edit every page under `/docs`.',
          { edited: true }
        ),
      ],
    },
    {
      thread: {
        id: 'sup-export',
        title: 'Export of the March report times out',
        lastActivity: now - 6 * day,
        resolved: false,
        unread: 0,
      },
      messages: [
        message(
          'sup-export-1',
          6 * day + hour,
          'customer',
          'Mara Lind',
          'Export of the March report times out\n\nThe March report export stops after about a minute with “Request timed out”.'
        ),
        message('sup-export-2', 6 * day, 'customer', 'Mara Lind', '', { deleted: true }),
      ],
    },
  ];
}

export class DummySupport extends Emitter<SupportEvents> implements SupportPort {
  scenario: SupportScenario;
  answerTicks: number | null = 40;
  calls: Array<[string, ...unknown[]]> = [];
  #clock: Clock;
  #entries: Entry[];
  #status: SupportStatus;
  #receipts = new Map<string, { payload: string; id: string }>();
  #failures: number;
  #count = 0;

  constructor(scenario: SupportScenario, clock: Clock) {
    super();
    this.scenario = scenario;
    this.#clock = clock;
    this.#entries = scenario === 'empty' ? [] : supportFixtures();
    this.#failures = scenario === 'fail' ? 1 : 0;
    this.#status = this.#initial(scenario);
  }

  #initial(scenario: SupportScenario): SupportStatus {
    if (scenario === 'signed-out' || scenario === 'sign-in-fail') return { state: 'signed-out' };
    const outside = {
      state: 'not-enrolled',
      identity: supportMember,
      org: supportOtherOrg,
    } as const;
    if (scenario === 'not-enrolled') return outside;
    if (scenario === 'pending') return { ...outside, request: 'pending' };
    if (scenario === 'declined')
      return { ...outside, request: 'declined', reason: supportDeclined };
    const known = {
      identity: supportMember,
      org: supportOrg,
      channel: supportChannel,
      audience: supportAudience,
    };
    if (scenario === 'loading') return { state: 'loading', ...known };
    if (scenario === 'offline') return { state: 'offline', ...known, detail: supportOffline };
    return { state: 'ready', ...known };
  }

  status(): SupportStatus {
    return this.#status;
  }

  setStatus(status: SupportStatus): void {
    this.#status = status;
    this.emit('status', status);
    this.emit('threads', this.threads());
  }

  arrive(): void {
    this.setStatus({
      state: 'ready',
      identity: supportMember,
      org: supportOrg,
      channel: supportChannel,
      audience: supportAudience,
    });
  }

  threads(): readonly SupportThread[] {
    const state = this.#status.state;
    return state === 'ready' || state === 'offline'
      ? this.#entries.map((entry) => entry.thread)
      : [];
  }

  async signIn(): Promise<void> {
    this.calls.push(['signIn']);
    this.setStatus({ state: 'signing-in' });
    await this.#clock.sleep(10);
    if (this.scenario === 'sign-in-fail') {
      this.setStatus({ state: 'signed-out' });
      throw new Error(supportSignInFailed);
    }
    this.arrive();
  }

  async signOut(): Promise<void> {
    this.calls.push(['signOut']);
    await this.#clock.sleep(2);
    this.setStatus({ state: 'signed-out' });
  }

  unread(): number {
    return this.threads().filter((thread) => thread.unread > 0).length;
  }

  topics(): readonly SupportTopic[] {
    return supportTopics;
  }

  #entry(id: string): Entry {
    const entry = this.#entries.find((candidate) => candidate.thread.id === id);
    if (!entry) throw new Error('That request is gone.');
    return entry;
  }

  async thread(id: string): Promise<SupportConversation> {
    this.calls.push(['thread', id]);
    await this.#clock.sleep(2);
    const { thread, messages } = this.#entry(id);
    return { id, title: thread.title, resolved: thread.resolved, messages: [...messages] };
  }

  #changed(id: string): void {
    this.#entries.sort((a, b) => b.thread.lastActivity - a.thread.lastActivity);
    this.emit('threads', this.threads());
    this.emit('thread', id);
  }

  #receipt(key: string, payload: string): string | null {
    const saved = this.#receipts.get(key);
    if (!saved) return null;
    if (saved.payload !== payload) throw new Error(supportConflict);
    return saved.id;
  }

  async #write(key: string, payload: string, write: () => string): Promise<{ id: string }> {
    await this.#clock.sleep(4);
    const saved = this.#receipt(key, payload);
    if (saved) return { id: saved };
    if (this.#failures > 0) {
      this.#failures -= 1;
      throw new Error(supportRefused);
    }
    const id = write();
    this.#receipts.set(key, { payload, id });
    return { id };
  }

  #message(body: string): SupportMessage {
    this.#count += 1;
    return {
      id: `sup-msg-${this.#count}`,
      at: Date.now(),
      author: 'customer',
      name: supportMember,
      body,
    };
  }

  async create(draft: SupportDraft): Promise<{ id: string }> {
    this.calls.push(['create', draft.key, draft.title, draft.body, draft.topic]);
    const payload = JSON.stringify([draft.title, draft.body, draft.topic ?? null]);
    return this.#write(draft.key, payload, () => {
      const title = draft.title.trim();
      const topic = supportTopics.find((item) => item.id === draft.topic)?.label;
      const body = draft.body.trim() === title ? '' : draft.body.trim();
      const message = this.#message([title, topic, body].filter(Boolean).join('\n\n'));
      const id = `sup-new-${this.#count}`;
      this.#entries.unshift({
        thread: {
          id,
          title: plainTitle(title),
          lastActivity: message.at,
          resolved: false,
          unread: 0,
        },
        messages: [message],
      });
      this.#changed(id);
      this.#later(id);
      return id;
    });
  }

  async reply(reply: SupportReply): Promise<{ id: string }> {
    this.calls.push(['reply', reply.key, reply.thread, reply.body]);
    const payload = JSON.stringify([reply.thread, reply.body]);
    return this.#write(reply.key, payload, () => {
      const entry = this.#entry(reply.thread);
      const message = this.#message(reply.body);
      entry.messages.push(message);
      entry.thread = { ...entry.thread, lastActivity: message.at };
      this.#changed(reply.thread);
      this.#later(reply.thread);
      return message.id;
    });
  }

  async read(id: string, through: string): Promise<void> {
    this.calls.push(['read', id, through]);
    await this.#clock.sleep(1);
    const entry = this.#entry(id);
    const at = entry.messages.findIndex((message) => message.id === through);
    const unread = entry.messages
      .slice(at + 1)
      .filter((message) => message.author === 'support').length;
    if (unread === entry.thread.unread) return;
    entry.thread = { ...entry.thread, unread };
    this.emit('threads', this.threads());
  }

  #later(id: string): void {
    const ticks = this.answerTicks;
    if (ticks === null) return;
    void this.#clock.sleep(ticks).then(() => this.answer(id));
  }

  answer(id: string, body = supportAnswer, resolved?: boolean): void {
    const entry = this.#entries.find((candidate) => candidate.thread.id === id);
    if (!entry) return;
    this.#count += 1;
    const message: SupportMessage = {
      id: `sup-msg-${this.#count}`,
      at: Date.now(),
      author: 'support',
      name: 'Adobe Support',
      body,
    };
    entry.messages.push(message);
    entry.thread = {
      ...entry.thread,
      lastActivity: message.at,
      unread: entry.thread.unread + 1,
      resolved: resolved ?? entry.thread.resolved,
    };
    this.#changed(id);
  }
}
