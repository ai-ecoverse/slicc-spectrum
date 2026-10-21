# slicc-spectrum

Web components for SLICC: `<slicc-terminal>`, and SLICC's app UI on [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) (see [UI](#ui)).
`<slicc-terminal>` is a terminal built on [wterm](https://github.com/vercel-labs/wterm) (`@wterm/dom` 0.5.4 on the Ghostty VT core, `@wterm/ghostty` 0.5.4) that talks to [`@ai-ecoverse/slicc-kernel`](https://github.com/ai-ecoverse/slicc-kernel) through a small backend interface.
It is a standards custom element with no framework and no shadow root, so it can move to a shared web-components repo unchanged.

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

### `backend`

A `TerminalBackend`.
Setting it closes the current session and opens a new one.

### `cols`, `rows` attributes

Fixed grid size.
Without either, the grid fits the element and follows its size.
When the width changes, soft-wrapped lines reflow to it, on the screen and in the scrollback, with their colours and attributes; lines that ended in a newline stay as they are.

### `ready`

Promise that resolves with the element once wterm has mounted and the session is open.
Rejects if either fails.
Setting `backend` or removing the element replaces it with a fresh promise, and anyone still waiting on the old one gets the new outcome.

### `cols`, `rows` properties

Current grid size.

### `resize(cols, rows)`

Sets both attributes and resizes once.

### `fit()`

Removes both attributes and fits the grid to the element.

### `send(data)`

Sends a string or bytes to the backend, as if typed.

### `write(data)`

Writes a string or bytes to the screen without involving the backend.

### `redraw(data)`

Writes a string or bytes to the screen only, without answering any terminal query in it (for replaying history).

### `signal(name)`

Sends `SIGINT`, `SIGTSTP`, `SIGQUIT` or `SIGHUP` to the backend.

### `readText()`

Resolves with the text of the scrollback and the screen, with soft-wrapped lines joined into one.
The scrollback keeps 4 MB of cells, about 3,500 lines at 80 columns and 1,200 at 200.

### `focus()`

Focuses the terminal input.

Events, all `CustomEvent`s with the payload in `detail`: `ready` `{cols, rows}`, `resize` `{cols, rows}`, `exit` `{status}`, `title` `{title}`, `bell` `{count}`, `error` `{error}`.

It answers OSC 10 and OSC 11 color queries (`ESC ] 10 ; ? ST` and `ESC ] 11 ; ? ST`) with the foreground and background it shows at that moment, as `rgb:rrrr/gggg/bbbb`, so command-line tools can tell a light theme from a dark one and follow a theme switch.
The answer reaches the backend before replies to anything that comes later in the output.

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

Keystrokes reach `write` as the bytes a terminal would send: UTF-8 text, `\r` for Enter, `0x03` for Ctrl+C, escape sequences for arrows and function keys, and bracketed paste when the application has turned it on.
Pasted `\r\n` and `\n` line breaks are sent as `\r`, as xterm.js does, in both plain and bracketed paste.
The backend's line discipline turns `0x03`, `0x1a` and `0x1c` into signals, as a real pty does.
`signal()` is optional.
Without it, `terminal.signal()` writes the matching control byte instead, and `SIGHUP` is dropped.
Output may arrive in chunks of any size and split anywhere, including inside UTF-8 sequences and escape sequences.
While `open()` is pending, input (keystrokes, `send()` and wterm's automatic replies) is buffered and written in order once the session opens.
If that open fails or is superseded, the buffer is dropped.

### slicc-kernel

`kernelBackend(kernel, { argv, cwd, user, env })` adapts slicc-kernel's terminal API to the interface above.
`argv` defaults to `['bash', '-i']`.
`user` (a name or uid, slicc-kernel 1.44 and later) is who the session runs as; without it the kernel runs it as `root`, with `HOME=/root`.
It is typed structurally, so this package doesn't depend on slicc-kernel.
If the session fails, its error message is printed and `exit` reports status 1.

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

`npm run build` writes `dist/slicc-terminal.js` (one ESM bundle with no bare imports), its source map and `dist/ghostty-vt.wasm` (Ghostty's VT core, about 580 kB; it replaced the 27 kB `dist/wterm.wasm` of wterm's built-in core).
The bundle loads the WASM with `new URL('./ghostty-vt.wasm', import.meta.url)`, so `dist/` works from any path, including from OPFS through the slicc-bios service worker. It is fetched once per page and compiled once per URL, streaming when it is served as `application/wasm`, and each terminal gets its own instance. wterm's base64-inlined copy of its built-in WASM is left out of the bundle.
TypeScript declarations go to `dist/types/`, and the package's `types` export points at them.
Set `SliccTerminal.wasmUrl` before the first element connects to load it from elsewhere.
`dist/swc.css` (exported as `@ai-ecoverse/slicc-spectrum/swc.css`) is the pinned `@adobe/spectrum-wc` stylesheet with its tokens inlined, one file with no `@import`.
A page that puts a UI element straight into the document, such as a guest's page, links it and wraps the element in `<div class="swc-theme swc-theme--sizeM swc-theme--light">` and `<sp-theme system="spectrum-two">`, as `test/integration/page/guest/` does.

## wterm notes

Things found while building this against wterm 0.5.4, recorded here, not pushed upstream:

- The built-in Zig core doesn't reflow: on a resize it cuts or pads each row and keeps no soft-wrap flags (its bridge has no `getRowMetadata`), so a line wrapped at 45 columns stays on two rows at 120, and `readText()` and copy split it.
  It also maps 24-bit colours (`38;2;r;g;b`) to the nearest of the 256 palette colours.
  The element runs on `@wterm/ghostty` instead, which reflows on resize, keeps wrap flags in the scrollback and renders 24-bit and 256 colours exactly (xterm's 0/95/135/175/215/255 cube).
- Ghostty resolves palette colours 0–15 to RGB inside the WASM, so wterm's `--term-color-N` variables (and `--slicc-terminal-color-N`) would stop applying.
  The element gives the core a palette of 16 marker colours (`#51cc00` … `#51cc0f`) and maps cells in those colours back to palette indexes, so the CSS variables theme them and follow a theme switch, in the scrollback too. Text drawn in exactly one of those 24-bit colours shows in the theme's palette colour instead.
- Ghostty answers OSC 10 and OSC 11 queries itself, with the colours it was loaded with. The element drops those replies and answers from the theme it shows.
- Ghostty's `scrollbackLimit` is in bytes and allocated in pages, so the number of lines it keeps depends on the width. Its default of 10,000 bytes keeps about 300 lines at 200 columns; the element asks for 4 MB.
- `WTerm.destroy()` doesn't dispose a core passed in as `core`. The element disposes it.
- wterm sends pasted text with its `\n` line breaks unchanged, whereas xterm.js turns them into `\r`. The element does that conversion itself.
- `@wterm/core` always ships the WASM inlined as base64 behind a dynamic import. A build without it, or an explicit entry point that takes a URL, would save the bundler plugin.
- wterm focuses its input when it finishes mounting. `<slicc-terminals>` hands focus back to where it was unless the terminal was focused on purpose.
- wterm reads focus and selection from `ownerDocument` (`activeElement`, `getSelection()`), so selection and copy don't work inside a shadow root that wterm itself owns.
  That's why the element renders in light DOM.
  It still works when the element is placed inside someone else's shadow root.

## UI

`dist/slicc-ui.js` is SLICC's app shell on Spectrum 2, in light and dark.
It is moving from Spectrum Web Components 1.12 to Gen2 ([`@adobe/spectrum-wc`](https://www.npmjs.com/package/@adobe/spectrum-wc)): the Gen2 theme classes (`swc-theme swc-theme--sizeM swc-theme--light|dark`) and `--swc-*` tokens apply inside `<slicc-app>`, and icons are Spectrum 2 workflow icons from `@adobe/spectrum-wc-icons`.
Components Gen2 doesn't ship yet stay on 1.12 inside a scoped `<sp-theme system="spectrum-two">` ([#60](https://github.com/ai-ecoverse/slicc-spectrum/issues/60)).
It runs against a typed model, not against the kernel, the agent or the browser directly.
`dist/slicc-dummy.js` provides a dummy model that streams replies and tool calls with timers, and `dist/slicc-kernel-model.js` a real one for files and terminals on slicc-kernel (see [Kernel model](#kernel-model)).

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

The layout follows the width of `<slicc-app>`, which it reflects as its `screen` attribute: `phone` (under 640 px) has one column, `tablet` (under 1200 px) two, `desktop` three, like SLICC v6.
Each screen class starts with few panels open and saves its own layout (`slicc-ui.layout.v2.<screen>`).
Every surface has a home side, left, center or right.
Every panel has an icon in the left or right rail (on a phone, in one bar at the bottom, with the rest in its More menu).
The icon stays when its panel is open; while the panel is visible it shows selected (`.selected`, `data-visible`, labelled "{Title}, shown").
One click puts a closed panel back on its side, next to its neighbours, or brings an open one to the front.
A touch or pen tap on a rail button closes its tooltip: a Gen2 `swc-tooltip` ignores focus that comes in the same task as `pointerdown`, but a tap focuses the button a task later, so the tooltip opened and stayed while the button kept focus (after a tap on Chat, which leaves focus where it is).
Each thread, a cone's or a scoop's conversation, opens in its own chat panel (`chat:<agent id>`), as a tab in the same group as the other chats.
Selecting a thread opens or reveals its tab, activating a chat tab selects its thread, and a thread's chat closes when the thread goes away (frozen or deleted).

`surfaces` on `<slicc-app>` (default: every surface, exported as `surfaces`) is what the app offers: the panels it can open, the View menu, the rails and `Alt+1…9`.
A saved layout with a panel it doesn't offer is dropped for the default.
An embedder can pass a subset with its own `open` per screen class.
The agent picker and the tray show only when `chat` is offered, the update status only with `updates`, the network indicator only with `network` and a `network` port, and the settings button only with `settings`.
Elements with `slot="status"` show in the header as compact single-line items, before the update status, and are cut with an ellipsis when long; a `hidden` one takes no space.
There are no strips under the header.
On a phone the status items are hidden.

### Fonts

Text is Adobe Clean Spectrum VF, falling back to Adobe Clean, and code is Spectrum's Source Code Pro.
Source Code Pro (OFL) is in `dist/fonts/`, same origin.
Neither Adobe Clean can ship in a public package.
`<slicc-app>` registers the variable face (`adobe-clean-spectrum-vf`, weights 100–900) from `variableFont`, a woff2 URL that defaults to the Adobe Fonts file React Spectrum S2 uses; a host can point it at its own copy, or set it to `null` to leave it out.
The legacy faces come from `fontBase` (`AdobeClean-{Regular,Medium,Bold,ExtraBold}.otf`), which defaults to `/fonts/` on the current origin.
Every `*.sliccy.ai` host passes it through to v6, and `npm start` proxies it from `seven.sliccy.ai`.
The sans stack (`--swc-sans-font-family-stack`, also used by the 1.12 components) is the variable face, then Adobe Clean, then the system font stack, so text falls back face by face wherever a file doesn't load.
`?delay=` sets the dummy's tick in milliseconds (default 30) , `?color=light|dark|system` the theme, and `?grammars=` the grammar base.

### Elements

#### `<slicc-app>`

The shell: header with the agent picker, status items, the update status, the network indicator, the tray, the View menu and the theme switch, rails, and a `<slicc-dock>`.
Saves the dock layout per screen class to `storage` (default `localStorage`) under `layoutKey`.
The dock builds new panel content whenever it lays panels out again (a switch between phone, tablet and desktop, or a layout reset), so what the user opens in a panel (sections, cones, rows, folders, disclosures) lives outside the element, per model and panel (`view-state.ts`, in memory only): a rebuilt panel shows it again, and a click on the outgoing panel while the new one mounts reaches the new one too.
Files keeps its selected row, its keyboard focus target (without taking focus) and its scroll the same way, and Agents, Memory, Changes, Monitor, the Browser tab cards, Freezer and Settings keep their scroll; the chat log keeps its own. The scroll comes back once the list has laid out, anchored on the selected row when it was in view and otherwise on the first row in view, at the same distance from the top, so a narrower phone layout keeps those rows in view. A list scrolled to its end, Files included, comes back at its end. Files puts its scroll back even when the tree scrolls its focused row into view on its own. After that, a resize or new content keeps the anchored row where it was. These lists set `overflow-anchor: none` on their scroller, since they anchor it themselves. When the app switches models in place, each panel shows the state it keeps for the new model.
While connected it sets `overscroll-behavior` to `none !important` on the page's `html` and `body`, so only scroll areas inside panels rubber-band.
It sets the page's `color-scheme` to its resolved theme, and when the page has a `theme-color` meta per `prefers-color-scheme`, gives every one of them the content of the meta for that theme, so the page and the installed app's title bar follow the app's setting instead of the OS.
When the last app on the page is removed, the page's own inline values and `theme-color` contents come back.
With a `follow` port, the header shows a `<slicc-follow>` chip, and while the follower connects, waits to be allowed, is unlinked or fails, a `<slicc-follow page>` (`.alone[data-follow]` with the page kind) takes the place of the panels; without Terminal access, the terminal surface and New terminal aren't offered, and open terminals close when it's taken away.
It offers its `surfaces` (the View menu, More panels, the rails and, on a phone, the bottom bar and More), except the Network panel when the model has neither a `network` nor a `guests` port, and the terminal while terminals aren't allowed; rebinding to a model without either port closes Network.

#### `<slicc-dock>`

Generic.
[dockview-core](https://dockview.dev/) 8 with a theme mapped to Spectrum tokens, in its own shadow root.
Panels come from `factories` (`name → (params) => HTMLElement`).
`open`, `close`, `has`, `content`, `focusPanel`, `cycleGroup`, `cycleTab`, `toJSON`, `restore`, `clear`, and the full `api`.
Tabs have a context menu (close, close others, float, maximize).
Events: `layout-change`, `active-panel-change`, `panel-close`.

#### `<slicc-agents>`

A tree (`role="tree"`) of cones, with their scoops listed under them.
A cone with scoops starts with a quiet disclosure chevron (`data-action="toggle-cone"`, `swc-icon-chevron-right`, turned down when open and mirrored right to left); it's `aria-hidden` and out of the Tab order, since the row's `aria-expanded` carries the state.
The chevron only expands and collapses; a click on the row, <kbd>Enter</kbd> or <kbd>Space</kbd> selects the agent and makes it the active one, which also expands its cone.
<kbd>→</kbd> expands a cone and then moves to its first scoop, <kbd>←</kbd> moves from a scoop to its cone and then collapses it, and neither changes the active agent.
Several cones can be open at once, and they stay open for every view of the panel on the same model, so a layout switch keeps them; when the active agent has changed since the panel last showed it, its cone opens again as the panel mounts, so on a phone a cone you tapped still shows its scoops when you come back to Agents, and a cone you closed stays closed.
When the active scoop's cone is collapsed, the cone row takes the Tab stop.
A row's first line starts with one circle: its unread count when there are unread messages (`99+` from a hundred up, at `--swc-font-size-50`, white on the accent fill, or on the negative fill when the cone is in error), otherwise a dot coloured by status.
Then comes the name; the context fill, when it's high, sits in the top right corner.
Every row has up to two lines, aligned to the top under the name, starting with its status in words (`.state`, such as "Working"), then its conversation title, so the status stays visible when the unread count takes the circle; the accessible name and the tooltip say the status and the exact unread count too.
A cone with scoops has a ribbon line below: one segment per scoop, coloured by status at 3:1 or more on every row background, then its scoops in words, naming only the busy ones, as in "2 scoops · 1 waiting" ("2 scoops" when all are idle).
Its `aria-description` sums up every status, as in "2 scoops: 1 working, 1 idle".
Rows without scoops or errors have no empty ribbon or error line.
With no agents while the agent port's `starting()` returns a line, the panel says "The agent shows up here once it starts." (`[data-empty="starting"]`, subdued) and has no **New cone**; the line goes, and New cone comes back, once an agent arrives or the line clears.
The drop or delete button sits in its own column on the row's right edge, under the context fill, so the title ellipsizes before it and the focus ring stays whole; it shows on hover, on keyboard focus of the row, when <kbd>Tab</kbd> from the selected row reaches it, and always on touch, and it hides again once a pointer that clicked it leaves.
The selected row has an accent bar on its inline-start edge.
Under forced colors, the dots, segments, unread circle and selection bar keep `CanvasText`, `Highlight` and `HighlightText`.
A cone with scoops carries `aria-expanded`, and `aria-controls` names its scoop rows while they show.
Expanding and collapsing have no motion.
**New cone** sits at the bottom.
The conversation title is also shown in the header's cone picker: `Agent.title`, or else the first line of the first user message, or "No messages yet".
When cones share a name, their accessible names and the Delete cone, Freezer and confirmation labels add the title, as in "Delete cone sliccy (Hello from Bedrock)".

#### `<slicc-chat>`

One thread's conversation (its `agent`, or the active agent if unset), by day.
Files dragged anywhere over the pane (not text, links or the dock's own drags) show Spectrum's drop zone over the whole pane (`swc-dropzone[data-surface=drop]`, in its dragged state: an accent border on an opaque accent-subtle fill, so the transcript doesn't show through), with an illustrated message: an attach icon, "Drop files to attach" and what it takes ("Images, text and other files up to 25 MB each join your next message. Folders can’t be attached."); a polite status (`[data-announce=drop]`) says "Drop to attach files to your message". The zone stays while the drag crosses into the composer or another child, and goes 100 ms after the drag leaves the pane (`SliccChat.leaveAfter`), on drop and on <kbd>Esc</kbd>. A drop anywhere on the pane attaches to the composer; while there is no composer (watch-only, frozen), on a guest seat, or while the composer waits to reconnect, the pane shows no zone and still consumes the file drag (`dropEffect` `none`), so a drop never opens the file in the tab.
A message's time shows only when it is at least two minutes newer than the last time shown, and the first one after each day separator always shows; a hidden time stays for screen readers (`time.sr` with `datetime`, or `.sr` on licks and cards), and a meta row left empty isn't rendered.
User messages (with attachments and a quiet timestamp, `time.when`, by that rule; the reader's own carry no name or delivery tag, while `data-mode` and `data-delivered` still say how they went; a message from another cone, a follower or a guest says who sent it, and an agent's request carries its name and an Agent badge; a message from another agent, an agent's request or a message `from` a cone (`origin` `agent`, or `from` set without `origin` `follower` or `guest`), is `[data-remote]`: a subtle indigo bubble and a 🤖 pill on its bottom edge, `aria-hidden` since the byline names the sender; people, the reader included, never get it), assistant messages (with the time by that rule, and the model only on the first reply and whenever it changes from the previous one, `.meta .model` with the usage as its tooltip; without a model the usage is the time's tooltip, and with neither it is the reply's own (`.reply[title]`); the turn always carries the usage as its `aria-description`; the cone's name isn't repeated; Markdown with tables, task lists, quotes, code and images; thinking; tool calls, as the steps of the reply's response status (below); media galleries with images, video and audio; action cards for tools, pull requests and status; plans and checklists; inline diffs; question prompts (as decision cards, below); delegations; link previews; errors with a fix-it action, as a grey card (`.error-card[role=alert]`, `data-id` on system errors) inset by a wide margin on each side, a narrower one under 480 px: a red alert icon, the title in bold, the detail subdued and the action on the right, or under the detail below 360 px, announced as "Error: " and the title; an error with `action: 'login'` and an `account` (an `Account.id`) signs that account in: **Log in** calls `settings.connect(account)` synchronously in the click when the account is OAuth or needs no secret or fields, so a sign-in pop-up opens within the user gesture, and otherwise, or when `accounts()` doesn't have it, opens Settings at its row; the card follows the account's status from `accounts` (`data-login` is `idle`, `signing-in` or `connected`): while it is `signing-in` or `connect` is pending, **Log in** is pending and reads “Signing in…”, for an OAuth account the detail reads “Continue in the sign-in window that opened.” and, after `SliccChat.closedAfter` (20 s, since a closed window can't be detected), “Closed the sign-in window? Cancel, then Log in again.”, with **Cancel** (`data-action="cancel-login"`) when the port has `cancel`; once `connected`, the card is no longer an alert: a neutral info icon in the detail colour replaces the red one, the "Error: " prefix goes, the title reads “Signed in to {provider} again.” (the account's `provider`), the detail reads “Signed in. Retry to send it again.” (a polite status) and the button becomes **Retry**, which sends the last prompt again only when clicked; a rejected `connect` shows its message as negative help text (`[data-error=login]`), keeps **Log in** and adds a quiet **Open settings** (`data-action="settings"`) to that account; without an `account`, **Log in** opens Settings at Accounts, and watch-only and guest seats keep their gating; a content-filter stop offers **Drop the last turn**, which rewinds that turn and puts its prompt back into the composer; when the turns right before it failed too, the button reads **Drop N failed turns** and rewinds to before the first of them, putting the latest prompt back), system messages (error cards; compactions and notices, rewinds and model changes included, as full-width dividers with a line on each side, like the day: a compaction shows only its title, its `text` kept for screen readers, one that lost messages (`state: 'fallback'`, by default "Compaction failed, transcript truncated", or `discarded`, "Context discarded") an alert icon in the negative colour, and a notice its title and text on one line, `role="note"`; a divider that wraps keeps a short line on each side) and licks, SLICC's events into a cone, on every channel, on the right (`.lick-turn`): a byline with the title and the time by the two-minute rule, then a dashed box (`.lick[data-id][data-channel]`) with the text and the count (×3); emoji pills on its bottom edge (`.reactions .reaction`, `aria-hidden`, each named by its `title`) give the channel (⏰ Schedule, 🪝 Webhook, ✨ Sprinkle, …) and the outcome (👍 Allowed, 👎 Denied, also said in the box's hidden text).
A lick with a body is a `details.lick` whose head (`summary.lick-head`, with a quiet chevron that turns when open) toggles it with a click, <kbd>Enter</kbd> or <kbd>Space</kbd>; clicking the body doesn't close it.
A reply's tool calls are the steps of its response status (`swc-response-status[slot=status]`, `data-id` the reply's), at the top of the reply: one `swc-response-status-step` per call (`id` `run-` and the call's id, `data-tool`, `data-status`, `data-kind`, and `data-id` the message the call came from), labelled with the tool and its `title`, `active` while it runs, `complete` when done and `stopped` when it failed or was cancelled, which its label says in words (" · Failed", " · Cancelled").
The status keeps `data-action="open-cluster"` and each step `data-action="open-run"` with `data-target` the call's id: clicking the host from script opens it, as the old strip's buttons did, and opening a step opens its status too.
A step whose call has anything to show labels itself with a button (`.run-toggle`, `aria-expanded`, `aria-controls`) that opens the call under the step's row, at the full width of the column and indented to the step's text, in our own region (`.run-detail#detail-` and the call's id, `role="listitem"`, `hidden` while closed, `data-target` the call's id), not in Spectrum's 340 px description; the step carries `data-open` while it's open. The region is the call: its input (a shell command after `$`), an edit's `diff` shown as a diff view, its output, both kept on their lines and scrolling sideways rather than wrapping, with its ANSI styles shown (bold, dim, italic, underline, inverse, and the 16, 256 and truecolor foregrounds and backgrounds; the 16 foregrounds come from `--slicc-terminal-color-0` to `-15` when an embedder sets them, else the terminal panel's light tokens, which adapt in dark (so a card in dark uses Spectrum's colors, not the panel's VS Code ones); the 16 backgrounds are Spectrum's subtle tints under the default text, black a solid grey under the lightest grey, so text keeps 4.5:1; a 256 or truecolor background shows as a tint, blended toward the card (12% in light, 25% in dark), and one too close to the card to see, such as white on a light card, gets a grey tint toward the card's text instead; a 256 or truecolor foreground keeps its hue but moves toward black or white until it has 4.5:1 on the card or its tint, and other text on such a tint takes the card's text colour under the same floor; the card and its text colour are read once for light and once for dark, so the colours follow the theme through `light-dark()`, and a chat that can't read them (outside the Spectrum theme, where it shows the colours as sent) tries again only when it reconnects or the theme changes; dim subdues default text and turns a bright color into its normal one) and every other escape stripped, a partial escape at the end of streamed output waiting for the rest (the model still sees the raw bytes, and a copy gets the text without escapes), an `image`, such as a screenshot, an optional `meta` such as a timeout, the time a joined call ran ("Ran at 16:12", `.ran`, by the two-minute rule), and its `notes` (`{ severity, text }`, such as "Exited with code 5" or "Full output in /tmp/…") as lines under the output, `li[data-note][data-severity]`: `error` with an alert icon in the negative colour, `warn` with an alert icon and `info` with an info icon, both subdued.
The status's header is always one line: while the reply streams or the agent works on the run, it is `active`, with the running call (or the last one) as its label and that call's kind as its loader, and each label stays for at least a second before the next one replaces it, so streamed arguments don't make it flicker; a reply without calls shows "Generating response" only until its first text or visible thinking.
Done, the status stays as `complete`, also when a call never left `running` (the step stays `active`): one call reads as its tool and `title`, more as the model's label for them or, until there is one, a count of the two most common kinds and the rest, such as "3 commands, 1 read" or "5 commands, 4 agent steps and 9 more", led by any failures ("1 failed, 1 cancelled · "), so the one-line header never cuts them off; a stopped reply says so.
Every call of a reply is in its one status, above its text; a later reply with text starts a new run, while a standalone tool message or a reply with only tool calls, streaming or done, joins the status of the run before it on the same day (hidden thinking and source links don't count as text), so a turn never collapses when its calls finish and past messages never move down.
A label never shows what may be a secret: after a sensitive key (`token`, `secret`, `password`, `api_key`, `Authorization` and the like) with `=`, `:` or a flag's space, at a word that starts with a known secret prefix (`ghp_`, `sk-`, `AKIA`, `xoxb-`, `eyJ` and others), or, while the call runs, at a last word that could still grow into one, it ends in "…"; the step's description shows the call as the agent sent it.
Spectrum notes: a step's description is at most 340 px wide (`.swc-ResponseStatusStep-detail` has no part or custom property for it), which is why a call opens in our own full-width region instead; a public hook for that width would let it use Spectrum's description. Two Spectrum behaviours are worked around: the header label is one line on a token line height (`--_swc-response-status-label-line-size` and `line-height: 0` on the status), because its cross-fade otherwise lays the label out 1.4 px off its settled place; and the label slot is never empty while active, because Spectrum then shows the running step's own label, which changes with every streamed chunk.
The label for two or more calls comes from the agent port's optional `toolLabel(agentId, callIds)`, asked once for each agent port, agent and set of calls; while a growing run waits for its new label, it keeps its last one.
Open licks, statuses and steps hold for every view of the chat on the same model, so a layout switch keeps them.
A lick's `severity` (`warn` or `error`) adds an alert icon to its byline, a coloured edge to its box and a spoken prefix.
A lick's optional `summary` (one plain line) replaces its `text` in the box and wraps instead of being cut, and its optional `report` (a file path) adds **Open the report** (`data-action="open-report"`, which fires `open-file` with the path) to the expanded lick, so a lick with only a `report` expands too.
A `scoop-notify` lick never shows the agent's bracketed status line: a `text` that is `[scoop … completed]`, `failed` or `stopped` (or `[@… completed]`) reads "Scoop {name} finished", "Scoop {name} failed" or "Scoop {name} stopped", the name being its `title` without the role in brackets, a failed or stopped one takes the `error` tone and a ❌ pill, named and announced as Scoop failed or Scoop stopped, instead of ✅, and its body, without that line, renders as markdown (`.report .text`), its headings stepped down to the chat's `####` size so the card doesn't outshout the chat.
Pending permission requests (`sudo-request` licks with `state: 'pending'`) and open questions are decision cards in the centre column (`.decision-turn[data-pending]`, `data-id` the lick's or the question's), inset by a wide margin on each side, a narrower one under 480 px, with their buttons on the right: **Deny**, then **Allow** (`data-action` `deny` and `allow`), or the question's options.
A request's command (its `body`, `pre.command`) is never cut: it wraps in full, in monospace, open or closed. When it runs past four lines (measured as rendered), the card shows the first four, a subdued "Show the full command to allow it." (`[data-allow-hint]`) and a quiet **Show the full command** with a chevron (`data-action="full-command"`, `data-shown` on it while shown, its `aria-expanded` on Spectrum's inner button, then **Hide the full command**), and has no **Allow** until the whole command shows; Deny and the countdown always stay. Showing it scrolls the whole card into the region when it fits, else its actions. A shown command stays shown for every view of the chat while the request waits; guests and timed-out requests show it whole.
A request with `expiresAt` counts down as m:ss; the count is hidden from screen readers, which hear its end time, then "Less than a minute left" and "Timed out", so the log's live region doesn't speak every second; a timed-out request (`data-expired`) loses its buttons.
While pending, cards leave the log for their own region between the header and the log (`section.asks`, named "Waiting for you"), so they never cover the transcript and the log ends below them; the log keeps an empty marker where each was asked (`.ask-place[data-place]`, the card's `data-id`). The region shows the newest card; with more than one waiting, a bar above it (**N waiting**, `data-action="show-waiting"`, `aria-expanded`) shows them all, oldest first (`.asks[data-open]`), and shows the countdown of the soonest timed card it hides. A hidden card stays mounted (`.ask[hidden]`), so a typed answer survives, and a new ask never hides the card that has focus: the list opens instead. Showing another agent closes the list and its details. The region is opaque, with a hairline and a soft shadow on its bottom edge. Open, each card is compact: its title line, its command and its actions, the request's text cut to one line and the rest of it behind a quiet chevron (**Show details**, `data-action="ask-detail"`, `data-detail` on the card while shown). The region takes at most half the chat's height and always leaves the log room for the composer and its fade (and a few lines more while closed); when the cards need more, it scrolls inside, the bar stays on top, a fade at the bottom edge (`.asks[data-more]`) says more is below, and the scrollbar shows on hover and focus. Every card is a tab stop before its actions, and focusing anything in a card scrolls the whole card into the region.
Clicking a waiting card (not its controls), or <kbd>Enter</kbd> on it, scrolls the log to where it was asked, at the bottom of the view above the composer.
When a card leaves the region (answered, timed out or decided elsewhere) while it has focus, focus moves to the newest card still waiting, else the composer; a timed-out card goes back to its place in the log.
Under `prefers-reduced-motion`, nothing animates and the scroll is instant.
The header is one row: the status, a model picker that names each model's provider and leaves out classifiers and models with `tools: false` (with no model on offer, **Set up a model**, `data-action="set-up-model"`, opens Settings), the thinking picker, the context meter and **New conversation**, which calls `clear` and puts focus back in the composer; on a cone, when the port can freeze, its tooltip says the old conversation stays in the Freezer.
It never wraps: when it's short of room, the model picker's label is cut with an ellipsis, and under 560px wide (`header[data-compact]`) New conversation is icon-only, with `accessible-label` and its tooltip.
The pickers re-read `models()` on `settings`, `accounts` and `agents`.
When a live agent's model, or `Settings.model`, is no longer offered and its provider (the id before `/`) isn't a connected account, it moves to the offered chat model with `default: true`, else the first one; frozen agents are left alone, and so is everything on a follower unless it has Control and is connected.
The chat re-runs this on `follow` and `readOnly` too, and `<slicc-app>` does it as well, when it binds, on those events and on `follow` and `readOnly`, so a new cone that starts on a provider that isn't set up moves at once.
The transcript pads its end, and its `scroll-padding-block-end`, by the composer's measured height plus the height its frosted layer fades out over (`--composer-fade`, 72 px, 0 under `prefers-reduced-transparency` and `forced-colors` and without a composer), so at the bottom the last line sits a line above the glass, and a focused element scrolls clear of it.
The log follows new content only while it sits within one line (its `line-height`) of the bottom. Scrolling up by wheel, touch, keys or the scrollbar stops that, and the log then keeps its place, whatever re-renders or ticks; content that grows above the view, such as a tool card opening, doesn't move what's in view either. New output while the reader is scrolled up shows **Jump to latest** (`data-action="jump-latest"`), floating over the log's bottom edge above the composer, with the number of new items, "Jump to latest (2 new)", once there are any; it, or scrolling back to the bottom, resumes following, and so does the reader's own send.
While a reply streams, its status icon follows what it is doing: a pencil for an edit, a page for a read, a magnifier for a search, an eye for the browser and an hourglass for any other tool; thinking and text keep the AI logo.
Between the header and the transcript, a `<slicc-notices>` shows the model's notices.
On a follower without Control, or while the agent port's `readOnly()` returns a line, a note (`p[data-follow="watch"]`, that line first, else the follow-based one) takes the composer's place, the header shows the model's name instead of the pickers and New conversation, and there's no suggested follow-up.
An empty chat says "No messages yet.
Ask sliccy something." with the agent's name, and only "No messages yet." while watch-only.
While the agent port's `starting()` returns a line, the chat has no empty state (`[data-empty]`): the embedder's notice says what's going on, and the header, with no agent yet, shows a neutral "Starting…" light (`[data-starting]`) instead of "No agent".
With the model's `seat` set, the chat is a guest's page: the header shows only the cone's name (`[data-seat-cone]`) and its status, with no pickers, meter or New conversation; the guest's own messages (`origin` `guest` whose `seat` is the seat's `id`, or, without a `seat`, whose `from` is its `label`) read as the reader's own, with no name, while other guests keep "From {label}" and the host's messages read "From the host"; an open question or a permission request takes the normal card border, without its buttons, form or countdown, and stays in the log (no `data-pending`), and says "The host answers this."
(`[data-host-answers]`, subdued); once answered, it shows the answer as everyone sees it; a reviewed guest message's outcome (a notice titled "It was approved.", "Nobody approved this in time.", "It was declined." or "It was withdrawn.", with the message as its text) reads as the quoted message, cut to one line, then the outcome (`.marker[data-ended]`); an approved one shows only "It was approved.", since the delivered message follows right after it; inline sprinkles inert with "View only on this device", error cards have no action and there's no suggested follow-up; the models aren't settled, and files can't be dropped.
An empty guest chat says "No messages yet.
Say hello to sliccy."

#### `<slicc-notices>`

The model's `notices` as in-line alerts with their actions and a close button (none with `dismissible: false`), after a banner from the `tabs` port when another tab is paused or runs a different SLICC, and a warning for each waiting approval when the `approvals` port has no `decide` (`[data-approval-notice]`, with `[data-approval-kind]`); renders nothing without any.

#### `<slicc-approvals>`

The model's waiting `approvals` as a modal alert dialog, one at a time, oldest first; `<slicc-app>` mounts it.
Renders nothing without `approvals.decide`.
A request that `secretRules()` flags shows a warning (`[data-secret-rules]`, the path or token) and no **Always allow (**Always allow in this directory**, with the cwd in its hint, when the approval has `alwaysScope: 'cwd'` and a `cwd`)**.
The command (`[data-command]`, or a guest tool call's `[data-summary]`) wraps in full; past four lines the dialog shows the first four and **Show the full command** (as in the chat, `data-action="full-command"` with `data-shown`), and shown, it scrolls inside its own box of at most `min(16lh, 50dvh)`. Always allow, its hint and Allow once wait until the end of the command has been in view (a zero-size `[data-end]` after its last line), and so does the element's `decide()` for anything but `deny`; once seen, the end stays seen while the request waits, and hiding the command again hides them again. Until then a subdued line (`[data-allow-hint]`) says "Show the full command to allow it." or, shown, "Scroll to the end of the command to allow it." The dialog keeps one width, so only its height changes. A closed request shows its command whole.
Focus starts on Deny (on Close once `decide` rejects) and goes back, after Deny, Always allow, Allow once, <kbd>Esc</kbd> or Close, to what had it when the dialog opened; inside a terminal, to that `<slicc-terminal>` through its own `focus()`, even when it remounted meanwhile.
Guest requests (`guest-message`, `guest-tool`) get their own copy, the guest's text as plain text (`[data-guest-text]`), attachments (`[data-attachments]`), the automatic check's verdict (`[data-verdict]`), and Deny and Allow once, plus **Always allow** (`data-action="always"`) with a hint saying what it covers when the approval's `always` is `true`; the dialog body carries `[data-approval-kind]` and fills the dialog's width at every size.
Tray requests (`tray`) get their own title and one sentence (`#asking`), and only **Deny** (`deny`, focused) and **Allow once** (`once`), never Always allow.

#### `<slicc-follow>`

The model's `follow` state.
By default a header chip (`#chip[data-follow]` with the link state: **Connecting to**, **Following**, **Reconnecting to**, **Unlinked from** or **Can’t reach** the owner; `compact` keeps only a follow icon and the light) whose popover says what this device can do (`[data-can]`), that the conversation may be out of date while reconnecting, and with Control that sending waits (`[data-reconnecting]`), and has **Leave** (`data-action="leave"`, behind a confirm unless unlinked).
With `page`, the full page for `connecting`, `waiting` (connected without View: "Waiting for {owner} to allow this device"), `unlinked` and `failed` (`[data-follow-page]`), with **Try again** (`data-action="retry"`) when failed and the port has `retry`, and **Leave**.
A rejected call shows its message (`[data-error]`).
Renders nothing without the port.

#### `<slicc-composer>`

The message box.
<kbd>Enter</kbd> sends, or steers a running reply: the message joins after the current tool round, without interrupting; <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> queues a follow-up that runs after the reply and can be withdrawn; <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line; <kbd>Tab</kbd> takes the suggested follow-up; <kbd>↑</kbd>/<kbd>↓</kbd> at the start or end walk this agent's history; <kbd>Esc</kbd> stops.
`/` completes commands (`/clear`, `/compact`, `/model`, `/thinking`, `/scoop`, `/stop`, `/freeze` when the port can freeze, `/theme`) and their arguments, `@` mentions agents and files.
Attach from the computer, from SLICC's files, a browser screenshot or a shared secret (with a `vault.put`, the popup takes the value too, checks it like Settings › Secrets, puts it in the vault and attaches the name, showing errors inline and clearing the field; an empty value shares a name the vault already has, and a new value for one asks before it replaces it; while the vault is away (`availability()` `connecting` or `waiting`) or locked, it takes no value and says so; without one, it attaches the name and says to add the value in Settings › Secrets), or paste and drop files (25 MB each; a dropped folder, told apart by its drag entry, becomes a “Folders can’t be attached” chip, and a file that can't be read a “Could not read the file” chip, instead of an attachment).
<kbd>Esc</kbd> in the `+` menu closes it, from any item, and puts focus back on `+`; it goes no further, so it doesn't also stop a reply.
Queued messages wait above it in a dashed box (`--swc-neutral-visual-color`, 3:1 or more against the composer in both themes), to send now or drop; a steer the agent still holds (`mode: 'steer'`, `li.queued[data-mode=steer]`) reads "Sends at the next step" and can only be dropped.
Model and thinking pickers.
Where the browser has speech recognition, the `+` menu ends with **Enable push to talk** (`settings.pushToTalk`, optional and off by default), a checkable item (`menuitemcheckbox`, `aria-checked`) described as "Hold Alt+M to dictate", which stays open when toggled; Settings has the same switch.
While it is on, holding <kbd>Alt</kbd>+<kbd>M</kbd> in the field (by `code`, so <kbd>Option</kbd>+<kbd>M</kbd> on a Mac types no µ; not with Ctrl, ⌘ or Shift, nor during IME composition) dictates into it, the field's description ends with "hold Alt+M to dictate", and releasing either key, or leaving the window, stops it.
Without speech recognition there is no item and no switch, and Alt+M types as usual.
It floats over the end of the transcript on a frosted layer that fades out over `--composer-fade` above its top edge; under `prefers-reduced-transparency` the layer is solid, and under `forced-colors` it is `Canvas` with a top border.
There's no row of key hints: the keys are the field's accessible description ("Enter sends, Shift+Enter adds a new line, / lists commands, @ mentions.", and while a reply runs "Enter steers, Ctrl+Enter queues, Escape stops, …"; with send on Enter off, Ctrl+Enter sends and Enter adds a line).
The field's status icon, which is decorative, follows the input: the AI logo when empty, a pencil while typing, a brush for a moment after <kbd>Backspace</kbd> or <kbd>Delete</kbd>, a microphone while dictating; it stays the AI logo while a reply streams, and it swaps without animation.
Drafts are kept per agent.
On a follower while the link reconnects, the field is disabled and says so; the draft stays.
While the agent port's `starting()` returns a line (no agent yet, but one is on its way), the composer stays usable: its placeholder is that line, there are no `/` or `@` popups, and sending, attachments included, adds a row above the field that reads "Sent when the agent starts" (`li.queued[data-mode="starting"]`), which can be dropped (`data-action="unqueue"`); a row with text and files says how many files go with it (`[data-files]`).
Whenever the model changes or its agent port fires `starting` or `agents`, and the current model's port has no line (`null`, or no `starting` at all) and `agent.list()` has an agent, the page sends the rows in order to that model's active agent (else the first one) through `agent.send`, the first like a normal send and the rest with `mode: 'queue'`, and the rows go; if the line clears with no agent, the rows stay until one comes. Inside `<slicc-app>`, the app sends them for its current `model`, once, whether or not a composer is connected, so they also go while the chat is hidden (dockview detaches hidden panels, such as when Install / Update opens in the chat's group); a composer outside `<slicc-app>` sends them for its document, once however many are connected.
A line that comes back closes an open `/` or `@` popup.
The rows are kept for the page (for the `<slicc-app>` the composer is in, else for the document), not for the model, so a model swap (an embedder that puts a new `SliccModel` on `<slicc-app>` once the agent is there), a layout switch and a dock rebuild keep them.
They're also kept in `sessionStorage` (`slicc-spectrum.starting`, so per origin and per tab) until they're sent or dropped: each row's text and `mode`, and only the name, type and size of its attachments, never their contents; each page (each `<slicc-app>`, or the document) rewrites only its own rows there.
Only a reload of the same tab brings them back (the navigation's type is `reload`); any other load, such as a duplicated tab that got a copy of the storage, clears them, so nothing is sent twice.
After a reload the rows come back in order with their text; attachments can't be restored, so a row that had any isn't sent on its own.
A row with text and lost files is held (`[data-held]`): it shows an alert icon instead of the clock, a second, muted line "Not sent: tides.csv wasn’t kept after reload." (or "Not sent: 2 files weren’t kept after reload.", `[data-lost]`), **Put back** (`data-action="restore-starting"`), which puts its text into the field (after any draft, on a new line), focuses it and drops the row so the files can be attached again, and **Dismiss**.
After **Put back**, a muted line under the field with a paperclip icon (`[data-reattach]`) names what to attach: "Attach tides.csv again.", "Attach tides.csv and notes.txt again." and, with more than three, "Attach these 4 files again: …"; it's a quiet button (`data-action="reattach"`) that opens the file picker. It follows the listed files by name: attaching tides.csv leaves "Attach notes.txt again.", other files don't change it, and removing a listed file brings it back; it hides while all of them are attached, and goes once the field is cleared or the message is sent. The list is kept with each agent's draft, and a file is listed once.
A row that had only attachments shows the alert icon, its file names and "Not kept after reload", and reads "Not sent. Attach the files again." (`[data-unsent]`) with **Dismiss**.
Neither kind is sent on arrival or holds the other rows back, which still go in order; they stay until they're put back or dismissed.
Text typed but not sent while it starts is kept for the page the same way, and stays in the field once the agent arrives.
While the agent holds tool results for the vault (`agent.hold()`), a status line above it says "Waiting for the vault" or "Unlock the vault to continue", with how many results are held, and offers the vault's **Unlock** button when locked and the model has a `vault`; if the browser blocks the vault window, the line says to allow pop-ups.
With the model's `seat` set it's a guest's composer: <kbd>Enter</kbd> and the send button send through `agent.send(cone, text)`, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line and <kbd>↑</kbd>/<kbd>↓</kbd> walk the guest's own messages; there's no steer, queue, Stop, attachments (the field is `collapsed`, so its + is hidden and inert, and pasted files are ignored), `/` commands, `@` mentions, + menu or push to talk, and it never reads files; its description is "Enter sends, Shift+Enter adds a new line."
A rejected send shows the rejection's message above the field (`[data-send-error]`, `role="alert"`) and puts the draft back, ahead of anything typed since.
The guest's messages waiting for review (`agent.queue()`) show above the field as rows reading "Waiting for review" (`li.queued[data-mode="review"]`), with no Send now or remove, and the composer never calls `unqueue`.
A quiet line under it (`[data-seat-note]`) says who reviews ("The host reviews what you send before it reaches the agent." for `user`, "An automatic check …" for `agent`, the cone's name for `cone` and `scoop:<name>`), or "You’re chatting with sliccy as {label}." when `gates.messages` is `off`, and adds "Your link expires at {time}." when `expiresAt` is under a day away.

#### `<slicc-files>`

The file system as a `<slicc-file-tree>`, with pending changes as git status.
It starts with the folders of the pending changes open; once the user opens or closes a folder, every view of Files on the same model shows the same folders open, a rebuilt one included.
Opening a file opens it in a tab.
With `files.mountFolder`, **Mount a folder…** (`data-action="mount-folder"`) mounts a local folder, then selects and expands it in the tree; with `files.mounts`, a **Mounted** strip lists the mount points (with `files.mountInfo`, each mount with a `source` reads `/mnt/proj · ref-node/proj`, `data-source` on its `.path`), each with **Eject** (`data-action="eject"`, `data-path` the mount point) when the port has `eject`.
With `files.needsFolder`, a **Needs a folder** section lists the mount points waiting for a folder, each with **Insert folder…** (`data-action="insert-folder"`, `data-id` the mount point), which calls `mountFolder(path)`.
A failed mount, insert or eject shows its message under the bar.
Above the tree, **Search files** (the shared `sp-search[data-action=search]` from `search.ts`, as in Memory) filters the tree to the matching paths while it holds text, or hides it and says “No files match.”
(`.note[data-empty]`) when none match; a letter or digit typed in the tree moves into it, <kbd>↓</kbd> goes back to the tree, and <kbd>Esc</kbd> in the tree, or opening a file from it, clears the search.
File icons are monochrome, so colour in the tree only means git status.

#### `<slicc-file-view>`

One file (`path`), highlighted, with its pending change and a link to the diff.

#### `<slicc-changes>`

Pending changes with their author, by name, which follows `agents` so an agent that arrives later replaces its id (also in `<slicc-diff-panel>`'s bar).
Opens the diff, accepts or reverts one change or all of them (**Accept all** and **Revert all** are `data-action="accept-all"` and `data-action="revert-all"`).
While watch-only (`watchOnly()`: a follower without Control, or the agent port's `readOnly()`), the list and the diffs stay but no Accept or Revert shows: a subdued "Watch only" (`[data-watch-note]`, plain text, not a live region) stands where Accept all and Revert all were, and a revert confirmed after that is dropped.
With nothing pending it says "No pending changes.
Edits by agents show up here for review.", and only "No pending changes." while watch-only.
Changes with a `repo` show their folder relative to it, and no author when `agentId` is `null`; they group under a header per repository (its path and count), even when there is only one, in the order the port returns them.
In a diff panel narrower than 480 px, Accept and Revert (`data-action="accept"`, `data-action="revert"`) show only their icons.
Revert and Revert all ask with a destructive confirm that says the uncommitted (or, without a repo, pending) changes can't be undone; a failed revert shows its message under the bar.
When the port's `unavailable()` returns a string, the panel shows it instead of the list, with each `backtick` span as inline code in the text's color and, below, each command once with a **Copy** button (`data-command`, `data-action="copy-command"`).

#### `<slicc-diff-panel>`

The diff of one pending change (`path`), unified or split, with accept and revert, except while watch-only, when a subdued "Watch only" (`[data-watch-note]`) stands in their place and the path keeps its ellipsis.
A change with `before` and `after` both `null` (a binary file, or text over 1 MB) shows “No diff for this file” and Open the file instead, and keeps Accept and Revert.

#### `<slicc-terminals>`

Terminal sessions in tabs, each a `<slicc-terminal>` on the session's `TerminalBackend`.
Sessions stay alive while hidden; `exit` closes the tab.

#### `<slicc-browser>`

What the agents' browser control is doing.
It opens on the most recently driven tab (`.focused`), or on the tab overview: cards (`li[data-id]`, `data-controlled` while an agent drives the tab, `data-pulse` when another tab starts being driven, without switching to it) with a thumbnail, the agent and a small **Stop <agent>** (`data-action="stop-agent"`), and an address bar to open a URL.
The focused tab has **All tabs** (`data-action="all-tabs"`), a tab picker (a list of tabs at 720 px and wider), the URL with **Copy** (`data-action="copy-url"`) and **Open** (`data-action="open-tab"`, activates the tab), who's using it (`.driving[data-driving=agent|user|none]`; a controlled tab without an agent reads **In use** and has no Stop) with a small **Stop <agent>** (`data-action="stop-agent"`) in the same row, which keeps its height with or without an agent, a view-only preview (`figure[data-view]`: `live` while watching with a frame under 3 s old, `shot` with "Updated N s ago", `none`) and the recent actions (`li[data-action-id][data-kind][data-status]`, failures with their error inline), the tab's own filtered first, then the latest 50, with **Show more** (`data-action="more-actions"`) adding 50 earlier ones each time up to all the port has ("Showing the latest N of M"); the list scrolls and takes focus.
Actions with a URL (`open`, `goto`, `request`) expand (`data-action="action-url"`, `aria-expanded`) to show the full URL, or the request line, under the shortened one.
Below 480 px they fold into **Recent actions (n)**, a chevron disclosure counting all of them, with the last one showing.
The tab the user opened (or **All tabs**), expanded URLs and an open **Recent actions** hold for every view of the panel on the same model, so a layout switch keeps them; a closed tab lets go, and the panel opens on the most recently driven tab again.
Labels, URLs and errors are text only.
With no tabs and `browser.via` `null` in the network status, it says browser control isn't connected (`data-browser="none"`) with the extension link and the commands to install and run slicc (`curl -fsSL https://get.sliccy.ai/slicc | sh`, then `slicc`, or `npx sliccy@next` with Node).
The Browser rail button carries a dot (`data-driven`) while a tab is in use.

#### `<slicc-settings>`

Theme, the model and thinking level for new cones, composer and diff preferences (push to talk only where the browser has speech recognition), and accounts to connect, reconnect or disconnect.
When the `updates` port has `setDeveloper`, an Updates row has the **Developer mode** switch (`sp-switch[data-setting=developer]`, `checked` from `developer()` on every `items`), described as "Check npm for newer releases that aren't certified yet, and offer them as betas in Install / Update."; while `setDeveloper(on)` is pending it is disabled with `aria-busy` and a progress circle, and a rejection shows its message under it (`[data-error]`).
An account whose status is `signing-in` (or a non-API-key account while its `connect` is pending) reads “Signing in…”; when the port has `cancel(id)`, its row offers Cancel (`data-action="cancel-sign-in"`), and the rejected `connect` that follows shows no error.
A `signing-in` account can carry `signIn` (`{ url, code? }`), which only counts while it is `signing-in`: the embedder's `connect(id)` opens the pop-up in the click and sends it to `url`, and Spectrum never opens a window itself.
With a `code` (a device code), the row (`.notes`), the **Add {name}** step (under its buttons, so they don't move) and the chat's expired-session card read “Enter this code on the sign-in page:” over the code in large monospace (`[data-id=sign-in-code]`, `user-select: all`) and a quiet **Copy** (size `m`, `s` in the chat card like its other buttons, `data-action="copy-sign-in-code"`, “Copy the code”) that writes it to the clipboard and reads “Copied”, also in a polite status, for two seconds, or “Couldn’t copy” when the clipboard refuses.
A `url` is a quiet **Open the sign-in page** link (`data-action="open-sign-in"`, a new tab with `rel="noopener noreferrer"`), for when the window was closed or blocked, only when it is `https:`, has no username, password or port, and its exact hostname is a known sign-in host for that account's id (`signInHosts` in `sign-in.ts`: `openai-codex` `auth.openai.com`, `xai` `accounts.x.ai`, `kimi-coding` `www.kimi.com`).
Any other `url` shows as plain selectable text (`[data-id=sign-in-url]`), with no link and no Copy, under a quiet warning with an alert icon (`[data-id=sign-in-unknown]`): “This sign-in page isn’t one SLICC knows. Check the address before you go there.”; the code and its Copy stay.
Without `signIn`, the signing-in view is unchanged, and the code and link go once the account is no longer `signing-in`.
An account with `auth: 'oauth'` and `secret: 'api-key'` signs in or takes a key: its primary action signs in, calling `connect(id, undefined, undefined, { method: 'sign-in' })` within the click.
Under it, a quiet standalone link-style button **Use an API key instead** (`button.swc-Link[data-action="use-key"]`), aligned with the row's text, opens the account's key form without Cancel and focuses its field (underlined in LinkText in forced colors), and **Sign in instead** (`data-action="use-sign-in"`) under the form closes it and focuses the sign-in button again.
Its key goes to `vault.put` as for any `store: 'vault'` account (or as the `secret` without one), then to `connect(id, undefined, fields, { method: 'key' })`, and it never reads “Signing in…” while that is pending.
Disconnect and Remove delete its key record first, as for any vault-backed key, and **Sign in instead** is hidden while its key connect is pending.
Every other account calls `connect` without `options`, as before.
Accounts with `group: 'mcp'` (MCP servers) get their own **MCP servers** heading (`.accounts[data-group=mcp]`).
An `api-key` account asks for its `secret`: “{provider} API key” by default, “{provider} token” for `secret: 'token'`; when it is `expired` it reads **API key rejected** or **Token rejected**.
An MCP server with `auth: 'oauth'` signs in in a pop-up: its button reads **Sign in**, and it reads **Needs sign-in** when `disconnected` and **Sign-in expired** when `expired`.
An account with `fields` (`{ name, label, required?, placeholder?, help?, customBase?, options?, value? }`) shows a plain labelled input for each, with its `placeholder`, its current `value` and its `help` as a line under it, and their values go to `connect(id, secret?, fields)`; the key field above them gets a visible `sp-field-label` too ("Amazon Bedrock API key"), and both span the form's width. A field with `options` (`{ value, label }`) is an `sp-picker[data-account-field]` instead, labelled by an `sp-field-label` (clicking it focuses the picker), `aria-required` when required, with its `help` under it and in its `description` slot, and when refused `invalid`, with “Select a {label}.” in its `description` slot and under it without a second icon, so a provider can offer only the values it accepts, such as Bedrock's regions; it starts on the field's current `value`, otherwise, or when `value` is none of the options, on the first option, and it never holds back Connect in the provider picker, since it always has a choice. An empty `options` list is a disabled picker reading “None available”, never a free-text input, with the help text “Nothing to choose from yet. You can connect without it.” under it in the same field group (`[data-empty]`), and doesn't hold up Save even when `required`. The plain inputs' border is `--swc-neutral-visual-color`, which keeps 3:1 against the page. The dummy's Amazon Bedrock account has a region picker; connecting keeps the chosen values as the fields' `value` and shows the chosen options' labels in the row (“API key · Europe (Frankfurt)”). A field with `vaultSetting` fills that vault setting: the first save puts the key with `settings` holding every such field that has a value (a `customBase` field only when its value is a bare name, such as an Azure resource; an `https:` one goes through `endpoints` instead), and once the key's record is live and the vault port has `settings` (and `put`), the key may be left empty, so **Connect** waits only for the required fields and an edit sends the full object through `vault.settings(name, 'model', settings)` before the endpoint change and `connect`. A refusal shows on the field it names (its `vaultSetting`, name or label), else on the key or the form, and stops before `connect`; when a keyless edit fails after its `settings` call, the record's previous settings are put back. Records saved without settings keep working until they're saved again.
An account with `store: 'vault'` keeps its key in the vault when the `vault` port has `put`: the masked key field (C5's value rules) goes to `vault.put(name, key, undefined, { kind: 'model', provider: account.id })` (or `{ kind: 'mcp', server }` for `mcp:<server>` accounts, named `MCP_<SERVER>_TOKEN`; model records use pi-ai's environment-variable name), then `connect(id)` runs without the secret; a connected one says “Key kept in the vault”, “Token kept in the vault” or “Kept in the vault”, and Disconnect removes the record first.
Without `store: 'vault'` or `vault.put`, the key goes to `connect(id, secret)` as before.
An `mcp:<server>` account with an `https:` `url` (the server's URL), when the `vault` port has `endpoints`, asks before its token is saved: “Connect to {url}?”, “SLICC sends this token only to {url}.”, **Connect** with Cancel focused; then the token goes to `vault.put`, the URL to `vault.endpoints({ add: { mcp: [{ server, url }] } })` and the account to `connect`, and a refusal shows on the token field and stops. The page keeps its own registrations (server and URL, not secret) in `localStorage` under `slicc-spectrum.mcp-endpoints`, written after a successful add or change and cleared after Disconnect takes the URL back. When the account's `url` differs from that registration, or, with none, from a first-use pin (the record's `url` while `SecretView.pinned` is `true`; a bridge's loopback `url` without `pinned` never counts), the row adds **Reconnect** (`data-action=reconnect-mcp`) and the note “The server moved to {url}. Reconnect to send the token there.” (`[data-notice=moved]`); after the same confirm, one `endpoints` call removes the old registration (none for a pin, which a registration overrides) and adds the new, then `connect` runs. Disconnect takes the URL back after removing the token. Settings registers MCP URLs itself, never through the agent.
A `show-surface` whose `section` is an account id scrolls to that row and focuses its button, and `accounts` scrolls to the Accounts heading (`h2[data-section=accounts]`).
With a `vault` port, **Secrets** (`<slicc-secrets>`) follows.
With `providers()`, Accounts lists only the added providers (`.accounts[data-group=providers]`), connected first, then expired, signing in and not connected; each row adds **Remove** (`data-action="remove-account"`, a quiet delete icon named “Remove {provider}”) when the port has `remove`, which asks “Remove {provider}?” (“Its key is deleted from the vault. Models from it stop working.”, “Its sign-in is deleted from the vault…” for OAuth, only “Models from it stop working.” for a local one) with a destructive **Remove** and Cancel focused, then runs `vault.remove(vaultName, 'model')` for a vaulted key and `settings.remove(id)`, stopping with the vault's error inline when it refuses; Disconnect removes the same record and keeps the row.
Before the row goes, Remove closes its tooltip and waits for it: a Gen2 `swc-tooltip` that updates after its row is removed throws (`getRootNode().getElementById is not a function`), which a pointer click on Remove without the vault used to trigger.
An account with `blocked: 'cors-free-transport'`, which the port sets while the current transport can't reach it, says “Needs the SLICC extension or CLI, because the browser blocks direct requests to it.” under its row (`.notes [data-notice][data-blocked]`) with an inline **Set up** link (`data-action="setup-network"`) that sends `show-surface` `{ id: 'network', section: 'whole' }`, so Network opens at Get the whole web; its Connect, Reconnect and Save are disabled, and a connected one keeps its key and identity, reads **Unreachable** (a notice light with the word) and keeps Disconnect and Remove. When `blocked` clears, through the `accounts` and `providers` events, the notice and Set up go and everything enables again; `needs` alone shows nothing. An OAuth account that is signing in says “Continue in the sign-in window that opened.”, then, after `SliccChat.closedAfter`, “Closed the sign-in window? Cancel, then Log in again.” (`[data-signing]`).
**Add a provider** (`data-action="add-provider"`, a quiet button under the list) opens a modal picker (`dialog.picker[data-picker=pick]`): **Search providers** filters `providers()` in their order by every word of the name, id and description; each row (`.option[data-provider][data-auth][role=option]`) shows the name, the `description` and a hint (API key, Sign in, Endpoint and key, On this device), and, while it is `blocked`, “Needs the SLICC extension or CLI” with **Set up** (`.option[data-blocked]`); added providers read **Added**, and added and blocked ones can't be picked by click, Enter or Space (`aria-disabled`; the arrows still reach them, and Tab reaches Set up); no match reads “No provider matches “{q}”.”. Down arrow moves from the search to the rows, Up, Down, Home and End walk them, typing goes back to the search, Enter or Space picks, Enter in the search picks the first match that isn't added, and Escape closes and gives focus back to **Add a provider**.
Picking one opens **Add {name}** (`dialog.picker[data-picker=connect]`, `.step[data-step=<auth>]`): `api-key` and `fields` get the key form (the vault form when there is one, `vault.put(vaultName ?? recordName, key, undefined, { kind: 'model', provider: id })`), with the provider's `fields` and **Get a key** (`data-action="get-key"`, `keyUrl` in a new tab); **Connect** stays disabled until the key and the required fields are filled; a `customBase` field whose value is an `https:` URL is bound to the key's record after its `put` and before `connect`, with `vault.endpoints({ add: { model: [{ name, url }] } })` (`name` is the record's, `vaultName ?? recordName`; without a vault record nothing is bound) (a bare name, such as an Azure resource, isn't), a refusal shows on that field and `connect` doesn't run, a changed URL (against the field's `value`, else the one this page bound) is one call that removes the old and adds the new, and a bare value only removes the old; a rejected `connect` reverses that call and shows on that field when it names it as a whole word (or https, URL, port or userinfo); **Remove** leaves the URLs to `vault.remove`, which drops them with the record; the saved `value`s prefill the fields and count as filled; `oauth` gets **Sign in** (`data-action="sign-in"`), which calls `connect(id)` within the click, then reads “Signing in…” with Cancel and the same window hints; `local` says “SLICC connects to {name} on this device.” and offers **Connect**. **Back** returns to the list. A rejected `connect` shows its message inline and keeps the form and its fields, clearing only the key; once the account is `connected`, the picker closes and focus lands on its row.
Without `providers()`, Accounts is as before.
When the model for new cones was moved off a provider that isn't set up, a quiet note under its picker (`p[data-switched][role=status]`) says “Switched to {model} because the previous model's provider isn't set up.” until a model is picked.

#### `<slicc-secrets>`

Settings › Secrets from the model's `vault`.
It never shows a value or a placeholder.
Value fields are `type=password` with no reveal toggle, are read once on submit and cleared at once (on success, refusal, error, cancel, close and disconnect), and are checked before the vault is called: under 8 UTF-8 bytes, CR, LF or NUL, or containing `fnox_proxy_` are refused with the vault's own wording.
Values go only to `vault.put` and are never kept on the element or put in an event.
The head shows **Locked** or **Unlocked** and the lock mode ("Unlocks automatically in this browser", "Unlocks with a passkey" or "Unlocks with a passphrase"); locked, the vault's **Unlock** button (`slicc-vault-button[data-action=unlock]`); unlocked, **Lock** (`data-action="lock"`, with `lock`) and the vault's **Protect with a passkey** (lock `auto`) or **Change protection** button (`data-action="protect"`).
A status line (`[data-availability]`) says "Waiting for the vault" while `availability()` is `connecting` or `waiting` (or `status()` is `null` without it), and "Unlock the vault to continue" while `scrub.needed` and not `scrub.ready`.
Waiting requests show under **Waiting for you** (`[data-request]`, the agent's `prompt` as plain text under "From the agent, not checked by SLICC:", capped at 200 characters, and "Expires in N min"), with **Enter value** (`data-action="answer"`, which fires `value-request` with `{ id, vault }` for the `<slicc-value-request>` on the same vault) for `value` requests and **Cancel request** (`data-action="cancel-request"`); `oauth`, `jerk-seal`, `jerk` and `unseal` requests say what they ask for and offer Cancel request only.
With `backupReminder: 'due'`, an alert (`[data-backup]`) offers **Export backup** (`data-action="export"`) and **Not now** (`data-action="dismiss-backup"`, with `dismissBackupReminder`).
**Add secret** (`data-action="add-secret"`, `[data-form=add]`, a name and a value; a name that exists asks before it replaces the value), **Import…** (`data-action="import"`, `[data-form=import]`: Bundle, KeePass or six, a file, an optional password, then a pick of candidates, all checked but the `refused` ones (disabled, with their reason), marked "Replaces a secret" when they exist, with their suggested rules as untrusted text and a note that the file's rules aren't applied, and **Import N**, which sends `{ name, kind }` for a candidate of another `kind`; then "Imported N" and "Skipped NAME: reason" for each skipped name, from `reasons`) and **Export…** (`data-action="export"`, `[data-form=export]`: a passphrase twice, at least 8 bytes, behind a confirmation, downloaded as `slicc-secrets-<yyyy-mm-dd>.slicc-vault`, with "Last exported" or "Never exported" from `exportedAt`).
Saved shows "Saved NAME in the vault" (`[data-said]`).
The secrets, sorted by name (`li[data-secret][data-state]`, with `[data-rules]`, `[data-exits]` only when restricted, `[data-exec]` (any command, the listed commands, every bash) and how often programs were given it today, `[data-source]`, `[data-used]`, `[data-expires]`; a model record or an MCP token no rule names reads “Used for” (`[data-used-for]`, model requests to its provider or requests to its MCP server, by the agent) instead of where it's sent, with its account's state as its light, and shows its Provider (`[data-provider]`, the account's name) or Server (`[data-server]`)) offer **Replace value** (`data-action="replace"`, for `settings`, `process` and `import:*` secrets that aren't sign-ins) and **Remove** (`data-action="remove"`, behind a confirmation, passing the secret's `kind`), and removed ones, under **Removed**, **Restore** (`data-action="restore"`; ENOENT reads "Removed too long ago to restore").
Locked, every form (Add secret, Replace value, Import, Export) says "Unlock the vault first" (`p[data-locked]`) next to the vault's own small **Unlock** button (`slicc-vault-button[data-action=unlock]`) and disables its submit; once unlocked, the form stays open with what was typed and its submit enables.
Vault errors show their message, EACCES as "Unlock the vault first" and ENOTSUP as "This arrives with a later vault version".
Each action shows only when the port has its method.
Then **Rules SLICC refused** (`[data-refused]`), where the rules live (`[data-policy]`) and **Activity** (`ol.audit li[data-seq][data-type]`; an entry with `uid` and `tag` both `null` reads "by you", a `refresh` entry "Refreshed automatically" (with the sign-in it used), an `endpoints` entry (vault-originated, no "by …") one part per field it carries: (1.91.0's `EndpointsEntry` had a required `purged` with `url`; no vault wrote it before 1.13.0, so the shape was corrected rather than kept, with `purged` optional and `host` replacing `url`) `purged` "Removed custom model URLs an agent set, automatically: {provider name} at {host}, …. Only you can set a model URL now, in Settings › Accounts" (the provider's name from `settings.accounts()`, else its id), `adopted` "Kept the MCP servers your tokens use, automatically: {server} at {host}, …", `pinned` "{name} pinned to {host} automatically, on first use" with **Unpin** (`data-action=unpin`, calling the vault port's optional `unpin([name])`; disabled while the vault is locked; a failure shows in the row as `[data-error=unpin]`, in the same words as other vault failures; it's hidden once a newer `unpinned` entry for that name is in the log), and `unpinned` "{name} unpinned from {host}; the next use pins it again", an `mcp` entry "Sent to the MCP server SERVER at DOMAIN" with its request and exit, a `session` entry (a value the vault handed the kernel for a verified TLS session, vault 1.15.0) "Sent over {HTTP/1.1, SMTP or Postgres} to {domain}:{port}, {trusted by public roots, or trusted by its pinned anchor}, through {exit}" (no trust part when an older entry has no `verifiedBy` or a newer vault sends one spectrum doesn't know; a protocol it doesn't know reads as its raw name), and a policy entry lists its changes, its warning and, when accepted, how to change the file back; **Only reveals to programs**, `data-action="reveals"`, and **Show older**, `data-action="older"`).
The section's `data-vault` is `locked`, `unlocked` or `loading`.
A popup the browser blocked shows how to allow it (`[data-popup=blocked]`).
Widened-rule notices aren't shown.
An open **Removed** list (`details[data-removed]`) stays open across a layout switch.

#### `<slicc-vault-button>`

Places `vault.button()`'s element (the vault's own button frame), posts its `config` (`ButtonConfig` plus `theme`) once the button is `ready`, sets the frame's `color-scheme` to `theme` (or leaves it to the page) so the frame stays transparent, takes the reported `size` (with the focus-ring `inset` as negative margin) and `label` (as its title), moves focus to the control before or after it when the frame reports `focus` (`previous` or `next`), and fires `vault-popup` (bubbles, composed) with each `popup` event's `{ intent, state }`. spectrum sends only the `unlock` and `protect` intents.

#### `<slicc-value-request>`

The vault's waiting `value` requests (`fnox set` on a terminal) as a modal dialog, one at a time, oldest first, with "N more waiting"; `<slicc-app>` mounts it.
`dialog[data-request]`: "Enter a value for NAME" (a Name field when the request has no name), who asks, as on the Settings card ("docs-pass asks for NAME", or "A program running as uid N asks for NAME"), the prompt under "From the agent, not checked by SLICC:", a masked value field with the same rules as Settings › Secrets, "Expires in N min", and **Later** (`data-action="later"`, or Escape: closes, the request stays in Settings › Secrets, whose **Enter value** reopens it), **Cancel request** (`data-action="cancel-request"`, with `cancel`) and **Save** (`data-action="save"`, `put(name, value, request.id)`, with `put`).
Locked, it shows the vault's Unlock button and disables Save.
It closes, clearing the field, when the request leaves `waiting` or while the vault is away.

#### `<slicc-updates>`

Install / Update: component states, version changes, last checks, download and link counts, action buttons, failures with Retry, and collapsible install logs behind a quiet chevron, which stay open across a layout switch.
A row with a pending version change (`from → to`, or a package's `version → offered`) and release notes shows a What’s new disclosure after the row's actions (in package rows, after the command chips), next to the Install log, `details[data-releases]` with `summary[data-action="whats-new"]`, which stays open across a layout switch like the log. It lists every release after the installed version up to the new one, newest first, each as `.release[data-version]` with its version linking to the release page (`a[data-action="release-notes"]`, named "Kernel 1.13.0 release notes"). Only the newest (`.release[data-newest]`) shows its notes; each older release is a collapsed header, `details.release` with `summary[data-action="release"]` holding the same chevron, its version link and badge across the full row and named "Kernel 1.12.2 notes, certified", that opens to its notes indented under its title and stays open across a layout switch like the disclosure (an older release without notes is a plain header). The notes are rendered as markdown in strict mode (`markdown(text, { strict: true })`: raw HTML tags are dropped and their text kept as plain text, only `https:` links stay links, and an image becomes a link with its alt text, so nothing loads; the notes' headings sit one level under the release's, through `level`). Notes over 8 KB (8,192 characters) per release are cut at the last line break before that, with "…" and a Read the full notes link (`[data-cut]`, named "Read the full notes for Kernel 1.13.0"); a release whose `url` isn't `https:` shows its version as plain text. The `<!-- cert-verify -->` block is dropped, and a block that starts with "certified" shows as a subtle Certified badge (`[data-certified]`); a heading line naming the version is dropped too, since the link already shows it. Without notes in the range there is no disclosure.
Certified is shown only for ai-ecoverse releases (a `url` of `https://github.com/ai-ecoverse/<repo>/releases/…`) whose cert block names the same package and version (`certified <pkg>@<version>`; the package is checked on package rows, which know their npm name), and any other cert block is still dropped without a badge.
An up-to-date row (no pending change) links its installed release with Release notes next to the version; an installed optional package without one links its npm page instead (`a[data-action="npm-page"]`, named "npm page for Biome 2.2.4"), built from the package name alone as `https://www.npmjs.com/package/<name>` with each part of a scoped name encoded, never from npm's homepage or repository. Pins and additions in Your packages show no link. Every link opens in a new tab.
An install shows one bar for update rows and package rows alike: it fills 0–50% while downloading and 50–100% while linking (`value` against `max-value="100"`). While the row runs it never goes back, not when pnpm's total grows and not when progress drops out between passes. While a download reports `bytes` with a total above 0, the first half fills by bytes and the value label reads "10.0 MB of 40.0 MB". Otherwise, and always while linking, the label falls back to the phase's "n of m" count. The bar starts at 0 again once the row settles.
Opens at boot until the agent is ready without failures.
Background updates stay in the header's update status; new failures reopen the panel, and after a reload into a boot that isn't ready yet such a panel closes once the agent is ready.
Every automatic close is saved to the layout.
When the port offers packages, an Optional packages section lists them below as compact rows, each with its state, version, size, requirements, commands, progress, errors and Install log; packages never count in the header or keep the panel open at boot.
A row's description is clamped to two lines at every width, and the row's buttons carry it as their accessible description (`ariaDescribedByElements`), so it can always be read in full.
While npm hasn't answered for a row (`registry: 'checking'`) its description slot reads "Checking npm…"; when npm can't be reached (`registry: 'unreachable'`) the row shows no description line at all, since the section hint says it once (`li[data-registry]`). Such a row has no Install and no light, an installed one keeps its version, Remove, npm page and Install log, and `retry` is never shown on it.
When a row is unreachable the section hint reads "Couldn’t reach npm, so versions and sizes aren’t shown." with one secondary **Retry** next to it (`data-action="retry-registry"`, named "Retry reaching npm", only when the port has `refreshPackages`). While it runs the hint reads "Checking npm…" and Retry is pending; when npm still can't be reached, the hint goes back and a polite live region (`[data-still]`) says "Still couldn’t reach npm." once. Retry keeps focus while it stays, and hands focus to the Optional packages heading whenever it goes while focused. An unreachable row that isn't installed shows only its label, and no row with `registry` describes its buttons.
A row with `withheld` reads "Not offered: <reason>." in a subdued line under its description (`[data-withheld]`, capped at 200 characters), and never shows Install or Update: an outdated withheld row reads Installed with its installed version.
A row with `newer` offers its older `offered` version as usual and says why the latest isn't offered in the same subdued line (`[data-newer]`), such as "0.26.0 isn’t offered yet: needs slicc-kernel 1.48.0 or newer."; a row that has both shows only `withheld`
With a port that has `setDeveloper`, a row's `npm` check shows under its version: "npm: no newer release", "Checking npm…", its `reason` when the check failed (the state light stays), "{installed} (certified) · {latest} on npm, not offered: {reason}" (a certified update keeps its target, "6.6.0 (certified) → 6.7.0 · …", and so does a beta row, "6.13.5 beta · certified 6.6.0 → 6.7.0"), or, when `offered`, "{installed} (certified) · {latest} on npm, not certified" with "12 packages change in /opt/agent." (the folder in the label's parentheses; "1 package changes …"), followed by "@slicc/kernel-bridge and @slicc/vault stay at their certified versions." for `gated` ("… stays at its certified version." for one) and **Install beta**; `article[data-npm]` is the state.
A row with `beta` has a notice **Beta** badge by its name (`[data-beta]`), a notice "Beta installed" light while it is `current` or `installed` ("Up to date" means the certified version only; Ready to apply, Failed and the running states keep their words), reads "{version} beta · certified {certified}" and offers **Back to certified** next to its other actions; Install beta shows only while `npm` is `offered`.
While `npm` is `offered`, What’s new covers the releases from the installed version up to npm's `latest`, so an offered beta lists its own notes.
Install beta and Back to certified are secondary buttons and call `act`; without `setDeveloper` (a mirrored port) neither shows.
For now bios sets these on the agent row only; the other rows follow with bios.
Packages the user added with pnpm in `/opt/user`, or pinned, show up in their own Your packages section below it, under "Packages you added with pnpm in /opt/user. Seven’s updates keep them until you remove them." (plus "Pinned versions stay until you unpin them." while a row offers `unpin`), with a neutral Pinned light (a hold, not a success) or a positive Added light, their version against seven's, and Unpin or Remove.
Also available through View and the rails.

#### `<slicc-memory>`

What agents remember, grouped by section: search, filter by scope and tag, expand, edit, add and forget.
The scope picker starts on **Everyone** (`*`), which lists every memory with its scope on it (`.scope[data-scope]`); `global` reads **Shared** whatever the port calls it, and the cones and roles follow.
The count (“N of M memories”) counts the memories in the picked scope.
With a search or tag filter that hides everything it says “No memories match.”, otherwise “No memories yet.”, “No shared memories yet.” or “No memories for {scope} yet.”
Each memory is a row (`li.row[data-id]`, divided from the next by one straight hairline, a square-ended `--swc-border-width-100` rule in the neutral border colour that spans the row, even where the row's hover fill is rounded) with one structure open or closed: the title line (`.head`, the disclosure button) keeps its chevron, title and marks where they are, and the text below it (`.content`) shows two whole lines closed (the clamp leaves room for one paragraph gap, so a second paragraph's first line is never half cut and doesn't move when the row opens) and grows into the full text in place when the row opens, so opening only adds height below. It stays open across a layout switch. Open rows (`data-open`) take no fill, so nothing reads as selected; the chevron turns down. Height and chevron move like Spectrum's accordion (`--swc-animation-duration-100`, ease in and out), and not at all under `prefers-reduced-motion`. A click on a closed row's text opens it too.
An open row ends in an action row: first its tag and scope in words next to their icons (`.meta [data-label=tag]`, `[data-label=scope]`, such as “Project” and “harbor only”), since touch has no tooltips, while a closed row shows only the icons; the open row hides its title-line tag and scope icons (`visibility: hidden`, so the title keeps its place) instead of showing them twice; then at the trailing end **Edit** and **Forget** (`data-action="edit"`, `data-action="forget"`), Forget in the negative content colour and asking first with the destructive confirm.
At the end of the title line, small icons (`.mark`, `role="img"` with an `aria-label` and a tooltip) carry the metadata: the tag (`.tag[data-tag]`: User a file with a person, Feedback a comment, Project a briefcase), “From MEMORY.md” for free text outside an entry (`.from`), and under Everyone the scope (`.scope[data-scope]`: Shared a group of people, a cone a person, a role a person with a gear, labelled “Shared” or “{name} only”).
The tag is left out where the list already says it: under a section heading that names it (Projects, User, Feedback) and while the tag filter picks it.
Below 560 px of panel width, the search takes its own line over the two pickers.
The search field is the shared one from `search.ts` (`sp-search[data-action=search]`), as in Files.

#### `<slicc-monitor>`

The live monitor: vitals (`.vital[data-id]`), each a meter when it has a `ratio` (budget, fullest context) and otherwise a value, its unit and delta on one line and a sparkline from its `series` (spend, active agents, processes, process memory).
Each card keeps its place whatever it shows: the value line never wraps (a unit or delta that doesn't fit is left out whole rather than cut, and stays in the line's `title` and its text; a vital's optional `hint` replaces that tooltip, such as the exact reset time behind "resets in 4 days"), a card without a `series` keeps the sparkline's room, a meter keeps its description's line, and a card left alone on the last row spans it, so short and long values, 0% and 100%, and missing data move nothing below them.
Then alerts (an alert's optional `command` shows after its detail, led by its `commandLabel` or "Run", as unwrapped code with **Copy**, `[data-command]` and `data-action="copy-command"`), and the sections (the agent's Tasks, Processes and Recent problems, then terminals, tabs, pending changes and tray followers; cones and sprinkles have their own panels; any other section an agent sends, such as an older agent's `agents` or `sprinkles`, renders the same way).
Each section (`li.section[data-id]`) shows its count and an attention badge, and opens its surface with **Open** where one exists; the counts line up in one column whether or not a section has **Open**, and a section without rows keeps its name in line with the others (`agents`, `terminals` and `processes` → terminal, `tabs`, `changes`).
A section with rows expands into them with its toggle (`.toggle`, `aria-expanded`; `data-open` on the section): collapsed by default, expanded while a row is `warn` or `error`, until the user toggles it; that choice holds for every view of the monitor on the same model, so a layout switch keeps it.
Each row (`li.row[data-status]`, `data-id` from the row's `id`) shows a status light (blue active, gray idle, orange warn, red error, with the status spoken), the name, the meta line and its badges, indented by `depth` (`data-depth`, up to 6).

#### `<slicc-freezer>`

Every conversation in the session, from `frozen()`: cones, scoops and agent runs, each with a kind badge, live ones first with a Live light, then the newest first.
A live row offers **Open**, which selects that agent; a stopped one offers **Thaw** and **Remove**, which deletes its working folders after a confirmation.
A thawed scoop or agent run keeps its row, which says what it was thawed as.
**Delete cone**, in the agents list (or <kbd>Delete</kbd> on a cone's row) and the header's cone picker, stops a cone after a confirmation; `/freeze` does it at once.
Either way its conversation stays here, and a row without a `kind` counts as a cone.
A title longer than two lines ends in an ellipsis and carries its full text as a `title`; the dummy's titles are the whole first line of the first message, so only the card cuts them.
A row with `v6: true` came from SLICC 6 and carries a neutral outline **SLICC 6** badge (`data-badge="v6"`, `data-v6` on the row), set apart from the gray model badge.
When the agent port has `importProfile` and `importCancel` and the page is neither watch-only nor a guest seat, the bar offers **Import from SLICC 6** with an import icon (`data-action="import-v6"`), shortened to **Import** when the Freezer is narrower than 26rem (its accessible name and tooltip always say "Import from SLICC 6"), on the bar's first row, which picks a `.zip`; dropping a zip on the Freezer (with a "Drop to import" dropzone while dragging) does the same.
A zip is a `.zip` name or an `application/zip` or `application/x-zip-compressed` type; deeper checks are left to the preview. Dropping or picking anything else shows an inline error under the bar (`data-error="not-zip"`, a polite status): "That’s not a SLICC 6 export. Use the .zip from Export for SLICC 7.", which clears on the next drop or pick, or with its dismiss button (`data-action="dismiss-not-zip"`, which puts focus back on Import).
Either opens `<slicc-freezer-import>`, a modal (`dialog[data-import]` set to `checking`, `preview`, `importing`, `done` or `failed`): `importProfile(file, { preview: true })` runs behind a progress circle and "Checking the profile…"; then **Import from SLICC 6?** shows the agent's `text`, a summary (cones, scoops, frozen, skills, crons, webhooks, size, on one row when the dialog is wide and in four equal columns when it's narrow, so no cell sits alone on a row) and its notes (`[data-note]`): "You imported this export on {day}." when `already` is set, "Sign in again in Settings: {providers}." (named by their accounts), a **Warning:** with an icon for credential-like files, which are imported for review afterwards (their zip paths as code; more than three fold under a quiet chevron), and a muted "Not imported: {n} mounted folders." behind a folder icon, so every note's text starts at the same edge.
**Import** (`data-action="import-confirm"`, **Import again** with `again: true` after an earlier import) runs the import with a progress bar from the `importing` event, announced only when it starts and ends; **Done** (`data-action="import-done"`) after "Imported {n} cones." and the report path with **Copy** (`data-action="copy-report"`) closes it and focuses the first imported row.
A rejection shows the error card with its sentence (a check without a `preview` shows "Couldn’t read this export. Try another zip."), **Try again** (`data-action="import-retry"`, picks again) and **Close**; **Cancel** or <kbd>Escape</kbd> while checking or importing calls `importCancel`.

#### `<slicc-sprinkle>`

A SLICC sprinkle (`.shtml`), as a panel or, with `inline`, as a dip in the chat that grows to fit, even when it loads out of view (the frame measures itself on load, after icons and fonts arrive, and on every resize).
A dip has a tab-like handle: drag it into the dock (or onto a rail, or use its open-as-panel button) and it lives on as a sprinkle panel, with a note in the chat where it was; which dips are out is saved in `slicc-ui.dips`.
It runs in a sandboxed frame (`allow-scripts` only) with SLICC's sprinkle theme (the `--s2-*` tokens and `.sprinkle-*` classes), the app's fonts, and Lucide icons (`<i data-lucide>`, `LucideIcons.render()`).
It talks back through `slicc.lick({ action, data })`, which reaches the owning cone as a `sprinkle` lick, and, when the port has `call`, reads files and keeps state (see [Sprinkle bridge](#sprinkle-bridge)).
Panel sprinkles sit at the top of the right rail with their Lucide icon.
On a guest's page (the model's `seat` set), every sprinkle, inline or panel, is view only: its frame is inert, it says "View only on this device", and its licks and `setState` calls go nowhere.

#### `<slicc-network>`

Network: the route and its health in plain words with the bios `detail`, a line on browser automation (`data-browser`: through the SLICC extension, through slicc on this computer (`proxy`, or a linked device on this computer), through a linked device's browser, that slicc on this computer has no browser to control when it carries the traffic and `via` is `null`, or not available with how to get it) when the status has `browser`, **Check again** (`data-action="check"`) when the port has `check`, an **Internet traffic** picker (`data-action="exit"`, in `[data-exit-picker]` with the exit's kind) when the port has `setExit`, the route line saying where traffic goes, and under the picker a warning that traffic waits while the chosen device isn't connected (`data-exit="device"`, `data-held`, with **Send directly**, `data-action="exit-direct"`, which calls `setExit(null)`) or, when `route` isn't `tailnet`, the Tailscale exit node in use (`data-exit="node"`), a **Tailscale** section (`data-tailnet` with the state) when the status has `tailnet`, a **Linked devices** section (`data-links`: `linked`, `connecting`, `reconnecting`, `offline`, `none` or `permission`; each device row has a **Prompting** or **Watching** badge, `data-controlling`, while it controls the agent, and **Allow remote control**, `sp-switch[data-action="remote-control"]`, behind a confirm when turned on, or `data-control="fixed"` for a device on this computer; with `access`, an **Allow** group of **View**, **Control** and **Terminal** switches, `data-action="access-view"`, `access-control` and `access-terminal`, each confirmed when turned on, Terminal's saying it gives a root shell, and Control disabled while View is off; a device that asks to follow shows **Asks to follow** and **Allow**, `data-action="allow-follow"`; a **Terminal open** badge, `data-terminals`, counts its terminals; with `followUrl`, the join details add **Open on another device** with a QR code and the link, `data-join="follow"` and `data-copy="follow-url"`) when the status has `links`, **Get the whole web** with the Chrome extension link (`data-action="install-extension"`, when `extensionUrl` is set) and the commands to run slicc, each in a `.command[data-command]` block with a copy button: `curl -fsSL https://get.sliccy.ai/slicc | sh` (its button is `data-action="copy-command"`), `slicc`, and, with Node, `npx sliccy@next`; folded away when the route already reaches the whole web (`proxy`, `extension`, `link` or `tailnet`, whose line names `tailnet.exitNode`) or a linked device is the exit (`exit.kind` `link`: the route line says "Through slicc on this computer" for a `local` device, or names a remote device and its `policy`, or says it's waiting for it, and `data-route` is `link`, whatever `route` says), and recent failures with host, error and time.
When the model has a `tray` port, a **Sync** section (`data-sync` with the connection) follows the connection: the tray's state, the float's name, role and runtime, the join link, masked (`…/join/••••••`) until **Show** (`data-action="reveal-tray-join"`, which turns into **Hide**), with **Copy** (`data-action="copy-tray-join"`), the followers (`li[data-follower]`), and **Disconnect** (`data-action="tray-disconnect"`, confirmed) or **Reconnect** (`data-action="tray-reconnect"`).
When the status has `leaders`, a **Leaders** section (`section[data-leaders]` with the count) follows Sync, since it's the other direction of the same tray link: Sync is this SLICC's own tray and who follows it, Leaders the SLICCs it follows.
Each leader is an `li[data-leader]` (the id) with `data-state`: its name, its hub as a quiet second line and a status light with the state in words (Connecting, Reconnecting, Connected, Disconnected, Failed, Unlinked); `failed` adds its `error` as plain text (`[data-leader-error]`, "Couldn’t reach its hub." without one) and **Retry** (`data-action="retry-leader"`), and `unlinked` says "{name} stopped sharing with this SLICC."
(`[data-unlinked]`) without actions.
**Disconnect** (`data-action="disconnect-leader"`) runs at once, without a confirm, since it's reversible: the row stays as Disconnected (a neutral light), with **Reconnect** (`data-action="reconnect-leader"`) and **Forget** and no Disconnect or Retry.
**Forget** (`data-action="forget-leader"`) asks "Forget {name}?"
("To follow it again, you’ll need a new invite from it.") with a negative confirm, and the row goes.
Each shows only when the port has its method; while one runs, the row's buttons are disabled, and a failure shows in the row (`data-error="leader"`).
When the model has a `guests` port, a **Guests** section (`section[data-guests]` with the count) follows Leaders: **Invite a guest** (`data-action="invite-guest"`, accent, disabled while no cone is live; frozen cones are left out of the invite too), or, while `unavailable()` (or the last `unavailable` event, when the port has no method) is a sentence, that sentence instead, subdued (`[data-guests-unavailable]`).
Each seat is an `li[data-seat]` (the id) with `data-connected` (`true` or `false`): its label, "on {cone}" as a quiet second line (`[data-seat-cone]`), "Expires in {n} hours" under a day, "Expires in {n} days" after, or "No expiry" (`[data-expiry]`), a status light with **Connected** or **Not connected**, a count badge (`data-pending`) reading "{n} waiting", whose accessible name is "{n} waiting for review" when `pending` is above 0, and **Revoke** (`data-action="revoke-guest"`), which asks "Revoke {label}?"
("Their link stops working at once.
To let them back in, invite them again.") with a negative confirm; while it runs, the rows' buttons are disabled, and a failure shows in the row (`data-error="guest"`).
With no seats it says "No guests yet."
(`[data-guests-empty]`).
Invite opens `<slicc-guest-invite>`, a modal: **Cone** (`#guest-cone`, the active cone, or a selected scoop's cone, else the first), **Name** (`#guest-name`, required, trimmed, at most 40 characters, "Shown to you and in the cone, never set by the guest."), **Link expires** (`#guest-expiry`: 1 hour, 1 day, 7 days by default, or 30 days), **Their messages** (`#guest-messages`: You approve each one, The automatic check decides, {cone} decides, {scoop} decides for each of the cone's scoops, or No review, which are `user`, `agent`, `cone`, `scoop:<name>` and `off`) and **Their tool calls** (`#guest-tools`: `user`, `agent` and `scoop:<name>` only), both `user` by default, each with the chosen option's meaning under it.
When the port has `gates()`, each picker offers exactly its list, in that order (`scoop:*` as one choice per scoop of the chosen cone, a concrete `scoop:<name>` only when the cone has that scoop, `off` for tool calls reading "Tool calls run without review."), and starts on `user` when the list has it, else on its first choice; a list with no choice left for the cone offers `user`.
**Create link** (`data-action="create-guest-link"`) calls `mint(cone, { label, expiresAt, gates })`; while it runs the form is busy and Escape does nothing, and a rejection shows its message inline (`data-error="guest"`).
On success the dialog shows the URL once (`[data-guest-invite="link"]`): a read-only field (`data-copy="guest-url"`) with **Copy** (`data-action="copy-guest-url"`), "This link is shown only once.
Copy it now." and **Done** (`data-action="done-guest"`).
The URL is never stored or shown again: closing the dialog drops it.
The header's **Network** indicator (`data-network`, `data-health`) opens it: a status light, green for `ok`, yellow for `limited` and red for `failing`, with the state in its text and label and `detail` as its tooltip, which adds "Tailscale is connected." while the tailnet runs; on a phone, a cloud icon for the state.
While a linked device asks to follow, controls the agent, watches it or has a terminal open, an indicator (`data-remote`, `ask`, `prompt`, `terminal` or `watch`) sits before it, **{name} asks to follow**, **Controlled by**, **Terminal open from** or **Watched by** the device's name (or the number of devices; in that order of precedence), says who does what in its tooltip and opens the panel too.
Offered when the model has a `network` port, a `guests` port, or both.
**Link another device** and **Other ways to reach the whole web** are quiet chevron disclosures (`swc-icon-chevron-right` in the label's colour, turned down when open, mirrored right to left, still under reduced motion, with the Spectrum focus ring), as are the install logs in Install / Update and **Removed** in Settings › Secrets; none shows the browser's marker. They stay open across a layout switch once opened.
With `guests` and no `network`, it shows only the Guests section (no connection, Sync, Leaders, Tailscale, Linked devices, Get the whole web or failures), still titled Network with its rail icon, and the header's Network and remote indicators stay hidden; the tray's connection chip is then a plain status.

#### `<slicc-tray>`

The tray items in the header, each opening a panel when that panel is in `panels`: the connection (`#chip`, a status light with the float's name and followers, `data-surface="network"`, neutral and labelled "…, can’t follow" while the follow is `refused` and `connected`, exactly when the follow light reads "Can’t follow") opens Network at its **Sync** section, and the budget (`#usage`, `data-surface="monitor"`) opens the Monitor.
Without the panel an item is a plain status with its label.

#### `<slicc-confirm>`

The confirmation dialog `confirm()` opens.
Not for direct use.

#### `<slicc-prompt>`

The name dialog `prompt()` opens.
Not for direct use.

#### `<slicc-guest-invite>`

The invite dialog of the Network panel's Guests section; its gate pickers follow the `guests` port's `gates()` when it has one.
Not for direct use.

#### `<slicc-file-tree>`

Generic.
[`@pierre/trees`](https://www.npmjs.com/package/@pierre/trees) through its `web-components` entry: `paths` (folders end in `/`), `gitStatus`, `expanded`, `query` (shows only the paths that match it; empty shows all), `reveal(path, focus, options)`.
`expanded` also opens and closes the folders of a mounted tree, a `tree-expand` event (`detail.expanded`) reports the open folders when the user changes them, and the tree keeps them when it's moved, such as into a floating group.
It has no search field of its own.
A folder name or flattened folder chain too long for the row ends in an ellipsis instead of losing its middle, and every row carries its full name as a `title`, with its indent and chevron kept.
A file name too long for the row ends its name in an ellipsis and keeps its extension, as in "tide-summary… md": the library splits the name after the dot, and the browser's ellipsis drops whole letters, so the dot goes with the name and a sliver of space can stay before the extension.
`@pierre/trees` middle-truncates names by laying an "…" marker over the text, painted with `--trees-bg`; with the transparent background the tree uses here, the letters showed through it, so the tree hides that marker and lets the browser's own `text-overflow: ellipsis` cut the name before the extension.
A row's focus ring shows only with keyboard focus: the library draws it on the row that holds focus (`data-item-focused`), mouse click or not, so the tree hides it when the row isn't `:focus-visible`, and `focus(options)` passes `focusVisible` down to the row. Under forced colors, where the selection fill drops out, a selected row keeps a `Highlight` outline.
Fires `file-open` on click and on <kbd>Enter</kbd>, and `tree-search` (`detail.key`) when a letter or digit is typed in it, for the panel's search field.

#### `<slicc-code-view>`

Generic.
A highlighted file through [`@pierre/diffs`](https://www.npmjs.com/package/@pierre/diffs): `path`, `contents`, `color`.

#### `<slicc-diff-view>`

Generic.
A diff through `@pierre/diffs`: `path`, `oldText`, `newText` (`null` for an added or deleted file), `color`, `diff-style` (`unified` or `split`).

Files and diffs open in one editor group next to the chat.
Panels ask for them with `open-file` and `open-diff` events (`{ path }`), which `<slicc-app>` handles, or call `app.open('file' | 'diff', path)`.

Keys: <kbd>Alt</kbd>+<kbd>1</kbd>… opens and focuses a panel, <kbd>F6</kbd> and <kbd>Shift</kbd>+<kbd>F6</kbd> move between groups, <kbd>Ctrl</kbd>+<kbd>]</kbd> and <kbd>Ctrl</kbd>+<kbd>[</kbd> between tabs, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> switches the theme.
Focusing a chat panel this way, or with `show('chat')`, right after a touch or pen tap leaves focus where it is, so no on-screen keyboard opens and the empty log shows no ring; after a key or a mouse click it focuses the composer (its log without one) with a fine pointer, and the log with a coarse one.
In terminal and browser tab strips, <kbd>←</kbd> and <kbd>→</kbd> switch tabs.
In the agents and changes lists, arrows, <kbd>Home</kbd>, <kbd>End</kbd> and <kbd>Enter</kbd>; in the file tree, its own arrow keys and <kbd>Enter</kbd> to open.
In the composer, <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line and <kbd>Esc</kbd> stops a reply.

### Confirmations

Destructive actions ask first: reverting one change or all, deleting a frozen cone, forgetting a memory, disconnecting an account or the tray, and closing a terminal.
`confirm({ title, body, action, variant, cancel, trigger })`, exported from `dist/slicc-ui.js`, opens a modal alert dialog (1.12 `sp-alert-dialog`, as Gen2 has no dialog yet) inside `<slicc-app>`'s themed shadow root and resolves `true` on the action and `false` on Cancel or <kbd>Esc</kbd>.
`cancel` renames Cancel, for example “Don’t allow” next to “Allow” in a permission prompt.
Focus starts on Cancel and goes back to `trigger` (default: the focused element) when it closes.
Under forced colors the shared dialog styles (`dialogStyles`, also used by the import, guest invite, approval and value dialogs) outline the `<dialog>` and drop the `sp-alert-dialog` border, so nothing scrolls sideways.
`variant` is `destructive` (default, a negative action button) for actions that lose data for good, or `confirmation` (accent) for ones you can take back, like disconnecting.
Title the dialog with a question, say what can’t be undone in `body`, and name the action with a verb.

```js
import { confirm } from './dist/slicc-ui.js';

if (await confirm({ title: 'Delete harbor?', body: 'Its scoops and messages are deleted. You can’t undo this.', action: 'Delete' })) remove();
```

`prompt({ title, label, action, value, trigger, submit })` asks for one line of text in the same kind of modal dialog, with a 1.12 `sp-textfield` (Gen2 has no text field yet).
Focus starts in the field, <kbd>Enter</kbd> or the action submits, and <kbd>Esc</kbd> or Cancel resolves `null`.
The action stays disabled while the trimmed value is empty.
With `submit`, the dialog awaits it with the action pending and resolves the trimmed value once it does; if it throws, the dialog stays open and shows the error under the field.

```js
import { prompt } from './dist/slicc-ui.js';

const name = await prompt({ title: 'New cone', label: 'Name', action: 'Create', submit: (name) => model.agent.createCone(name).then(() => {}) });
```

### Secret rules check

`secretRules(command, cwd)`, exported from `dist/slicc-ui.js` (`@ai-ecoverse/slicc-spectrum/ui`), is the check behind the sudo dialog's secret-rules warning.
It takes a sudo request's command (without `sudo` and its options) and working folder, and returns `{ certain, maybe }`:

- `certain` is an absolute path when the command names a file or folder holding SLICC's secret rules (`/etc/fnox`, `/etc/fnox/config.toml`, `/etc/slicc/secrets-policy.toml`), a folder above them it changes as a whole (`/`, `/etc`, `/etc/slicc`), a glob or brace that matches one, or a file named like them (`fnox`, `secrets-policy`) anywhere, as `/tmp/fnox/config.toml`.
  It sees through quotes, backslashes, `$'…'` and `$"…"`, `cd` and `pushd` (also inside `bash -c`), relative paths and `..`, extglobs, `/proc/self/root` and `/proc/self/cwd`, option clusters like `-t/etc/fnox`, and comma lists.
- `maybe` is the token when the command may reach one of them and the check can't tell where it leads: an expansion (`$X`, `$(…)`, backticks), a `~user/..`, `~+` or `~-` path, a `/proc/<pid>/cwd` or `/dev/fd` path, or a command over 4096 characters (its first 40 followed by `…`).

Both are `null` for a clean command, and at most one is set.
The dialog shows "This changes secret rules" for `certain` and "This may change secret rules" for `maybe`, and offers no Always allow for either.
An embedder that records "always" decisions itself, such as slicc-bios, must refuse "always" (answer "once" at most) whenever either is set, so a decision sent without the dialog can't add a rule that runs it unasked.

```js
import { secretRules } from './dist/slicc-ui.js';

secretRules("bash -c 'rm /etc/fn\\ox/config.toml'");
secretRules('rm -rf $TARGET', '/home/cone');
```

The first gives `{ certain: '/etc/fnox/config.toml', maybe: null }`, the second `{ certain: null, maybe: '$TARGET' }`. The result's type is `SecretRulesVerdict`.

### Sprinkle bridge

A sprinkle's frame gets `window.slicc` with `name` and `lick(event)`. When the model's `sprinkles` port has `call`, it also gets:

- `slicc.readFile(path)` resolves with the file's text.
- `slicc.exists(path)` resolves with a boolean.
- `slicc.getState()` returns the sprinkle's saved value, or `null`, synchronously: the frame is built with it, so `var saved = slicc.getState()` works on load.
- `slicc.setState(value)` updates that value at once and resolves when it is saved.
  State is JSON: what `JSON.stringify` drops or changes is gone (a `Map` becomes `{}`, `NaN` becomes `null`), and a value it can't serialize, like a cycle or a function, rejects and leaves state as it was.
  It outlives the frame: reopening the panel or rebuilding the sprinkle starts with it.

Paths are the agent's: `/shared/…` and `/home/…`, nothing else.
A refusal or a missing file rejects with an `Error`.
There is no `exec`: a sprinkle that needs a command asks its cone with `slicc.lick()`.
Without `call`, none of the four exist, so guard them (`typeof slicc.readFile === 'function'`) and fall back.

### Panel command

`panelCommand(app, argv, caller)`, exported from `dist/slicc-ui.js`, runs `panel` for an agent or a terminal, so the agent can arrange the UI.
It returns `{ stdout, stderr, code }`.
A leading `panel` in `argv` is dropped.
`caller` is `{ agentId, cone?, readOnly? }`: `agentId` is the calling cone or scoop, or `null` for the user at a terminal; `cone` is the caller's cone when the agent already knows it (otherwise the `parentId` chain of `agentId` finds it).

- `panel list [--json]` lists the panels the caller can reach, open or not, with their state (`active`, `shown`, `open` or `closed`) and why one is busy.
  `--json` prints `PanelInfo`s: `id`, `title`, `kind` (`surface`, `chat`, `terminal`, `sprinkle`, `file`, `diff`), home `side`, `agent`, `open`, `visible`, `active` and `busy`.
- `panel open <id> [place] [--section <name>]` shows a panel without moving keyboard focus. `panel focus <id> [place] [--section <name>]` also gives it focus.
- `panel close <id>`, `panel move <id> <place>` (a closed panel opens there) and `panel reset` (the default layout).
- `panel tabs` and `--tab <tab>` are the agent's: it lists the SLICC tabs it can send the command to, and sends it to the one named instead of the one showing the caller's cone.
  It strips `--tab` before `panelCommand` runs; the help text names both so `panel --help` tells the whole story.
- A place is `left`, `center` or `right` (a group on that side as the layout is now, with the chats' column as the center, or a new one beside its neighbours), or `--left`, `--right`, `--above`, `--below` or `--within <id>`.
- Ids are the surface ids (`files`, `changes`, `terminal`, `monitor`, `settings`, …), `chat:<agent>`, `terminal:<id>`, `sprinkle:<id>`, `file:<path>` and `diff:<path>`.
  `chat` is the caller's cone's chat (without a caller, the selected thread's), `terminal` the active terminal, else the latest open one, else the newest, and a sprinkle can be named by its name alone.

Exit codes: 0 done, 1 no such panel, 2 usage (with the help text), 5 refused. 3 and 4 are left to the agent's transport.

With an `agentId` or a `cone`, the caller reaches the shared surfaces, the chats of its cone and its scoops, its cone's sprinkles and the built-in ones; anything else is reported as missing.
With `readOnly` (a page that only follows), everything but `list` and `--help` is refused.
The command refuses (code 5) to close a terminal (its shell would stop), the last chat, or a busy panel, and to move or reset while a panel is busy.
A panel element tells it is busy with a `busyReason` string: Settings while signing in or entering a key, Install / Update while a package installs, a chat while a question waits.
For an agent, it also refuses to reopen a panel the user closed in the last 60 seconds (or to reset the layout then), and while the user is typing (a key in a text field in the last 3 seconds, or a focused field with text), `focus` only shows the panel.
On a phone, `move` changes nothing.
`app.panels` (`Panels`) is the controller under the command, with `list()`, `find(id)`, `open(id, { place, section })`, `focus`, `close`, `move(id, place)` and `reset()`, each returning `{ code, message }` and without the agent-only rules.
Agent changes are saved with the layout.

### Model

`SliccModel` (`src/model/types.ts`) has one port per future backend, so adapters can replace the dummy without UI changes.
Every port is subscribable with `on(type, listener)`, which returns an unsubscribe function.

#### `agent`

Later backed by: `@ai-ecoverse/slicc-agent`.
Cones and scoops, the active agent, conversations, `send` (with attachments, as a send, a steer or a queued follow-up) and `stop`, the queue, suggestions, answers to questions, permission decisions, compaction, clearing (`clear(agentId)` starts a new conversation: on a cone, a port with `freeze` first puts the old one in the Freezer as its own row, which thaws into a cone of its own; a scoop's is just reset), the model per agent and new scoops.
An error part (`{ type: 'error', message, detail?, action?, account? }`) and an error `SystemMessage` may carry `account`, the `Account.id` that the card's **Log in** signs in; slicc-agent sets it on the expired-session card.
The optional `rewind(agentId, messageId)` drops the user turn before that message and everything after it, and resolves with the turn's prompt (text and attachments) for the composer, or `null`.
The optional `hold()` returns an `AgentHold` (`{ reason: waiting | locked, held }`) while tool results wait for the vault (slicc-agent's `connection.vault`: `waiting` while the vault port doesn't answer, `locked` while it needs a passkey), or `null`, with a `hold` event when it changes.
The optional `drop(agentId)` removes a scoop: it stops and its working folder is deleted, while its conversation and reports are kept, and `createCone(name)` resolves with a new cone; the dummy rejects a cone name that is taken.
`freeze(agentId)` is optional too: without it, **Delete cone** and `/freeze` don't show.
`frozen()` lists the Freezer's rows; a `FrozenCone` may carry `kind` (`cone`, `scoop` or `agent`), `live` for a conversation that's still running, and `thawedAs`, the id of the cone a scoop or agent run was thawed into.
`thaw(id)` brings a cone back, or forks a scoop or agent run into a new cone, and `discard(id)` removes a row.
The optional `importProfile(file, { preview, again? })` takes a SLICC 6 profile export (a `Blob`) and resolves with a `ProfileImportResult` (`preview`, the imported `cones`' ids, the `report` path and a `text`), or rejects with a sentence to show; with `preview: true` it only checks, and its `ProfileImportPreview` counts the export (`origin`, `createdAt`, `cones`, `scoops`, `frozen`, `bytes`, `skills`, `crons`, `webhooks`), lists the zip paths of `flagged` credential-like files, which are imported as they are (at 0600) and listed in the report for review, `providers` to sign in to again and `mounts` it can't bring, and has `already`, when this export was imported before, or `null`.
`importCancel()` stops it, and `importing()` returns a `ProfileImportProgress` (`phase`: `idle`, `checking`, `writing`, `done` or `failed`, with `done`, `total` and `text`), with an `importing` event; the UI never sees kernel paths, so the adapter decides how the file reaches the agent.
Names don't have to be unique, and an optional `Agent.title` names a cone's conversation; without it, the first user message does.
Assistant messages stream: the same message is re-emitted as its parts grow and its tool calls go from `running` to `done`.
The optional `toolLabel(agentId, callIds)` resolves with a short label for a run of tool calls (`callIds` in order), such as "Compare the docs with the live API", or `null`; the agent dedupes, caches and persists it.
Spectrum asks once a reply's status has two calls and again each time it grows, once per set of ids, and shows the label once the status is complete.
The optional `readOnly()` returns a line, or `null`, with a `readOnly` event when it changes: while it's a non-empty string, such as when this follower runs a different major version from its owner, every surface is watch-only just as a follower without Control is (no composer, no cone or conversation actions, no pickers, no Stop, no Accept or Revert in Changes, inline sprinkles view only, no model settling), and the line takes the place of the follow-based watch-only note under the chat.
The optional `starting()` returns a line, or `null`, with a `starting` event when it changes: while it's a non-empty string, there's no agent yet but one is on its way (such as while seven installs its first agent, or replaces one), the chat drops its empty state and the composer queues what's sent until an agent is there (see `<slicc-composer>`); without it, or at `null`, nothing changes.

#### `files`

Later backed by: slicc-kernel's OPFS.
`list`, `read`, `write`, `remove`, and pending changes with their before and after text (`accept`, `revert`).
The optional `mountFolder()` asks for a local folder and resolves with its mount point (for example `/mnt/photos`), or `null` when the user cancels; the panel calls it synchronously in the click, so the port can call `showDirectoryPicker()`.
The optional `mounts()` lists the mount points, and the optional `mountInfo()` returns `MountInfo`s (`target`, optional `source` such as a linked device's `ref-node/proj`, and `type`) for them, used instead of `mounts()` when present; `eject(path)` unmounts one (the folder stays on disk).
`mountFolder(path)` inserts the picked folder at a mount point that waits for one; the optional `needsFolder()` lists those mount points.
The port emits `mounts` and then `files` after every mount and eject, including those made from the shell, and `mounts` whenever `needsFolder()` changes.

#### `terminals`

Later backed by: slicc-kernel's terminal API.
Terminal sessions; `backend(id)` returns a `TerminalBackend` for `<slicc-terminal>`.

#### `browser`

Later backed by: `@ai-ecoverse/slicc-cdp`.
Tabs, the active tab, `open`, `navigate`, `close`, `screenshot`.
A `BrowserTab` may say it's `controlled` (an agent, or the user's terminal when `agentId` is `null`, is driving it now; `agentId` is the agent of its last action); `favicon` is ignored.
The optional `actions(tabId?)` returns recent `BrowserAction`s, oldest first, all of them (bios keeps 500 per tab for 24 h, 5,000 in all; the panel shows 50 at a time) (`{ id, tabId, agentId, kind, target?, value?, length?, status: running | done | failed, error?, at }`, `kind` one of `open`, `goto`, `back`, `reload`, `close`, `select`, `snapshot`, `screenshot`, `eval`, `click`, `fill`, `type`, `press`, `scroll`, `request`; a `request` has `value` `'GET https://host/path'` and may have no tab), with an `action` event per new or settled action.
The optional `watch(tabId, size?)` streams `frame` events (`{ tabId, src, at }`) for a controlled tab and returns a stop function; the panel watches only the focused tab while it's controlled and visible, with the frame's CSS size.
**Stop** calls `agent.stop(agentId)`.

#### `settings`

Later backed by: local storage.
Theme, model, thinking level, composer and diff preferences, the models on offer, and accounts.
A model can say it is its provider's `default`.
Emit `settings` or `accounts` when the models on offer change.
The optional `providers()` returns the `ProviderOption`s that can be added (`{ id, name, description?, auth: 'api-key' | 'oauth' | 'fields' | 'local', fields?, keyUrl?, needs?, blocked?, vaultName? }`, sorted by name, added ones included), with a `providers` event when they change; `id` is pi-ai's provider id and becomes the `Account.id`. With it, `accounts()` lists only added accounts, `connect(id, secret?, fields?)` adds one (`group: 'providers'`; a `fields` provider becomes an `api-key` account with `store: 'vault'` and only its non-secret `fields`), and the optional `remove(id)` drops one. `Account` adds `keyUrl`, `description`, `vaultName`, the vault record for its key (else pi-ai's environment-variable name), and `url`, an `mcp:<server>` account's server URL. `needs: 'cors-free-transport'` on either is static (the provider doesn't answer a browser); `blocked: 'cors-free-transport'` is live, set while the current transport can't reach it, and cleared by a `providers` and an `accounts` event when an extension or a linked slicc appears.
`Account.signIn` (`{ url, code? }`) is what a `signing-in` account's sign-in page and device code are, and `connect` takes an optional fourth `options` (`{ method: 'sign-in' | 'key' }`) for an account that signs in or takes a key (`auth: 'oauth'` with `secret: 'api-key'`).

#### `changes` (optional)

Later backed by: `@ai-ecoverse/slicc-agent`.
Pending changes from git instead of the file system: `changes()`, `accept(path)` (stage), `revert(path)` (discard), and a `changes` event, as on `files`.
When present, the UI reads changes only from this port, including the rail's count.
A `Change` may carry `repo`, its repository root; put the active agent's repository first.
The optional `unavailable()` returns why there can be no changes (no git, no repository), which the panel shows with commands in backticks made copyable, or `null`; emit `changes` when it flips.
The optional `commands()` adds more copyable commands under that text, in order, without repeating its own.

#### `memory`

Later backed by: `@ai-ecoverse/slicc-agent`.
Memories with scope, section, tag and body; `save` and `remove`.
`source: 'notes'` marks free text the panel shows as an entry titled after its section; saving it makes it an entry.
The optional `scopes()` lists the scope picker's choices as `{ id, label, group }`, ungrouped first, then under “Cones” and “Roles”; without it the picker offers `global` and each cone.
Either way the panel puts its own **Everyone** (`*`, every memory) first and labels `global` **Shared**.
The panel re-reads `scopes()` on `memories` and `agents`, so emit `memories` when the list changes.
A scope that disappears falls back to Everyone.
A memory remembered while Everyone is picked goes to `global`.

#### `monitor`

Later backed by: all of them.
A snapshot of vitals, alerts and sections, re-emitted as the system changes, and `resync`.
A `MonitorRow` has `name`, `meta`, `status` (`active`, `idle`, `warn`, `error`), optional `badges`, an optional `depth` (the indent level, for trees such as the task graph) and an optional stable `id` (the key while rows update).

#### `sprinkles`

Later backed by: `@ai-ecoverse/slicc-agent`.
Sprinkles (`inline` ones show as dips in the chat, not in the rail) and `send`, which turns a sprinkle's lick into a lick on its cone.
The rail groups sprinkles by their `agentId`: the selected cone's come first, then the other cones' in the agents list's order, each group set apart by a line (`.rail .cones`) and each button carrying `data-cone`.
A sprinkle of another cone reads `{cone name} / {title}` in its tooltip, its label and the tab it opens; the name comes from the agents list, so give each sprinkle an `id` that stays stable when a cone is renamed, such as `{coneId}/{name}`.
The optional `call(id, method, args)` serves the [sprinkle bridge](#sprinkle-bridge) for sprinkle `id`: `readFile` and `exists` (`[path]`) resolve with a string and a boolean, `getState` (`[]`) with the saved value or `null`, and `setState` (`[value]`) once it is saved.
The adapter owns path policy and keeps state per sprinkle; `<slicc-sprinkle>` awaits `getState` before it builds a frame, mirrors what the frame saves, and forwards only these four methods from its own frame.
The dummy keeps state in memory and maps `/shared/x` to `/home/x` in its files, refusing anything outside `/home`.

#### `tray`

Later backed by: the tray protocol.
Connection, role, float kind, followers, spend and budget; `reconnect` and `disconnect`.
`spent`, `rate` and `budget` are optional: the budget chip's tooltip and label leave out the spend while `spent` is 0 or missing, and the rate while `rate` is, and the chip itself hides without `budget`, or while it's at 0% with nothing spent.

#### `updates` (optional)

Later backed by: BIOS installers.
`list()` returns `UpdateItem` rows for BIOS, kernel, agent, grammars, global pnpm packages, skills and UI.
A row's and a package's `progress` (`InstallProgress`) is the `phase` (`download` or `link`) with `done` of `total` packages, and an optional `bytes` (`{ done, total }`), which counts only while `phase` is `download` (it's ignored while linking and when its total is 0), summed from pnpm's `Downloading <package>: <done>/<total>` lines; send it even when pnpm counts a single package, since a few large tarballs are most of an install's time.
`ready()` explicitly reports agent readiness, independently of agent activity.
Emit `items` whenever rows or readiness change.
Use `queued` for a row that waits for another component before it starts; it reads "Waiting" and doesn't count as updating.
Use `starting` for an installed row that is only starting up: it reads "Starting" without a checked line, and the header shows a neutral "Starting" only when nothing is failed, updating or ready.
A `failed` row with an installed `from` version reads "Update failed".
`act(id, action)` resolves when dispatched or rejects with a displayed error; actions are `retry`, `update-now`, `restart-agent`, `reload`, `install-beta` and `back-to-certified` (the embedder asks for confirmation itself).
A row's and a package's optional `releases` (`UpdateRelease[]`) lists the GitHub releases the embedder knows for it, each with its `version`, the release page `url` and optional `notes` (the release body, semantic-release markdown as GitHub returns it). Send every release after the installed version up to the new one, so the panel can show the whole range, plus the installed one for its link; spectrum orders them by version and never fetches them itself. Leave it out, or leave out `notes`, when there's nothing to show.
Optional `developer()` (false by default) and `setDeveloper(on)`, on the owner's page only, turn developer mode on and off; `setDeveloper` resolves once settled or rejects with a displayed error, and the port emits `items` when either changes.
A row's optional `beta` (`{ version, certified }`) is set while a beta is installed, and its optional `npm` (`{ state, latest?, reason?, changes?: { count, gated } }`, `state` one of `checking`, `current`, `offered`, `not-offered` or `failed`) is `null` while developer mode is off.
Missing ports preserve existing adapters and report disconnected information in the panel.
Optional `packages()` returns `PackageItem` rows for optional tools, each with a short catalog `id`, its npm `package` (shown in the name's tooltip and at the top of its Install log), `label`, the `description` (npm's, untrusted: HTML tags and comments go and their text stays, entities are decoded, markdown emphasis, inline code, links and images become their text, leading headings, quotes, list markers and code fences go, then whitespace collapses and it's capped at 300 characters with "…"; it's never rendered as markup or a link), the `commands` it provides, `requires` (other package ids, read as "Uses Python" while it's installed, or "Installs Python too" on a row that isn't installed yet; an installed row leaves out a requirement that isn't installed, since its warning says so), optional `notes` (curated caveats, short plain-text lines shown muted under the row and never clamped, stripped the same way and each capped at 300 characters, such as "1 untested dependency: …"; leave it out when there's nothing to say), optional `warnings` (lines with an alert icon, `data-warnings`, such as "Needs Python, which isn't installed.
Install Python again to use it."; the dummy adds that one when a required package is removed), `state` (`available`, `queued`, `installing`, `installed`, `outdated`, `updating`, `removing` or `failed`), the installed `version`, the `offered` version and its `size` in bytes (read "28.4 MB on disk" with `unpacked: true`, when it's npm's `dist.unpackedSize`, else the bare size), `progress` (`InstallProgress`, or `null` for an indeterminate bar), `error`, `actions` (`install`, `update`, `remove`, `retry`, `unpin`) and an optional `log`.
The description is npm's, and curated caveats go in `notes`, shown under it.
Optional `registry` is `checking` or `unreachable` while the port has no npm data for the row, fresh or cached: send it with `offered: null`, no `size`, an empty `description` and no `commands`, keep an installed row's actions, and give a row that isn't installed `retry` (which refetches, so a spectrum without `registry` can still retry) or nothing while checking.
Optional `withheld` is the reason, in words and without a prefix, that seven offers no version of a package npm has, such as "needs slicc-kernel 1.48.0 or newer"; send it with `offered: null` and no `install` or `update`, and for an installed package send `newer` instead (an installed row with `withheld` still reads "Not offered: <reason>.").
Optional `newer` (`{ version, reason }`) is npm's latest when it doesn't pass the gate but the `offered` older version does, with its blocker in the same words as `withheld`.
A row with `origin: 'user'` (ids such as `user:user:<name>`) goes into Your packages, `section[data-section="user-packages"]`, which only shows when there is one; its `pin` holds `base` (the version seven ships, or `null` for a package seven doesn't ship), the user's `range` and the `project` folder, such as `/opt/user`.
An installed pin reads "Pinned" with `0.24.0 · seven ships 0.25.0 · in /opt/agent` ("the version seven ships" when they match), and an addition reads "Added" with `^1.2.0 → 1.2.4 · in /opt/user`; `.meta[data-pin]` is `pinned` or `added`.
A pin that is `removing` reads "Unpinning"; other states keep their usual lights.
Offer `unpin` for pins and `remove` for additions.
Optional `installs` lists where a package is installed, each with its `version`, `where` (a folder such as `/home/cone/.local/share/pnpm`), an optional `user` and an optional `manager` (`pnpm` or `panel`).
A row with any install never offers `install`, nor `remove` unless one install's `manager` is `panel`, and one the port still reports as `available` reads Installed, or Update available when `offered` differs, with its first install's `version`.
Each install the panel doesn't own shows in the meta line as `[data-install]`, such as "for cone, via pnpm" or "in /opt/tools", with its version in front when it differs from the row's; when the panel's copy sits next to others it reads "the panel’s copy" (`[data-install="panel"]`) and Remove's accessible name is "Remove the panel’s copy of <label>", since it removes only that copy.
When no install is the panel's, `[data-managed]` under it reads "Managed by pnpm. Remove it with `pnpm remove -g <package>`." (the command in a `code` element; or "Installed outside this panel. Remove it where it was installed." for another manager).
Offer `update` for such a row to update it in place, for that user and with that manager, never as a second copy; never offer `remove` for it.
Emit `packages` whenever they change.
Optional `refreshPackages()` refetches the catalog from npm, flips the rows without data to `checking`, emits `packages`, and resolves when the fetch settles; a rejection is ignored, since the rows say what happened.
`actPackage(id, action)` keeps the row's button pending until it settles; it shows any confirm itself, resolves without a change when that confirm is cancelled, and rejects with a displayed error on a real failure.
Hooks: `section[data-section="packages"]`, `li[data-id][data-state]`, buttons with `data-action`, `li[data-registry]`, `[data-withheld]`, `[data-newer]`, `[data-size]`, `[data-requires]`, `[data-notes]` and `[data-error]`.
Real installer wiring belongs to ai-ecoverse/slicc-bios#70.

#### `network` (optional)

Later backed by: BIOS.
`status()` returns the `NetworkStatus`: `route` (`link` while a linked slicc carries the traffic, with `exit` naming it, `proxy` from older bios for slicc on this computer, `extension` for the Chrome extension relay, `tailnet` while a Tailscale exit node carries the traffic, `page` for the page's own fetch, limited by CORS, or `null`), `health` (`ok`, `limited` or `failing`, decided by the port), a one-line `detail`, recent `failures` (`{ url, error, at }`, newest first), an optional `extensionUrl` and an optional `browser` (`{ via, detail? }`, `via` being `extension`, `proxy`, `link` when linked devices' browsers carry it (the line names the browser and its device, or counts them when there are several, counting connected devices only), or `null` when browser automation isn't available; a legacy `declined` flag is ignored, since there is no consent prompt any more).
Emit `network` when it changes.
The optional `check()` tests the route again.
An optional `tailnet` (`TailnetStatus`) shows the Tailscale section: `state` (`off`, `loading`, `needs-login`, `starting`, `running` or `failed`, a status light), a plain-language `detail` (progress, or the failure reason in an error box with **Retry** through `check()`), a `loginUrl` (**Sign in to Tailscale**, a new tab), the `node` (`{ name, addresses }`; the name and the first 100.x address, each with a Copy button), `exitNode` (the name in use or `null`), `exitNodes` (`{ id, name, online }`), `autoExitNode`, `shieldsUp` (a muted line when `true`, a warning when `false`) and `peers` (a count).
The optional `setTailnet(on)` adds the **Use Tailscale** switch (`data-action="tailnet"`); `submitAuthKey(key)` adds an auth-key field to `needs-login` (a password field without a `name`, cleared on submit, never kept in component state); `setExitNode(id | 'auto' | null)` adds the **Exit node** picker (None, Automatic, and each node, offline ones disabled) to `running`, with a line saying where traffic goes; `logoutTailnet()` adds **Sign out**, behind a confirm.
A rejected call shows its message in the section.
Peers are never named beyond the exit-node list.
An optional `links` (`NetworkLinks`) shows **Linked devices**, slicc CLIs linked over WebRTC: `joinUrl` and `joinCommand` (each with Copy, `data-copy="join-url"` and `data-copy="join-command"`; both `null` shows "Preparing a join URL…"; both left out, as with no tray, hide the join part and keep the devices and pairing), an optional `followUrl` (the page URL with `#follow=` and the join URL, shown with a QR code).
Join URLs let a device join, so the join URL, the command, the follow link and the tray's join link are masked (the last path segment and anything after it, or, without a path, everything after `#` or `?`; text without a URL is masked whole), with `data-secret="hidden"` until **Show** (`data-action="reveal-<copy>"`) sets it to `shown`; a new URL masks again, Copy copies the real value either way, and the QR code stays scannable, `devices` and `permission`.
A `LinkedDevice` has an `id`, a display `name` (a leading `slicc` is shown as `SLICC`), the kernel `host` and `address`, a `mode` (`local` for a CLI on this computer attached over CDP, or `remote`), `offers` (`net`, `http`, `ssh`; `ssh` adds a copyable `ssh <host>`), a one-line `policy`, `exit` (whether it can carry internet traffic), a `state` (`connecting`, `connected`, `reconnecting` or `offline`, for a device that linked before and isn't there now; every device that ever linked is listed, so one that was refused can be allowed), optional `control` (`{ allowed, fixed? }`; `fixed` for one on this computer, always allowed), optional `controlling` (`prompt` or `watch` while a CLI prompts or watches the agent) optional `browsers` (`{ runtime, name }`, listed in the row as `data-browsers`, with the runtime such as `pier-nuc/chrome` that the 9222 facade drives), optional `kind` (`cli`, or `seven` for another SLICC that follows this one, "Follower" in the row), optional `access` (`{ view?, control?, terminal?, fixed? }`: only the keys present get a switch, so a CLI sends `{ control }`; `fixed` lists them as always allowed from this computer; it replaces `control`), optional `asking` (a follower that waits to be allowed), optional `terminals` (how many terminals it has open here), an optional `note` (one warning line in the row, `[data-note]`, with the alert icon, such as a forgotten device's "Pair it again") and optional `folders` (`LinkedFolder`s the device shares: `name`, `source` such as `pier-nuc/proj`, `readonly`, and `mounted`, the mount point once mounted).
Folders list in the row (`[data-folders] li[data-folder]`, with `data-mounted` `yes` or `no`, a **Read-only** badge and "Mounted at …"); `mountFolder(source)` adds **Mount** (`data-action="mount-folder"`, `data-id` the source; only on a connected device) and resolves with the mount point, such as `/mnt/pier-nuc/proj`, and `ejectFolder(source)` adds **Eject** (`data-action="eject-folder"`); a failure shows on the links error line.
Each device is an `li[data-device]` with `data-state`, `data-mode` and `data-kind`, and `data-asking` while it asks; once there are devices, the join details fold into **Link another device**.
An optional `pairing` (`LinkPairing`: `state` `idle`, `confirm`, `linking`, `linked` or `failed`, the node's short `code`, the device `name` once linked and a one-sentence `error` once failed) adds **Link this computer** (`section[data-pairing=<state>]`) for `slicc pair` on this computer, inside **Link another device**, which opens by itself while the state isn't `idle` or an `offline` device has a `note` (one that has to be linked again; a note on a device that is still linked, such as an update, leaves it closed); without `pairComputer` its Link stays disabled.
`idle` has the **Pairing link** field (`#pair-url`, not kept, cleared once accepted) and **Link** (`data-action="pair"`, disabled while empty; Enter submits) through `pairComputer(url)`, whose rejection shows under the field (`[data-error=pairing]`) and keeps the text.
`confirm` shows the code and **Link** (`data-action="confirm-pairing"`, `confirmPairing()`) and **Cancel** (`data-action="cancel-pairing"`); when the state becomes `confirm`, or the panel opens on it, the block scrolls into view and its heading takes focus.
`linking` shows a progress circle and **Cancel**, `linked` a positive status light and **Done** (`data-action="done-pairing"`), and `failed` an error box with **Try again** (`data-action="retry-pairing"`, which focuses the field) and **Dismiss** (`data-action="dismiss-pairing"`); Cancel, Done, Try again and Dismiss call `cancelPairing()`, and a polite status line (`[data-pairing-status]`) announces each state.
A paired device is a `local` `cli` row without `control` or `access`.
`permission` is `prompt` (an informative line asking to choose Allow in Chrome's Local Network Access prompt) or `denied` (a warning, with **Try again**, `data-action="retry-links"`, through `retryLinks()`).
An optional `exit` (`NetworkExit`: `null`, `{ kind: 'tailnet', node }` with a Tailscale node id or `'auto'`, or `{ kind: 'link', id }`) is the default exit.
The optional `setExit(exit)` replaces the Tailscale **Exit node** picker with one **Internet traffic** picker in Connection: Directly, then Tailscale (Automatic and its nodes) and Linked devices (those with `exit: true`), offline ones disabled unless chosen; a chosen device that isn't connected shows that traffic waits, since the exit fails closed.
Without `setRemoteControl(id, allowed)`, `control` is a line saying whether it's allowed; with it, **Allow remote control** is a switch.
Without `setAccess(id, 'view' | 'control' | 'terminal', allowed)`, `access` is a line saying what's allowed; with it, the switches call it, and **Allow** on a device that asks calls `setAccess(id, 'view', true)`.
Turning View off should turn Control off too.
`unlink(id)` adds **Unlink** (`data-action="unlink"`) to each device and `rotateJoinUrl()` adds **New join URL** (`data-action="rotate-join-url"`), both behind a confirm.
Their failures show in the section.
An optional `leaders` (`Leader[]`: `id`, the leader's hub origin, unique per leader; `name`, from the link's hello, with a leading `slicc` shown as `SLICC`; `hub`, the host to show; `state`, `connecting`, `reconnecting`, `connected`, `disconnected`, `failed` or `unlinked`; and an optional `error`) lists the SLICCs this one follows, shown when non-empty.
`unlinked` means the leader removed this SLICC and bios already forgot it: send it in one status, then leave it out.
`retryLeader(id)` adds **Retry** to a `failed` leader, `disconnectLeader(id)` stops following but keeps the saved join and the device certificate, so the row stays as `disconnected` across reloads, `reconnectLeader(id)` resumes it without a new link (`connecting`, then `connected`, or `unlinked`, shown once, if the leader unlinked this SLICC meanwhile), and `forgetLeader(id)` drops the join and the certificate for that hub, and the row goes, so the leader has to invite this SLICC again.
Without the port, the indicator doesn't show, and neither does the Network panel unless the model has a `guests` port.

#### `notices` (optional)

Later backed by: BIOS.
`list()` returns `Notice`s for quiet, dismissible in-line notices at the top of every chat panel, above the transcript, in list order: `id`, `tone` (`info` reads as informative, `warning` as a notice), `title`, a plain-text `body` and `actions` (`{ id, label }`).
Title, body and labels are text only.
Notices use `role="status"` and never take focus.
An action is a secondary button that stays pending until `act(id, action)` settles; a rejection shows its message under the body.
The close button, labelled "Dismiss: <title>", hides the notice at once and calls `dismiss(id)` synchronously; it shows again only if the port drops the notice from `list()` and brings it back later.
Emit `notices` whenever they change.
A notice with `dismissible: false` has no close button and stays until the port drops it.
An optional `session: true` marks a notice the embedder keeps for the session; the panel shows it like any other, and other fields pass through.
Hooks: `[data-notice="<id>"]`, buttons with `data-action`, `[data-dismiss]` and `[data-error]`.

#### `tabs` (optional)

Later backed by: BIOS.
`state()` returns this tab's `TabsState`: `role` (`owner` runs SLICC; `follower` shows the owner tab's SLICC; `connecting` while the owner boots or hands over; `alone` without SharedWorker), `stalled` (the owner stopped answering) and `skew` (`newer` or `older` when the owner runs another SLICC version, else `null`).
Emit `tabs` when it changes.
An owner shows nothing.
A follower gets a quiet header light, "Another tab" (`[data-tabs][data-role]`, with `data-stalled` and `data-skew`; a dot on phones), info while connecting, and a notice while stalled or skewed, with its explanation as the tooltip.
While connecting, an empty chat says "Connecting to the tab running SLICC…" (`[data-connecting]`).
Skew, or else a stall, shows a warning banner at the top of every chat panel (`[data-tabs-notice="skew"|"stalled"]`, `data-skew`): "Another tab runs a newer SLICC.
Reload this tab." with **Reload** (`data-action="reload"`, calls `reload()`), "Another tab runs an older SLICC.
Reload the other SLICC tab.", or "Chrome paused the tab running SLICC.
Switch to it to continue.".
An `alone` tab shows only the brand and "SLICC is open in another tab."
(`[data-tabs="alone"]`).

#### `approvals` (optional)

Later backed by: BIOS.
`list()` returns waiting `Approval`s; emit `approvals` when the list changes.
A `sudo` approval has `id`, `requester` (`kind` `agent` or `user`, `name`, optional `agentId` and `where`, such as a terminal's title), `command` (without `sudo`; bios joins the kernel's argv shell-quoted), optional `target` (the user to run as; shown as `sudo -u {target}` unless `root`), optional `cwd`, `createdAt`, `expiresAt` (epoch ms) and `always` (offer Always allow, which covers the requester's user and this exact command).
With `decide(id, 'once' | 'always' | 'deny')`, which resolves once the decision is recorded and then drops the request from `list()`, the tab shows a warning alert dialog (`dialog[data-approval][data-kind][data-requester]`): "Allow sudo?", "{name} wants to run this with sudo[ in {where}]:" for an agent or "You ran this with sudo[ in {where}] (as {name}):" for a user, the command, "In {cwd}", a notice when the command changes secret rules, what Always allow does, "Denied automatically in m:ss." and how many more wait, with **Deny** (`data-action="deny"`, focused; Escape also denies), **Always allow** (`always`) and **Allow once** (`once`).
A command that names `/etc/fnox` (or anything in it) or `/etc/slicc/secrets-policy.toml`, resolved against `cwd`, globs included (with quotes and backslashes removed, operands after `--` included; a path with `[`, `{` or `$` counts when the part before it could lead to them), or that names `/`, `/etc` or `/etc/slicc` in a command other than a read-only one (such as `ls`, `cat`, `stat` or `grep`), or runs with `cwd` in `/etc/fnox`, or names a relative path with `fnox` or `secrets-policy` in it wherever `cd` may have led, gets "This changes secret rules." with the path (`[data-secret-rules]`, the path in the attribute).
Read-only commands count only by bare name or from `/bin` and `/usr/bin`.
`/proc/<pid>/root` counts as `/` and `/proc/self/cwd` as `cwd`.
Otherwise a command with a parameter expansion or command substitution (`$…`, backticks), a `~+` or `~-` path or a `~` path that climbs with `..`, a path through another process's `/proc/<pid>/cwd`, `fd` or `map_files` or through `/dev/fd`, or more than 4096 characters, gets "This may change secret rules." with the first such part in the attribute.
Other symlinks aren't followed.
Either way there's no Always allow, even when `always` is `true` (`decide(id, 'always')` isn't called for it), so each change to the rules is asked for.
For half a second after a request shows, only Deny works, so a double-click can't approve it.
A rejected `decide` shows its message in the dialog (`[data-error]`, `dialog[data-rejected]`) in place of the countdown, with only **Close** (`data-action="close"`, focused; Escape also closes), which moves on to the next waiting request or closes the dialog.
Pass `decide` in every tab: the first decision wins.
When a request ends without a decision in this tab, emit `ended` with `{ id, reason }` and drop it from `list()`: `answered` (another tab decided) shows "Answered in another tab", `expired` shows "Sudo request timed out", each with the command and **Close** (`data-action="close"`, `dialog[data-gone]`), and `withdrawn` (the requester went away) closes the dialog silently.
Without `ended`, a request that leaves the list reads as expired past `expiresAt` and answered before it.
Without `decide`, each request is a warning notice in the chat panels: "Waiting for sudo approval", who asks and the command, and "It waits for the owner's approval.
Denied automatically at {time}."
A guest request has `kind` `guest-message` (`text`, optional `attachments` of `{ name, mimeType, size }`) or `guest-tool` (`tool`, `summary`, optional `args`, the call's arguments as text, which the embedder pretty-prints, and `argsTruncated`, `true` when only a prefix of them came), plus `requester` (`kind` `guest`), `agentId`, optional `agentName`, `createdAt`, `expiresAt`, `always` (offer Always allow, a policy default the owner can change) and an optional `verdict` (`{ decision: 'allow' | 'deny' | 'unsure', reason }`, the automatic check's view).
Its dialog (`[data-approval-kind]` on the body) reads "Allow a guest’s message?" with "{name} wants to send this to {agentName ?? 'this cone'}:", the text as plain text in a scrolling box (`[data-guest-text]`, never Markdown or HTML) and the attachments as name · type · size (`[data-attachments]`), or "Allow a guest’s tool call?" with "{agentName ?? 'This cone'} wants to run {tool} for {name}:" and the summary (`[data-summary]`); when the summary is blank, the block shows the tool's name on its first line and then `args` instead, under the same four-line and end-of-command rules, and with no `args` either, "This request has no details." (`[data-id="no-details"]`) and Allow as usual; with a blank summary and `argsTruncated`, the dialog never offers Allow once or Always allow and `decide()` takes only `deny`, saying "This request is too long to show in full, so it can’t be allowed." (`[data-allow-hint]`) while the args still show; then "The automatic check would allow this: {reason}", "…deny this: {reason}" or "The automatic check wasn’t sure: {reason}" (`[data-verdict]`, the decision in the attribute).
It offers **Deny** and **Allow once**, and, when `always` is `true`, **Always allow** (`always`, which calls `decide(id, 'always')`) with the hint "Always allow lets {name} send messages to {agentName ?? 'this cone'} without asking again." or "Always allow lets {agentName ?? 'this cone'} run exactly this {tool} call for {name} without asking again.".
`decide` gets no `reason` from the UI; a rejected `decide` shows its message inline (`[data-error]`) with only **Close**, as for sudo.
Ended guest requests read "Answered elsewhere", "Guest message timed out" or "Guest tool call timed out".
Without `decide`, a guest request's notice reads "Waiting for approval of a guest’s message" with "{name}'s message to {agentName} waits for the owner's approval.", or "Waiting for approval of a guest’s tool call" with "{agentName} wants to run {tool} for {name}, which waits for the owner's approval.", then "Denied automatically at {time}."
A tray request (`kind` `tray`, a `TrayApproval`) asks the owner before `slicc tray` hands out or changes this seven's join URL: `op` (`url`, `rotate` or `unlink`), `requester`, an optional `device` (`{ id, name }`, the device to unlink), `createdAt` and `expiresAt`.
It has no `always`: the dialog never offers Always allow for it, even when the item carries `always: true`, and `decide()` gets only `once` or `deny`.
Its dialog reads "Share this seven’s join URL?" with "{name} wants this seven’s join URL. Anyone with it can ask to link to this seven.", "Make a new join URL?" with "{name} wants a new join URL. Linked devices move to it, and the old one stops working.", or "Unlink {device.name}?" with "{name} wants to unlink {device.name} from this seven." ("Unlink a device?" and "…unlink a device from this seven." without `device`), then the countdown, **Deny** and **Allow once**.
Ended tray requests read "Answered in another tab" or "Tray request timed out", and a withdrawn one closes silently.
Without `decide`, its notice reads "Waiting for tray approval" with the same sentence, then "It waits for the owner's approval. Denied automatically at {time}."
An approval whose `kind` this build doesn't know shows neither a dialog nor a notice, so it waits until it ends and is never allowed from here.

#### `vault` (optional)

Later backed by: BIOS.
The vault's view for SLICC, typed after `@ai-ecoverse/slicc-vault` (spectrum re-declares the types it uses, and `compat/vault.ts` checks that the package's types fit them).
`status()` returns the `VaultStatus` (`locked`, `lock`, `scrub`, `waiting` requests, and optional `exportedAt` and `backupReminder`) or `null` while loading, and `list()` the `VaultList` (`secrets` as `SecretView`s, `refused` rules, `exits`, and the first `audit` page with `auditMore`) or `null`.
Emit `status` and `list` when they change (bios re-lists after the vault's `changed` events), and `availability` when the optional `availability()` (`connecting`, `waiting`, `locked` or `ready`) changes.
`audit(before?, limit?)` resolves with an older `AuditPage` (`before` is a `seq`).
The optional page ops, each hiding its control when missing: `put(name, value, request?)` (a value request's `put` must use its `name`), `cancel(request)`, `remove(name, kind?)`, `restore(name, kind?)`, `import(kind, bytes, { password?, pick? })` (a `pick` stage, then `done`), `export(passphrase)` (the bundle's bytes), `lock()`, `dismissBackupReminder()` and `endpoints({ add?, remove? })`, which registers or takes back the URLs a page-sealed credential may be filled on (each an `EndpointSet`, `{ model?: [{ name, url }], mcp?: [{ server, url }] }`, a model URL bound to one record by name), checks the whole change first (`EINVAL` changes nothing) and rejects with a sentence. Settings registers them itself, never through the agent. `settings(name, kind, settings)` replaces a record's tenant settings as a whole without touching its key (the vault's `put` without a value); `put`'s options take the same `settings` on a first save.
They reject with a `VaultFailure`, an `Error` with an `ErrorCode` `code` (`isVaultFailure` from `/ui`).
Values go to the vault only through `put`, and never through another port.
`button()` returns a new `VaultButton`, `{ element, post(message), listen(fn) }` returning an unsubscribe: bios wraps the vault's `button.html` frame and its postMessage protocol, and spectrum only sends `ButtonMessage`s and receives `ButtonEvent`s.
The passkey lock (unlock and protect) happens in the vault's own popup, which only a click in that frame can open.
`notices`, `acknowledge` and the `notice` event are still typed, and ignored.

#### `guests` (optional)

Later backed by: the tray hub.
Guest seats on a cone.
`list()` returns the `GuestSeat`s (`id`, `label`, `agentId`, the cone, `createdAt`, `expiresAt` or `null`, `gates`, `connected` and `pending`, how many of their messages or tool calls wait for review); a revoked or expired seat leaves it at once.
Emit `seats` when it changes.
`mint(agentId, { label, expiresAt, gates })` resolves with the `seat` and its `url`, which the panel shows once and never keeps, and `revoke(id)` ends a seat; both reject with an `Error` whose message is a sentence to show.
The hub caps `expiresAt` at 30 days.
`gates` (`{ messages, tools }`) are fixed at mint, so changing them means revoking and minting again; each is a `GuestGate`: `user` (the owner approves each one, from any of their devices, with or without Control; the invite reads "You approve each one" with "Any of your devices can approve, with or without Control."), `cone` (the shared cone itself decides, messages only unless `gates()` offers it for tools), `agent` (the automatic check decides by the owner's intent and asks a person when unsure), `scoop:<name>` (that scoop decides) or `off` (no review: messages go straight in as follow-ups, and tool calls run without review; messages only unless `gates()` offers it for tools).
The optional `unavailable()` returns a sentence when seats can't be minted here (no tray hub), or `null`; emit `unavailable` with it when it changes.
The optional `gates()` returns the policy's allowed choices, `{ messages, tools }`, each a list of `GuestGate`s in display order, where `scoop:*` means each of the cone's scoops; the owner can change them, and without it the invite offers the lists above.
`mint` always gets a concrete gate, never `scoop:*`.
With this port the Network panel is offered even without a `network` port (on a follower, say), showing only Guests.
The dummy's `?network=off&guests=on` gives that panel, on the follow page too.

#### `seat` (optional)

Later backed by: slicc-agent.
Only on a guest's page: the `Seat` (`id`, `label`, `agentId`, the shared cone, `expiresAt` or `null`, and `gates`) the guest joined with.
While it's set, `<slicc-chat>` and `<slicc-composer>` are in guest mode.
The guest's model lists only the cone, its `messages()` are the cone's transcript, `send(cone, text)` proposes a message, and every other method rejects with `EACCES`; the UI calls none of them.

#### `follow` (optional)

Later backed by: BIOS.
Only on a follower page, a SLICC that shows another SLICC's agent over a link.
`state()` returns the `FollowState`: `owner` (its display name), `link` (`connecting` for the first connection, `connected`, `reconnecting` after a connection dropped, `unlinked` when the owner unlinked this device, or `failed`), `access` (`{ view, control, terminal }`, what the owner allows this device), an optional `name` (this device's name on the owner, for the waiting page), an optional `error` (shown when `failed`) and an optional `refused`.
`refused` is the agent's sentence while the owner's agent won't take this device, such as another agent version; clear it once a follow session connects.
While it's set and `link` is `connected`, the follow light is neutral and reads "Can’t follow {owner}", its popover shows `refused`, the chat has no watch-only note for it (the embedder shows the warning; an agent port's own `readOnly` sentence still shows), and the page stays read-only with terminals off, even with Control.
Emit `follow` when it changes.
Connected without `view` means waiting to be allowed.
`leave()` forgets the link and the optional `retry()` tries again from `failed`.
Pass only the surfaces a follower has to `<slicc-app>` (agents, chat, terminal and settings) and leave out `network`.

The dummy supports `createDummyModel({ updates: 'boot' | 'starting' | 'current' | 'available' | 'restart' | 'failure' })`, also selectable with `?updates=` on `/ui/`.
Fixtures stay stable for inspection; `model.updates.setScenario('current')` completes boot.
The dummy's kernel offers three releases from 1.12.0 to 1.13.0, two of them certified, the agent one release to 0.25.0, and the syntax grammars only their installed release; its uv package offers two releases, Python links its release and the other installed packages their npm pages.
Dummy Update now and Retry simulate download and link progress, and a dummy package install reports half its `size` in bytes on the way; Restart agent and Reload only change fixture state, never restart a real process or reload the browser.
`createDummyModel({ packages: 'mixed' | 'empty' | 'fail' | 'user' | 'elsewhere' | 'npm' | 'checking' | 'offline' | 'off' })` (or `?packages=` on `/ui/`, off by default) adds invented optional packages in every state: Install and Retry finish after a short wait and install missing requirements too, `fail` makes them fail, `user` adds a pinned agent-kit and two additions (one with a warning) that Unpin and Remove take out of the list, `elsewhere` has git installed for cone with pnpm and TypeScript there at an older version, whose Update keeps it in place, and Biome both from the panel and for cone, whose Remove leaves cone's copy, and removing Python while uv is installed asks through the `confirm` option (the `/ui/` page passes spectrum's `confirm`).
`npm` is that catalog as it comes from npm: sizes on disk, TypeScript with a description over 300 characters that looks like markdown, Ruff with a curated note, esbuild offered at 0.25.10 while 0.26.0 isn't, PDF tools withheld and Biome installed at 2.2.4 while 2.3.0 isn't offered yet, with a hostile `homepage` and `repository` its npm page link ignores.
`checking` and `offline` are the same rows before npm answers and when it can't be reached; the section Retry checks again (so does a row's `retry`, which only a spectrum without `registry` shows), and `offline` fails the first time and answers the second.
`createDummyModel({ beta: 'offered' | 'installed' | 'blocked' | 'failed' | 'off' })` (or `?beta=` on `/ui/`, off by default) turns developer mode on with an invented agent at 6.6.0 (certified) and 6.13.5 on npm, 12 packages and nothing gated: `offered` offers Install beta, `installed` runs the beta, `blocked` isn't offered because it needs a newer kernel, and `failed` is a failed beta install with Retry and Install beta; `setDeveloper` toggles it after a short wait (checking npm again when turned on), and Install beta and Back to certified simulate a short install.
`updateFixtures`, `betaFixtures`, `packageFixtures` and `DummyUpdates` are exported from `/dummy`.
`createDummyModel({ mounts: 'mount' | 'cancel' | 'fail' | 'needs' })` (or `?mounts=` on `/ui/`) turns on the optional mount members, which are off by default: `mountFolder` mounts invented files at `/mnt/photos`, resolves with `null`, or rejects, as `model.files.mount.scenario` says; `needs` also lists `/mnt/photos` in `needsFolder()` until a folder is inserted there.
`createDummyModel({ network: 'ok' | 'limited' | 'failing' | 'off' })` (or `?network=` on `/ui/`, default `limited`) sets the dummy network: slicc on this computer as a linked device (`route: 'link'`, with browser automation through it), the page fetch with CORS failures, or no route, all invented; `off` leaves out the port.
`model.network.setScenario()` switches it and Check again re-emits after a short wait.
`createDummyModel({ tailnet: 'off' | 'needs-login' | 'running' | 'failed' })` (or `?tailnet=` on `/ui/`, off by default) adds an invented tailnet: an auth key starting with `tskey-` signs in, `mast-pi` and `keel-router` are online exit nodes and `buoy-laptop` is offline, and Retry on `failed` connects.
While the dummy tailnet runs with an exit node, the route is `tailnet` and the health `ok`.
`createDummyModel({ links: 'none' | 'preparing' | 'linked' | 'reconnecting' | 'exit' | 'prompt' | 'denied' | 'remote' | 'followers' | 'pairing' | 'pairing-notray' | 'forgotten' | 'outdated' })` (or `?links=` on `/ui/`, off by default) adds invented linked devices and the exit members: `linked` has quay-studio (on this computer) and pier-nuc, which can be exits and have a Chrome each, and dock-builder, which can't; quay-studio shares `sketches` and pier-nuc `proj` and a read-only `archive`, which **Mount** attaches to the dummy files at `/mnt/<source>` (with `mountInfo` naming the source) and **Eject** or the Files strip detaches; with no other browser automation, the dummy reports `via: 'link'`; `exit` sends traffic through quay-studio; `reconnecting` holds traffic for pier-nuc (health `failing`, and `ok` while the exit device is connected, both without a `detail`, as bios reports them); `remote` has pier-nuc allowed and prompting, quay-studio watching, and an offline reef-laptop that only ever connected for control; `prompt` and `denied` wait for Local Network Access, and Try again links quay-studio; `pairing` has a tray, pier-nuc and dock-builder, and `pairing` at `idle`: `pairComputer` takes a URL with a `#slicc-pair=` fragment (as `slicc pair` prints, e.g. `https://seven.sliccy.ai/#slicc-pair=17117.<token>.<fp>`) to `confirm` with the code `ab12…ef` and refuses anything else, and `confirmPairing` goes through `linking` to `linked` as SLICC on quay-studio, adding it as a local CLI row without access, or to `failed` when the URL contains `fail`; `pairing-notray` is the same without `joinUrl` and `joinCommand`, `forgotten` adds quay-studio offline with a `note`, and `outdated` adds it connected with a `note` to update slicc.
New join URL changes the URL, and `model.network.setLinks()` switches scenarios.
`createDummyModel({ leaders: 'connected' | 'failed' | 'unlinked' | 'disconnected' | 'two' })` (or `?leaders=` on `/ui/`, off by default) adds invented leaders and their members: cove-studio connected, marsh-desk failed with an error, cove-studio unlinked (gone on the next status), cove-studio disconnected, or both cove-studio and marsh-desk; Retry and Reconnect move a leader to connecting, then connected, Disconnect makes it disconnected and Forget drops it, each after a short wait.
`networkFixtures`, `tailnetFixtures`, `linksFixtures`, `leadersFixtures`, `joinUrl`, `pairingCode`, `pairingRefused`, `pairingStopped`, `pairedDevice`, `forgottenDevice`, `outdatedDevice` and `DummyNetwork` are exported from `/dummy`.
`createDummyModel({ guests: 'on' | 'none' | 'unavailable' | 'fail' | 'policy' })` (or `?guests=` on `/ui/`, off by default) adds an invented `guests` port: `on` has Seat 1 (Mara) on sliccy, connected with 2 waiting and 5 days left, and Seat 2 (Ole) on harbor, not connected and without expiry; `none` has no seats; `unavailable` has none and says guests need the tray hub, so minting rejects; `fail` makes `mint` reject with a sentence; and `policy` has the `on` seats and a `gates()` (`guestsPolicy`) that also allows tools `off`.
`mint` adds a seat after a short wait and resolves with an invented `https://www.example.com/guest/…` URL, `revoke` drops the seat, and `model.guests.setScenario()` switches scenarios.
`guestsFixtures`, `guestsPolicy`, `guestsUnavailable`, `guestsRefused` and `DummyGuests` are exported from `/dummy`.
`createDummyModel({ changes: 'files' | 'git' | 'nogit' })` (or `?changes=` on `/ui/`, default `files`) adds a git `changes` port: `git` lists the pending changes under `/workspace/harbor` and `/workspace/skills` with their `repo` and no author, and `nogit` reports git as unavailable.
`DummyChanges` is exported from `/dummy`.
`createDummyModel({ notices: 'storage' | 'mixed' | 'fail' | 'off' })` (or `?notices=` on `/ui/`, off by default) adds an invented storage warning with Try again, which clears it after a short wait (`mixed` adds an informative notice without actions, and `fail` makes Try again fail).
`noticeFixtures` and `DummyNotices` are exported from `/dummy`.
`createDummyModel({ browser: 'idle' | 'driving' | 'off' })` (or `?browser=` on `/ui/`, default `idle`) sets the dummy browser: `idle` has a history of invented actions (about 180 on harbor's tab, enough for Show more) and no driven tab, `driving` has harbor and quiet-otter driving two tabs, with harbor's last click still running and frames every 500 ms while watched, and `off` has no tabs.
Stopping an agent releases its tabs.
Like bios, `actions()` keeps the latest 500 per tab from the last 24 hours, 5,000 in total (`actionLimits`).
`DummyBrowser`, `actionLimits`, `browserHistory` and `page` are exported from `/dummy`.
`createDummyModel({ sprinkles: 'builtin' | 'cones' })` (or `?sprinkles=` on `/ui/`, default `builtin`) adds, with `cones`, invented sprinkles of other cones: a Board in harbor and one in tide-tables, and a Changelog in release-notes.
`createDummyModel({ tabs: 'owner' | 'follower' | 'connecting' | 'stalled' | 'newer' | 'older' | 'alone' | 'off' })` (or `?tabs=` on `/ui/`, off by default) adds a tabs port in that state; `model.tabs.setScenario()` switches it, and Reload connects again and becomes a follower after a short wait.
`tabsFixtures` and `DummyTabs` are exported from `/dummy`.

`createDummyModel({ follow: 'connecting' | 'waiting' | 'watch' | 'control' | 'full' | 'reconnecting' | 'unlinked' | 'failed' | 'refused' })` (`?follow=` on `/ui/`, which then leaves out the network port and offers only agents, chat, terminal and settings) makes the page a follower of SLICC on quay-studio: connecting, waiting to be allowed, View only, View and Control, everything, reconnecting, unlinked, failed, where Try again connects with everything allowed, or refused, with everything allowed but another agent version.
Leave counts in `model.follow.left` (the `/ui/` page then drops `?follow=`), and `model.follow.setScenario()` switches it.
`followFixtures` and `DummyFollow` are exported from `/dummy`.
`?links=followers` lists quay-studio (a CLI on this computer, Control always allowed), pier-nuc (a remote CLI, prompting), bay-laptop (a follower with everything allowed, watching, a terminal open), reef-phone (View only, watching) and tide-tablet (asking to follow); every links scenario has a follow link.

`createGuestModel({ seat: 'review' | 'reject' | 'off' | 'expiring', history: 'on' | 'none' | 'twin' })` (the `/guest/` page, with `?seat=`, `?history=` and `?color=`, shows `<slicc-chat>` alone) is a guest's model on sliccy for Seat 2 (Mara): `review` gates messages through the host, so a sent message waits in `queue()` (id `g1`, `g2`, …) and is then declined, leaving the notice "It was declined." with its text, `reject` gates them through the automatic check, so `send` rejects with "Messages from guests need a review, and this agent can't review them yet.", `off` takes them as follow-ups that sliccy answers, and `expiring` reviews with a link that ends in a few hours.
Its invented transcript has the host's, Mara's and Seat 3 (Jonas)'s messages, tool runs, an inline sprinkle, an answered and an open question, a pending permission request and an error with Retry; `none` starts empty, and `twin` adds a message from another seat with Mara's label.
Every other method, and every other port's, rejects with `EACCES` and is recorded in `model.refused`.
`createGuestModel`, `DummyGuestAgent` and its fixtures are exported from `/dummy`.

`createDummyModel({ readonly: 'version' })` (`?readonly=version` on `/ui/`) makes the agent port read-only with an invented line, "Watch only.
The SLICC you follow runs a newer version.
Update this one to send prompts.", and shows a warning notice without a close button (`[data-notice="readonly"]`) in place of any other notices.
`model.agent.setReadOnly(text)` changes it, and `null` ends it.

`createDummyModel({ agent: 'starting' | 'waiting' })` (`?agent=` on `/ui/`, default `ready`) starts with no agents while `starting()` returns "Seven is installing its agent.", and shows an info notice without a close button (`[data-notice="starting"]`) that goes with the line; `<slicc-app>` opens the chat with no agent (the `chat` panel, as `show('chat')` does) when it starts while `starting()` has a line and its layout has no chat; once an agent is active, that agent's chat takes the `chat` panel's place in the dock, focused if focus was in it, and the `chat` panel closes, also when a saved layout brings it back.
With `starting`, after 100 ticks of the dummy clock (3 s at the default delay) the usual cones arrive and the line clears; `waiting` waits for `model.agent.arrive()`, which does the same.
`model.agent.setStarting(line)` changes the line (and `null` clears it with no agent), and either one cancels the scheduled arrival.

`createDummyModel({ import: 'v6' | 'again' | 'fail' | 'cancel-check' })` (`?import=` on `/ui/`, off by default) adds `importProfile`, `importCancel` and `importing` to the agent: any zip previews an invented export from www.sliccy.ai (3 cones, 14 scoops, 2 frozen, Anthropic and OpenAI to sign in to again, 2 mounts and a flagged `files/cones/cone/.env`), and the import ticks to 14 in a few steps and adds 3 frozen cones with `v6: true` and the report `/root/v6-import-2026-10-18.md`; a second preview says when, and **Import again** adds fresh copies. `again` starts with an earlier import, `fail` rejects with "That zip isn’t a SLICC 6 profile export.", and `cancel-check` checks slowly. `DummyImport` and its fixtures (`importPreview`, `importCones`, `importReport`, …) are exported from `/dummy`.

The kitchen sink's “docs-pass failed” card is an expired-session error for the invented `ai-adobe` account (Adobe AI, harbor-ops@example.com, `expired`, OAuth): **Log in** goes `signing-in`, then `connected` after a short wait, and the dummy records each `connect` in `settings.connects` (`{ id, gesture }`, whether `navigator.userActivation.isActive` was true at the call); inbox-triage's “Tickets connector” card names `mcp:tickets`, a token account, so its **Log in** opens Settings at that row; `createDummyModel({ login: 'fail' })` (`?login=fail` on `/ui/`) makes OAuth sign-ins reject with “The sign-in window was closed before it finished.”
The dummy's sign-ins carry `signIn` while `signing-in`: OpenAI Codex a device code on its known host (`{ url: 'https://auth.openai.com/codex/device', code: 'WDJB-MJHT' }`, `deviceSignIn`); `createDummyModel({ login: 'code' })` (`?login=code` on `/ui/`) gives every OAuth sign-in that device code, `login: 'url'` (`?login=url`) only a sign-in page on that host (`pageSignIn`), and `login: 'lookalike'` (`?login=lookalike`) the device code on `https://auth.openai.com.example.net/device` (`lookalikeSignIn`), so only OpenAI Codex gets a link.
Those three scenarios also add an expired OpenAI Codex account (`openai-codex`, `codexAccount`) and point the kitchen sink's “docs-pass failed” card at it, so its **Log in** shows the code with the link (or, with `lookalike`, the warning).
The dummy records a `connect`'s `options` in `settings.connects`, and `{ method: 'key' }` connects without a sign-in, reading “API key”.
`createDummyModel({ accounts: 'dual' })` (`?accounts=dual`) is `accounts: 'vault'` plus the invented Lumen AI (`lumen`, `auth: 'oauth'`, `secret: 'api-key'`, `store: 'vault'`, `keyUrl`, `vaultName: 'LUMEN_API_KEY'`), which signs in or takes a key.
`createDummyModel({ providers: 'none' })` (`?providers=none` on `/ui/`) starts with no model provider connected: `models()` offers only the models of connected accounts, and connecting OpenAI offers the invented GPT-6 and GPT-6 mini (its `default`).
`createDummyModel({ providers: 'all' })` (`?providers=all` on `/ui/`) adds `providers()` and `remove` with 14 invented providers (`providerFixtures` from `/dummy`): API keys for Anthropic, Cerebras, Groq, Mistral, OpenAI and OpenRouter, OAuth for Adobe AI, GitHub Copilot and OpenAI Codex, fields for Amazon Bedrock (region), Azure OpenAI (endpoint, a `customBase`, and deployment) and Cloudflare (account id, CORS-free, its own `vaultName`), and Ollama and LM Studio on this device; today's rows start as added, with Amazon Bedrock and a connected Ollama (`providerAccounts(accounts)`, `providerAccount(option)`). `connect` adds a provider and drops it again when it fails or is cancelled, a key or field starting with `bad` is refused (“{name} didn’t accept that key.”), an endpoint without `https://` is refused, and `remove` drops it.
`createDummyModel({ providers: 'all', transport: 'none' })` (`?providers=all&transport=none`) has no CORS-free transport: every provider with `needs` is also `blocked`, and Cloudflare starts connected, so it reads Unreachable. `model.settings.setTransport('extension')` (or `'link'`) clears `blocked` live, with a `providers` and an `accounts` event, and `setTransport('none')` sets it again.
The dummy's `docs` and `tickets` MCP accounts have a `url`, the dummy vault records each `endpoints` change and drops a record's pin once the page registers its server, and `createDummyModel({ mcp: 'moved' })` (`?mcp=moved` on `/ui/`) pins the vault's `MCP_DOCS_TOKEN` to docs' URL and moves `docs` to `movedDocs` (from `/dummy`).

`createDummyModel({ monitor: 'agent' })` (`?monitor=agent` on `/ui/`) adds the agent's Tasks (a tree by `depth`), Processes and Recent problems sections to the monitor, and its Running vital.
Like slicc-agent's snapshot, the dummy's vitals are the budget, Spend, Active agents, Processes and Process memory (both with a `series`) and Fullest context.

`createDummyModel({ approvals: 'agent' | 'user' | 'many' | 'follower' | 'fail' | 'soon' | 'elsewhere' | 'withdrawn' | 'secrets' | 'guest' | 'guest-follower' | 'guest-always' | 'long' | 'guest-args' | 'guest-empty' | 'guest-truncated' | 'tray' | 'tray-url' | 'tray-rotate' | 'tray-unlink' | 'tray-expired' })` (`?approvals=` on `/ui/`) adds waiting sudo requests: one from an agent, one from a terminal user, three in a row (the last as `www-data`), one without `decide`, one whose `decide` fails, one that expires in 24 seconds, or two whose first is answered in another tab or withdrawn after a few seconds, or one from an agent that copies a file over `/etc/fnox/config.toml`, or (`guest`) three guest requests: a message from Seat 2 (Mara) with attachments and an allow verdict, a tool call with a deny verdict, and a message whose `decide` rejects with "Someone else already answered this."
(`guest-follower`: the same without `decide`), or (`guest-always`) one guest tool call from Seat 2 (Mara) to `read_file` with `always: true`, or (`long`) one sudo request whose seven-line command ends in `curl … | sh`, or one guest `write_file` call with a blank `summary`: with seven lines of `args` ending in the same tail (`guest-args`), with no `args` (`guest-empty`), or with a prefix of them and `argsTruncated` (`guest-truncated`), or tray requests from sliccy: one to share the join URL (`tray-url`), one to make a new one (`tray-rotate`), one to unlink Kitchen tablet (`tray-unlink`), all three in a row (`tray`), or the first, which times out after a few seconds (`tray-expired`).
`createDummyModel({ asks: 'long' })` (`?asks=long`) adds a pending sudo request with that seven-line command to kitchen-sink (`k-long`).
Decisions are recorded in `model.approvals.decisions`, and `model.approvals.end(id, reason)` ends a request.

`createDummyModel({ vault: 'empty' | 'secrets' | 'policy' | 'locked' | 'request' | 'backup' | 'waiting' | 'purged' | 'session' | 'endpoints-fail' | 'off' })` (`?vault=` on `/ui/`, off by default; `notice` is kept as another name for `policy`) adds an invented vault: no secrets yet; five secrets (an API key, a jerk lease from pier-nuc revealed to `pier publish`, a Tide Mail sign-in, one without a rule and a removed one) with an activity log that pages back once; the same with a refused rule and a policy change in the log; locked before the first unlock, with a waiting request from docs-pass; unlocked with a `fnox set` request for `TIDE_STATION_TOKEN`; the secrets with a due backup reminder; or a vault that hasn't answered yet (`model.vault.arrive()` brings it); Cloudflare's Account ID and AI Gateway ID and Azure's endpoint carry `vaultSetting`s; the dummy vault keeps `settings` on its records, logs each `settings` call in `model.vault.settingsCalls`, and refuses a setting whose value starts with `bad` (“The vault refused {KEY}. Check that value and try again.”). `endpoints-fail` is the secrets with an `endpoints` that refuses (an MCP URL with “The vault refused {url} for this token. Check the server's address, then try again.”, a model URL with “The vault refused that endpoint. Check the address and try again.”). The dummy vault records each `endpoints` change in `model.vault.endpointChanges`.
`purged` is `secrets` plus two `endpoints` audit entries: one with `purged` and `adopted`, and one `pinned` (`DOCS_MCP_TOKEN` on docs.example) that Unpin turns into an `unpinned` entry; `vaultPurged` and `vaultPinned` are exported. `session` is `secrets` plus three `session` audit entries (`vaultSessions`, exported): SMTP trusted by public roots, Postgres trusted by a pinned anchor through pier-nuc, and HTTP/1.1 with no `verifiedBy`.
It implements every op with the vault's checks, and keeps only names: `model.vault.puts` records `{ name, request? }`, `cancelled` the cancelled requests, `imports` each import's kind, size and pick, and `exported` the exports.
Import offers five invented candidates (one replaces a secret, one is a model key, one is refused with a reason that the done stage repeats; KeePass adds a `_2` duplicate), six answers ENOTSUP, page ops are recorded with `uid: null, tag: null`, and value ops while locked answer EACCES.
`model.vault.fail(code, message)` makes the next op fail.
Its buttons are plain Spectrum buttons that answer at once: Unlock unlocks, and created buttons are in `model.vault.buttons`.
`vaultFixtures`, `DummyVault` and `DummyVaultButton` are exported from `/dummy`.
`createDummyModel({ hold: 'waiting' | 'locked' | 'off' })` (`?hold=` on `/ui/`) makes the agent hold two tool results; a `locked` hold clears when the dummy vault unlocks, and `model.agent.setHold(hold)` changes it.

On phones the update status and the tray connection show only their status light (the tray's budget is hidden) and the network indicator a cloud icon, with the text in their labels and tooltips; the agent picker keeps room for the cone's name, cut with an ellipsis when long, and the bottom rail scrolls when needed.
The update status comes first so progress and failures remain reachable on narrow screens.
While a row has `beta`, the update status shows a notice **Beta** badge (`[data-updates] [data-beta]`) after its light, or alone when nothing else applies, at every size; its tooltip and label add "{label} runs beta {version}, not certified", with the label's folder left out ("Agent runs beta 6.13.5, not certified").

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

- **`KernelFiles`** lists the OPFS root as the tree, reads and writes files through the OPFS API, and removes them recursively.
  Directories in `skip` show up but aren't scanned; paths in `hide` (and everything under them) don't show up at all.
  `start()` rescans when a `FileSystemObserver` record touches something the tree shows: at once after a quiet `interval` (default 2000 ms), then at most once per `interval`. Records only inside `hide` paths or below `skip` folders start no rescan. Where the browser can't observe OPFS, it rescans every `interval` ms. A rescan that finds changes emits `files` and a `file` per changed file, so open tabs follow what the terminal writes.
  Without an agent there are no pending changes.
- **`KernelTerminals`** opens `bash -i` (or `argv`) in `cwd` (default `/home`) as `user` (default the kernel's, `root`) through `kernelBackend`, one session per terminal, as many as the user opens.
  `open` (default 1) is how many it starts with.
- Everything else is idle (`IdleAgent`, `IdleBrowser`, `IdleMemory`, `IdleMonitor`, `IdleSprinkles`, `IdleTray`, from `idleModel(storage)`): empty lists, and actions that need a backend throw.
  Settings are kept in `storage` under `slicc-agent.settings` (exported as `settingsKey`), the agent's key, so the theme chosen in the app is the one the page boots with; when that key is missing they are read once from the older `slicc-ui.settings`.
  Leave their surfaces out of `surfaces`.

Each section is its own port, so an embedder can mix real and dummy per section, for example `{ ...createDummyModel(), files: new KernelFiles(root) }`.

`<slicc-file-view>` has **Edit**: the file opens in a plain text area, and **Save** or `Mod+S` writes it through `files.write`; `Escape` cancels.

The `kitchen-sink` cone holds every kind of message, content and lick in one conversation, for design work and screenshots.
Its runs of tool calls carry invented labels, which the dummy's `toolLabel` answers after a short pause, keyed by the title of the run's first call; one is long enough to be cut.
Each reply to it is paced to take about 20 seconds, so its streaming states can be looked at.
A prompt that says search or grep runs a search.
Its tool turn has two runs and a standalone tool message with URL, file and plain commands in every state, and two dummy browser tabs carry invented `data:` favicons.
The dummy's fixtures are invented: a small forecast API called harbor, with cones, scoops, a conversation per agent, pending changes (one of them binary, without a diff), browser tabs and accounts.
The harbor cone ends with three `scoop-notify` licks: amber-heron's, finished with a `summary`, a markdown body and a `report` at `/shared/scoop-notifications/amber-heron.md`; grey-tern's, failed, with no summary; and salt-gull's, only the legacy bracketed line.
Its only sprinkles are SLICC's own: `welcome` (the onboarding wizard, as a dip in the sliccy cone) and `suggestions`, copied from `slicc` (`packages/vfs-root/shared/sprinkles/`, commit `aa29784`) with their comments stripped, as is the sprinkle theme in `src/app/sprinkle-theme.css`.
`suggestions` reads its stream from the invented `/home/.gelatiere/suggestions.json` through the bridge; there is no `/home/.welcomed`, so `welcome` starts its wizard.
Its replies are scripted by keyword (replay, debug or investigate, tests, fix or add, open or docs, files, anything else), and their tool calls act on the other ports: an edit writes a file and shows up as a change, a browse opens a tab.
Debugging runs seven commands in a row in one reply, so its status grows a step at a time while it streams.
Replay plays a longer run across ten replies, with long commands whose arguments stream in and tool-only replies in a row, for checking that past messages never move down; `?replay` on the UI test page starts it on load.

### Distribution

The UI is ESM with code splitting: `slicc-ui.js`, `slicc-dummy.js` and `chunk-*.js` next to them in `dist/`, with no bare imports, so the folder can be served as plain files from OPFS. dockview's ESM build has no CSS; the build takes it from dockview's UMD bundle.
`@pierre/diffs` highlights with Shiki.
`dist/` carries the grammars SLICC needs most (CSS, diff, HTML, JavaScript, JSON, JSX, Markdown, Python, shell, SQL, TOML, TSX, TypeScript, XML, YAML); every other grammar and theme stays out of `dist/` and loads the first time a file needs it.
It loads from `grammarBase` first, if set, and then from `https://cdn.jsdelivr.net/npm/@shikijs/` (pinned to the installed version, CORS and CORP headers set).
For offline use, install the optional peer dependencies `@shikijs/langs` and `@shikijs/themes` (pinned to the same version; plain relative ESM, no bare imports), serve them, and point `grammarBase` (on `<slicc-app>`, or `setGrammarBase()`) at the folder holding `langs/` and `themes/`, for example `/node_modules/@shikijs/`.
The build fails if the peer versions drift from the installed ones.
`SLICC_GRAMMAR_BASE` points the build at another CDN.
`dist/` is about 55 files and 5.5 MB of JavaScript.
The build fails if React is bundled; `@pierre/trees` lists React as a peer dependency, so npm installs it, but the `web-components` entry runs on Preact.
Types are in `dist/types/ui.d.ts`, `dist/types/dummy.d.ts` and `dist/types/kernel.d.ts`, exported as `@ai-ecoverse/slicc-spectrum/ui`, `/dummy` and `/kernel`.

### dockview notes

- Keyboard navigation (`keyboardNavigation`) needs dockview-enterprise, so `<slicc-dock>` implements <kbd>F6</kbd> and <kbd>Ctrl</kbd>+<kbd>]</kbd>/<kbd>[</kbd> itself.
- A floating group with a border (`--dv-floating-border`, which dockview's own light theme sets) grows by twice the border width on every save and restore.
  The theme draws the edge with a box shadow instead.

## Development

```sh
npm install
npm run lint
npm test
```

`npm test` builds `dist/` and runs the integration tests in headless Chromium over raw CDP, through the [harness from slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web#integration-test-harness), against a fake backend (`test/integration/page/fake-backend.js`).
It writes CPU profiles, screenshots and console logs to `artifacts/`, and V8 coverage of `dist/` to `coverage/` only with `SLICC_COVERAGE=1` (CI leaves it off, since nothing reads it; the unit tests' diff coverage is separate).
The test page is served cross-origin isolated (COOP/COEP), as slicc-kernel requires.
`test/integration/kernel.test.mjs` runs `bash -i` end to end on `@ai-ecoverse/slicc-kernel` (a pinned dev dependency), with `@ai-ecoverse/wasm-bash` and `@ai-ecoverse/wasm-coreutils` installed into OPFS by the page (`/kernel.html`).
`npm start` serves the test page on port 8080, and the UI at `/ui/`.
`test/integration/kernel-ui.test.mjs` boots `<slicc-app>` on the kernel model (`/kernel-ui/`): a command in the terminal, its file in the tree, an edit in a file tab read back in the terminal, a second terminal, and a reload.
`test/integration/ui.test.mjs` covers the shell, the layout (moving, closing, floating, reopening and reloading), streaming a reply with a tool call, stopping it, switching themes and the keyboard, and saves screenshots to `artifacts/ui/`.

The Biome, TypeScript, lefthook, Renovate and CI configuration comes from [slicc-shared-web](https://github.com/ai-ecoverse/slicc-shared-web), which also provides the `slicc-lint`, `slicc-lint-comments`, `slicc-agents-md`, `slicc-no-unit-tests`, `slicc-unit-cover` and `slicc-diff-cover` commands used by `npm run lint` and the pre-commit hook.
`npm install` runs its `slicc-install-hooks` (a no-op on Windows), which sets the shared `core.hooksPath` to `.githooks` and installs lefthook into each worktree's own `node_modules/.git-hooks`; the committed shims in `.githooks/` run that hook, and fail with "run npm install" in a worktree that has none.

Unit tests live in `test/unit/`, which is gitignored: each change brings fresh unit tests for its own lines, and they are never committed or kept.
The pre-commit hook runs them in Node against happy-dom under monocart and fails the commit unless the staged lines in `src/` are fully covered (`slicc-unit-cover` runs the unit tests the change reaches, then `slicc-diff-cover`, which runs `diff-cover --fail-under 100` and needs [uv](https://docs.astral.sh/uv/)).
`npm run test:unit` uses this repo's `mcr.config.mjs`, which extends shared-web's, preloads `unit-setup.mjs` into every test process, and picks the untested `src/` files with a function instead of the glob `**/*.{js,mjs,ts}`.
`unit-setup.mjs` registers happy-dom's globals and turns `.css`, `.shtml` and `dockview-core/css` imports into text modules, as the build does, so a fresh unit test can import any module in `src/`.
The glob's `**` skips dot directories, so in a checkout under one (a bb worktree in `~/.bb/`) untested files were left out of the report and the hook passed on lines no unit test ran.

## Design review

[`.github/workflows/design-review.yml`](.github/workflows/design-review.yml) has Claude review every ready, same-repo pull request visually, against Spectrum 2 and general design guidelines, and leave a comment with screenshots.
It also runs on `workflow_dispatch` with `pr_number`; fork pull requests and drafts are skipped.

- **Setup** (`CERT_RUNNER`): main and the pull request are each built and served by `test/integration/chrome.mjs`, and each is open in a Chrome with a window under Xvfb, so hover works: main on CDP 9301 (`:8301/ui/?delay=0`), the pull request on CDP 9302 (`:8302`).
  Claude drives both with `playwright-core`, shoots the same states side by side (light and dark, desktop and a 420×860 mobile viewport), and reads spectrum.adobe.com, seeded with every URL in its sitemap.
- **What it checks:** tokens only, never colour alone, contrast in dark, focus, copy, typography, icons, layout at 420, and the `data-*` hooks embedders test on.
  The prompt carries the setup pitfalls too: wait for fonts, blur focus, compare at the same scroll anchor, and use a real mobile viewport.
- **The comment:** Claude writes `comment.md` and its screenshots, uploaded as the run's `design-review-comment-<pr>` and `design-review-shots-<pr>` artifacts.
  A separate `post` job on a fresh runner, the only one with the Cloudflare token, puts the screenshots in the R2 bucket slicc uses for PR screenshots (`slicc-pr-screenshots`, under `slicc-spectrum/pr-<n>/<run>/`) and posts the comment with them inline from its public URL.
  A screenshot that doesn't upload is linked to the artifact instead.
  The token is the org secret `CLOUDFLARE_API_TOKEN`; `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET` and `R2_PUBLIC_BASE_URL` default to slicc's values.

## License

Apache-2.0
