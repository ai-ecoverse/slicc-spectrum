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

`dist/slicc-ui.js` is SLICC's app shell on Spectrum 2, in light and dark. It is moving from Spectrum Web Components 1.12 to Gen2 ([`@adobe/spectrum-wc`](https://www.npmjs.com/package/@adobe/spectrum-wc)): the Gen2 theme classes (`swc-theme swc-theme--sizeM swc-theme--light|dark`) and `--swc-*` tokens apply inside `<slicc-app>`, and icons are Spectrum 2 workflow icons from `@adobe/spectrum-wc-icons`. Components Gen2 doesn't ship yet stay on 1.12 inside a scoped `<sp-theme system="spectrum-two">` ([#60](https://github.com/ai-ecoverse/slicc-spectrum/issues/60)). It runs against a typed model, not against the kernel, the agent or the browser directly. `dist/slicc-dummy.js` provides a dummy model that streams replies and tool calls with timers, and `dist/slicc-kernel-model.js` a real one for files and terminals on slicc-kernel (see [Kernel model](#kernel-model)).

```html
<slicc-app></slicc-app>
<script type="module">
  import { createDummyModel } from './dist/slicc-dummy.js';
  import './dist/slicc-ui.js';

  document.querySelector('slicc-app').model = createDummyModel({ storage: localStorage });
</script>
```

`npm start` serves it at `/ui/`. `?fonts=<url>` loads Adobe Clean from another folder, `?vf=<url>` Adobe Clean Spectrum VF from another file, and `?vf=` turns it off (see [Fonts](#fonts)).

### Layouts and rails

The layout follows the width of `<slicc-app>`, which it reflects as its `screen` attribute: `phone` (under 640 px) has one column, `tablet` (under 1200 px) two, `desktop` three, like SLICC v6. Each screen class starts with few panels open and saves its own layout (`slicc-ui.layout.v2.<screen>`). Every surface has a home side, left, center or right. Closed panels wait as icons in the left and right rails (on a phone, in one bar at the bottom); one click puts a panel back on its side, next to its neighbours. Each thread, a cone's or a scoop's conversation, opens in its own chat panel (`chat:<agent id>`), as a tab in the same group as the other chats. Selecting a thread opens or reveals its tab, activating a chat tab selects its thread, and a thread's chat closes when the thread goes away (frozen or deleted).

`surfaces` on `<slicc-app>` (default: every surface, exported as `surfaces`) is what the app offers: the panels it can open, the View menu, the rails and `Alt+1…9`. A saved layout with a panel it doesn't offer is dropped for the default. An embedder can pass a subset with its own `open` per screen class. The agent picker and the tray show only when `chat` is offered, the update status only with `updates`, the network indicator only with `network` and a `network` port, and the settings button only with `settings`. Elements with `slot="status"` show in the header as compact single-line items, before the update status, and are cut with an ellipsis when long; a `hidden` one takes no space. There are no strips under the header. On a phone the status items are hidden.

### Fonts

Text is Adobe Clean Spectrum VF, falling back to Adobe Clean, and code is Spectrum's Source Code Pro. Source Code Pro (OFL) is in `dist/fonts/`, same origin. Neither Adobe Clean can ship in a public package. `<slicc-app>` registers the variable face (`adobe-clean-spectrum-vf`, weights 100–900) from `variableFont`, a woff2 URL that defaults to the Adobe Fonts file React Spectrum S2 uses; a host can point it at its own copy, or set it to `null` to leave it out. The legacy faces come from `fontBase` (`AdobeClean-{Regular,Medium,Bold,ExtraBold}.otf`), which defaults to `/fonts/` on the current origin. Every `*.sliccy.ai` host passes it through to v6, and `npm start` proxies it from `seven.sliccy.ai`. The sans stack (`--swc-sans-font-family-stack`, also used by the 1.12 components) is the variable face, then Adobe Clean, then the system font stack, so text falls back face by face wherever a file doesn't load. `?delay=` sets the dummy's tick in milliseconds (default 30) , `?color=light|dark|system` the theme, and `?grammars=` the grammar base.

### Elements

| Element | |
| :--- | :--- |
| `<slicc-app>` | The shell: header with the agent picker, status items, the update status, the network indicator, the tray, the View menu and the theme switch, rails, and a `<slicc-dock>`. Saves the dock layout per screen class to `storage` (default `localStorage`) under `layoutKey`. While connected it sets `overscroll-behavior` to `none !important` on the page's `html` and `body`, so only scroll areas inside panels rubber-band. When the last app on the page is removed, the page's own inline values come back. |
| `<slicc-dock>` | Generic. [dockview-core](https://dockview.dev/) 8 with a theme mapped to Spectrum tokens, in its own shadow root. Panels come from `factories` (`name → (params) => HTMLElement`). `open`, `close`, `has`, `content`, `focusPanel`, `cycleGroup`, `cycleTab`, `toJSON`, `restore`, `clear`, and the full `api`. Tabs have a context menu (close, close others, float, maximize). Events: `layout-change`, `active-panel-change`, `panel-close`. |
| `<slicc-agents>` | Cones with their scoops, status, context fill and unread count. A cone's row has a second line with its conversation title, as does its item in the header's cone picker: `Agent.title`, or else the first line of the first user message, or "No messages yet". When cones share a name, their accessible names and the Delete cone, Freezer and confirmation labels add the title, as in "Delete cone sliccy (Hello from Bedrock)". Selecting one makes it the active agent. |
| `<slicc-chat>` | One thread's conversation (its `agent`, or the active agent if unset), by day: user messages (with attachments, tagged as steered or follow-up by `delivered`, or delegated from another cone), assistant messages (Markdown with tables, task lists, quotes, code and images; thinking; tool calls, grouped into a collapsible cluster from three in a row, each with its input (a shell command after `$`), an optional `meta` such as a timeout, an edit's `diff` shown as a diff view, and an `image`, such as a screenshot, shown as a thumbnail under the closed card and in full when open; media galleries with images, video and audio; action cards for tools, pull requests and status; plans and checklists; inline diffs; question prompts; delegations; link previews; errors with a fix-it action; a content-filter stop offers **Drop the last turn**, which rewinds that turn and puts its prompt back into the composer; when the turns right before it failed too, the button reads **Drop N failed turns** and rewinds to before the first of them, putting the latest prompt back), standalone tool results, system messages (compaction markers, error cards, notices) and licks, SLICC's events into a cone, on every channel; a lick's `severity` (`warn` or `error`) turns its channel badge into a notice or negative one with an alert icon. Permission requests are allowed or denied in place. The header shows the status, a model picker that names each model's provider and leaves out classifiers and models with `tools: false`, the thinking picker, the context meter and **New conversation**, which calls `clear` and puts focus back in the composer; on a cone, when the port can freeze, its tooltip says the old conversation stays in the Freezer. Between the header and the transcript, a `<slicc-notices>` shows the model's notices. |
| `<slicc-notices>` | The model's `notices` as in-line alerts with their actions and a close button; renders nothing without the port or notices. |
| `<slicc-composer>` | The message box. <kbd>Enter</kbd> sends, or steers a running reply: the message joins after the current tool round, without interrupting; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> queues a follow-up that runs after the reply and can be withdrawn; <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line; <kbd>Tab</kbd> takes the suggested follow-up; <kbd>↑</kbd>/<kbd>↓</kbd> at the start or end walk this agent's history; <kbd>Esc</kbd> stops. `/` completes commands (`/clear`, `/compact`, `/model`, `/thinking`, `/scoop`, `/stop`, `/freeze` when the port can freeze, `/theme`) and their arguments, `@` mentions agents and files. Attach from the computer, from SLICC's files, a browser screenshot or a shared secret, or paste and drop files (25 MB each). Queued messages wait above it, to send now or drop. Model and thinking pickers, and dictation where the browser has speech recognition. Drafts are kept per agent. |
| `<slicc-files>` | The file system as a `<slicc-file-tree>`, with pending changes as git status. Opening a file opens it in a tab. With `files.mountFolder`, **Mount a folder…** (`data-action="mount-folder"`) mounts a local folder, then selects and expands it in the tree; with `files.mounts`, a **Mounted** strip lists the mount points, each with **Eject** (`data-action="eject"`, `data-path` the mount point) when the port has `eject`. With `files.needsFolder`, a **Needs a folder** section lists the mount points waiting for a folder, each with **Insert folder…** (`data-action="insert-folder"`, `data-id` the mount point), which calls `mountFolder(path)`. A failed mount, insert or eject shows its message under the bar. |
| `<slicc-file-view>` | One file (`path`), highlighted, with its pending change and a link to the diff. |
| `<slicc-changes>` | Pending changes with their author. Opens the diff, accepts or reverts one change or all of them. Changes with a `repo` show their folder relative to it, and no author when `agentId` is `null`; they group under a header per repository (its path and count), even when there is only one, in the order the port returns them. In a diff panel narrower than 480 px, Accept and Revert (`data-action="accept"`, `data-action="revert"`) show only their icons. Revert and Revert all ask with a destructive confirm that says the uncommitted (or, without a repo, pending) changes can't be undone; a failed revert shows its message under the bar. When the port's `unavailable()` returns a string, the panel shows it instead of the list, with each `backtick` span as inline code in the text's color and, below, each command once with a **Copy** button (`data-command`, `data-action="copy-command"`). |
| `<slicc-diff-panel>` | The diff of one pending change (`path`), unified or split, with accept and revert. A change with `before` and `after` both `null` (a binary file, or text over 1 MB) shows “No diff for this file” and Open the file instead, and keeps Accept and Revert. |
| `<slicc-terminals>` | Terminal sessions in tabs, each a `<slicc-terminal>` on the session's `TerminalBackend`. Sessions stay alive while hidden; `exit` closes the tab. |
| `<slicc-browser>` | What the agents' browser control is doing. It opens on the most recently driven tab (`.focused`), or on the tab overview: cards (`li[data-id]`, `data-controlled` while an agent drives the tab, `data-pulse` when another tab starts being driven, without switching to it) with a thumbnail, the agent and a small **Stop <agent>** (`data-action="stop-agent"`), and an address bar to open a URL. The focused tab has **All tabs** (`data-action="all-tabs"`), a tab picker (a list of tabs at 720 px and wider), the URL with **Copy** (`data-action="copy-url"`) and **Open** (`data-action="open-tab"`, activates the tab), who's using it (`.driving[data-driving=agent|user|none]`; a controlled tab without an agent reads **In use** and has no Stop) with **Stop**, a view-only preview (`figure[data-view]`: `live` while watching with a frame under 3 s old, `shot` with "Updated N s ago", `none`) and the recent actions (`li[data-action-id][data-kind][data-status]`, failures with their error inline), folded into **Recent actions (n)** below 480 px with the last one showing. Labels, URLs and errors are text only. With no tabs and `browser.via` `null` in the network status, it says browser control isn't connected (`data-browser="none"`) with the extension link and the slicc-node command. The Browser rail button carries a dot (`data-driven`) while a tab is in use. |
| `<slicc-settings>` | Theme, the model and thinking level for new cones, composer and diff preferences, and accounts to connect, reconnect or disconnect. An account whose status is `signing-in` (or a non-API-key account while its `connect` is pending) reads “Signing in…”; when the port has `cancel(id)`, its row offers Cancel (`data-action="cancel-sign-in"`), and the rejected `connect` that follows shows no error. |
| `<slicc-updates>` | Install / Update: component states, version changes, last checks, download and link counts, action buttons, failures with Retry, and collapsible install logs. Opens at boot until the agent is ready without failures. Background updates stay in the header's update status; new failures reopen the panel, and after a reload into a boot that isn't ready yet such a panel closes once the agent is ready. Every automatic close is saved to the layout. When the port offers packages, an Optional packages section lists them below as compact rows, each with its state, version, download size, requirements, commands, progress, errors and Install log; packages never count in the header or keep the panel open at boot. Also available through View and the rails. |
| `<slicc-memory>` | What agents remember, per scope (everyone, a cone or a role), grouped by section: search, filter by tag, expand, edit, add and forget. Free text outside an entry shows “From MEMORY.md”. |
| `<slicc-monitor>` | The live monitor: vitals with sparklines (active agents, spend, budget, fullest context), alerts, and the topology (cones and scoops, terminals, tabs, pending changes, sprinkles, tray followers). |
| `<slicc-freezer>` | Every conversation in the session, from `frozen()`: cones, scoops and agent runs, each with a kind badge, live ones first with a Live light, then the newest first. A live row offers **Open**, which selects that agent; a stopped one offers **Thaw** and **Remove**, which deletes its working folders after a confirmation. A thawed scoop or agent run keeps its row, which says what it was thawed as. **Delete cone**, in the agents list (or <kbd>Delete</kbd> on a cone's row) and the header's cone picker, stops a cone after a confirmation; `/freeze` does it at once. Either way its conversation stays here, and a row without a `kind` counts as a cone. |
| `<slicc-sprinkle>` | A SLICC sprinkle (`.shtml`), as a panel or, with `inline`, as a dip in the chat that grows to fit. A dip has a tab-like handle: drag it into the dock (or onto a rail, or use its open-as-panel button) and it lives on as a sprinkle panel, with a note in the chat where it was; which dips are out is saved in `slicc-ui.dips`. It runs in a sandboxed frame (`allow-scripts` only) with SLICC's sprinkle theme (the `--s2-*` tokens and `.sprinkle-*` classes), the app's fonts, and Lucide icons (`<i data-lucide>`, `LucideIcons.render()`). It talks back through `slicc.lick({ action, data })`, which reaches the owning cone as a `sprinkle` lick, and, when the port has `call`, reads files and keeps state (see [Sprinkle bridge](#sprinkle-bridge)). Panel sprinkles sit at the top of the right rail with their Lucide icon. |
| `<slicc-network>` | Network: the route and its health in plain words with the bios `detail`, a line on browser automation (`data-browser`: through the SLICC extension, through slicc-node, or not available with how to get it) when the status has `browser`, **Check again** (`data-action="check"`) when the port has `check`, a **Tailscale** section (`data-tailnet` with the state) when the status has `tailnet`, **Get the whole web** with the Chrome extension link (`data-action="install-extension"`, when `extensionUrl` is set) and `npx @ai-ecoverse/slicc-node` with a copy button (`data-action="copy-command"`), folded away when the route already reaches the whole web (`proxy`, `extension` or `tailnet`, whose line names `tailnet.exitNode`), and recent failures with host, error and time. The header's **Network** indicator (`data-network`, `data-health`) opens it: a status light, green for `ok`, yellow for `limited` and red for `failing`, with the state in its text and label and `detail` as its tooltip, which adds "Tailscale is connected." while the tailnet runs; on a phone, a cloud icon for the state. Offered only when the model has a `network` port. |
| `<slicc-tray>` | The tray indicator in the header: connection, the float's name, followers and budget; its panel adds role, runtime, spend, the follower list, the join link, and disconnect or reconnect. |
| `<slicc-confirm>` | The confirmation dialog `confirm()` opens. Not for direct use. |
| `<slicc-prompt>` | The name dialog `prompt()` opens. Not for direct use. |
| `<slicc-file-tree>` | Generic. [`@pierre/trees`](https://www.npmjs.com/package/@pierre/trees) through its `web-components` entry: `paths` (folders end in `/`), `gitStatus`, `expanded`, `reveal(path, focus)`. Fires `file-open` on click and on <kbd>Enter</kbd>. |
| `<slicc-code-view>` | Generic. A highlighted file through [`@pierre/diffs`](https://www.npmjs.com/package/@pierre/diffs): `path`, `contents`, `color`. |
| `<slicc-diff-view>` | Generic. A diff through `@pierre/diffs`: `path`, `oldText`, `newText` (`null` for an added or deleted file), `color`, `diff-style` (`unified` or `split`). |

Files and diffs open in one editor group next to the chat. Panels ask for them with `open-file` and `open-diff` events (`{ path }`), which `<slicc-app>` handles, or call `app.open('file' | 'diff', path)`.

Keys: <kbd>Alt</kbd>+<kbd>1</kbd>… opens and focuses a panel, <kbd>F6</kbd> and <kbd>Shift</kbd>+<kbd>F6</kbd> move between groups, <kbd>Ctrl</kbd>+<kbd>]</kbd> and <kbd>Ctrl</kbd>+<kbd>[</kbd> between tabs, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> switches the theme. In terminal and browser tab strips, <kbd>←</kbd> and <kbd>→</kbd> switch tabs. In the agents and changes lists, arrows, <kbd>Home</kbd>, <kbd>End</kbd> and <kbd>Enter</kbd>; in the file tree, its own arrow keys and <kbd>Enter</kbd> to open. In the composer, <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line and <kbd>Esc</kbd> stops a reply.

### Confirmations

Destructive actions ask first: reverting one change or all, deleting a frozen cone, forgetting a memory, disconnecting an account or the tray, and closing a terminal. `confirm({ title, body, action, variant, cancel, trigger })`, exported from `dist/slicc-ui.js`, opens a modal alert dialog (1.12 `sp-alert-dialog`, as Gen2 has no dialog yet) inside `<slicc-app>`'s themed shadow root and resolves `true` on the action and `false` on Cancel or <kbd>Esc</kbd>. `cancel` renames Cancel, for example “Don’t allow” next to “Allow” in a permission prompt. Focus starts on Cancel and goes back to `trigger` (default: the focused element) when it closes. `variant` is `destructive` (default, a negative action button) for actions that lose data for good, or `confirmation` (accent) for ones you can take back, like disconnecting. Title the dialog with a question, say what can’t be undone in `body`, and name the action with a verb.

```js
import { confirm } from './dist/slicc-ui.js';

if (await confirm({ title: 'Delete harbor?', body: 'Its scoops and messages are deleted. You can’t undo this.', action: 'Delete' })) remove();
```

`prompt({ title, label, action, value, trigger, submit })` asks for one line of text in the same kind of modal dialog, with a 1.12 `sp-textfield` (Gen2 has no text field yet). Focus starts in the field, <kbd>Enter</kbd> or the action submits, and <kbd>Esc</kbd> or Cancel resolves `null`. The action stays disabled while the trimmed value is empty. With `submit`, the dialog awaits it with the action pending and resolves the trimmed value once it does; if it throws, the dialog stays open and shows the error under the field.

```js
import { prompt } from './dist/slicc-ui.js';

const name = await prompt({ title: 'New cone', label: 'Name', action: 'Create', submit: (name) => model.agent.createCone(name).then(() => {}) });
```

### Sprinkle bridge

A sprinkle's frame gets `window.slicc` with `name` and `lick(event)`. When the model's `sprinkles` port has `call`, it also gets:

- `slicc.readFile(path)` resolves with the file's text.
- `slicc.exists(path)` resolves with a boolean.
- `slicc.getState()` returns the sprinkle's saved value, or `null`, synchronously: the frame is built with it, so `var saved = slicc.getState()` works on load.
- `slicc.setState(value)` updates that value at once and resolves when it is saved. State is JSON: what `JSON.stringify` drops or changes is gone (a `Map` becomes `{}`, `NaN` becomes `null`), and a value it can't serialize, like a cycle or a function, rejects and leaves state as it was. It outlives the frame: reopening the panel or rebuilding the sprinkle starts with it.

Paths are the agent's: `/shared/…` and `/home/…`, nothing else. A refusal or a missing file rejects with an `Error`. There is no `exec`: a sprinkle that needs a command asks its cone with `slicc.lick()`. Without `call`, none of the four exist, so guard them (`typeof slicc.readFile === 'function'`) and fall back.

### Model

`SliccModel` (`src/model/types.ts`) has one port per future backend, so adapters can replace the dummy without UI changes. Every port is subscribable with `on(type, listener)`, which returns an unsubscribe function.

| Port | Later backed by | |
| :--- | :--- | :--- |
| `agent` | `@ai-ecoverse/slicc-agent` | Cones and scoops, the active agent, conversations, `send` (with attachments, as a send, a steer or a queued follow-up) and `stop`, the queue, suggestions, answers to questions, permission decisions, compaction, clearing (`clear(agentId)` starts a new conversation: on a cone, a port with `freeze` first puts the old one in the Freezer as its own row, which thaws into a cone of its own; a scoop's is just reset), the model per agent and new scoops. The optional `rewind(agentId, messageId)` drops the user turn before that message and everything after it, and resolves with the turn's prompt (text and attachments) for the composer, or `null`. The optional `drop(agentId)` removes a scoop: it stops and its working folder is deleted, while its conversation and reports are kept, and `createCone(name)` resolves with a new cone; the dummy rejects a cone name that is taken. `freeze(agentId)` is optional too: without it, **Delete cone** and `/freeze` don't show. `frozen()` lists the Freezer's rows; a `FrozenCone` may carry `kind` (`cone`, `scoop` or `agent`), `live` for a conversation that's still running, and `thawedAs`, the id of the cone a scoop or agent run was thawed into. `thaw(id)` brings a cone back, or forks a scoop or agent run into a new cone, and `discard(id)` removes a row. Names don't have to be unique, and an optional `Agent.title` names a cone's conversation; without it, the first user message does. Assistant messages stream: the same message is re-emitted as its parts grow and its tool calls go from `running` to `done`. |
| `files` | slicc-kernel's OPFS | `list`, `read`, `write`, `remove`, and pending changes with their before and after text (`accept`, `revert`). The optional `mountFolder()` asks for a local folder and resolves with its mount point (for example `/mnt/photos`), or `null` when the user cancels; the panel calls it synchronously in the click, so the port can call `showDirectoryPicker()`. The optional `mounts()` lists the mount points, and `eject(path)` unmounts one (the folder stays on disk). `mountFolder(path)` inserts the picked folder at a mount point that waits for one; the optional `needsFolder()` lists those mount points. The port emits `mounts` and then `files` after every mount and eject, including those made from the shell, and `mounts` whenever `needsFolder()` changes. |
| `terminals` | slicc-kernel's terminal API | Terminal sessions; `backend(id)` returns a `TerminalBackend` for `<slicc-terminal>`. |
| `browser` | `@ai-ecoverse/slicc-cdp` | Tabs, the active tab, `open`, `navigate`, `close`, `screenshot`. A `BrowserTab` may say it's `controlled` (an agent, or the user's terminal when `agentId` is `null`, is driving it now; `agentId` is the agent of its last action); `favicon` is ignored. The optional `actions(tabId?)` returns recent `BrowserAction`s (`{ id, tabId, agentId, kind, target?, value?, length?, status: running \| done \| failed, error?, at }`, `kind` one of `open`, `goto`, `back`, `reload`, `close`, `select`, `snapshot`, `screenshot`, `eval`, `click`, `fill`, `type`, `press`, `scroll`, `request`; a `request` has `value` `'GET https://host/path'` and may have no tab), with an `action` event per new or settled action. The optional `watch(tabId, size?)` streams `frame` events (`{ tabId, src, at }`) for a controlled tab and returns a stop function; the panel watches only the focused tab while it's controlled and visible, with the frame's CSS size. **Stop** calls `agent.stop(agentId)`. |
| `settings` | local storage | Theme, model, thinking level, composer and diff preferences, the models on offer, and accounts. |
| `changes` (optional) | `@ai-ecoverse/slicc-agent` | Pending changes from git instead of the file system: `changes()`, `accept(path)` (stage), `revert(path)` (discard), and a `changes` event, as on `files`. When present, the UI reads changes only from this port, including the rail's count. A `Change` may carry `repo`, its repository root; put the active agent's repository first. The optional `unavailable()` returns why there can be no changes (no git, no repository), which the panel shows with commands in backticks made copyable, or `null`; emit `changes` when it flips. |
| `memory` | `@ai-ecoverse/slicc-agent` | Memories with scope, section, tag and body; `save` and `remove`. `source: 'notes'` marks free text the panel shows as an entry titled after its section; saving it makes it an entry. The optional `scopes()` lists the scope picker's choices as `{ id, label, group }`, ungrouped first, then under “Cones” and “Roles”; without it the picker offers “Everyone” (`global`) and each cone. The panel re-reads `scopes()` on `memories` and `agents`, so emit `memories` when the list changes. A scope that disappears falls back to `global`. |
| `monitor` | all of them | A snapshot of vitals, alerts and sections, re-emitted as the system changes, and `resync`. |
| `sprinkles` | `@ai-ecoverse/slicc-agent` | Sprinkles (`inline` ones show as dips in the chat, not in the rail) and `send`, which turns a sprinkle's lick into a lick on its cone. The optional `call(id, method, args)` serves the [sprinkle bridge](#sprinkle-bridge) for sprinkle `id`: `readFile` and `exists` (`[path]`) resolve with a string and a boolean, `getState` (`[]`) with the saved value or `null`, and `setState` (`[value]`) once it is saved. The adapter owns path policy and keeps state per sprinkle; `<slicc-sprinkle>` awaits `getState` before it builds a frame, mirrors what the frame saves, and forwards only these four methods from its own frame. The dummy keeps state in memory and maps `/shared/x` to `/home/x` in its files, refusing anything outside `/home`. |
| `tray` | the tray protocol | Connection, role, float kind, followers, spend and budget; `reconnect` and `disconnect`. |
| `updates` (optional) | BIOS installers | `list()` returns `UpdateItem` rows for BIOS, kernel, agent, grammars, global pnpm packages, skills and UI. `ready()` explicitly reports agent readiness, independently of agent activity. Emit `items` whenever rows or readiness change. Use `queued` for a row that waits for another component before it starts; it reads "Waiting" and doesn't count as updating. Use `starting` for an installed row that is only starting up: it reads "Starting" without a checked line, and the header shows a neutral "Starting" only when nothing is failed, updating or ready. A `failed` row with an installed `from` version reads "Update failed". `act(id, action)` resolves when dispatched or rejects with a displayed error; actions are `retry`, `update-now`, `restart-agent` and `reload`. Missing ports preserve existing adapters and report disconnected information in the panel. Optional `packages()` returns `PackageItem` rows for optional tools, each with a short catalog `id`, its npm `package` (shown in the name's tooltip and at the top of its Install log), `label`, a one-sentence `description`, the `commands` it provides, `requires` (other package ids, read as "Needs Python", "Installs Python too", or "Needs Python (not installed)" on an installed row), optional `notes` (short plain-text lines shown muted under the row, such as "1 untested dependency: …"; leave it out when there's nothing to say), `state` (`available`, `queued`, `installing`, `installed`, `outdated`, `updating`, `removing` or `failed`), the installed `version`, the `offered` version and its `size` in bytes, `progress` counted in packages (or `null` for an indeterminate bar), `error`, `actions` (`install`, `update`, `remove`, `retry`) and an optional `log`. Emit `packages` whenever they change. `actPackage(id, action)` keeps the row's button pending until it settles; it shows any confirm itself, resolves without a change when that confirm is cancelled, and rejects with a displayed error on a real failure. Hooks: `section[data-section="packages"]`, `li[data-id][data-state]`, buttons with `data-action`, `[data-requires]`, `[data-notes]` and `[data-error]`. Real installer wiring belongs to ai-ecoverse/slicc-bios#70. |
| `network` (optional) | BIOS | `status()` returns the `NetworkStatus`: `route` (`proxy` for slicc-node, `extension` for the Chrome extension relay, `tailnet` while a Tailscale exit node carries the traffic, `page` for the page's own fetch, limited by CORS, or `null`), `health` (`ok`, `limited` or `failing`, decided by the port), a one-line `detail`, recent `failures` (`{ url, error, at }`, newest first), an optional `extensionUrl` and an optional `browser` (`{ via, detail? }`, `via` being `extension`, `proxy` or `null` when browser automation isn't available; a legacy `declined` flag is ignored, since there is no consent prompt any more). Emit `network` when it changes. The optional `check()` tests the route again. An optional `tailnet` (`TailnetStatus`) shows the Tailscale section: `state` (`off`, `loading`, `needs-login`, `starting`, `running` or `failed`, a status light), a plain-language `detail` (progress, or the failure reason in an error box with **Retry** through `check()`), a `loginUrl` (**Sign in to Tailscale**, a new tab), the `node` (`{ name, addresses }`; the name and the first 100.x address, each with a Copy button), `exitNode` (the name in use or `null`), `exitNodes` (`{ id, name, online }`), `autoExitNode`, `shieldsUp` (a muted line when `true`, a warning when `false`) and `peers` (a count). The optional `setTailnet(on)` adds the **Use Tailscale** switch (`data-action="tailnet"`); `submitAuthKey(key)` adds an auth-key field to `needs-login` (a password field without a `name`, cleared on submit, never kept in component state); `setExitNode(id | 'auto' | null)` adds the **Exit node** picker (None, Automatic, and each node, offline ones disabled) to `running`, with a line saying where traffic goes; `logoutTailnet()` adds **Sign out**, behind a confirm. A rejected call shows its message in the section. Peers are never named beyond the exit-node list. Without the port, the indicator and the Network panel don't show. |
| `notices` (optional) | BIOS | `list()` returns `Notice`s for quiet, dismissible in-line notices at the top of every chat panel, above the transcript, in list order: `id`, `tone` (`info` reads as informative, `warning` as a notice), `title`, a plain-text `body` and `actions` (`{ id, label }`). Title, body and labels are text only. Notices use `role="status"` and never take focus. An action is a secondary button that stays pending until `act(id, action)` settles; a rejection shows its message under the body. The close button, labelled "Dismiss: <title>", hides the notice at once and calls `dismiss(id)` synchronously; it shows again only if the port drops the notice from `list()` and brings it back later. Emit `notices` whenever they change. Hooks: `[data-notice="<id>"]`, buttons with `data-action`, `[data-dismiss]` and `[data-error]`. |

The dummy supports `createDummyModel({ updates: 'boot' | 'starting' | 'current' | 'available' | 'restart' | 'failure' })`, also selectable with `?updates=` on `/ui/`. Fixtures stay stable for inspection; `model.updates.setScenario('current')` completes boot. Dummy Update now and Retry simulate download and link progress; Restart agent and Reload only change fixture state, never restart a real process or reload the browser. `createDummyModel({ packages: 'mixed' | 'empty' | 'fail' | 'off' })` (or `?packages=` on `/ui/`, off by default) adds invented optional packages in every state: Install and Retry finish after a short wait and install missing requirements too, `fail` makes them fail, and removing Python while uv is installed asks through the `confirm` option (the `/ui/` page passes spectrum's `confirm`). `updateFixtures`, `packageFixtures` and `DummyUpdates` are exported from `/dummy`. `createDummyModel({ mounts: 'mount' | 'cancel' | 'fail' | 'needs' })` (or `?mounts=` on `/ui/`) turns on the optional mount members, which are off by default: `mountFolder` mounts invented files at `/mnt/photos`, resolves with `null`, or rejects, as `model.files.mount.scenario` says; `needs` also lists `/mnt/photos` in `needsFolder()` until a folder is inserted there. `createDummyModel({ network: 'ok' | 'limited' | 'failing' | 'off' })` (or `?network=` on `/ui/`, default `limited`) sets the dummy network: slicc-node (with browser automation through it), the page fetch with CORS failures, or no route, all invented; `off` leaves out the port. `model.network.setScenario()` switches it and Check again re-emits after a short wait. `createDummyModel({ tailnet: 'off' | 'needs-login' | 'running' | 'failed' })` (or `?tailnet=` on `/ui/`, off by default) adds an invented tailnet: an auth key starting with `tskey-` signs in, `mast-pi` and `keel-router` are online exit nodes and `buoy-laptop` is offline, and Retry on `failed` connects. While the dummy tailnet runs with an exit node, the route is `tailnet` and the health `ok`. `networkFixtures`, `tailnetFixtures` and `DummyNetwork` are exported from `/dummy`. `createDummyModel({ changes: 'files' | 'git' | 'nogit' })` (or `?changes=` on `/ui/`, default `files`) adds a git `changes` port: `git` lists the pending changes under `/workspace/harbor` and `/workspace/skills` with their `repo` and no author, and `nogit` reports git as unavailable. `DummyChanges` is exported from `/dummy`. `createDummyModel({ notices: 'storage' | 'mixed' | 'fail' | 'off' })` (or `?notices=` on `/ui/`, off by default) adds an invented storage warning with Try again, which clears it after a short wait (`mixed` adds an informative notice without actions, and `fail` makes Try again fail). `noticeFixtures` and `DummyNotices` are exported from `/dummy`. `createDummyModel({ browser: 'idle' | 'driving' | 'off' })` (or `?browser=` on `/ui/`, default `idle`) sets the dummy browser: `idle` has a history of invented actions and no driven tab, `driving` has harbor and quiet-otter driving two tabs, with harbor's last click still running and frames every 500 ms while watched, and `off` has no tabs. Stopping an agent releases its tabs. `DummyBrowser`, `browserHistory` and `page` are exported from `/dummy`.

On phones the update status and the tray show only their status light and the network indicator a cloud icon, with the text in their labels and tooltips; the agent picker keeps room for the cone's name, cut with an ellipsis when long, and the bottom rail scrolls when needed. The update status comes first so progress and failures remain reachable on narrow screens.

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

- **`KernelFiles`** lists the OPFS root as the tree, reads and writes files through the OPFS API, and removes them recursively. Directories in `skip` show up but aren't scanned; paths in `hide` (and everything under them) don't show up at all. `start()` rescans on every `FileSystemObserver` record, or every `interval` ms (default 2000) where the browser can't observe OPFS, and emits `files` and a `file` per changed file, so open tabs follow what the terminal writes. Without an agent there are no pending changes.
- **`KernelTerminals`** opens `bash -i` (or `argv`) in `cwd` (default `/home`) through `kernelBackend`, one session per terminal, as many as the user opens. `open` (default 1) is how many it starts with.
- Everything else is idle (`IdleAgent`, `IdleBrowser`, `IdleMemory`, `IdleMonitor`, `IdleSprinkles`, `IdleTray`, from `idleModel(storage)`): empty lists, and actions that need a backend throw. Settings are kept in `storage`. Leave their surfaces out of `surfaces`.

Each section is its own port, so an embedder can mix real and dummy per section, for example `{ ...createDummyModel(), files: new KernelFiles(root) }`.

`<slicc-file-view>` has **Edit**: the file opens in a plain text area, and **Save** or `Mod+S` writes it through `files.write`; `Escape` cancels.

The `kitchen-sink` cone holds every kind of message, content and lick in one conversation, for design work and screenshots. The dummy's fixtures are invented: a small forecast API called harbor, with cones, scoops, a conversation per agent, pending changes (one of them binary, without a diff), browser tabs and accounts. Its only sprinkles are SLICC's own: `welcome` (the onboarding wizard, as a dip in the sliccy cone) and `suggestions`, copied from `slicc` (`packages/vfs-root/shared/sprinkles/`, commit `aa29784`) with their comments stripped, as is the sprinkle theme in `src/app/sprinkle-theme.css`. `suggestions` reads its stream from the invented `/home/.gelatiere/suggestions.json` through the bridge; there is no `/home/.welcomed`, so `welcome` starts its wizard. Its replies are scripted by keyword (tests, fix or add, open or docs, files, anything else), and their tool calls act on the other ports: an edit writes a file and shows up as a change, a browse opens a tab.

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
