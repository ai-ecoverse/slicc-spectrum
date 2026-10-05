export type TerminalSignal = 'SIGINT' | 'SIGTSTP' | 'SIGQUIT' | 'SIGHUP';

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalSink {
  output(data: Uint8Array): void;
  exit(status: number): void;
}

export interface TerminalSession {
  write(data: Uint8Array): void;
  resize(cols: number, rows: number): void;
  signal?(name: TerminalSignal): void;
  close(): void;
}

export interface TerminalBackend {
  open(sink: TerminalSink, size: TerminalSize): TerminalSession | Promise<TerminalSession>;
}
