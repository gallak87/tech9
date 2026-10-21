# Fishing validation

`npm test` runs pure fishing, world and runtime lifecycle contracts. `npm run lint` checks source and formatting. `npm run verify:game` builds, opens Chromium against a temporary preview server on 4442, and drives the full fishing loop with keyboard/mouse input. It closes only the browser/server it started.

Reports/screenshots are written to ignored `.artifacts/verification`. Use `CHROMIUM_PATH` for a local browser if Playwright's installation is unavailable. The launcher prefers full Chromium to retain Metal acceleration on macOS. The report records CPU/browser/GPU, viewport, preset, frame intervals and errors. Headless scheduling measurements are not isolated GPU measurements.

`?test=1` exposes `window.__SCENE_TEST__.ready`, `snapshot()` and `setSettings(patch)`. Snapshots are copies; test hooks cannot modify the fishing state, skip actions, teleport or award catches. Production URLs omit the global entirely.

The inherited `tests/browser.mjs` is historical fly-camera reference and is not part of active verification. `scripts/capture.mjs` captures the opening or bank view with real input.
