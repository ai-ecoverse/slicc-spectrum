import { Emitter } from '../model/emitter.ts';
import type { BrowserAction, BrowserEvents, BrowserPort, BrowserTab } from '../model/types.ts';
import type { Clock } from './clock.ts';

function escape(text: string): string {
  return text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function hue(text: string): number {
  let sum = 0;
  for (const char of text) sum = (sum * 31 + char.charCodeAt(0)) % 360;
  return sum;
}

export type BrowserScenario = 'idle' | 'driving' | 'off';

export type ActionDraft = Omit<BrowserAction, 'id' | 'at' | 'status'> &
  Partial<Pick<BrowserAction, 'status' | 'at'>>;

export function page(tab: BrowserTab, mark?: number): string {
  const h = hue(new URL(tab.url).host);
  const rows = [0, 1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<rect x="64" y="${220 + i * 36}" width="${560 - (i % 3) * 90}" height="12" rx="6" fill="#d6d6d6"/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#ffffff"/><rect width="1280" height="64" fill="hsl(${h} 45% 32%)"/><text x="64" y="40" font-family="sans-serif" font-size="20" fill="#ffffff">${escape(new URL(tab.url).host)}</text><text x="64" y="160" font-family="sans-serif" font-size="36" fill="#222222">${escape(tab.title)}</text>${rows}<rect x="720" y="200" width="496" height="280" rx="12" fill="hsl(${h} 40% 92%)"/>${mark === undefined ? '' : `<rect x="56" y="${212 + (mark % 6) * 36}" width="${576 - (mark % 3) * 90}" height="28" rx="8" fill="none" stroke="hsl(${h} 70% 45%)" stroke-width="4"/>`}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function titleFor(url: string): string {
  const { host, pathname } = new URL(url);
  if (!host) return 'New tab';
  return pathname === '/' ? host : `${host}${pathname}`;
}

const second = 1000;

export function browserHistory(scenario: BrowserScenario, now = Date.now()): ActionDraft[] {
  if (scenario === 'off') return [];
  const harbor = { tabId: 'tab-preview', agentId: 'cone-harbor' };
  const otter = { tabId: 'tab-pull', agentId: 'scoop-otter' };
  return [
    {
      ...otter,
      kind: 'goto',
      value: 'https://git.example.com/example/harbor/pull/58',
      at: now - 300 * second,
    },
    { ...otter, kind: 'snapshot', at: now - 296 * second },
    { ...otter, kind: 'scroll', at: now - 290 * second },
    { ...otter, kind: 'screenshot', at: now - 288 * second },
    { ...harbor, kind: 'open', value: 'http://localhost:8787/', at: now - 120 * second },
    { ...harbor, kind: 'snapshot', at: now - 116 * second },
    { ...harbor, kind: 'type', target: 'textbox "City"', length: 6, at: now - 110 * second },
    { ...harbor, kind: 'click', target: 'button "Show forecast"', at: now - 106 * second },
    { ...harbor, kind: 'snapshot', at: now - 100 * second },
    {
      ...harbor,
      kind: 'click',
      target: 'link "Tomorrow"',
      status: 'failed',
      error: 'No element matches link "Tomorrow".',
      at: now - 92 * second,
    },
    {
      tabId: null,
      agentId: 'cone-harbor',
      kind: 'request',
      value: 'GET https://api.example.com/v2/tides',
      at: now - 80 * second,
    },
    { ...harbor, kind: 'eval', at: now - 70 * second },
    { ...harbor, kind: 'press', value: 'End', at: now - 64 * second },
  ];
}

export const drive: readonly ActionDraft[] = [
  { tabId: 'tab-preview', agentId: 'cone-harbor', kind: 'scroll' },
  { tabId: 'tab-preview', agentId: 'cone-harbor', kind: 'screenshot' },
  { tabId: 'tab-preview', agentId: 'cone-harbor', kind: 'click', target: 'button "Compare ports"' },
];

export class DummyBrowser extends Emitter<BrowserEvents> implements BrowserPort {
  #tabs: BrowserTab[];
  #active: string | null;
  #clock: Clock;
  #next = 1;
  #actions: BrowserAction[] = [];
  #marks = 0;

  constructor(
    tabs: readonly BrowserTab[],
    clock: Clock,
    {
      history = [],
      controlled = [],
    }: { history?: readonly ActionDraft[]; controlled?: readonly string[] } = {}
  ) {
    super();
    this.#clock = clock;
    this.#tabs = tabs.map((tab) => ({
      ...tab,
      ...(controlled.includes(tab.id) ? { controlled: true } : {}),
    }));
    this.#active = this.#tabs[0]?.id ?? null;
    for (const draft of history) this.#push(draft);
  }

  list(): readonly BrowserTab[] {
    return this.#tabs.map((tab) => ({ ...tab }));
  }

  active(): string | null {
    return this.#active;
  }

  actions(tabId?: string): readonly BrowserAction[] {
    return this.#actions
      .filter((action) => tabId === undefined || action.tabId === tabId)
      .slice(-50)
      .map((action) => ({ ...action }));
  }

  #push(draft: ActionDraft): BrowserAction {
    const action: BrowserAction = {
      status: 'done',
      ...draft,
      id: `action-${this.#actions.length + 1}`,
      at: draft.at ?? Date.now(),
    };
    this.#actions.push(action);
    return action;
  }

  record(draft: ActionDraft): string {
    const action = this.#push({ status: 'running', ...draft });
    const tab = this.#tabs.find((candidate) => candidate.id === action.tabId);
    if (tab) {
      tab.agentId = action.agentId;
      if (action.agentId) tab.controlled = true;
      this.emit('tabs', this.list());
    }
    this.emit('action', { ...action });
    return action.id;
  }

  finish(id: string, error?: string): void {
    const action = this.#actions.find((candidate) => candidate.id === id);
    if (action?.status !== 'running') return;
    action.status = error ? 'failed' : 'done';
    if (error) action.error = error;
    this.emit('action', { ...action });
  }

  async run(script: readonly ActionDraft[]): Promise<void> {
    for (const [index, draft] of script.entries()) {
      const id = this.record(draft);
      if (index === script.length - 1) return;
      await this.#clock.sleep(20);
      this.finish(id);
      await this.#clock.sleep(10);
    }
  }

  release(agentId: string): void {
    let changed = false;
    for (const tab of this.#tabs) {
      if (tab.agentId !== agentId || !tab.controlled) continue;
      tab.controlled = false;
      changed = true;
    }
    for (const action of this.#actions)
      if (action.agentId === agentId && action.status === 'running')
        this.finish(action.id, 'Stopped');
    if (changed) this.emit('tabs', this.list());
  }

  watch(tabId: string): () => void {
    const tab = () => this.#tabs.find((candidate) => candidate.id === tabId);
    if (!tab()?.controlled) return () => {};
    const send = () => {
      const now = tab();
      if (!now?.controlled) return;
      this.emit('frame', { tabId, src: page(now, this.#marks++), at: Date.now() });
    };
    const timer = setInterval(send, 500);
    void this.#clock.sleep(0).then(send);
    return () => clearInterval(timer);
  }

  #changed(): void {
    this.emit('tabs', this.list());
    this.emit('active', this.#active);
  }

  activate(id: string): void {
    if (!this.#tabs.some((tab) => tab.id === id)) return;
    this.#active = id;
    this.emit('active', id);
  }

  #load(id: string, action?: string): void {
    void this.#clock.sleep(15).then(() => {
      if (action) this.finish(action);
      const tab = this.#tabs.find((candidate) => candidate.id === id);
      if (!tab) return;
      tab.status = 'complete';
      tab.title = titleFor(tab.url);
      this.#changed();
    });
  }

  open(url: string, agentId: string | null = null): BrowserTab {
    const tab: BrowserTab = {
      id: `tab-new-${this.#next++}`,
      title: url,
      url,
      status: 'loading',
      agentId,
    };
    this.#tabs.push(tab);
    this.#active = tab.id;
    const action = agentId
      ? this.#push({ tabId: tab.id, agentId, kind: 'open', value: url, status: 'running' })
      : undefined;
    this.#changed();
    if (action) this.emit('action', { ...action });
    this.#load(tab.id, action?.id);
    return { ...tab };
  }

  navigate(id: string, url: string): void {
    const tab = this.#tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    tab.url = url;
    tab.title = url;
    tab.status = 'loading';
    this.#changed();
    this.#load(id);
  }

  close(id: string): void {
    const index = this.#tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    this.#tabs.splice(index, 1);
    if (this.#active === id)
      this.#active = this.#tabs[Math.min(index, this.#tabs.length - 1)]?.id ?? null;
    this.#changed();
  }

  async screenshot(id: string): Promise<string> {
    await this.#clock.sleep(2);
    const tab = this.#tabs.find((candidate) => candidate.id === id);
    if (!tab) throw new Error(`No tab ${id}`);
    return page(tab);
  }
}
