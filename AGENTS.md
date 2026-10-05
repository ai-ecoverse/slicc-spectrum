# slicc-spectrum

Web components for SLICC: `<slicc-terminal>` (wterm) and the app UI on Spectrum Web Components with dockview, against a typed model (`src/model/`) with a dummy (`src/dummy/`).

- `npm run lint`, `npm test` (integration, CDP), `npm run test:unit` (happy-dom, gitignored `test/unit/`).
- No comments anywhere. Changed lines in `src/` need 100% unit coverage.
- No React. Import Spectrum components one by one.
- Fixtures are invented; nothing real goes in.
- Don't refactor `test/integration/{chrome,cdp,server,global,artifacts}.mjs`; they move to slicc-shared-web.
