# Island coast and ocean

Consume through `@worldkit/environment/ocean`. The package includes its water implementation and license. Use Three.js `0.186.1` with WebGLRenderer. No external textures are required.

```js
import {
  createIslandCoast,
  createNavigationArea,
} from '@worldkit/environment/ocean';
import { createOceanLayer } from '@worldkit/environment/ocean';

const coast = createIslandCoast({ x: 30, z: -20, radius: 40, level: 2 });
const canOccupy = createNavigationArea({
  coast,
  bounds: { minX: -200, maxX: 260, minZ: -250, maxZ: 210 },
  circles: rockPlacements, // { x, z, radius }
  boxes: dockPlacements, // { x, z, width, depth }, axis aligned
});
const ocean = createOceanLayer({ coast, halfSize: 500, quality: 'balanced' });
ocean.init({ scene }); // optional definition.environment.sun: { position, color }
ocean.update(dt); // consumer frame loop
ocean.invalidateReflection(); // after camera switch or teleport
ocean.configure({ quality: 'high' });
// Teardown: ocean.dispose(); safe more than once, including before init.
```

Use `coast.terrainHeight(x,z)` for ground vertices and `coast.vegetationAllowed(x,z,margin=2)` for placement. `point(angle,inset=0)` returns `[x,z]`; `distance(x,z)` is signed radial distance (positive seaward), not Euclidean distance. The immutable definition drives CPU queries, hole geometry and shader coast. `canOccupy(x,z,hullRadius)` checks conservative disc clearance against a sampled coast, circles, boxes and bounds; provide the same placements to the renderer.

Coast options default to centre `(0,0)`, radius 77 m, level 0, 256 segments, land slope 0.23, underwater slope 0.42 and maximum depth 4 m. `harmonics` accepts up to eight `{ amplitude, frequency, phase=0 }` sine terms; integer frequency 1–16 and total absolute amplitude below half the radius. Use `[]` for a circle. Segments support 64–1024; lower counts deliberately overestimate collision clearance. Author hills inland using the same coast boundary if a simple sloped island is insufficient.

Ocean options: `id`, `coast`, `halfSize=1000` (square centred on the island, must enclose it), `quality`, `normalSize=256` (power of two, 16–512), `waterColor='#186276'`, `distortionScale=1.3`. Presets: balanced 1024 px/every 3 frames, high 1536/every 2, ultra 2048/every 2. Unknown quality falls back to balanced. Layer stats expose the selected settings. Initialization is single-use; failed initialization releases resources automatically. It owns geometry, procedural normals, reflection target and material, but borrows the scene/renderer.

The surface surrounds one star-shaped island and has finite extent. Navigation bounds are independent of visible water extent. Reflections are throttled planar approximations with faded frustum edges; mounted views can still show approximation limits.
