# Stillwater Pond architecture

One Three.js renderer, one frame loop, metres with +Y up. Scene content, shared capabilities, camera control and the neutral UI are separate owners. The consumer tree is self-contained and never imports another framework/game directory at runtime.

- `src/core/SceneApp.js` owns renderer, camera, environment, frame timing, settings and disposable layer registry. Its sole controller runs before layers. The outdoor sun/sky renderer is inherited intentionally.
- `src/world/forestDefinition.js` is scene identity `stillwater-pond`, its 160 × 160 m bounds, three inspection poses, environment and world factory. The UI exposes only a restart pose; production movement is grounded.
- `src/world/pondDefinition.js` authors the shared shoreline instance and arrival-lane vegetation exclusion. Its immutable `BANK_ROCKS` tuples feed both visible stones and circle proxies.
- `src/world/terrain.js` supplies the original outer forest and calls `shoreline.terrainHeight`; it does not independently duplicate pond geometry. `ForestWorld.js` uses the same radius/exclusion functions for wet shore tint and all vegetation/debris placements. Its mature-tree/rock proxies call the copied placement helper with the actual placement transform.
- `src/capabilities/pond-water/src/shoreline.js` supplies validated immutable frame, normalized radius, shoreline points, surface tests, vegetation predicate and basin/bank profile. CPU and shader harmonic coefficients have one source.
- `src/capabilities/pond-water/src/PondWater.js` owns a disposable water layer only. `WaterSurface.js` is the local Three.js MIT derivative that owns its reflection target/material, quality cadence and renderer-state restoration on failed reflection. Pond shape and shader uniforms use the same shoreline frame.
- `src/world/PondWorld.js` owns scene-specific reeds, lily pads, flowers and bank/scattered stones. It batches by material and preserves source/derived geometry ownership. Texture requests that finish after a failed/disposed initialization are disposed rather than leaked. Water is registered separately.
- `src/capabilities/grounded-walking/src/WalkingController.js` owns all camera input/motion and only its canvas's pointer lock. `app.setController` replaces the starter's fly camera; no layer competes for the camera. `isWalkable` comes from the shared pond query, with footprint checks in the collision module.
- `src/capabilities/placement-collisions/src/placementCollisions.js` derives horizontal circles from authored placement matrices and resolves swept movement against bounds, circles and the footprint predicate. It does not inspect arbitrary meshes.
- `src/ui/PondExplorer.js` owns neutral start/explore/pause/reset state, DOM and five graphics controls. It gates controller enablement and does not define gameplay. World animation can continue while controls pause for tuning.
- `src/main.js` is composition only: replace controller, register forest, water, shore detail and exploration UI, expose observers only under `?test=1`, then start the app.

## Water/frame contract

The source frame is centre `(0,-6)`, radii `17 × 23 m`, level `-0.2 m`. Terrain reaches exactly water level at normalized radius 1. The walk predicate is outside 1.045; the player footprint is radius 0.3 m. Plant margins are wider (mature trees 1.24). The 160-point water mesh overlaps the terrain rim by 0.8% to prevent edge cracks. The single planar surface is offset 0.018 m above the authored water level.

Balanced / High / Ultra reflection targets are 1024 / 1536 / 2048 square pixels, updated every 3 / 2 / 2 water render callbacks. Unsupported quality falls back to Balanced. Screen pixel budgets remain the inherited SceneApp policy. `world` snapshot entry `pond-water` reports reflection size, stride and normalized quality. No isolated GPU-performance claim follows from these settings.

Water layer disposal releases its geometry, procedural normal texture, material and target exactly once. Lower-level `Water.dispose()` releases target/material only because it receives borrowed geometry/normal texture. Both paths tolerate partial initialization. Shore detail owns all loaded textures and merged/intermediate geometry buffers. Layers remove only their own objects, and the UI/controller abort their own listeners.

## Validation boundary

Unit tests prove shore CPU/shader agreement, terrain boundary, vegetation exclusion, shared bank-rock proxies and resource lifetimes. Browser tests use real movement to the shoreline and bank rock, right-drag orientation and visible state/graphics controls. Test hooks return snapshots and allow settings changes only; they cannot teleport, start, pause, finish or mutate scene rules. Normal URLs expose no hooks. Physical collision scope is approximate and deliberately documented; scenic quality and movement correctness are separate assessments.
