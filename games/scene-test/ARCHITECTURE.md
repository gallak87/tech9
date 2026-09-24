# Alder Vale — architecture contract

A fixed 160 × 160 metre forest study. Three.js owns rendering; Blender authors reusable mesh assets. One metre equals one world unit, +Y is up. Content is deterministic and bounded, not streamed or generated as the camera travels.

## Runtime boundaries

- `src/main.js` boots the app and displays load failures.
- `src/core/SceneApp.js` owns renderer, camera, frame loop, lighting, settings and the small lifecycle registry.
- A world layer provides `id`, `init(context)`, optional `update(dt, elapsed)`, `configure(settings)` and `dispose()`. Context supplies scene, camera, renderer, assets, events and world bounds. Future characters, interactions and HUD layers register through the same lifecycle. Avoid an ECS until requirements justify it.
- `src/core/AtmospherePass.js` owns a linear HDR scene target, half-resolution world-space shadow raymarch and final tone mapping/contact shading. It samples the scene depth and native directional comparison shadow texture; geometry remains sharply resolved.
- `src/core/FlyCamera.js` owns pointer-lock and keyboard input, speed and boundary enforcement. No character or physics is included.
- `src/world/ForestWorld.js` exports `createForestWorld()` returning a layer. Its init can be async. It owns terrain, trees, rocks and ground cover, never renderer or UI. Export `terrainHeight(x,z)` and `pathCenter(z)` from `src/world/terrain.js` for camera clearance and later grounded actors.
- `src/ui/DevPanel.js` owns exactly five high-level controls: quality, sunlight, atmosphere, richness and exposure. UI receives callbacks and metrics, never edits world internals.
- `src/core/settings.js` defines shared presets and validated persisted values.

## Asset contract

Blender output: `public/assets/forest-kit.glb` with named reusable prototypes `pine_a`, `pine_b`, `rock_a`, `rock_b`, `fallen_log` (groups allowed). Model origin at base, metres, +Y up after glTF export. Keep combined triangles under 100k; reusable prototype meshes are instanced at runtime. `art/build_forest.py` reproducibly writes `art/forest-kit.blend` and the GLB. Materials and textures carry source/license metadata in `public/assets/ASSETS.md`.

## Composition

A gently winding dirt trail starts near (0, 22), leading toward (4, -35). Camera starts near (0, terrainHeight + 2.5, 23), aimed toward (3, 3, -20). Tall irregular pines frame a warm, hazy backlit opening in the upper right. Mossy boulders, ferns, mixed grasses, shrubs, deadfall and leaf litter provide foreground detail. Boundary is softened by denser forest and terrain; flight stays within ±76 m. Atmospheric depth, credible scale and high-frequency PBR detail matter more than feature count.

## Settings contract

`{ quality: 'high' | 'balanced' | 'ultra', sunlight: 1, atmosphere: 1, richness: 1, exposure: 1 }`. Numeric artistic controls range 0.4–1.6. Quality controls pixel ratio, shadows and postprocessing cost; richness controls vegetation density. Layers respond via configure. Renderer updates static shadows only on relevant changes.

## Validation and checkpoints

Deliverable 1: integrated foundation, original Blender assets, first complete forest, controls and browser harness. Deliverable 2: art/performance polish and integration documentation. Each deliverable is committed before an independent AAA art critic examines actual browser captures. Critic JSON and at most two representative screenshots are committed separately. Each gate permits up to four independent rounds, stopping at 8/10 or the cap; scores are reported honestly.

Tests expose read-only snapshot and named-camera hooks through `window.__SCENE_TEST__` only with `?test=1`. Browser checks cover load, GL errors, tuning, flight, bounds, resizing and reference captures. Screenshot evidence is not a claim of equivalent real GPU FPS. No production benchmark promises without measured hardware results.
