# Verification

`npm test` runs deterministic flight/rules/input checks and renderer lifecycle contracts. `npm run lint` checks source and formatting. `npm run build` compiles the standalone package.

`SCENE_PORT=4492 npm run verify` serves the production build on a strict local port and flies both airplanes through a complete scenic circuit and runway landing using keyboard input. It also checks aircraft resource reuse, pause and focus reset, crash/retry, cameras, settings and disposal. A desktop session and Chromium must be available; `CHROMIUM_PATH` selects an existing compatible executable.

Reports, screenshots and actual browser/GPU/viewport/preset/frame timing are written under `.artifacts/verification/`. Test hooks require `?test=1`; the sole collision scenario supports rare-state recovery testing. Success paths never set airplane position or flight state.

`npm run verify:exploration` validates ordinary keyboard travel to remote east/west groves, low and high flight, F stabilization, full roll, inverted cockpit/pitch and Space recovery, plus stable GPU resource counts after warmup. `inspect(position,target)` is a camera-only art hook; it disposes the player controller and requires reload to return to play. It is never used by either success-path browser test.

Browser flights default to 8× simulation speed and return to 1× for capture/performance and aerobatic observations; inputs still pass through real keyboard events. `SIMULATION_RATE=1` opts into real-time travel. `VERIFY_AIRCRAFT=sport npm run verify` selects a single aircraft. Fixed camera inspection avoids re-flying routes for art reviews.

`npm run verify:art -- --output=.artifacts/art-refinement/latest` builds and captures fixed ground, low-flight and high-altitude views at 1440×900 High, followed by a short 90 m camera sweep and three passes through six dispersed positions. It checks browser/WebGL errors and flat renderer counts across the warmed final pass. This takes seconds of local travel instead of another circuit. Each report includes the committed revision and hardware/frame timing. The 1× camera sweep uses discrete 3 m steps with at least 100 ms spacing; screenshots add pauses, so its three stills show coverage but cannot establish continuous motion quality. The final round’s settled art sweep counted 193 geometries, 35 textures and 28 programs; it does not force every game/aircraft resource to become visible.
