import './app/spectrum.ts';
import { SliccAgents } from './app/agents.ts';
import { SliccApp } from './app/app.ts';
import { SliccChat } from './app/chat.ts';
import { defineDock, SliccDock } from './components/dock.ts';

export type { Color } from './app/app.ts';
export { resolveColor } from './app/app.ts';
export type { Placement, Surface } from './app/panels.ts';
export { surfaces } from './app/panels.ts';
export type { PanelFactory, PanelParams } from './components/dock.ts';
export type { Listener, Subscribable } from './model/emitter.ts';
export { Emitter } from './model/emitter.ts';
export type * from './model/types.ts';
export { SliccAgents, SliccApp, SliccChat, SliccDock };

const elements: Record<string, CustomElementConstructor> = {
  'slicc-agents': SliccAgents,
  'slicc-chat': SliccChat,
  'slicc-app': SliccApp,
};

export function define(): void {
  defineDock();
  for (const [name, element] of Object.entries(elements)) {
    if (!customElements.get(name)) customElements.define(name, element);
  }
}

define();
