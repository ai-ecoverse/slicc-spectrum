import { Emitter } from '../model/emitter.ts';
import type {
  FilePort,
  Sprinkle,
  SprinkleCgiChunk,
  SprinkleCgiReply,
  SprinkleEvents,
  SprinkleMethod,
  SprinklePort,
} from '../model/types.ts';
import type { DummyAgent } from './agent.ts';

export function homePath(path: unknown): string {
  const text = String(path);
  const mapped = text.startsWith('/shared/') ? `/home/${text.slice('/shared/'.length)}` : text;
  const parts = mapped.split('/');
  if (!mapped.startsWith('/home/') || parts.some((part) => part === '.' || part === '..'))
    throw new Error(`EACCES: ${text} is outside /home`);
  return mapped;
}

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const unbase64 = (text: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));

export function cannedCgi(request: unknown): string {
  const given = (request ?? {}) as Record<string, unknown>;
  const headers = Array.isArray(given.headers) ? (given.headers as [string, string][]) : [];
  const type = headers.find(([name]) => String(name).toLowerCase() === 'content-type');
  return `${JSON.stringify({
    ok: true,
    method: given.method ?? 'GET',
    path: given.path ?? '',
    query: given.query ?? '',
    type: type?.[1] ?? null,
    body: typeof given.body === 'string' ? unbase64(given.body) : null,
  })}\n`;
}

export class DummySprinkles extends Emitter<SprinkleEvents> implements SprinklePort {
  #sprinkles: Sprinkle[];
  #agent: DummyAgent;
  #files: FilePort;
  #state = new Map<string, unknown>();
  #streams = new Map<string, Uint8Array>();
  #next = 0;

  constructor(sprinkles: readonly Sprinkle[], agent: DummyAgent, files: FilePort) {
    super();
    this.#sprinkles = sprinkles.map((sprinkle) => ({ ...sprinkle }));
    this.#agent = agent;
    this.#files = files;
  }

  list(): readonly Sprinkle[] {
    return this.#sprinkles.map((sprinkle) => ({ ...sprinkle }));
  }

  send(id: string, payload: unknown): void {
    const sprinkle = this.#sprinkles.find((candidate) => candidate.id === id);
    if (!sprinkle) return;
    const data = (payload ?? {}) as { action?: string; data?: unknown };
    this.#agent.lick(
      sprinkle.agentId,
      'sprinkle',
      sprinkle.title,
      data.action || 'event',
      JSON.stringify(data.data ?? null, null, 2)
    );
  }

  async call(id: string, method: SprinkleMethod, args: readonly unknown[]): Promise<unknown> {
    if (method === 'getState') return structuredClone(this.#state.get(id) ?? null);
    if (method === 'setState') {
      this.#state.set(id, structuredClone(args[0] ?? null));
      return undefined;
    }
    if (method === 'cgi') return this.#cgi(args[0]);
    if (method === 'cgiRead') return this.#read(String(args[0]));
    if (method === 'cgiClose') {
      this.#streams.delete(String(args[0]));
      return null;
    }
    const path = homePath(args[0]);
    if (method === 'exists') return (await this.#files.list()).some((entry) => entry.path === path);
    return this.#files.read(path);
  }

  #cgi(request: unknown): SprinkleCgiReply {
    const bytes = new TextEncoder().encode(cannedCgi(request));
    const half = Math.ceil(bytes.length / 2);
    const stream = `dummy-cgi-${++this.#next}`;
    this.#streams.set(stream, bytes.subarray(half));
    return {
      status: 200,
      statusText: 'OK',
      headers: [
        ['Content-Type', 'application/json'],
        ['X-Slicc-Cgi', 'dummy'],
      ],
      body: base64(bytes.subarray(0, half)),
      done: false,
      stream,
    };
  }

  #read(stream: string): SprinkleCgiChunk {
    const rest = this.#streams.get(stream);
    if (rest === undefined) throw new Error(`there is no cgi-bin stream ${stream}`);
    this.#streams.delete(stream);
    return { body: base64(rest), done: true };
  }
}
