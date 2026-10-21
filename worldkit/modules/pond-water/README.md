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
