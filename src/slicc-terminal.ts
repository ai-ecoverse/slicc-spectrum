import { WTerm } from '@wterm/dom';
import {
  controlBytes,
  type TerminalBackend,
  type TerminalSession,
  type TerminalSignal,
} from './backend.ts';
import { adopt } from './styles.ts';

const encoder = new TextEncoder();

function dimension(value: string | null): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return parsed > 0 ? parsed : undefined;
}

export class SliccTerminal extends HTMLElement {
  static observedAttributes = ['cols', 'rows'];

  static wasmUrl = new URL('./wterm.wasm', import.meta.url).href;

  #backend: TerminalBackend | null = null;
  #term: WTerm | null = null;
  #session: TerminalSession | null = null;
  #generation = 0;
  #attempt = 0;
  #batching = false;
  #ready = Promise.withResolvers<this>();

  get backend(): TerminalBackend | null {
    return this.#backend;
  }

  set backend(backend: TerminalBackend | null) {
    this.#backend = backend;
    if (!this.#term) return;
    this.#renew();
    void this.#open(this.#generation).catch((error) => this.#fail(error));
  }

  get ready(): Promise<this> {
    return this.#ready.promise;
  }

  get cols(): number {
    return this.#term?.cols ?? dimension(this.getAttribute('cols')) ?? 80;
  }

  get rows(): number {
    return this.#term?.rows ?? dimension(this.getAttribute('rows')) ?? 24;
  }

  connectedCallback(): void {
    adopt(this.getRootNode() as Document | ShadowRoot);
    const generation = ++this.#generation;
    void this.#mount(generation).catch((error) => this.#fail(error));
  }

  disconnectedCallback(): void {
    this.#generation += 1;
    this.#close();
    this.#term?.destroy();
    this.#term = null;
    this.replaceChildren();
    this.#ready = Promise.withResolvers<this>();
  }

  attributeChangedCallback(): void {
    const term = this.#term;
    if (!term || this.#batching) return;
    const cols = dimension(this.getAttribute('cols'));
    const rows = dimension(this.getAttribute('rows'));
    term.autoResize = cols === undefined && rows === undefined;
    if (term.autoResize) term.fit();
    else term.resize(cols ?? term.cols, rows ?? term.rows);
  }

  resize(cols: number, rows: number): void {
    this.#batch(() => {
      this.setAttribute('cols', String(cols));
      this.setAttribute('rows', String(rows));
    });
  }

  fit(): void {
    this.#batch(() => {
      this.removeAttribute('cols');
      this.removeAttribute('rows');
    });
  }

  write(data: string | Uint8Array): void {
    this.#term?.write(data);
  }

  send(data: string | Uint8Array): void {
    this.#session?.write(typeof data === 'string' ? encoder.encode(data) : data);
  }

  signal(name: TerminalSignal): void {
    const session = this.#session;
    if (!session) return;
    const byte = controlBytes[name];
    if (session.signal) session.signal(name);
    else if (byte !== null) session.write(Uint8Array.of(byte));
  }

  override focus(): void {
    this.#term?.focus();
  }

  readText(): Promise<string> {
    return this.#term?.readText() ?? Promise.resolve('');
  }

  async #mount(generation: number): Promise<void> {
    const host = this.ownerDocument.createElement('div');
    this.replaceChildren(host);
    const cols = dimension(this.getAttribute('cols'));
    const rows = dimension(this.getAttribute('rows'));
    const term = new WTerm(host, {
      cols,
      rows,
      wasmUrl: SliccTerminal.wasmUrl,
      onData: (data) => this.send(data),
      onBinary: (data) => this.send(data),
      onResize: (c, r) => this.#resized(c, r),
      onTitle: (title) => this.#emit('title', { title }),
      onBell: (count) => this.#emit('bell', { count }),
    });
    await term.init();
    if (generation !== this.#generation) return term.destroy();
    term.autoResize = cols === undefined && rows === undefined;
    this.#term = term;
    await this.#open(generation);
  }

  async #open(generation: number): Promise<void> {
    const attempt = ++this.#attempt;
    this.#close();
    const backend = this.#backend;
    if (!backend) return this.#announce();
    let ended = false;
    const current = () => generation === this.#generation && attempt === this.#attempt;
    const live = () => !ended && current();
    const size = { cols: this.cols, rows: this.rows };
    let session: TerminalSession;
    try {
      session = await backend.open(
        {
          output: (data) => {
            if (live()) this.#term?.write(data);
          },
          exit: (status) => {
            if (!live()) return;
            ended = true;
            this.#session = null;
            this.#emit('exit', { status });
          },
        },
        size
      );
    } catch (error) {
      if (current()) throw error;
      return;
    }
    if (!current()) return session.close();
    if (ended) {
      session.close();
      return this.#announce();
    }
    this.#session = session;
    if (size.cols !== this.cols || size.rows !== this.rows) session.resize(this.cols, this.rows);
    this.#announce();
  }

  #batch(change: () => void): void {
    this.#batching = true;
    try {
      change();
    } finally {
      this.#batching = false;
    }
    this.attributeChangedCallback();
  }

  #renew(): void {
    const previous = this.#ready;
    this.#ready = Promise.withResolvers<this>();
    previous.resolve(this.#ready.promise);
    previous.promise.catch(() => {});
  }

  #announce(): void {
    this.#ready.resolve(this);
    this.#emit('ready', { cols: this.cols, rows: this.rows });
  }

  #close(): void {
    const session = this.#session;
    this.#session = null;
    session?.close();
  }

  #resized(cols: number, rows: number): void {
    this.#session?.resize(cols, rows);
    this.#emit('resize', { cols, rows });
  }

  #fail(error: unknown): void {
    this.#ready.reject(error);
    this.#ready.promise.catch(() => {});
    this.#emit('error', { error });
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export function define(): void {
  if (!customElements.get('slicc-terminal')) customElements.define('slicc-terminal', SliccTerminal);
}
