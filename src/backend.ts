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

export const controlBytes: Record<TerminalSignal, number | null> = {
  SIGINT: 0x03,
  SIGTSTP: 0x1a,
  SIGQUIT: 0x1c,
  SIGHUP: null,
};
