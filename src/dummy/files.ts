import { Emitter } from '../model/emitter.ts';
import type { Change, FileEntry, FileEvents, FilePort } from '../model/types.ts';
import type { Clock } from './clock.ts';

function parents(path: string): string[] {
  const parts = path.split('/').slice(1, -1);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`);
}

export type MountScenario = 'mount' | 'cancel' | 'fail';

export interface DummyMount {
  scenario: MountScenario;
  point: string;
  files: Record<string, string>;
}

export class DummyFiles extends Emitter<FileEvents> implements FilePort {
  mount: DummyMount | null;
  mountFolder?: () => Promise<string | null>;
  mounts?: () => readonly string[];
  eject?: (path: string) => Promise<void>;
  #mounted = new Set<string>();
  #contents = new Map<string, string>();
  #directories = new Set<string>();
  #modified = new Map<string, number>();
  #changes = new Map<string, Change>();
  #clock: Clock;

  constructor(
    contents: Record<string, string>,
    directories: readonly string[],
    changes: readonly Change[],
    clock: Clock,
    mount: DummyMount | null = null
  ) {
    super();
    this.#clock = clock;
    this.mount = mount;
    if (mount) {
      this.mountFolder = () => this.#mountFolder(mount);
      this.mounts = () => [...this.#mounted];
      this.eject = (path) => this.#eject(path);
    }
    for (const directory of directories) this.#mkdirs(`${directory}/`);
    for (const [path, text] of Object.entries(contents)) this.#put(path, text, 0);
    for (const change of changes) this.#changes.set(change.path, { ...change });
    for (const change of changes) {
      if (change.after === null) this.#contents.delete(change.path);
      else this.#put(change.path, change.after, 0);
    }
  }

  #mkdirs(path: string): void {
    for (const directory of parents(path)) this.#directories.add(directory);
  }

  #put(path: string, text: string, now: number): void {
    this.#mkdirs(path);
    this.#contents.set(path, text);
    this.#modified.set(path, now);
  }

  #entries(): FileEntry[] {
    const directories = [...this.#directories].map(
      (path): FileEntry => ({ path, kind: 'directory', size: 0, modified: 0 })
    );
    const files = [...this.#contents].map(
      ([path, text]): FileEntry => ({
        path,
        kind: 'file',
        size: new TextEncoder().encode(text).length,
        modified: this.#modified.get(path) as number,
      })
    );
    return [...directories, ...files].sort((a, b) => a.path.localeCompare(b.path));
  }

  async list(): Promise<readonly FileEntry[]> {
    await this.#clock.sleep();
    return this.#entries();
  }

  async read(path: string): Promise<string> {
    await this.#clock.sleep();
    const text = this.#contents.get(path);
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  }

  #record(path: string, after: string | null, agentId: string | null): void {
    const previous = this.#changes.get(path);
    const before = previous ? previous.before : (this.#contents.get(path) ?? null);
    if (before === after) {
      this.#changes.delete(path);
      return;
    }
    const status = before === null ? 'added' : after === null ? 'deleted' : 'modified';
    this.#changes.set(path, { path, status, before, after, agentId });
  }

  #announce(path: string): void {
    this.emit('files', this.#entries());
    this.emit('file', path);
    this.emit('changes', this.changes());
  }

  async write(path: string, text: string, agentId: string | null = null): Promise<void> {
    await this.#clock.sleep();
    this.#record(path, text, agentId);
    this.#put(path, text, Date.now());
    this.#announce(path);
  }

  async remove(path: string, agentId: string | null = null): Promise<void> {
    await this.#clock.sleep();
    if (!this.#contents.has(path)) throw new Error(`ENOENT: ${path}`);
    this.#record(path, null, agentId);
    this.#contents.delete(path);
    this.#announce(path);
  }

  changes(): readonly Change[] {
    return [...this.#changes.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  accept(path: string): void {
    this.#changes.delete(path);
    this.emit('changes', this.changes());
  }

  async revert(path: string): Promise<void> {
    const change = this.#changes.get(path);
    if (!change) return;
    await this.#clock.sleep();
    this.#changes.delete(path);
    if (change.before === null) this.#contents.delete(path);
    else this.#put(path, change.before, Date.now());
    this.#announce(path);
  }

  async #mountFolder(mount: DummyMount): Promise<string | null> {
    await this.#clock.sleep();
    if (mount.scenario === 'cancel') return null;
    if (mount.scenario === 'fail') throw new Error('The folder couldn’t be mounted.');
    const files: string[] = [];
    for (const [path, text] of Object.entries(mount.files)) {
      const file = `${mount.point}/${path}`;
      this.#put(file, text, Date.now());
      files.push(file);
    }
    this.#mounted.add(mount.point);
    this.#remount(files);
    return mount.point;
  }

  async #eject(path: string): Promise<void> {
    await this.#clock.sleep();
    if (!this.#mounted.delete(path)) throw new Error(`Nothing is mounted at ${path}.`);
    const inside = (candidate: string) => candidate === path || candidate.startsWith(`${path}/`);
    const files = [...this.#contents.keys()].filter(inside);
    for (const file of files) {
      this.#contents.delete(file);
      this.#modified.delete(file);
    }
    for (const directory of [...this.#directories].filter(inside))
      this.#directories.delete(directory);
    this.#remount(files);
  }

  #remount(files: readonly string[]): void {
    this.emit('mounts', [...this.#mounted]);
    this.emit('files', this.#entries());
    for (const file of files) this.emit('file', file);
  }
}
