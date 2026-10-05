import './app/spectrum.ts';
import { SliccAgents } from './app/agents.ts';
import { SliccApp } from './app/app.ts';
import { SliccBrowser } from './app/browser.ts';
import { SliccChanges, SliccDiffPanel } from './app/changes.ts';
import { SliccChat } from './app/chat.ts';
import { SliccFiles, SliccFileView } from './app/files.ts';
import { SliccSettings } from './app/settings.ts';
import { SliccTerminals } from './app/terminals.ts';
import { defineCodeViews, SliccCodeView, SliccDiffView } from './components/code-view.ts';
import { defineDock, SliccDock } from './components/dock.ts';
import { defineFileTree, SliccFileTree } from './components/file-tree.ts';
import { define as defineTerminal } from './slicc-terminal.ts';

export type { Color } from './app/base.ts';
export { resolveColor } from './app/base.ts';
export type { Placement, Surface } from './app/panels.ts';
export { surfaces } from './app/panels.ts';
export type { CodeColor, DiffStyle } from './components/code-view.ts';
export type { PanelFactory, PanelParams } from './components/dock.ts';
export type { GitStatusEntry } from './components/file-tree.ts';
export type { Listener, Subscribable } from './model/emitter.ts';
export { Emitter } from './model/emitter.ts';
export type * from './model/types.ts';
export {
  SliccAgents,
  SliccApp,
  SliccBrowser,
  SliccChanges,
  SliccChat,
  SliccCodeView,
  SliccDiffPanel,
  SliccDiffView,
  SliccDock,
  SliccFiles,
  SliccFileTree,
  SliccFileView,
};

const elements: Record<string, CustomElementConstructor> = {
  'slicc-agents': SliccAgents,
  'slicc-chat': SliccChat,
  'slicc-files': SliccFiles,
  'slicc-file-view': SliccFileView,
  'slicc-changes': SliccChanges,
  'slicc-diff-panel': SliccDiffPanel,
  'slicc-terminals': SliccTerminals,
  'slicc-browser': SliccBrowser,
  'slicc-settings': SliccSettings,
  'slicc-app': SliccApp,
};

export function define(): void {
  defineDock();
  defineFileTree();
  defineCodeViews();
  defineTerminal();
  for (const [name, element] of Object.entries(elements)) {
    if (!customElements.get(name)) customElements.define(name, element);
  }
}

define();
