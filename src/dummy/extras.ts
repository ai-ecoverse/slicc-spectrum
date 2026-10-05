import type { FrozenCone, Memory, Message, Sprinkle, TrayStatus } from '../model/types.ts';

const day = 86_400_000;
const now = Date.UTC(2026, 9, 5, 9, 0);

function frozenConversation(topic: string, reply: string): Message[] {
  return [
    { id: `f-${topic}-1`, role: 'user', text: topic, createdAt: now - 3 * day },
    {
      id: `f-${topic}-2`,
      role: 'assistant',
      status: 'done',
      createdAt: now - 3 * day + 60_000,
      parts: [{ type: 'text', text: reply }],
    },
  ];
}

export const frozen: Array<{ cone: FrozenCone; messages: Message[] }> = [
  {
    cone: {
      id: 'cone-onboarding',
      name: 'onboarding',
      title: 'Write the onboarding guide for new contributors',
      model: 'claude-sonnet-5-5',
      messages: 42,
      frozenAt: now - 2 * day,
    },
    messages: frozenConversation(
      'Write the onboarding guide for new contributors',
      'The guide is in `/workspace/harbor/docs/onboarding.md`, with setup, tests and the release checklist.'
    ),
  },
  {
    cone: {
      id: 'cone-kv-spike',
      name: 'kv-spike',
      title: 'Spike: can the cache move to KV without a cold start?',
      model: 'claude-opus-5-5',
      messages: 118,
      frozenAt: now - 6 * day,
    },
    messages: frozenConversation(
      'Spike: can the cache move to KV without a cold start?',
      'Yes, with a 5-minute in-memory layer in front. Reads from KV add 12 ms at the 95th percentile.'
    ),
  },
  {
    cone: {
      id: 'cone-q3-report',
      name: 'q3-report',
      title: 'Summarize Q3 uptime and incidents',
      model: 'claude-haiku-4-5',
      messages: 17,
      frozenAt: now - 21 * day,
    },
    messages: frozenConversation(
      'Summarize Q3 uptime and incidents',
      'Uptime 99.96%. Two incidents: an expired certificate and an upstream outage.'
    ),
  },
];

export const memories: Memory[] = [
  {
    id: 'mem-1',
    scope: 'global',
    section: 'Preferences',
    title: 'Lead with the result',
    body: 'Keep replies short. Lead with the result, then the evidence.',
    tag: 'feedback',
    updatedAt: now - 5 * day,
  },
  {
    id: 'mem-2',
    scope: 'global',
    section: 'Preferences',
    title: 'Tests before “fixed”',
    body: 'Run the tests before saying something is fixed, and quote the summary line.',
    tag: 'feedback',
    updatedAt: now - 9 * day,
  },
  {
    id: 'mem-3',
    scope: 'global',
    section: 'About the user',
    title: 'Works in UTC',
    body: 'Schedules, timestamps and cron expressions are in UTC unless stated otherwise.',
    tag: 'user',
    updatedAt: now - 30 * day,
  },
  {
    id: 'mem-4',
    scope: 'global',
    section: 'Projects',
    title: 'harbor',
    body: 'Forecast API, deployed as a worker. Cache bugs show up around midnight UTC. Staging deploys are frozen on Fridays.',
    tag: 'project',
    updatedAt: now - day,
  },
  {
    id: 'mem-5',
    scope: 'global',
    section: 'Projects',
    title: 'release-notes',
    body: 'Drafted every Friday from merged pull requests, grouped as features, fixes and chores.',
    tag: 'project',
    updatedAt: now - 4 * day,
  },
  {
    id: 'mem-6',
    scope: 'cone-harbor',
    section: 'Conventions',
    title: 'Cache keys',
    body: 'Cache keys are `city:UTC-date`. Never key on local time.',
    tag: 'project',
    updatedAt: now - 2 * day,
  },
  {
    id: 'mem-7',
    scope: 'cone-harbor',
    section: 'Conventions',
    title: 'Retries',
    body: 'Retry upstream calls three times with exponential backoff starting at 250 ms.',
    tag: null,
    updatedAt: now - 2 * day,
  },
  {
    id: 'mem-8',
    scope: 'cone-release',
    section: 'Style',
    title: 'Past tense, no ticket numbers',
    body: 'One sentence per change, in the past tense, without ticket numbers.',
    tag: 'feedback',
    updatedAt: now - 7 * day,
  },
];

const sprinkleStyle = `
body { margin: 0; padding: 16px; font: 13px/1.45 var(--font, system-ui, sans-serif); color: var(--fg); background: var(--bg); }
h1 { font-size: 15px; margin: 0 0 12px; }
ul { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 6px; }
li { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; }
li .state { margin-left: auto; color: var(--muted); }
li.done .state { color: var(--positive); }
button { font: inherit; padding: 4px 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.actions { display: flex; gap: 8px; }
p.note { color: var(--muted); }
`;

const sprinkleScript = `
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-event]');
  if (!button) return;
  parent.postMessage({ type: 'sprinkle-event', event: button.dataset.event, detail: button.dataset.detail ?? null }, '*');
  const note = document.querySelector('.note');
  if (note) note.textContent = 'Sent “' + button.textContent.trim() + '” to the agent.';
});
`;

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${sprinkleStyle}</style></head><body>${body}<script>${sprinkleScript}</script></body></html>`;
}

export const sprinkles: Sprinkle[] = [
  {
    id: 'release-board',
    name: 'release-board',
    title: 'Release board',
    icon: 'sp-icon-checkmark-circle',
    agentId: 'cone-release',
    html: page(`<h1>harbor 1.9.0</h1>
<ul>
  <li class="done">Retry pull request merged <span class="state">done</span></li>
  <li class="done">Release notes drafted <span class="state">done</span></li>
  <li>Docs updated to Celsius <span class="state">in review</span></li>
  <li>Staging smoke test <span class="state">waiting</span></li>
</ul>
<div class="actions"><button class="primary" data-event="ship" data-detail="1.9.0">Ship 1.9.0</button><button data-event="hold">Hold</button></div>
<p class="note"></p>`),
  },
  {
    id: 'loose-ends',
    name: 'loose-ends',
    title: 'Loose ends',
    icon: 'sp-icon-filter',
    agentId: 'cone-sliccy',
    html: page(`<h1>Loose ends</h1>
<ul>
  <li>Reply to the vendor about Thursday <button data-event="done" data-detail="vendor">Done</button></li>
  <li>Renew the staging certificate <button data-event="done" data-detail="certificate">Done</button></li>
  <li>Move the cache to KV <button data-event="done" data-detail="kv">Done</button></li>
</ul>
<p class="note"></p>`),
  },
];

export const tray: TrayStatus = {
  name: 'sliccstart',
  kind: 'sliccstart',
  connection: 'live',
  role: 'leader',
  followers: [
    { id: 'f-phone', name: 'Phone', device: 'phone', since: now - 3_600_000 },
    { id: 'f-laptop', name: 'Second browser', device: 'browser', since: now - 600_000 },
  ],
  spent: 23.67,
  rate: 0.59,
  budget: { percent: 32, window: 'weekly', resets: 'resets in 4 days' },
  joinUrl: 'https://www.example.com/join/7Q4D-K9TX',
};
