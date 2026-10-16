import { createGuestModel } from '/dist/slicc-dummy.js';
import '/dist/slicc-ui.js';

const params = new URLSearchParams(location.search);
const model = createGuestModel({
  seat: params.get('seat') ?? 'review',
  history: params.get('history') ?? 'on',
  delay: Number(params.get('delay') ?? 30),
});
window.calls = [];
const port = model.agent;
model.agent = new Proxy(port, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== 'function') return value;
    return (...args) => {
      if (typeof key === 'string') window.calls.push(key);
      return value.apply(target, args);
    };
  },
});
const color = params.get('color') ?? 'light';
model.settings.update({ color });
const theme = document.querySelector('.swc-theme');
theme.className = `swc-theme swc-theme--sizeM swc-theme--${color}`;
document.querySelector('sp-theme').color = color;
document.documentElement.style.colorScheme = color;
const chat = document.querySelector('slicc-chat');
chat.model = model;
window.model = model;
window.port = port;
window.chat = chat;
await chat.updateComplete;
window.ready = true;

window.$ = (...path) => {
  let node = document;
  for (const selector of path) {
    node = (node.shadowRoot ?? node).querySelector(selector);
    if (!node) return null;
  }
  return node;
};
