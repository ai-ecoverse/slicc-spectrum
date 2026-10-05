import '/dist/slicc-terminal.js';
import { FakeBackend } from './fake-backend.js';

window.FakeBackend = FakeBackend;

window.mount = async (options = {}, attributes = {}) => {
  const stage = document.getElementById('stage');
  const terminal = document.createElement('slicc-terminal');
  for (const [name, value] of Object.entries(attributes)) terminal.setAttribute(name, value);
  window.backend = new FakeBackend(options);
  terminal.backend = window.backend;
  stage.replaceChildren(terminal);
  window.terminal = await terminal.ready;
  return { cols: terminal.cols, rows: terminal.rows };
};

window.probe = () => ({
  isolated: crossOriginIsolated,
  shared: typeof SharedArrayBuffer === 'function',
  evaluates: new Function('return 1 + 1')() === 2,
});
