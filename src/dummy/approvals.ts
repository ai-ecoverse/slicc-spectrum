import { Emitter } from '../model/emitter.ts';
import type {
  Approval,
  ApprovalDecision,
  ApprovalEnd,
  ApprovalsEvents,
  ApprovalsPort,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

export type ApprovalScenario =
  | 'agent'
  | 'user'
  | 'many'
  | 'follower'
  | 'fail'
  | 'soon'
  | 'elsewhere'
  | 'withdrawn'
  | 'secrets'
  | 'guest'
  | 'guest-follower'
  | 'none';

const minutes = 60_000;

const mara = { kind: 'guest', name: 'Seat 2 (Mara)' } as const;

function guestFixtures(now = Date.now()): Approval[] {
  return [
    {
      id: 'guest-note',
      kind: 'guest-message',
      requester: mara,
      agentId: 'cone-sliccy',
      agentName: 'sliccy',
      text: 'Could you tidy the harbor schedule?\nKeep <b>Tuesday</b> as it is and **skip** the ferry rows.',
      attachments: [
        { name: 'schedule.csv', mimeType: 'text/csv', size: 18_432 },
        { name: 'pier-map.png', mimeType: 'image/png', size: 2_411_725 },
      ],
      createdAt: now,
      expiresAt: now + 5 * minutes,
      always: false,
      verdict: { decision: 'allow', reason: 'it asks for an edit inside the shared folder.' },
    },
    {
      id: 'guest-fetch',
      kind: 'guest-tool',
      requester: mara,
      agentId: 'scoop-docs',
      agentName: 'docs-pass',
      tool: 'fetch',
      summary: 'GET https://tides.example/api/harbor?days=7',
      createdAt: now + 1,
      expiresAt: now + 5 * minutes,
      always: false,
      verdict: { decision: 'deny', reason: 'guests may not reach hosts outside the session.' },
    },
    {
      id: 'guest-late',
      kind: 'guest-message',
      requester: { kind: 'guest', name: 'Seat 3 (Ilse)' },
      agentId: 'cone-sliccy',
      text: 'Is the pier map up to date?',
      createdAt: now + 2,
      expiresAt: now + 5 * minutes,
      always: false,
    },
  ];
}

export function approvalFixtures(scenario: ApprovalScenario, now = Date.now()): Approval[] {
  const agent: Approval = {
    id: 'sudo-jq',
    kind: 'sudo',
    requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
    command: 'apt install jq',
    cwd: '/home/cone/harbor',
    createdAt: now,
    expiresAt: now + (scenario === 'soon' ? 0.4 * minutes : 5 * minutes),
    always: true,
  };
  const user: Approval = {
    id: 'sudo-chown',
    kind: 'sudo',
    requester: { kind: 'user', name: 'cone', where: 'Terminal 2' },
    command: 'chown -R cone /home/cone/shared',
    createdAt: now + 1,
    expiresAt: now + 5 * minutes,
    always: true,
  };
  const cache: Approval = {
    id: 'sudo-cache',
    kind: 'sudo',
    requester: { kind: 'agent', name: 'quiet-otter', agentId: 'scoop-otter' },
    command: 'rm -rf /var/cache/harbor',
    target: 'www-data',
    createdAt: now + 2,
    expiresAt: now + 5 * minutes,
    always: false,
  };
  if (scenario === 'secrets')
    return [
      {
        id: 'sudo-rules',
        kind: 'sudo',
        requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
        command: 'cp fnox.toml /etc/fnox/config.toml',
        cwd: '/home/cone/harbor',
        createdAt: now,
        expiresAt: now + 5 * minutes,
        always: true,
      },
    ];
  if (scenario === 'guest' || scenario === 'guest-follower') return guestFixtures(now);
  if (scenario === 'none') return [];
  if (scenario === 'user') return [user];
  if (scenario === 'many') return [agent, user, cache];
  if (scenario === 'elsewhere' || scenario === 'withdrawn') return [agent, user];
  return [agent];
}

export class DummyApprovals extends Emitter<ApprovalsEvents> implements ApprovalsPort {
  #approvals: Approval[];
  #time: Clock;
  #fail: boolean;
  decisions: Array<[string, ApprovalDecision]> = [];
  decide?: (id: string, decision: ApprovalDecision) => Promise<void>;

  constructor(scenario: ApprovalScenario, time: Clock) {
    super();
    this.#approvals = approvalFixtures(scenario);
    this.#time = time;
    this.#fail = scenario === 'fail';
    if (scenario !== 'follower' && scenario !== 'guest-follower')
      this.decide = (id, decision) => this.#decide(id, decision);
    if (scenario === 'elsewhere' || scenario === 'withdrawn')
      void time
        .sleep(100)
        .then(() => this.end('sudo-jq', scenario === 'elsewhere' ? 'answered' : 'withdrawn'));
  }

  raise(approval: Approval): void {
    this.#approvals = [...this.#approvals, approval];
    this.emit('approvals', this.list());
  }

  end(id: string, reason: ApprovalEnd): void {
    this.emit('ended', { id, reason });
    this.#approvals = this.#approvals.filter((approval) => approval.id !== id);
    this.emit('approvals', this.list());
  }

  list(): readonly Approval[] {
    return [...this.#approvals];
  }

  async #decide(id: string, decision: ApprovalDecision): Promise<void> {
    await this.#time.sleep(10);
    if (this.#fail) throw new Error('The kernel stopped waiting. Run the command again.');
    if (id === 'guest-late') throw new Error('Someone else already answered this.');
    this.decisions.push([id, decision]);
    this.end(id, 'answered');
  }
}
