import type { TerminalBackend } from '../backend.ts';
import { Emitter } from '../model/emitter.ts';
import type { FilePort, TerminalEvents, TerminalInfo, TerminalPort } from '../model/types.ts';
import type { Clock } from './clock.ts';
import { shellBackend } from './shell.ts';

export class DummyTerminals extends Emitter<TerminalEvents> implements TerminalPort {
  #terminals: TerminalInfo[];
  #backends = new Map<string, TerminalBackend>();
  #files: FilePort;
  #clock: Clock;
  #next: number;

  constructor(terminals: readonly TerminalInfo[], files: FilePort, clock: Clock) {
    super();
    this.#files = files;
    this.#clock = clock;
    this.#terminals = terminals.map((terminal) => ({ ...terminal }));
    this.#next = this.#terminals.length + 1;
  }

  list(): readonly TerminalInfo[] {
    return this.#terminals.map((terminal) => ({ ...terminal }));
  }

  open({
    cwd = '/workspace/harbor',
    agentId = null,
  }: {
    cwd?: string;
    agentId?: string | null;
  } = {}): TerminalInfo {
    const terminal: TerminalInfo = {
      id: `term-${this.#next}`,
      title: `bash ${this.#next}`,
      cwd,
      agentId,
    };
    this.#next += 1;
    this.#terminals.push(terminal);
    this.emit('terminals', this.list());
    return { ...terminal };
  }

  close(id: string): void {
    this.#terminals = this.#terminals.filter((terminal) => terminal.id !== id);
    this.#backends.delete(id);
    this.emit('terminals', this.list());
  }

  #move(id: string, cwd: string): void {
    const terminal = this.#terminals.find((candidate) => candidate.id === id);
    if (!terminal || terminal.cwd === cwd) return;
    terminal.cwd = cwd;
    this.emit('terminals', this.list());
  }

  backend(id: string): TerminalBackend {
    const terminal = this.#terminals.find((candidate) => candidate.id === id);
    if (!terminal) throw new Error(`No terminal ${id}`);
    let backend = this.#backends.get(id);
    if (!backend) {
      backend = shellBackend(this.#files, terminal.cwd, this.#clock, (cwd) => this.#move(id, cwd));
      this.#backends.set(id, backend);
    }
    return backend;
  }
}
