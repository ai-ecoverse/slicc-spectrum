import type { PanelParams, SliccDock } from '../components/dock.ts';
import type { SliccModel, Sprinkle } from '../model/types.ts';
import type { ModelElement } from './base.ts';
import { basename } from './files.ts';

export type Direction = 'left' | 'right' | 'above' | 'below' | 'within';
export type Side = 'left' | 'center' | 'right';
export type ScreenClass = 'phone' | 'tablet' | 'desktop';

export const screenClasses: readonly ScreenClass[] = ['phone', 'tablet', 'desktop'];

export interface Placement {
  position?: { referencePanel: string; direction: Direction };
  initialWidth?: number;
  initialHeight?: number;
}

export interface Surface {
  id: string;
  title: string;
  tag: string;
  icon: string;
  side: Side;
  open: readonly ScreenClass[];
  width?: number;
}

export const surfaces: Surface[] = [
  {
    id: 'agents',
    title: 'Agents',
    tag: 'slicc-agents',
    icon: 'sp-icon-user-group',
    side: 'left',
    open: ['tablet', 'desktop'],
    width: 240,
  },
  {
    id: 'chat',
    title: 'Chat',
    tag: 'slicc-chat',
    icon: 'sp-icon-chat',
    side: 'center',
    open: ['phone', 'tablet', 'desktop'],
  },
  {
    id: 'files',
    title: 'Files',
    tag: 'slicc-files',
    icon: 'sp-icon-folder',
    side: 'left',
    open: [],
    width: 260,
  },
  {
    id: 'changes',
    title: 'Changes',
    tag: 'slicc-changes',
    icon: 'sp-icon-compare',
    side: 'right',
    open: ['desktop'],
    width: 340,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    tag: 'slicc-terminals',
    icon: 'sp-icon-code',
    side: 'right',
    open: [],
  },
  {
    id: 'browser',
    title: 'Browser',
    tag: 'slicc-browser',
    icon: 'sp-icon-globe-grid',
    side: 'right',
    open: [],
  },
  {
    id: 'memory',
    title: 'Memory',
    tag: 'slicc-memory',
    icon: 'sp-icon-lightbulb',
    side: 'left',
    open: [],
    width: 300,
  },
  {
    id: 'freezer',
    title: 'Freezer',
    tag: 'slicc-freezer',
    icon: 'sp-icon-history',
    side: 'left',
    open: [],
    width: 260,
  },
  {
    id: 'monitor',
    title: 'Monitor',
    tag: 'slicc-monitor',
    icon: 'sp-icon-data',
    side: 'right',
    open: [],
    width: 340,
  },
  {
    id: 'settings',
    title: 'Settings',
    tag: 'slicc-settings',
    icon: 'sp-icon-settings',
    side: 'center',
    open: [],
  },
  {
    id: 'updates',
    title: 'Install / Update',
    tag: 'slicc-updates',
    icon: 'sp-icon-refresh',
    side: 'center',
    open: [],
  },
];

export type DocumentKind = 'file' | 'diff';

export const documents: Record<DocumentKind, { tag: string; title(path: string): string }> = {
  file: { tag: 'slicc-file-view', title: basename },
  diff: { tag: 'slicc-diff-panel', title: (path) => `${basename(path)} (diff)` },
};

export function screenClass(width: number): ScreenClass {
  if (width < 640) return 'phone';
  if (width < 1200) return 'tablet';
  return 'desktop';
}

export function surface(id: string, items: readonly Surface[] = surfaces): Surface | undefined {
  return items.find((candidate) => candidate.id === id);
}

export function create(tag: string, model: SliccModel, params: PanelParams = {}): HTMLElement {
  const element = document.createElement(tag) as ModelElement;
  element.model = model;
  Object.assign(element, params);
  return element;
}

function sideOf(id: string): Side {
  return surface(id)?.side ?? 'center';
}

function first(dock: SliccDock, side: Side): string | undefined {
  return dock.api.panels.find((panel) => sideOf(panel.id) === side)?.id;
}

const neighbours: Record<Side, Array<[Side, Direction]>> = {
  left: [
    ['center', 'left'],
    ['right', 'left'],
  ],
  center: [
    ['left', 'right'],
    ['right', 'left'],
  ],
  right: [
    ['center', 'right'],
    ['left', 'right'],
  ],
};

export function placement(dock: SliccDock, side: Side, screen: ScreenClass): Placement {
  const anchor = (id: string | undefined, direction: Direction): Placement | null =>
    id ? { position: { referencePanel: id, direction } } : null;
  if (screen === 'phone') return anchor(dock.api.panels[0]?.id, 'within') ?? {};
  const same = anchor(first(dock, side), 'within');
  if (same) return same;
  for (const [other, direction] of neighbours[side]) {
    const found = anchor(first(dock, other), direction);
    if (found) return found;
  }
  return {};
}

export function openSurface(dock: SliccDock, item: Surface, screen: ScreenClass): void {
  if (dock.has(item.id)) return;
  const place = placement(dock, item.side, screen);
  const fresh = place.position?.direction !== 'within';
  dock.open({
    id: item.id,
    component: item.id,
    title: item.title,
    ...place,
    ...(fresh && item.width && screen !== 'phone' ? { initialWidth: item.width } : {}),
  });
}

export function chatId(agentId: string): string {
  return `chat:${agentId}`;
}

export function chatAgent(id: string | null | undefined): string | null {
  return id?.startsWith('chat:') ? id.slice(5) : null;
}

export function chats(dock: SliccDock): string[] {
  return dock.api.panels.map((panel) => panel.id).filter((id) => chatAgent(id) !== null);
}

export function openChat(
  dock: SliccDock,
  agent: { id: string; name: string },
  screen: ScreenClass,
  focus = true,
  reveal = true
): string {
  const id = chatId(agent.id);
  if (!dock.has(id)) {
    const sibling = chats(dock)[0];
    const place: Placement = sibling
      ? { position: { referencePanel: sibling, direction: 'within' } }
      : placement(dock, 'center', screen);
    dock.open({
      id,
      component: 'chat',
      title: agent.name,
      params: { agent: agent.id },
      inactive: !focus,
      ...place,
    });
  }
  if (focus) dock.focusPanel(id);
  else if (reveal) dock.reveal(id);
  return id;
}

export function openDocument(
  dock: SliccDock,
  kind: DocumentKind,
  path: string,
  screen: ScreenClass
): string {
  const id = `${kind}:${path}`;
  if (!dock.has(id)) {
    const sibling = dock.api.panels.find((panel) => /^(file|diff):/.test(panel.id));
    const chat = chats(dock)[0];
    const place: Placement = sibling
      ? { position: { referencePanel: sibling.id, direction: 'within' } }
      : chat && screen !== 'phone'
        ? { position: { referencePanel: chat, direction: 'right' } }
        : placement(dock, 'center', screen);
    dock.open({
      id,
      component: kind,
      title: documents[kind].title(path),
      params: { path },
      ...place,
    });
  }
  dock.focusPanel(id);
  return id;
}

export function defaultLayout(
  dock: SliccDock,
  screen: ScreenClass,
  agent: { id: string; name: string } | null,
  items: readonly Surface[] = surfaces
): void {
  dock.clear();
  const order: Side[] = ['center', 'left', 'right'];
  for (const side of order) {
    for (const item of items) {
      if (item.side !== side || !item.open.includes(screen)) continue;
      if (item.id !== 'chat') openSurface(dock, item, screen);
      else if (agent) openChat(dock, agent, screen, false);
    }
  }
  const chat = chats(dock)[0];
  if (chat) dock.api.getPanel(chat)?.api.setActive();
}

export function closed(dock: SliccDock, items: readonly Surface[] = surfaces): Surface[] {
  return items.filter((item) =>
    item.id === 'chat' ? chats(dock).length === 0 : !dock.has(item.id)
  );
}

export function sprinkleSurface(sprinkle: Sprinkle): Surface {
  return {
    id: `sprinkle:${sprinkle.id}`,
    title: sprinkle.title,
    tag: 'slicc-sprinkle',
    icon: sprinkle.icon,
    side: 'right',
    open: [],
  };
}

const directions: Record<string, Direction> = {
  left: 'left',
  right: 'right',
  top: 'above',
  bottom: 'below',
  center: 'within',
};

export function dropPlacement(panel: string | null, position: string): Placement | null {
  return panel
    ? { position: { referencePanel: panel, direction: directions[position] ?? 'within' } }
    : null;
}

export function openSprinkle(
  dock: SliccDock,
  sprinkle: Sprinkle,
  screen: ScreenClass,
  place: Placement | null = null
): string {
  const id = `sprinkle:${sprinkle.id}`;
  if (!dock.has(id)) {
    dock.open({
      id,
      component: 'sprinkle',
      title: sprinkle.title,
      params: { sprinkle: sprinkle.id },
      ...(place ?? placement(dock, 'right', screen)),
    });
  }
  dock.focusPanel(id);
  return id;
}
