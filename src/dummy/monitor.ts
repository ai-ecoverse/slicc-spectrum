import { Emitter } from '../model/emitter.ts';
import type {
  MonitorEvents,
  MonitorPort,
  MonitorRow,
  MonitorSnapshot,
  MonitorStatus,
  SliccModel,
} from '../model/types.ts';

const statuses: Record<string, MonitorStatus> = {
  idle: 'idle',
  thinking: 'active',
  working: 'active',
  waiting: 'warn',
  error: 'error',
};

export function wave(seed: number, length = 24): number[] {
  return Array.from({ length }, (_, i) =>
    Math.round(40 + 25 * Math.sin((i + seed) / 3) + 10 * Math.cos((i * seed) / 5))
  );
}

export class DummyMonitor extends Emitter<MonitorEvents> implements MonitorPort {
  #model: Omit<SliccModel, 'monitor'>;
  #tick = 0;

  constructor(model: Omit<SliccModel, 'monitor'>) {
    super();
    this.#model = model;
    const update = () => this.resync();
    model.agent.on('agents', update);
    model.terminals.on('terminals', update);
    model.browser.on('tabs', update);
    model.files.on('changes', update);
    model.tray.on('status', update);
  }

  snapshot(): MonitorSnapshot {
    const { agent, terminals, browser, files, sprinkles, tray } = this.#model;
    const listed = agent.list();
    const agents = listed
      .filter((candidate) => candidate.kind === 'cone')
      .flatMap((cone) => [cone, ...listed.filter((candidate) => candidate.parentId === cone.id)]);
    const active = agents.filter((candidate) => candidate.status !== 'idle').length;
    const status = tray.status();
    const fill = Math.max(...agents.map((candidate) => candidate.contextFill), 0);
    const agentRows = agents.map(
      (candidate): MonitorRow => ({
        name: candidate.kind === 'scoop' ? `↳ ${candidate.name}` : candidate.name,
        meta: `${candidate.status} · ${Math.round(candidate.contextFill * 100)}% context`,
        status: statuses[candidate.status],
        badges: candidate.unread ? [`${candidate.unread} unread`] : [],
      })
    );
    return {
      updatedAt: Date.now(),
      vitals: [
        {
          id: 'agents',
          label: 'Active agents',
          value: String(active),
          unit: `of ${agents.length}`,
          series: wave(this.#tick + 1),
        },
        {
          id: 'spend',
          label: 'Spend',
          value: `$${status.spent.toFixed(2)}`,
          delta: `$${status.rate.toFixed(2)}/h`,
          series: wave(this.#tick + 7),
        },
        {
          id: 'budget',
          label: `Budget (${status.budget.window})`,
          value: `${status.budget.percent}%`,
          unit: status.budget.resets,
          ratio: status.budget.percent / 100,
        },
        {
          id: 'context',
          label: 'Fullest context',
          value: `${Math.round(fill * 100)}%`,
          ratio: fill,
        },
      ],
      alerts: [
        ...agents
          .filter((candidate) => candidate.contextFill >= 0.6)
          .map((candidate) => ({
            id: `fill-${candidate.id}`,
            title: `${candidate.name} is ${Math.round(candidate.contextFill * 100)}% full`,
            detail: 'Compact it soon to keep replies fast.',
            severity: 'warn' as const,
          })),
        ...(status.connection === 'live'
          ? []
          : [
              {
                id: 'tray',
                title: `Tray ${status.connection}`,
                detail: 'Followers can’t see this session.',
                severity: 'error' as const,
              },
            ]),
      ],
      sections: [
        { id: 'agents', label: 'Cones and scoops', rows: agentRows },
        {
          id: 'terminals',
          label: 'Terminals',
          rows: terminals.list().map((terminal) => ({
            name: terminal.title,
            meta: terminal.cwd,
            status: 'active' as const,
          })),
        },
        {
          id: 'tabs',
          label: 'Browser tabs',
          rows: browser.list().map((tab) => ({
            name: tab.title,
            meta: new URL(tab.url).host || tab.url,
            status: tab.status === 'loading' ? ('active' as const) : ('idle' as const),
            badges: tab.agentId ? ['agent'] : [],
          })),
        },
        {
          id: 'changes',
          label: 'Pending changes',
          rows: files
            .changes()
            .map((change) => ({ name: change.path, meta: change.status, status: 'warn' as const })),
        },
        {
          id: 'sprinkles',
          label: 'Sprinkles',
          rows: sprinkles.list().map((sprinkle) => ({
            name: sprinkle.title,
            meta: sprinkle.name,
            status: 'idle' as const,
          })),
        },
        {
          id: 'followers',
          label: 'Tray followers',
          rows: status.followers.map((follower) => ({
            name: follower.name,
            meta: follower.device,
            status: 'active' as const,
          })),
        },
      ],
    };
  }

  resync(): void {
    this.#tick += 1;
    this.emit('snapshot', this.snapshot());
  }
}
