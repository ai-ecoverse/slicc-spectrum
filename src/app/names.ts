import type { Agent, SliccModel } from '../model/types.ts';

export const untitled = 'No messages yet';

export function short(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function agentTitle(model: SliccModel, agent: Agent): string {
  if (agent.title !== undefined) return agent.title.trim();
  const first = model.agent.messages(agent.id).find((message) => message.role === 'user');
  return first?.role === 'user' ? (first.text.trim().split('\n')[0] as string).trim() : '';
}

export function twinned(
  name: string,
  id: string,
  rows: ReadonlyArray<{ id: string; name: string }>
): boolean {
  return rows.some((row) => row.id !== id && row.name === name);
}

export function withTitle(name: string, title: string): string {
  return `${name} (${short(title) || untitled.toLowerCase()})`;
}

export function coneLabel(model: SliccModel, agent: Agent): string {
  const cones = model.agent.list().filter((other) => other.kind === 'cone');
  if (agent.kind !== 'cone' || !twinned(agent.name, agent.id, cones)) return agent.name;
  return withTitle(agent.name, agentTitle(model, agent));
}

export function watchTitles(model: SliccModel, update: () => void): () => void {
  const seen = new Map<string, string>();
  const check = (id: string) => {
    const agent = model.agent.list().find((candidate) => candidate.id === id);
    if (agent?.kind !== 'cone') return;
    const title = agentTitle(model, agent);
    if (seen.get(id) === title) return;
    seen.set(id, title);
    update();
  };
  const stops = [
    model.agent.on('messages', check),
    model.agent.on('message', ({ agentId }) => check(agentId)),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
