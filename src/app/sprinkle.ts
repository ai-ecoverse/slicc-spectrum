import '@adobe/spectrum-wc/components/action-button/swc-action-button.js';
import { css, html, nothing, type PropertyValues, svg, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type {
  SliccModel,
  Sprinkle,
  SprinkleCgiChunk,
  SprinkleCgiHeaders,
  SprinkleCgiReply,
  SprinkleCgiRequest,
  SprinkleMethod,
  SprinklePort,
} from '../model/types.ts';
import { type Color, ThemedElement } from './base.ts';
import { Dips, dipsOf, dipType } from './dips.ts';
import { onWatch, watchOnly } from './follow.ts';
import { type FontFile, installedFonts } from './fonts.ts';
import { icons } from './lucide.ts';
import theme from './sprinkle-theme.css';
import { sprinkleTokens } from './sprinkle-tokens.ts';

export const bridge = `(() => {
  const post = (message) => parent.postMessage(message, '*');
  window.slicc = {
    name: document.currentScript.dataset.name,
    lick(event) {
      const value = typeof event === 'string' ? { action: event } : event || {};
      post({ type: 'slicc-lick', action: String(value.action || ''), data: value.data ?? null, target: value.target ?? null });
    },
  };
  const wanted = new Set();
  let timer = 0;
  window.LucideIcons = {
    render() {
      for (const node of document.querySelectorAll('i[data-lucide]')) wanted.add(node.dataset.lucide);
      clearTimeout(timer);
      timer = setTimeout(() => post({ type: 'slicc-icons', names: [...wanted] }));
    },
  };
  const swap = (found) => {
    for (const node of document.querySelectorAll('i[data-lucide]')) {
      const markup = found[node.dataset.lucide];
      if (!markup) continue;
      const template = document.createElement('template');
      template.innerHTML = markup;
      const svg = template.content.firstElementChild;
      for (const { name, value } of node.attributes) {
        if (name === 'class') svg.setAttribute('class', svg.getAttribute('class') + ' ' + value);
        else if (name !== 'data-lucide') svg.setAttribute(name, value);
      }
      node.replaceWith(svg);
    }
    size();
  };
  const fonts = (list) => {
    for (const font of list) {
      const face = new FontFace(font.family, font.data, { weight: String(font.weight) });
      document.fonts.add(face);
      face.load().then(size, () => {});
    }
  };
  const runs = new Map();
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const message = event.data || {};
    if (message.type === 'slicc-icons') swap(message.icons);
    if (message.type === 'slicc-fonts') fonts(message.fonts);
    if (message.type === 'slicc-theme') document.documentElement.classList.toggle('theme-light', message.color === 'light');
    const run = runs.get(message.id);
    if (run && message.type === 'slicc-cgi-head') run.head(message);
    if (run && message.type === 'slicc-cgi-chunk') run.chunk(message);
  });
  const native = window.fetch;
  const tag = Math.random().toString(36).slice(2);
  let count = 0;
  const empty = new Set([101, 103, 204, 205, 304]);
  const moved = new Set([301, 302, 303, 307, 308]);
  const decode = (text) => Uint8Array.from(atob(text || ''), (char) => char.charCodeAt(0));
  const encode = (bytes) => {
    let text = '';
    for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768));
    return btoa(text);
  };
  const scope = (input) => {
    try {
      const href = input instanceof Request ? input.url : new URL(input, document.baseURI).href;
      const base = new URL('cgi-bin/', document.baseURI);
      return href.startsWith(base.href) ? base : null;
    } catch {
      return null;
    }
  };
  const send = (input, init, hops) => {
    const base = scope(input);
    if (!base) return native.call(window, input, init);
    let request;
    try {
      request = new Request(input, init);
    } catch (error) {
      return Promise.reject(error);
    }
    const payload = request.body ? request.arrayBuffer() : Promise.resolve(null);
    return payload.then((bytes) => exchange(request, base, bytes, hops));
  };
  const redirect = (request, payload, status, location, hops) => {
    if (request.redirect === 'error') throw new TypeError('fetch: the response redirects and redirect is error');
    if (hops >= 20) throw new TypeError('fetch: more than 20 redirects');
    const get = (status === 303 && request.method !== 'GET' && request.method !== 'HEAD') || ((status === 301 || status === 302) && request.method === 'POST');
    const headers = new Headers(request.headers);
    if (get) for (const name of ['content-encoding', 'content-language', 'content-location', 'content-type']) headers.delete(name);
    const init = { method: get ? 'GET' : request.method, headers, body: get ? null : payload, signal: request.signal, redirect: request.redirect };
    return send(new URL(location, request.url).href, init, hops + 1).then((response) => Object.defineProperty(response, 'redirected', { value: true }));
  };
  const exchange = (request, base, payload, hops) => new Promise((resolve, reject) => {
    const { signal } = request;
    if (signal.aborted) return reject(signal.reason);
    const id = tag + ':' + ++count;
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    if (!headers.has('accept')) headers.set('accept', '*/*');
    const language = navigator.languages.join(',') || navigator.language;
    if (language && !headers.has('accept-language')) headers.set('accept-language', language);
    let stream = null;
    const finish = () => {
      runs.delete(id);
      signal.removeEventListener('abort', abort);
    };
    const close = () => {
      finish();
      post({ type: 'slicc-cgi-close', id });
    };
    const abort = () => {
      close();
      reject(signal.reason);
      if (stream) stream.error(signal.reason);
    };
    signal.addEventListener('abort', abort);
    runs.set(id, {
      head(message) {
        if (typeof message.error === 'string') {
          finish();
          return reject(new TypeError(message.error));
        }
        const head = message.head;
        let response;
        let follow = false;
        try {
          const fields = new Headers(head.headers);
          follow = moved.has(head.status) && fields.has('location') && request.redirect !== 'manual';
          const drop = follow || request.method === 'HEAD' || empty.has(head.status);
          const body = drop ? null : new ReadableStream({
            start(controller) {
              const first = decode(head.body);
              if (first.length) controller.enqueue(first);
              if (head.done) controller.close();
              else stream = controller;
            },
            cancel() {
              if (runs.has(id)) close();
            },
          });
          response = new Response(body, { status: head.status, statusText: head.statusText, headers: fields });
        } catch (error) {
          close();
          return reject(new TypeError(error.message));
        }
        if (head.done) finish();
        url.hash = '';
        Object.defineProperty(response, 'url', { value: url.href });
        if (!follow) return resolve(response);
        try {
          resolve(redirect(request, payload, head.status, response.headers.get('location'), hops));
        } catch (error) {
          reject(error);
        }
      },
      chunk(message) {
        if (typeof message.error === 'string') {
          finish();
          if (stream) stream.error(new TypeError(message.error));
          return;
        }
        const bytes = decode(message.body);
        if (stream && bytes.length) stream.enqueue(bytes);
        if (!message.done) return;
        finish();
        if (stream) stream.close();
      },
    });
    post({
      type: 'slicc-cgi',
      id,
      request: {
        method: request.method,
        path: url.pathname.slice(base.pathname.length),
        query: url.search.slice(1),
        headers: [...headers],
        body: payload && payload.byteLength ? encode(new Uint8Array(payload)) : null,
      },
    });
  });
  window.fetch = function fetch(input, init) {
    return send(input, init, 0);
  };
  const formOf = (form, submitter) => {
    const own = (name) => !!submitter && submitter.hasAttribute('form' + name);
    return {
      action: (own('action') ? submitter.getAttribute('formaction') : form.getAttribute('action')) || '',
      method: own('method') ? submitter.formMethod : form.method,
      enctype: own('enctype') ? submitter.formEnctype : form.enctype,
    };
  };
  const submitted = (form, submitter) => {
    const { action, method, enctype } = formOf(form, submitter);
    if (!action || !scope(action)) return;
    const url = new URL(action, document.baseURI);
    const data = new FormData(form, submitter || null);
    const entries = [...data].map(([name, value]) => [name, typeof value === 'string' ? value : value.name]);
    const init = { method: method === 'post' ? 'POST' : 'GET', redirect: 'manual', headers: {} };
    if (init.method === 'GET') url.search = new URLSearchParams(entries).toString();
    else if (enctype === 'multipart/form-data') init.body = data;
    else if (enctype === 'text/plain') {
      init.body = entries.map(([name, value]) => name + '=' + value + '\\r\\n').join('');
      init.headers['content-type'] = 'text/plain';
    } else {
      init.body = new URLSearchParams(entries).toString();
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    const tell = (detail) => form.dispatchEvent(new CustomEvent('slicc-cgi', { bubbles: true, cancelable: true, detail }));
    send(url.href, init, 0).then(
      (response) => {
        if (tell({ response }) && response.headers.has('location')) post({ type: 'slicc-reload' });
      },
      (error) => tell({ error }),
    );
  };
  const copies = new WeakSet();
  addEventListener('submit', (event) => {
    if (copies.has(event)) return;
    const form = event.composedPath()[0];
    if (!(form instanceof HTMLFormElement) || formOf(form, event.submitter).method === 'dialog') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const copy = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: event.submitter });
    copies.add(copy);
    if (form.dispatchEvent(copy)) submitted(form, event.submitter);
  }, true);
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (formOf(this, null).method === 'dialog') return submit.call(this);
    submitted(this, null);
  };
  const size = () => {
    const style = getComputedStyle(document.body);
    post({ type: 'slicc-size', height: Math.ceil(document.body.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom)) });
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.LucideIcons.render();
    size();
    new ResizeObserver(size).observe(document.body);
  });
  post({ type: 'slicc-ready' });
})();`;

export function literal(value: unknown): string {
  try {
    return JSON.stringify(value ?? null).replace(/</g, '\\u003c');
  } catch {
    return 'null';
  }
}

export function store(state: unknown): string {
  return `(() => {
  let state = ${literal(state)};
  const tag = Math.random().toString(36).slice(2);
  const pending = new Map();
  let next = 0;
  const call = (method, args) => new Promise((resolve, reject) => {
    const id = tag + ':' + ++next;
    pending.set(id, { resolve, reject });
    try {
      parent.postMessage({ type: 'slicc-call', id, method, args }, '*');
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const message = event.data || {};
    const waiting = message.type === 'slicc-result' && pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (typeof message.error === 'string') waiting.reject(new Error(message.error));
    else waiting.resolve(message.value);
  });
  Object.assign(window.slicc, {
    readFile: (path) => call('readFile', [path]),
    exists: (path) => call('exists', [path]),
    getState: () => state,
    setState(value) {
      try {
        state = JSON.parse(JSON.stringify(value === undefined ? null : value));
      } catch (error) {
        return Promise.reject(error);
      }
      return call('setState', [state]).then(() => undefined);
    },
  });
})();`;
}

export function frameDocument(
  source: string,
  color: Color,
  name: string,
  state?: { value: unknown }
): string {
  const scheme = `<style>${sprinkleTokens}${theme}</style>`;
  const light = `<script>document.documentElement.classList.toggle('theme-light', ${color === 'light'});</script>`;
  const script = `<script data-name="${name.replace(/"/g, '&quot;')}">${bridge}</script>`;
  const injection =
    light + scheme + script + (state ? `<script>${store(state.value)}</script>` : '');
  const head = source.match(/<head\b[^>]*>/i);
  if (!head || head.index === undefined) return injection + source;
  const at = head.index + head[0].length;
  return source.slice(0, at) + injection + source.slice(at);
}

const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

export function fontData(url: string): Promise<ArrayBuffer | null> {
  let found = fontCache.get(url);
  if (!found) {
    found = fetch(url).then(
      (response) => (response.ok ? response.arrayBuffer() : null),
      () => null
    );
    fontCache.set(url, found);
  }
  return found;
}

export async function frameFonts(
  files: readonly FontFile[],
  base: string
): Promise<Array<{ family: string; weight: number | string; data: ArrayBuffer }>> {
  const loaded = await Promise.all(
    files.map(async (file) => ({
      family: file.family,
      weight: file.weight,
      data: await fontData(new URL(file.url, base).href),
    }))
  );
  return loaded.filter(
    (font): font is { family: string; weight: number | string; data: ArrayBuffer } =>
      Boolean(font.data)
  );
}

interface FrameMessage {
  type?: string;
  action?: string;
  data?: unknown;
  target?: string | null;
  names?: unknown;
  height?: unknown;
  id?: unknown;
  method?: unknown;
  args?: unknown;
  request?: unknown;
}

export const cgiMethods: ReadonlySet<string> = new Set<SprinkleMethod>([
  'cgi',
  'cgiRead',
  'cgiClose',
]);

export const sprinkleMethods: ReadonlySet<string> = new Set<SprinkleMethod>([
  'readFile',
  'exists',
  'getState',
  'setState',
  ...(cgiMethods as ReadonlySet<SprinkleMethod>),
]);

const field = (value: unknown) => (typeof value === 'string' ? value : '');

export function cgiRequest(value: unknown): SprinkleCgiRequest {
  const given = (value ?? {}) as Record<string, unknown>;
  const headers: SprinkleCgiHeaders = (Array.isArray(given.headers) ? given.headers : [])
    .filter(
      (pair): pair is [string, string] =>
        Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string'
    )
    .map(([name, text]) => [name, text]);
  return {
    method: field(given.method) || 'GET',
    path: field(given.path),
    query: field(given.query),
    headers,
    body: field(given.body) || null,
  };
}

export function cgiRefusal(status: 403 | 404, text: string): SprinkleCgiReply {
  return {
    status,
    statusText: status === 403 ? 'Forbidden' : 'Not Found',
    headers: [['Content-Type', 'text/plain; charset=utf-8']],
    body: btoa(`${text}\n`),
    done: true,
    stream: null,
  };
}

export const cgiGuest = 'A guest seat has no cgi-bin/.';
export const cgiReadOnly =
  'This sprinkle is read-only here, so its cgi-bin/ only answers GET and HEAD.';
export const cgiMissing = 'This sprinkle has no cgi-bin/ here.';

type Call = NonNullable<SprinklePort['call']>;

interface CgiRun {
  call: Call;
  sprinkle: string;
  stream: string | null;
  closed: boolean;
}

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

const grip = svg`<svg class="grip" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">${[2, 7, 12].flatMap((y) => [2, 6].map((x) => svg`<circle cx=${x} cy=${y} r="1.25"></circle>`))}</svg>`;

const plainId = (id: string) => id.replace(/^cone:/, '');

export class SliccSprinkle extends ThemedElement {
  static properties = {
    ...ThemedElement.properties,
    sprinkle: {},
    inline: { type: Boolean, reflect: true },
    readonly: { type: Boolean, reflect: true },
    height: { state: true },
  };
  declare sprinkle: string;
  declare inline: boolean;
  declare readonly: boolean;
  declare height: number;

  constructor() {
    super();
    this.sprinkle = '';
    this.inline = false;
    this.readonly = false;
    this.height = 160;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--swc-background-layer-2-color);
    }
    :host([inline]) {
      height: auto;
      background: none;
    }
    :host([inline]) .handle {
      margin-inline-start: var(--swc-spacing-350);
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    iframe:focus-visible {
      outline: var(--swc-focus-indicator-thickness) solid var(--swc-focus-indicator-color);
      outline-offset: calc(-1 * var(--swc-focus-indicator-thickness));
    }
    .frame {
      border: var(--swc-border-width-100) solid var(--swc-gray-200);
      background: var(--swc-background-layer-1-color);
    }
    .handle {
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-85);
      width: max-content;
      max-width: 100%;
      box-sizing: border-box;
      height: calc(var(--swc-component-height-75) + var(--swc-spacing-75));
      padding-block: 0;
      padding-inline: var(--swc-spacing-85) var(--swc-spacing-75);
      border: var(--swc-border-width-100) solid var(--swc-gray-200);
      border-bottom: 0;
      border-radius: var(--swc-corner-radius-300) var(--swc-corner-radius-300) 0 0;
      background: var(--swc-background-layer-1-color);
      color: var(--swc-neutral-subdued-content-color-default);
      font-size: var(--swc-font-size-75);
      cursor: grab;
      user-select: none;
    }
    @media (pointer: coarse) {
      .handle [data-action='detach-sprinkle'] {
        display: inline-flex;
        padding: var(--swc-spacing-50);
      }
    }
    .handle:active {
      cursor: grabbing;
    }
    .handle .grip {
      fill: currentColor;
    }
    .handle .name {
      color: var(--swc-neutral-content-color-default);
    }
    .moved {
      display: flex;
      align-items: center;
      gap: var(--swc-spacing-100);
      padding: var(--swc-spacing-100) var(--swc-spacing-200);
      border: var(--swc-border-width-100) dashed var(--swc-gray-300);
      border-radius: var(--swc-corner-radius-medium-default);
      color: var(--swc-neutral-subdued-content-color-default);
      font-size: var(--swc-font-size-75);
    }
    .view-only {
      color: var(--swc-neutral-subdued-content-color-default);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-inline-end: 4px;
    }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .panel iframe {
      flex: 1;
      min-height: 0;
    }
    .bar {
      display: flex;
      align-items: center;
      height: 28px;
      padding: 0 12px;
      border-bottom: 1px solid var(--spectrum-gray-200);
      font-size: var(--spectrum-font-size-75);
    }
    .note {
      padding: 24px;
      color: var(--spectrum-neutral-subdued-content-color-default);
    }
  `;

  #message = async (event: MessageEvent) => {
    const frame = this.renderRoot.querySelector('iframe');
    if (!frame || event.source !== frame.contentWindow) return;
    const source = event.source as Window;
    const data = (event.data ?? {}) as FrameMessage;
    if (data.type === 'slicc-lick') {
      if (this.#readOnly()) return;
      this.model?.sprinkles.send(this.sprinkle, {
        action: data.action,
        data: data.data,
        target: data.target,
      });
    } else if (data.type === 'slicc-icons' && Array.isArray(data.names)) {
      source.postMessage({ type: 'slicc-icons', icons: await icons(data.names) }, '*');
    } else if (data.type === 'slicc-ready') {
      source.postMessage({ type: 'slicc-theme', color: this.color }, '*');
      const fonts = await frameFonts(installedFonts(), document.baseURI);
      source.postMessage({ type: 'slicc-fonts', fonts }, '*');
    } else if (data.type === 'slicc-size' && typeof data.height === 'number') {
      this.height = data.height;
    } else if (data.type === 'slicc-call') {
      await this.#call(source, data);
    } else if (data.type === 'slicc-cgi') {
      await this.#cgi(source, data);
    } else if (data.type === 'slicc-cgi-close') {
      this.#close(data.id);
    } else if (data.type === 'slicc-reload') {
      this.#reload();
    }
  };

  #runs = new Map<string, CgiRun>();

  #refusal(method: string): SprinkleCgiReply | undefined {
    if (this.model?.seat) return cgiRefusal(403, cgiGuest);
    const reading = ['GET', 'HEAD'].includes(method.toUpperCase());
    if (!reading && this.#readOnly()) return cgiRefusal(403, cgiReadOnly);
    return undefined;
  }

  async #cgi(source: Window, data: FrameMessage): Promise<void> {
    if (typeof data.id !== 'string') return;
    const id = data.id;
    const post = (message: Record<string, unknown>) => source.postMessage({ ...message, id }, '*');
    const request = cgiRequest(data.request);
    const port = this.model?.sprinkles;
    const call = port?.call?.bind(port);
    const refused = this.#refusal(request.method);
    if (refused || !call)
      return post({ type: 'slicc-cgi-head', head: refused ?? cgiRefusal(404, cgiMissing) });
    const run: CgiRun = { call, sprinkle: this.sprinkle, stream: null, closed: false };
    this.#runs.set(id, run);
    let headed = false;
    try {
      const head = (await call(run.sprinkle, 'cgi', [request])) as SprinkleCgiReply;
      let done = head.done || !head.stream;
      run.stream = done ? null : head.stream;
      if (run.closed) return this.#shut(run);
      headed = true;
      const { status, statusText, headers, body } = head;
      post({ type: 'slicc-cgi-head', head: { status, statusText, headers, body, done } });
      while (!done) {
        const chunk = (await call(run.sprinkle, 'cgiRead', [run.stream])) as SprinkleCgiChunk;
        if (run.closed) return;
        done = chunk.done;
        post({ type: 'slicc-cgi-chunk', body: chunk.body, done });
      }
    } catch (error) {
      if (!run.closed)
        post({ type: headed ? 'slicc-cgi-chunk' : 'slicc-cgi-head', error: failure(error) });
    } finally {
      if (this.#runs.get(id) === run) this.#runs.delete(id);
    }
  }

  #close(id: unknown): void {
    const run = typeof id === 'string' ? this.#runs.get(id) : undefined;
    if (!run) return;
    this.#runs.delete(id as string);
    this.#shut(run);
  }

  #shut(run: CgiRun): void {
    run.closed = true;
    if (run.stream) run.call(run.sprinkle, 'cgiClose', [run.stream]).catch(() => undefined);
  }

  #closeAll(): void {
    for (const run of this.#runs.values()) this.#shut(run);
    this.#runs.clear();
  }

  #reload(): void {
    this.#closeAll();
    this.#frame = { key: '', doc: '' };
    this.#mounts++;
    this.requestUpdate();
  }

  #readOnly(): boolean {
    return this.readonly || !!this.model?.seat || this.#frozen() || !!watchOnly(this.model);
  }

  #seen = new Set<string>();

  #frozen(): boolean {
    const owner = this.#data?.agentId;
    const port = this.model?.agent;
    if (!port || !owner) return false;
    const id = plainId(owner);
    const agents = port.list();
    const live = agents.find((agent) => plainId(agent.id) === id);
    if (live) {
      this.#seen.add(id);
      return !!live.frozen;
    }
    if (port.frozen().some((row) => !row.live && plainId(row.id) === id)) return true;
    return agents.length > 0 && this.#seen.has(id);
  }

  async #call(source: Window, data: FrameMessage): Promise<void> {
    const port = this.model?.sprinkles;
    if (!port?.call || typeof data.method !== 'string' || !sprinkleMethods.has(data.method)) return;
    if (cgiMethods.has(data.method)) return;
    const method = data.method as SprinkleMethod;
    if (method === 'setState' && this.#readOnly()) {
      source.postMessage({ type: 'slicc-result', id: data.id, error: 'read-only' }, '*');
      return;
    }
    const args = Array.isArray(data.args) ? data.args : [];
    if (method === 'setState') this.#held.value = args[0] ?? null;
    try {
      const value = await port.call(this.sprinkle, method, args);
      source.postMessage({ type: 'slicc-result', id: data.id, value }, '*');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      source.postMessage({ type: 'slicc-result', id: data.id, error: message }, '*');
    }
  }

  #held: { port: SprinklePort | null; id: string; ready: boolean; value: unknown } = {
    port: null,
    id: '',
    ready: false,
    value: null,
  };

  #hold(port: SprinklePort, ask: NonNullable<SprinklePort['call']>, id: string): void {
    const held = { port, id, ready: false, value: null as unknown };
    this.#held = held;
    this.#frame = { key: '', doc: '' };
    const settle = (value: unknown) => {
      held.value = value ?? null;
      held.ready = true;
      if (this.#held === held) this.requestUpdate();
    };
    ask.call(port, id, 'getState', []).then(settle, () => settle(null));
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const port = this.model?.sprinkles;
    if (port?.call && (this.#held.port !== port || this.#held.id !== this.sprinkle))
      this.#hold(port, port.call, this.sprinkle);
  }

  #mounts = 0;

  connectedCallback(): void {
    this.#frame = { key: '', doc: '' };
    this.#mounts++;
    super.connectedCallback();
  }

  #dips = new Dips();

  #focusLater = false;

  focus(): void {
    if (this.model?.sprinkles.call && !this.#held.ready) this.#focusLater = true;
    else this.focusOn('iframe');
  }

  protected subscribe(model: SliccModel): Array<() => void> {
    this.#dips = dipsOf(this) ?? this.#dips;
    globalThis.addEventListener('message', this.#message);
    return [
      ...super.subscribe(model),
      () => globalThis.removeEventListener('message', this.#message),
      () => this.#closeAll(),
      model.sprinkles.on('sprinkles', () => this.requestUpdate()),
      this.#dips.on('change', () => this.requestUpdate()),
      ...onWatch(model, () => this.requestUpdate()),
    ];
  }

  #drag = (event: DragEvent) => {
    const data = this.#data;
    event.dataTransfer?.setData(dipType, this.sprinkle);
    event.dataTransfer?.setData('text/plain', data?.title ?? this.sprinkle);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };

  #send(type: string, id: string): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { id }, bubbles: true, composed: true }));
  }

  get #data(): Sprinkle | undefined {
    return this.model?.sprinkles.list().find((candidate) => candidate.id === this.sprinkle);
  }

  #frame = { key: '', doc: '' };

  #document(data: Sprinkle, state?: { value: unknown }): string {
    const key = `${!!state}\n${data.name}\n${data.html}`;
    if (this.#frame.key !== key)
      this.#frame = { key, doc: frameDocument(data.html, this.color, data.name, state) };
    return this.#frame.doc;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const frame = this.renderRoot.querySelector('iframe');
    frame?.contentWindow?.postMessage({ type: 'slicc-theme', color: this.color }, '*');
    if (frame && this.#focusLater) {
      this.#focusLater = false;
      frame.focus();
    }
  }

  render(): TemplateResult {
    const data = this.#data;
    if (!data) return html`<div class="note">This sprinkle is gone.</div>`;
    if (this.inline && this.#dips.has(data.id)) {
      return html`<div class="moved">
        <swc-icon-open-in size="s"></swc-icon-open-in>
        <span>${data.title} is open as a panel.</span>
        <swc-action-button size="s" quiet data-action="show-sprinkle" @click=${() => this.#send('show-surface', `sprinkle:${data.id}`)}>Show</swc-action-button>
      </div>`;
    }
    const bridged = !!this.model?.sprinkles.call;
    if (bridged && !this.#held.ready) return html``;
    const state = bridged ? this.#held : undefined;
    const watch = !!watchOnly(this.model) || !!this.model?.seat;
    const caption = watch
      ? html`<span class="view-only" data-view-only>View only on this device</span>`
      : nothing;
    const style = `color-scheme:${this.color};${this.inline ? `height:${this.height}px;` : ''}`;
    const frame = html`${keyed(
      this.#mounts,
      html`<iframe title=${data.title} sandbox="allow-scripts allow-forms" ?inert=${watch} style=${style} .srcdoc=${this.#document(data, state)}></iframe>`
    )}`;
    if (!this.inline)
      return watch
        ? html`<div class="panel"><div class="bar">${caption}</div>${frame}</div>`
        : frame;
    return html`<div class="handle" draggable="true" title="Drag into the dock or a rail to open as a panel" @dragstart=${this.#drag}>
        ${grip}
        <span class="name">${data.title}</span>
        <swc-action-button size="xs" quiet data-action="detach-sprinkle" accessible-label=${`Open ${data.title} as a panel`} title="Open as a panel" @click=${() => this.#send('detach-sprinkle', data.id)}>
          <swc-icon-open-in slot="icon"></swc-icon-open-in>
        </swc-action-button>
        ${caption}
      </div>
      <div class="frame">${frame}</div>`;
  }
}
