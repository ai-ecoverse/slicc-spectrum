import { Emitter } from '../model/emitter.ts';
import type { BrowserEvents, BrowserPort, BrowserTab } from '../model/types.ts';
import type { Clock } from './clock.ts';

function escape(text: string): string {
  return text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function hue(text: string): number {
  let sum = 0;
  for (const char of text) sum = (sum * 31 + char.charCodeAt(0)) % 360;
  return sum;
}

export function page(tab: BrowserTab): string {
  const h = hue(new URL(tab.url).host);
  const rows = [0, 1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<rect x="64" y="${220 + i * 36}" width="${560 - (i % 3) * 90}" height="12" rx="6" fill="#d6d6d6"/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#ffffff"/><rect width="1280" height="64" fill="hsl(${h} 45% 32%)"/><text x="64" y="40" font-family="sans-serif" font-size="20" fill="#ffffff">${escape(new URL(tab.url).host)}</text><text x="64" y="160" font-family="sans-serif" font-size="36" fill="#222222">${escape(tab.title)}</text>${rows}<rect x="720" y="200" width="496" height="280" rx="12" fill="hsl(${h} 40% 92%)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function titleFor(url: string): string {
  const { host, pathname } = new URL(url);
  return pathname === '/' ? host : `${host}${pathname}`;
}

export class DummyBrowser extends Emitter<BrowserEvents> implements BrowserPort {
  #tabs: BrowserTab[];
  #active: string | null;
  #clock: Clock;
  #next = 1;

  constructor(tabs: readonly BrowserTab[], clock: Clock) {
    super();
    this.#clock = clock;
    this.#tabs = tabs.map((tab) => ({ ...tab }));
    this.#active = this.#tabs[0]?.id ?? null;
  }

  list(): readonly BrowserTab[] {
    return this.#tabs.map((tab) => ({ ...tab }));
  }

  active(): string | null {
    return this.#active;
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

  #load(id: string): void {
    void this.#clock.sleep(15).then(() => {
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
    this.#changed();
    this.#load(tab.id);
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
