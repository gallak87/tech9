# Pond water

Reflective planar water, coupled shoreline queries and optional shore decoration. Consume through `@worldkit/environment/water`; required assets and licenses are packaged. Use Three.js `0.186.1` with WebGLRenderer.

```js
import { createShoreline } from '@worldkit/environment/water';
import { createPondWaterLayer } from '@worldkit/environment/water';
import { createPondShoreLayer } from '@worldkit/environment/water';

const shoreline = createShoreline({
  x: 0,
  z: 0,
  radiusX: 17,
  radiusZ: 23,
  level: 0,
});
const groundHeight = (x, z) =>
  shoreline.terrainHeight(x, z, outerTerrainHeight);
// Use groundHeight for terrain vertices and the walking controller.
// Filter vegetation with shoreline.vegetationAllowed(x, z).
// Pass shoreline.isWalkable as the walking controller's isWalkable option.
const water = createPondWaterLayer({ shoreline, quality: 'balanced' });
water.init({ scene });
const shore = createPondShoreLayer({ shoreline, terrainHeight: groundHeight });
await shore.init({ scene, renderer });
// In the owning frame loop:
water.update(dt);
// After camera teleport or switching:
water.invalidateReflection();
// On teardown, including failed initialization:
shore.dispose();
water.dispose();
```

`createShoreline` provides immutable `definition`, `point(angle, scale=1)`, normalized `radius(x,z)`, `terrainHeight(x,z,outerHeight)`, `isWater`, `isWalkable` and `vegetationAllowed(x,z,margin=1.13)`. Optional `excludeVegetation(x,z)` reserves paths or authored clearings. CPU queries and the water shader share the same irregular ellipse.

Water accepts `id`, `shoreline`, `quality`, `segments=160` (24–1024), `waterColor='#31564c'` and `distortionScale=0.24`. Optional `definition.environment.sun` in the initialization context supplies light direction/color. `configure({quality})` selects balanced (1024 px/every 3 frames), high (1536/every 2) or ultra (2048/every 2); unknown values use balanced. Geometry, procedural normals, material and reflection target belong to the layer. Reflections are throttled planar approximations.

`createPondShoreLayer` places batched reeds, cattails, lily pads, flowers and rocks around the same shoreline. Options: `shoreline`, `terrainHeight`, `seed=73311`, `bankRocks=[]` and `textureUrls={diff,nor_gl,rough}`. Bank-rock tuples are `[x,z,scaleX,scaleY,scaleZ,yaw]`; use those same placements when adding collision proxies. Default textures resolve relative to this module and include their [license](./assets/LICENSE.md). The layer owns its geometry, materials and loaded textures. Initialization is single-use; disposal is idempotent and releases late texture arrivals.

## Rivers

`createRiverWaterLayer` from `/water` builds a bounded, opaque blue-green ribbon
through supplied world-space `[x,z]` centreline points. The consumer owns bank
terrain, placement exclusions and river shape; put the ribbon edges beneath the
banks. The layer owns its geometry, procedural normal map, material and one
throttled planar reflection target. It uses the same `init`, `update`, `configure`,
`invalidateReflection` and idempotent `dispose` lifecycle as pond water.

```js
const river = createRiverWaterLayer({
  points: [
    [-80, 0],
    [0, 15],
    [90, 40],
  ],
  halfWidth: 20,
  level: -2,
  waterColor: '#174f52',
  depthAt: (x, z) => -2 - terrainHeight(x, z),
  quality: 'balanced',
  flowSpeed: 5, // metres per second, in the order of the supplied points
  foamStrength: 0.65,
});
river.init({ scene });
```

Options also include `id='river-water'`, `normalSize=128` (power of two 16–512),
`distortionScale=0.45`, `crossSegments=32` (2–128) and `maxSegmentLength=12`.
`depthAt(x,z)` returns **signed** water depth (`level - bedHeight`), including
negative values under dry banks; its default is a constant 12 m. Prefer sampling
the actual terrain triangles when available. The layer samples both along and
across the ribbon, interpolating the signed depth before shading clear shallows,
deeper current and soft bank contact. The consumer owns the bed and its sampling
callback; the layer does not retain a terrain object.

The centreline point order establishes downstream. `flowSpeed=5` is the deep-current
speed in metres per second; local speed falls to one quarter in the shallow
margins and zero below dry banks. `foamStrength=0.65` (0–1) controls sparse,
broken current filaments. Multiscale normal fields and filaments advect in
channel coordinates, following bends. Two overlapping 24-second phases hide
field resets and limit accumulated shear. The existing mipmapped normal texture
is shared by both scales; no extra texture, mesh draw or reflection pass is added.

`configure({flowSpeed,foamStrength,reducedMotion,quality})` updates these controls.
`update(dt)` advances the owned clock in seconds. Alternatively,
`update(dt,{time,paused,reducedMotion})` accepts absolute nonnegative `time` for
deterministic presentation/seek; `paused` or `reducedMotion` freezes the current
field. Consumers own their presentation clock and must pass the same frozen time
after resume when using absolute time. `stats.time`, `.flowSpeed`, `.foamStrength`,
`.flowPeriod` and `.length` expose the current state.

`sampleFlow(distance,lateral=0,time=stats.time)` queries retained ribbon samples,
returning world `position`, downstream XZ `direction`/`velocity`, signed `depth`,
local `speed`, and both advection `layers` (`phase`, `weight`, `sourceDistance`).
Distance is measured along the supplied centreline; lateral is signed metres to
its left, clamped to the ribbon. Invalid/uninitialized/disposed queries return
null. Terrain callbacks run only during initialization. The probe describes
visual surface transport, not a hydrodynamics or gameplay-current simulation.

Advected directional ripples, filtered fine normals, broad sun glints and Fresnel-weighted
forest reflections remain visible together. Planar reflection images are softened
spatially; high-frequency ripple energy fades with pixel footprint. Shared Water
ignores normal/depth override passes when refreshing reflection images, while its
view-dependent shading follows the current camera even between mirror refreshes.
