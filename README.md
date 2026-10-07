# slicc-spectrum

Web components for SLICC: `<slicc-terminal>`, and SLICC's app UI on [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) (see [UI](#ui)). `<slicc-terminal>` is a terminal built on [wterm](https://github.com/vercel-labs/wterm) (`@wterm/dom` 0.5.4, Zig/WASM VT core) that talks to [`@ai-ecoverse/slicc-kernel`](https://github.com/ai-ecoverse/slicc-kernel) through a small backend interface. It is a standards custom element with no framework and no shadow root, so it can move to a shared web-components repo unchanged.

```html
<slicc-terminal></slicc-terminal>
<script type="module">
  import './dist/slicc-terminal.js';

  const terminal = document.querySelector('slicc-terminal');
  terminal.backend = myBackend;
  await terminal.ready;
  terminal.focus();
</script>
```

## Element

| | |
| :--- | :--- |
| `backend` | A `TerminalBackend`. Setting it closes the current session and opens a new one. |
| `cols`, `rows` attributes | Fixed grid size. Without either, the grid fits the element and follows its size. |
| `ready` | Promise that resolves with the element once wterm has mounted and the session is open. Rejects if either fails. Setting `backend` or removing the element replaces it with a fresh promise, and anyone still waiting on the old one gets the new outcome. |
| `cols`, `rows` properties | Current grid size. |
| `resize(cols, rows)` | Sets both attributes and resizes once. |
| `fit()` | Removes both attributes and fits the grid to the element. |
| `send(data)` | Sends a string or bytes to the backend, as if typed. |
| `write(data)` | Writes a string or bytes to the screen without involving the backend. |
| `signal(name)` | Sends `SIGINT`, `SIGTSTP`, `SIGQUIT` or `SIGHUP` to the backend. |
| `readText()` | Resolves with the text of the scrollback and the screen. |
| `focus()` | Focuses the terminal input. |

Events, all `CustomEvent`s with the payload in `detail`: `ready` `{cols, rows}`, `resize` `{cols, rows}`, `exit` `{status}`, `title` `{title}`, `bell` `{count}`, `error` `{error}`.

Removing the element closes the session and destroys the screen. Adding it again mounts a fresh screen and opens a new session on the same backend.

## Backend interface

```ts
interface TerminalBackend {
  open(sink: TerminalSink, size: { cols: number; rows: number }): TerminalSession | Promise<TerminalSession>;
}

interface TerminalSink {
  output(data: Uint8Array): void;
  exit(status: number): void;
}

interface TerminalSession {
  write(data: Uint8Array): void;
  resize(cols: number, rows: number): void;
  signal?(name: 'SIGINT' | 'SIGTSTP' | 'SIGQUIT' | 'SIGHUP'): void;
  close(): void;
}
```

Keystrokes reach `write` as the bytes a terminal would send: UTF-8 text, `\r` for Enter, `0x03` for Ctrl+C, escape sequences for arrows and function keys, and bracketed paste when the application has turned it on. Pasted `\r\n` and `\n` line breaks are sent as `\r`, as xterm.js does, in both plain and bracketed paste. The backend's line discipline turns `0x03`, `0x1a` and `0x1c` into signals, as a real pty does. `signal()` is optional. Without it, `terminal.signal()` writes the matching control byte instead, and `SIGHUP` is dropped. Output may arrive in chunks of any size and split anywhere, including inside UTF-8 sequences and escape sequences. While `open()` is pending, input (keystrokes, `send()` and wterm's automatic replies) is buffered and written in order once the session opens. If that open fails or is superseded, the buffer is dropped.

### slicc-kernel

`kernelBackend(kernel, { argv, cwd, env })` adapts slicc-kernel's terminal API to the interface above. `argv` defaults to `['bash', '-i']`. It is typed structurally, so this package doesn't depend on slicc-kernel. If the session fails, its error message is printed and `exit` reports status 1.

```js
import { createKernel } from './node_modules/@ai-ecoverse/slicc-kernel/dist/index.js';
import { kernelBackend } from './dist/slicc-terminal.js';

const kernel = await createKernel({ root: await navigator.storage.getDirectory() });
document.querySelector('slicc-terminal').backend = kernelBackend(kernel, { cwd: '/home' });
```

## Theming

The element sets wterm's `--term-*` variables from its own custom properties, so you can set them on the element or on any ancestor.

| Property | Default |
| :--- | :--- |
| `--slicc-terminal-background` | `#1d1d1d` |
| `--slicc-terminal-foreground` | `#d4d4d4` |
| `--slicc-terminal-cursor` | `#aeafad` |
| `--slicc-terminal-color-0` … `--slicc-terminal-color-15` | wterm's palette |
| `--slicc-terminal-font-family` | `"Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace` |
| `--slicc-terminal-font-size` | `14px` |
| `--slicc-terminal-line-height` | `1.2` |
| `--slicc-terminal-padding` | `8px` |
| `--slicc-terminal-height` | `360px` (ignored when `rows` is set) |
| `--slicc-terminal-border-radius` | `4px` |

The stylesheet (wterm's plus the theme) is constructed once per document and adopted into the document or shadow root the element is connected to. That includes iframes the element is moved into.

## Distribution

`npm run build` writes `dist/slicc-terminal.js` (one ESM bundle with no bare imports), its source map and `dist/wterm.wasm`. The bundle loads the WASM with `new URL('./wterm.wasm', import.meta.url)`, so `dist/` works from any path, including from OPFS through the slicc-bios service worker. wterm's base64-inlined copy of the WASM is left out of the bundle. TypeScript declarations go to `dist/types/`, and the package's `types` export points at them. Set `SliccTerminal.wasmUrl` before the first element connects to load it from elsewhere.

## wterm notes

Things found while building this against wterm 0.5.4, recorded here, not pushed upstream:

- The Zig core maps 24-bit colours (`38;2;r;g;b`) to the nearest of the 256 palette colours, and the DOM renderer draws the 6×6×6 cube in steps of 51 rather than xterm's 0/95/135/175/215/255. `@wterm/ghostty` is the full-VT alternative.
- wterm sends pasted text with its `\n` line breaks unchanged, whereas xterm.js turns them into `\r`. The element does that conversion itself.
- `@wterm/core` always ships the WASM inlined as base64 behind a dynamic import. A build without it, or an explicit entry point that takes a URL, would save the bundler plugin.
- wterm focuses its input when it finishes mounting. `<slicc-terminals>` hands focus back to where it was unless the terminal was focused on purpose.
- wterm reads focus and selection from `ownerDocument` (`activeElement`, `getSelection()`), so selection and copy don't work inside a shadow root that wterm itself owns. That's why the element renders in light DOM. It still works when the element is placed inside someone else's shadow root.

## UI

`dist/slicc-ui.js` is SLICC's app shell on Spectrum Web Components 1.12 with the Spectrum 2 theme (`<sp-theme system="spectrum-two">`), in light and dark. It runs against a typed model, not against the kernel, the agent or the browser directly. `dist/slicc-dummy.js` provides a dummy model that streams replies and tool calls with timers, and `dist/slicc-kernel-model.js` a real one for files and terminals on slicc-kernel (see [Kernel model](#kernel-model)).

```html
<slicc-app></slicc-app>
<script type="module">
  import { createDummyModel } from './dist/slicc-dummy.js';
  import './dist/slicc-ui.js';

  document.querySelector('slicc-app').model = createDummyModel({ storage: localStorage });
</script>
```

`npm start` serves it at `/ui/`. `?fonts=<url>` loads Adobe Clean from another folder (see [Fonts](#fonts)).

### Layouts and rails

The layout follows the width of `<slicc-app>`, which it reflects as its `screen` attribute: `phone` (under 640 px) has one column, `tablet` (under 1200 px) two, `desktop` three, like SLICC v6. Each screen class starts with few panels open and saves its own layout (`slicc-ui.layout.<screen>`). Every surface has a home side, left, center or right. Closed panels wait as icons in the left and right rails (on a phone, in one bar at the bottom); one click puts a panel back on its side, next to its neighbours.

`surfaces` on `<slicc-app>` (default: every surface, exported as `surfaces`) is what the app offers: the panels it can open, the View menu, the rails and `Alt+1…9`. A saved layout with a panel it doesn't offer is dropped for the default. An embedder can pass a subset with its own `open` per screen class. The agent picker, the tray and the agent part of the status bar show only when `chat` is offered, the change count only with `changes`, and the settings button only with `settings`. Elements with `slot="status"` go into the status bar, after the built-in items.

### Fonts

Text is Adobe Clean and code Spectrum's Source Code Pro. Source Code Pro (OFL) is in `dist/fonts/`, same origin. Adobe Clean can't ship in a public package, so `<slicc-app>` loads it from `fontBase` (`AdobeClean-{Regular,Medium,Bold,ExtraBold}.otf`), which defaults to `/fonts/` on the current origin. Every `*.sliccy.ai` host passes it through to v6, and `npm start` proxies it from `seven.sliccy.ai`. Where it 404s, text falls back to the system font stack. `?delay=` sets the dummy's tick in milliseconds (default 30) , `?color=light|dark|system` the theme, and `?grammars=` the grammar base.

### Elements

| Element | |
| :--- | :--- |
| `<slicc-app>` | The shell: header with the agent picker, the View menu and the theme switch, rails, a `<slicc-dock>`, and a status bar. Saves the dock layout per screen class to `storage` (default `localStorage`) under `layoutKey`. |
| `<slicc-dock>` | Generic. [dockview-core](https://dockview.dev/) 8 with a theme mapped to Spectrum tokens, in its own shadow root. Panels come from `factories` (`name → (params) => HTMLElement`). `open`, `close`, `has`, `content`, `focusPanel`, `cycleGroup`, `cycleTab`, `toJSON`, `restore`, `clear`, and the full `api`. Tabs have a context menu (close, close others, float, maximize). Events: `layout-change`, `active-panel-change`, `panel-close`. |
| `<slicc-agents>` | Cones with their scoops, status, context fill and unread count. Selecting one makes it the active agent. |
| `<slicc-chat>` | The active agent's conversation, by day: user messages (with attachments, steered, or delegated from another cone), assistant messages (Markdown with tables, task lists, quotes, code and images; thinking; tool calls, grouped into a collapsible cluster from three in a row; media galleries with images, video and audio; action cards for tools, pull requests and status; plans and checklists; inline diffs; question prompts; delegations; link previews; errors with a fix-it action), standalone tool results, system messages (compaction markers, error cards, notices) and licks, SLICC's events into a cone, on every channel. Permission requests are allowed or denied in place. |
| `<slicc-composer>` | The message box. <kbd>Enter</kbd> sends, or queues behind a running reply; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> steers (interrupts); <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line; <kbd>Tab</kbd> takes the suggested follow-up; <kbd>↑</kbd>/<kbd>↓</kbd> at the start or end walk this agent's history; <kbd>Esc</kbd> stops. `/` completes commands (`/clear`, `/compact`, `/model`, `/thinking`, `/scoop`, `/stop`, `/theme`) and their arguments, `@` mentions agents and files. Attach from the computer, from SLICC's files, a browser screenshot or a shared secret, or paste and drop files (25 MB each). Queued messages wait above it, to send now or drop. Model and thinking pickers, and dictation where the browser has speech recognition. Drafts are kept per agent. |
| `<slicc-files>` | The file system as a `<slicc-file-tree>`, with pending changes as git status. Opening a file opens it in a tab. |
| `<slicc-file-view>` | One file (`path`), highlighted, with its pending change and a link to the diff. |
| `<slicc-changes>` | Pending changes with their author. Opens the diff, accepts or reverts one change or all of them. |
| `<slicc-diff-panel>` | The diff of one pending change (`path`), unified or split, with accept and revert. |
| `<slicc-terminals>` | Terminal sessions in tabs, each a `<slicc-terminal>` on the session's `TerminalBackend`. Sessions stay alive while hidden; `exit` closes the tab. |
| `<slicc-browser>` | Browser tabs with the agent driving each, an address bar, reload, and the active tab's screenshot. |
| `<slicc-settings>` | Theme, the model and thinking level for new cones, composer and diff preferences, and accounts to connect, reconnect or disconnect. |
| `<slicc-memory>` | What agents remember, globally or per cone, grouped by section: search, filter by tag, expand, edit, add and forget. |
| `<slicc-monitor>` | The live monitor: vitals with sparklines (active agents, spend, budget, fullest context), alerts, and the topology (cones and scoops, terminals, tabs, pending changes, sprinkles, tray followers). |
| `<slicc-freezer>` | Frozen cones, archived with their scoops: thaw to bring one back, delete, or freeze the active cone (also `/freeze`). |
| `<slicc-sprinkle>` | A SLICC sprinkle (`.shtml`), as a panel or, with `inline`, as a dip in the chat that grows to fit. It runs in a sandboxed frame (`allow-scripts` only) with SLICC's sprinkle theme (the `--s2-*` tokens and `.sprinkle-*` classes), the app's fonts, and Lucide icons (`<i data-lucide>`, `LucideIcons.render()`). Its only way back is `slicc.lick({ action, data })`, which reaches the owning cone as a `sprinkle` lick. Panel sprinkles sit at the top of the right rail with their Lucide icon. |
| `<slicc-tray>` | The tray indicator in the header: connection, the float's name, followers and budget; its panel adds role, runtime, spend, the follower list, the join link, and disconnect or reconnect. |
| `<slicc-file-tree>` | Generic. [`@pierre/trees`](https://www.npmjs.com/package/@pierre/trees) through its `web-components` entry: `paths` (folders end in `/`), `gitStatus`, `expanded`, `reveal(path, focus)`. Fires `file-open` on click and on <kbd>Enter</kbd>. |
| `<slicc-code-view>` | Generic. A highlighted file through [`@pierre/diffs`](https://www.npmjs.com/package/@pierre/diffs): `path`, `contents`, `color`. |
| `<slicc-diff-view>` | Generic. A diff through `@pierre/diffs`: `path`, `oldText`, `newText` (`null` for an added or deleted file), `color`, `diff-style` (`unified` or `split`). |

Files and diffs open in one editor group next to the chat. Panels ask for them with `open-file` and `open-diff` events (`{ path }`), which `<slicc-app>` handles, or call `app.open('file' | 'diff', path)`.

Keys: <kbd>Alt</kbd>+<kbd>1</kbd>… opens and focuses a panel, <kbd>F6</kbd> and <kbd>Shift</kbd>+<kbd>F6</kbd> move between groups, <kbd>Ctrl</kbd>+<kbd>]</kbd> and <kbd>Ctrl</kbd>+<kbd>[</kbd> between tabs, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> switches the theme. In terminal and browser tab strips, <kbd>←</kbd> and <kbd>→</kbd> switch tabs. In the agents and changes lists, arrows, <kbd>Home</kbd>, <kbd>End</kbd> and <kbd>Enter</kbd>; in the file tree, its own arrow keys and <kbd>Enter</kbd> to open. In the composer, <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line and <kbd>Esc</kbd> stops a reply.

### Model

`SliccModel` (`src/model/types.ts`) has one port per future backend, so adapters can replace the dummy without UI changes. Every port is subscribable with `on(type, listener)`, which returns an unsubscribe function.

| Port | Later backed by | |
| :--- | :--- | :--- |
| `agent` | `@ai-ecoverse/slicc-agent` | Cones and scoops, the active agent, conversations, `send` (with attachments, as a send, a steer or a queued follow-up) and `stop`, the queue, suggestions, answers to questions, permission decisions, compaction, clearing, the model per agent and new scoops. Assistant messages stream: the same message is re-emitted as its parts grow and its tool calls go from `running` to `done`. |
| `files` | slicc-kernel's OPFS | `list`, `read`, `write`, `remove`, and pending changes with their before and after text (`accept`, `revert`). |
| `terminals` | slicc-kernel's terminal API | Terminal sessions; `backend(id)` returns a `TerminalBackend` for `<slicc-terminal>`. |
| `browser` | `@ai-ecoverse/slicc-cdp` | Tabs, the active tab, `open`, `navigate`, `close`, `screenshot`. |
| `settings` | local storage | Theme, model, thinking level, composer and diff preferences, the models on offer, and accounts. |
| `memory` | `@ai-ecoverse/slicc-agent` | Memories with scope, section, tag and body; `save` and `remove`. |
| `monitor` | all of them | A snapshot of vitals, alerts and sections, re-emitted as the system changes, and `resync`. |
| `sprinkles` | `@ai-ecoverse/slicc-agent` | Sprinkles (`inline` ones show as dips in the chat, not in the rail) and `send`, which turns a sprinkle's lick into a lick on its cone. |
| `tray` | the tray protocol | Connection, role, float kind, followers, spend and budget; `reconnect` and `disconnect`. |

### Kernel model

`@ai-ecoverse/slicc-spectrum/kernel` (`dist/slicc-kernel-model.js`) backs the sections that work without an agent:

```js
import { createKernel } from '@ai-ecoverse/slicc-kernel';
import { createKernelModel } from '@ai-ecoverse/slicc-spectrum/kernel';
import { surfaces } from '@ai-ecoverse/slicc-spectrum/ui';

const root = await navigator.storage.getDirectory();
const kernel = await createKernel({ root });
const app = document.querySelector('slicc-app');
app.surfaces = surfaces.filter((item) => item.id === 'files' || item.id === 'terminal');
app.model = createKernelModel({ kernel, root, storage: localStorage, files: { skip: ['/node_modules'] } });
```

- **`KernelFiles`** lists the OPFS root as the tree, reads and writes files through the OPFS API, and removes them recursively. Directories in `skip` show up but aren't scanned. `start()` rescans on every `FileSystemObserver` record, or every `interval` ms (default 2000) where the browser can't observe OPFS, and emits `files` and a `file` per changed file, so open tabs follow what the terminal writes. Without an agent there are no pending changes.
- **`KernelTerminals`** opens `bash -i` (or `argv`) in `cwd` (default `/home`) through `kernelBackend`, one session per terminal, as many as the user opens. `open` (default 1) is how many it starts with.
- Everything else is idle (`IdleAgent`, `IdleBrowser`, `IdleMemory`, `IdleMonitor`, `IdleSprinkles`, `IdleTray`, from `idleModel(storage)`): empty lists, and actions that need a backend throw. Settings are kept in `storage`. Leave their surfaces out of `surfaces`.

Each section is its own port, so an embedder can mix real and dummy per section, for example `{ ...createDummyModel(), files: new KernelFiles(root) }`.

`<slicc-file-view>` has **Edit**: the file opens in a plain text area, and **Save** or `Mod+S` writes it through `files.write`; `Escape` cancels.

The `kitchen-sink` cone holds every kind of message, content and lick in one conversation, for design work and screenshots. The dummy's fixtures are invented: a small forecast API called harbor, with cones, scoops, a conversation per agent, pending changes, browser tabs and accounts. Its only sprinkles are SLICC's own: `welcome` (the onboarding wizard, as a dip in the sliccy cone) and `suggestions`, copied from `slicc` (`packages/vfs-root/shared/sprinkles/`, commit `aa29784`) with their comments stripped, as is the sprinkle theme in `src/app/sprinkle-theme.css`. Without file access, `suggestions` shows its empty state. Its replies are scripted by keyword (tests, fix or add, open or docs, files, anything else), and their tool calls act on the other ports: an edit writes a file and shows up as a change, a browse opens a tab.

### Distribution

The UI is ESM with code splitting: `slicc-ui.js`, `slicc-dummy.js` and `chunk-*.js` next to them in `dist/`, with no bare imports, so the folder can be served as plain files from OPFS. dockview's ESM build has no CSS; the build takes it from dockview's UMD bundle. `@pierre/diffs` highlights with Shiki. `dist/` carries the grammars SLICC needs most (CSS, diff, HTML, JavaScript, JSON, JSX, Markdown, Python, shell, SQL, TOML, TSX, TypeScript, XML, YAML); every other grammar and theme stays out of `dist/` and loads the first time a file needs it. It loads from `grammarBase` first, if set, and then from `https://cdn.jsdelivr.net/npm/@shikijs/` (pinned to the installed version, CORS and CORP headers set). For offline use, install the optional peer dependencies `@shikijs/langs` and `@shikijs/themes` (pinned to the same version; plain relative ESM, no bare imports), serve them, and point `grammarBase` (on `<slicc-app>`, or `setGrammarBase()`) at the folder holding `langs/` and `themes/`, for example `/node_modules/@shikijs/`. The build fails if the peer versions drift from the installed ones. `SLICC_GRAMMAR_BASE` points the build at another CDN. `dist/` is about 55 files and 5.5 MB of JavaScript. The build fails if React is bundled; `@pierre/trees` lists React as a peer dependency, so npm installs it, but the `web-components` entry runs on Preact. Types are in `dist/types/ui.d.ts`, `dist/types/dummy.d.ts` and `dist/types/kernel.d.ts`, exported as `@ai-ecoverse/slicc-spectrum/ui`, `/dummy` and `/kernel`.

### dockview notes

- Keyboard navigation (`keyboardNavigation`) needs dockview-enterprise, so `<slicc-dock>` implements <kbd>F6</kbd> and <kbd>Ctrl</kbd>+<kbd>]</kbd>/<kbd>[</kbd> itself.
- A floating group with a border (`--dv-floating-border`, which dockview's own light theme sets) grows by twice the border width on every save and restore. The theme draws the edge with a box shadow instead.

## Development

```sh
npm install
npm run lint
npm test
```

`npm test` builds `dist/` and runs the integration tests in headless Chromium over raw CDP, through the [harness from slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web#integration-test-harness), against a fake backend (`test/integration/page/fake-backend.js`). It writes V8 coverage to `coverage/` and CPU profiles, screenshots and console logs to `artifacts/`. The test page is served cross-origin isolated (COOP/COEP), as slicc-kernel requires. `test/integration/kernel.test.mjs` runs `bash -i` end to end on `@ai-ecoverse/slicc-kernel` (a pinned dev dependency), with `@ai-ecoverse/wasm-bash` and `@ai-ecoverse/wasm-coreutils` installed into OPFS by the page (`/kernel.html`). `npm start` serves the test page on port 8080, and the UI at `/ui/`. `test/integration/kernel-ui.test.mjs` boots `<slicc-app>` on the kernel model (`/kernel-ui/`): a command in the terminal, its file in the tree, an edit in a file tab read back in the terminal, a second terminal, and a reload. `test/integration/ui.test.mjs` covers the shell, the layout (moving, closing, floating, reopening and reloading), streaming a reply with a tool call, stopping it, switching themes and the keyboard, and saves screenshots to `artifacts/ui/`.

The Biome, TypeScript, lefthook, Renovate and CI configuration comes from [slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web), which also provides the `slicc-lint-comments`, `slicc-no-unit-tests` and `slicc-diff-cover` commands used by `npm run lint` and the pre-commit hook.

Unit tests live in `test/unit/`, which is gitignored. The pre-commit hook runs them in Node against happy-dom under monocart and fails the commit unless the staged lines in `src/` are fully covered (`slicc-diff-cover`, which runs `diff-cover --fail-under 100` and needs [uv](https://docs.astral.sh/uv/)).

## License

Apache-2.0
