import type { SliccDock } from '../components/dock.ts';
import type { SliccModel } from '../model/types.ts';
import type { ModelElement } from './base.ts';

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
];

export function screenClass(width: number): ScreenClass {
  if (width < 640) return 'phone';
  if (width < 1200) return 'tablet';
  return 'desktop';
}

export function surface(id: string): Surface | undefined {
  return surfaces.find((candidate) => candidate.id === id);
}

export function create(tag: string, model: SliccModel): HTMLElement {
  const element = document.createElement(tag) as ModelElement;
  element.model = model;
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

export function defaultLayout(dock: SliccDock, screen: ScreenClass): void {
  dock.clear();
  const order: Side[] = ['center', 'left', 'right'];
  for (const side of order) {
    for (const item of surfaces) {
      if (item.side === side && item.open.includes(screen)) openSurface(dock, item, screen);
    }
  }
  dock.api.getPanel('chat')?.api.setActive();
}

export function closed(dock: SliccDock): Surface[] {
  return surfaces.filter((item) => !dock.has(item.id));
}
