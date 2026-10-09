import type { Subscribable } from '../model/emitter.ts';
import type { Change, ChangesPort } from '../model/types.ts';
import type { DummyFiles } from './files.ts';

export type ChangesScenario = 'files' | 'git' | 'nogit';

export const repos = ['/workspace/harbor', '/workspace/skills'];

export const noGit =
  'Changes needs git, and git isn’t installed. Install it with `pnpm add -g @ai-ecoverse/wasm-git`, then run `git init` in a folder under /home, or clone with slicc-node or the extension connected.';

function repoOf(path: string): string | undefined {
  return repos.find((repo) => path.startsWith(`${repo}/`));
}

export class DummyChanges implements ChangesPort {
  #files: DummyFiles;
  #git: boolean;

  constructor(files: DummyFiles, git: boolean) {
    this.#files = files;
    this.#git = git;
  }

  on: Subscribable<{ changes: readonly Change[] }>['on'] = (type, listener) =>
    this.#files.on(type, () => listener(this.changes()));

  changes(): readonly Change[] {
    if (!this.#git) return [];
    return this.#files.changes().flatMap((change) => {
      const repo = repoOf(change.path);
      return repo ? [{ ...change, agentId: null, repo }] : [];
    });
  }

  accept(path: string): void {
    this.#files.accept(path);
  }

  revert(path: string): Promise<void> {
    return this.#files.revert(path);
  }

  unavailable(): string | null {
    return this.#git ? null : noGit;
  }
}
