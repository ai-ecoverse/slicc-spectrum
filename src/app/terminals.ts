import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import { css, html, nothing, type TemplateResult } from 'lit';
import type { TerminalBackend, TerminalSession, TerminalSink, TerminalSize } from '../backend.ts';
import type { SliccDock } from '../components/dock.ts';
import type { SliccModel, TerminalInfo, TerminalPort } from '../model/types.ts';
import type { SliccTerminal } from '../slicc-terminal.ts';
import { ThemedElement } from './base.ts';
import { confirm } from './confirm.ts';
import { agentName } from './files.ts';
import {
  openTerminal,
  type ScreenClass,
  terminalOf,
  terminalPanel,
  terminalPanels,
} from './panels.ts';

export function deepActive(root: Document | ShadowRoot): HTMLElement | null {
  const active = root.activeElement as HTMLElement | null;
  return active?.shadowRoot ? (deepActive(active.shadowRoot) ?? active) : active;
}

export const scrollback = 1 << 18;

const ended: TerminalSession = { write() {}, resize() {}, close() {} };

class KeptSession implements TerminalBackend {
  #backend: () => TerminalBackend;
  #session: Promise<TerminalSession> | null = null;
  #sink: TerminalSink | null = null;
  #log: Uint8Array[] = [];
  #bytes = 0;
  #status: number | null = null;

  constructor(backend: () => TerminalBackend) {
    this.#backend = backend;
  }

  open(sink: TerminalSink, size: TerminalSize): Promise<TerminalSession> {
    this.#sink = sink;
    for (const chunk of this.#log) sink.output(chunk);
    if (this.#status !== null) {
      sink.exit(this.#status);
      return Promise.resolve(ended);
    }
    const session =
      this.#session !== null
        ? this.#session.then((live) => {
            live.resize(size.cols, size.rows);
            return live;
          })
        : this.#start(size);
    return session.then((live) => this.#handle(live, sink));
  }

  dispose(): void {
    this.#sink = null;
    this.#log = [];
    void this.#session?.then(
      (live) => live.close(),
      () => {}
    );
    this.#session = null;
  }

  #start(size: TerminalSize): Promise<TerminalSession> {
    const relay: TerminalSink = {
      output: (data) => {
        this.#record(data);
        this.#sink?.output(data);
      },
      exit: (status) => {
        this.#status = status;
        this.#sink?.exit(status);
      },
    };
    const session = Promise.resolve().then(() => this.#backend().open(relay, size));
    this.#session = session;
    session.catch(() => {
      if (this.#session === session) this.#session = null;
    });
    return session;
  }

  #record(data: Uint8Array): void {
    this.#log.push(data.slice());
    this.#bytes += data.length;
    while (this.#bytes > scrollback && this.#log.length > 1) {
      this.#bytes -= (this.#log.shift() as Uint8Array).length;
    }
  }

  #handle(live: TerminalSession, sink: TerminalSink): TerminalSession {
    const handle: TerminalSession = {
      write: (data) => live.write(data),
      resize: (cols, rows) => live.resize(cols, rows),
      close: () => {
        if (this.#sink === sink) this.#sink = null;
      },
    };
    if (live.signal) handle.signal = live.signal.bind(live);
    return handle;
  }
}

const kept = new WeakMap<TerminalPort, Map<string, KeptSession>>();

function sessions(port: TerminalPort): Map<string, KeptSession> {
  const known = kept.get(port);
  if (known) return known;
  const fresh = new Map<string, KeptSession>();
  kept.set(port, fresh);
  port.on('terminals', (terminals) => {
    const live = new Set(terminals.map((terminal) => terminal.id));
    for (const [id, session] of fresh) {
      if (live.has(id)) continue;
      session.dispose();
      fresh.delete(id);
    }
  });
  return fresh;
}

export function keep(port: TerminalPort, id: string): TerminalBackend {
  const map = sessions(port);
  let session = map.get(id);
  if (!session) {
    session = new KeptSession(() => port.backend(id));
    map.set(id, session);
  }
  return session;
}

export class SliccTerminalPanel extends ThemedElement {
  static properties = { ...ThemedElement.properties, terminal: {} };
  declare terminal: string;
  #screen: SliccTerminal | null = null;
  #bound: { port: TerminalPort; id: string } | null = null;
  #wanted = false;

  constructor() {
    super();
    this.terminal = '';
  }

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--slicc-terminal-background);
        color: var(--swc-neutral-content-color-default);
        font-family: var(--swc-sans-font-family-stack);
        font-size: var(--swc-font-size-75);
        --slicc-terminal-background: var(--swc-background-layer-2-color);
        --slicc-terminal-foreground: var(--swc-neutral-content-color-default);
        --slicc-terminal-cursor: var(--swc-accent-content-color-default);
        --slicc-terminal-font-family: var(--swc-code-font-family-stack, 'Source Code Pro', monospace);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--swc-spacing-200);
        flex: none;
        min-height: var(--swc-component-height-100);
        padding-inline: var(--swc-spacing-300) var(--swc-spacing-100);
        border-bottom: var(--swc-border-width-100) solid var(--swc-gray-200);
        background: var(--swc-background-layer-1-color);
        color: var(--swc-neutral-subdued-content-color-default);
        white-space: nowrap;
        overflow: hidden;
      }
      .cwd {
        font-family: var(--slicc-terminal-font-family);
        color: var(--swc-neutral-content-color-default);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .owner {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .spacer {
        flex: 1;
      }
      .screen {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      .note {
        padding: var(--swc-spacing-400);
        color: var(--swc-neutral-subdued-content-color-default);
      }
      slicc-terminal {
        position: absolute;
        inset: 0;
        --slicc-terminal-height: 100%;
        --slicc-terminal-border-radius: 0;
        --slicc-terminal-font-size: var(--swc-font-size-100);
      }
      :host([color='light']) {
        --slicc-terminal-color-0: var(--swc-gray-800);
        --slicc-terminal-color-1: var(--swc-negative-color-900);
        --slicc-terminal-color-2: var(--swc-positive-color-900);
        --slicc-terminal-color-3: var(--swc-notice-color-1000);
        --slicc-terminal-color-4: var(--swc-informative-color-900);
        --slicc-terminal-color-5: var(--swc-purple-900);
        --slicc-terminal-color-6: var(--swc-cyan-1000);
        --slicc-terminal-color-7: var(--swc-gray-600);
        --slicc-terminal-color-8: var(--swc-gray-700);
        --slicc-terminal-color-9: var(--swc-negative-color-1000);
        --slicc-terminal-color-10: var(--swc-positive-color-1000);
        --slicc-terminal-color-11: var(--swc-notice-color-1100);
        --slicc-terminal-color-12: var(--swc-informative-color-1000);
        --slicc-terminal-color-13: var(--swc-purple-1000);
        --slicc-terminal-color-14: var(--swc-cyan-1100);
        --slicc-terminal-color-15: var(--swc-gray-800);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    return [...super.subscribe(model), model.terminals.on('terminals', () => this.requestUpdate())];
  }

  focus(): void {
    this.#wanted = true;
    this.#screen?.focus();
    void this.updateComplete.then(() => this.#screen?.focus());
  }

  get screen(): SliccTerminal | null {
    return this.#screen;
  }

  #attach(model: SliccModel, info: TerminalInfo): SliccTerminal {
    const bound = this.#bound;
    if (this.#screen && bound?.port === model.terminals && bound.id === info.id)
      return this.#screen;
    const terminal = document.createElement('slicc-terminal') as SliccTerminal;
    terminal.backend = keep(model.terminals, info.id);
    terminal.addEventListener('exit', () => model.terminals.close(info.id));
    this.#screen = terminal;
    this.#bound = { port: model.terminals, id: info.id };
    const previous = deepActive(document);
    void terminal.ready.then(
      (ready) => {
        if (this.#wanted || !ready.contains(deepActive(document))) return;
        if (previous?.isConnected) previous.focus();
        else (deepActive(document) as HTMLElement | null)?.blur();
      },
      () => {}
    );
    return terminal;
  }

  #request(): void {
    this.dispatchEvent(new CustomEvent('new-terminal', { bubbles: true, composed: true }));
  }

  protected updated(): void {
    this.setAttribute('color', this.color);
  }

  render(): TemplateResult {
    const model = this.model;
    const info = model?.terminals.list().find((candidate) => candidate.id === this.terminal);
    const bar = html`<div class="bar">
      ${info ? html`<span class="cwd" title=${info.cwd}>${info.cwd}</span>` : nothing}
      ${info?.agentId ? html`<span class="owner">Driven by ${agentName(model, info.agentId)}</span>` : nothing}
      <span class="spacer"></span>
      <swc-action-button size="s" quiet @click=${() => this.#request()}>
        <swc-icon-add slot="icon"></swc-icon-add>New terminal
      </swc-action-button>
    </div>`;
    if (!model || !info) return html`${bar}<div class="note">This terminal has closed.</div>`;
    return html`${bar}<div class="screen">${this.#attach(model, info)}</div>`;
  }
}

export class TerminalPanels {
  #known = new Set<string>();
  #port: TerminalPort | null = null;
  #recent: string | null = null;
  #docks = new WeakSet<SliccDock>();
  #confirmed = new Set<string>();
  #asking: Promise<unknown> = Promise.resolve();

  attach(dock: SliccDock, port: () => TerminalPort | undefined, screen: () => ScreenClass): void {
    if (this.#docks.has(dock)) return;
    this.#docks.add(dock);
    let kind = '';
    dock.api.onWillMutateLayout((event) => {
      kind = event.kind;
    });
    dock.shadowRoot?.addEventListener(
      'click',
      (event) => {
        const close = event
          .composedPath()
          .find((node) => (node as Element).classList?.contains('slicc-tab-close')) as
          | HTMLElement
          | undefined;
        const panel = dock.api.panels.find((candidate) =>
          candidate.view.tab.element.contains(close ?? null)
        );
        const id = terminalOf(panel?.id ?? null);
        const info = port()
          ?.list()
          .find((terminal) => terminal.id === id);
        if (!info) return;
        event.preventDefault();
        void this.#ask(info, close as HTMLElement).then((yes) => {
          if (!yes) return;
          this.#confirmed.add(info.id);
          dock.close(terminalPanel(info.id));
        });
      },
      true
    );
    dock.api.onDidRemovePanel((panel) => {
      const id = terminalOf(panel.id);
      const terminals = port();
      if (kind !== 'remove' || !id || !terminals) return;
      const info = terminals.list().find((terminal) => terminal.id === id);
      if (!info) return;
      if (this.#confirmed.delete(id)) return terminals.close(id);
      void this.#ask(info, null).then((yes) => {
        if (yes) terminals.close(id);
        else dock.focusPanel(openTerminal(dock, info, screen()));
      });
    });
  }

  #ask(info: TerminalInfo, trigger: HTMLElement | null): Promise<boolean> {
    const body = 'The shell and anything running in it stop. You can’t undo this.';
    const asked = this.#asking.then(() =>
      confirm({ title: `Close ${info.title}?`, body, action: 'Close', trigger })
    );
    this.#asking = asked;
    return asked;
  }

  activated(id: string | null): void {
    if (terminalOf(id) !== null) this.#recent = id;
  }

  sync(dock: SliccDock, port: TerminalPort, screen: ScreenClass): void {
    const terminals = port.list();
    if (this.#port !== port) {
      this.#port = port;
      this.#known = new Set(terminals.map((terminal) => terminal.id));
    }
    const live = new Set(terminals.map((terminal) => terminal.id));
    for (const panel of dock.api.panels.map((candidate) => candidate.id)) {
      const terminal = terminalOf(panel);
      if ((panel === 'terminal' || terminal !== null) && !live.has(terminal ?? ''))
        dock.close(panel);
    }
    for (const info of terminals) {
      if (this.#known.has(info.id)) continue;
      this.#known.add(info.id);
      openTerminal(dock, info, screen);
    }
  }

  show(dock: SliccDock, port: TerminalPort, screen: ScreenClass): void {
    const panels = terminalPanels(dock);
    const recent = panels.find((id) => id === this.#recent) ?? panels.at(-1);
    const terminals = port.list();
    if (recent) dock.focusPanel(recent);
    else if (terminals.length === 0) this.create(dock, port, screen);
    else {
      for (const info of terminals) openTerminal(dock, info, screen);
      dock.focusPanel(terminalPanel((terminals.at(-1) as TerminalInfo).id));
    }
  }

  create(dock: SliccDock, port: TerminalPort, screen: ScreenClass): void {
    dock.focusPanel(openTerminal(dock, port.open(), screen));
  }
}
