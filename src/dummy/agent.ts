import { Emitter } from '../model/emitter.ts';
import type {
  Agent,
  AgentEvents,
  AgentPort,
  AgentStatus,
  AssistantMessage,
  DeliveredAs,
  FrozenCone,
  LickChannel,
  LickState,
  Message,
  MessagePart,
  Outgoing,
  SlashCommand,
  Thinking,
  UserMessage,
} from '../model/types.ts';
import type { Clock } from './clock.ts';
import { type Effects, type Step, script } from './script.ts';

interface Run {
  stopped: boolean;
  steers: Outgoing[];
}

function chunks(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

function outgoing(input: string | Outgoing): Outgoing {
  return typeof input === 'string' ? { text: input } : input;
}

export class DummyAgent extends Emitter<AgentEvents> implements AgentPort {
  #agents: Agent[];
  #messages = new Map<string, Message[]>();
  #queues = new Map<string, UserMessage[]>();
  #frozen: FrozenCone[] = [];
  #ice = new Map<string, Array<{ agent: Agent; messages: Message[] }>>();
  #suggestions = new Map<string, string>();
  #runs = new Map<string, Run>();
  #active: string;
  #clock: Clock;
  #effects: Omit<Effects, 'agentId'>;
  #next = 1;
  #cones = 1;

  constructor(
    agents: readonly Agent[],
    conversations: Record<string, readonly Message[]>,
    effects: Omit<Effects, 'agentId'>,
    clock: Clock,
    queues: Record<string, readonly UserMessage[]> = {},
    frozen: ReadonlyArray<{ cone: FrozenCone; messages: readonly Message[] }> = []
  ) {
    super();
    this.#clock = clock;
    this.#effects = effects;
    this.#agents = agents.map((agent) => ({ ...agent }));
    for (const agent of this.#agents) {
      this.#messages.set(agent.id, structuredClone([...(conversations[agent.id] ?? [])]));
      this.#queues.set(agent.id, structuredClone([...(queues[agent.id] ?? [])]));
    }
    this.#active = this.#agents[0]?.id ?? '';
    for (const { cone, messages } of frozen) {
      this.#frozen.push({ ...cone });
      this.#ice.set(cone.id, [
        {
          agent: {
            id: cone.id,
            name: cone.name,
            kind: 'cone',
            parentId: null,
            status: 'idle',
            model: cone.model,
            contextFill: 0.2,
            unread: 0,
          },
          messages: structuredClone([...messages]),
        },
      ]);
    }
  }

  list(): readonly Agent[] {
    return this.#agents.map((agent) => ({ ...agent }));
  }

  active(): string {
    return this.#active;
  }

  #agent(id: string): Agent | undefined {
    return this.#agents.find((agent) => agent.id === id);
  }

  #changed(): void {
    this.emit('agents', this.list());
  }

  #id(prefix: string): string {
    return `${prefix}-${this.#next++}`;
  }

  select(id: string): void {
    const agent = this.#agent(id);
    if (!agent) return;
    this.#active = id;
    agent.unread = 0;
    this.emit('active', id);
    this.#changed();
  }

  messages(agentId: string): readonly Message[] {
    return [...(this.#messages.get(agentId) ?? [])];
  }

  queue(agentId: string): readonly UserMessage[] {
    return [...(this.#queues.get(agentId) ?? [])];
  }

  busy(agentId: string): boolean {
    return this.#runs.has(agentId);
  }

  suggestion(agentId: string): string | null {
    return this.#suggestions.get(agentId) ?? null;
  }

  #post(agentId: string, message: Message): void {
    this.#messages.get(agentId)?.push(message);
    this.emit('message', { agentId, message });
  }

  #status(agentId: string, status: AgentStatus): void {
    const agent = this.#agent(agentId);
    if (!agent || agent.status === status) return;
    agent.status = status;
    this.#changed();
  }

  async #stream(
    agentId: string,
    reply: AssistantMessage,
    part: { text: string },
    text: string,
    run: Run
  ): Promise<void> {
    for (const chunk of chunks(text)) {
      await this.#clock.sleep();
      if (run.stopped) return;
      part.text += chunk;
      this.emit('message', { agentId, message: reply });
    }
  }

  async #tool(
    agentId: string,
    reply: AssistantMessage,
    step: Extract<Step, { type: 'tool' }>,
    run: Run
  ): Promise<void> {
    this.#status(agentId, 'working');
    const tool = {
      id: this.#id('t'),
      name: step.name,
      title: step.title,
      input: step.input,
      output: '',
      status: 'running' as const,
      paths: step.paths,
    };
    reply.parts.push({ type: 'tool', tool });
    this.emit('message', { agentId, message: reply });
    await this.#clock.sleep(step.ticks);
    const done = run.stopped
      ? { status: 'cancelled' as const, output: 'Stopped' }
      : { status: 'done' as const, output: step.output };
    if (!run.stopped) await step.effect?.({ ...this.#effects, agentId });
    Object.assign(tool, done);
    this.emit('message', { agentId, message: reply });
  }

  async #step(agentId: string, reply: AssistantMessage, step: Step, run: Run): Promise<void> {
    if (step.type === 'tool') return this.#tool(agentId, reply, step, run);
    if (step.type === 'part') {
      await this.#clock.sleep(2);
      if (run.stopped) return;
      reply.parts.push(structuredClone(step.part) as MessagePart);
      this.emit('message', { agentId, message: reply });
      return;
    }
    this.#status(agentId, 'thinking');
    const part = { type: step.type, text: '' };
    reply.parts.push(part);
    await this.#stream(agentId, reply, part, step.text, run);
  }

  #enqueue(agentId: string, input: Outgoing): void {
    const message: UserMessage = {
      id: this.#id('q'),
      role: 'user',
      text: input.text.trim(),
      createdAt: Date.now(),
      queued: true,
      mode: 'queue',
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };
    this.#queues.set(agentId, [...this.queue(agentId), message]);
    this.emit('messages', agentId);
  }

  unqueue(agentId: string, messageId: string): void {
    this.#queues.set(
      agentId,
      this.queue(agentId).filter((message) => message.id !== messageId)
    );
    this.emit('messages', agentId);
  }

  #user(message: Outgoing, delivered: DeliveredAs): UserMessage {
    return {
      id: this.#id('m'),
      role: 'user',
      text: message.text.trim(),
      createdAt: Date.now(),
      delivered,
      ...(delivered === 'steer' ? { mode: 'steer' as const } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    };
  }

  #reply(model: string): AssistantMessage {
    return {
      id: this.#id('m'),
      role: 'assistant',
      parts: [],
      status: 'streaming',
      createdAt: Date.now(),
      model,
    };
  }

  async send(agentId: string, input: string | Outgoing): Promise<void> {
    const message = outgoing(input);
    if (!this.#agent(agentId) || (!message.text.trim() && !message.attachments?.length)) return;
    const run = this.#runs.get(agentId);
    if (run && message.mode === 'queue') {
      this.#enqueue(agentId, message);
      return;
    }
    if (run) {
      run.steers.push(message);
      return;
    }
    await this.#run(agentId, message, 'run');
  }

  async #run(agentId: string, message: Outgoing, delivered: DeliveredAs): Promise<void> {
    const agent = this.#agent(agentId) as Agent;
    const prompt = message.text.trim();
    this.#suggestions.delete(agentId);
    const run: Run = { stopped: false, steers: [] };
    this.#runs.set(agentId, run);
    this.#post(agentId, this.#user(message, delivered));
    let reply = this.#reply(agent.model);
    this.#post(agentId, reply);
    let { steps, suggestion } = script(prompt, message.attachments ?? []);
    while (steps.length && !run.stopped) {
      await this.#step(agentId, reply, steps[0] as Step, run);
      steps = steps.slice(1);
      if (run.steers.length && !run.stopped && steps.length) {
        reply.status = 'done';
        this.emit('message', { agentId, message: reply });
        const steers = run.steers.splice(0);
        for (const steer of steers) this.#post(agentId, this.#user(steer, 'steer'));
        const latest = steers.at(-1) as Outgoing;
        ({ steps, suggestion } = script(latest.text.trim(), latest.attachments ?? []));
        reply = this.#reply(agent.model);
        this.#post(agentId, reply);
      }
    }
    reply.status = run.stopped
      ? 'stopped'
      : reply.parts.some((item) => item.type === 'error')
        ? 'error'
        : 'done';
    reply.usage = {
      input: 1200 + prompt.length * 4,
      output: 180 + reply.parts.length * 60,
      cost: 0.004,
    };
    if (this.#runs.get(agentId) === run) this.#runs.delete(agentId);
    agent.contextFill = Math.min(0.95, Math.round((agent.contextFill + 0.03) * 100) / 100);
    if (agentId !== this.#active) agent.unread += 1;
    if (!run.stopped) this.#suggestions.set(agentId, suggestion);
    this.emit('message', { agentId, message: reply });
    agent.status = 'idle';
    this.#changed();
    const late = run.steers.splice(0);
    if (run.stopped) {
      for (const steer of late) this.#enqueue(agentId, steer);
    } else if (late.length) {
      const last = late.pop() as Outgoing;
      for (const steer of late) this.#post(agentId, this.#user(steer, 'steer'));
      await this.#run(agentId, last, 'steer');
      return;
    }
    await this.#drain(agentId);
  }

  async #drain(agentId: string): Promise<void> {
    if (this.busy(agentId)) return;
    const [next, ...rest] = this.queue(agentId);
    if (!next) return;
    this.#queues.set(agentId, rest);
    this.emit('messages', agentId);
    await this.#run(agentId, { text: next.text, attachments: next.attachments }, 'follow-up');
  }

  stop(agentId: string): void {
    const run = this.#runs.get(agentId);
    if (run) run.stopped = true;
    this.#runs.delete(agentId);
  }

  #find(agentId: string, test: (message: Message) => boolean): Message | undefined {
    return this.#messages.get(agentId)?.find(test);
  }

  answer(agentId: string, questionId: string, answer: string): void {
    const message = this.#find(
      agentId,
      (candidate) =>
        candidate.role === 'assistant' &&
        candidate.parts.some((part) => part.type === 'question' && part.question.id === questionId)
    ) as AssistantMessage | undefined;
    if (!message) return;
    for (const part of message.parts) {
      if (part.type === 'question' && part.question.id === questionId) {
        part.question.state = 'answered';
        part.question.answer = answer;
      }
    }
    this.emit('message', { agentId, message });
  }

  resolveLick(agentId: string, messageId: string, state: Exclude<LickState, 'pending'>): void {
    const message = this.#find(agentId, (candidate) => candidate.id === messageId);
    if (message?.role !== 'lick') return;
    message.state = state;
    this.emit('message', { agentId, message });
  }

  compact(agentId: string): void {
    const agent = this.#agent(agentId);
    if (!agent) return;
    const message: Message = {
      id: this.#id('m'),
      role: 'system',
      kind: 'compaction',
      title: 'Context compacted',
      text: 'Summarizing the conversation so far…',
      trigger: 'manual',
      state: 'summarizing',
      createdAt: Date.now(),
    };
    this.#post(agentId, message);
    void this.#clock.sleep(20).then(() => {
      Object.assign(message, {
        state: 'summarized',
        text: 'The earlier conversation was summarized to free up context.',
      });
      agent.contextFill = 0.06;
      this.emit('message', { agentId, message });
      this.#changed();
    });
  }

  async rewind(agentId: string, messageId: string): Promise<Outgoing | null> {
    const messages = this.#messages.get(agentId);
    const at = messages?.findIndex((message) => message.id === messageId) ?? -1;
    if (!messages || at < 0) return null;
    const turn = messages.slice(0, at).findLastIndex((message) => message.role === 'user');
    if (turn < 0) return null;
    const user = messages[turn] as UserMessage;
    const turns = messages.splice(turn).filter((message) => message.role === 'user').length;
    messages.push({
      id: `rewound-${Date.now()}`,
      role: 'system',
      kind: 'notice',
      title: turns === 1 ? 'Rewound 1 turn' : `Rewound ${turns} turns`,
      text:
        turns === 1
          ? 'Its prompt is back in the composer.'
          : 'The latest prompt is back in the composer.',
      createdAt: Date.now(),
    });
    this.emit('messages', agentId);
    return { text: user.text, ...(user.attachments ? { attachments: user.attachments } : {}) };
  }

  clear(agentId: string): void {
    if (!this.#messages.has(agentId)) return;
    this.stop(agentId);
    this.#messages.set(agentId, []);
    this.#queues.set(agentId, []);
    this.#suggestions.delete(agentId);
    this.emit('messages', agentId);
  }

  setModel(agentId: string, model: string): void {
    const agent = this.#agent(agentId);
    if (!agent) return;
    agent.model = model;
    this.#changed();
  }

  setThinking(agentId: string, thinking: Thinking): void {
    const agent = this.#agent(agentId);
    if (!agent) return;
    agent.thinking = thinking;
    this.#changed();
  }

  async older(): Promise<readonly Message[]> {
    return [];
  }

  commands(agentId: string): readonly SlashCommand[] {
    if (this.#agent(agentId)?.kind !== 'cone') return [];
    return [
      { name: 'review', description: 'Review the open changes for mistakes', kind: 'prompt' },
      { name: 'skill:pdf', description: 'Read, fill and merge PDF files', kind: 'skill' },
    ];
  }

  async ready(): Promise<void> {}

  createScoop(parentId: string, name: string): Agent {
    const parent = this.#agent(parentId);
    const agent: Agent = {
      id: this.#id('scoop'),
      name,
      kind: 'scoop',
      parentId: parent?.kind === 'cone' ? parent.id : (parent?.parentId ?? null),
      status: 'idle',
      model: parent?.model ?? 'claude-haiku-4-5',
      contextFill: 0,
      unread: 0,
    };
    this.#agents.push(agent);
    this.#messages.set(agent.id, []);
    if (parent) {
      this.#post(parentId, {
        id: this.#id('m'),
        role: 'lick',
        channel: 'scoop-idle',
        title: name,
        text: 'New scoop, waiting for its first task',
        createdAt: Date.now(),
      });
    }
    this.#changed();
    return { ...agent };
  }

  async drop(agentId: string): Promise<void> {
    const agent = this.#agent(agentId);
    if (agent?.kind !== 'scoop') throw new Error('Only scoops can be dropped');
    this.stop(agentId);
    this.#agents = this.#agents.filter((candidate) => candidate !== agent);
    this.#messages.delete(agentId);
    this.#queues.delete(agentId);
    this.#suggestions.delete(agentId);
    if (this.#active === agentId) this.select(agent.parentId ?? (this.#agents[0] as Agent).id);
    this.#changed();
  }

  async createCone(name: string): Promise<Agent> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A cone needs a name');
    if (this.#agents.some((agent) => agent.kind === 'cone' && agent.name === trimmed)) {
      throw new Error(`A cone named ${trimmed} already exists`);
    }
    const agent: Agent = {
      id: `cone-${this.#cones++}`,
      name: trimmed,
      kind: 'cone',
      parentId: null,
      status: 'idle',
      model: 'claude-sonnet-5-5',
      contextFill: 0,
      unread: 0,
    };
    this.#agents.push(agent);
    this.#messages.set(agent.id, []);
    this.#queues.set(agent.id, []);
    this.#changed();
    return { ...agent };
  }

  lick(agentId: string, channel: LickChannel, title: string, text: string, body?: string): void {
    if (!this.#agent(agentId)) return;
    this.#post(agentId, {
      id: this.#id('m'),
      role: 'lick',
      channel,
      title,
      text,
      createdAt: Date.now(),
      ...(body ? { body } : {}),
    });
  }

  frozen(): readonly FrozenCone[] {
    return this.#frozen.map((cone) => ({ ...cone }));
  }

  freeze(agentId: string): void {
    const agent = this.#agent(agentId);
    if (agent?.kind !== 'cone' || agent.frozen) return;
    this.stop(agentId);
    const family = this.#agents.filter(
      (candidate) => candidate.id === agentId || candidate.parentId === agentId
    );
    const messages = this.#messages.get(agentId) ?? [];
    const first = messages.find((message) => message.role === 'user');
    this.#frozen.unshift({
      id: agentId,
      name: agent.name,
      title: first?.role === 'user' ? first.text.slice(0, 80) : agent.name,
      model: agent.model,
      messages: messages.length,
      frozenAt: Date.now(),
    });
    this.#ice.set(
      agentId,
      family.map((member) => ({
        agent: { ...member, status: 'idle' as const },
        messages: this.#messages.get(member.id) as Message[],
      }))
    );
    for (const member of family) this.stop(member.id);
    this.#agents = this.#agents.filter((candidate) => !family.includes(candidate));
    for (const member of family) this.#messages.delete(member.id);
    if (this.#active === agentId) this.#active = this.#agents[0]?.id ?? '';
    this.emit('frozen', this.frozen());
    this.emit('active', this.#active);
    this.#changed();
  }

  thaw(id: string): Agent | null {
    const ice = this.#ice.get(id);
    if (!ice) {
      const agent = this.#agent(id);
      if (!agent?.frozen) return null;
      delete agent.frozen;
      this.#changed();
      return { ...agent };
    }
    this.#ice.delete(id);
    this.#frozen = this.#frozen.filter((cone) => cone.id !== id);
    for (const { agent, messages } of ice) {
      this.#agents.push(agent);
      this.#messages.set(agent.id, messages);
      this.#queues.set(agent.id, []);
    }
    this.emit('frozen', this.frozen());
    this.select(id);
    return { ...ice[0].agent };
  }

  discard(id: string): void {
    this.#ice.delete(id);
    this.#frozen = this.#frozen.filter((cone) => cone.id !== id);
    this.emit('frozen', this.frozen());
  }
}
