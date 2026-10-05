import { Emitter } from '../model/emitter.ts';
import type {
  Agent,
  AgentEvents,
  AgentPort,
  AgentStatus,
  AssistantMessage,
  Message,
} from '../model/types.ts';
import type { Clock } from './clock.ts';
import { type Effects, type Step, script } from './script.ts';

interface Run {
  stopped: boolean;
}

function chunks(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export class DummyAgent extends Emitter<AgentEvents> implements AgentPort {
  #agents: Agent[];
  #messages = new Map<string, Message[]>();
  #runs = new Map<string, Run>();
  #active: string;
  #clock: Clock;
  #effects: Omit<Effects, 'agentId'>;
  #next = 1;

  constructor(
    agents: readonly Agent[],
    conversations: Record<string, readonly Message[]>,
    effects: Omit<Effects, 'agentId'>,
    clock: Clock
  ) {
    super();
    this.#clock = clock;
    this.#effects = effects;
    this.#agents = agents.map((agent) => ({ ...agent }));
    for (const agent of this.#agents) {
      this.#messages.set(agent.id, structuredClone([...(conversations[agent.id] ?? [])]));
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

  async #step(agentId: string, reply: AssistantMessage, step: Step, run: Run): Promise<void> {
    if (step.type !== 'tool') {
      this.#status(agentId, 'thinking');
      const part = { type: step.type, text: '' };
      reply.parts.push(part);
      await this.#stream(agentId, reply, part, step.text, run);
      return;
    }
    this.#status(agentId, 'working');
    const tool = {
      id: `t-${this.#next++}`,
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
      ? { status: 'error' as const, output: 'Stopped' }
      : { status: 'done' as const, output: step.output };
    if (!run.stopped) await step.effect?.({ ...this.#effects, agentId });
    Object.assign(tool, done);
    this.emit('message', { agentId, message: reply });
  }

  async send(agentId: string, text: string): Promise<void> {
    const agent = this.#agent(agentId);
    const prompt = text.trim();
    if (!agent || !prompt) return;
    this.stop(agentId);
    const run: Run = { stopped: false };
    this.#runs.set(agentId, run);
    this.#post(agentId, {
      id: `m-${this.#next++}`,
      role: 'user',
      text: prompt,
      createdAt: Date.now(),
    });
    const reply: AssistantMessage = {
      id: `m-${this.#next++}`,
      role: 'assistant',
      parts: [],
      status: 'streaming',
      createdAt: Date.now(),
    };
    this.#post(agentId, reply);
    for (const step of script(prompt)) {
      if (run.stopped) break;
      await this.#step(agentId, reply, step, run);
    }
    reply.status = run.stopped ? 'stopped' : 'done';
    if (this.#runs.get(agentId) === run) this.#runs.delete(agentId);
    agent.contextFill = Math.min(0.95, Math.round((agent.contextFill + 0.03) * 100) / 100);
    if (agentId !== this.#active) agent.unread += 1;
    this.emit('message', { agentId, message: reply });
    agent.status = 'idle';
    this.#changed();
  }

  stop(agentId: string): void {
    const run = this.#runs.get(agentId);
    if (run) run.stopped = true;
  }
}
