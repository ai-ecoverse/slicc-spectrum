# slicc-spectrum

Web components for SLICC: `<slicc-terminal>` (wterm) and the app UI on Spectrum Web Components with dockview, against a typed model (`src/model/`) with a dummy (`src/dummy/`) and a slicc-kernel model for files and terminals (`src/kernel/`).

- `npm run lint`, `npm test` (integration, CDP).
- No comments anywhere. Every change in `src/` comes with committed tests for it, normally integration tests in `test/integration/`; a fix's test fails on the old code.
- No React. Import Spectrum components one by one.
- Fixtures are invented; nothing real goes in, except SLICC's own sprinkles (`src/dummy/sprinkles/`).
- Integration tests run on slicc-shared-web's CDP harness through `test/integration/chrome.mjs`; the UI test page is `test/integration/page/ui/`.
- Keep `data-id`, `data-action`, `data-surface` and `slot="status"` stable: embedders (slicc-bios) test on them, not on tag names.
