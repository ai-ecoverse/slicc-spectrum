import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/progress-bar/swc-progress-bar.js';
import '@adobe/spectrum-wc/components/progress-circle/swc-progress-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-diamond.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-checkmark-circle.js';
import '@adobe/spectrum-wc-icons/swc-icon-copy.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import type {
  Account,
  AgentPort,
  ProfileImportPreview,
  ProfileImportProgress,
  ProfileImportResult,
} from '../model/types.ts';
import { dialogStyles, focused, themeOf } from './confirm.ts';
import { chevron, disclosureStyles } from './disclosure.ts';
import { failure } from './files.ts';
import { day, size } from './messages.ts';

export type ImportStage = 'checking' | 'preview' | 'importing' | 'done' | 'failed';

export type ImportOutcome = ProfileImportResult | 'retry' | null;

export const flaggedShown = 3;

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function providerNames(ids: readonly string[], accounts: readonly Account[]): string {
  return ids.map((id) => accounts.find((account) => account.id === id)?.provider ?? id).join(', ');
}

export function flaggedLead(paths: readonly string[]): string {
  return paths.length === 1
    ? '1 file looks like credentials. It is imported; review it afterwards'
    : `${paths.length} files look like credentials. They are imported; review them afterwards`;
}

export function summary(preview: ProfileImportPreview): Array<readonly [string, string]> {
  return [
    ['Cones', String(preview.cones)],
    ['Scoops', String(preview.scoops)],
    ['Frozen', String(preview.frozen)],
    ['Skills', String(preview.skills.length)],
    ['Crons', String(preview.crons)],
    ['Webhooks', String(preview.webhooks)],
    ['Size', size(preview.bytes)],
  ];
}

export class SliccFreezerImport extends LitElement {
  static properties = {
    stage: { reflect: true },
    preview: { attribute: false },
    outcome: { attribute: false },
    progress: { attribute: false },
    error: {},
    announce: {},
    copied: {},
  };
  declare stage: ImportStage;
  declare preview: ProfileImportPreview | null;
  declare outcome: ProfileImportResult | null;
  declare progress: ProfileImportProgress | null;
  declare error: string;
  declare announce: string;
  declare copied: '' | 'done' | 'failed';
  agent: AgentPort | null = null;
  accounts: readonly Account[] = [];
  file: Blob | null = null;
  trigger: HTMLElement | null = null;
  allowed: () => boolean = () => true;
  readonly #result = Promise.withResolvers<ImportOutcome>();
  #run = 0;
  #settled: ImportOutcome = null;
  #halted = false;
  #off: (() => void) | null = null;

  constructor() {
    super();
    this.stage = 'checking';
    this.preview = null;
    this.outcome = null;
    this.progress = null;
    this.error = '';
    this.announce = '';
    this.copied = '';
  }

  static styles = [
    dialogStyles,
    disclosureStyles,
    css`
      .content {
        inline-size: calc(var(--mod-alert-dialog-max-width) - 2 * var(--mod-alert-dialog-padding));
        box-sizing: border-box;
        display: grid;
        gap: var(--swc-spacing-300);
        padding: var(--swc-spacing-75);
        overflow-wrap: anywhere;
      }
      .checking {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-200);
      }
      dl {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-200) var(--swc-spacing-400);
        margin: 0;
      }
      dl div {
        display: grid;
        gap: var(--swc-spacing-50);
      }
      dt {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      dd {
        margin: 0;
        font-weight: var(--swc-bold-font-weight);
        font-variant-numeric: tabular-nums;
      }
      .notes {
        display: grid;
        gap: var(--swc-spacing-100);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
      }
      .note > .icon {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      .note[data-note='providers'] .icon {
        --swc-icon-color: var(--swc-informative-visual-color);
      }
      .note[data-note='already'] .icon {
        --swc-icon-color: var(--swc-informative-visual-color);
      }
      .note[data-note='flagged'] .icon {
        --swc-icon-color: var(--swc-notice-visual-color);
      }
      .note[data-note='mounts'] {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .note .word {
        font-weight: var(--swc-bold-font-weight);
      }
      .note details {
        margin-block-start: var(--swc-spacing-75);
      }
      .note code {
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        overflow-wrap: anywhere;
      }
      .note details ul {
        margin: var(--swc-spacing-75) 0 0;
        padding-inline-start: var(--swc-spacing-300);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
      }
      .status {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
      }
      .status .icon {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
        --swc-icon-color: var(--swc-positive-visual-color);
      }
      .status strong {
        display: block;
      }
      .report {
        display: grid;
        gap: var(--swc-spacing-75);
      }
      .report .lead {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .command {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-100);
        padding-inline-start: var(--swc-spacing-100);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-background-layer-1-color);
      }
      .command code {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        white-space: nowrap;
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
      }
      .uncopied {
        color: var(--swc-negative-content-color-default);
      }
      .error-card {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: var(--swc-spacing-50) var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border: var(--swc-border-width-100) solid var(--swc-gray-200);
        border-radius: var(--swc-corner-radius-100);
        background: var(--swc-background-layer-1-color);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      .error-card .icon {
        color: var(--swc-negative-visual-color);
      }
      .error-card .lead {
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-content-color-default);
      }
      swc-progress-bar {
        inline-size: 100%;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
      }
    `,
  ];

  get result(): Promise<ImportOutcome> {
    return this.#result.promise;
  }

  get #dialog(): HTMLDialogElement {
    return this.renderRoot.querySelector('dialog') as HTMLDialogElement;
  }

  get #busy(): boolean {
    return this.stage === 'checking' || this.stage === 'importing';
  }

  protected firstUpdated(): void {
    this.#dialog.showModal();
    this.#off =
      this.agent?.on('importing', (progress) => {
        if (this.stage === 'importing') this.progress = progress;
      }) ?? null;
    void this.#check();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#result.resolve(this.#settled);
  }

  #focus(selector: string): void {
    void this.updateComplete.then(() => {
      const target = this.renderRoot.querySelector(selector) as LitElement;
      void target.updateComplete.then(() => target.focus());
    });
  }

  async #call(preview: boolean): Promise<ProfileImportResult | Error | null> {
    const run = ++this.#run;
    const options = preview
      ? { preview }
      : this.preview?.already != null
        ? { preview, again: true }
        : { preview };
    try {
      const result = await (this.agent as AgentPort).importProfile?.(this.file as Blob, options);
      return run === this.#run ? (result as ProfileImportResult) : null;
    } catch (error) {
      return run === this.#run ? new Error(failure(error)) : null;
    }
  }

  #fail(error: Error): void {
    this.stage = 'failed';
    this.error = error.message;
    this.announce = '';
    this.#focus('[data-action=import-retry]');
  }

  async #check(): Promise<void> {
    this.stage = 'checking';
    this.#focus('[data-action=import-cancel]');
    const result = await this.#call(true);
    if (!result) return;
    if (result instanceof Error) return this.#fail(result);
    this.preview = result.preview;
    this.stage = 'preview';
    this.#focus('[data-action=import-cancel]');
  }

  async confirm(): Promise<void> {
    if (this.stage !== 'preview') return;
    if (!this.allowed()) return this.#close(null);
    this.stage = 'importing';
    this.progress = this.agent?.importing?.() ?? null;
    this.announce = 'Importing the profile.';
    this.#focus('[data-action=import-cancel]');
    const result = await this.#call(false);
    if (!result) return;
    if (result instanceof Error) return this.#fail(result);
    this.outcome = result;
    this.stage = 'done';
    this.announce = `Imported ${count(result.cones.length, 'cone', 'cones')}.`;
    this.#focus('[data-action=import-done]');
  }

  async copy(text: string): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      this.copied = 'done';
    } catch {
      this.copied = 'failed';
    }
  }

  #close(outcome: ImportOutcome): void {
    this.#settled = outcome;
    this.#dialog.close();
  }

  #stop(): void {
    if (!this.#busy || this.#halted) return;
    this.#halted = true;
    this.#run++;
    this.agent?.importCancel?.();
  }

  #closed(): void {
    this.#stop();
    this.remove();
    const landed = this.#settled && this.#settled !== 'retry' && this.#settled.cones.length;
    if (!landed && this.trigger?.isConnected) this.trigger.focus();
  }

  #cancelButton(): TemplateResult {
    return html`<swc-button slot="button" variant="secondary" fill-style="outline" data-cancel data-action="import-cancel" @click=${() => {
      this.#stop();
      this.#close(null);
    }}>Cancel</swc-button>`;
  }

  #notes(preview: ProfileImportPreview): TemplateResult {
    const notes: TemplateResult[] = [];
    if (preview.already != null)
      notes.push(
        html`<li class="note" data-note="already"><swc-icon-info-circle class="icon" size="s" aria-hidden="true"></swc-icon-info-circle><span>You imported this export on ${day(preview.already)}. Import again to add fresh copies.</span></li>`
      );
    if (preview.providers.length)
      notes.push(
        html`<li class="note" data-note="providers"><swc-icon-info-circle class="icon" size="s" aria-hidden="true"></swc-icon-info-circle><span>Sign in again in Settings: ${providerNames(preview.providers, this.accounts)}.</span></li>`
      );
    if (preview.flagged.length)
      notes.push(
        html`<li class="note" data-note="flagged"><swc-icon-alert-triangle class="icon" size="s" aria-hidden="true"></swc-icon-alert-triangle><span><span class="word">Warning:</span> ${flaggedLead(preview.flagged)}${
          preview.flagged.length > flaggedShown
            ? html`.<details data-flagged><summary data-action="import-flagged">${chevron}Show the files</summary><ul>${preview.flagged.map((path) => html`<li><code>${path}</code></li>`)}</ul></details>`
            : html`: ${preview.flagged.map((path, index) => html`${index ? ', ' : ''}<code>${path}</code>`)}`
        }</span></li>`
      );
    if (preview.mounts.length)
      notes.push(
        html`<li class="note" data-note="mounts">Not imported: ${count(preview.mounts.length, 'mounted folder', 'mounted folders')}.</li>`
      );
    return notes.length ? html`<ul class="notes">${notes}</ul>` : html``;
  }

  #previewing(preview: ProfileImportPreview): TemplateResult {
    return html`<h2 id="title" slot="heading">Import from SLICC 6?</h2>
      <div class="content">
        <p data-text>${preview.text}</p>
        <dl data-summary>${summary(preview).map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>
        ${this.#notes(preview)}
      </div>
      ${this.#cancelButton()}
      <swc-button slot="button" variant="accent" data-action="import-confirm" @click=${() => this.confirm()}>${preview.already != null ? 'Import again' : 'Import'}</swc-button>`;
  }

  #importing(): TemplateResult {
    const progress = this.progress;
    const known = !!progress && progress.phase === 'writing' && progress.total > 0;
    return html`<h2 id="title" slot="heading">Import from SLICC 6</h2>
      <div class="content">
        ${
          known
            ? html`<swc-progress-bar size="m" value=${progress.done} max-value=${progress.total} data-progress><span slot="label">${progress.text}</span></swc-progress-bar>`
            : html`<swc-progress-bar size="m" indeterminate data-progress><span slot="label">Importing…</span></swc-progress-bar>`
        }
      </div>
      ${this.#cancelButton()}`;
  }

  #done(result: ProfileImportResult): TemplateResult {
    return html`<h2 id="title" slot="heading">Import from SLICC 6</h2>
      <div class="content">
        <div class="status" data-status="done"><swc-icon-checkmark-circle class="icon" size="s" aria-hidden="true"></swc-icon-checkmark-circle><span><strong>Imported ${count(result.cones.length, 'cone', 'cones')}.</strong> ${result.text}</span></div>
        ${
          result.report
            ? html`<div class="report"><span class="lead">Report</span><div class="command" data-report><code>${result.report}</code><swc-action-button size="s" quiet data-action="copy-report" accessible-label=${this.copied === 'done' ? 'Copied' : 'Copy report path'} @click=${() => this.copy(result.report as string)}><swc-icon-copy slot="icon"></swc-icon-copy>${this.copied === 'done' ? 'Copied' : 'Copy'}</swc-action-button></div>${
                this.copied === 'failed'
                  ? html`<span class="uncopied" role="alert" data-error="copy">Couldn’t copy. Select the path and copy it.</span>`
                  : nothing
              }</div>`
            : nothing
        }
      </div>
      <swc-button slot="button" variant="accent" data-action="import-done" @click=${() => this.#close(result)}>Done</swc-button>`;
  }

  #failed(): TemplateResult {
    return html`<h2 id="title" slot="heading">Import from SLICC 6</h2>
      <div class="content">
        <div class="error-card" role="alert" data-error="import"><swc-icon-alert-diamond class="icon" size="s" aria-hidden="true"></swc-icon-alert-diamond><span><span class="sr">Error: </span><span class="lead">${this.error}</span></span></div>
      </div>
      <swc-button slot="button" variant="secondary" fill-style="outline" data-cancel data-action="import-close" @click=${() => this.#close(null)}>Close</swc-button>
      <swc-button slot="button" variant="accent" data-action="import-retry" @click=${() => this.#close('retry')}>Try again</swc-button>`;
  }

  #body(): TemplateResult {
    if (this.stage === 'preview') return this.#previewing(this.preview as ProfileImportPreview);
    if (this.stage === 'importing') return this.#importing();
    if (this.stage === 'done') return this.#done(this.outcome as ProfileImportResult);
    if (this.stage === 'failed') return this.#failed();
    return html`<h2 id="title" slot="heading">Import from SLICC 6</h2>
      <div class="content">
        <div class="checking" data-checking><swc-progress-circle size="s" indeterminate label="Checking the profile" aria-hidden="true"></swc-progress-circle><span>Checking the profile…</span></div>
      </div>
      ${this.#cancelButton()}`;
  }

  render(): TemplateResult {
    return html`<dialog aria-labelledby="title" data-import=${this.stage} @cancel=${() => this.#stop()} @close=${this.#closed}>
      <sp-alert-dialog variant="confirmation">${this.#body()}<div class="sr" role="status" aria-live="polite" data-announce>${this.announce}</div></sp-alert-dialog>
    </dialog>`;
  }
}

export interface ImportDialogOptions {
  agent: AgentPort;
  accounts: readonly Account[];
  file: Blob;
  trigger?: HTMLElement | null;
  allowed?: () => boolean;
}

export function importProfile(options: ImportDialogOptions): Promise<ImportOutcome> {
  const trigger = options.trigger ?? focused();
  const element = document.createElement('slicc-freezer-import') as SliccFreezerImport;
  element.agent = options.agent;
  element.accounts = options.accounts;
  element.file = options.file;
  element.trigger = trigger;
  if (options.allowed) element.allowed = options.allowed;
  themeOf(trigger).append(element);
  return element.result;
}
