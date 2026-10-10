import type { TerminalBackend } from '../backend.ts';
import { cwdPromptCommand, kernelBackend, type TerminalKernel } from '../kernel-backend.ts';
import { Emitter } from '../model/emitter.ts';
import type { TerminalEvents, TerminalInfo, TerminalPort } from '../model/types.ts';

export interface KernelTerminalsOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string>;
  open?: number;
}

export class KernelTerminals extends Emitter<TerminalEvents> implements TerminalPort {
  #kernel: TerminalKernel;
  #argv: string[];
  #cwd: string;
  #env: Record<string, string> | undefined;
  #terminals: TerminalInfo[] = [];
  #backends = new Map<string, TerminalBackend>();
  #next = 1;

  constructor(
    kernel: TerminalKernel,
    { argv = ['bash', '-i'], cwd = '/home', env, open = 1 }: KernelTerminalsOptions = {}
  ) {
    super();
    this.#kernel = kernel;
    this.#argv = argv;
    this.#cwd = cwd;
    this.#env = env;
    for (let i = 0; i < open; i++) this.open();
  }

  list(): readonly TerminalInfo[] {
    return this.#terminals.map((terminal) => ({ ...terminal }));
  }

  open({
    cwd = this.#cwd,
    agentId = null,
  }: {
    cwd?: string;
    agentId?: string | null;
  } = {}): TerminalInfo {
    const terminal: TerminalInfo = {
      id: `term-${this.#next}`,
      title: `${this.#argv[0]} ${this.#next}`,
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
      backend = kernelBackend(this.#kernel, {
        argv: this.#argv,
        cwd: terminal.cwd,
        env: { PROMPT_COMMAND: cwdPromptCommand, ...this.#env },
        onCwd: (cwd) => this.#move(id, cwd),
      });
      this.#backends.set(id, backend);
    }
    return backend;
  }
}
