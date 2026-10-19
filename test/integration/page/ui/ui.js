import { createDummyModel } from '/dist/slicc-dummy.js';
import { confirm, surfaces } from '/dist/slicc-ui.js';

window.consoleLog = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const shown = (arg) => {
      if (arg instanceof Error) return arg.stack;
      try {
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      } catch {
        return String(arg);
      }
    };
    window.consoleLog.push(args.map(shown).join(' '));
    original(...args);
  };
}

const params = new URLSearchParams(location.search);
if (params.get('speech') === 'none') {
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
}
if (params.get('speech') === 'dummy') {
  window.speechLog = [];
  window.SpeechRecognition = class {
    start() {
      window.speech = this;
      window.speechLog.push('start');
      this.timer = setTimeout(
        () =>
          this.onresult?.({
            results: [[{ transcript: window.speechText ?? 'Check the Porto forecast' }]],
          }),
        50
      );
    }
    stop() {
      clearTimeout(this.timer);
      window.speech = null;
      window.speechLog.push('stop');
      this.onend?.();
    }
  };
}
const delay = Number(params.get('delay') ?? 30);
const follow = params.get('follow') ?? 'off';
const model = createDummyModel({
  delay,
  storage: localStorage,
  updates: params.get('updates') ?? 'current',
  packages: params.get('packages') ?? 'off',
  confirm,
  mounts: params.get('mounts') ?? 'off',
  network: params.get('network') ?? (follow === 'off' ? 'limited' : 'off'),
  tailnet: params.get('tailnet') ?? undefined,
  links: params.get('links') ?? undefined,
  leaders: params.get('leaders') ?? undefined,
  changes: params.get('changes') ?? 'files',
  notices: params.get('notices') ?? 'off',
  tabs: params.get('tabs') ?? 'off',
  approvals: params.get('approvals') ?? 'off',
  follow,
  vault: params.get('vault') ?? 'off',
  guests: params.get('guests') ?? 'off',
  accounts: params.get('accounts') ?? 'settings',
  providers: params.get('providers') ?? 'connected',
  hold: params.get('hold') ?? 'off',
  readonly: params.get('readonly') ?? 'off',
  browser: params.get('browser') ?? 'idle',
  sprinkles: params.get('sprinkles') ?? 'builtin',
  monitor: params.get('monitor') ?? 'dummy',
  import: params.get('import') ?? 'off',
  login: params.get('login') ?? 'ok',
});
if (params.has('color')) model.settings.update({ color: params.get('color') });
const app = document.querySelector('slicc-app');
if (params.has('fonts')) app.fontBase = params.get('fonts') || null;
if (params.has('vf')) app.variableFont = params.get('vf') || null;
if (params.has('grammars')) app.grammarBase = params.get('grammars');
if (model.follow) {
  const followed = new Set(['agents', 'chat', 'terminal', 'settings', 'network']);
  if (params.get('surfaces') !== 'all')
    app.surfaces = surfaces.filter((surface) => followed.has(surface.id));
  const leave = model.follow.leave.bind(model.follow);
  model.follow.leave = async () => {
    await leave();
    params.delete('follow');
    location.search = params.toString();
  };
}
app.model = model;
window.model = model;
window.app = app;
await app.updateComplete;
window.ready = true;
if (params.has('replay'))
  void model.agent.send(params.get('replay') || 'cone-sliccy', 'Replay the long tool calls');

window.$ = (...path) => {
  let node = document;
  for (const selector of path) {
    node = (node.shadowRoot ?? node).querySelector(selector);
    if (!node) return null;
  }
  return node;
};

window.drag = async (source, target, x, y) => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, 50));
  const data = new DataTransfer();
  const rect = target.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y };
  const fire = (node, type) =>
    node.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        dataTransfer: data,
        ...at,
      })
    );
  fire(source, 'dragstart');
  await wait();
  fire(target, 'dragenter');
  fire(target, 'dragover');
  await wait();
  fire(target, 'dragover');
  await wait();
  fire(target, 'drop');
  fire(source, 'dragend');
  await wait();
};

window.deep = (selector) => {
  const roots = [document];
  for (let index = 0; index < roots.length; index++) {
    const found = roots[index].querySelector(selector);
    if (found) return found;
    for (const node of roots[index].querySelectorAll('*')) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
    }
  }
  return null;
};

window.settingsPart = (...path) => window.$('slicc-app', 'slicc-dock', 'slicc-settings', ...path);

window.chatPart = (...path) => window.$('slicc-app', 'slicc-dock', 'slicc-chat', ...path);

window.filesPart = (...path) => window.$('slicc-app', 'slicc-dock', 'slicc-files', ...path);

window.focused = () => {
  let node = document.activeElement;
  const path = [];
  while (node) {
    path.push(node.localName + (node.dataset?.id ? `#${node.dataset.id}` : ''));
    node = node.shadowRoot?.activeElement ?? null;
  }
  return path.join(' > ');
};

window.activated = () => {
  const chain = [];
  let node = document.activeElement;
  while (node) {
    chain.push(node);
    node = node.shadowRoot?.activeElement ?? null;
  }
  const buttons = ['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color'];
  const text = (element) =>
    element.isContentEditable ||
    ['textarea', 'sp-search', 'sp-textfield'].includes(element.localName) ||
    (element.localName === 'input' && !buttons.includes(element.type));
  const dock = window.dock();
  const id = dock.api.activePanel?.id ?? '';
  const content = dock.content(id);
  return {
    id,
    focused: !!content && chain.includes(content),
    path: chain.map((element) => element.localName).join(' > '),
    text: chain.some(text),
    terminal: !!chain.at(-1)?.closest('slicc-terminal'),
  };
};

window.layout = () => {
  const dock = window.$('slicc-app', 'slicc-dock');
  return Object.fromEntries(
    dock.api.panels.map((panel) => {
      const { left, top, width, height } = panel.group.element.getBoundingClientRect();
      return [
        panel.id,
        {
          group: panel.group.id,
          floating: panel.group.api.location.type === 'floating',
          box: [left, top, width, height].map(Math.round),
        },
      ];
    })
  );
};

window.row = (path) => {
  const tree = window.$(
    'slicc-app',
    'slicc-dock',
    'slicc-files',
    'slicc-file-tree',
    'file-tree-container'
  );
  return tree?.shadowRoot.querySelector(`[data-item-path="${path}"]`) ?? null;
};

window.code = (id) => {
  const content = window.$('slicc-app', 'slicc-dock').content(id);
  const view = content?.shadowRoot.querySelector('slicc-code-view, slicc-diff-view');
  const container = view?.shadowRoot.querySelector('diffs-container');
  return container?.shadowRoot.textContent ?? '';
};

window.button = (id, text) =>
  [
    ...window
      .$('slicc-app', 'slicc-dock')
      .content(id)
      .shadowRoot.querySelectorAll('sp-action-button, swc-action-button, swc-button'),
  ]
    .find((candidate) => candidate.textContent.trim() === text)
    .click();

window.dock = () => window.$('slicc-app', 'slicc-dock');

window.terminal = () => {
  const dock = window.$('slicc-app', 'slicc-dock');
  const visible = (dock?.api.panels ?? [])
    .filter((panel) => panel.id.startsWith('terminal:') && panel.api.isVisible)
    .map((panel) => panel.id);
  const active = dock?.api.activePanel?.id;
  const id = visible.includes(active) ? active : visible.at(-1);
  return id ? dock.content(id) : null;
};

window.screen = () =>
  [...(window.terminal()?.shadowRoot.querySelectorAll('slicc-terminal .term-row') ?? [])]
    .map((row) => row.textContent.trimEnd())
    .join('\n');

window.watchShifts = () => {
  const moves = [];
  let tops = new Map();
  const frame = (now) => {
    const log = window.chatPart('.log');
    const next = new Map(
      [...(log?.querySelectorAll('swc-conversation-turn') ?? [])].map((turn) => [
        turn,
        turn.getBoundingClientRect().top,
      ])
    );
    let down = null;
    let up = 0;
    for (const [turn, top] of next) {
      const before = tops.get(turn);
      if (before === undefined) continue;
      const delta = top - before;
      if (delta > 0.25 && (!down || top > down.top)) down = { delta, turn, top };
      up = Math.min(up, delta);
    }
    if (down || up < -0.25)
      moves.push({
        at: Math.round(now),
        down: down ? Math.round(down.delta * 10) / 10 : 0,
        up: Math.round(up * 10) / 10,
        turn: down ? (down.turn.dataset.id ?? down.turn.className) : null,
        label: down ? down.turn.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null,
      });
    tops = next;
    window.shiftFrame = requestAnimationFrame(frame);
  };
  window.shifts = moves;
  window.shiftFrame = requestAnimationFrame(frame);
  return true;
};

window.stopShifts = () => {
  cancelAnimationFrame(window.shiftFrame);
  return window.shifts;
};
