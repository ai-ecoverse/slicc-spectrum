import type {
  Approval,
  ApprovalDecision,
  ApprovalEnd,
  ApprovalRecord,
  ApprovalRun,
  LickMessage,
  SudoApproval,
} from '../model/types.ts';
import type { Clock } from './clock.ts';

const minute = 60_000;

const otter = { kind: 'agent', name: 'quiet-otter', agentId: 'scoop-otter' } as const;
const heron = { kind: 'agent', name: 'amber-heron', agentId: 'scoop-heron' } as const;
const docs = { kind: 'agent', name: 'docs-pass', agentId: 'scoop-docs' } as const;
const sliccy = { kind: 'agent', name: 'sliccy', agentId: 'cone-sliccy' } as const;
const terminal = { kind: 'user', name: 'cone', where: 'Terminal 2' } as const;

export const runsDir = '/home/cone/.slicc/sudo-runs';

export const runFailure = 'sudo: /home/cone/harbor/deploy.sh changed since it was requested';

export const runRefusal = 'sudo: amber-heron may no longer run /usr/bin/rsync as root';

export function runOutput(id: string): { stdout: string; stderr: string } {
  return { stdout: `${runsDir}/${id}.out`, stderr: `${runsDir}/${id}.err` };
}

function sudo(
  id: string,
  requester: SudoApproval['requester'],
  command: string,
  createdAt: number,
  extra: Partial<SudoApproval> = {}
): SudoApproval {
  return {
    id,
    kind: 'sudo',
    requester,
    command,
    cwd: '/home/cone/harbor',
    createdAt,
    expiresAt: createdAt + 5 * minute,
    always: false,
    ...extra,
  };
}

export function historyFixtures(now = Date.now()): ApprovalRecord[] {
  const ago = (minutes: number) => now - minutes * minute;
  const timedOut = (
    approval: SudoApproval
  ): Pick<ApprovalRecord, 'state' | 'reason' | 'decidedAt'> => ({
    state: 'unanswered',
    reason: 'timeout',
    decidedAt: approval.expiresAt,
  });
  const late = sudo('apr-late', otter, 'systemctl restart nginx', ago(40), {
    cwd: '/home/cone',
    verdict: { level: 2, aligned: true, reason: 'It restarts a service the owner asked for.' },
  });
  const moved = sudo('apr-moved', heron, '/home/cone/harbor/deploy.sh --stage', ago(90), {
    verdict: { level: 2, aligned: true, reason: 'It runs the harbor deploy script.' },
  });
  const frozen = sudo('apr-frozen', docs, 'npm ci --prefix /opt/harbor-docs', ago(150), {
    verdict: { level: 1, aligned: true, reason: 'It installs the docs dependencies.' },
  });
  const typed = sudo('apr-terminal', terminal, 'apt-get install -y ripgrep', ago(200), {
    verdict: { level: 1, aligned: true, reason: 'It installs a package.' },
  });
  const running = sudo('apr-running', sliccy, 'apt-get upgrade -y', ago(9), {
    cwd: '/home/cone',
    verdict: { level: 2, aligned: true, reason: 'It upgrades the system packages.' },
  });
  const done = sudo('apr-done', otter, 'certbot renew', ago(80), {
    cwd: '/home/cone',
    verdict: { level: 2, aligned: true, reason: 'It renews the TLS certificates.' },
  });
  const survivors = sudo('apr-survivors', sliccy, 'setsid sleep 3600 &', ago(70), {
    cwd: '/home/cone',
    verdict: { level: 2, aligned: true, reason: 'It starts a background job.' },
  });
  const exited = sudo('apr-exit', heron, 'make -C /opt/harbor install', ago(300), {
    target: 'www-data',
    verdict: { level: 2, aligned: true, reason: 'It installs the harbor build.' },
  });
  const refused = sudo('apr-failed', heron, 'rsync -a dist/ /srv/harbor/', ago(400), {
    verdict: { level: 2, aligned: true, reason: 'It publishes the harbor build.' },
  });
  return [
    {
      approval: sudo('apr-open', otter, 'apt install jq', ago(1), {
        expiresAt: now + 5 * minute,
        always: true,
        stoppable: true,
        verdict: { level: 1, aligned: true, reason: 'It installs a package the owner asked for.' },
      }),
      state: 'pending',
    },
    {
      approval: running,
      ...timedOut(running),
      run: { state: 'running', by: 'you', at: ago(2), pid: 640, ...runOutput('apr-running') },
    },
    { approval: late, ...timedOut(late), runnable: true },
    {
      approval: sudo('apr-once', terminal, 'chown -R cone /home/cone/shared', ago(50), {
        verdict: { level: 1, aligned: true, reason: 'It hands the owner their own files.' },
      }),
      state: 'approved',
      answer: 'once',
      decidedBy: 'you',
      device: 'Studio Mac',
      decidedAt: ago(49),
    },
    {
      approval: done,
      ...timedOut(done),
      run: {
        state: 'done',
        by: 'you',
        at: ago(60),
        endedAt: ago(60) + 41_000,
        pid: 702,
        status: 0,
        ...runOutput('apr-done'),
      },
    },
    {
      approval: survivors,
      ...timedOut(survivors),
      run: {
        state: 'done',
        by: 'you',
        at: ago(55),
        endedAt: ago(55) + 12_000,
        pid: 910,
        status: 0,
        survivors: [1234, 5678],
        ...runOutput('apr-survivors'),
      },
    },
    { approval: moved, ...timedOut(moved), runnable: true },
    {
      approval: sudo('apr-always', docs, 'jq .rules /etc/slicc/secrets-policy.toml', ago(120), {
        cwd: '/',
        always: true,
        verdict: { level: 1, aligned: true, reason: 'It reads a file and changes nothing.' },
      }),
      state: 'approved',
      answer: 'always',
      decidedBy: 'you',
      decidedAt: ago(119),
    },
    { approval: frozen, ...timedOut(frozen), runnable: { reason: 'Thaw harbor first.' } },
    {
      approval: sudo('apr-denied', otter, 'rm -rf /', ago(180), {
        verdict: { level: 3, aligned: false, reason: 'It deletes system files.' },
      }),
      state: 'rejected',
      decidedBy: 'you',
      device: 'Studio Mac',
      decidedAt: ago(179),
    },
    { approval: typed, ...timedOut(typed), runnable: { reason: 'Run it again in the terminal.' } },
    {
      approval: sudo('apr-withdrawn', docs, 'npm run build --prefix /opt/harbor-docs', ago(250)),
      state: 'withdrawn',
      reason: 'stopped',
      decidedAt: ago(249),
    },
    {
      approval: exited,
      ...timedOut(exited),
      run: {
        state: 'done',
        by: 'you',
        at: ago(240),
        endedAt: ago(240) + 95_000,
        pid: 655,
        status: 2,
        ...runOutput('apr-exit'),
      },
    },
    {
      approval: refused,
      ...timedOut(refused),
      run: { state: 'failed', by: 'you', at: ago(350), error: runRefusal },
    },
  ];
}

export const runFiles: Record<string, string> = {
  [`${runsDir}/apr-done.out`]:
    'Processing /etc/letsencrypt/renewal/harbor.example.conf\nCongratulations, all renewals succeeded.\n',
  [`${runsDir}/apr-done.err`]: '',
  [`${runsDir}/apr-survivors.out`]: 'setsid sleep 3600 &\n',
  [`${runsDir}/apr-survivors.err`]: '',
  [`${runsDir}/apr-exit.out`]: 'install -d /opt/harbor/bin\n',
  [`${runsDir}/apr-exit.err`]:
    'install: cannot create directory /opt/harbor/bin: Permission denied\nmake: *** [install] Error 2\n',
};

export interface RunHost {
  emit(): void;
  write(path: string, text: string): void;
  lick(agentId: string, title: string, text: string, extra: Partial<LickMessage>): void;
}

export class DummyHistory {
  #records: ApprovalRecord[];
  #time: Clock;
  #host: RunHost;
  #ends = new Map<string, (stopped: boolean) => void>();
  #generations = new Map<string, number>();
  #pid = 812;
  runTicks: number | null = 100;
  runs: string[] = [];
  stops: string[] = [];

  constructor(time: Clock, host: RunHost, records = historyFixtures()) {
    this.#records = records;
    this.#time = time;
    this.#host = host;
    for (const [path, text] of Object.entries(runFiles)) host.write(path, text);
  }

  list(): readonly ApprovalRecord[] {
    return this.#records.map((record) => ({ ...record }));
  }

  #find(id: string): ApprovalRecord | undefined {
    return this.#records.find((record) => record.approval.id === id);
  }

  #update(id: string, patch: Partial<ApprovalRecord>): void {
    this.#records = this.#records.map((record) =>
      record.approval.id === id ? { ...record, ...patch } : record
    );
    this.#host.emit();
  }

  #running(id: string, patch: Partial<ApprovalRun>): ApprovalRun {
    const run = { ...(this.#find(id)?.run as ApprovalRun), ...patch };
    this.#update(id, { run });
    return run;
  }

  #live(id: string, generation: number): boolean {
    return (this.#generations.get(id) ?? 0) === generation;
  }

  generation(id: string): number {
    return this.#generations.get(id) ?? 0;
  }

  raise(approval: Approval): void {
    this.#generations.set(approval.id, (this.#generations.get(approval.id) ?? 0) + 1);
    this.#ends.delete(approval.id);
    const others = this.#records.filter((record) => record.approval.id !== approval.id);
    this.#records = [{ approval, state: 'pending' }, ...others];
    this.#host.emit();
  }

  decided(id: string, decision: ApprovalDecision, generation?: number): void {
    if (generation !== undefined && !this.#live(id, generation)) return;
    const deny = decision === 'deny' || decision === 'stop';
    this.#update(id, {
      state: deny ? 'rejected' : 'approved',
      ...(deny ? {} : { answer: decision === 'always' ? 'always' : 'once' }),
      decidedBy: 'you',
      decidedAt: Date.now(),
    });
  }

  ended(id: string, reason: ApprovalEnd): void {
    const record = this.#find(id);
    if (record?.state !== 'pending') return;
    const at = Date.now();
    if (reason === 'answered')
      this.#update(id, {
        state: 'approved',
        answer: 'once',
        decidedBy: 'you',
        device: 'Studio Mac',
        decidedAt: at,
      });
    else if (reason === 'withdrawn')
      this.#update(id, { state: 'withdrawn', reason: 'stopped', decidedAt: at });
    else {
      const { approval } = record;
      const agent = approval.kind === 'sudo' && approval.requester.kind === 'agent';
      this.#update(id, {
        state: 'unanswered',
        reason: 'timeout',
        decidedAt: at,
        runnable: agent ? true : { reason: 'Run it again in the terminal.' },
      });
    }
  }

  async run(id: string): Promise<void> {
    await this.#time.sleep(5);
    const record = this.#find(id);
    if (record?.run) throw new Error('This request is already running.');
    if (record?.runnable !== true) throw new Error('This request can’t run now.');
    this.runs.push(id);
    this.#update(id, { run: { state: 'starting', by: 'you', at: Date.now() } });
    void this.#walk(record.approval as SudoApproval);
  }

  async stopRun(id: string): Promise<void> {
    await this.#time.sleep(5);
    const run = this.#find(id)?.run;
    if (run?.state === 'running') {
      this.stops.push(id);
      this.#end(id, true);
      return;
    }
    if (!(run?.survivors && run.survivors.length > 0)) throw new Error('This run already ended.');
    this.stops.push(id);
    await this.#time.sleep(30);
    const current = this.#find(id)?.run;
    if (!current?.survivors?.length) return;
    const { survivors: _gone, ...rest } = current;
    this.#update(id, { run: rest });
  }

  finish(id: string): void {
    if (this.#find(id)?.run?.state === 'running') this.#end(id, false);
  }

  #end(id: string, stopped: boolean): void {
    const end = this.#ends.get(id);
    if (end) end(stopped);
    else
      this.#running(
        id,
        stopped
          ? { state: 'stopped', signal: 'SIGTERM', endedAt: Date.now() }
          : { state: 'done', status: 0, endedAt: Date.now() }
      );
  }

  async #walk(approval: SudoApproval): Promise<void> {
    const { id } = approval;
    const generation = this.#generations.get(id) ?? 0;
    await this.#time.sleep(10);
    if (!this.#live(id, generation)) return;
    if (id === 'apr-moved') {
      this.#running(id, { state: 'failed', error: runFailure });
      return;
    }
    const pid = this.#pid++;
    const output = runOutput(id);
    const ended = this.#wait(id);
    const run = this.#running(id, { state: 'running', pid, ...output });
    const agentId = approval.requester.agentId as string;
    this.#host.lick(
      agentId,
      `sudo runs now: ${approval.command}`,
      'The owner ran your timed-out sudo request',
      {
        approval: id,
        body: `It runs in the background (pid ${pid}), with no terminal and no input.\nIts result follows as another sudo-run lick. Output: ${output.stdout} (.err)`,
      }
    );
    const stopped = await ended;
    if (!this.#live(id, generation)) return;
    const endedAt = Date.now();
    const took = Math.round((endedAt - run.at) / 1000);
    const text = stopped ? `Stopped after ${took} s` : `Exited with status 0 after ${took} s`;
    this.#host.write(output.stdout, stopped ? '' : `${approval.command}: done\n`);
    this.#host.write(output.stderr, '');
    this.#running(
      id,
      stopped
        ? { state: 'stopped', signal: 'SIGTERM', endedAt }
        : { state: 'done', status: 0, endedAt }
    );
    this.#host.lick(agentId, `sudo run ended: ${approval.command}`, text, {
      approval: id,
      ...(stopped ? { severity: 'warn' as const } : {}),
      body: `Output: ${output.stdout}\nErrors: ${output.stderr}`,
    });
  }

  #wait(id: string): Promise<boolean> {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    this.#ends.set(id, resolve);
    const ticks = this.runTicks;
    if (ticks !== null) void this.#time.sleep(ticks).then(() => resolve(false));
    return promise.then((stopped) => {
      if (this.#ends.get(id) === resolve) this.#ends.delete(id);
      return stopped;
    });
  }
}
