import type { Attachment, BrowserPort, FilePort, MessagePart } from '../model/types.ts';

export interface Effects {
  files: FilePort;
  browser: BrowserPort;
  agentId: string;
}

export type Step =
  | { type: 'part'; part: MessagePart }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | {
      type: 'tool';
      name: string;
      title: string;
      input: string;
      output: string;
      paths: string[];
      ticks: number;
      effect?: (effects: Effects) => Promise<unknown> | unknown;
    };

const units = '/workspace/harbor/src/lib/units.ts';
const kelvin = `
export function toKelvin(celsius: number): number {
  return Math.round((celsius + 273.15) * 100) / 100;
}
`;

function filtered(): Step[] {
  return [
    {
      type: 'part',
      part: {
        type: 'error',
        message: "The model's content filter stopped this reply.",
        detail: 'Provider stopped with: content_filtered',
        action: 'drop-turn',
      },
    },
  ];
}

function test(): Step[] {
  return [
    { type: 'thinking', text: 'Run the whole suite first, then look at anything that fails.' },
    {
      type: 'tool',
      name: 'bash',
      title: 'Run the tests',
      input: 'npm test',
      output:
        '> harbor@0.0.0 test\n> node --test test/\n\n✔ converts both ways (0.6ms)\n✔ expires entries from the previous day (0.4ms)\n✔ retries upstream timeouts (3.1ms)\nℹ tests 3\nℹ pass 3\nℹ fail 0',
      paths: [],
      ticks: 40,
    },
    {
      type: 'text',
      text: 'All **3 tests pass**, including the new one for the midnight rollover. Nothing else to fix.',
    },
  ];
}

function edit(): Step[] {
  return [
    {
      type: 'thinking',
      text: 'The conversion helpers live in units.ts. Add the missing one next to them.',
    },
    {
      type: 'tool',
      name: 'read_file',
      title: 'Read the unit helpers',
      input: units,
      output:
        'export function toCelsius(fahrenheit: number): number { … }\nexport function toFahrenheit(celsius: number): number { … }',
      paths: [units],
      ticks: 10,
    },
    {
      type: 'tool',
      name: 'edit_file',
      title: 'Add toKelvin()',
      input: units,
      output: 'Appended 4 lines',
      paths: [units],
      ticks: 20,
      effect: async ({ files, agentId }) => {
        const before = await files.read(units);
        await files.write(units, before + kelvin, agentId);
      },
    },
    {
      type: 'part',
      part: {
        type: 'diff',
        path: units,
        before:
          'export function toFahrenheit(celsius: number): number {\n  return Math.round((celsius * 9) / 5 + 32);\n}\n',
        after: `export function toFahrenheit(celsius: number): number {\n  return Math.round((celsius * 9) / 5 + 32);\n}\n${kelvin}`,
      },
    },
    {
      type: 'text',
      text: 'Added `toKelvin()` to `src/lib/units.ts`. It rounds to two decimals, like the API’s other values. The change is in **Changes**, ready for review.',
    },
  ];
}

function browse(): Step[] {
  const url = 'https://api.example.com/docs/v2/units';
  return [
    {
      type: 'tool',
      name: 'browser',
      title: 'Open the units reference',
      input: `navigate ${url}`,
      output: 'Loaded api.example.com/docs/v2/units (200, 412 ms)',
      paths: [],
      ticks: 25,
      effect: ({ browser, agentId }) => browser.open(url, agentId),
    },
    {
      type: 'text',
      text: 'The reference page is open in the **Browser** panel. Temperatures are documented in Celsius, with Fahrenheit behind `?units=imperial`.',
    },
  ];
}

function files(): Step[] {
  return [
    {
      type: 'tool',
      name: 'bash',
      title: 'List the project',
      input: 'ls /workspace/harbor/src',
      output: 'index.ts  legacy  lib  routes',
      paths: ['/workspace/harbor/src'],
      ticks: 8,
    },
    {
      type: 'tool',
      name: 'read_file',
      title: 'Read the README',
      input: '/workspace/harbor/README.md',
      output:
        '# harbor\n\nA small forecast API that sits in front of the upstream weather service and caches per city.',
      paths: ['/workspace/harbor/README.md'],
      ticks: 8,
    },
    {
      type: 'text',
      text: 'harbor has four parts:\n\n- `index.ts`: the worker entry and routing\n- `routes/forecast.ts`: the forecast handler\n- `lib/`: cache, retry and unit helpers\n- `legacy/`: the XML output, marked for removal',
    },
  ];
}

function search(): Step[] {
  return [
    {
      type: 'tool',
      name: 'grep',
      title: 'Search for the cache TTL',
      input: 'ttl /workspace/harbor/src',
      output:
        'src/lib/cache.ts:4:  const ttl = 60 * 60;\nsrc/routes/forecast.ts:12:  cache.put(key, body, { ttl });',
      paths: ['/workspace/harbor/src/lib/cache.ts', '/workspace/harbor/src/routes/forecast.ts'],
      ticks: 20,
    },
    {
      type: 'text',
      text: 'The TTL is set once, in `src/lib/cache.ts`, to an hour. `routes/forecast.ts` passes it through unchanged.',
    },
  ];
}

function probe(title: string, input: string, output: string, paths: string[] = []): Step {
  return { type: 'tool', name: 'bash', title, input, output, paths, ticks: 12 };
}

function investigate(): Step[] {
  return [
    { type: 'thinking', text: 'Celsius requests return Fahrenheit. Follow one request through.' },
    probe(
      'Read the error log',
      'tail -n 3 /workspace/harbor/logs/worker.log',
      'GET /forecast?city=Porto&unit=C 200 (cache hit)',
      ['/workspace/harbor/logs/worker.log']
    ),
    probe(
      'Ask the API for Porto',
      'curl -s https://api.example.com/v2/forecast?city=Porto&unit=C',
      '{ "city": "Porto", "high": 70, "unit": "F" }'
    ),
    probe(
      'Find the cache key',
      'rg -n "cacheKey" src',
      'src/lib/cache.ts:9:  const cacheKey = city;'
    ),
    probe('Read the cache', 'cat /workspace/harbor/src/lib/cache.ts', 'const cacheKey = city;', [
      '/workspace/harbor/src/lib/cache.ts',
    ]),
    probe('Check the working tree', 'git status --short', ' M src/lib/cache.ts'),
    probe('Clear the preview cache', 'wrangler kv key delete Porto --env preview', 'Deleted 1 key'),
    probe(
      'Ask the API again',
      'curl -s https://api.example.com/v2/forecast?city=Porto&unit=C',
      '{ "city": "Porto", "high": 21, "unit": "C" }'
    ),
    {
      type: 'text',
      text: 'The cache key is only the city, so a Fahrenheit answer is served to Celsius requests. The key needs the unit too.',
    },
  ];
}

const labels: Record<string, string> = {
  'Read the error log': 'Find why Celsius requests get Fahrenheit',
  'Search for the cache expiry': 'Find and fix the stale cache entry',
  'Count the routes': 'Walk through every kind of tool',
  'Ask the API for Lisbon': 'Compare the docs with the live API',
  'Switch the page to Celsius': 'Move the forecast docs to Celsius, then build and test the site',
};

export function label(title: string): string | null {
  return labels[title] ?? null;
}

function chat(prompt: string): Step[] {
  return [
    { type: 'thinking', text: 'Short question. Answer directly, then offer the next step.' },
    {
      type: 'tool',
      name: 'bash',
      title: 'Check the working tree',
      input: 'git status --short',
      output:
        ' M src/lib/cache.ts\n M src/routes/forecast.ts\n A src/lib/retry.ts\n D src/legacy/xml.ts',
      paths: [],
      ticks: 12,
    },
    {
      type: 'text',
      text: `On “${prompt.slice(0, 60)}”: there are **4 uncommitted changes** in harbor, from me and quiet-otter. Review them in Changes, or ask me to run the tests, edit a file or open a page.`,
    },
  ];
}

function ask(): Step[] {
  return [
    { type: 'thinking', text: 'Two ways to do this. Ask before picking one.' },
    {
      type: 'part',
      part: {
        type: 'question',
        question: {
          id: `q-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'choice',
          question: 'Where should the cache live once the TTL fix ships?',
          options: ['Keep it in memory', 'Move it to KV', 'Decide after the load test'],
          state: 'open',
        },
      },
    },
  ];
}

function look(attachments: readonly Attachment[]): Step[] {
  const names = attachments.map((attachment) => attachment.name).join(', ');
  const images = attachments.filter((attachment) => attachment.kind === 'image').length;
  return [
    {
      type: 'tool',
      name: 'read_file',
      title: `Read ${attachments.length === 1 ? 'the attachment' : `${attachments.length} attachments`}`,
      input: names,
      output: attachments
        .map(
          (attachment) => `${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`
        )
        .join('\n'),
      paths: [],
      ticks: 10,
    },
    {
      type: 'text',
      text: `Got **${names}**${images ? `, including ${images === 1 ? 'an image' : `${images} images`}` : ''}. I’ll keep ${attachments.length === 1 ? 'it' : 'them'} in mind for the next step.`,
    },
  ];
}

const suggestions: Array<[RegExp, string]> = [
  [/\b(debug|investigate)\b/, 'Add the unit to the cache key'],
  [/\btests?\b/, 'Open a pull request with the fix'],
  [/\b(fix|edit|add|change)\b/, 'Run the tests'],
  [/\b(open|browse|page|docs)\b/, 'Summarize the page'],
  [/\b(files?|read|show|project)\b/, 'Add a Kelvin helper to units.ts'],
];

export function script(
  prompt: string,
  attachments: readonly Attachment[] = []
): { steps: Step[]; suggestion: string } {
  const text = prompt.toLowerCase();
  const suggestion = suggestions.find(([pattern]) => pattern.test(text))?.[1] ?? 'Run the tests';
  if (attachments.length > 0) return { steps: look(attachments), suggestion };
  if (/\bforbidden\b/.test(text)) return { steps: filtered(), suggestion };
  if (/\b(ask|choose|decide)\b/.test(text)) return { steps: ask(), suggestion };
  if (/\b(debug|investigate)\b/.test(text)) return { steps: investigate(), suggestion };
  if (/\b(search|grep)\b/.test(text)) return { steps: search(), suggestion };
  if (/\btests?\b/.test(text)) return { steps: test(), suggestion };
  if (/\b(fix|edit|add|change)\b/.test(text)) return { steps: edit(), suggestion };
  if (/\b(open|browse|page|docs)\b/.test(text)) return { steps: browse(), suggestion };
  if (/\b(files?|read|show|project)\b/.test(text)) return { steps: files(), suggestion };
  return { steps: chat(prompt), suggestion };
}
