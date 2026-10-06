import type { FrozenCone, Memory, Message, Sprinkle, TrayStatus } from '../model/types.ts';
import suggestions from './sprinkles/suggestions.shtml';
import welcome from './sprinkles/welcome.shtml';

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

export const sprinkles: Sprinkle[] = [
  {
    id: 'welcome',
    name: 'welcome',
    title: 'Welcome',
    icon: 'hand',
    agentId: 'cone-sliccy',
    html: welcome,
    inline: true,
  },
  {
    id: 'suggestions',
    name: 'suggestions',
    title: 'Suggestions',
    icon: 'ice-cream-cone',
    agentId: 'cone-sliccy',
    html: suggestions,
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
