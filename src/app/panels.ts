import type { SliccDock } from '../components/dock.ts';
import type { SliccModel } from '../model/types.ts';
import type { ModelElement } from './base.ts';

export type Direction = 'left' | 'right' | 'above' | 'below' | 'within';

export interface Placement {
  position?: { referencePanel: string; direction: Direction };
  initialWidth?: number;
  initialHeight?: number;
}

export interface Surface {
  id: string;
  title: string;
  tag: string;
  place(dock: SliccDock): Placement;
}

function beside(dock: SliccDock, id: string, direction: Direction): Placement {
  return dock.has(id) ? { position: { referencePanel: id, direction } } : {};
}

export const surfaces: Surface[] = [
  {
    id: 'agents',
    title: 'Agents',
    tag: 'slicc-agents',
    place: (dock) => ({ ...beside(dock, 'chat', 'left'), initialWidth: 240 }),
  },
  {
    id: 'chat',
    title: 'Chat',
    tag: 'slicc-chat',
    place: (dock) => beside(dock, 'agents', 'right'),
  },
];

export function create(tag: string, model: SliccModel): HTMLElement {
  const element = document.createElement(tag) as ModelElement;
  element.model = model;
  return element;
}

export function openSurface(dock: SliccDock, surface: Surface): void {
  if (dock.has(surface.id)) return;
  dock.open({
    id: surface.id,
    component: surface.id,
    title: surface.title,
    ...surface.place(dock),
  });
}

export function defaultLayout(dock: SliccDock): void {
  dock.clear();
  for (const id of ['chat', 'agents']) {
    const surface = surfaces.find((candidate) => candidate.id === id) as Surface;
    openSurface(dock, surface);
  }
  dock.api.getPanel('chat')?.api.setActive();
}
