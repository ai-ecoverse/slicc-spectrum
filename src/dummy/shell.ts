import type { TerminalBackend, TerminalSession, TerminalSignal, TerminalSink } from '../backend.ts';
import type { FilePort } from '../model/types.ts';
import type { Clock } from './clock.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const home = '/home/user';

export function resolve(cwd: string, target: string): string {
  const path = target === '~' || target.startsWith('~/') ? home + target.slice(1) : target;
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return `/${out.join('/')}`;
}

function shorten(cwd: string): string {
  return cwd === home || cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}

type Command = (args: string[]) => Promise<void> | void;

export class FakeShell implements TerminalSession {
  #sink: TerminalSink;
  #files: FilePort;
  #clock: Clock;
  #line = '';
  #escape = false;
  #busy = false;
  #interrupted = false;
  #history: string[] = [];
  #commands: Record<string, Command>;
  #onCwd: ((cwd: string) => void) | undefined;
  cwd: string;
  closed = false;

  constructor(
    sink: TerminalSink,
    files: FilePort,
    cwd: string,
    clock: Clock,
    onCwd?: (cwd: string) => void
  ) {
    this.#sink = sink;
    this.#files = files;
    this.#clock = clock;
    this.cwd = cwd;
    this.#onCwd = onCwd;
    this.#commands = {
      help: () => this.#print('Commands: cat cd clear date echo exit git help ls npm pwd whoami'),
      pwd: () => this.#print(this.cwd),
      whoami: () => this.#print('user'),
      date: () => this.#print(new Date().toUTCString()),
      echo: (args) => this.#print(args.join(' ')),
      clear: () => this.#out('\x1b[2J\x1b[H'),
      exit: () => this.#exit(),
      cd: (args) => this.#cd(args[0] ?? '~'),
      ls: (args) => this.#ls(args.filter((arg) => !arg.startsWith('-'))[0] ?? '.'),
      cat: (args) => this.#cat(args),
      git: (args) => this.#git(args[0]),
      npm: (args) => this.#npm(args[0]),
    };
    this.#prompt();
  }

  #out(text: string): void {
    this.#sink.output(encoder.encode(text));
  }

  #print(text: string): void {
    this.#out(`${text.replace(/\n/g, '\r\n')}\r\n`);
  }

  #prompt(): void {
    this.#out(`\x1b[1;32muser@slicc\x1b[0m:\x1b[1;34m${shorten(this.cwd)}\x1b[0m$ `);
  }

  #exit(): void {
    this.closed = true;
    this.#sink.exit(0);
  }

  async #entries(): Promise<Map<string, 'file' | 'directory'>> {
    return new Map((await this.#files.list()).map((entry) => [entry.path, entry.kind]));
  }

  async #cd(target: string): Promise<void> {
    const path = resolve(this.cwd, target);
    if (path === '/' || (await this.#entries()).get(path) === 'directory') {
      this.cwd = path;
      this.#onCwd?.(path);
    } else this.#print(`bash: cd: ${target}: No such file or directory`);
  }

  async #ls(target: string): Promise<void> {
    const path = resolve(this.cwd, target);
    const entries = await this.#entries();
    const prefix = path === '/' ? '/' : `${path}/`;
    const names = [...entries]
      .filter(
        ([candidate]) =>
          candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/')
      )
      .map(([candidate, kind]) => {
        const name = candidate.slice(prefix.length);
        return kind === 'directory' ? `\x1b[1;34m${name}\x1b[0m` : name;
      });
    if (path !== '/' && !entries.has(path))
      this.#print(`ls: cannot access '${target}': No such file or directory`);
    else if (names.length > 0) this.#print(names.join('  '));
  }

  async #cat(args: string[]): Promise<void> {
    for (const arg of args) {
      const text = await this.#files.read(resolve(this.cwd, arg)).catch(() => null);
      if (text === null) this.#print(`cat: ${arg}: No such file or directory`);
      else this.#out(text.replace(/\n/g, '\r\n'));
    }
  }

  #git(sub: string | undefined): void {
    if (sub !== 'status') {
      this.#print('usage: git status');
      return;
    }
    const changes = this.#files.changes();
    this.#print('On branch main');
    if (changes.length === 0) {
      this.#print('nothing to commit, working tree clean');
      return;
    }
    this.#print('Changes not staged for commit:');
    const colors = { added: 32, modified: 33, deleted: 31 };
    for (const change of changes) {
      this.#print(`\t\x1b[${colors[change.status]}m${change.status}:   ${change.path}\x1b[0m`);
    }
  }

  async #npm(sub: string | undefined): Promise<void> {
    if (sub !== 'test') {
      this.#print('usage: npm test');
      return;
    }
    const lines = [
      '> harbor@0.0.0 test',
      '> node --test test/',
      '',
      '\x1b[32m✔\x1b[0m converts both ways \x1b[90m(0.6ms)\x1b[0m',
      '\x1b[32m✔\x1b[0m expires entries from the previous day \x1b[90m(0.4ms)\x1b[0m',
      '\x1b[32m✔\x1b[0m retries upstream timeouts \x1b[90m(3.1ms)\x1b[0m',
      'ℹ tests 3',
      'ℹ pass 3',
      'ℹ fail 0',
    ];
    for (const line of lines) {
      await this.#clock.sleep(2);
      if (this.closed || this.#interrupted) return;
      this.#print(line);
    }
  }

  async #run(line: string): Promise<void> {
    const [name, ...args] = line.trim().split(/\s+/);
    if (!name) return;
    this.#history.push(line);
    const command = this.#commands[name];
    if (command) await command(args);
    else this.#print(`bash: ${name}: command not found`);
  }

  #key(char: string): void {
    if (this.#escape) {
      this.#escape = !/[A-Za-z~]/.test(char) || char === '[';
      return;
    }
    if (char === '\x1b') this.#escape = true;
    else if (char === '\r') this.#enter();
    else if (char === '\x7f') this.#backspace();
    else if (char === '\x03') this.signal('SIGINT');
    else if (char === '\x0c') {
      this.#out('\x1b[2J\x1b[H');
      this.#prompt();
      this.#out(this.#line);
    } else if (char >= ' ') {
      this.#line += char;
      this.#out(char);
    }
  }

  #backspace(): void {
    if (!this.#line) return;
    this.#line = [...this.#line].slice(0, -1).join('');
    this.#out('\b \b');
  }

  #enter(): void {
    const line = this.#line;
    this.#line = '';
    this.#out('\r\n');
    this.#busy = true;
    this.#interrupted = false;
    void this.#run(line).then(() => {
      this.#busy = false;
      if (!this.closed) this.#prompt();
    });
  }

  history(): readonly string[] {
    return this.#history;
  }

  write(data: Uint8Array): void {
    if (this.closed) return;
    const text = decoder.decode(data);
    if (!this.#busy) for (const char of text) this.#key(char);
    else if (text.includes('\x03')) this.signal('SIGINT');
  }

  resize(): void {}

  signal(name: TerminalSignal): void {
    if (name === 'SIGHUP') {
      this.#exit();
      return;
    }
    this.#line = '';
    this.#interrupted = this.#busy;
    this.#out('^C\r\n');
    if (!this.#busy) this.#prompt();
  }

  close(): void {
    this.closed = true;
  }
}

export function shellBackend(
  files: FilePort,
  cwd: string,
  clock: Clock,
  onCwd?: (cwd: string) => void
): TerminalBackend {
  return { open: (sink) => new FakeShell(sink, files, cwd, clock, onCwd) };
}
