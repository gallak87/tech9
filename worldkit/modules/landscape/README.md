# Landscape

Forest assets, terrain materials, deterministic terrain/vegetation queries and camera-following detail. Consume through `@worldkit/environment/landscape`; runtime assets are bundled with the package. Requires Three.js r186/WebGL2, metres and +Y up. Runtime GLB/textures and editable Blender/Python/image sources retain their provenance/licenses in [ASSETS.md](./assets/runtime/ASSETS.md). The caller owns renderer, camera, lighting, frame loop and game rules.

```js
import {
  createLandscape,
  followLandscapeSun,
} from '@worldkit/environment/landscape';
import { createWeather } from '@worldkit/environment/weather';
const landscape = createLandscape({ windMode: 'weather', manageFog: false });
await landscape.init({ scene, camera, renderer });
const weather = createWeather({
  targets: landscape.getWeatherTargets(),
  sampleSurface: landscape.sampleSurface,
  surfaceBounds: landscape.surfaceBounds,
  fieldResolution: 256,
  settings: { wind: 0.2, muted: true },
});
weather.init({ scene, camera });
function update(dt, elapsed) {
  landscape.update(dt, elapsed);
  weather.update(dt);
  followLandscapeSun(sun, camera.position, landscape.groundHeight);
  renderer.shadowMap.needsUpdate = true;
  // Apply weather.condition to application-owned sun/sky/fog, then render once.
}
// aircraft: pass groundHeight: landscape.groundHeight and obstacle: landscape.obstacle.
// Teardown: weather.dispose(); landscape.dispose(); then dispose your renderer/lights.
```

Without weather, omit that sibling module and use the default `windMode: 'local'`. With weather, select `windMode: 'weather'` before init: the local oscillator is disabled, and weather supplies the single shared wind field for both near and mid-distance grass/ferns. Default `manageFog: true` adjusts an existing FogExp2 according to camera height above terrain; set false when your environment adapter owns fog. Landscape never creates lights or precipitation. The optional exported `AtmospherePass` is a terrain-relative postprocess: call `resize(width,height,pixelRatio)`, `configure({samples:4,rays:32},{atmosphere:1,sunlight:1})`, then `render(scene,camera,sun,localGroundHeight)` instead of your direct render. It requires a PCF directional shadow map and writes the final image to the screen. Dispose it separately.

## Authored scenes

`createComposedLandscape` uses the same forest assets, material preparation, scanned floor and shadow helpers for fixed authored scenes. Baseline uses this entry point to preserve its detailed 160 m forest; its terrain, placements, collision proxies and weather surface queries remain scene-owned. Use `createLandscape` above for larger worlds with moving detail and distance transitions. Both rendering policies share the asset and material helpers.

```js
import * as THREE from 'three';
import { createComposedLandscape } from '@worldkit/environment/landscape';
const groundHeight = (x, z) => Math.sin(x * 0.03) * Math.cos(z * 0.04);
const forest = createComposedLandscape({
  terrain: {
    bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
    segments: 256,
    groundHeight,
    pathMask: (x) => Math.max(0, 1 - Math.abs(x) / 2),
    tint: () => [0.87, 0.89, 0.83], // Linear RGB vertex tint.
  },
  placements: [
    {
      prototype: 'pine_a',
      shadow: true,
      entries: [
        {
          x: -7,
          z: 12,
          matrix: new THREE.Matrix4().makeTranslation(
            -7,
            groundHeight(-7, 12),
            12,
          ),
        },
      ],
    },
  ],
});
await forest.init({ scene, renderer });
forest.configure({ quality: 'high', richness: 1 });
// Optionally pass forest.getWeatherTargets() to weather with scene-owned surface queries.
// Render through your existing loop; this fixed layer needs no update call.
// Dispose weather first, then forest.dispose().
```

Terrain bounds must be finite and nonempty; `segments` is an integer from 1–1024 (default 256) per axis. Supply finite `groundHeight`, `pathMask` (clamped 0–1) and three-component linear RGB `tint` values. Detail is baked once: use a resolution appropriate for your terrain, and retain the same height callback for controllers/collision. The caller owns travel limits and scene lighting.

Each placement supplies a named kit `prototype` and `entries` with finite `x`, `z` and a Three.js `Matrix4`. Optional per-entry `color` is a Three.js `Color` when the placement enables `color: true`. Prototypes include `pine_a/b/c`, `pine_sapling`, `rock_a/b`, `fallen_log`, `grass_short`, `grass_short_lod`, `grass_tall`, `grass_tiny`, `fern_a/b`, plus generated `trail_pebble` and `fallen_twig`. `shadow` enables casting; all batches receive shadows. `chunkSize` defaults to 40 m (positive finite value). Each chunk has fixed capacity from its entries; `density: true` lets quality/richness adjust its visible count. Put entries marked `reserve: true` after ordinary entries, so increasing density reveals them last. Balanced/high/ultra density factors are 0.66/1/1.08, multiplied by richness (0–1.6, default 1), capped by capacity. Zero richness hides density batches; substantial authored objects stay intact. There is no streaming cache or per-frame allocation; the supplied scene size bounds resource use.

`id` defaults to `landscape`; `assetURL` follows the directory contract below. The layer owns loaded assets, cloned geometry/materials and floor textures. Optionally supply a borrowed kit as `init({scene,renderer,assets:{forestKit: gltf.scene}})` (a Map also works); its original geometry/materials/textures are retained on disposal. One activation per layer, including after cancellation/failure; create a fresh layer to retry. The composed renderer uses weather's shared wind only and does not create a local oscillator. Weather, environment and frame-loop ownership are unchanged.

## Defaults and configuration

`createLandscape({layout,assetURL,quality,windMode,manageFog})` starts with a 4.8×4.8 km playable area, a continuous rolling valley, three pine forms, irregular groves and a meandering trail. The canopy extends 400 m and terrain 800 m beyond each playable edge. `surfaceBounds` includes this terrain skirt so weather also reaches the visible horizon. Exports `DEFAULT_BOUNDS`, `DEFAULT_TRAIL`, `defaultGroundHeight`, `defaultForestCover` and `createLandscapeLayout` allow query-only use before loading assets. Layout options:

- `bounds: {minX,maxX,minZ,maxZ}`: finite, 64–4800 m per axis; translated/rectangular regions work. Bounds inform consumers; the caller enforces travel limits.
- `seed`: unsigned 32-bit integer, default 81733; deterministic trees and detail independent of visitation order.
- `groundHeight(x,z)`: finite height over terrain plus margin. Mesh vertices sample it about every 10 m; avoid cliffs or features finer than this resolution.
- `forestCover(x,z)`: finite density clamped to 0–1; drives both tree placement and the terrain cover field. Use this to clear authored areas.
- `trail: false` disables the trail, or supply finite `offset`, `amplitude`, `frequency`, `detailAmplitude`, `detailFrequency` to override the sinusoidal defaults.
- `excludeDetail(x,z)` excludes small props/vegetation, and `mown(x,z)` trims grass. Airport/road placement and flattening belong to the consumer; use matching ground, cover and exclusion callbacks.

Default static asset URLs are bundler-visible and work when the module is copied. `assetURL` optionally replaces their directory (absolute URL or module-relative URL, ending in `/`) with equivalent `forest-kit.glb` and `textures/` files. `LANDSCAPE_ASSETS` exposes default resolved URLs. Configure quality before or after init with `configure({quality:'balanced'|'high'|'ultra'})`; balanced halves grass density, while high/ultra retain full density. Other quality choices, lighting and resolution remain application-owned. `init` is one activation; dispose even after failure. Late asset loads are released after an in-flight disposal; a new layer is required to retry.

## Bounds, transitions and ownership

The layer uses one finite terrain mesh, static tree placements and two fixed 3072×2304 atlases (color plus upward-facing snow coverage for seasonal impostors). Actual trees fade to cards over 180–220 m; 16 azimuth/4 elevation views retain silhouettes from above. Fine grass transitions over 16–28 m to cheaper Lambert grass, which recedes over 70–96 m. Other detail fades over 32–66 m. A fixed 7×7 window of 32 m tiles rewrites preallocated buffers as the camera moves. No travel-time textures, geometries or unbounded tile cache are created. High altitude empties near pools. `stats` returns current tree/detail counts, pool capacity and rebuild count. Total static tree count scales with chosen bounds/density; detail capacity is fixed (plus static trees) and deliberately capped.

`groundHeight` is analytic; terrain triangles approximate it. `obstacle(x,y,z,radius)` uses conservative tree trunk/crown proxies and returns null or a cloneable tree descriptor; it does not model small rocks/logs, wing shape or triangle collisions. `sampleSurface(x,z)` returns terrain height/normal, approximate canopy throughfall/cover plane, trail snow retention and puddle suitability, or null beyond the terrain. Weather's sampled field is coarse over kilometres; neither query models stacked surfaces or individual branches.

Weather **1.1.0** composes the terrain/fade/shadow hooks, applies shared wind to Lambert/PBR plants, and uses the fixed snow-mask atlas for snow on upright distant pine cards. Cards retain baked daylight lighting and approximate close-up snow coverage; their illumination does not track changing sun direction. Snow depth is disabled for vegetation/cards to preserve their static shadows; ground uses weather's thin lift. Dispose weather before landscape so its hooks restore before materials/textures are released. Loaded assets, generated atlases, fixed instance pools, ground maps and geometry are landscape-owned; caller resources are retained.

## Running example

From `_tech9`, run `./run exec -- vite --host 127.0.0.1 --strictPort --port 4500`, then open `/modules/landscape/examples/`. Ground/low/high buttons and Next region jump to representative views; drag to look, WASD move, Q/E change altitude, Shift accelerates travel. Clear/rain/winter buttons exercise material/shared-wind integration. The example supplies baseline lighting, moving 270 m shadows, 4× MSAA and terrain-relative atmosphere. `?test=1` exposes observations and relocation for focused checks. The [aircraft example](../aircraft/examples/) demonstrates both capabilities together without an airport or game rules.
