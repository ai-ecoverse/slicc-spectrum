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
- wterm reads focus and selection from `ownerDocument` (`activeElement`, `getSelection()`), so selection and copy don't work inside a shadow root that wterm itself owns. That's why the element renders in light DOM. It still works when the element is placed inside someone else's shadow root.

## UI

`dist/slicc-ui.js` is SLICC's app shell on Spectrum Web Components 1.12 with the Spectrum 2 theme (`<sp-theme system="spectrum-two">`), in light and dark. It runs against a typed model, not against the kernel, the agent or the browser directly, and is not wired to any of them yet. `dist/slicc-dummy.js` provides a dummy model that streams replies and tool calls with timers.

```html
<slicc-app></slicc-app>
<script type="module">
  import { createDummyModel } from './dist/slicc-dummy.js';
  import './dist/slicc-ui.js';

  document.querySelector('slicc-app').model = createDummyModel({ storage: localStorage });
</script>
```

`npm start` serves it at `/ui/`. `?delay=` sets the dummy's tick in milliseconds (default 30) and `?color=light|dark|system` the theme.

### Elements

| Element | |
| :--- | :--- |
| `<slicc-app>` | The shell: header with the agent picker, the View menu and the theme switch, a `<slicc-dock>`, and a status bar. Saves the dock layout to `storage` (default `localStorage`) under `layoutKey`. |
| `<slicc-dock>` | Generic. [dockview-core](https://dockview.dev/) 8 with a theme mapped to Spectrum tokens, in its own shadow root. Panels come from `factories` (`name → (params) => HTMLElement`). `open`, `close`, `has`, `content`, `focusPanel`, `cycleGroup`, `cycleTab`, `toJSON`, `restore`, `clear`, and the full `api`. Tabs have a context menu (close, close others, float, maximize). Events: `layout-change`, `active-panel-change`, `panel-close`. |
| `<slicc-agents>` | Cones with their scoops, status, context fill and unread count. Selecting one makes it the active agent. |
| `<slicc-chat>` | The active agent's conversation: Markdown, thinking, tool calls (collapsible, with input and output), events such as webhooks, schedules, scoops, compaction and errors, and a composer that streams and stops. |

Keys: <kbd>Alt</kbd>+<kbd>1</kbd>… opens and focuses a panel, <kbd>F6</kbd> and <kbd>Shift</kbd>+<kbd>F6</kbd> move between groups, <kbd>Ctrl</kbd>+<kbd>]</kbd> and <kbd>Ctrl</kbd>+<kbd>[</kbd> between tabs, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> switches the theme. In the agents list, arrows, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Enter</kbd> and <kbd>Space</kbd>. In the composer, <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line and <kbd>Esc</kbd> stops a reply.

### Model

`SliccModel` (`src/model/types.ts`) has one port per future backend, so adapters can replace the dummy without UI changes. Every port is subscribable with `on(type, listener)`, which returns an unsubscribe function.

| Port | Later backed by | |
| :--- | :--- | :--- |
| `agent` | `@ai-ecoverse/slicc-agent` | Cones and scoops, the active agent, conversations, `send` and `stop`. Assistant messages stream: the same message is re-emitted as its parts grow and its tool calls go from `running` to `done`. |
| `files` | slicc-kernel's OPFS | `list`, `read`, `write`, `remove`, and pending changes with their before and after text (`accept`, `revert`). |
| `terminals` | slicc-kernel's terminal API | Terminal sessions; `backend(id)` returns a `TerminalBackend` for `<slicc-terminal>`. |
| `browser` | `@ai-ecoverse/slicc-cdp` | Tabs, the active tab, `open`, `navigate`, `close`, `screenshot`. |
| `settings` | local storage | Theme, model, thinking level, composer and diff preferences, the models on offer, and accounts. |

The dummy's fixtures are invented: a small forecast API called harbor, with cones, scoops, a conversation per agent, pending changes, browser tabs and accounts. Its replies are scripted by keyword (tests, fix or add, open or docs, files, anything else), and their tool calls act on the other ports: an edit writes a file and shows up as a change, a browse opens a tab.

### Distribution

The UI is ESM with code splitting: `slicc-ui.js`, `slicc-dummy.js` and `chunk-*.js` next to them in `dist/`, with no bare imports, so the folder can be served as plain files from OPFS. dockview's ESM build has no CSS; the build takes it from dockview's UMD bundle. Types are in `dist/types/ui.d.ts` and `dist/types/dummy.d.ts`, exported as `@ai-ecoverse/slicc-spectrum/ui` and `/dummy`.

### dockview notes

- Keyboard navigation (`keyboardNavigation`) needs dockview-enterprise, so `<slicc-dock>` implements <kbd>F6</kbd> and <kbd>Ctrl</kbd>+<kbd>]</kbd>/<kbd>[</kbd> itself.
- A floating group with a border (`--dv-floating-border`, which dockview's own light theme sets) grows by twice the border width on every save and restore. The theme draws the edge with a box shadow instead.

## Development

```sh
npm install
npm run lint
npm test
```

`npm test` builds `dist/` and runs the integration tests in headless Chromium over raw CDP, through the [harness from slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web#integration-test-harness), against a fake backend (`test/integration/page/fake-backend.js`). It writes V8 coverage to `coverage/` and CPU profiles, screenshots and console logs to `artifacts/`. The test page is served cross-origin isolated (COOP/COEP), as slicc-kernel requires. `test/integration/kernel.test.mjs` runs `bash -i` end to end on `@ai-ecoverse/slicc-kernel` (a pinned dev dependency), with `@ai-ecoverse/wasm-bash` and `@ai-ecoverse/wasm-coreutils` installed into OPFS by the page (`/kernel.html`). `npm start` serves the test page on port 8080, and the UI at `/ui/`. `test/integration/ui.test.mjs` covers the shell, the layout (moving, closing, floating, reopening and reloading), streaming a reply with a tool call, stopping it, switching themes and the keyboard, and saves screenshots to `artifacts/ui/`.

The Biome, TypeScript, lefthook, Renovate and CI configuration comes from [slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web), which also provides the `slicc-lint-comments`, `slicc-no-unit-tests` and `slicc-diff-cover` commands used by `npm run lint` and the pre-commit hook.

Unit tests live in `test/unit/`, which is gitignored. The pre-commit hook runs them in Node against happy-dom under monocart and fails the commit unless the staged lines in `src/` are fully covered (`slicc-diff-cover`, which runs `diff-cover --fail-under 100` and needs [uv](https://docs.astral.sh/uv/)).

## License

Apache-2.0
