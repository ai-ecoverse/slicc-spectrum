# slicc-spectrum

Web components for SLICC: `<slicc-terminal>` (wterm) and the app UI on Spectrum Web Components and dockview, on a typed model (`src/model/`), a dummy (`src/dummy/`) and a kernel model (`src/kernel/`).

- `npm run lint`, `npm run test:unit` (happy-dom, gitignored `test/unit/`).
- No comments anywhere. Changed lines in `src/` need 100% unit coverage. Every change comes with committed integration tests; a fix's test fails on the old code.
- Locally run only the integration files you touch: `npm run test:file -- test/integration/<name>.test.mjs`. The full `npm test` (a Chrome per file) is for CI.
- No React. Import Spectrum components one by one.
- Fixtures are invented, except SLICC's own sprinkles (`src/dummy/sprinkles/`).
- Integration tests use slicc-shared-web's CDP harness via `test/integration/chrome.mjs`; UI page: `test/integration/page/ui/`.
- Keep `data-id`, `data-action`, `data-surface` and `slot="status"` stable: embedders (slicc-bios) test on them.
