import type { IDockviewPanel, PanelParams, SliccDock } from '../components/dock.ts';
import type { SliccModel, Sprinkle, TerminalInfo } from '../model/types.ts';
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
  cone?: string;
}

export const surfaces: Surface[] = [
  {
    id: 'agents',
    title: 'Agents',
    tag: 'slicc-agents',
    icon: 'swc-icon-user-group',
    side: 'left',
    open: ['tablet', 'desktop'],
    width: 240,
  },
  {
    id: 'chat',
    title: 'Chat',
    tag: 'slicc-chat',
    icon: 'swc-icon-chat',
    side: 'center',
    open: ['phone', 'tablet', 'desktop'],
  },
  {
    id: 'files',
    title: 'Files',
    tag: 'slicc-files',
    icon: 'swc-icon-folder',
    side: 'left',
    open: [],
    width: 260,
  },
  {
    id: 'changes',
    title: 'Changes',
    tag: 'slicc-changes',
    icon: 'swc-icon-compare',
    side: 'right',
    open: ['desktop'],
    width: 340,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    tag: 'slicc-terminal-panel',
    icon: 'swc-icon-code',
    side: 'right',
    open: [],
  },
  {
    id: 'browser',
    title: 'Browser',
    tag: 'slicc-browser',
    icon: 'swc-icon-globe-grid',
    side: 'right',
    open: [],
  },
  {
    id: 'memory',
    title: 'Memory',
    tag: 'slicc-memory',
    icon: 'swc-icon-lightbulb',
    side: 'left',
    open: [],
    width: 300,
  },
  {
    id: 'freezer',
    title: 'Freezer',
    tag: 'slicc-freezer',
    icon: 'swc-icon-history',
    side: 'left',
    open: [],
    width: 260,
  },
  {
    id: 'monitor',
    title: 'Monitor',
    tag: 'slicc-monitor',
    icon: 'swc-icon-data',
    side: 'right',
    open: [],
    width: 340,
  },
  {
    id: 'settings',
    title: 'Settings',
    tag: 'slicc-settings',
    icon: 'swc-icon-settings',
    side: 'center',
    open: [],
  },
  {
    id: 'updates',
    title: 'Install / Update',
    tag: 'slicc-updates',
    icon: 'swc-icon-refresh',
    side: 'center',
    open: [],
  },
  {
    id: 'network',
    title: 'Network',
    tag: 'slicc-network',
    icon: 'swc-icon-cloud',
    side: 'right',
    open: [],
    width: 340,
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
  return surface(terminalOf(id) === null ? id : 'terminal')?.side ?? 'center';
}

type Sider = (panel: IDockviewPanel) => Side;

const home: Sider = (panel) => sideOf(panel.id);

function first(dock: SliccDock, side: Side, sider: Sider, except?: string): string | undefined {
  return dock.api.panels.find((panel) => panel.id !== except && sider(panel) === side)?.id;
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

function place(
  dock: SliccDock,
  side: Side,
  screen: ScreenClass,
  sider: Sider,
  except?: string
): Placement {
  const anchor = (id: string | undefined, direction: Direction): Placement | null =>
    id ? { position: { referencePanel: id, direction } } : null;
  if (screen === 'phone') return anchor(dock.api.panels[0]?.id, 'within') ?? {};
  const same = anchor(first(dock, side, sider, except), 'within');
  if (same) return same;
  for (const [other, direction] of neighbours[side]) {
    const found = anchor(first(dock, other, sider, except), direction);
    if (found) return found;
  }
  return {};
}

export function placement(dock: SliccDock, side: Side, screen: ScreenClass): Placement {
  return place(dock, side, screen, home);
}

type GridNode = { type: 'leaf'; data: { views: string[] } } | { type: 'branch'; data: GridNode[] };

function views(node: GridNode): string[] {
  return node.type === 'leaf' ? node.data.views : node.data.flatMap(views);
}

export function destination(
  dock: SliccDock,
  id: string,
  side: Side,
  screen: ScreenClass
): Placement {
  const { grid } = dock.api.toJSON();
  const root = grid.root as GridNode;
  const columns =
    String(grid.orientation) === 'HORIZONTAL' && root.type === 'branch'
      ? root.data.map(views)
      : [views(root)];
  const holds = (test: (other: string) => boolean): number =>
    columns.findIndex((ids) => ids.some((other) => other !== id && test(other)));
  const chat = holds((other) => chatAgent(other) !== null);
  const middle = chat < 0 ? holds((other) => sideOf(other) === 'center') : chat;
  const current: Sider = (panel) => {
    if (middle < 0) return home(panel);
    const at = columns.findIndex((ids) => ids.includes(panel.id));
    return at < middle ? 'left' : at > middle ? 'right' : 'center';
  };
  return place(dock, side, screen, current, id);
}

export function openSurface(
  dock: SliccDock,
  item: Surface,
  screen: ScreenClass,
  focus = true
): void {
  if (dock.has(item.id)) return;
  const place = placement(dock, item.side, screen);
  const fresh = place.position?.direction !== 'within';
  dock.open({
    id: item.id,
    component: item.id,
    title: item.title,
    inactive: !focus,
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
  screen: ScreenClass,
  focus = true
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
      inactive: !focus,
      ...place,
    });
  }
  if (focus) dock.focusPanel(id);
  else dock.reveal(id);
  return id;
}

export function terminalPanel(terminal: string): string {
  return `terminal:${terminal}`;
}

export function terminalOf(id: string | null | undefined): string | null {
  return id?.startsWith('terminal:') ? id.slice(9) : null;
}

export function terminalPanels(dock: SliccDock): string[] {
  return dock.api.panels.map((panel) => panel.id).filter((id) => terminalOf(id) !== null);
}

export function terminalTitle(info: TerminalInfo): string {
  return `${info.title} · ${basename(info.cwd) || '/'}`;
}

export function openTerminal(dock: SliccDock, info: TerminalInfo, screen: ScreenClass): string {
  const id = terminalPanel(info.id);
  if (!dock.has(id)) {
    const sibling = terminalPanels(dock).at(-1);
    dock.open({
      id,
      component: 'terminal',
      title: terminalTitle(info),
      params: { terminal: info.id },
      inactive: true,
      ...(sibling
        ? { position: { referencePanel: sibling, direction: 'within' } }
        : placement(dock, 'right', screen)),
    });
  }
  return id;
}

function openChatSlot(
  dock: SliccDock,
  item: Surface,
  screen: ScreenClass,
  agent: { id: string; name: string } | null,
  agentless: boolean
): void {
  if (agent) openChat(dock, agent, screen, false);
  else if (agentless) openSurface(dock, item, screen, false);
}

export function defaultLayout(
  dock: SliccDock,
  screen: ScreenClass,
  agent: { id: string; name: string } | null,
  items: readonly Surface[] = surfaces,
  terminals: readonly TerminalInfo[] = [],
  agentless = false
): void {
  dock.clear();
  const order: Side[] = ['center', 'left', 'right'];
  for (const side of order) {
    for (const item of items) {
      if (item.side !== side || !item.open.includes(screen)) continue;
      if (item.id === 'terminal') for (const info of terminals) openTerminal(dock, info, screen);
      else if (item.id === 'chat') openChatSlot(dock, item, screen, agent, agentless);
      else openSurface(dock, item, screen);
    }
  }
  const chat = chats(dock)[0] ?? (dock.has('chat') ? 'chat' : null);
  if (chat) dock.api.getPanel(chat)?.api.setActive();
}

export function shown(dock: SliccDock, id: string): boolean {
  const ids = id === 'chat' ? chats(dock) : id === 'terminal' ? terminalPanels(dock) : [id];
  return ids.some((panel) => dock.api.getPanel(panel)?.api.isVisible === true);
}

export function sprinkleSurface(sprinkle: Sprinkle): Surface {
  return {
    id: `sprinkle:${sprinkle.id}`,
    title: sprinkle.title,
    tag: 'slicc-sprinkle',
    icon: sprinkle.icon,
    side: 'right',
    open: [],
    cone: sprinkle.agentId,
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
  place: Placement | null = null,
  focus = true
): string {
  const id = `sprinkle:${sprinkle.id}`;
  if (!dock.has(id)) {
    dock.open({
      id,
      component: 'sprinkle',
      title: sprinkle.title,
      params: { sprinkle: sprinkle.id },
      inactive: !focus,
      ...(place ?? placement(dock, 'right', screen)),
    });
  }
  if (focus) dock.focusPanel(id);
  else dock.reveal(id);
  return id;
}
