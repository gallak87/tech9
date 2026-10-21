# Coastal sprite-world architecture

One standalone Vite package owns the application, dependencies and artwork. Logical positions are foot anchors in 2D world units; Canvas2D composes scenery and PixiJS presents the resulting viewport texture. High-resolution source pixels do not change world dimensions or collision geometry.

## Composition and ownership

- `coast.js` supplies the authored 1800×1340 scene, spawn, roads, water polygons, scenery, grounded footprints and landmark notes. It has no renderer imports or framework-root dependency.
- `main.js` supplies HTML UI, start/pause/resume, note dialogs and error/retry handling. It creates one `sprite-world` instance and disposes it before returning to the start. Its generation token prevents stale asynchronous boots from replacing a newer world.
- `src/modules/sprite-world/` is an owned canonical-module snapshot. The module controls actor movement, camera, viewport transformation, bounded asset preparation, controls, sprite depth/occlusion and its rendering loop. It never mutates campaign or persistence state.
- `ground.js` supplies the example’s textured paths, shore and placement-derived ground shade; its deterministic surface treatment is replaceable.
- `style.css` owns presentation and usable stage/control rectangles. In portrait, the stage excludes the bottom thumb zone. The module observes the real mount rectangle; CSS controls remain sized in CSS pixels.

The application selects the module's coastal artwork/pattern preset and measured Kaida animation. `createSpriteWorld` receives scene/art/frame/actor data, budgets, viewport preferences and `onInteract`/`onState`/`onPause`/`onError` callbacks. Each instance owns its image cache, patterns, viewport surface, Pixi texture/application, listeners and frame loop. See the module guide for the full public API and asset-authoring records.

Props have separate visual frame bounds, draw depth at their foot anchor, grounded rectangular footprints and interaction radii. Gate pillars leave a passage. Walking, pointer movement and touch use the same swept collision predicate. Camera follow uses elapsed seconds. The default pointer route is direct; navigation around obstacles belongs to a future separately justified extension.

## Lifecycle and inspection

HTML reading and pause overlays stop movement through `setPaused`. Blur/visibility changes clear held input; the application presents explicit resume. **Return to start** disposes and recreates the instance, releasing images, surfaces, texture, controls and listeners. Persisted page suspension stops the loop while retaining owned resources/listeners for a paused return; ordinary page exit disposes them. Failure is visible with Retry; graphics context interruption requests recreation.

Read-only snapshots plus rare-state `teleport`/`dispose` setup are exposed under `window.__COAST_TEST__` only in Vite development with `?test=1`. Browser checks use real input for player actions; hooks inspect actual state and set up otherwise costly occlusion/disposal edge cases. Production includes no test API.

`tech9.runtime: web`, `tech9.renderer: pixi` and `tech9.modules: [sprite-world]` declare package compatibility. Fork receipts describe the source package; module provenance describes its canonical copies. Both are local records rather than runtime dependencies. After forking, give the game its own scene, title, rules and validation.
