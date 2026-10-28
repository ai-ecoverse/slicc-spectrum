import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { launch } from './chrome.mjs';

const chrome = await launch();
after(() => chrome.close());

const row = (cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
const table = (id) =>
  `<table class="sprinkle-table" id="${id}"><thead><tr><th>Station</th><th>High tide</th><th>Height</th></tr></thead><tbody>${[
    ['Porto', '06:12', '3.1 m'],
    ['Leixões', '06:20', '3.0 m'],
    ['Aveiro', '06:41', '2.8 m'],
  ]
    .map(row)
    .join('')}</tbody></table>`;

const fixture = `<!DOCTYPE html><html><head></head><body>
<div class="sprinkle-meter" id="meter"><div class="sprinkle-meter__header"><span class="label">Tide gauge cache</span><span class="value">62%</span></div><div class="sprinkle-meter__track"><div class="fill" style="width: 62%"></div></div></div>
<div class="sprinkle-meter sprinkle-meter--positive" id="positive-meter"><div class="sprinkle-meter__track"><div class="fill" style="width: 30%"></div></div></div>
<div class="sprinkle-meter sprinkle-meter--negative" id="bare-meter"><div class="fill" style="width: 80%"></div></div>
<div class="sprinkle-progress-bar" id="bar"><div class="sprinkle-progress-bar__track"><div class="fill" style="width: 40%"></div></div></div>
<div class="sprinkle-progress-bar sprinkle-progress-bar--positive" id="bare-bar"><div class="fill" style="width: 70%"></div></div>
${table('regular')}
<div class="sprinkle-density-compact">${table('compact')}</div>
<script>
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'theme-probe') return;
    const token = ([name, property]) => {
      const node = document.createElement('div');
      node.style.setProperty(property, 'var(' + name + ')');
      document.body.append(node);
      const value = getComputedStyle(node).getPropertyValue(property);
      node.remove();
      return value;
    };
    const read = ([selector, ...properties]) => {
      const style = getComputedStyle(document.querySelector(selector));
      return properties.map((property) => style.getPropertyValue(property));
    };
    parent.postMessage({
      type: 'theme-probe',
      light: document.documentElement.classList.contains('theme-light'),
      tokens: Object.fromEntries(Object.entries(event.data.tokens).map(([key, pair]) => [key, token(pair)])),
      styles: event.data.styles.map(read),
    }, '*');
  });
</script></body></html>`;

const tokens = {
  thickness: ['--swc-progress-bar-thickness-small', 'height'],
  pill: ['--s2-radius-pill', 'border-top-left-radius'],
  informative: ['--swc-informative-visual-color', 'background-color'],
  positive: ['--swc-positive-visual-color', 'background-color'],
  negative: ['--swc-negative-visual-color', 'background-color'],
  accent: ['--swc-accent-visual-color', 'background-color'],
  spacing50: ['--s2-spacing-50', 'padding-top'],
  spacing75: ['--s2-spacing-75', 'padding-top'],
  spacing200: ['--s2-spacing-200', 'padding-top'],
  spacing300: ['--s2-spacing-300', 'padding-top'],
  font75: ['--s2-font-size-75', 'font-size'],
  font100: ['--s2-font-size-100', 'font-size'],
};

const fill = [
  'height',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'background-color',
];
const cell = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'font-size'];
const styles = [
  ['#meter .fill', ...fill],
  ['#positive-meter .fill', ...fill],
  ['#bare-meter > .fill', ...fill],
  ['#bar .fill', ...fill],
  ['#bare-bar > .fill', ...fill],
  ['#compact th', ...cell],
  ['#compact td', ...cell],
  ['#regular th', ...cell],
  ['#regular td', ...cell],
  ['#compact tbody tr:first-child td', 'border-bottom-style'],
  ['#compact tbody tr:last-child td', 'border-bottom-style'],
  ['#regular tbody tr:last-child td', 'border-bottom-style'],
];

const expected = (t) => {
  const bar = (color) => [t.thickness, t.pill, t.pill, t.pill, t.pill, t[color]];
  return [
    bar('informative'),
    bar('positive'),
    bar('negative'),
    bar('accent'),
    bar('positive'),
    [t.spacing50, t.spacing200, t.spacing50, t.spacing200, t.font75],
    [t.spacing75, t.spacing200, t.spacing75, t.spacing200, t.font75],
    [t.spacing75, t.spacing300, t.spacing75, t.spacing300, t.font100],
    [t.spacing200, t.spacing300, t.spacing200, t.spacing300, t.font100],
    ['solid'],
    ['none'],
    ['none'],
  ];
};

async function open(t, width, height) {
  const page = await chrome.page(t);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width === 420,
  });
  t.after(() => page.send('Emulation.clearDeviceMetricsOverride').catch(() => {}));
  await page.goto('/ui/?delay=5&color=light');
  await page.until(() => window.ready === true);
  await page.until(() => window.$('slicc-app', 'slicc-dock')?.api.panels.length > 0);
  if (width === 420) await page.until(() => window.app.getAttribute('screen') === 'phone');
  await page.evaluate((html) => {
    const list = window.model.sprinkles.list.bind(window.model.sprinkles);
    window.model.sprinkles.list = () => [
      ...list(),
      {
        id: 'theme-probe',
        name: 'theme-probe',
        title: 'Tide tables',
        icon: 'hand',
        agentId: 'cone-sliccy',
        html,
      },
    ];
    window.model.sprinkles.emit('sprinkles', window.model.sprinkles.list());
    window.app.show('sprinkle:theme-probe');
    window.themeProbe = (request) =>
      new Promise((resolve) => {
        const frame = window
          .$('slicc-app', 'slicc-dock')
          .content('sprinkle:theme-probe')
          ?.shadowRoot?.querySelector('iframe');
        if (!frame?.contentWindow) return resolve(null);
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.data?.type !== 'theme-probe') return;
          removeEventListener('message', listen);
          resolve(event.data);
        };
        addEventListener('message', listen);
        frame.contentWindow.postMessage({ type: 'theme-probe', ...request }, '*');
        setTimeout(() => {
          removeEventListener('message', listen);
          resolve(null);
        }, 200);
      });
    return true;
  }, fixture);
  return page;
}

async function probe(page, light) {
  const request = { tokens, styles };
  await page.until(
    async (request, light) => (await window.themeProbe(request))?.light === light,
    request,
    light
  );
  return page.evaluate((request) => window.themeProbe(request), request);
}

function check(result) {
  const t = result.tokens;
  assert.notEqual(t.thickness, '0px');
  assert.notEqual(t.pill, '0px');
  assert.ok(
    [t.informative, t.positive, t.negative, t.accent].every(
      (color) => color !== '' && color !== 'rgba(0, 0, 0, 0)'
    ),
    JSON.stringify(t)
  );
  assert.equal(new Set([t.spacing50, t.spacing75, t.spacing200, t.spacing300]).size, 4);
  assert.notEqual(t.font75, t.font100);
  assert.deepEqual(
    Object.fromEntries(styles.map(([selector], i) => [selector, result.styles[i]])),
    Object.fromEntries(styles.map(([selector], i) => [selector, expected(t)[i]]))
  );
}

test('sprinkle meters and compact tables keep their fill, padding and type in light and dark', async (t) => {
  const page = await open(t, 1280, 800);
  check(await probe(page, true));
  await page.evaluate(() => window.model.settings.update({ color: 'dark' }));
  await page.until(() => window.$('slicc-app', '.swc-theme').classList.contains('swc-theme--dark'));
  check(await probe(page, false));
  assert.deepEqual(page.errors, []);
});

test('sprinkle meters and compact tables keep their fill, padding and type on a 420 phone', async (t) => {
  const page = await open(t, 420, 860);
  await page.until(() => {
    const frame = window
      .$('slicc-app', 'slicc-dock')
      .content('sprinkle:theme-probe')
      ?.shadowRoot?.querySelector('iframe');
    const box = frame?.getBoundingClientRect();
    return !!box && box.width > 0 && box.right <= innerWidth;
  });
  check(await probe(page, true));
  assert.deepEqual(page.errors, []);
});
