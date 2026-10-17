import { Emitter } from '../model/emitter.ts';
import type { Change, FileEntry, FileEvents, FilePort } from '../model/types.ts';

export interface KernelFilesOptions {
  skip?: readonly string[];
  hide?: readonly string[];
  interval?: number;
}

interface Observer {
  observe(handle: FileSystemHandle, options: { recursive: boolean }): Promise<void>;
  disconnect(): void;
}

interface ChangeRecord {
  type: string;
  relativePathComponents: readonly string[];
  relativePathMovedFrom?: readonly string[] | null;
}

type ObserverConstructor = new (callback: (records: readonly ChangeRecord[]) => void) => Observer;

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function same(a: FileEntry | undefined, b: FileEntry): boolean {
  return a?.kind === b.kind && a.size === b.size && a.modified === b.modified;
}

export class KernelFiles extends Emitter<FileEvents> implements FilePort {
  #root: FileSystemDirectoryHandle;
  #skip: Set<string>;
  #hide: Set<string>;
  #interval: number;
  #entries = new Map<string, FileEntry>();
  #scanned = false;
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setInterval> | null = null;
  #observer: Observer | null = null;
  #pending: ReturnType<typeof setTimeout> | null = null;
  #last = Number.NEGATIVE_INFINITY;

  constructor(
    root: FileSystemDirectoryHandle,
    { skip = [], hide = [], interval = 2000 }: KernelFilesOptions = {}
  ) {
    super();
    this.#root = root;
    this.#skip = new Set(skip);
    this.#hide = new Set(hide);
    this.#interval = interval;
  }

  start(): void {
    if (this.#timer || this.#observer) return;
    const Observer = (globalThis as { FileSystemObserver?: ObserverConstructor })
      .FileSystemObserver;
    if (!Observer) {
      this.#poll();
      return;
    }
    const observer = new Observer((records) => this.#observed(records));
    this.#observer = observer;
    observer.observe(this.#root, { recursive: true }).catch(() => {
      if (this.#observer !== observer) return;
      this.#observer = null;
      this.#poll();
    });
  }

  #poll(): void {
    this.#timer = setInterval(() => void this.refresh(), this.#interval);
  }

  #observed(records: readonly ChangeRecord[]): void {
    if (records.length > 0 && records.every((record) => this.#unseen(record))) return;
    if (this.#pending) return;
    const wait = Math.max(0, this.#last + this.#interval - performance.now());
    this.#pending = setTimeout(() => {
      this.#pending = null;
      this.#last = performance.now();
      void this.refresh();
    }, wait);
  }

  #unseen({ type, relativePathComponents, relativePathMovedFrom }: ChangeRecord): boolean {
    if (type === 'unknown' || type === 'errored') return false;
    return [relativePathComponents, relativePathMovedFrom ?? relativePathComponents].every(
      (parts) => this.#beneath(parts)
    );
  }

  #beneath(parts: readonly string[]): boolean {
    let path = '';
    for (const [i, part] of parts.entries()) {
      path += `/${part}`;
      if (this.#hide.has(path)) return true;
      if (this.#skip.has(path) && i < parts.length - 1) return true;
    }
    return false;
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#pending) clearTimeout(this.#pending);
    this.#pending = null;
    this.#observer?.disconnect();
    this.#observer = null;
  }

  async #walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    out: Map<string, FileEntry>
  ): Promise<void> {
    const values = (
      dir as FileSystemDirectoryHandle & {
        values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
      }
    ).values();
    for await (const handle of values) {
      const path = `${prefix}/${handle.name}`;
      if (this.#hide.has(path)) continue;
      if (handle.kind === 'directory') {
        out.set(path, { path, kind: 'directory', size: 0, modified: 0 });
        if (!this.#skip.has(path)) await this.#walk(handle, path, out).catch(() => {});
      } else {
        const file = await handle.getFile().catch(() => null);
        if (file)
          out.set(path, { path, kind: 'file', size: file.size, modified: file.lastModified });
      }
    }
  }

  #list(): FileEntry[] {
    return [...this.#entries.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async #scan(): Promise<void> {
    const next = new Map<string, FileEntry>();
    await this.#walk(this.#root, '', next);
    const touched = [...next.values()].filter(
      (entry) => !same(this.#entries.get(entry.path), entry)
    );
    const gone = [...this.#entries.values()].filter((entry) => !next.has(entry.path));
    const first = !this.#scanned;
    const previous = this.#entries;
    this.#entries = next;
    this.#scanned = true;
    if (first || touched.length + gone.length === 0) return;
    this.emit('files', this.#list());
    for (const entry of [...touched, ...gone]) {
      if (entry.kind === 'file' || previous.get(entry.path)?.kind === 'file')
        this.emit('file', entry.path);
    }
  }

  refresh(): Promise<void> {
    if (this.#running !== null) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      do {
        this.#again = false;
        await this.#scan();
      } while (this.#again);
    })().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async list(): Promise<readonly FileEntry[]> {
    if (!this.#scanned) await this.refresh();
    return this.#list();
  }

  async #parent(path: string, create: boolean): Promise<[FileSystemDirectoryHandle, string]> {
    const parts = split(path);
    const name = parts.pop();
    if (!name) throw new Error(`EISDIR: ${path}`);
    let dir = this.#root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return [dir, name];
  }

  async read(path: string): Promise<string> {
    try {
      const [dir, name] = await this.#parent(path, false);
      return await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch {
      throw new Error(`ENOENT: ${path}`);
    }
  }

  async write(path: string, text: string): Promise<void> {
    const [dir, name] = await this.#parent(path, true);
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    await this.refresh();
  }

  async remove(path: string): Promise<void> {
    try {
      const [dir, name] = await this.#parent(path, false);
      await dir.removeEntry(name, { recursive: true });
    } catch {
      throw new Error(`ENOENT: ${path}`);
    }
    await this.refresh();
  }

  changes(): readonly Change[] {
    return [];
  }

  accept(): void {}

  async revert(): Promise<void> {}
}
