# Verification

`npm test` runs deterministic flight/rules/input checks and renderer lifecycle contracts. `npm run lint` checks source and formatting. `npm run build` compiles the standalone package.

`SCENE_PORT=4492 npm run verify` serves the production build on a strict local port and flies both airplanes through a complete scenic circuit and runway landing using keyboard input. It also checks aircraft resource reuse, pause and focus reset, crash/retry, cameras, settings and disposal. Chromium must be installed; `CHROMIUM_PATH` selects an existing compatible executable.

Reports, screenshots and actual browser/GPU/viewport/preset/frame timing are written under `.artifacts/verification/`. Test hooks require `?test=1`; the sole collision scenario supports rare-state recovery testing. Success paths never set airplane position or flight state.
