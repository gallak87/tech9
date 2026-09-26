# Tech9 Baseline — architecture contract

A fixed 160 × 160 metre forest study. Three.js owns rendering; Blender authors reusable mesh assets. One metre equals one world unit, +Y is up. Content is deterministic and bounded, authored at initialization.

## Runtime boundaries

- `src/main.js` chooses a scene definition, boots the app and displays load failures. The core never imports forest content.
- `src/world/forestDefinition.js` owns scene identity, presentation, rectangular bounds, terrain query, named camera views, environment defaults and world factory. `src/core/sceneDefinition.js` validates that contract before GPU allocation.
- `src/core/SceneApp.js` owns renderer, camera, frame loop, lighting, settings and the small lifecycle registry.
- A world layer provides `id`, `init(context)`, optional `update(dt, elapsed)`, `configure(settings)` and `dispose()`. Context supplies scene, camera, renderer, assets, events, an independent `ui` mount, world bounds, `groundHeight(x,z)` and the selected `definition`. Future characters, interactions and HUD layers register through the same lifecycle.
- `src/core/AtmospherePass.js` owns a linear HDR scene target, half-resolution world-space shadow raymarch and final tone mapping/contact shading. It samples the scene depth and native directional comparison shadow texture; geometry remains sharply resolved.
- `src/core/softShadows.js` wraps the forest materials with a deterministic 12-tap PCF filter while preserving their terrain and wind shader hooks. It targets the pinned Three.js release; validate captures when upgrading Three.js.
- `src/core/FlyCamera.js` owns pointer-lock and keyboard input, speed and boundary enforcement using the injected bounds/ground query. `app.setController(factoryOrObject)` replaces and disposes the previous camera owner. No character or physics is included.
- `src/world/ForestWorld.js` exports `createForestWorld()` returning a layer. Its init can be async. It owns terrain, trees, rocks and ground cover, never renderer or UI. Export `terrainHeight(x,z)` and `pathCenter(z)` from `src/world/terrain.js` for camera clearance and later grounded actors.
- `src/ui/DevPanel.js` owns exactly five high-level controls: quality, sunlight, atmosphere, richness and exposure. UI reads scene presentation and view metadata, receives callbacks and metrics, and never edits world internals.
- `src/core/settings.js` defines shared presets and validated persisted values. Storage defaults to `${definition.id}.settings`; the app accepts an explicit `storageKey` for independently owned game forks.

## Scene and camera integration

The application requires a definition explicitly; the forest is selected only in the entry point:

```js
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';

const definition = forestDefinition;
const app = new SceneApp(canvas, { definition, ui: hudMount });
await app.register(definition.createWorld());
app.start();
```

A definition provides `id`, `title`, `bounds`, `groundHeight(x,z)`, `views`, `initialView`, `environment`, `createWorld()` and optional `presentation`/`getColliders()`. Bounds use finite `minX`, `maxX`, `minZ`, `maxZ`, `minY`, `maxY`; views provide `position` and `target` arrays plus an optional `label` and `hidden` flag. The forest's hidden boundary view supports real input testing. Environment defaults cover exposure, fog, hemisphere light, directional sun/shadow bounds, and physical sky parameters. Copy the small forest definition as a concrete reference when authoring another scene; do not move forest terrain queries into core. The current environment renderer assumes an outdoor sun/sky scene. Games can supply their own rendering implementation.

The definition is selected at boot from local source. A fork owns its copied runtime and can extend scene loading and composition.

Exactly one controller owns the camera each frame:

```js
app.setController(
  ({ camera, canvas, bounds, groundHeight, events, definition }) =>
    new WalkingController({
      camera,
      canvas,
      bounds,
      groundHeight,
      events,
      definition,
    }),
);
```

A controller requires synchronous `update(dt)` and `dispose()` methods. `resetMotion()` and `lock()` are optional hooks used by scene viewpoints and the development UI. The factory must return synchronously; it receives no renderer and must not start another animation loop. Constructing/validating a replacement succeeds before the previous owner is disposed. A failed factory leaves the current controller active. Replacing it with the same instance is a no-op. `app.controls` always references the active owner; shutdown disposes it. Controllers own and release their listeners and pointer lock. The application updates the controller before world/game layers. Update `presentation.controls` and `lockedControls` when replacing fly movement so UI stays truthful.

`forestDefinition.getColliders()` (also available on the forest layer) returns immutable deterministic descriptors `{id, kind, x, z, radius}` derived from rendered mature-tree, rock and fallen-log placements. The grounded controller resolves these conservative horizontal proxies. They exclude saplings, small foliage, terrain slopes and exact mesh surfaces. A game defines its player radius, movement resolution and additional proxies. The fly camera ignores these circles. Descriptors are available before asset loading.

## Independent game forks

Copy this baseline through the framework's fork workflow, then develop the standalone package in `games/<slug>`. Preserve its source receipt, assets and license records. Give it a scene ID, storage namespace, presentation and game tests. Register gameplay through the layer lifecycle and `context.ui`, use narrow events for game/HUD communication, and replace camera control through `setController`.

## Asset contract

Blender output: `public/assets/forest-kit.glb` with named reusable prototypes `pine_a`, `pine_b`, `pine_c`, `pine_sapling`, `rock_a`, `rock_b`, `fallen_log`, plus low-cost grass and fern prototypes (groups allowed). Model origin at base, metres, +Y up after glTF export. Keep combined triangles under 100k; reusable prototype meshes are instanced at runtime. `art/build_forest.py` reproducibly writes `art/forest-kit.blend` and the GLB. Materials and textures carry source/license metadata in `public/assets/ASSETS.md`.

## Composition

A gently winding dirt trail starts near (0, 22), leading toward (4, -35). Camera starts near (0, terrainHeight + 2.25, 23), aimed toward (3, 3, -20). Tall irregular pines frame a warm, hazy backlit opening in the upper right. Mossy boulders, ferns, mixed grasses, shrubs, deadfall and leaf litter provide foreground detail. Boundary is softened by denser forest and terrain; flight stays within ±76 m. Atmospheric depth, credible scale and high-frequency PBR detail matter more than feature count.

## Settings contract

`{ quality: 'high' | 'balanced' | 'ultra', sunlight: 1, atmosphere: 1, richness: 1, exposure: 1 }`. Numeric artistic controls range 0.4–1.6. Quality controls pixel ratio, shadows and postprocessing cost; richness controls vegetation density. Layers respond via configure. Renderer updates static shadows only on relevant changes. Pixel budgets cap large displays at 1.6 / 2.6 / 5.2 million scene pixels for Balanced / High / Ultra. Layer IDs are reserved across asynchronous initialization; failed or cancelled loads release owned resources. The `ui` mount remains separate from the development overlay so gameplay HUD layers can mount and dispose independently.

## Validation

Tests expose read-only snapshot and named-camera hooks through `window.__SCENE_TEST__` only with `?test=1`. Browser checks cover load, GL errors, tuning, flight, bounds, resizing and reference captures. CPU tests additionally validate alternate scene ground/bounds/view data, controller ownership, scene context, storage isolation and deterministic collision descriptors. Screenshot evidence is not a claim of equivalent real GPU FPS. No production benchmark promises without measured hardware results.

## Module copies

`package.json` → `tech9.modules` selects grounded-walking and placement-collisions. Their source and license records are copied under `src/modules/<id>`, with versions and hashes in `PROVENANCE.json`. The runtime imports those local copies. Use the framework's module sync to update them from canonical source.

`getForestPlacements()` exports immutable matrices used by both rendering and proxy generation. `placementCircle` accounts for scale and local centre; `placementCapsuleChain` covers full deadfall endpoints. `getForestColliders()` includes all substantial authored forest solids with documented approximations.

With `?controller=walk`, the entrypoint owns start/pause/tuning UI and installs the neutral WalkingController through `app.setController`. The controller owns input, grounded movement, owned pointer lock, held-state clearing and cleanup; it does not own game rules or menus. Read-only walking observations are appended to the scene snapshot only under `?test=1`. The default fly path remains available for authored views and visual inspection.

## Weather integration

`ForestWorld.getWeatherTargets()` exposes owned material participants with explicit ground/foliage response metadata. `weatherSurface.js` derives cover and receiving-surface proxies from the same forest placements. `ForestWeather.js` is the only adapter that applies weather condition state to application-owned sky, fog, sunlight, hemisphere and atmosphere. It mounts its own controls in `context.ui`. The reusable module owns only weather resources and composed/restorable material hooks, using the existing layer frame loop. Its local source copy is selected by `tech9.modules` and tracked in module provenance. `main.js` adds the thin snow-depth allowance to the injected ground query for both controllers. Test-only weather snapshots, settings setup and lifecycle cycling are behind `?test=1`.
