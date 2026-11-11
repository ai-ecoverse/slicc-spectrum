import type { AgentPort } from '../model/types.ts';

interface Steps {
  labels: Map<string, string>;
  asked: Set<string>;
  heard: Set<() => void>;
}

const stores = new WeakMap<AgentPort, Steps>();

function store(port: AgentPort): Steps {
  const found = stores.get(port);
  if (found) return found;
  const fresh: Steps = { labels: new Map(), asked: new Set(), heard: new Set() };
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
      const label = text?.trim();
      if (!label) return;
      steps.labels.set(key, label);
      for (const heard of [...steps.heard]) heard();
    },
    () => undefined
  );
}

export function hearSteps(port: AgentPort | undefined, heard: () => void): () => void {
  if (!port) return () => undefined;
  const steps = store(port);
  steps.heard.add(heard);
  return () => steps.heard.delete(heard);
}
