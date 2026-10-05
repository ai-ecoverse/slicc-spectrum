import type { TerminalBackend, TerminalSignal } from './backend.ts';

export interface KernelTerminal {
  readonly exited: Promise<number>;
  write(data: Uint8Array): void;
  resize(cols: number, rows: number): void;
  signal(name: TerminalSignal): void;
  close(): void;
}

export interface KernelTerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  onData: (bytes: Uint8Array) => void;
}

export interface TerminalKernel {
  openTerminal(argv: string[], options: KernelTerminalOptions): Promise<KernelTerminal>;
}

export interface KernelBackendOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

const encoder = new TextEncoder();

export function kernelBackend(
  kernel: TerminalKernel,
  { argv = ['bash', '-i'], cwd, env }: KernelBackendOptions = {}
): TerminalBackend {
  return {
    async open(sink, { cols, rows }) {
      const onData = (bytes: Uint8Array) => sink.output(bytes);
      const terminal = await kernel.openTerminal(argv, { cwd, env, cols, rows, onData });
      terminal.exited.then(
        (status) => sink.exit(status),
        (error) => {
          sink.output(encoder.encode(`\r\n${error instanceof Error ? error.message : error}\r\n`));
          sink.exit(1);
        }
      );
      return {
        write: (data) => terminal.write(data),
        resize: (c, r) => terminal.resize(c, r),
        signal: (name) => terminal.signal(name),
        close: () => terminal.close(),
      };
    },
  };
}
