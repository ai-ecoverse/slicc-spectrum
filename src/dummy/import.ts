import type {
  FrozenCone,
  Message,
  ProfileImportOptions,
  ProfileImportPreview,
  ProfileImportProgress,
  ProfileImportResult,
} from '../model/types.ts';
import type { DummyAgent } from './agent.ts';
import type { Clock } from './clock.ts';

export type ImportScenario = 'v6' | 'again' | 'fail' | 'cancel-check';

const day = 86_400_000;

export const importNotV6 = 'That zip isn’t a SLICC 6 profile export.';
export const importCancelled = 'The import was cancelled.';
export const importReport = '/root/v6-import-2026-10-18.md';
export const importTotal = 14;
export const importBefore = Date.UTC(2026, 9, 15, 14, 30);

export function importPreview(already: number | null): ProfileImportPreview {
  return {
    origin: 'www.sliccy.ai',
    createdAt: Date.UTC(2026, 9, 12, 16, 20),
    cones: 3,
    scoops: 14,
    frozen: 2,
    bytes: 4_823_449,
    skills: ['ferry-times', 'pantry-labels'],
    crons: 2,
    webhooks: 1,
    flagged: ['/workspace/pantry/.env'],
    providers: ['anthropic', 'openai'],
    mounts: ['/mnt/photos', '/mnt/recipes'],
    already,
    text: 'This export from www.sliccy.ai has 3 cones with 14 scoops and 2 frozen conversations. They arrive frozen, so nothing runs until you thaw them.',
  };
}

export const importCones: ReadonlyArray<Omit<FrozenCone, 'frozenAt'> & { age: number }> = [
  {
    id: 'cone-v6-lighthouse',
    kind: 'cone',
    name: 'lighthouse',
    title: 'Plan the lighthouse open day',
    model: 'claude-sonnet-5-5',
    messages: 31,
    age: 36,
    v6: true,
  },
  {
    id: 'cone-v6-pantry',
    kind: 'cone',
    name: 'pantry',
    title: 'Sort the pantry inventory and print the labels',
    model: 'claude-haiku-4-5',
    messages: 12,
    age: 44,
    v6: true,
  },
  {
    id: 'cone-v6-ferry',
    kind: 'cone',
    name: 'ferry-times',
    title: 'Check the ferry timetable changes every morning',
    model: 'gpt-6-mini',
    messages: 58,
    age: 71,
    v6: true,
  },
];

const idle: ProfileImportProgress = { phase: 'idle', done: 0, total: 0, text: '' };

function conversation(id: string, title: string, at: number): Message[] {
  return [
    { id: `${id}-1`, role: 'user', text: title, createdAt: at },
    {
      id: `${id}-2`,
      role: 'assistant',
      status: 'done',
      createdAt: at + 60_000,
      parts: [
        { type: 'text', text: 'Imported from SLICC 6. The earlier turns are in the report.' },
      ],
    },
  ];
}

export class DummyImport {
  readonly scenario: ImportScenario;
  #agent: DummyAgent;
  #clock: Clock;
  #run = 0;
  #imports = 0;
  #already: number | null;
  #progress: ProfileImportProgress = idle;

  constructor(scenario: ImportScenario, agent: DummyAgent, clock: Clock) {
    this.scenario = scenario;
    this.#agent = agent;
    this.#clock = clock;
    this.#already = scenario === 'again' ? importBefore : null;
  }

  importing(): ProfileImportProgress {
    return { ...this.#progress };
  }

  importCancel(): void {
    this.#run++;
    this.#set(idle);
  }

  async importProfile(_file: Blob, options: ProfileImportOptions): Promise<ProfileImportResult> {
    const run = ++this.#run;
    this.#set({ phase: 'checking', done: 0, total: 0, text: 'Checking the profile…' });
    await this.#step(run, this.scenario === 'cancel-check' ? 200 : 4);
    if (this.scenario === 'fail') {
      this.#set({ phase: 'failed', done: 0, total: 0, text: importNotV6 });
      throw new Error(importNotV6);
    }
    const preview = importPreview(this.#already);
    if (options.preview) {
      this.#set(idle);
      return { preview, cones: [], report: null, text: preview.text };
    }
    for (const done of [0, 5, 10, importTotal]) {
      this.#set({
        phase: 'writing',
        done,
        total: importTotal,
        text: `Importing ${done}/${importTotal}`,
      });
      await this.#step(run, 6);
    }
    const cones = this.#write();
    this.#already = Date.now();
    this.#set({ phase: 'done', done: importTotal, total: importTotal, text: 'Imported' });
    return {
      preview,
      cones,
      report: importReport,
      text: 'Their scoops, skills and crons came along. Sign in to Anthropic and OpenAI again before you thaw them.',
    };
  }

  #write(): string[] {
    const suffix = this.#imports ? `-${this.#imports + 1}` : '';
    this.#imports++;
    const now = Date.now();
    const rows = importCones.map(({ age, ...cone }) => {
      const id = `${cone.id}${suffix}`;
      const frozenAt = now - age * day;
      return {
        cone: { ...cone, id, frozenAt },
        messages: conversation(id, cone.title, frozenAt),
      };
    });
    this.#agent.addFrozen(rows);
    return rows.map((row) => row.cone.id);
  }

  async #step(run: number, ticks: number): Promise<void> {
    await this.#clock.sleep(ticks);
    if (run !== this.#run) throw new Error(importCancelled);
  }

  #set(progress: ProfileImportProgress): void {
    this.#progress = progress;
    this.#agent.emit('importing', this.importing());
  }
}
