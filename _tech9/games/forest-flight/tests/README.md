# Verification

`npm test` runs deterministic flight/rules/input checks and renderer lifecycle contracts. `npm run lint` checks source and formatting. `npm run build` compiles the standalone package.

`SCENE_PORT=4492 npm run verify` serves the production build on a strict local port and flies both airplanes through a complete scenic circuit and runway landing using keyboard input. It also checks aircraft resource reuse, pause and focus reset, crash/retry, cameras, settings and disposal. A desktop session and Chromium must be available; `CHROMIUM_PATH` selects an existing compatible executable.

Reports, screenshots and actual browser/GPU/viewport/preset/frame timing are written under `.artifacts/verification/`. Test hooks require `?test=1`; the sole collision scenario supports rare-state recovery testing. Success paths never set airplane position or flight state.

`npm run verify:exploration` validates ordinary keyboard travel to remote east/west groves, low and high flight, F stabilization, full roll, inverted cockpit/pitch and Space recovery, plus stable GPU resource counts after warmup. `inspect(position,target)` is a camera-only art hook; it disposes the player controller and requires reload to return to play. It is never used by either success-path browser test.
