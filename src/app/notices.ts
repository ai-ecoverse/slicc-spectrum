import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc/components/close-button/swc-close-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@adobe/spectrum-wc-icons/swc-icon-info-circle.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Notice, NoticesPort, SliccModel } from '../model/types.ts';
import { ModelElement } from './base.ts';
import { tabsBanner } from './tabs.ts';

export class SliccNotices extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    dismissed: { state: true },
    pending: { state: true },
    failures: { state: true },
  };
  declare dismissed: ReadonlySet<string>;
  declare pending: ReadonlyMap<string, string>;
  declare failures: ReadonlyMap<string, string>;

  constructor() {
    super();
    this.dismissed = new Set();
    this.pending = new Map();
    this.failures = new Map();
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 1 auto;
      min-height: 0;
      max-height: 40%;
      overflow-y: auto;
    }
    .notices {
      display: flex;
      flex-direction: column;
      gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-100) var(--swc-spacing-200);
    }
    .notice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-100) var(--swc-spacing-100) var(--swc-spacing-200)
        var(--swc-spacing-200);
      border-radius: var(--swc-corner-radius-medium-default);
      color: var(--swc-neutral-content-color-default);
      font-size: var(--swc-font-size-100);
      line-height: var(--swc-line-height-200);
      overflow-wrap: anywhere;
    }
    .notice[data-tone='info'] {
      background: var(--swc-informative-subtle-background-color-default);
      --tone: var(--swc-informative-visual-color);
    }
    .notice[data-tone='warning'] {
      background: var(--swc-notice-subtle-background-color-default);
      --tone: var(--swc-notice-visual-color);
    }
    .notice > swc-icon-info-circle,
    .notice > swc-icon-alert-triangle {
      margin-block-start: var(--swc-spacing-100);
      --swc-icon-color: var(--tone);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: var(--swc-spacing-50);
      padding-block-start: var(--swc-spacing-75);
      min-width: 0;
    }
    .title {
      font-weight: var(--swc-bold-font-weight);
    }
    p {
      margin: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--swc-spacing-100);
      margin-block-start: var(--swc-spacing-100);
    }
    .problem {
      display: flex;
      align-items: flex-start;
      gap: var(--swc-spacing-75);
      color: var(--swc-negative-content-color-default);
      --swc-icon-color: var(--swc-negative-content-color-default);
    }
  `;

  #port: NoticesPort | undefined;

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.notices;
    if (port !== this.#port) {
      this.#port = port;
      this.dismissed = new Set();
      this.pending = new Map();
      this.failures = new Map();
    }
    const tabs = model.tabs ? [model.tabs.on('tabs', () => this.requestUpdate())] : [];
    if (!port) return tabs;
    return [
      ...tabs,
      port.on('notices', (notices) => {
        const ids = new Set(notices.map((notice) => notice.id));
        this.dismissed = new Set([...this.dismissed].filter((id) => ids.has(id)));
        this.requestUpdate();
      }),
    ];
  }

  dismiss(id: string): void {
    const port = this.model?.notices;
    if (!port) return;
    this.dismissed = new Set([...this.dismissed, id]);
    port.dismiss(id);
  }

  async act(id: string, action: string): Promise<void> {
    const port = this.model?.notices;
    if (!port || this.pending.has(id)) return;
    this.pending = new Map([...this.pending, [id, action]]);
    this.failures = new Map([...this.failures].filter(([key]) => key !== id));
    try {
      await port.act(id, action);
    } catch (error) {
      if (this.model?.notices === port) {
        this.failures = new Map([
          ...this.failures,
          [id, error instanceof Error ? error.message : String(error)],
        ]);
      }
    } finally {
      if (this.model?.notices === port) {
        this.pending = new Map([...this.pending].filter(([key]) => key !== id));
      }
    }
  }

  #notice(notice: Notice): TemplateResult {
    const pending = this.pending.get(notice.id);
    const failure = this.failures.get(notice.id);
    return html`<div class="notice" role="status" data-notice=${notice.id} data-tone=${notice.tone}>
      ${notice.tone === 'warning' ? html`<swc-icon-alert-triangle></swc-icon-alert-triangle>` : html`<swc-icon-info-circle></swc-icon-info-circle>`}
      <div class="text">
        <span class="title">${notice.title}</span>
        <p>${notice.body}</p>
        ${failure ? html`<p class="problem" data-error><swc-icon-alert-triangle></swc-icon-alert-triangle><span>${failure}</span></p>` : nothing}
        ${
          notice.actions.length
            ? html`<div class="actions">${notice.actions.map(
                (action) =>
                  html`<swc-button size="s" variant="secondary" fill-style="outline" data-action=${action.id} ?pending=${pending === action.id} ?disabled=${!!pending && pending !== action.id} @click=${() => void this.act(notice.id, action.id)}>${action.label}</swc-button>`
              )}</div>`
            : nothing
        }
      </div>
      <swc-close-button size="m" data-dismiss accessible-label=${`Dismiss: ${notice.title}`} @click=${() => this.dismiss(notice.id)}></swc-close-button>
    </div>`;
  }

  #tabs(): TemplateResult | typeof nothing {
    const tabs = this.model?.tabs;
    const banner = tabsBanner(tabs?.state());
    if (!tabs || !banner) return nothing;
    return html`<div class="notice" role="status" data-tabs-notice=${banner.kind} data-skew=${banner.skew ?? nothing} data-tone="warning">
      <swc-icon-alert-triangle></swc-icon-alert-triangle>
      <div class="text">
        <p>${banner.text}</p>
        ${
          banner.reload
            ? html`<div class="actions"><swc-button size="s" variant="secondary" fill-style="outline" data-action="reload" @click=${() => tabs.reload()}>Reload</swc-button></div>`
            : nothing
        }
      </div>
    </div>`;
  }

  render(): TemplateResult | typeof nothing {
    const port: NoticesPort | undefined = this.model?.notices;
    const notices = (port?.list() ?? []).filter((notice) => !this.dismissed.has(notice.id));
    const tabs = this.#tabs();
    if (!notices.length && tabs === nothing) return nothing;
    return html`<div class="notices">${tabs}${repeat(
      notices,
      (notice) => notice.id,
      (notice) => this.#notice(notice)
    )}</div>`;
  }
}
