# Pond water

A copied-source capability for one irregular elliptical pond: a shared shoreline query, carved bank profile and disposable reflective surface. Promoted from Stillwater at the user's explicit request after its first use. This does not claim a second-game reuse proof or an art-gate pass.

Copy `src/` and `THREE-LICENSE.txt` into a consumer's `src/capabilities/pond-water/`. The consumer supplies Three.js **0.186.1**, its scene, renderer lifecycle and terrain. No runtime import returns to `_tech9`, no animation loop is started, and no global input or UI is installed. The runnable consumer is [`../../scenes/pond-test`](../../scenes/pond-test/README.md).

```js
import { createShoreline } from './capabilities/pond-water/src/shoreline.js';
import { createPondWaterLayer } from './capabilities/pond-water/src/PondWater.js';

const shore = createShoreline({
  x: 0,
  z: -6,
  radiusX: 17,
  radiusZ: 23,
  level: -0.2,
  excludeVegetation: (x, z) => Math.abs(x) < 2.8 && z > 15 && z < 31,
});
const groundHeight = (x, z) => shore.terrainHeight(x, z, outerForestHeight);
// Apply these same queries in the consumer's placement and walking code:
// shore.vegetationAllowed(x, z, 1.24), shore.isWalkable(x, z)
await app.register(createPondWaterLayer({ shoreline: shore }));
```

## Shore contract

Metres, +Y up. `createShoreline` validates finite centre/level and positive radii and returns a frozen definition and closure-based queries. Defaults reproduce Stillwater's centre `(0,-6)`, radii `17 × 23 m`, water level `-0.2 m`.

- `point(angle, radialScale=1)` returns `[x,z]` on a ring; `radius(x,z)` returns normalized distance from the irregular shoreline.
- `isWater` uses radius `<0.96`; `isWalkable` uses `>1.045`. The walking controller must also test its footprint, not only its centre.
- `vegetationAllowed(x,z,margin=1.13)` applies both the shore margin and caller's optional `excludeVegetation` predicate. Mature trees in the example use `1.24`. These are placement filters, not plant physics.
- `terrainHeight(x,z,outerHeight)` creates a basin 1.3 m deep, meets the water level at radius 1, lifts a 0.9 m bank and blends into `outerHeight(x,z)` beyond radius 1.27–1.72. `outerHeight` is a function supplied by the scene.

The harmonic shape is deliberately fixed. `SHORE_HARMONICS` supplies both the CPU shape and generated `SHORE_GLSL`; water receives the same centre/radii as uniforms. Changing the factory frame updates geometry, terrain and shader together. Moving or resizing a pond does **not** relocate authored rocks, vegetation pockets or arrival lanes in a consumer: those remain scene composition and must be checked. Arbitrary splines, islands, multiple intersecting ponds and runtime shoreline mutation are outside this contract.

## Surface lifecycle and quality

`createPondWaterLayer({id='pond-water', shoreline, quality='balanced', segments=160, waterColor='#31564c', distortionScale=0.24})` provides `init(context)`, `configure(settings)`, `update(dt)`, `dispose()` and read-only-by-convention `stats`. `segments` accepts integers 24–1024. `context.scene` is required; optional `context.definition.environment.sun` supplies sun direction/colour. The consumer renderer must support Three.js WebGL rendering, not WebGPU.

Balanced / High / Ultra allocate **1024 / 1536 / 2048** square half-float reflection targets and refresh every **3 / 2 / 2** render callbacks. An unknown or absent quality falls back to Balanced. `stats` reports `quality`, `reflectionSize`, `reflectionStride`, `authoredShore`. The application owns shared screen resolution and all non-water quality policy. Target changes reset cadence so the next callback populates the reflection. These are cost controls, not measured performance promises.

The layer owns/disposes its geometry, generated normal texture, water material and reflection target. Disposal is idempotent and safe before/after partial initialization; a disposed layer cannot be reinitialized. `Water` from `WaterSurface.js` is a lower-level MIT derivative: `setQuality` controls its target and `dispose()` releases only **material and target**; callers retain geometry and supplied normal textures. The reflection callback restores the renderer target, XR flag, shadow-update flag and mesh visibility in `finally`, including when rendering throws. It does not replace the renderer or frame loop.

This is planar reflection with procedural normal distortion, shallow-edge tint and existing scene fog/shadows. It has no depth-aware refraction, underwater view, buoyancy, wave simulation, interactive ripples or gameplay rules. Reflection cadence can visibly lag moving objects. Static forest shadows and broad collision proxies are consumer limitations.

## Provenance and validation

The original implementation came from `_tech9/games/stillwater-fishing/src/world/{pondDefinition,PondWorld,WaterSurface}.js`. The water shader derives from Three.js **0.186.1** `examples/jsm/objects/Water.js` under MIT; its full notice is in [`THREE-LICENSE.txt`](./THREE-LICENSE.txt). Procedural normal/shore code was authored locally. This module contains no downloaded media.

The example also preserves editable forest/Blender assets and Poly Haven CC0 shore-rock textures. Their attribution is indexed by [`pond-test/public/assets/POND_SOURCES.md`](../../scenes/pond-test/public/assets/POND_SOURCES.md). They are scene assets, not a dependency hidden inside this water module.

Run the scene's CPU tests for CPU/shader frame agreement, terrain/exclusion, shared rock proxies, reflection quality fallback, renderer recovery, idempotent disposal and failed/late asset cleanup. Its browser test uses real movement to reach the shoreline and a bank rock, pauses/resets and changes graphics settings. The parent integration records actual browser runs; writing this module does not imply a fresh visual score.
