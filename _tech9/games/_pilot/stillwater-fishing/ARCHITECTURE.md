# Stillwater architecture

An owned copy of the registered forest starter. There are no runtime imports from the framework or another game. One Three.js renderer, one animation loop, metres with +Y up.

## Boundaries

- `src/core/SceneApp.js` retains renderer, camera, lighting, settings and disposable layer lifecycle. Its controller updates before layers; layers render through the existing scene.
- `src/world/pondDefinition.js` authors one irregular elliptical pond: centre (0, -6), radii 17 × 23 m, water level -0.2 m. `shoreShape` describes the rim and `pondRadius` is the common query for basin, vegetation, walking and casts.
- `src/world/terrain.js` carves a basin 1.3 m deep, meets the water level at the rim, lifts a dry bank and blends into the original forest. The 384-grid terrain uses the starter's scanned floor/path materials; wet shore tint is part of the terrain material.
- `src/world/ForestWorld.js` excludes all plant/debris batches inside the shoreline margin and clears the arrival lane. Mature trees and collision descriptors share placement filters. Large authored bank rocks are exported from `BANK_ROCKS`; their meshes and conservative walking proxies derive from the same immutable tuples. Ground cover begins outside the shore; trees have extra root clearance.
- `src/world/PondWorld.js` owns water, procedural normal texture, low-cost batched reeds, lily pads and stones. `WaterSurface.js` is a game-local MIT derivative of the installed Three.js Water, adding access to its owned reflection target so quality and cleanup can be explicit.
- `src/game/WalkingController.js` alone owns the camera and movement listeners. Grounded eye height 1.68 m, circle collision proxies, shoreline footprint and bounded map. Right-drag, pointer lock and keyboard aim are supported. Focus loss and lock exit notify the game to pause.
- `src/game/FishingRules.js` is a pure deterministic state machine, driven only by `tick(dt,{reeling})`, cast validity and action. It owns power, bounded bite timing, hook window, pull cycle, tension, progress, failure and catch data. Pause stops simulation time.
- `src/game/FishingGame.js` owns UI, input routing, cast solution, pause/restart and rule-to-presentation integration. Walking is disabled during an active line. It supplies observational snapshots to the test harness only in test mode.
- `src/game/Tackle.js` owns rod/reel, line, float, ripple rings and a procedurally modelled brook trout, a landing net and a load-bending rod. It animates in the same layer update and never starts another loop.

## Pond authoring and costs

Change the shared definition first; terrain, cast validity and walking boundaries follow it. Adjust `PondWorld` reed/lily pockets by shoreline angle and radius, then verify dry ground and vegetation exclusion from both banks. Mature-tree clearance is wider than grass clearance. The water mesh is an irregular 160-point shape, not an unbounded plane over the original terrain. Its edge overlaps the carved rim slightly to avoid subpixel cracks.

Balanced / High / Ultra use 1024 / 1536 / 2048 square reflection targets, refreshed once per 3 / 2 / 2 rendered frames. Reflection is a render pass inside the existing renderer, not another animation loop. Balanced uses at most 1.6 million scene pixels; the UI remains native resolution. The water normal field is periodic and generated locally at startup. No simulation, fluid solver or offscreen worker is used.

The reflection target, material, mesh and normal texture are disposed on layer unregister. Static bank geometry is merged by material; the layer tracks all source, baked, flattened and merged buffers for disposal. The tackle tracks its geometries/materials; the game removes marker and HUD; input listeners use AbortController. The controller removes its listeners and releases its pointer lock on disposal. Forest source ownership stays with its original lifecycle contract.

## States and inputs

Opening screen → ready → charging → casting → waiting → bite → fight → landed → release → ready. Invalid casting, missing the hook, over-reeling or inactivity enters a recoverable failure. Pause is orthogonal and freezes all fishing timers; restart clears catches, returns the camera to the arrival position and resets held inputs.

Cast direction uses horizontal camera aim. Power selects 4–27 m of distance; steep down-aim lands near the feet. A local water query validates the result. A float arcs for one second, settles, then visibly dives during the hook window. Tension responds to actual held input, not a completion timer. The trout becomes visible near landing and is presented beside its catch card.

## Tests

Pure tests cover fishing state transitions, deterministic recovery, time-step variation, rendering lifecycle, terrain/shore agreement and collision contracts. `tests/game-browser.mjs` drives real keyboard/mouse input through the integrated game. It does not set game state to win. `tests/browser.mjs` retains historical starter flight tests as reference; it is not an active fishing suite.

Production exposes no test globals. `?test=1` exposes ready/snapshot and quality-setting observations; camera positioning and success mutation hooks are absent. Exact browser, GPU, viewport, settings and timing live with each captured report. An observed frame interval is not an isolated GPU measurement or a guarantee on another device.
