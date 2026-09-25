# Pinewatch checks

Run `npm test`, `npm run lint`, and `SCENE_PORT=4432 npm run verify` using supported Node. Verification builds production output, launches a task-owned Vite preview and Chromium, then closes both in a finally block. Native pointer-lock checks default to a headed foreground browser. On macOS the harness prefers installed desktop Chrome; `CHROMIUM_PATH` can choose a browser. Existing servers can be selected through `SCENE_URL`; those are never stopped by the harness.

The core playthrough uses real keyboard navigation, quiet approach, aim/draw/release, walking retrieval, E and retry. Other checks exercise real mouse misses, exhausted arrows, noisy approach/escape, held-input pause, pointer release and prop/log collision plus native keyboard menu traversal. A blur event simulates focus loss. Read-only test snapshots guide assertions and input direction; no hook changes the game or camera.

`.artifacts/verification` contains the report and transient intro, stalk, aim, retrieve, success, failure and narrow-screen captures. Compact review records and at most two representative screenshots per round are committed separately in `../../runs/pinewatch-hunt` after the implementation checkpoint is frozen. Browser/GPU/viewport/quality and requestAnimationFrame timing are recorded; these intervals are not isolated GPU timings or promises for other hardware.
