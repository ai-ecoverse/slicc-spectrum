import type { BrowserPort, FilePort } from '../model/types.ts';

export interface Effects {
  files: FilePort;
  browser: BrowserPort;
  agentId: string;
}

export type Step =
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

export function script(prompt: string): Step[] {
  const text = prompt.toLowerCase();
  if (/\btests?\b/.test(text)) return test();
  if (/\b(fix|edit|add|change)\b/.test(text)) return edit();
  if (/\b(open|browse|page|docs)\b/.test(text)) return browse();
  if (/\b(files?|read|show|project)\b/.test(text)) return files();
  return chat(prompt);
}
