import './app/spectrum.ts';
import { SliccAgents } from './app/agents.ts';
import { SliccApp } from './app/app.ts';
import { SliccApprovals } from './app/approvals.ts';
import { SliccBrowser } from './app/browser.ts';
import { SliccChanges, SliccDiffPanel } from './app/changes.ts';
import { SliccChat } from './app/chat.ts';
import { SliccComposer } from './app/composer.ts';
import { SliccConfirm, SliccPrompt } from './app/confirm.ts';
import { SliccFiles, SliccFileView } from './app/files.ts';
import { SliccFollow } from './app/follow.ts';
import { SliccFreezer } from './app/freezer.ts';
import { SliccFreezerImport } from './app/freezer-import.ts';
import { SliccGuestInvite } from './app/guests.ts';
import { SliccLucide } from './app/lucide.ts';
import { SliccMemory } from './app/memory.ts';
import { SliccMonitor } from './app/monitor.ts';
import { SliccNetwork } from './app/network.ts';
import { SliccNotices } from './app/notices.ts';
import { SliccSecrets } from './app/secrets.ts';
import { SliccSettings } from './app/settings.ts';
import { SliccSprinkle } from './app/sprinkle.ts';
import { SliccTerminalPanel } from './app/terminals.ts';
import { SliccToolRuns } from './app/tool-runs.ts';
import { SliccTray } from './app/tray.ts';
import { SliccUpdates } from './app/updates.ts';
import { SliccValueRequest } from './app/value-request.ts';
import { SliccVaultButton } from './app/vault.ts';
import { defineCodeViews, SliccCodeView, SliccDiffView } from './components/code-view.ts';
import { defineDock, SliccDock } from './components/dock.ts';
import { defineFileTree, SliccFileTree } from './components/file-tree.ts';
import { define as defineTerminal } from './slicc-terminal.ts';

export type { SecretRulesVerdict } from './app/approvals.ts';
export { secretRules } from './app/approvals.ts';
export type { Color } from './app/base.ts';
export { resolveColor } from './app/base.ts';
export type { ConfirmOptions, ConfirmVariant, PromptOptions } from './app/confirm.ts';
export { confirm, prompt } from './app/confirm.ts';
export type { ImportOutcome, ImportStage } from './app/freezer-import.ts';
export type { GrammarKind } from './app/grammars.ts';
export { grammarBase, setGrammarBase } from './app/grammars.ts';
export type {
  PanelCaller,
  PanelInfo,
  PanelKind,
  PanelOpenOptions,
  PanelOutput,
  PanelPlace,
  PanelResult,
  PanelsHost,
} from './app/panel-command.ts';
export { Panels, panelCommand } from './app/panel-command.ts';
export type { Placement, Surface } from './app/panels.ts';
export { surfaces } from './app/panels.ts';
export type { CodeColor, DiffStyle } from './components/code-view.ts';
export type { PanelFactory, PanelParams } from './components/dock.ts';
export type { GitStatusEntry } from './components/file-tree.ts';
export type { Listener, Subscribable } from './model/emitter.ts';
export { Emitter } from './model/emitter.ts';
export type * from './model/types.ts';
export { isVaultFailure } from './model/values.ts';
export {
  SliccAgents,
  SliccApp,
  SliccApprovals,
  SliccBrowser,
  SliccChanges,
  SliccChat,
  SliccCodeView,
  SliccComposer,
  SliccConfirm,
  SliccDiffPanel,
  SliccDiffView,
  SliccDock,
  SliccFiles,
  SliccFileTree,
  SliccFileView,
  SliccFollow,
  SliccFreezerImport,
  SliccGuestInvite,
  SliccNetwork,
  SliccNotices,
  SliccPrompt,
  SliccSecrets,
  SliccUpdates,
  SliccValueRequest,
  SliccVaultButton,
};

const elements: Record<string, CustomElementConstructor> = {
  'slicc-agents': SliccAgents,
  'slicc-chat': SliccChat,
  'slicc-tool-runs': SliccToolRuns,
  'slicc-composer': SliccComposer,
  'slicc-files': SliccFiles,
  'slicc-file-view': SliccFileView,
  'slicc-changes': SliccChanges,
  'slicc-diff-panel': SliccDiffPanel,
  'slicc-terminal-panel': SliccTerminalPanel,
  'slicc-browser': SliccBrowser,
  'slicc-settings': SliccSettings,
  'slicc-memory': SliccMemory,
  'slicc-monitor': SliccMonitor,
  'slicc-freezer': SliccFreezer,
  'slicc-freezer-import': SliccFreezerImport,
  'slicc-sprinkle': SliccSprinkle,
  'slicc-lucide': SliccLucide,
  'slicc-tray': SliccTray,
  'slicc-follow': SliccFollow,
  'slicc-updates': SliccUpdates,
  'slicc-network': SliccNetwork,
  'slicc-notices': SliccNotices,
  'slicc-approvals': SliccApprovals,
  'slicc-secrets': SliccSecrets,
  'slicc-vault-button': SliccVaultButton,
  'slicc-value-request': SliccValueRequest,
  'slicc-confirm': SliccConfirm,
  'slicc-prompt': SliccPrompt,
  'slicc-guest-invite': SliccGuestInvite,
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
