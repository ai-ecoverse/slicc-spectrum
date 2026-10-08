import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/divider/swc-divider.js';
import '@adobe/spectrum-wc/components/progress-bar/swc-progress-bar.js';
import '@adobe/spectrum-wc/components/status-light/swc-status-light.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type {
  SliccModel,
  UpdateAction,
  UpdateItem,
  UpdateState,
  UpdatesPort,
} from '../model/types.ts';
import { ModelElement } from './base.ts';

const states = {
  current: ['neutral', 'Up to date'],
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
  return null;
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
  };
  declare pending: ReadonlySet<string>;
  declare failures: ReadonlyMap<string, string>;

  constructor() {
    super();
    this.pending = new Set();
    this.failures = new Map();
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
      @container (max-width: 480px) {
        .page {
          padding: var(--swc-spacing-300);
        }
        .meta {
          align-items: flex-start;
          flex-direction: column;
          gap: var(--swc-spacing-50);
        }
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    this.pending = new Set();
    this.failures = new Map();
    const port = model.updates;
    if (!port) return [];
    let previous = new Map(port.list().map(({ id, state, error }) => [id, { state, error }]));
    return [
      port.on('items', (items) => {
        const next = new Map(items.map(({ id, state, error }) => [id, { state, error }]));
        this.failures = new Map(
          [...this.failures].filter(([id]) => {
            const before = previous.get(id);
            const after = next.get(id);
            return before && after && before.state === after.state && before.error === after.error;
          })
        );
        previous = next;
        this.requestUpdate();
      }),
    ];
  }

  focus(): void {
    this.focusOn('swc-button, summary');
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
    if (!running.has(item.state)) return nothing;
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
    const [variant, label] = states[item.state];
    const error = this.failures.get(item.id) ?? item.error;
    return html`<swc-divider size="s"></swc-divider>
    <article data-id=${item.id} data-state=${item.state} aria-label=${item.label}>
      <div class="head">
        <h2>${item.label}</h2>
        <swc-status-light variant=${variant}>${label}</swc-status-light>
      </div>
      <div class="meta">
        <span class="version">${item.from ?? 'Not installed'}${item.to && item.to !== item.from ? html` → ${item.to}` : nothing}</span>
        ${this.#checked(item.checkedAt)}
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

  render(): TemplateResult {
    const port = this.model?.updates;
    return html`<div class="page">
      <p class="hint">${hint(port)}</p>
      ${repeat(
        port?.list() ?? [],
        (item) => item.id,
        (item) => this.#item(item)
      )}
    </div>`;
  }
}
