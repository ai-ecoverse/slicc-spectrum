import { Emitter } from '../model/emitter.ts';
import type {
  ChangesPort,
  MonitorEvents,
  MonitorPort,
  MonitorRow,
  MonitorSection,
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

export const agentSections: MonitorSection[] = [
  {
    id: 'tasks',
    label: 'Tasks',
    rows: [
      { id: 't1', name: 'generating', meta: 'sliccy · running · 12s', status: 'active' },
      {
        id: 't2',
        name: 'tool bash',
        meta: 'sliccy · running · 8s',
        status: 'active',
        depth: 1,
        badges: ['bash'],
      },
      {
        id: 't3',
        name: 'scoop quiet-otter',
        meta: 'quiet-otter · waiting · 2m',
        status: 'idle',
        depth: 1,
        badges: ['waits on 2'],
      },
      {
        id: 't4',
        name: 'tool read_file',
        meta: 'quiet-otter · completing · 1s',
        status: 'active',
        depth: 2,
      },
      {
        id: 't5',
        name: 'report for quiet-otter',
        meta: 'quiet-otter · pending · 2m',
        status: 'idle',
        depth: 2,
        badges: ['background'],
      },
      {
        id: 't6',
        name: 'cron tide-check',
        meta: 'session · aborting · 14s',
        status: 'warn',
        badges: ['aborting'],
      },
    ],
  },
  {
    id: 'processes',
    label: 'Processes',
    rows: [
      {
        id: 'p412',
        name: 'bash',
        meta: 'pid 412 · slicc · 3m',
        status: 'idle',
        badges: ['terminal'],
      },
      {
        id: 'p418',
        name: 'node build.mjs --watch',
        meta: 'pid 418 · slicc · 1m',
        status: 'active',
        badges: ['sliccy'],
      },
      {
        id: 'p433',
        name: 'grep -r harbor .',
        meta: 'pid 433 · slicc · 40s',
        status: 'warn',
        badges: ['quiet-otter'],
      },
    ],
  },
  {
    id: 'problems',
    label: 'Recent problems',
    rows: [
      {
        id: 'e1',
        name: 'quiet-otter · turn',
        meta: 'The model returned an error: overloaded. Retrying in 8 s.',
        status: 'error',
      },
    ],
  },
];

export class DummyMonitor extends Emitter<MonitorEvents> implements MonitorPort {
  #model: Omit<SliccModel, 'monitor'>;
  #tick = 0;
  #extra: MonitorSection[];

  constructor(model: Omit<SliccModel, 'monitor'>, extra: MonitorSection[] = []) {
    super();
    this.#model = model;
    this.#extra = extra;
    const update = () => this.resync();
    model.agent.on('agents', update);
    model.terminals.on('terminals', update);
    model.browser.on('tabs', update);
    const changes: ChangesPort = model.changes ?? model.files;
    changes.on('changes', update);
    model.tray.on('status', update);
  }

  snapshot(): MonitorSnapshot {
    const { agent, terminals, browser, files, sprinkles, tray } = this.#model;
    const changes: ChangesPort = this.#model.changes ?? files;
    const listed = agent.list();
    const agents = listed
      .filter((candidate) => candidate.kind === 'cone')
      .flatMap((cone) => [cone, ...listed.filter((candidate) => candidate.parentId === cone.id)]);
    const active = agents.filter((candidate) => candidate.status !== 'idle').length;
    const status = tray.status();
    const fill = Math.max(...agents.map((candidate) => candidate.contextFill), 0);
    const agentRows = agents.map(
      (candidate): MonitorRow => ({
        id: candidate.id,
        name: candidate.name,
        depth: candidate.kind === 'scoop' ? 1 : 0,
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
          value: `$${(status.spent ?? 0).toFixed(2)}`,
          delta: `$${(status.rate ?? 0).toFixed(2)}/h`,
          series: wave(this.#tick + 7),
        },
        ...(status.budget
          ? [
              {
                id: 'budget',
                label: `Budget (${status.budget.window})`,
                value: `${status.budget.percent}%`,
                unit: status.budget.resets,
                ratio: status.budget.percent / 100,
              },
            ]
          : []),
        {
          id: 'context',
          label: 'Fullest context',
          value: `${Math.round(fill * 100)}%`,
          ratio: fill,
        },
      ],
      alerts: [
        ...(this.#extra.length
          ? [
              {
                id: 'runaway-cpu-433',
                title: 'quiet-otter is using a lot of CPU',
                detail: '97% of one core for 3 minutes. To stop it, run:',
                severity: 'warn' as const,
                command: 'kill -- -433',
              },
            ]
          : []),
        ...agents
          .filter((candidate) => candidate.contextFill >= 0.8)
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
        ...this.#extra,
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
          rows: (changes.unavailable?.() ? [] : changes.changes()).map((change) => ({
            name: change.path,
            meta: change.status,
            status: 'warn' as const,
          })),
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
