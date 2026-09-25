# Checking Alder Signal

Use supported Node (^22.13.0 or >=24). `npm test` covers the inherited terrain/settings/lifecycle contracts and the mission's game rules. `npm run lint` checks owned source and formatting. `npm run verify:game` builds a production bundle, launches a task-owned preview server and installed Chromium, plays the mission through actual keyboard/mouse input, then closes its browser/server. Set `SCENE_PORT=4498` to choose an unused test port. `SCENE_URL` explicitly opts into an existing server; do not reuse another person's changing build for evidence.

The game verification report and transient captures live in `.artifacts/game-verification`. Tests must cover a real start → three repairs → return → win route, plus pause/resume, timeout, restart, collisions, five settings, mute, narrow layout and ordinary production startup without test hooks. Only timeout's short remaining-clock setup may use a state hook; mission navigation and restoration use real input.

`?test=1` enables `window.__SCENE_TEST__` (readiness, renderer/camera/game snapshots and settings) and `window.__ALDER_TEST__` (game snapshot and rare-state timer setup). These APIs are absent from ordinary URLs. No test teleport or direct completion method is used to prove the playable loop.

`npm run capture -- --state=menu --out=.artifacts/menu.png` captures the initial screen. `--state=playing` clicks the normal start button before capture; `--quality=balanced`, `--width=1600`, `--height=1000`, `--mode=preview` are supported. Full mission/completion captures come from the browser playthrough. Install Chromium once with `npx playwright install chromium` if needed. `CHROMIUM_PATH` and `HEADED=1` select the browser/visible mode.

Reports identify browser executable/version, CPU/GPU, viewport, drawing buffer, settings and observed frame intervals. Those intervals include browser scheduling; they are not isolated GPU timings or hardware guarantees. Source is frozen for captures and committed before independent review. Chosen review evidence lives with the framework run; this game does not claim the inherited forest passed an AAA art gate.
