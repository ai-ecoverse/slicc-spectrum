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
  onCwd?: (cwd: string) => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const osc7 = /\x1b\]7;file:\/\/[^/\x07\x1b]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g;

export const cwdPromptCommand = `printf '\\033]7;file://%s%s\\007' "\${HOSTNAME:-}" "$PWD"`;

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function cwdWatcher(onCwd: (cwd: string) => void): (bytes: Uint8Array) => void {
  let pending = '';
  return (bytes) => {
    const text = pending + decoder.decode(bytes, { stream: true });
    let last: string | undefined;
    for (const match of text.matchAll(osc7)) last = match[1];
    if (last !== undefined) onCwd(decodePath(last));
    const open = text.lastIndexOf('\x1b]7;');
    pending = open >= 0 && !text.slice(open).match(/\x07|\x1b\\/) ? text.slice(open) : '';
  };
}

export function kernelBackend(
  kernel: TerminalKernel,
  { argv = ['bash', '-i'], cwd, env, onCwd }: KernelBackendOptions = {}
): TerminalBackend {
  return {
    async open(sink, { cols, rows }) {
      const watch = onCwd && cwdWatcher(onCwd);
      const onData = (bytes: Uint8Array) => {
        watch?.(bytes);
        sink.output(bytes);
      };
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
