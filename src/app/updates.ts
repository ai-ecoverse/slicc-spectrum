import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { SliccModel, UpdateAction, UpdateItem, UpdatesPort } from '../model/types.ts';
import { ModelElement, shared } from './base.ts';

const states = {
  current: ['neutral', 'Up to date'],
  checking: ['informative', 'Checking'],
  downloading: ['informative', 'Downloading'],
  linking: ['informative', 'Linking'],
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

export function updatesStatus(items: readonly UpdateItem[]): string | null {
  const failed = items.filter((item) => item.state === 'failed').length;
  if (failed) return `${failed} failed`;
  const running = items.filter((item) =>
    ['checking', 'downloading', 'linking'].includes(item.state)
  ).length;
  if (running) return `updating ${running}`;
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
    shared,
    css`
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        container-type: inline-size;
        background: var(--spectrum-background-layer-2-color);
        color: var(--spectrum-neutral-content-color-default);
        font-size: var(--spectrum-font-size-100);
      }
      .page {
        max-width: 800px;
        padding: 24px;
        margin: 0 auto;
      }
      h1 {
        font-size: var(--spectrum-font-size-400);
        margin: 0 0 8px;
      }
      .hint, .meta, summary {
        color: var(--spectrum-neutral-subdued-content-color-default);
        font-size: var(--spectrum-font-size-75);
      }
      .hint {
        margin: 0 0 24px;
        line-height: 1.5;
      }
      article {
        padding: 16px 0;
        border-top: 1px solid var(--spectrum-gray-200);
      }
      .head, .meta, .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 12px;
      }
      .head {
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .meta {
        justify-content: space-between;
        line-height: 1.5;
      }
      .version {
        font-family: var(--spectrum-code-font-family);
      }
      progress {
        display: block;
        width: 100%;
        height: 4px;
        margin: 12px 0;
        accent-color: var(--spectrum-accent-visual-color);
      }
      .actions {
        margin-top: 12px;
      }
      .error {
        margin: 12px 0 0;
        padding: 12px;
        border-left: 3px solid var(--spectrum-negative-visual-color);
        background: var(--spectrum-background-layer-1-color);
        color: var(--spectrum-negative-content-color-default);
        overflow-wrap: anywhere;
        line-height: 1.5;
      }
      details {
        margin-top: 12px;
      }
      summary {
        cursor: pointer;
        width: fit-content;
      }
      summary:focus-visible {
        outline: 2px solid var(--spectrum-focus-indicator-color);
        outline-offset: 3px;
      }
      pre {
        padding: 12px;
        max-height: 180px;
        overflow: auto;
        background: var(--spectrum-background-layer-1-color);
        border: 1px solid var(--spectrum-gray-200);
        border-radius: 4px;
        font-family: var(--spectrum-code-font-family);
        font-size: var(--spectrum-font-size-75);
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      @container (max-width: 480px) {
        .page {
          padding: 16px;
        }
        .head, .meta {
          align-items: flex-start;
          flex-direction: column;
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
    this.focusOn('sp-button, summary');
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

  #item(item: UpdateItem): TemplateResult {
    const [variant, label] = states[item.state];
    const progress = item.progress;
    const error = this.failures.get(item.id) ?? item.error;
    return html`<article data-id=${item.id} data-state=${item.state} aria-label=${item.label}>
      <div class="head">
        <strong>${item.label}</strong>
        <sp-badge size="s" variant=${variant}>${label}${progress ? ` ${progress.done}/${progress.total}` : ''}</sp-badge>
      </div>
      <div class="meta">
        <span class="version">${item.from ?? 'Not installed'}${item.to && item.to !== item.from ? html` → ${item.to}` : nothing}</span>
        ${
          item.checkedAt === null
            ? html`<span>Not checked yet</span>`
            : html`<span>Checked <time datetime=${new Date(item.checkedAt).toISOString()}>${new Date(item.checkedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time></span>`
        }
      </div>
      ${progress ? html`<progress aria-label=${`${item.label}: ${progress.phase === 'download' ? 'downloading' : 'linking'}`} value=${progress.done} max=${progress.total}></progress>` : nothing}
      ${error ? html`<div class="error" role="alert">${error}</div>` : nothing}
      ${
        item.actions.length
          ? html`<div class="actions">${item.actions.map((action) => html`<sp-button size="s" variant="secondary" treatment="outline" ?disabled=${this.pending.has(item.id)} ?pending=${this.pending.has(item.id)} data-action=${action} @click=${() => void this.act(item.id, action)}>${actions[action]}</sp-button>`)}</div>`
          : nothing
      }
      ${item.log ? html`<details><summary>Install log</summary><pre>${item.log}</pre></details>` : nothing}
    </article>`;
  }

  render(): TemplateResult {
    const port = this.model?.updates;
    return html`<div class="page">
      <h1>Install / Update</h1>
      <p class="hint">${!port ? 'Update information is not connected.' : port.ready() ? 'Your agent is ready. Background updates appear here; apply them when it suits you.' : 'Preparing your agent. You can keep working; this panel closes when the agent is ready.'}</p>
      ${repeat(
        port?.list() ?? [],
        (item) => item.id,
        (item) => this.#item(item)
      )}
    </div>`;
  }
}
