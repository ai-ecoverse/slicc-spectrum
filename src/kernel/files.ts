import { Emitter } from '../model/emitter.ts';
import type { Change, FileEntry, FileEvents, FilePort } from '../model/types.ts';

export interface KernelFilesOptions {
  skip?: readonly string[];
  interval?: number;
}

interface Observer {
  observe(handle: FileSystemHandle, options: { recursive: boolean }): Promise<void>;
  disconnect(): void;
}

type ObserverConstructor = new (callback: () => void) => Observer;

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function same(a: FileEntry | undefined, b: FileEntry): boolean {
  return a?.kind === b.kind && a.size === b.size && a.modified === b.modified;
}

export class KernelFiles extends Emitter<FileEvents> implements FilePort {
  #root: FileSystemDirectoryHandle;
  #skip: Set<string>;
  #interval: number;
  #entries = new Map<string, FileEntry>();
  #scanned = false;
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setInterval> | null = null;
  #observer: Observer | null = null;

  constructor(
    root: FileSystemDirectoryHandle,
    { skip = [], interval = 2000 }: KernelFilesOptions = {}
  ) {
    super();
    this.#root = root;
    this.#skip = new Set(skip);
    this.#interval = interval;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.refresh(), this.#interval);
    const Observer = (globalThis as { FileSystemObserver?: ObserverConstructor })
      .FileSystemObserver;
    if (!Observer) return;
    this.#observer = new Observer(() => void this.refresh());
    this.#observer.observe(this.#root, { recursive: true }).catch(() => {
      this.#observer = null;
    });
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
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
    this.#entries = next;
    this.#scanned = true;
    if (first || touched.length + gone.length === 0) return;
    this.emit('files', this.#list());
    for (const entry of [...touched, ...gone]) {
      if (entry.kind === 'file') this.emit('file', entry.path);
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
