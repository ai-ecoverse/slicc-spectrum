import '@adobe/spectrum-wc/components/badge/swc-badge.js';
import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/divider/swc-divider.js';
import '@adobe/spectrum-wc/components/progress-bar/swc-progress-bar.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import link from '@adobe/spectrum-wc/link.css';
import { css, html, nothing, type TemplateResult, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  InstallProgress,
  PackageAction,
  PackageInstall,
  PackageItem,
  PackagePin,
  PackageState,
  SliccModel,
  UpdateAction,
  UpdateItem,
  UpdateRelease,
  UpdateState,
  UpdatesPort,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { chevron, disclosureStyles } from './disclosure.ts';
import { markdown, markdownCss } from './markdown.ts';
import { size } from './messages.ts';
import { ViewSet } from './view-state.ts';

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
  unpin: 'Unpin',
};

function packageLight(item: PackageItem): readonly [string, string] | null {
  if (item.pin && item.state === 'installed')
    return item.pin.base === null ? ['positive', 'Added'] : ['neutral', 'Pinned'];
  if (item.pin?.base && item.state === 'removing') return ['info', 'Unpinning'];
  return packageStates[item.state];
}

function pinVersion(item: PackageItem, pin: PackagePin): readonly string[] {
  const version = item.version ?? pin.range;
  if (pin.base === null) return [pin.range === version ? version : `${pin.range} → ${version}`];
  return [version, pin.base === version ? 'the version seven ships' : `seven ships ${pin.base}`];
}

function placed(item: PackageItem): PackageItem {
  const installs = item.installs ?? [];
  if (!installs.length) return item;
  const version = item.version ?? installs[0].version;
  const newer = item.offered !== null && item.offered !== version;
  const state = item.state === 'available' ? (newer ? 'outdated' : 'installed') : item.state;
  const owned = installs.some((install) => install.manager === 'panel');
  const hidden = new Set<PackageAction>(owned ? ['install'] : ['install', 'remove']);
  return { ...item, version, state, actions: item.actions.filter((action) => !hidden.has(action)) };
}

const elsewhere = (item: PackageItem): readonly PackageInstall[] =>
  (item.installs ?? []).filter((install) => install.manager !== 'panel');

function installText(install: PackageInstall, version: string | null): string {
  const place = install.user ? `for ${install.user}` : `in ${install.where}`;
  const via = install.manager === 'pnpm' ? ', via pnpm' : '';
  return `${install.version === version ? '' : `${install.version} `}${place}${via}`;
}

function managedText(item: PackageItem): TemplateResult | string | null {
  const others = elsewhere(item);
  if (!others.length || others.length !== item.installs?.length) return null;
  return others.every((install) => install.manager === 'pnpm')
    ? html`Managed by pnpm. Remove it with <code>pnpm remove -g ${item.package}</code>.`
    : 'Installed outside this panel. Remove it where it was installed.';
}

const shared = (item: PackageItem): boolean =>
  elsewhere(item).length > 0 && elsewhere(item).length !== item.installs?.length;

function actionLabel(item: PackageItem, action: PackageAction): string {
  if (action === 'remove' && shared(item)) return `Remove the panel’s copy of ${item.label}`;
  return `${packageActions[action]} ${item.label}`;
}

const packageRunning: ReadonlySet<PackageState> = new Set(['installing', 'updating', 'removing']);

const list = (names: readonly string[]) =>
  new Intl.ListFormat('en', { type: 'conjunction' }).format(names);

export function requiresText(item: PackageItem, all: readonly PackageItem[]): string | null {
  const needs = (item.requires ?? []).map((id) => {
    const found = all.find((other) => other.id === id);
    return { label: found?.label ?? id, missing: found?.version === null };
  });
  const present = needs.filter((need) => !need.missing).map((need) => need.label);
  const missing = needs.filter((need) => need.missing).map((need) => need.label);
  const parts = [
    present.length ? `Uses ${list(present)}` : '',
    item.version === null && missing.length ? `Installs ${list(missing)} too` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : null;
}

const fetched = (progress: InstallProgress) =>
  progress.phase === 'download' && (progress.bytes?.total ?? 0) > 0 ? progress.bytes : null;

const phased = (progress: InstallProgress): number => {
  const { done, total } = fetched(progress) ?? progress;
  const half = progress.phase === 'link' ? 1 : 0;
  return Math.round((half + (total ? Math.min(done / total, 1) : 0)) * 50);
};

const counted = (progress: InstallProgress, unit = ''): string => {
  const bytes = fetched(progress);
  if (bytes) return `${size(bytes.done)} of ${size(bytes.total)}`;
  return `${progress.done} of ${progress.total}${unit}`;
};

const itemBusy = (item: UpdateItem): boolean =>
  running.has(item.state) || item.state === 'starting' || item.progress !== null;

const packageBusy = (item: PackageItem): boolean =>
  packageRunning.has(item.state) || item.progress !== null;

const parts = (version: string): [string, string | null] => {
  const main = version.replace(/^v/, '').split('+')[0];
  const dash = main.indexOf('-');
  return dash < 0 ? [main, null] : [main.slice(0, dash), main.slice(dash + 1)];
};

const identifier = (a: string, b: string): number => {
  const numeric = [/^\d+$/.test(a), /^\d+$/.test(b)];
  if (numeric[0] && numeric[1]) return Math.sign(Number(a) - Number(b));
  if (numeric[0] !== numeric[1]) return numeric[0] ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

const dotted = (a: string, b: string): number => {
  const left = a.split('.');
  const right = b.split('.');
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const order = identifier(left[index], right[index]);
    if (order) return order;
  }
  return Math.sign(left.length - right.length);
};

const newer = (a: string, b: string): number => {
  const [coreA, preA] = parts(a);
  const [coreB, preB] = parts(b);
  const core = dotted(coreA, coreB);
  if (core || preA === preB) return core;
  if (preA === null) return 1;
  return preB === null ? -1 : dotted(preA, preB);
};

const certBlock = /<!--\s*cert-verify\s*-->([\s\S]*?)<!--\s*\/cert-verify\s*-->/g;

export const notesLimit = 8_192;

interface Notes {
  release: UpdateRelease;
  body: string;
  certified: boolean;
  cut: boolean;
}

const noted = new WeakMap<UpdateRelease, Notes>();

export function releaseNotes(release: UpdateRelease): Notes {
  const known = noted.get(release);
  if (known) return known;
  const text = release.notes ?? '';
  const certified = [...text.matchAll(certBlock)].some(([, inner]) =>
    /^certified\b/.test(inner.trim())
  );
  const lines = text.replace(certBlock, '').trim().split('\n');
  const heading =
    /^#{1,6}\s/.test(lines[0]) && lines[0].includes(release.version.replace(/^v/, ''));
  const full = lines
    .slice(heading ? 1 : 0)
    .join('\n')
    .trim();
  const cut = full.length > notesLimit;
  const head = full.slice(0, notesLimit);
  const line = head.lastIndexOf('\n');
  const body = cut ? `${(line > notesLimit / 2 ? head.slice(0, line) : head).trimEnd()}…` : full;
  const notes = { release, body, certified, cut };
  noted.set(release, notes);
  return notes;
}

export function whatsNew(
  releases: readonly UpdateRelease[] | undefined,
  from: string | null,
  to: string | null
): readonly Notes[] {
  if (!releases || from === null || to === null || to === from) return [];
  const range = releases
    .filter((release) => newer(release.version, from) > 0 && newer(release.version, to) <= 0)
    .sort((a, b) => newer(b.version, a.version))
    .map(releaseNotes);
  return range.some((entry) => entry.body) ? range : [];
}

const secure = (url: string) => /^https:\/\//i.test(url);

const installed = (releases: readonly UpdateRelease[] | undefined, version: string) =>
  releases?.find((release) => newer(release.version, version) === 0 && secure(release.url));

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
  #logs = new ViewSet(this, 'updates');
  #reached = new Map<string, { value: number; label: string }>();
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

  get busyReason(): string | null {
    const packages = this.model?.updates?.packages?.() ?? [];
    const running = this.busy.size > 0 || packages.some((item) => packageRunning.has(item.state));
    return running ? 'a package is installing' : null;
  }

  static styles = [
    unsafeCSS(link),
    disclosureStyles,
    markdownCss,
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
      .rows {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .rows > li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'name buttons' 'description buttons';
        align-items: center;
        gap: var(--swc-spacing-75) var(--swc-spacing-300);
        padding: var(--swc-spacing-200) 0;
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
      }
      .rows > li > :not(.name, .buttons, .description) {
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
      .rows > li > .meta {
        justify-content: flex-start;
        gap: 0;
      }
      .rows > li > .meta > * + *::before {
        content: '·';
        margin-inline: var(--swc-spacing-100);
      }
      .notes {
        display: flex;
        flex-direction: column;
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
        overflow-wrap: anywhere;
      }
      [data-managed] code {
        display: inline-block;
        max-width: 100%;
      }
      .warnings {
        display: flex;
        flex-direction: column;
        gap: var(--swc-spacing-75);
        font-size: var(--swc-font-size-75);
        line-height: var(--swc-line-height-200);
        overflow-wrap: anywhere;
        --swc-icon-color: var(--swc-notice-visual-color);
      }
      .warnings span {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
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
      .swc-Link {
        font-size: inherit;
      }
      .title .swc-Link {
        font-weight: inherit;
      }
      .installed {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--swc-spacing-200);
      }
      .releases {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--swc-spacing-400);
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-300);
        border: var(--swc-border-width-100) solid transparent;
        background: var(--swc-background-layer-1-color);
        border-radius: var(--swc-corner-radius-medium-default);
        overflow-wrap: anywhere;
      }
      .release {
        min-width: 0;
      }
      .older-releases {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--swc-spacing-200);
      }
      .older-releases > details > summary {
        width: 100%;
      }
      .older-releases > details[open]:not(:last-child) {
        margin-block-end: var(--swc-spacing-200);
      }
      .older-releases > .older,
      .older-releases > details > :not(summary) {
        padding-inline-start: calc(var(--swc-workflow-icon-small) + var(--swc-spacing-75));
      }
      .title {
        margin: 0;
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-heading-color);
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--swc-spacing-100);
      }
      .cut {
        margin: var(--swc-spacing-100) 0 0;
      }
      .release > .markdown {
        margin-block-start: var(--swc-spacing-100);
        line-height: var(--swc-line-height-200);
      }
      .release .markdown .heading[aria-level] {
        font-size: var(--swc-font-size-100);
        font-weight: var(--swc-bold-font-weight);
        color: var(--swc-neutral-subdued-content-color-default);
        margin-block: var(--swc-spacing-200) var(--swc-spacing-75);
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
        .rows > li {
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
    this.#reached.clear();
    const port = model.updates;
    if (!port) return [];
    let previous = snapshot(port.list());
    const subscriptions = [
      port.on('items', (items) => {
        const next = snapshot(items);
        this.failures = settled(this.failures, previous, next);
        previous = next;
        this.#prune('item', items, itemBusy);
        this.requestUpdate();
      }),
    ];
    if (!port.packages) return subscriptions;
    let packages = snapshot(port.packages());
    return [
      ...subscriptions,
      port.on('packages', (items) => {
        const next = snapshot(items);
        this.problems = settled(this.problems, packages, next);
        packages = next;
        this.#prune('package', items, packageBusy);
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

  #prune<T extends { id: string }>(
    kind: string,
    items: readonly T[],
    busy: (item: T) => boolean
  ): void {
    const live = new Set(items.filter(busy).map((item) => `${kind}:${item.id}`));
    for (const key of this.#reached.keys()) {
      if (key.startsWith(`${kind}:`) && !live.has(key)) this.#reached.delete(key);
    }
  }

  #bar(
    key: string,
    busy: boolean,
    progress: InstallProgress | null,
    count: string,
    accessible: string
  ): TemplateResult | typeof nothing {
    if (!busy) {
      this.#reached.delete(key);
      return nothing;
    }
    const before = this.#reached.get(key);
    const shown = progress
      ? { value: Math.max(before?.value ?? 0, phased(progress)), label: count }
      : before;
    if (!shown) {
      return html`<swc-progress-bar size="s" indeterminate accessible-label=${accessible}></swc-progress-bar>`;
    }
    this.#reached.set(key, shown);
    return html`<swc-progress-bar
      size="s"
      min-value="0"
      max-value="100"
      value=${shown.value}
      value-label=${shown.label}
      accessible-label=${accessible}
    ></swc-progress-bar>`;
  }

  #progress(item: UpdateItem): TemplateResult | typeof nothing {
    const progress = item.progress;
    const phase = progress ? (progress.phase === 'download' ? 'downloading' : 'linking') : null;
    return this.#bar(
      `item:${item.id}`,
      itemBusy(item),
      progress,
      progress ? counted(progress) : '',
      `${item.label}: ${phase ?? states[item.state][1].toLowerCase()}`
    );
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

  #title({ release, certified }: Notes, label: string): TemplateResult {
    return html`${secure(release.url) ? html`<a class="swc-Link swc-Link--standalone" href=${release.url} target="_blank" rel="noopener noreferrer" data-action="release-notes" aria-label=${`${label} ${release.version} release notes`}>${release.version}</a>` : release.version}${certified ? html`<swc-badge size="s" variant="positive" subtle data-certified>Certified</swc-badge>` : nothing}`;
  }

  #notes({ release, body, cut }: Notes, label: string, level: number): TemplateResult {
    return html`${body ? html`<div class="markdown">${markdown(body, { strict: true, level })}</div>` : nothing}
      ${cut && secure(release.url) ? html`<p class="cut" data-cut><a class="swc-Link swc-Link--standalone" href=${release.url} target="_blank" rel="noopener noreferrer" data-action="release-notes" aria-label=${`Read the full notes for ${label} ${release.version}`}>Read the full notes</a></p>` : nothing}`;
  }

  #older(key: string, entry: Notes, label: string, level: number): TemplateResult {
    const version = entry.release.version;
    if (!entry.body) {
      return html`<div class="release older" data-version=${version}><p class="title" role="heading" aria-level=${level}>${this.#title(entry, label)}</p></div>`;
    }
    const id = `${key}:${version}`;
    return html`<details class="release" data-version=${version} ?open=${this.#logs.has(id)} @toggle=${this.#logs.details(id)}>
      <summary data-action="release" aria-label=${`${label} ${version} notes${entry.certified ? ', certified' : ''}`}>${chevron}<span class="title" role="heading" aria-level=${level}>${this.#title(entry, label)}</span></summary>
      ${this.#notes(entry, label, level)}
    </details>`;
  }

  #whatsNew(
    key: string,
    label: string,
    entries: readonly Notes[],
    level: number
  ): TemplateResult | typeof nothing {
    if (!entries.length) return nothing;
    const [newest, ...older] = entries;
    return html`<details data-releases ?open=${this.#logs.has(key)} @toggle=${this.#logs.details(key)}>
      <summary data-action="whats-new">${chevron}What’s new</summary>
      <div class="releases">
        <div class="release" data-version=${newest.release.version} data-newest>
          <p class="title" role="heading" aria-level=${level}>${this.#title(newest, label)}</p>
          ${this.#notes(newest, label, level)}
        </div>
        ${older.length ? html`<div class="older-releases">${older.map((entry) => this.#older(key, entry, label, level))}</div>` : nothing}
      </div>
    </details>`;
  }

  #releaseLink(
    label: string,
    version: string,
    releases: readonly UpdateRelease[] | undefined,
    npm?: string
  ): TemplateResult | typeof nothing {
    const release = installed(releases, version);
    if (release) {
      return html`<a class="swc-Link swc-Link--standalone" href=${release.url} target="_blank" rel="noopener noreferrer" data-action="release-notes" aria-label=${`${label} ${version} release notes`}>Release notes</a>`;
    }
    if (!npm) return nothing;
    return html`<a class="swc-Link swc-Link--standalone" href=${`https://www.npmjs.com/package/${npm}/v/${version}`} target="_blank" rel="noopener noreferrer" data-action="npm-page" aria-label=${`npm page for ${label} ${version}`}>npm page</a>`;
  }

  #version(item: UpdateItem): TemplateResult {
    const text = html`<span class="version">${item.from ?? 'Not installed'}${item.to && item.to !== item.from ? html` → ${item.to}` : nothing}</span>`;
    const link =
      item.from !== null && (item.to === null || item.to === item.from)
        ? this.#releaseLink(item.label, item.from, item.releases)
        : nothing;
    return link === nothing ? text : html`<span class="installed">${text}${link}</span>`;
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
        ${this.#version(item)}
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
      ${this.#whatsNew(`releases:item:${item.id}`, item.label, whatsNew(item.releases, item.from, item.to), 3)}
      ${item.log ? html`<details ?open=${this.#logs.has(`item:${item.id}`)} @toggle=${this.#logs.details(`item:${item.id}`)}><summary>${chevron}Install log</summary><pre>${item.log}</pre></details>` : nothing}
    </article>`;
  }

  #packageMeta(item: PackageItem, all: readonly PackageItem[]): TemplateResult {
    if (item.pin) {
      const [version, ...rest] = pinVersion(item, item.pin);
      return html`<p class="meta" data-pin=${item.pin.base === null ? 'added' : 'pinned'}>
        <span class="version">${version}</span>
        ${rest.map((part) => html`<span>${part}</span>`)}
        <span>in ${item.pin.project}</span>
      </p>`;
    }
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
      ${shared(item) ? html`<span data-install="panel">the panel’s copy</span>` : nothing}
      ${elsewhere(item).map((install) => html`<span data-install>${installText(install, item.version)}</span>`)}
      ${download ? html`<span>${size(item.size as number)}</span>` : nothing}
      ${requires ? html`<span data-requires>${requires}</span>` : nothing}
      ${this.#packageLink(item)}
    </p>`;
  }

  #packageLink(item: PackageItem): TemplateResult | typeof nothing {
    if (item.version === null || (item.offered !== null && item.offered !== item.version))
      return nothing;
    return html`<span>${this.#releaseLink(item.label, item.version, item.releases, item.package)}</span>`;
  }

  #packageProgress(item: PackageItem): TemplateResult | typeof nothing {
    const progress = item.progress;
    const phase = progress ? (progress.phase === 'download' ? 'downloading' : 'linking') : null;
    return this.#bar(
      `package:${item.id}`,
      packageBusy(item),
      progress,
      progress ? counted(progress, ' packages') : '',
      `${item.label}: ${phase ?? packageLight(item)?.[1].toLowerCase()}`
    );
  }

  #package(item: PackageItem, all: readonly PackageItem[], act: boolean): TemplateResult {
    const light = packageLight(item);
    const busy = this.busy.get(item.id);
    const shown = busy ? [busy] : act ? item.actions : [];
    const error = this.problems.get(item.id) ?? item.error;
    const managed = managedText(item);
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
            accessible-label=${actionLabel(item, action)}
            ?pending=${busy === action}
            @click=${() => void this.actPackage(item.id, action)}
          >${packageActions[action]}</swc-button>`
      )}</div>
      <p class="description">${item.description}</p>
      ${this.#packageMeta(item, all)}
      ${item.notes?.length || managed ? html`<p class="notes" data-notes>${(item.notes ?? []).map((note) => html`<span>${note}</span>`)}${managed ? html`<span data-managed>${managed}</span>` : nothing}</p>` : nothing}
      ${
        item.warnings?.length
          ? html`<p class="warnings" data-warnings>${item.warnings.map(
              (warning) =>
                html`<span><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>${warning}</span>`
            )}</p>`
          : nothing
      }
      ${
        item.commands.length
          ? html`<p class="commands"><span class="hidden">Commands: </span>${item.commands.map(
              (command) => html`<code>${command}</code>`
            )}</p>`
          : nothing
      }
      ${this.#whatsNew(`releases:package:${item.id}`, item.label, whatsNew(item.releases, item.version, item.offered), 4)}
      ${this.#packageProgress(item)}
      ${
        error
          ? html`<div class="error" role="alert" data-error>
              <swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle>
              <span>${error}</span>
            </div>`
          : nothing
      }
      ${item.log ? html`<details ?open=${this.#logs.has(`package:${item.id}`)} @toggle=${this.#logs.details(`package:${item.id}`)}><summary>${chevron}Install log</summary><pre><span class="package">${item.package}</span>\n${item.log}</pre></details>` : nothing}
    </li>`;
  }

  #list(
    items: readonly PackageItem[],
    all: readonly PackageItem[],
    port: UpdatesPort
  ): TemplateResult {
    return html`<ul class="rows">${repeat(
      items,
      (item) => item.id,
      (item) => this.#package(item, all, Boolean(port.actPackage))
    )}</ul>`;
  }

  #packages(port: UpdatesPort | undefined): TemplateResult | typeof nothing {
    if (!port?.packages) return nothing;
    const all = port.packages().map(placed);
    const offered = all.filter((item) => item.origin !== 'user');
    const yours = all.filter((item) => item.origin === 'user');
    return html`<section data-section="packages" aria-labelledby="packages">
      <swc-divider size="m"></swc-divider>
      <h2 id="packages">Optional packages</h2>
      <p class="hint">
        ${offered.length ? 'Tools for the agent and the terminal. Install the ones you need; you can remove them later.' : 'No optional packages are offered right now.'}
      </p>
      ${offered.length ? this.#list(offered, all, port) : nothing}
    </section>
    ${
      yours.length
        ? html`<section data-section="user-packages" aria-labelledby="user-packages">
            <swc-divider size="m"></swc-divider>
            <h2 id="user-packages">Your packages</h2>
            <p class="hint">
              Packages you added with pnpm in /opt/user. Seven’s updates keep them until you remove them.${yours.some((item) => item.actions.includes('unpin')) ? ' Pinned versions stay until you unpin them.' : ''}
            </p>
            ${this.#list(yours, all, port)}
          </section>`
        : nothing
    }`;
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
