import { createDummyModel } from '/dist/slicc-dummy.js';
import '/dist/slicc-ui.js';

const params = new URLSearchParams(location.search);
const delay = Number(params.get('delay') ?? 30);
const model = createDummyModel({
  delay,
  storage: localStorage,
  updates: params.get('updates') ?? 'current',
});
if (params.has('color')) model.settings.update({ color: params.get('color') });
const app = document.querySelector('slicc-app');
if (params.has('fonts')) app.fontBase = params.get('fonts') || null;
if (params.has('vf')) app.variableFont = params.get('vf') || null;
if (params.has('grammars')) app.grammarBase = params.get('grammars');
app.model = model;
window.model = model;
window.app = app;
await app.updateComplete;
window.ready = true;

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

window.settingsPart = (...path) => window.$('slicc-app', 'slicc-dock', 'slicc-settings', ...path);

window.focused = () => {
  let node = document.activeElement;
  const path = [];
  while (node) {
    path.push(node.localName + (node.dataset?.id ? `#${node.dataset.id}` : ''));
    node = node.shadowRoot?.activeElement ?? null;
  }
  return path.join(' > ');
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

window.screen = () =>
  [
    ...(window
      .$('slicc-app', 'slicc-dock', 'slicc-terminals')
      ?.shadowRoot.querySelectorAll('slicc-terminal:not([hidden]) .term-row') ?? []),
  ]
    .map((row) => row.textContent.trimEnd())
    .join('\n');
