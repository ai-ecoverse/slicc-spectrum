import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:8080/' });

const dockview = new URL('./node_modules/dockview-core/dist/dockview-core.js', import.meta.url);
const dockviewCss = 'slicc-unit:dockview-core/css';
const textModule = (text) => ({
  format: 'module',
  source: `export default ${JSON.stringify(text)};`,
  shortCircuit: true,
});

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'dockview-core/css') return { url: dockviewCss, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === dockviewCss) {
      const umd = readFileSync(dockview, 'utf8');
      return textModule(JSON.parse(umd.match(/s\.textContent = (".*");/)[1]));
    }
    if (url.startsWith('file:') && /\.(css|shtml)$/.test(new URL(url).pathname)) {
      return textModule(readFileSync(new URL(url), 'utf8'));
    }
    return next(url, context);
  },
});
