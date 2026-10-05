import { define } from './slicc-terminal.ts';

export type {
  TerminalBackend,
  TerminalSession,
  TerminalSignal,
  TerminalSink,
  TerminalSize,
} from './backend.ts';
export type {
  KernelBackendOptions,
  KernelTerminal,
  KernelTerminalOptions,
  TerminalKernel,
} from './kernel-backend.ts';
export { kernelBackend } from './kernel-backend.ts';
export { define, SliccTerminal } from './slicc-terminal.ts';

define();
