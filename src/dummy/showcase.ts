import type { Agent, LickChannel, Message, ToolCall, UserMessage } from '../model/types.ts';

const start = Date.UTC(2026, 9, 4, 16, 0);
const at = (minutes: number) => start + minutes * 60_000;

export function picture(
  label: string,
  from: string,
  to: string,
  width = 640,
  height = 400
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><text x="50%" y="50%" font-family="sans-serif" font-size="${Math.round(height / 9)}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function tone(seconds = 0.6, frequency = 440, rate = 8000): string {
  const samples = Math.round(seconds * rate);
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, (samples - i) / (rate / 10));
    bytes[44 + i] = 128 + Math.round(60 * fade * Math.sin((2 * Math.PI * frequency * i) / rate));
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function tool(
  id: string,
  name: string,
  title: string,
  input: string,
  output: string,
  extra: Partial<ToolCall> = {}
): ToolCall {
  return { id, name, title, input, output, status: 'done', paths: [], ...extra };
}

const markdown = [
  '## The forecast API in one page',
  '',
  'harbor answers `GET /forecast?city=…` with the day’s **high**, **low** and a *short summary*, and caches per city for an hour. ~~XML output~~ is gone.',
  '',
  '### How a request flows',
  '',
  '1. The worker parses the city.',
  '2. The cache answers if it has a fresh entry:',
  '   - same UTC day',
  '   - younger than one hour',
  '3. Otherwise the upstream call runs, with three retries.',
  '',
  '> Upstream is slow at the top of the hour. Retries back off at 250, 500 and 1000 ms.',
  '',
  '```ts',
  'export async function forecast(city: string): Promise<Forecast> {',
  '  const cached = cache.get(city);',
  '  if (cached) return cached;',
  '  return cache.set(city, await retry(() => upstream(city)));',
  '}',
  '```',
  '',
  '| Route | Cache | Typical latency |',
  '| --- | --- | ---: |',
  '| `/forecast` | 1 hour, per city | 38 ms |',
  '| `/health` | none | 2 ms |',
  '| `/forecast` (miss) | — | 410 ms |',
  '',
  '- [x] TTL fix merged',
  '- [ ] Move the cache to KV',
  '',
  'Details are in the [API reference](https://api.example.com/docs/v2/forecast). A long path that must wrap: `/workspace/harbor/node_modules/.cache/wrangler/state/v3/cache/miniflare-CacheObject/7c1f0e3b9a5d4e2f8b6a1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f.sqlite`.',
].join('\n');

const toolShapes: ToolCall[] = [
  tool('k-t1', 'bash', 'Count the routes', "rg -c 'pathname ===' src", 'src/index.ts:2'),
  tool(
    'k-t2',
    'read_file',
    'Read the router',
    '/workspace/harbor/src/index.ts',
    "import { forecast } from './routes/forecast.ts';\n…",
    {
      paths: ['/workspace/harbor/src/index.ts'],
    }
  ),
  tool(
    'k-t3',
    'write_file',
    'Create the KV binding notes',
    '/workspace/harbor/docs/kv.md',
    'Wrote 18 lines',
    {
      paths: ['/workspace/harbor/docs/kv.md'],
    }
  ),
  tool(
    'k-t4',
    'edit_file',
    'Rename the cache key',
    '/workspace/harbor/src/lib/cache.ts',
    'No match for "cityKey(" in src/lib/cache.ts',
    {
      status: 'error',
      paths: ['/workspace/harbor/src/lib/cache.ts'],
    }
  ),
  tool(
    'k-t5',
    'grep',
    'Find TODOs',
    'TODO --glob "src/**"',
    'src/routes/forecast.ts:14: TODO: cache negative results\nsrc/lib/units.ts:3: TODO: round half to even'
  ),
  tool(
    'k-t6',
    'web_fetch',
    'Fetch the API changelog',
    'https://api.example.com/changelog.json',
    '{ "latest": "2.4.1", "breaking": false }'
  ),
  tool(
    'k-t7',
    'browser',
    'Screenshot the preview',
    'screenshot http://localhost:8787/',
    'Captured 1280×800',
    {
      image: picture('localhost:8787', '#3b63fb', '#0a7a43', 640, 400),
    }
  ),
  tool(
    'k-t8',
    'scoop_scoop',
    'Start a scoop for the docs',
    'name: docs-pass\ntask: Update the forecast page to Celsius',
    'Scoop docs-pass is running'
  ),
  tool(
    'k-t9',
    'feed_scoop',
    'Hand the screenshots to docs-pass',
    'scoop_name: docs-pass\nmessage: Use the new screenshots in /tmp/shots',
    'Delivered'
  ),
  tool(
    'k-t10',
    'send_message',
    'Tell quiet-otter the tests pass',
    'to: quiet-otter\nmessage: CI is green, merge when ready',
    'Delivered'
  ),
  tool(
    'k-t11',
    'drop_scoop',
    'Wrap up amber-heron',
    'scoop_name: amber-heron',
    'Dropped amber-heron; its notes are in /shared/notes'
  ),
  tool(
    'k-t12',
    'update_global_memory',
    'Remember the cache rule',
    'Cache keys are per city and per UTC day.',
    'Memory updated (3 sections, 412 characters)'
  ),
  tool('k-t13', 'bash', 'Deploy to staging', 'wrangler deploy --env staging', 'Stopped', {
    status: 'cancelled',
  }),
  tool('k-t14', 'bash', 'Watch the logs', 'wrangler tail --env staging', '', { status: 'running' }),
];

const licks: Array<[LickChannel, string, string, string | undefined, Partial<Message>]> = [
  [
    'webhook',
    'GitHub · pull_request.opened',
    'example/harbor#58 Add retries for upstream timeouts',
    '{\n  "action": "opened",\n  "number": 58,\n  "repository": { "full_name": "example/harbor" }\n}',
    {},
  ],
  [
    'cron',
    'Every weekday 09:00',
    'Morning summary for the harbor cone',
    undefined,
    { count: 3 } as Partial<Message>,
  ],
  [
    'sprinkle',
    'Release board',
    'Button “Ship 1.9.0” clicked',
    '{ "button": "ship", "version": "1.9.0" }',
    {},
  ],
  [
    'fswatch',
    '/workspace/harbor/src',
    '2 files changed',
    'modified  /workspace/harbor/src/lib/cache.ts\ncreated   /workspace/harbor/src/lib/retry.ts',
    {},
  ],
  [
    'session-reload',
    'Session restored',
    'The page reloaded; 4 cones resumed from storage',
    undefined,
    {},
  ],
  [
    'navigate',
    'api.example.com',
    'A page offered a SLICC handoff: open the forecast docs',
    '{ "verb": "open", "target": "https://api.example.com/docs/v2/forecast" }',
    {},
  ],
  [
    'discovery',
    'api.example.com',
    'Found an ai-catalog.json with 3 tools',
    'https://api.example.com/.well-known/ai-catalog.json',
    {},
  ],
  ['upgrade', 'SLICC updated', '6.4.0 → 6.5.0', undefined, {}],
  [
    'workflow',
    'release-notes',
    'Step 2 of 4 finished: collect merged pull requests',
    undefined,
    {},
  ],
  ['bash', 'Job 3', 'npm run build exited with status 0 after 41 s', undefined, {}],
  ['jshd', 'collect.jsh', 'Script finished: 12 pull requests since v1.8.0', undefined, {}],
  ['preview', 'Preview bridge', 'Connected from localhost:8787', undefined, {}],
  [
    'cherry',
    'Host page',
    'Event “cart-updated” from shop.example.com',
    '{ "items": 3, "total": 42.5 }',
    {},
  ],
  ['scoop-notify', 'docs-pass', 'Finished: the forecast page now shows Celsius', undefined, {}],
  ['scoop-idle', 'amber-heron', 'Idle for 30 minutes', undefined, {}],
  ['scoop-wait', 'quiet-otter', 'The wait for CI resolved: all checks passed', undefined, {}],
  [
    'sudo-request',
    'docs-pass',
    'Wants to push to example/harbor (branch docs/celsius)',
    'git push origin docs/celsius',
    { state: 'pending' } as Partial<Message>,
  ],
  [
    'sudo-request',
    'quiet-otter',
    'Wants to read secrets: UPSTREAM_TOKEN',
    undefined,
    { state: 'confirmed' } as Partial<Message>,
  ],
  [
    'sudo-request',
    'amber-heron',
    'Wants to run: rm -rf /workspace/harbor/node_modules',
    undefined,
    { state: 'dismissed' } as Partial<Message>,
  ],
];

const attachmentsMessage: UserMessage = {
  id: 'k-u2',
  role: 'user',
  text: 'Here is the mockup, my notes and the old spec.',
  createdAt: at(4),
  attachments: [
    {
      id: 'k-a1',
      name: 'forecast-card.png',
      kind: 'image',
      mimeType: 'image/png',
      size: 48211,
      url: picture('Mockup', '#f5a623', '#d0021b', 480, 320),
    },
    {
      id: 'k-a2',
      name: 'notes.txt',
      kind: 'text',
      mimeType: 'text/plain',
      size: 214,
      text: 'Show °C first.\nRound to whole degrees.\nKeep the summary under 60 characters.',
    },
    {
      id: 'k-a3',
      name: 'spec-v1.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      size: 1_204_331,
      path: '/home/user/downloads/spec-v1.pdf',
    },
    {
      id: 'k-a4',
      name: 'UPSTREAM_TOKEN',
      kind: 'secret',
      mimeType: 'application/octet-stream',
      size: 0,
    },
    {
      id: 'k-a5',
      name: 'recording.mov',
      kind: 'file',
      mimeType: 'video/quicktime',
      size: 98_304_000,
      error: 'Too large: attachments are limited to 25 MB',
    },
  ],
};

export const showcaseAgent: Agent = {
  id: 'cone-kitchen',
  name: 'kitchen-sink',
  kind: 'cone',
  parentId: null,
  status: 'idle',
  model: 'claude-opus-5-5',
  contextFill: 0.47,
  unread: 0,
};

function opening(): Message[] {
  return [
    {
      id: 'k-u1',
      role: 'user',
      text: 'Give me the full tour of harbor, everything you can show.',
      createdAt: at(0),
    },
    {
      id: 'k-m1',
      role: 'assistant',
      status: 'done',
      createdAt: at(1),
      model: 'claude-opus-5-5',
      usage: { input: 18_204, output: 912, cost: 0.31 },
      parts: [
        {
          type: 'thinking',
          text: 'Start with the shape of the API, then show the pieces one kind at a time.',
        },
        { type: 'text', text: markdown },
      ],
    },
    attachmentsMessage,
    {
      id: 'k-m2',
      role: 'assistant',
      status: 'done',
      createdAt: at(5),
      parts: [
        {
          type: 'text',
          text: 'Mockup, notes and spec received. The recording was too large to attach. Here are the current screens and the alert sound:',
        },
        {
          type: 'media',
          items: [
            {
              kind: 'image',
              src: picture('Forecast card', '#3b63fb', '#7a5af8'),
              alt: 'The forecast card in light mode',
            },
            {
              kind: 'image',
              src: picture('Dark card', '#1d1d1d', '#3b63fb'),
              alt: 'The forecast card in dark mode',
            },
            {
              kind: 'image',
              src: picture('Phone', '#0a7a43', '#12b886', 360, 640),
              alt: 'The forecast card on a phone',
            },
            {
              kind: 'video',
              src: '',
              poster: picture('▶ Walkthrough', '#292929', '#717171'),
              alt: 'A walkthrough of the forecast page',
            },
            { kind: 'audio', src: tone(), alt: 'The storm alert sound' },
          ],
        },
      ],
    },
    { id: 'k-u3', role: 'user', text: 'Show me every tool you used.', createdAt: at(8) },
    {
      id: 'k-m3',
      role: 'assistant',
      status: 'done',
      createdAt: at(9),
      parts: [
        { type: 'text', text: 'Every tool from today’s run, in order:' },
        ...toolShapes.map((call) => ({ type: 'tool' as const, tool: call })),
      ],
    },
    {
      id: 'k-tool1',
      role: 'tool',
      createdAt: at(12),
      tool: tool(
        'k-t15',
        'bash',
        'You ran a command',
        'git log --oneline -3',
        'a1b2c3d fix: expire entries from the previous day\ne4f5a6b feat: retry upstream timeouts\n0c9d8e7 chore: update wrangler'
      ),
    },
  ];
}

function work(): Message[] {
  return [
    {
      id: 'k-m4',
      role: 'assistant',
      status: 'done',
      createdAt: at(14),
      parts: [
        { type: 'text', text: 'Here is where things stand.' },
        {
          type: 'card',
          card: {
            variant: 'pr',
            number: 58,
            title: 'Add retries for upstream timeouts',
            branch: 'fix/retry-upstream',
            checks: '4 of 4 checks passed',
            additions: 42,
            deletions: 7,
            files: 3,
            tone: 'positive',
          },
        },
        {
          type: 'card',
          card: {
            variant: 'tool',
            title: 'Visual regression suite',
            badge: 'bash',
            status: '2 snapshots changed',
            files: ['forecast-card.png', 'forecast-card-dark.png'],
            tone: 'notice',
          },
        },
        {
          type: 'card',
          card: {
            variant: 'light',
            title: 'Staging is healthy',
            detail: '/health answered in 2 ms',
            tone: 'informative',
          },
        },
        {
          type: 'plan',
          items: [
            'Merge the retry pull request',
            'Move the cache to KV',
            'Update the forecast docs to Celsius',
            'Tag 1.9.0',
          ],
        },
        {
          type: 'check',
          items: [
            { text: 'TTL fix merged' },
            { text: 'Retries reviewed', tone: 'informative' },
            { text: 'Docs pass running', tone: 'notice' },
            { text: 'KV migration not started', tone: 'negative' },
          ],
        },
        {
          type: 'diff',
          path: '/workspace/harbor/src/lib/units.ts',
          before:
            'export function toCelsius(f: number): number {\n  return ((f - 32) * 5) / 9;\n}\n',
          after:
            'export function toCelsius(f: number): number {\n  return Math.round(((f - 32) * 5) / 9);\n}\n',
        },
        {
          type: 'link',
          url: 'https://api.example.com/docs/v2/forecast',
          title: 'Forecast API reference',
          description: 'Parameters, units and rate limits for /v2/forecast.',
        },
        {
          type: 'delegation',
          kind: 'scoop',
          scoop: 'docs-pass',
          text: 'Started a scoop to update the docs',
        },
        {
          type: 'delegation',
          kind: 'feed',
          scoop: 'docs-pass',
          text: 'Handed over the new screenshots',
        },
        {
          type: 'delegation',
          kind: 'sprinkle',
          scoop: 'suggestions',
          text: 'Opened the suggestions sprinkle',
        },
        { type: 'delegation', kind: 'drop', scoop: 'amber-heron', text: 'Wrapped up amber-heron' },
      ],
    },
    {
      id: 'k-m5',
      role: 'assistant',
      status: 'done',
      createdAt: at(18),
      parts: [
        { type: 'text', text: 'Three decisions from earlier:' },
        {
          type: 'question',
          question: {
            id: 'k-q1',
            kind: 'yes-no',
            question: 'Tag 1.9.0 after the merge?',
            options: [],
            state: 'answered',
            answer: 'Yes',
          },
        },
        {
          type: 'question',
          question: {
            id: 'k-q2',
            kind: 'text',
            question: 'What should the release be called?',
            options: [],
            state: 'inert',
          },
        },
        {
          type: 'question',
          question: {
            id: 'k-q3',
            kind: 'choice',
            question: 'Where should the cache live?',
            options: ['Keep it in memory', 'Move it to KV', 'Decide after the load test'],
            state: 'open',
          },
        },
      ],
    },
  ];
}

function events(): Message[] {
  return [
    {
      id: 'k-s1',
      role: 'system',
      kind: 'compaction',
      title: 'Context compacted',
      text: '58 earlier messages were summarized.',
      trigger: 'threshold',
      state: 'summarized',
      createdAt: at(1440),
    },
    {
      id: 'k-s2',
      role: 'system',
      kind: 'compaction',
      title: 'Compaction fell back',
      text: 'The summary failed, so the oldest 20 messages were dropped instead.',
      trigger: 'overflow',
      state: 'fallback',
      createdAt: at(1441),
    },
    ...licks.map(
      ([channel, title, text, body, extra], index): Message =>
        ({
          id: `k-l${index + 1}`,
          role: 'lick',
          channel,
          title,
          text,
          createdAt: at(1445 + index),
          ...(body ? { body } : {}),
          ...extra,
        }) as Message
    ),
    {
      id: 'k-u4',
      role: 'user',
      text: 'Actually, stop the deploy, staging is frozen today.',
      mode: 'steer',
      createdAt: at(1470),
    },
    {
      id: 'k-m6',
      role: 'assistant',
      status: 'stopped',
      createdAt: at(1470),
      parts: [{ type: 'text', text: 'Stopping the staging deploy and leaving' }],
    },
    {
      id: 'k-u5',
      role: 'user',
      text: 'Update the forecast page to Celsius and use the new screenshots.',
      from: 'harbor',
      createdAt: at(1472),
    },
    {
      id: 'k-m7',
      role: 'assistant',
      status: 'error',
      createdAt: at(1475),
      parts: [
        {
          type: 'thinking',
          text: 'The model rejected the request because the context is too large.',
        },
        {
          type: 'error',
          message: 'The request is too large for this model.',
          detail: 'The model returned 413: the request is larger than its context window.',
          action: 'change-model',
        },
      ],
    },
    {
      id: 'k-s3',
      role: 'system',
      kind: 'error',
      title: 'docs-pass failed',
      text: 'The Adobe session expired. Log in again to continue.',
      action: 'login',
      createdAt: at(1476),
    },
    {
      id: 'k-s4',
      role: 'system',
      kind: 'error',
      title: 'Rate limited',
      text: 'Anthropic answered 429. Retrying in 30 seconds.',
      action: 'retry',
      createdAt: at(1477),
    },
    {
      id: 'k-s5',
      role: 'system',
      kind: 'notice',
      title: 'Model changed',
      text: 'This cone now uses Claude Opus 5.5.',
      createdAt: at(1478),
    },
  ];
}

export function showcase(): Message[] {
  return [...opening(), ...work(), ...events()];
}

export function showcaseQueue(): UserMessage[] {
  return [
    {
      id: 'k-q-1',
      role: 'user',
      text: 'Then open a pull request for the docs.',
      createdAt: at(1480),
      queued: true,
      mode: 'queue',
    },
    {
      id: 'k-q-2',
      role: 'user',
      text: 'And post the link in the release channel.',
      createdAt: at(1481),
      queued: true,
      mode: 'queue',
    },
  ];
}
