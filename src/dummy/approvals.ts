import { Emitter } from '../model/emitter.ts';
import type { Approval, ApprovalDecision, ApprovalsPort } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type ApprovalScenario = 'agent' | 'user' | 'many' | 'follower' | 'fail' | 'soon';

const minutes = 60_000;

export function approvalFixtures(scenario: ApprovalScenario, now = Date.now()): Approval[] {
  const agent: Approval = {
    id: 'sudo-jq',
    kind: 'sudo',
    requester: { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' },
    command: 'apt install jq',
    cwd: '/workspace/harbor',
    createdAt: now,
    expiresAt: now + (scenario === 'soon' ? 0.4 * minutes : 5 * minutes),
    always: true,
  };
  const user: Approval = {
    id: 'sudo-chown',
    kind: 'sudo',
    requester: { kind: 'user', name: 'sliccy', where: 'Terminal 2' },
    command: 'chown -R sliccy /workspace/shared',
    createdAt: now + 1,
    expiresAt: now + 5 * minutes,
    always: true,
  };
  const cache: Approval = {
    id: 'sudo-cache',
    kind: 'sudo',
    requester: { kind: 'agent', name: 'quiet-otter', agentId: 'scoop-otter' },
    command: 'rm -rf /var/cache/harbor',
    createdAt: now + 2,
    expiresAt: now + 5 * minutes,
    always: false,
  };
  if (scenario === 'user') return [user];
  if (scenario === 'many') return [agent, user, cache];
  return [agent];
}

export class DummyApprovals
  extends Emitter<{ approvals: readonly Approval[] }>
  implements ApprovalsPort
{
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
    if (scenario !== 'follower') this.decide = (id, decision) => this.#decide(id, decision);
  }

  list(): readonly Approval[] {
    return [...this.#approvals];
  }

  async #decide(id: string, decision: ApprovalDecision): Promise<void> {
    await this.#time.sleep(10);
    if (this.#fail) throw new Error('The kernel stopped waiting. Run the command again.');
    this.decisions.push([id, decision]);
    this.#approvals = this.#approvals.filter((approval) => approval.id !== id);
    this.emit('approvals', this.list());
  }
}
