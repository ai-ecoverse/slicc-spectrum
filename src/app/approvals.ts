import '@adobe/spectrum-wc/components/button/swc-button.js';
import '@adobe/spectrum-wc-icons/swc-icon-alert-triangle.js';
import '@spectrum-web-components/alert-dialog/sp-alert-dialog.js';
import { css, html, type LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type {
  Approval,
  ApprovalDecision,
  ApprovalEnd,
  ApprovalsPort,
  GuestMessageApproval,
  GuestToolApproval,
  SliccModel,
  SudoApproval,
  TrayApproval,
} from '../model/types.ts';
import { ModelElement } from './base.ts';
import { Cuts, clampCss, Ends, fullCommand, toScroll, toShow } from './command.ts';
import { dialogStyles, focused } from './confirm.ts';
import { size } from './messages.ts';

export { deadline } from './messages.ts';

export function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function asking(approval: SudoApproval): string {
  const { kind, name, where } = approval.requester;
  const place = where ? ` in ${where}` : '';
  return kind === 'user'
    ? `You ran this with sudo${place} (as ${name})`
    : `${name} wants to run this with sudo${place}`;
}

export function sudo(approval: SudoApproval): string {
  const as = approval.target && approval.target !== 'root' ? `-u ${approval.target} ` : '';
  return `sudo ${as}${approval.command}`;
}

const rulePaths = ['/etc/fnox', '/etc/fnox/config.toml', '/etc/slicc/secrets-policy.toml'];
const ruleParents = ['/', '/etc', '/etc/slicc'];

function absolute(cwd: string, word: string): string {
  const parts: string[] = [];
  for (const part of `${word.startsWith('/') ? '' : cwd}/${word}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
    const alias = parts.join('/').match(/^proc\/([^/]+)\/(?:task\/[^/]+\/)?(root|cwd)$/);
    if (alias?.[2] === 'root') parts.length = 0;
    else if (alias && /^(?:self|thread-self)$/.test(alias[1]))
      parts.splice(0, parts.length, ...cwd.split('/').filter(Boolean));
  }
  return `/${parts.join('/')}`;
}

function pattern(path: string): RegExp {
  const source = path
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0002')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0002/g, '.*');
  return new RegExp(`^${source}$`);
}

const opaque = /^\/(?:proc\/[^/]+\/(?:task\/[^/]+\/)?(?:cwd|fd|map_files)|dev\/fd)(?:\/|$)/;

export const certain = (rules: string) =>
  rules.startsWith('/') && !opaque.test(rules) && !rules.endsWith('…');

const readOnly = [
  'cat',
  'cd',
  'df',
  'diff',
  'du',
  'echo',
  'file',
  'grep',
  'head',
  'ls',
  'pwd',
  'readlink',
  'realpath',
  'stat',
  'tail',
  'tree',
  'wc',
];

function candidates(word: string): string[] {
  if (word === '--') return [];
  if (word.startsWith('--')) return [word];
  if (!word.startsWith('-')) return [word];
  const slash = word.indexOf('/');
  const cluster = Array.from(word.slice(2), (_, index) => word.slice(index + 2));
  return [...cluster, ...(slash > 2 ? [word.slice(slash)] : [])];
}

function protects(path: string, whole: boolean): boolean {
  const inside = (candidate: string) =>
    candidate === '/etc/fnox' || candidate.startsWith('/etc/fnox/');
  if (opaque.test(path)) return true;
  if (/[[{$]/.test(path)) {
    const prefix = path.slice(0, path.search(/[*?[{$]/));
    return inside(prefix) || rulePaths.some((rule) => rule.startsWith(prefix));
  }
  if (!/[*?]/.test(path))
    return inside(path) || rulePaths.includes(path) || (whole && ruleParents.includes(path));
  const glob = pattern(path);
  const top = path.split('/').slice(0, 3).join('/');
  return (
    rulePaths.some((rule) => glob.test(rule)) ||
    (top !== path && pattern(top).test('/etc/fnox')) ||
    (whole && ruleParents.some((parent) => glob.test(parent)))
  );
}

const command = (word: string) => word.split('/').pop() ?? '';

const trusted = (word: string) =>
  readOnly.includes(word.replace(/^\/(?:usr\/)?bin\/(?=[^/]+$)/, ''));

const expansion = /\$\([^)]*\)?|\$\{[^}]*\}?|\$[\w@*#?$!-]*|`[^`]*`?/;

function moved(cwds: Set<string>, word: string): string | null {
  for (const cwd of [...cwds]) {
    const next = absolute(cwd, word);
    if (protects(next, false) || cwds.size >= 64) return next;
    cwds.add(next);
  }
  return null;
}

function touched(cwds: Set<string>, word: string, whole: boolean): string | null {
  for (const candidate of candidates(word))
    for (const cwd of cwds) {
      const path = absolute(cwd, candidate);
      if (protects(path, whole)) return path;
    }
  return null;
}

function ansi(command: string): string {
  const escape =
    /\\(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8})|([0-7]{1,3})|([\s\S]))/g;
  return command
    .replace(
      /\$'((?:[^'\\]|\\[\s\S])*)'/g,
      (_, body: string) =>
        `'${body
          .replace(escape, (_match, hex, short, long, octal, plain) => {
            if (octal) return String.fromCharCode(Number.parseInt(octal, 8));
            if (plain) return plain;
            return String.fromCodePoint(
              Math.min(Number.parseInt(hex ?? short ?? long, 16), 0x10ffff)
            );
          })
          .replace(/'/g, "'\\''")}'`
    )
    .replace(/\$"/g, '"');
}

function unglob(command: string): string {
  const chars = Array.from(command);
  const close = new Map<number, number>();
  const open: number[] = [];
  for (const [index, char] of chars.entries()) {
    if (char === '(') open.push(index);
    else if (char === ')' && open.length) close.set(open.pop() as number, index);
  }
  const out: string[] = [];
  for (let index = 0; index < chars.length; index++) {
    const end = close.get(index);
    if (end !== undefined && /^[?*+@!]$/.test(out.at(-1) ?? '')) {
      out[out.length - 1] = '*';
      index = end;
    } else out.push(chars[index]);
  }
  return out.join('');
}

const separators = /[;&|\n()`]/;

function hide(char: string): string {
  return separators.test(char) ? String.fromCharCode(0xe000 + char.charCodeAt(0)) : char;
}

function unshield(segment: string): string {
  return segment.replace(/[\ue000-\ue07f]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xe000)
  );
}

function shield(text: string): string {
  let out = '';
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === '"' && char === '\\') out += hide(char) + hide(text[++index] ?? '');
    else if (quote) {
      out += char === quote ? char : hide(char);
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === '\\') out += char + hide(text[++index] ?? '');
    else out += char;
  }
  return out;
}

function quoted(segment: string): string[] {
  const words: string[] = [];
  let word = '';
  let quote = '';
  for (let index = 0; index < segment.length; index++) {
    const char = segment[index];
    if (quote === '"' && char === '\\' && /["\\$`\n]/.test(segment[index + 1] ?? ''))
      word += segment[++index];
    else if (quote) {
      if (char === quote) quote = '';
      else word += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '\\') word += segment[++index] ?? '';
    else if (/[\s<>=]/.test(char)) {
      words.push(word);
      word = '';
    } else word += char;
  }
  return [...words, word];
}

function commas(words: string[]): string[] {
  return words
    .flatMap((word) => (word.includes(',') ? [word, ...word.split(',')] : [word]))
    .filter(Boolean);
}

function scan(words: string[], cwds: Set<string>, whole: boolean): string | null {
  let cd = false;
  for (const [index, word] of words.entries()) {
    let hit: string | null = null;
    if (index === 0 || words[index - 1] === '-c') {
      cd = ['cd', 'pushd'].includes(command(word));
      hit = touched(cwds, word, whole);
    } else if (!cd) hit = touched(cwds, word, whole);
    else if (!word.startsWith('-')) {
      cd = false;
      hit = moved(cwds, word);
    }
    if (hit) return hit;
  }
  return null;
}

function reach(command: string, cwd?: string | null): string | null {
  if (command.length > 4096) return `${command.slice(0, 40)}…`;
  const start = absolute('/', cwd ?? '/');
  if (protects(start, false)) return start;
  const cwds = new Set([start]);
  const text = unglob(ansi(command.replace(/\\\n/g, '')));
  const plain = text
    .split(separators)
    .map((segment) => commas(segment.split(/[\s<>=]+/).map((word) => word.replace(/['"\\]/g, ''))));
  const aware = shield(text)
    .split(separators)
    .map((segment) => commas(quoted(unshield(segment))));
  const segments = JSON.stringify(aware) === JSON.stringify(plain) ? plain : [...plain, ...aware];
  const whole = segments.some((words) => words.length > 0 && !trusted(words[0]));
  for (const words of segments) {
    const hit = scan(words, cwds, whole);
    if (hit) return hit;
  }
  const named = segments
    .flat()
    .find((word) => !word.startsWith('/') && /fnox|secrets-policy/.test(word));
  if (named) return absolute([...cwds].pop() ?? start, named);
  const home = segments.flat().find((word) => /^~(?:[+-](?:\/|$)|.*\/\.\.(?:\/|$))/.test(word));
  if (home) return home;
  return segments.flat().some((word) => word.includes('$')) || text.includes('`')
    ? (text.match(expansion) as RegExpMatchArray)[0]
    : null;
}

export interface SecretRulesVerdict {
  certain: string | null;
  maybe: string | null;
}

export function secretRules(command: string, cwd?: string | null): SecretRulesVerdict {
  const hit = reach(command, cwd);
  return hit && certain(hit) ? { certain: hit, maybe: null } : { certain: null, maybe: hit };
}

function origin(): HTMLElement | null {
  const active = focused();
  return (active?.closest('slicc-terminal') as HTMLElement | null) ?? active;
}

const inCwd = (approval: Approval): boolean =>
  approval.kind === 'sudo' && approval.alwaysScope === 'cwd' && !!approval.cwd;

export function alwaysHint(approval: SudoApproval): string {
  return inCwd(approval)
    ? `Always allow lets ${approval.requester.name} run exactly this command with sudo, in ${approval.cwd}, without asking again.`
    : `Always allow lets ${approval.requester.name} run exactly this command with sudo without asking again.`;
}

export function guestAlwaysHint(approval: GuestMessageApproval | GuestToolApproval): string {
  const agent = approval.agentName ?? 'this cone';
  return approval.kind === 'guest-message'
    ? `Always allow lets ${approval.requester.name} send messages to ${agent} without asking again.`
    : `Always allow lets ${agent} run exactly this ${approval.tool} call for ${approval.requester.name} without asking again.`;
}

export function guestAsking(approval: GuestMessageApproval | GuestToolApproval): string {
  return approval.kind === 'guest-message'
    ? `${approval.requester.name} wants to send this to ${approval.agentName ?? 'this cone'}:`
    : `${approval.agentName ?? 'This cone'} wants to run ${approval.tool} for ${approval.requester.name}:`;
}

export function trayTitle(approval: TrayApproval): string {
  if (approval.op === 'url') return 'Share this seven’s join URL?';
  if (approval.op === 'rotate') return 'Make a new join URL?';
  return approval.device ? `Unlink ${approval.device.name}?` : 'Unlink a device?';
}

export function trayAsking(approval: TrayApproval): string {
  const { name } = approval.requester;
  if (approval.op === 'url')
    return `${name} wants this seven’s join URL. Anyone with it can ask to link to this seven.`;
  if (approval.op === 'rotate')
    return `${name} wants a new join URL. Linked devices move to it, and the old one stops working.`;
  return `${name} wants to unlink ${approval.device?.name ?? 'a device'} from this seven.`;
}

export function approved(approval: Approval): string {
  if (approval.kind === 'sudo') return sudo(approval);
  if (approval.kind === 'guest-message' || approval.kind === 'tray') return '';
  if (approval.summary.trim()) return approval.summary;
  return approval.args?.trim() ? `${approval.tool}\n${approval.args}` : '';
}

export function truncated(approval: Approval): boolean {
  return approval.kind === 'guest-tool' && !approval.summary.trim() && !!approval.argsTruncated;
}

function hintOf(approval: Approval): string {
  return approval.kind === 'sudo'
    ? alwaysHint(approval)
    : guestAlwaysHint(approval as GuestMessageApproval | GuestToolApproval);
}

const tooLong = 'This request is too long to show in full, so it can’t be allowed.';

export function guestWaiting(approval: GuestMessageApproval | GuestToolApproval): string {
  return approval.kind === 'guest-message'
    ? `${approval.requester.name}'s message to ${approval.agentName ?? 'this cone'} waits for the owner's approval.`
    : `${approval.agentName ?? 'This cone'} wants to run ${approval.tool} for ${approval.requester.name}, which waits for the owner's approval.`;
}

const clear: SecretRulesVerdict = { certain: null, maybe: null };

function rulesOf(approval: Approval): SecretRulesVerdict {
  return approval.kind === 'sudo' ? secretRules(approval.command, approval.cwd) : clear;
}

export function waiting(model: SliccModel | null, now: number): Approval[] {
  return [...(model?.approvals?.list() ?? [])]
    .filter((approval) => approval.expiresAt > now && Object.hasOwn(titles, approval.kind))
    .sort((a, b) => a.createdAt - b.createdAt);
}

const titles: Record<Approval['kind'], Record<'ask' | 'elsewhere' | 'expired', string>> = {
  sudo: {
    ask: 'Allow sudo?',
    elsewhere: 'Answered in another tab',
    expired: 'Sudo request timed out',
  },
  'guest-message': {
    ask: 'Allow a guest’s message?',
    elsewhere: 'Answered elsewhere',
    expired: 'Guest message timed out',
  },
  'guest-tool': {
    ask: 'Allow a guest’s tool call?',
    elsewhere: 'Answered elsewhere',
    expired: 'Guest tool call timed out',
  },
  tray: {
    ask: '',
    elsewhere: 'Answered in another tab',
    expired: 'Tray request timed out',
  },
};

function title(approval: Approval): string {
  return approval.kind === 'tray' ? trayTitle(approval) : titles[approval.kind].ask;
}

function gone(reason: ApprovalEnd): 'elsewhere' | 'expired' {
  return reason === 'expired' ? 'expired' : 'elsewhere';
}

export class SliccApprovals extends ModelElement {
  static properties = {
    ...ModelElement.properties,
    now: { state: true },
    busy: { state: true },
    failure: { state: true },
    gone: { state: true },
  };
  declare now: number;
  declare busy: ApprovalDecision | '';
  declare failure: { id: string; message: string } | null;
  declare gone: { approval: Approval; reason: 'elsewhere' | 'expired' } | null;
  arming = 500;
  #armed = false;
  #arming: ReturnType<typeof setTimeout> | undefined;
  #showing: Approval | null = null;
  #pending = new Set<string>();
  #done = new Set<string>();
  #closed = new Set<string>();
  #port: ApprovalsPort | undefined;
  #ended = new Map<string, ApprovalEnd>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #shown = '';
  #trigger: HTMLElement | null = null;
  #full = new Set<string>();
  #cuts = new Cuts(
    () => this.renderRoot,
    () => this.requestUpdate()
  );
  #ends = new Ends(
    () => this.renderRoot,
    () => this.requestUpdate()
  );

  constructor() {
    super();
    this.now = Date.now();
    this.busy = '';
    this.failure = null;
    this.gone = null;
  }

  static styles = [
    dialogStyles,
    clampCss,
    css`
      :host {
        display: contents;
      }
      sp-alert-dialog {
        display: grid;
        --mod-alert-dialog-min-width: min(
          var(--swc-alert-dialog-maximum-width),
          calc(100vw - 2 * var(--swc-spacing-300))
        );
      }
      .command {
        margin: var(--swc-spacing-200) 0 0;
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-gray-100);
        font-family: var(--swc-code-font-family-stack);
        font-size: var(--swc-font-size-100);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .command .lines:not([data-clamp]) {
        display: block;
        max-block-size: min(16lh, 50dvh);
        overflow: auto;
        overscroll-behavior: contain;
      }
      .command .end {
        display: inline-block;
        inline-size: 0;
        block-size: 0;
      }
      .full-command {
        margin-block-start: var(--swc-spacing-100);
      }
      .guest {
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border: var(--swc-border-width-100) solid var(--swc-gray-300);
        border-radius: var(--swc-corner-radius-medium-default);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-block-size: 12lh;
        overflow: auto;
      }
      .files {
        margin: var(--swc-spacing-200) 0 0;
        padding-inline-start: var(--swc-spacing-400);
        font-size: var(--swc-font-size-75);
        overflow-wrap: anywhere;
      }
      .cwd,
      .verdict,
      .hint,
      .timer,
      .more {
        margin-block-start: var(--swc-spacing-100);
        color: var(--swc-neutral-subdued-content-color-default);
        font-size: var(--swc-font-size-75);
      }
      .cwd {
        overflow-wrap: anywhere;
      }
      .timer {
        margin-block-start: var(--swc-spacing-300);
        font-variant-numeric: tabular-nums;
      }
      .rules {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-100);
        margin-block-start: var(--swc-spacing-200);
        padding: var(--swc-spacing-200) var(--swc-spacing-300);
        border-radius: var(--swc-corner-radius-medium-default);
        background: var(--swc-notice-subtle-background-color-default);
        --swc-icon-color: var(--swc-icon-color-notice);
      }
      .rules swc-icon-alert-triangle {
        flex: none;
        margin-block-start: 0.15em;
      }
      .rules p {
        margin: 0;
      }
      .rules code {
        font-family: var(--swc-code-font-family-stack);
        overflow-wrap: anywhere;
      }
      .problem {
        display: flex;
        align-items: flex-start;
        gap: var(--swc-spacing-75);
        margin-block-start: var(--swc-spacing-200);
        color: var(--swc-negative-content-color-default);
        --swc-icon-color: var(--swc-negative-content-color-default);
      }
    `,
  ];

  protected subscribe(model: SliccModel): Array<() => void> {
    const port = model.approvals;
    if (port !== this.#port) {
      this.#port = port;
      this.#showing = null;
      this.gone = null;
      this.busy = '';
      this.failure = null;
      this.#pending.clear();
      this.#done.clear();
      this.#closed.clear();
      this.#ended.clear();
      this.#full.clear();
      this.#ends.clear();
    }
    if (!port) return [];
    return [
      port.on('approvals', () => {
        this.now = Date.now();
        this.requestUpdate();
      }),
      port.on('ended', ({ id, reason }) => {
        this.#ended.set(id, reason);
        if (this.gone?.approval.id === id) {
          this.gone = reason === 'withdrawn' ? null : { ...this.gone, reason: gone(reason) };
          if (!this.gone) this.#showing = null;
        }
        this.requestUpdate();
      }),
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#tick(false);
    clearTimeout(this.#arming);
    this.#showing = null;
    this.#cuts.disconnect();
    this.#ends.disconnect();
  }

  #tick(on: boolean): void {
    if (on && !this.#timer) this.#timer = setInterval(() => (this.now = Date.now()), 1000);
    if (!on && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async decide(approval: Approval, decision: ApprovalDecision): Promise<void> {
    const port = this.model?.approvals;
    if (
      !port?.decide ||
      this.busy ||
      (decision !== 'deny' && (!this.#armed || !this.#whole(approval)))
    )
      return;
    const verdict = rulesOf(approval);
    const always = approval.kind === 'sudo' || (approval.kind !== 'tray' && approval.always);
    if (decision === 'always' && (!always || verdict.certain || verdict.maybe)) return;
    this.busy = decision;
    this.failure = null;
    this.#pending.add(approval.id);
    try {
      await port.decide(approval.id, decision);
      this.#done.add(approval.id);
    } catch (error) {
      this.failure = {
        id: approval.id,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.#pending.delete(approval.id);
      this.busy = '';
    }
  }

  #current(): Approval[] {
    return this.model?.approvals?.decide
      ? waiting(this.model, this.now).filter(({ id }) => !this.#closed.has(id))
      : [];
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const list = this.#current();
    const showing = this.#showing;
    if (showing && this.#pending.has(showing.id)) return;
    if (
      showing &&
      !this.gone &&
      !this.#done.has(showing.id) &&
      !list.some((approval) => approval.id === showing.id)
    ) {
      const reason =
        this.#ended.get(showing.id) ?? (showing.expiresAt <= this.now ? 'expired' : 'answered');
      if (reason !== 'withdrawn') this.gone = { approval: showing, reason: gone(reason) };
    }
    if (this.gone) return;
    const next = list[0] ?? null;
    if (next?.id === showing?.id) return;
    this.#showing = next;
    clearTimeout(this.#arming);
    this.#armed = false;
    this.#arming = setTimeout(() => (this.#armed = true), this.arming);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const all = this.model?.approvals?.list() ?? [];
    this.#tick(this.isConnected && all.length > 0);
    this.#cuts.measure();
    this.#ends.observe();
    const dialog = this.renderRoot.querySelector('dialog');
    const key = dialog
      ? `${dialog.dataset.approval}:${dialog.dataset.gone ?? ''}:${dialog.hasAttribute('data-rejected')}`
      : '';
    if (key === this.#shown) return;
    if (dialog && !this.#shown) this.#trigger = origin();
    this.#shown = key;
    if (!dialog) {
      if (this.#trigger?.isConnected) this.#trigger.focus();
      this.#trigger = null;
      return;
    }
    if (!dialog.open) dialog.showModal();
    this.#cuts.measure();
    this.#ends.observe();
    const first = dialog.querySelector('[data-action=deny], [data-action=close]') as LitElement;
    void first.updateComplete.then(() => first.focus());
  }

  close(): void {
    this.gone = null;
    this.#showing = null;
  }

  #dismiss(approval: Approval): void {
    this.#done.add(approval.id);
    this.#closed.add(approval.id);
    this.failure = null;
  }

  #cancel(event: Event, approval: Approval): void {
    event.preventDefault();
    if (this.gone) this.close();
    else if (this.failure?.id === approval.id) this.#dismiss(approval);
    else void this.decide(approval, 'deny');
  }

  #button(
    approval: Approval,
    decision: ApprovalDecision,
    label: string,
    variant: string
  ): TemplateResult {
    return html`<swc-button
      slot="button"
      variant=${variant}
      fill-style=${variant === 'accent' ? nothing : 'outline'}
      data-action=${decision}
      ?pending=${this.busy === decision}
      ?disabled=${!!this.busy && this.busy !== decision}
      @click=${() => this.decide(approval, decision)}
      >${label}</swc-button
    >`;
  }

  #dialog(approval: Approval, key: string, content: TemplateResult): unknown {
    return keyed(
      key,
      html`<dialog role="alertdialog" aria-labelledby="title" aria-describedby="asking" data-approval=${approval.id} data-kind=${approval.kind} data-requester=${approval.requester.kind} data-gone=${this.gone?.reason ?? nothing} data-rejected=${!this.gone && this.failure?.id === approval.id ? '' : nothing} @cancel=${(event: Event) => this.#cancel(event, approval)}>${content}</dialog>`
    );
  }

  #whole(approval: Approval): boolean {
    const { id } = approval;
    if (truncated(approval)) return false;
    return (
      !approved(approval) ||
      this.#cuts.get(id) === false ||
      (this.#full.has(id) && this.#ends.has(id))
    );
  }

  #gate(approval: Approval): string {
    if (truncated(approval)) return tooLong;
    if (this.#whole(approval)) return '';
    return this.#full.has(approval.id) ? toScroll : toShow;
  }

  #expand(id: string): void {
    if (!this.#full.delete(id)) this.#full.add(id);
    this.requestUpdate();
  }

  #command(approval: Approval, pending: boolean): TemplateResult {
    const { id } = approval;
    const text = approved(approval);
    if (!text) return html`<p class="hint" data-id="no-details">This request has no details.</p>`;
    const full = !pending || this.#full.has(id);
    const toggle =
      pending && (full || this.#cuts.get(id)) ? fullCommand(full, () => this.#expand(id)) : nothing;
    return html`<pre class="command" data-command=${approval.kind === 'sudo' ? '' : nothing} data-summary=${approval.kind === 'sudo' ? nothing : ''}><span class="lines" data-clamp=${full ? nothing : id}>${text}${pending ? html`<span class="end" data-end=${id}></span>` : nothing}</span></pre>${toggle}`;
  }

  #request(approval: Approval, pending = false): TemplateResult {
    if (approval.kind === 'tray') return html`<p id="asking">${trayAsking(approval)}</p>`;
    if (approval.kind === 'sudo')
      return html`<p id="asking">${asking(approval)}:</p>
        ${this.#command(approval, pending)}`;
    if (approval.kind === 'guest-tool')
      return html`<p id="asking">${guestAsking(approval)}</p>
        ${this.#command(approval, pending)}`;
    const files = approval.attachments ?? [];
    return html`<p id="asking">${guestAsking(approval)}</p>
      <div class="guest" data-guest-text>${approval.text}</div>
      ${files.length ? html`<ul class="files" data-attachments>${files.map((file) => html`<li>${file.name} · ${file.mimeType} · ${size(file.size)}</li>`)}</ul>` : nothing}`;
  }

  #verdict(approval: Approval): TemplateResult | typeof nothing {
    const verdict =
      approval.kind === 'sudo' || approval.kind === 'tray' ? undefined : approval.verdict;
    return verdict
      ? html`<p class="verdict" data-verdict=${verdict.decision}>${verdict.decision === 'unsure' ? 'The automatic check wasn’t sure' : `The automatic check would ${verdict.decision} this`}: ${verdict.reason}</p>`
      : nothing;
  }

  #actions(approval: Approval, rejected: boolean, always: boolean): TemplateResult {
    if (rejected)
      return html`<swc-button slot="button" variant="secondary" fill-style="outline" data-action="close" @click=${() => this.#dismiss(approval)}>Close</swc-button>`;
    const whole = this.#whole(approval);
    return html`${this.#button(approval, 'deny', 'Deny', 'secondary')}
      ${whole && always ? this.#button(approval, 'always', inCwd(approval) ? 'Always allow in this directory' : 'Always allow', 'secondary') : nothing}
      ${whole ? this.#button(approval, 'once', 'Allow once', 'accent') : nothing}`;
  }

  render(): unknown {
    if (this.gone) {
      const { approval, reason } = this.gone;
      return this.#dialog(
        approval,
        `gone:${approval.id}`,
        html`<sp-alert-dialog variant="information" data-approval-kind=${approval.kind}>
          <h2 id="title" slot="heading">${titles[approval.kind][reason]}</h2>
          ${this.#request(approval)}
          ${reason === 'expired' ? html`<p class="timer" data-timer>Denied because nobody answered in time.</p>` : nothing}
          <swc-button slot="button" variant="secondary" fill-style="outline" data-action="close" @click=${() => this.close()}>Close</swc-button>
        </sp-alert-dialog>`
      );
    }
    const held = this.#showing && this.#pending.has(this.#showing.id) ? this.#showing : null;
    const list = this.#current();
    const [approval, ...rest] = held ? [held, ...list.filter(({ id }) => id !== held.id)] : list;
    if (!approval) return nothing;
    const failure = this.failure?.id === approval.id ? this.failure.message : '';
    const verdict = rulesOf(approval);
    const rules = verdict.certain ?? verdict.maybe;
    const always = approval.kind !== 'tray' && approval.always && !rules;
    const gate = this.#gate(approval);
    const hint = always && this.#whole(approval) ? hintOf(approval) : '';
    return this.#dialog(
      approval,
      approval.id,
      html`<sp-alert-dialog variant="warning" data-approval-kind=${approval.kind}>
          <h2 id="title" slot="heading">${title(approval)}</h2>
          ${this.#request(approval, true)}
          ${this.#verdict(approval)}
          ${approval.kind === 'sudo' && approval.cwd ? html`<p class="cwd">In ${approval.cwd}</p>` : nothing}
          ${rules ? html`<div class="rules" data-secret-rules=${rules}><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><p>${verdict.certain ? html`<strong>This changes secret rules.</strong> It names <code>${rules}</code>, where SLICC keeps which secrets programs may use and where they may be sent.` : html`<strong>This may change secret rules.</strong> SLICC can't tell where <code>${rules}</code> leads, and it could reach the files where SLICC keeps which secrets programs may use and where they may be sent.`} Allow it only if you asked for this change.</p></div>` : nothing}
          ${hint ? html`<p class="hint">${hint}</p>` : nothing}
          ${!failure && gate ? html`<p class="hint" data-allow-hint>${gate}</p>` : nothing}
          ${failure ? html`<p class="problem" role="alert" data-error><swc-icon-alert-triangle size="s" aria-hidden="true"></swc-icon-alert-triangle><span>${failure}</span></p>` : html`<p class="timer" data-timer>Denied automatically in ${countdown(approval.expiresAt - this.now)}.</p>`}
          ${rest.length ? html`<p class="more" data-more>${rest.length === 1 ? '1 more request is waiting.' : `${rest.length} more requests are waiting.`}</p>` : nothing}
          ${this.#actions(approval, !!failure, always)}
        </sp-alert-dialog>`
    );
  }
}
