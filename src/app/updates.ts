import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/divider/swc-divider.js';
import '@adobe/spectrum-wc/components/progress-bar/swc-progress-bar.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  PackageAction,
  PackageItem,
  PackageState,
  SliccModel,
  UpdateAction,
  UpdateItem,
  UpdateState,
  UpdatesPort,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { size } from './messages.ts';

const states = {
  current: ['neutral', 'Up to date'],
  queued: ['neutral', 'Waiting'],
  starting: ['info', 'Starting'],
  checking: ['info', 'Checking'],
  downloading: ['info', 'Downloading'],
  linking: ['info', 'Linking'],
  installed: ['positive', 'Installed'],
  available: ['notice', 'Update available'],
  ready: ['notice', 'Ready to apply'],
  failed: ['negative', 'Failed'],
} as const;

const actions: Record<UpdateAction, string> = {
  'restart-agent': 'Restart agent',
  reload: 'Reload',
  'update-now': 'Update now',
  retry: 'Retry',
};

const running: ReadonlySet<UpdateState> = new Set(['checking', 'downloading', 'linking']);

const packageStates: Record<PackageState, readonly [string, string] | null> = {
  available: null,
  queued: ['neutral', 'Waiting'],
  installing: ['info', 'Installing'],
  installed: ['positive', 'Installed'],
  outdated: ['notice', 'Update available'],
  updating: ['info', 'Updating'],
  removing: ['info', 'Removing'],
  failed: ['negative', 'Failed'],
};

const packageActions: Record<PackageAction, string> = {
  install: 'Install',
  update: 'Update',
  remove: 'Remove',
  retry: 'Retry',
};

const packageRunning: ReadonlySet<PackageState> = new Set(['installing', 'updating', 'removing']);

const list = (names: readonly string[]) =>
  new Intl.ListFormat('en', { type: 'conjunction' }).format(names);

export function requiresText(item: PackageItem, all: readonly PackageItem[]): string | null {
  const needs = (item.requires ?? []).map((id) => {
    const found = all.find((other) => other.id === id);
    return { label: found?.label ?? id, missing: found?.version === null };
  });
  if (!needs.length) return null;
  if (item.version === null) {
    const present = needs.filter((need) => !need.missing).map((need) => need.label);
    const missing = needs.filter((need) => need.missing).map((need) => need.label);
    return [
      present.length ? `Needs ${list(present)}` : '',
      missing.length ? `Installs ${list(missing)} too` : '',
    ]
      .filter(Boolean)
      .join('; ');
  }
  return `Needs ${list(needs.map((need) => (need.missing ? `${need.label} (not installed)` : need.label)))}`;
}

type Failures = ReadonlyMap<string, string>;
type Snapshot = ReadonlyMap<string, { state: string; error: string | null }>;

const snapshot = (
  items: readonly { id: string; state: string; error: string | null }[]
): Snapshot => new Map(items.map(({ id, state, error }) => [id, { state, error }]));

function settled(failures: Failures, before: Snapshot, after: Snapshot): Failures {
  return new Map(
    [...failures].filter(([id]) => {
      const was = before.get(id);
      const is = after.get(id);
      return was && is && was.state === is.state && was.error === is.error;
    })
  );
}

function hint(port: UpdatesPort | undefined): string {
  if (!port) return 'Update information is not connected.';
  if (port.ready()) {
    return 'Your agent is ready. Background updates appear here; apply them when it suits you.';
  }
  return 'Preparing your agent. You can keep working; this panel closes when the agent is ready.';
}

export function updatesStatus(items: readonly UpdateItem[]): string | null {
  const failed = items.filter((item) => item.state === 'failed').length;
  if (failed) return `${failed} failed`;
  const busy = items.filter((item) => running.has(item.state)).length;
  if (busy) return `updating ${busy}`;
  if (items.some((item) => item.state === 'ready' || item.state === 'available')) {
    return 'update ready';
  }
  return items.some((item) => item.state === 'starting') ? 'starting' : null;
}

export class UpdateVisibility {
  #boot: boolean;
  #initial = true;
  #failed = new Set<string>();

  constructor(ready: boolean) {
    this.#boot = !ready;
  }

  change(port: UpdatesPort, layout = false): 'open' | 'close' | null {
    const failed = new Set(
      port
        .list()
        .filter((item) => item.state === 'failed')
        .map((item) => item.id)
    );
    const open =
      ((this.#initial || layout) && this.#boot) || [...failed].some((id) => !this.#failed.has(id));
    this.#initial = false;
    this.#failed = failed;
    if (this.#boot && port.ready() && failed.size === 0) {
      this.#boot = false;
      return 'close';
    }
    return open ? 'open' : null;
  }
}

export class SliccUpdates extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    pending: { state: true },
    failures: { state: true },
    busy: { state: true },
    problems: { state: true },
  };
  declare pending: ReadonlySet<string>;
  declare failures: Failures;
  declare busy: ReadonlyMap<string, PackageAction>;
  declare problems: Failures;

  constructor() {
    super();
    this.pending = new Set();
    this.failures = new Map();
    this.busy = new Map();
    this.problems = new Map();
  }

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        container-type: inline-size;
        background: var(--swc-background-layer-2-color);
        color: var(--swc-neutral-content-color-default);
        font-size: var(--swc-font-size-100);
        line-height: var(--swc-line-height-100);
      }
      .page {
        max-width: 800px;
        padding: var(--swc-spacing-400);
        margin: 0 auto;
      }
      .page:focus {
        outline: none;
      }
      .hint {
        margin: 0 0 var(--swc-spacing-300);
        color: var(--swc-neutral-subdued-content-color-default);
        line-height: var(--swc-line-height-200);
      }
      article {
        display: grid;
        gap: var(--swc-spacing-200);
        padding: var(--swc-spacing-300) 0;
      }
      h2 {
        margin: 0;
        font-size: var(--swc-font-size-200);
        font-weight: var(--swc-bold-font-weight);
        line-height: var(--swc-heading-line-height);
        color: var(--swc-heading-color);
      }
      .head, .meta, .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100) var(--swc-spacing-200);
      }
      .head, .meta {
        justify-content: space-between;
      }
      .meta {
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
      }
      swc-status-light {
        align-self: center;
      }
      .version {
        font-family: var(--swc-code-font-family-stack);
      }
      swc-progress-bar {
        width: 100%;
      }
      .error {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        padding: var(--swc-spacing-200);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-negative-subtle-background-color-default);
        color: var(--swc-neutral-content-color-default);
        overflow-wrap: anywhere;
        line-height: var(--swc-line-height-200);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
      swc-icon-alert-triangle {
        flex: none;
        margin-block-start: var(--swc-spacing-50);
      }
      summary {
        cursor: pointer;
        width: fit-content;
        color: var(--swc-neutral-subdued-content-color-default);
        border-radius: var(--swc-corner-radius-small-default);
      }
      summary:hover {
        color: var(--swc-neutral-subdued-content-color-hover);
      }
      summary:focus-visible {
        outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
        outline-offset: var(--swc-focus-ring-gap);
      }
      pre {
        margin: var(--swc-spacing-200) 0 0;
        padding: var(--swc-spacing-200);
        max-height: calc(var(--swc-spacing-1000) * 2);
        overflow: auto;
        background: var(--swc-background-layer-1-color);
        border-radius: var(--swc-corner-radius-medium-default);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      section {
        margin-block-start: var(--swc-spacing-300);
      }
      section > h2 {
        margin-block: var(--swc-spacing-400) var(--swc-spacing-100);
      }
      section > .hint {
        margin-block-end: var(--swc-spacing-100);
      }
      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'name buttons' 'description buttons';
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-300);
        padding: var(--swc-spacing-200) 0;
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      li > :not(.name, .buttons, .description) {
        grid-column: 1 / -1;
        margin: 0;
      }
      .name {
        grid-area: name;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--swc-spacing-50) var(--swc-spacing-200);
        min-width: 0;
      }
      h3 {
        margin: 0;
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-heading-color);
      }
      .buttons {
        grid-area: buttons;
        align-self: start;
        display: flex;
        gap: var(--swc-spacing-100);
      }
      .description {
        grid-area: description;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      li .meta {
        justify-content: flex-start;
        gap: 0;
      }
      li .meta > * + *::before {
        content: '·';
        margin-inline: var(--swc-spacing-100);
      }
      .commands {
        display: flex;
        flex-wrap: wrap;
        gap: var(--swc-spacing-75);
      }
      code {
        padding: 0 var(--swc-spacing-75);
        border-radius: var(--swc-corner-radius-small-default);
        background: var(--swc-background-layer-1-color);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-75);
        color: var(--swc-code-color);
      }
      .hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .package {
        color: var(--swc-neutral-subdued-content-color-default);
      }
      @container (max-width: 480px) {
        .page {
          padding: var(--swc-spacing-300);
        }
        article .meta {
          align-items: flex-start;
          flex-direction: column;
          gap: var(--swc-spacing-50);
        }
        li {
          grid-template-areas: 'name buttons' 'description description';
        }
        .description {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          white-space: normal;
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    this.pending = new Set();
    this.failures = new Map();
    this.busy = new Map();
    this.problems = new Map();
    const port = model.updates;
    if (!port) return [];
    let previous = snapshot(port.list());
    let packages = snapshot(port.packages?.() ?? []);
    return [
      port.on('items', (items) => {
        const next = snapshot(items);
        this.failures = settled(this.failures, previous, next);
        previous = next;
        this.requestUpdate();
      }),
      port.on('packages', (items) => {
        const next = snapshot(items);
        this.problems = settled(this.problems, packages, next);
        packages = next;
        this.requestUpdate();
      }),
    ];
  }

  focus(): void {
    this.focusOn('swc-button, summary', '.page');
  }

  async act(id: string, action: UpdateAction): Promise<void> {
    const port = this.model?.updates;
    if (!port || this.pending.has(id)) return;
    this.pending = new Set([...this.pending, id]);
    this.failures = new Map([...this.failures].filter(([key]) => key !== id));
    try {
      await port.act(id, action);
    } catch (error) {
      if (this.model?.updates === port) {
        this.failures = new Map([
          ...this.failures,
          [id, error instanceof Error ? error.message : String(error)],
        ]);
      }
    } finally {
      if (this.model?.updates === port) {
        this.pending = new Set([...this.pending].filter((key) => key !== id));
      }
    }
  }

  async actPackage(id: string, action: PackageAction): Promise<void> {
    const port = this.model?.updates;
    if (!port?.actPackage || this.busy.has(id)) return;
    this.busy = new Map([...this.busy, [id, action]]);
    this.problems = new Map([...this.problems].filter(([key]) => key !== id));
    try {
      await port.actPackage(id, action);
    } catch (error) {
      if (this.model?.updates === port) {
        this.problems = new Map([
          ...this.problems,
          [id, error instanceof Error ? error.message : String(error)],
        ]);
      }
    } finally {
      if (this.model?.updates === port) {
        this.busy = new Map([...this.busy].filter(([key]) => key !== id));
        await this.updateComplete;
        const lost = !document.activeElement || document.activeElement === document.body;
        const row = [...this.renderRoot.querySelectorAll<HTMLElement>('li[data-id]')].find(
          (candidate) => candidate.dataset.id === id
        );
        if (lost) row?.querySelector<HTMLElement>('swc-button')?.focus();
      }
    }
  }

  #progress(item: UpdateItem): TemplateResult | typeof nothing {
    const progress = item.progress;
    if (progress) {
      return html`<swc-progress-bar
        size="s"
        min-value="0"
        max-value=${progress.total}
        value=${progress.done}
        value-label=${`${progress.done} of ${progress.total}`}
        accessible-label=${`${item.label}: ${progress.phase === 'download' ? 'downloading' : 'linking'}`}
      ></swc-progress-bar>`;
    }
    if (!running.has(item.state) && item.state !== 'starting') return nothing;
    return html`<swc-progress-bar
      size="s"
      indeterminate
      accessible-label=${`${item.label}: ${states[item.state][1].toLowerCase()}`}
    ></swc-progress-bar>`;
  }

  #actions(item: UpdateItem): TemplateResult | typeof nothing {
    if (!item.actions.length) return nothing;
    const busy = this.pending.has(item.id);
    return html`<div class="actions">${item.actions.map(
      (action) =>
        html`<swc-button
          size="m"
          variant="secondary"
          data-action=${action}
          accessible-label=${`${actions[action]}: ${item.label}`}
          ?pending=${busy}
          @click=${() => void this.act(item.id, action)}
        >${actions[action]}</swc-button>`
    )}</div>`;
  }

  #checked(at: number | null): TemplateResult {
    if (at === null) return html`<span>Not checked yet</span>`;
    const date = new Date(at);
    const shown = date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    return html`<span>Checked <time datetime=${date.toISOString()}>${shown}</time></span>`;
  }

  #item(item: UpdateItem): TemplateResult {
    const [variant, state] = states[item.state];
    const label = item.state === 'failed' && item.from !== null ? 'Update failed' : state;
    const error = this.failures.get(item.id) ?? item.error;
    return html`<swc-divider size="s"></swc-divider>
    <article data-id=${item.id} data-state=${item.state} aria-label=${item.label}>
      <div class="head">
        <h2>${item.label}</h2>
        <swc-status-light variant=${variant}>${label}</swc-status-light>
      </div>
      <div class="meta">
        <span class="version">${item.from ?? 'Not installed'}${item.to && item.to !== item.from ? html` → ${item.to}` : nothing}</span>
        ${item.state === 'starting' ? nothing : this.#checked(item.checkedAt)}
      </div>
      ${this.#progress(item)}
      ${
        error
          ? html`<div class="error" role="alert">
              <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
              <span>${error}</span>
            </div>`
          : nothing
      }
      ${this.#actions(item)}
      ${item.log ? html`<details><summary>Install log</summary><pre>${item.log}</pre></details>` : nothing}
    </article>`;
  }

  #packageMeta(item: PackageItem, all: readonly PackageItem[]): TemplateResult {
    const version =
      item.version === null
        ? item.offered
        : item.offered && item.offered !== item.version
          ? `${item.version} → ${item.offered}`
          : item.version;
    const download =
      item.size !== undefined && (item.version === null || item.offered !== item.version);
    const requires = requiresText(item, all);
    return html`<p class="meta">
      ${version ? html`<span class="version">${version}</span>` : nothing}
      ${download ? html`<span>${size(item.size as number)}</span>` : nothing}
      ${requires ? html`<span data-requires>${requires}</span>` : nothing}
    </p>`;
  }

  #packageProgress(item: PackageItem): TemplateResult | typeof nothing {
    const progress = item.progress;
    if (progress) {
      return html`<swc-progress-bar
        size="s"
        min-value="0"
        max-value=${progress.total}
        value=${progress.done}
        value-label=${`${progress.done} of ${progress.total} packages`}
        accessible-label=${`${item.label}: ${progress.phase === 'download' ? 'downloading' : 'linking'}`}
      ></swc-progress-bar>`;
    }
    if (!packageRunning.has(item.state)) return nothing;
    return html`<swc-progress-bar
      size="s"
      indeterminate
      accessible-label=${`${item.label}: ${packageStates[item.state]?.[1].toLowerCase()}`}
    ></swc-progress-bar>`;
  }

  #package(item: PackageItem, all: readonly PackageItem[]): TemplateResult {
    const light = packageStates[item.state];
    const busy = this.busy.get(item.id);
    const shown = busy ? [busy] : item.actions;
    const error = this.problems.get(item.id) ?? item.error;
    return html`<li data-id=${item.id} data-state=${item.state}>
      <div class="name">
        <h3 title=${item.package}>${item.label}</h3>
        ${light ? html`<swc-status-light size="s" variant=${light[0]}>${light[1]}</swc-status-light>` : nothing}
      </div>
      <div class="buttons">${shown.map(
        (action) =>
          html`<swc-button
            size="s"
            variant="secondary"
            data-action=${action}
            accessible-label=${`${packageActions[action]} ${item.label}`}
            ?pending=${busy === action}
            @click=${() => void this.actPackage(item.id, action)}
          >${packageActions[action]}</swc-button>`
      )}</div>
      <p class="description">${item.description}</p>
      ${this.#packageMeta(item, all)}
      ${
        item.commands.length
          ? html`<p class="commands"><span class="hidden">Commands: </span>${item.commands.map(
              (command) => html`<code>${command}</code>`
            )}</p>`
          : nothing
      }
      ${this.#packageProgress(item)}
      ${
        error
          ? html`<div class="error" role="alert" data-error>
              <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
              <span>${error}</span>
            </div>`
          : nothing
      }
      ${item.log ? html`<details><summary>Install log</summary><pre><span class="package">${item.package}</span>\n${item.log}</pre></details>` : nothing}
    </li>`;
  }

  #packages(port: UpdatesPort | undefined): TemplateResult | typeof nothing {
    if (!port?.packages) return nothing;
    const all = port.packages();
    return html`<section data-section="packages" aria-labelledby="packages">
      <swc-divider size="m"></swc-divider>
      <h2 id="packages">Optional packages</h2>
      <p class="hint">
        ${all.length ? 'Tools for the agent and the terminal. Install the ones you need; you can remove them later.' : 'No optional packages are offered right now.'}
      </p>
      ${
        all.length
          ? html`<ul>${repeat(
              all,
              (item) => item.id,
              (item) => this.#package(item, all)
            )}</ul>`
          : nothing
      }
    </section>`;
  }

  render(): TemplateResult {
    const port = this.model?.updates;
    return html`<div class="page" tabindex="-1">
      <p class="hint">${hint(port)}</p>
      ${repeat(
        port?.list() ?? [],
        (item) => item.id,
        (item) => this.#item(item)
      )}
      ${this.#packages(port)}
    </div>`;
  }
}
