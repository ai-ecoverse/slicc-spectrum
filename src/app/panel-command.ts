import type { SliccDock } from '../components/dock.ts';
import type { Agent, SliccModel, Sprinkle } from '../model/types.ts';
import {
  chats,
  type Direction,
  destination,
  type Placement,
  type ScreenClass,
  type Side,
  type Surface,
  terminalPanel,
  terminalTitle,
} from './panels.ts';

export type PanelKind = 'surface' | 'chat' | 'terminal' | 'sprinkle' | 'file' | 'diff';

export interface PanelInfo {
  id: string;
  title: string;
  kind: PanelKind;
  side: Side;
  agent: string | null;
  open: boolean;
  visible: boolean;
  active: boolean;
  busy: string | null;
}

export type PanelPlace = Side | { direction: Direction; ref: string };

export interface PanelResult {
  code: 0 | 1 | 2 | 5;
  message: string;
}

export interface PanelOpenOptions {
  place?: PanelPlace;
  section?: string;
}

export interface PanelsHost {
  dock(): SliccDock;
  screen(): ScreenClass;
  model(): SliccModel | null | undefined;
  surfaces(): readonly Surface[];
  sprinkles(): readonly Sprinkle[];
  open(id: string, focus: boolean, section?: string): void;
  reset(): void;
  typing(): boolean;
}

export interface PanelCaller {
  agentId: string | null;
  cone?: string | null;
  readOnly?: boolean;
}

export interface PanelOutput {
  stdout: string;
  stderr: string;
  code: number;
}

const userCloseWindow = 60_000;

const positions: Record<Direction, 'left' | 'right' | 'top' | 'bottom' | 'center'> = {
  left: 'left',
  right: 'right',
  above: 'top',
  below: 'bottom',
  within: 'center',
};

const ok = (message: string): PanelResult => ({ code: 0, message });
const refused = (message: string): PanelResult => ({ code: 5, message });
const unknown = (id: string): PanelResult => ({
  code: 1,
  message: `no panel called ${id}; panel list shows the ids you can use`,
});

export class Panels {
  #host: PanelsHost;
  #quiet = 0;
  #closed = new Map<string, number>();

  constructor(host: PanelsHost) {
    this.#host = host;
  }

  quietly<T>(run: () => T): T {
    this.#quiet++;
    try {
      return run();
    } finally {
      this.#quiet--;
    }
  }

  closed(id: string): void {
    if (this.#quiet === 0) this.#closed.set(id, Date.now());
  }

  closedAgo(id: string): number | null {
    const at = this.#closed.get(id);
    if (at === undefined) return null;
    const ago = Date.now() - at;
    return ago < userCloseWindow ? ago : null;
  }

  typing(): boolean {
    return this.#host.typing();
  }

  agents(): readonly Agent[] {
    return this.#host.model()?.agent.list() ?? [];
  }

  active(): string | null {
    return this.#host.model()?.agent.active() ?? null;
  }

  list(): PanelInfo[] {
    const host = this.#host;
    const surfaces = host.surfaces();
    const offers = (id: string) => surfaces.some((item) => item.id === id);
    const rows: Array<Omit<PanelInfo, 'open' | 'visible' | 'active' | 'busy'>> = [
      ...surfaces
        .filter((item) => item.id !== 'chat' && item.id !== 'terminal')
        .map((item) => ({
          id: item.id,
          title: item.title,
          kind: 'surface' as const,
          side: item.side,
          agent: null,
        })),
      ...(offers('chat') ? this.agents() : []).map((agent) => ({
        id: `chat:${agent.id}`,
        title: agent.name,
        kind: 'chat' as const,
        side: 'center' as const,
        agent: agent.id,
      })),
      ...(offers('terminal') ? (host.model()?.terminals.list() ?? []) : []).map((info) => ({
        id: terminalPanel(info.id),
        title: terminalTitle(info),
        kind: 'terminal' as const,
        side: 'right' as const,
        agent: null,
      })),
      ...host.sprinkles().map((sprinkle) => ({
        id: `sprinkle:${sprinkle.id}`,
        title: sprinkle.title,
        kind: 'sprinkle' as const,
        side: 'right' as const,
        agent: sprinkle.id.includes('/') ? sprinkle.agentId : null,
      })),
      ...host
        .dock()
        .api.panels.filter((panel) => /^(file|diff):/.test(panel.id))
        .map((panel) => ({
          id: panel.id,
          title: panel.title ?? panel.id,
          kind: panel.id.slice(0, panel.id.indexOf(':')) as PanelKind,
          side: 'center' as const,
          agent: null,
        })),
    ];
    return rows.map((row) => this.#state(row));
  }

  #state(row: Omit<PanelInfo, 'open' | 'visible' | 'active' | 'busy'>): PanelInfo {
    const dock = this.#host.dock();
    const panel = dock.api.getPanel(row.id);
    const content = dock.content(row.id) as { busyReason?: string | null } | undefined;
    return {
      ...row,
      open: panel !== undefined,
      visible: panel?.api.isVisible === true,
      active: panel !== undefined && dock.api.activePanel?.id === row.id,
      busy: content?.busyReason ?? null,
    };
  }

  find(id: string): PanelInfo | undefined {
    const listed = this.list().find((info) => info.id === id);
    if (listed) return listed;
    const document = id.match(/^(file|diff):(.+)$/);
    if (!document) return undefined;
    return this.#state({
      id,
      title: id,
      kind: document[1] as PanelKind,
      side: 'center',
      agent: null,
    });
  }

  open(id: string, options: PanelOpenOptions = {}): PanelResult {
    return this.#show(id, false, options);
  }

  focus(id: string, options: PanelOpenOptions = {}): PanelResult {
    return this.#show(id, true, options);
  }

  #show(id: string, focus: boolean, { place, section }: PanelOpenOptions): PanelResult {
    const info = this.find(id);
    if (!info) return unknown(id);
    const bad = this.#reference(id, place);
    if (bad) return bad;
    this.quietly(() => this.#host.open(id, focus, section));
    if (place) {
      const moved = this.move(id, place);
      if (moved.code !== 0) return moved;
    }
    return ok(`${focus ? 'focused' : info.open ? 'showed' : 'opened'} ${id}`);
  }

  close(id: string): PanelResult {
    const info = this.find(id);
    if (!info) return unknown(id);
    if (!info.open) return ok(`${id} was already closed`);
    if (info.kind === 'terminal')
      return refused(`closing ${id} stops its shell; ask the user to close it`);
    if (info.kind === 'chat' && chats(this.#host.dock()).length === 1)
      return refused(`${id} is the last chat, so it stays open`);
    if (info.busy) return refused(`${id} is busy: ${info.busy}`);
    this.quietly(() => this.#host.dock().close(id));
    return ok(`closed ${id}`);
  }

  move(id: string, place: PanelPlace): PanelResult {
    const info = this.find(id);
    if (!info) return unknown(id);
    const bad = this.#reference(id, place);
    if (bad) return bad;
    const dock = this.#host.dock();
    if (!info.open) this.quietly(() => this.#host.open(id, false));
    if (!dock.has(id)) return unknown(id);
    if (this.#host.screen() === 'phone')
      return ok(`phones show one panel at a time, so ${id} stays where it is`);
    if (info.busy) return refused(`${id} is busy: ${info.busy}`);
    const target: Placement =
      typeof place === 'string'
        ? destination(dock, id, place, this.#host.screen())
        : { position: { referencePanel: place.ref, direction: place.direction } };
    const reference = target.position && dock.api.getPanel(target.position.referencePanel);
    if (!reference || !target.position) return ok(`${id} is the only panel, so it stays`);
    const position = positions[target.position.direction];
    const panel = dock.api.getPanel(id);
    this.quietly(() => panel?.api.moveTo({ group: reference.group, position }));
    return ok(`moved ${id}`);
  }

  #reference(id: string, place: PanelPlace | undefined): PanelResult | null {
    if (typeof place !== 'object') return null;
    if (place.ref === id) return { code: 2, message: `can't place ${id} beside itself` };
    if (!this.#host.dock().has(place.ref)) return { code: 1, message: `${place.ref} isn't open` };
    return null;
  }

  reset(): PanelResult {
    const busy = this.list().find((info) => info.open && info.busy);
    if (busy) return refused(`${busy.id} is busy: ${busy.busy}`);
    this.quietly(() => this.#host.reset());
    return ok('restored the default layout');
  }
}

const help = `usage: panel <command>

  list [--json]              the panels you can reach, and their state
  open <id> [place]          show a panel; keyboard focus stays where it is
  focus <id> [place]         show a panel and give it keyboard focus
  close <id>                 close a panel
  move <id> <place>          move an open panel
  reset                      restore the default layout

place: left | center | right, or --left | --right | --above | --below | --within <id>
open and focus also take --section <name>, e.g. panel open settings --section accounts

ids: the ones panel list shows, e.g. files, changes, terminal, monitor, settings,
     chat (your cone's chat), chat:<agent>, terminal:<n>, sprinkle:<name>,
     file:<path>, diff:<path>
`;

const verbs = new Set(['list', 'open', 'focus', 'close', 'move', 'reset']);
const sides = new Set<string>(['left', 'center', 'right']);
const directions = new Set<string>(['left', 'right', 'above', 'below', 'within']);

interface Parsed {
  verb: string;
  id?: string;
  place?: PanelPlace;
  section?: string;
  json: boolean;
}

function scan(parsed: Parsed, rest: readonly string[], positional: string[]): string | null {
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    const flag = arg.startsWith('--') ? arg.slice(2) : null;
    if (flag === 'json') parsed.json = true;
    else if (flag === 'section' || (flag !== null && directions.has(flag))) {
      const value = rest[++index];
      if (value === undefined) return `--${flag} needs a value`;
      if (flag === 'section') parsed.section = value;
      else if (parsed.place) return 'give one place';
      else parsed.place = { direction: flag as Direction, ref: value };
    } else if (arg.startsWith('-')) return `unknown option ${arg}`;
    else positional.push(arg);
  }
  const [id, side, ...extra] = positional;
  if (extra.length > 0) return `unexpected ${extra[0]}`;
  parsed.id = id;
  if (side === undefined) return null;
  if (!sides.has(side)) return `${side} isn't a place; use left, center or right`;
  if (parsed.place) return 'give one place';
  parsed.place = side as Side;
  return null;
}

function check({ verb, id, json, section, place }: Parsed): string | null {
  const ids = verb === 'list' || verb === 'reset' ? 0 : 1;
  if ((id === undefined ? 0 : 1) !== ids)
    return ids ? `${verb} needs an id` : `${verb} takes no id`;
  if (json && verb !== 'list') return '--json is for list';
  if (section !== undefined && verb !== 'open' && verb !== 'focus')
    return '--section is for open and focus';
  if (place && verb !== 'open' && verb !== 'focus' && verb !== 'move')
    return `${verb} takes no place`;
  if (verb === 'move' && !place) return 'move needs a place';
  return null;
}

function parse(args: readonly string[]): Parsed | string {
  const [verb, ...rest] = args;
  if (!verbs.has(verb)) return `unknown command ${verb}`;
  const parsed: Parsed = { verb, json: false };
  return scan(parsed, rest, []) ?? check(parsed) ?? parsed;
}

function coneOf(agents: readonly Agent[], id: string | null | undefined): string | null {
  let agent = agents.find((candidate) => candidate.id === id);
  const seen = new Set<Agent>();
  while (agent && agent.kind !== 'cone' && !seen.has(agent)) {
    seen.add(agent);
    agent = agents.find((candidate) => candidate.id === agent?.parentId);
  }
  return agent?.kind === 'cone' ? agent.id : null;
}

function resolve(
  panels: Panels,
  raw: string,
  reachable: readonly PanelInfo[],
  cone: string | null | undefined
): string | null {
  if (/^(file|diff):./.test(raw)) return raw;
  if (raw === 'chat') {
    const agent = cone === undefined ? panels.active() : cone;
    return reachable.some((info) => info.id === `chat:${agent}`) ? `chat:${agent}` : null;
  }
  if (raw === 'terminal') {
    const terminals = reachable.filter((info) => info.kind === 'terminal');
    const picked =
      terminals.find((info) => info.active) ??
      terminals.filter((info) => info.open).at(-1) ??
      terminals[0];
    return picked?.id ?? null;
  }
  if (reachable.some((info) => info.id === raw)) return raw;
  const name = raw.startsWith('sprinkle:') ? raw.slice(9) : raw;
  const sprinkles = reachable.filter((info) => info.kind === 'sprinkle');
  const found =
    sprinkles.find((info) => info.id === `sprinkle:${name}`) ??
    sprinkles.find((info) => cone && info.id === `sprinkle:${cone}/${name}`) ??
    sprinkles.find((info) => info.id.split('/').at(-1) === name);
  return found?.id ?? null;
}

function state(info: PanelInfo): string {
  const shown = info.active ? 'active' : info.visible ? 'shown' : info.open ? 'open' : 'closed';
  return info.busy ? `${shown} · busy: ${info.busy}` : shown;
}

function table(rows: readonly PanelInfo[]): string {
  const lines = [['ID', 'TITLE', 'STATE'], ...rows.map((row) => [row.id, row.title, state(row)])];
  const widths = [0, 1].map((column) => Math.max(...lines.map((line) => line[column].length)));
  return lines
    .map(([id, title, shown]) => `${id.padEnd(widths[0])}  ${title.padEnd(widths[1])}  ${shown}`)
    .join('\n');
}

const done = (result: PanelResult, note = ''): PanelOutput =>
  result.code === 0
    ? { stdout: `${result.message}${note}\n`, stderr: '', code: 0 }
    : { stdout: '', stderr: `panel: ${result.message}\n`, code: result.code };

interface Scope {
  panels: Panels;
  agent: boolean;
  cone: string | null | undefined;
  reachable: readonly PanelInfo[];
}

function act(scope: Scope, parsed: Parsed): PanelOutput {
  const { panels, reachable, cone } = scope;
  if (parsed.verb === 'reset') return done(panels.reset());
  const raw = parsed.id as string;
  const id = resolve(panels, raw, reachable, cone);
  if (!id) return done(unknown(raw));
  let place = parsed.place;
  if (typeof place === 'object') {
    const ref = resolve(panels, place.ref, reachable, cone);
    if (!ref) return done(unknown(place.ref));
    place = { ...place, ref };
  }
  if (parsed.verb === 'close') return done(panels.close(id));
  const ago = scope.agent && !panels.find(id)?.open ? panels.closedAgo(id) : null;
  if (ago !== null)
    return refusedOutput(
      `the user closed ${id} ${Math.round(ago / 1000)} s ago; ask before opening it again`
    );
  if (parsed.verb === 'move') return done(panels.move(id, place as PanelPlace));
  const options = { place, section: parsed.section };
  if (parsed.verb === 'open') return done(panels.open(id, options));
  if (scope.agent && panels.typing())
    return done(
      panels.open(id, options),
      '; the user is typing, so it was shown without taking focus'
    );
  return done(panels.focus(id, options));
}

export function panelCommand(
  app: { panels: Panels },
  argv: readonly string[],
  caller: PanelCaller
): PanelOutput {
  const panels = app.panels;
  const args = argv[0] === 'panel' ? argv.slice(1) : argv;
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help')
    return { stdout: help, stderr: '', code: 0 };
  if (caller.readOnly && args[0] !== 'list')
    return refusedOutput('this page only follows SLICC; panel list is all it allows');
  const parsed = parse(args);
  if (typeof parsed === 'string')
    return { stdout: '', stderr: `panel: ${parsed}\n\n${help}`, code: 2 };
  const agents = panels.agents();
  const scoped = caller.agentId !== null || !!caller.cone;
  const cone = scoped ? (caller.cone ?? coneOf(agents, caller.agentId)) : undefined;
  const reachable = panels
    .list()
    .filter(
      (info) => !scoped || info.agent === null || (!!cone && coneOf(agents, info.agent) === cone)
    );
  if (parsed.verb !== 'list')
    return act({ panels, agent: caller.agentId !== null, cone, reachable }, parsed);
  const body = parsed.json ? JSON.stringify(reachable, null, 2) : table(reachable);
  return { stdout: `${body}\n`, stderr: '', code: 0 };
}

function refusedOutput(message: string): PanelOutput {
  return { stdout: '', stderr: `panel: ${message}\n`, code: 5 };
}
