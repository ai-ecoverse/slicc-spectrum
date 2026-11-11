import type { AgentPort } from '../model/types.ts';
import { guard } from './guard.ts';

interface Steps {
  labels: Map<string, string>;
  asked: Set<string>;
  heard: Map<string, Set<() => void>>;
}

const stores = new WeakMap<AgentPort, Steps>();

function store(port: AgentPort): Steps {
  const found = stores.get(port);
  if (found) return found;
  const fresh: Steps = { labels: new Map(), asked: new Set(), heard: new Map() };
  stores.set(port, fresh);
  return fresh;
}

export function stepLabel(port: AgentPort | undefined, agent: string, id: string): string {
  return (port && stores.get(port)?.labels.get(`${agent} ${id}`)) ?? '';
}

export function askStep(port: AgentPort | undefined, agent: string, id: string): void {
  if (!port?.stepLabel) return;
  const steps = store(port);
  const key = `${agent} ${id}`;
  if (steps.asked.has(key)) return;
  steps.asked.add(key);
  port.stepLabel(agent, id).then(
    (text) => {
      const label = guard(text?.trim() ?? '');
      if (!label) return;
      steps.labels.set(key, label);
      for (const heard of [...(steps.heard.get(key) ?? [])]) heard();
    },
    () => undefined
  );
}

export function hearStep(
  port: AgentPort | undefined,
  agent: string,
  id: string,
  heard: () => void
): () => void {
  if (!port) return () => undefined;
  const steps = store(port);
  const key = `${agent} ${id}`;
  const set = steps.heard.get(key) ?? new Set();
  steps.heard.set(key, set);
  set.add(heard);
  return () => {
    set.delete(heard);
    if (!set.size) steps.heard.delete(key);
  };
}

export class StepWatch {
  #heard: () => void;
  #at = '';
  #port: AgentPort | undefined;
  #off: () => void = () => undefined;

  constructor(heard: () => void) {
    this.#heard = heard;
  }

  watch(port: AgentPort | undefined, agent: string, id: string | undefined): void {
    const at = port && id ? `${agent} ${id}` : '';
    if (at === this.#at && port === this.#port) return;
    this.#off();
    this.#at = at;
    this.#port = port;
    this.#off = port && id ? hearStep(port, agent, id, this.#heard) : () => undefined;
  }

  stop(): void {
    this.watch(undefined, '', undefined);
  }
}
