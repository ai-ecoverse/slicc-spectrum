import './app/spectrum.ts';
import { SliccAgents } from './app/agents.ts';
import { SliccApp } from './app/app.ts';
import { SliccBrowser } from './app/browser.ts';
import { SliccChanges, SliccDiffPanel } from './app/changes.ts';
import { SliccChat } from './app/chat.ts';
import { SliccComposer } from './app/composer.ts';
import { SliccFiles, SliccFileView } from './app/files.ts';
import { SliccFreezer } from './app/freezer.ts';
import { SliccLucide } from './app/lucide.ts';
import { SliccMemory } from './app/memory.ts';
import { SliccMonitor } from './app/monitor.ts';
import { SliccSettings } from './app/settings.ts';
import { SliccSprinkle } from './app/sprinkle.ts';
import { SliccTerminals } from './app/terminals.ts';
import { SliccTray } from './app/tray.ts';
import { SliccUpdates } from './app/updates.ts';
import { defineCodeViews, SliccCodeView, SliccDiffView } from './components/code-view.ts';
import { defineDock, SliccDock } from './components/dock.ts';
import { defineFileTree, SliccFileTree } from './components/file-tree.ts';
import { define as defineTerminal } from './slicc-terminal.ts';

export type { Color } from './app/base.ts';
export { resolveColor } from './app/base.ts';
export type { GrammarKind } from './app/grammars.ts';
export { grammarBase, setGrammarBase } from './app/grammars.ts';
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
  SliccComposer,
  SliccDiffPanel,
  SliccDiffView,
  SliccDock,
  SliccFiles,
  SliccFileTree,
  SliccFileView,
  SliccUpdates,
};

const elements: Record<string, CustomElementConstructor> = {
  'slicc-agents': SliccAgents,
  'slicc-chat': SliccChat,
  'slicc-composer': SliccComposer,
  'slicc-files': SliccFiles,
  'slicc-file-view': SliccFileView,
  'slicc-changes': SliccChanges,
  'slicc-diff-panel': SliccDiffPanel,
  'slicc-terminals': SliccTerminals,
  'slicc-browser': SliccBrowser,
  'slicc-settings': SliccSettings,
  'slicc-memory': SliccMemory,
  'slicc-monitor': SliccMonitor,
  'slicc-freezer': SliccFreezer,
  'slicc-sprinkle': SliccSprinkle,
  'slicc-lucide': SliccLucide,
  'slicc-tray': SliccTray,
  'slicc-updates': SliccUpdates,
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
