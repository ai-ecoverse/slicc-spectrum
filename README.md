# slicc-spectrum

Web components for SLICC. The first one is `<slicc-terminal>`, a terminal built on [wterm](https://github.com/vercel-labs/wterm) that talks to [`@ai-ecoverse/slicc-kernel`](https://github.com/ai-ecoverse/slicc-kernel) through a small backend interface (`src/backend.ts`): bytes in, bytes out, resize and signals.

## Development

```sh
npm install
npm run lint
npm test
```

`npm test` runs the integration tests in headless Chromium over raw CDP. It writes V8 coverage to `coverage/` and CPU profiles, screenshots and console logs to `artifacts/`. The test page is served cross-origin isolated (COOP/COEP), as slicc-kernel requires.

Unit tests live in `test/unit/`, which is gitignored. The pre-commit hook runs them under monocart and fails the commit unless the staged lines in `src/` are fully covered (`diff-cover --fail-under 100`).

## License

Apache-2.0
