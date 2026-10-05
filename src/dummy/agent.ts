import { Emitter } from '../model/emitter.ts';
import type {
  Agent,
  AgentEvents,
  AgentPort,
  AgentStatus,
  AssistantMessage,
  LickState,
  Message,
  MessagePart,
  Outgoing,
  UserMessage,
} from '../model/types.ts';
import type { Clock } from './clock.ts';
import { type Effects, type Step, script } from './script.ts';

interface Run {
  stopped: boolean;
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
  #suggestions = new Map<string, string>();
  #runs = new Map<string, Run>();
  #active: string;
  #clock: Clock;
  #effects: Omit<Effects, 'agentId'>;
  #next = 1;

  constructor(
    agents: readonly Agent[],
    conversations: Record<string, readonly Message[]>,
    effects: Omit<Effects, 'agentId'>,
    clock: Clock,
    queues: Record<string, readonly UserMessage[]> = {}
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

  async send(agentId: string, input: string | Outgoing): Promise<void> {
    const agent = this.#agent(agentId);
    const message = outgoing(input);
    const prompt = message.text.trim();
    if (!agent || (!prompt && !message.attachments?.length)) return;
    if (this.busy(agentId) && message.mode !== 'steer') {
      this.#enqueue(agentId, message);
      return;
    }
    this.stop(agentId);
    this.#suggestions.delete(agentId);
    const run: Run = { stopped: false };
    this.#runs.set(agentId, run);
    this.#post(agentId, {
      id: this.#id('m'),
      role: 'user',
      text: prompt,
      createdAt: Date.now(),
      ...(message.mode === 'steer' ? { mode: 'steer' as const } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    });
    const reply: AssistantMessage = {
      id: this.#id('m'),
      role: 'assistant',
      parts: [],
      status: 'streaming',
      createdAt: Date.now(),
      model: agent.model,
    };
    this.#post(agentId, reply);
    const { steps, suggestion } = script(prompt, message.attachments ?? []);
    for (const step of steps) {
      if (run.stopped) break;
      await this.#step(agentId, reply, step, run);
    }
    reply.status = run.stopped ? 'stopped' : 'done';
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
    await this.#drain(agentId);
  }

  async #drain(agentId: string): Promise<void> {
    if (this.busy(agentId)) return;
    const [next, ...rest] = this.queue(agentId);
    if (!next) return;
    this.#queues.set(agentId, rest);
    this.emit('messages', agentId);
    await this.send(agentId, { text: next.text, attachments: next.attachments });
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

  clear(agentId: string): void {
    if (!this.#messages.has(agentId)) return;
    this.stop(agentId);
    this.#messages.set(agentId, []);
    this.#suggestions.delete(agentId);
    this.emit('messages', agentId);
  }

  setModel(agentId: string, model: string): void {
    const agent = this.#agent(agentId);
    if (!agent) return;
    agent.model = model;
    this.#changed();
  }

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
}
