# Pinewatch Hunt architecture

This is an independently owned source fork of the registered forest-exploration starter. `tech9.json` and `GAME_PLAN.json` remain byte-for-byte provenance, including their original scaffold status. See the run execution record for delivery status.

- `src/main.js` composes the local forest renderer and the Hunt layer. The scene/storage identity is `pinewatch-hunt`; normal runs expose no test globals.
- `src/core/SceneApp.js` owns renderer, atmosphere, quality, frame loop and layer lifecycle. It updates one controller before the game layer. Forest source and textures remain game-local.
- `src/world/ForestWorld.js` owns deterministic forest placement, terrain and lighting-responsive vegetation. `terrain.js` is the ground query shared by actors and movement.
- `src/game/Walker.js` replaces the fly camera through `setController`. It owns pointer lock, keyboard/mouse input, grounded movement, quiet pace and circular collision resolution. Pausing disables it and clears held inputs.
- `src/game/rules.js` is the pure state machine: stalk, retrieve, won, lost; awareness/noise, arrow accounting, hit prerequisites and retrieval distance. `Hunt.js` owns runtime orchestration and UI modes (intro, playing, paused, result).
- `src/game/encounter.js` owns the authored route, spawn/deer placement, hoofprints, trail post and simple visibility query. Only opaque solid world meshes are raycast at shot time for obstruction; alpha-cutout foliage does not become an invisible arrow wall. Deadfall collision chains are derived from rendered log instance transforms.
- `src/game/models.js` owns procedural deer and bow geometry/materials, rig animation and resource disposal. `Hunt` owns their world/camera transforms. The down pose is non-graphic.
- The HUD is mounted in `context.ui`, with action-specific instruction and a journal presentation. It does not own a rendering loop.

One world unit is one metre, +Y up. Deer model faces local +X; player camera looks local -Z. Walking bounds are a subset of the forest. Forest trees/rocks expose immutable horizontal circles, extended with game props. They are approximate solids, not mesh-accurate physics.

`tests/game.test.js` tests rule/collision invariants. `tests/browser.mjs` uses real input through start/stalk/shot/retrieve/retry and failures. `__HUNT_TEST__.snapshot()` and the scene snapshot are read-only and only installed with `?test=1`. Browser focus-loss is injected as a blur event and pointer release uses the browser API; neither bypasses gameplay.

Do not promote the controller, animal or bow as a shared framework module from this pilot. Document possible reuse in the run's consumer notes after another actual consumer exists.
