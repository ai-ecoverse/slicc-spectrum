# slicc-spectrum

Web components for SLICC: `<slicc-terminal>` (wterm) and the app UI on Spectrum Web Components with dockview, against a typed model (`src/model/`) with a dummy (`src/dummy/`) and a slicc-kernel model for files and terminals (`src/kernel/`).

- `npm run lint`, `npm test` (integration, CDP), `npm run test:unit` (happy-dom, gitignored `test/unit/`).
- No comments anywhere. Changed lines in `src/` need 100% unit coverage.
- No React. Import Spectrum components one by one.
- Fixtures are invented; nothing real goes in, except SLICC's own sprinkles (`src/dummy/sprinkles/`).
- Integration tests run on slicc-shared-web's CDP harness through `test/integration/chrome.mjs`; the UI test page is `test/integration/page/ui/`.
