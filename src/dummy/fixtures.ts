import type {
  Account,
  Agent,
  BrowserTab,
  Change,
  Message,
  ModelOption,
  Settings,
  TerminalInfo,
  UserMessage,
} from '../model/types.ts';
import { showcase, showcaseAgent, showcaseQueue } from './showcase.ts';

const cacheBefore = `export interface Entry<T> {
  value: T;
  storedAt: number;
}

const TTL = 60 * 60 * 1000;

export class ForecastCache<T> {
  #entries = new Map<string, Entry<T>>();

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    const day = new Date(entry.storedAt).getDate();
    if (day !== new Date(now).getDate()) return entry.value;
    if (now - entry.storedAt > TTL) return undefined;
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.#entries.set(key, { value, storedAt: now });
  }
}
`;

const cacheAfter = `export interface Entry<T> {
  value: T;
  storedAt: number;
}

const TTL = 60 * 60 * 1000;

export class ForecastCache<T> {
  #entries = new Map<string, Entry<T>>();

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (dayOf(entry.storedAt) !== dayOf(now)) {
      this.#entries.delete(key);
      return undefined;
    }
    if (now - entry.storedAt > TTL) return undefined;
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.#entries.set(key, { value, storedAt: now });
  }
}

function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
`;

const retry = `export async function retry<T>(task: () => Promise<T>, attempts = 3, wait = 250): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, wait * 2 ** attempt));
    }
  }
  throw last;
}
`;

const legacyXml = `export function toXml(forecast: { city: string; high: number; low: number }): string {
  return \`<forecast city="\${forecast.city}"><high>\${forecast.high}</high><low>\${forecast.low}</low></forecast>\`;
}
`;

const forecastBefore = `import { ForecastCache } from '../lib/cache.ts';
import { toCelsius } from '../lib/units.ts';

const cache = new ForecastCache<Forecast>();

export interface Forecast {
  city: string;
  high: number;
  low: number;
  summary: string;
}

export async function forecast(city: string, upstream: typeof fetch = fetch): Promise<Forecast> {
  const cached = cache.get(city);
  if (cached) return cached;
  const response = await upstream(\`https://api.example.com/v2/forecast?city=\${encodeURIComponent(city)}\`);
  const body = await response.json();
  const result = {
    city,
    high: toCelsius(body.daily.max),
    low: toCelsius(body.daily.min),
    summary: body.daily.summary,
  };
  cache.set(city, result);
  return result;
}
`;

const forecastAfter = forecastBefore
  .replace(
    "import { toCelsius } from '../lib/units.ts';",
    "import { retry } from '../lib/retry.ts';\nimport { toCelsius } from '../lib/units.ts';"
  )
  .replace('const response = await upstream(', 'const response = await retry(() =>\n    upstream(')
  .replace('(city)}`);', '(city)}`)\n  );');

const units = `export function toCelsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5) / 9);
}

export function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}
`;

const unitsTest = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCelsius, toFahrenheit } from '../src/lib/units.ts';

test('converts both ways', () => {
  assert.equal(toCelsius(212), 100);
  assert.equal(toFahrenheit(0), 32);
});
`;

const index = `import { forecast } from './routes/forecast.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    const city = url.searchParams.get('city');
    if (!city) return Response.json({ error: 'city is required' }, { status: 400 });
    return Response.json(await forecast(city));
  },
};
`;

const readme = `# harbor

A small forecast API that sits in front of the upstream weather service and caches per city.

## Development

\`\`\`sh
npm install
npm test
npm run dev
\`\`\`

The worker listens on \`http://localhost:8787\`. Try \`/forecast?city=Lisbon\`.
`;

const pkg = `{
  "name": "harbor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "node --test test/"
  },
  "devDependencies": {
    "wrangler": "4.40.0"
  }
}
`;

const skill = `---
name: release-notes
description: Draft release notes from merged pull requests since the last tag.
---

1. Run \`collect.jsh\` with the repository and the previous tag.
2. Group the pull requests by label: features, fixes, chores.
3. Write one sentence per change, in the past tense, without ticket numbers.
`;

const collect = `const [repo, since] = process.argv.slice(2);
const pulls = await gh(\`repos/\${repo}/pulls?state=closed&per_page=100\`);
for (const pull of pulls.filter((p) => p.merged_at > since)) {
  console.log(\`\${pull.number}\\t\${pull.labels.map((l) => l.name).join(',')}\\t\${pull.title}\`);
}
`;

const memory = `# Shared memory

## Preferences
- Keep replies short. Lead with the result, then the evidence.
- Run the tests before saying something is fixed.

## Projects
- harbor: forecast API, deployed as a worker. Cache bugs show up around midnight UTC.
- release-notes: drafted every Friday from merged pull requests.
`;

const standup = `# Standup, 4 October

- harbor: retries for upstream timeouts are in review.
- Docs: the forecast endpoint page still shows Fahrenheit examples.
- Next: move the cache to KV once the TTL fix lands.
`;

const sample = `{
  "city": "Lisbon",
  "daily": { "max": 77, "min": 61, "summary": "Clear, light wind from the north" }
}
`;

const bashrc = `export PS1='\\u@slicc:\\w\\$ '
alias ll='ls -la'
`;

export const files: Record<string, string> = {
  '/workspace/harbor/README.md': readme,
  '/workspace/harbor/package.json': pkg,
  '/workspace/harbor/wrangler.toml':
    'name = "harbor"\nmain = "src/index.ts"\ncompatibility_date = "2026-09-01"\n',
  '/workspace/harbor/.gitignore': 'node_modules/\n.wrangler/\n',
  '/workspace/harbor/src/index.ts': index,
  '/workspace/harbor/src/routes/forecast.ts': forecastBefore,
  '/workspace/harbor/src/lib/cache.ts': cacheBefore,
  '/workspace/harbor/src/lib/units.ts': units,
  '/workspace/harbor/src/legacy/xml.ts': legacyXml,
  '/workspace/harbor/test/units.test.ts': unitsTest,
  '/workspace/skills/release-notes/SKILL.md': skill,
  '/workspace/skills/release-notes/scripts/collect.jsh': collect,
  '/shared/MEMORY.md': memory,
  '/shared/notes/2026-10-04-standup.md': standup,
  '/home/user/.bashrc': bashrc,
  '/tmp/forecast-sample.json': sample,
};

export const directories = ['/sessions', '/home/user/downloads'];

export const pending: Change[] = [
  {
    path: '/workspace/harbor/src/lib/cache.ts',
    status: 'modified',
    before: cacheBefore,
    after: cacheAfter,
    agentId: 'cone-harbor',
  },
  {
    path: '/workspace/harbor/src/lib/retry.ts',
    status: 'added',
    before: null,
    after: retry,
    agentId: 'scoop-otter',
  },
  {
    path: '/workspace/harbor/src/routes/forecast.ts',
    status: 'modified',
    before: forecastBefore,
    after: forecastAfter,
    agentId: 'scoop-otter',
  },
  {
    path: '/workspace/harbor/src/legacy/xml.ts',
    status: 'deleted',
    before: legacyXml,
    after: null,
    agentId: 'cone-harbor',
  },
];

export const models: ModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'Anthropic' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'Anthropic' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { id: 'local-small', label: 'Local (ort-llama)', provider: 'This browser' },
];

export const defaults: Settings = {
  color: 'system',
  model: 'claude-sonnet-5-5',
  thinking: 'medium',
  sendOnEnter: true,
  showThinking: true,
  diffStyle: 'unified',
};

export const accounts: Account[] = [
  { id: 'anthropic', provider: 'Anthropic', identity: 'API key ending 3f2a', status: 'connected' },
  { id: 'github', provider: 'GitHub', identity: '@example-dev', status: 'connected' },
  { id: 'adobe', provider: 'Adobe', identity: 'dev@example.com', status: 'expired' },
  { id: 'openai', provider: 'OpenAI', identity: '', status: 'disconnected', auth: 'api-key' },
];

export const agents: Agent[] = [
  {
    id: 'cone-sliccy',
    name: 'sliccy',
    kind: 'cone',
    parentId: null,
    status: 'idle',
    model: 'claude-sonnet-5-5',
    contextFill: 0.21,
    unread: 0,
  },
  showcaseAgent,
  {
    id: 'cone-harbor',
    name: 'harbor',
    kind: 'cone',
    parentId: null,
    status: 'idle',
    model: 'claude-opus-5-5',
    contextFill: 0.38,
    unread: 0,
  },
  {
    id: 'scoop-otter',
    name: 'quiet-otter',
    kind: 'scoop',
    parentId: 'cone-harbor',
    status: 'working',
    model: 'claude-haiku-4-5',
    contextFill: 0.12,
    unread: 0,
  },
  {
    id: 'scoop-heron',
    name: 'amber-heron',
    kind: 'scoop',
    parentId: 'cone-harbor',
    status: 'idle',
    model: 'claude-haiku-4-5',
    contextFill: 0.04,
    unread: 0,
  },
  {
    id: 'cone-release',
    name: 'release-notes',
    kind: 'cone',
    parentId: null,
    status: 'idle',
    model: 'claude-sonnet-5-5',
    contextFill: 0.09,
    unread: 1,
  },
  {
    id: 'cone-triage',
    name: 'inbox-triage',
    kind: 'cone',
    parentId: null,
    status: 'waiting',
    model: 'claude-sonnet-5-5',
    contextFill: 0.62,
    unread: 2,
  },
  {
    id: 'scoop-wren',
    name: 'tidal-wren',
    kind: 'scoop',
    parentId: 'cone-sliccy',
    status: 'idle',
    model: 'claude-haiku-4-5',
    contextFill: 0.02,
    unread: 0,
  },
];

const start = Date.UTC(2026, 9, 5, 8, 30);
const at = (minutes: number) => start + minutes * 60_000;

export const queues: Record<string, UserMessage[]> = { 'cone-kitchen': showcaseQueue() };

export const conversations: Record<string, Message[]> = {
  'cone-kitchen': showcase(),
  'cone-sliccy': [
    {
      id: 'm-s0',
      role: 'assistant',
      status: 'done',
      createdAt: at(-24 * 60),
      parts: [
        {
          type: 'text',
          text: 'Hi, I am sliccy. Tell me a little about yourself, and I will set things up for you.',
        },
        { type: 'sprinkle', sprinkle: 'welcome' },
      ],
    },
    {
      id: 'm-s1',
      role: 'user',
      text: 'What is on my plate today?',
      createdAt: at(0),
    },
    {
      id: 'm-s2',
      role: 'assistant',
      status: 'done',
      createdAt: at(1),
      parts: [
        {
          type: 'tool',
          tool: {
            id: 't-s1',
            name: 'read_file',
            title: 'Read the standup notes',
            input: '/shared/notes/2026-10-04-standup.md',
            output: standup,
            status: 'done',
            paths: ['/shared/notes/2026-10-04-standup.md'],
          },
        },
        {
          type: 'text',
          text: 'Three things carry over from yesterday:\n\n1. **harbor**: the retry change is in review, and the midnight cache bug is still open.\n2. **Docs**: the forecast page still shows Fahrenheit examples.\n3. **release-notes** has a draft waiting for you.\n\nThe `harbor` cone is the one to start with.',
        },
      ],
    },
  ],
  'cone-harbor': [
    {
      id: 'm-h1',
      role: 'lick',
      channel: 'webhook',
      title: 'GitHub · issue opened',
      text: 'example/harbor#57: Forecast stays on yesterday after midnight UTC',
      createdAt: at(2),
    },
    {
      id: 'm-h2',
      role: 'user',
      text: 'The forecast endpoint serves stale data after midnight UTC. Find out why and fix it.',
      createdAt: at(3),
    },
    {
      id: 'm-h3',
      role: 'assistant',
      status: 'done',
      createdAt: at(4),
      parts: [
        {
          type: 'thinking',
          text: 'Stale after midnight points at the cache expiry. Check how the cache compares days.',
        },
        {
          type: 'tool',
          tool: {
            id: 't-h1',
            name: 'bash',
            title: 'Search for the cache expiry',
            input: 'rg -n "getDate|TTL" src',
            output:
              'src/lib/cache.ts:6:const TTL = 60 * 60 * 1000;\nsrc/lib/cache.ts:14:    const day = new Date(entry.storedAt).getDate();\nsrc/lib/cache.ts:16:    if (now - entry.storedAt > TTL) return undefined;',
            status: 'done',
            paths: ['/workspace/harbor/src/lib/cache.ts'],
          },
        },
        {
          type: 'tool',
          tool: {
            id: 't-h2',
            name: 'read_file',
            title: 'Read the cache',
            input: '/workspace/harbor/src/lib/cache.ts',
            output: cacheBefore,
            status: 'done',
            paths: ['/workspace/harbor/src/lib/cache.ts'],
          },
        },
        {
          type: 'tool',
          tool: {
            id: 't-h3',
            name: 'edit_file',
            title: 'Expire entries from the previous day',
            input: '/workspace/harbor/src/lib/cache.ts',
            output: 'Replaced 1 block (4 lines → 7 lines), added dayOf()',
            status: 'done',
            paths: ['/workspace/harbor/src/lib/cache.ts'],
          },
        },
        {
          type: 'tool',
          tool: {
            id: 't-h4',
            name: 'bash',
            title: 'Run the tests',
            input: 'npm test',
            output:
              '> harbor@0.0.0 test\n> node --test test/\n\n✔ converts both ways (0.6ms)\n✔ expires entries from the previous day (0.4ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0',
            status: 'done',
            paths: [],
          },
        },
        {
          type: 'text',
          text: 'Found it. `ForecastCache.get` compared **local** calendar days, and when the day changed it returned the old entry instead of dropping it:\n\n```ts\nif (day !== new Date(now).getDate()) return entry.value;\n```\n\nI changed it to compare UTC dates and delete the entry, so the first request after midnight goes upstream. The tests pass.\n\n| | Before | After |\n| --- | --- | --- |\n| Day compared | local `getDate()` | UTC `toISOString()` |\n| On a new day | returns stale entry | deletes and refetches |\n\nquiet-otter is adding retries for upstream timeouts in a scoop.',
        },
      ],
    },
    {
      id: 'm-h4',
      role: 'lick',
      channel: 'scoop-notify',
      title: 'quiet-otter',
      text: 'Started: add retries with backoff around the upstream fetch',
      createdAt: at(9),
    },
  ],
  'scoop-otter': [
    {
      id: 'm-o1',
      role: 'user',
      text: 'Wrap the upstream fetch in src/routes/forecast.ts with three retries and exponential backoff.',
      createdAt: at(9),
    },
    {
      id: 'm-o2',
      role: 'assistant',
      status: 'done',
      createdAt: at(10),
      parts: [
        {
          type: 'tool',
          tool: {
            id: 't-o1',
            name: 'write_file',
            title: 'Add retry()',
            input: '/workspace/harbor/src/lib/retry.ts',
            output: 'Wrote 12 lines',
            status: 'done',
            paths: ['/workspace/harbor/src/lib/retry.ts'],
          },
        },
        {
          type: 'tool',
          tool: {
            id: 't-o2',
            name: 'edit_file',
            title: 'Use retry() for the upstream call',
            input: '/workspace/harbor/src/routes/forecast.ts',
            output: 'Replaced 1 block',
            status: 'done',
            paths: ['/workspace/harbor/src/routes/forecast.ts'],
          },
        },
        { type: 'text', text: 'Both edits are in. Running the tests next.' },
      ],
    },
  ],
  'scoop-heron': [],
  'scoop-wren': [],
  'cone-release': [
    {
      id: 'm-r1',
      role: 'lick',
      channel: 'cron',
      title: 'Every Friday 09:00',
      text: 'Draft the release notes for example/harbor',
      createdAt: at(-1440),
    },
    {
      id: 'm-r2',
      role: 'assistant',
      status: 'done',
      createdAt: at(-1438),
      parts: [
        {
          type: 'tool',
          tool: {
            id: 't-r1',
            name: 'bash',
            title: 'Collect merged pull requests',
            input: 'collect.jsh example/harbor v1.8.0',
            output:
              '41\tfix\tReturn 400 when the city is missing\n43\tfeature\tAdd /health\n44\tchore\tUpdate wrangler to 4.40.0',
            status: 'done',
            paths: ['/workspace/skills/release-notes/scripts/collect.jsh'],
          },
        },
        {
          type: 'text',
          text: '## harbor 1.9.0\n\n**Features**\n- Added a `/health` endpoint.\n\n**Fixes**\n- Requests without a city now get a 400 instead of a 500.\n\n**Chores**\n- Updated wrangler to 4.40.0.',
        },
      ],
    },
  ],
  'cone-triage': [
    {
      id: 'm-t1',
      role: 'system',
      kind: 'compaction',
      trigger: 'threshold',
      state: 'summarized',
      title: 'Context compacted',
      text: '41 earlier messages were summarized to stay under the context limit.',
      createdAt: at(-30),
    },
    {
      id: 'm-t2',
      role: 'assistant',
      status: 'done',
      createdAt: at(-20),
      parts: [
        {
          type: 'text',
          text: 'Two messages need a decision from you:\n\n- A vendor asks to move Thursday’s call to Friday.\n- The staging certificate expires in 6 days. Should I open a ticket?',
        },
      ],
    },
    {
      id: 'm-t3',
      role: 'system',
      kind: 'error',
      action: 'login',
      title: 'Mail connector',
      text: 'The connector returned 401. Reconnect the account in Settings.',
      createdAt: at(-19),
    },
  ],
};

export const tabs: BrowserTab[] = [
  {
    id: 'tab-preview',
    title: 'harbor · localhost',
    url: 'http://localhost:8787/forecast?city=Lisbon',
    status: 'complete',
    agentId: 'cone-harbor',
  },
  {
    id: 'tab-docs',
    title: 'Forecast API reference',
    url: 'https://api.example.com/docs/v2/forecast',
    status: 'complete',
    agentId: null,
  },
  {
    id: 'tab-pull',
    title: 'Add retries for upstream timeouts · Pull request #58',
    url: 'https://git.example.com/example/harbor/pull/58',
    status: 'complete',
    agentId: 'scoop-otter',
  },
];

export const terminals: TerminalInfo[] = [
  { id: 'term-1', title: 'bash', cwd: '/workspace/harbor', agentId: null },
];
