# Alder Signal

A short first-person mission in the Alder Vale forest. Restore three survey relays, then return to the trailhead radio before the uplink window closes. This small game proves the forest scene as an independently owned building block. It is a playtest POC, with further changes driven by user feedback.

## Play locally

Use Node **22.13+ in the 22.x line or 24+**, then run from this directory:

```sh
npm ci
npm run dev
```

Open the printed local URL, normally [127.0.0.1:4420](http://127.0.0.1:4420). `npm run build` creates a portable relative-path build; `npm run preview` serves it on 4421. All runtime assets/fonts are local and audio is synthesized in the browser. After initial dependencies are installed, running and building need no external service.

## Field controls

- **WASD** walks, **Shift** jogs. Mouse looks around; pointer lock has a drag-to-look fallback.
- Hold **E** beside the current relay to restore it. After all three relays, return to the trailhead radio and hold **E** to upload.
- **Escape / P** pauses; resume and restart are available in the menu. Leaving the page also pauses.
- The HUD shows the next objective, route, distance, repair progress and remaining radio window. Restored equipment changes state.
- Audio starts after a user gesture. Use the mute control as desired.
- Five graphics controls cover render quality, sunlight, atmosphere, ground cover and exposure. Balanced is the initial game preset.

Desktop keyboard/mouse is required. Narrow screens show guidance; touch movement is not implemented. Movement follows the ground and uses approximate mature-tree/rock collision circles. Saplings, foliage and deadfall are not solid. There is no jump, inventory, combat, vehicle or streaming terrain.

## Validation and extension

```sh
npm test
npm run lint
npm run verify:game
```

Verification launches production preview and Chromium, uses real input for the full mission and state transitions, records errors/frame timing and closes its own server. Choose an unused port with `SCENE_PORT=4498`. See [tests/README.md](tests/README.md) for test hooks, captures and evidence limits. First playtest validation: **23 unit tests, lint, production build and 16 real-input browser checks passed**. The browser restored all three relays, returned and won, then verified pause, timeout and restart. No browser, asset or WebGL errors were recorded. At Balanced, 1600 × 1000 / DPR 1, Chromium 151 on Apple M1 Pro / ANGLE Metal sampled approximately **115 FPS** (p95 **9.4 ms**) over five seconds; these are observed browser intervals, not a hardware guarantee. Historical run evidence is available in the originating repository’s Git history. No review score is implied by the fork itself.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before adding a layer. This game has no runtime imports from `_tech9`; its copied runtime can change independently. `tech9.json` records the original source commit and hashes, and `GAME_PLAN.json` preserves the exact fork plan. Keep those provenance records intact; record later work in game/run docs. Package installation never changes repository hooks; run this package's own lint/tests before committing.

## Art and scope

The forest, Blender source and licenses came from the `forest-exploration` starter. Asset records remain in [public/assets/ASSETS.md](public/assets/ASSETS.md) and [public/assets/textures/SOURCES.md](public/assets/textures/SOURCES.md); local fonts retain their OFL license. `npm run assets:build` rebuilds the forest kit with Blender 5.1+ and Python/Pillow, as documented in the asset index. Relay equipment and sound are authored in local game code.

The inherited forest's old four-round AAA art gate ended at **6.2/10**, below its 8/10 target. That is historical source evidence, not a grade for this game. This handoff prioritizes a complete, verified loop for user playtesting. Broader art work, another game experiment and eventual root framework migration are separate later decisions; `_tech9` remains in place.
