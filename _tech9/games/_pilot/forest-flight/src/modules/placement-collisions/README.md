# Placement collisions

Conservative horizontal collision proxies and bounded movement resolution. No runtime dependencies; units are metres on the XZ plane.

```js
import {
  placementCircle,
  placementCapsuleChain,
  moveGrounded,
} from './modules/placement-collisions/src/placementCollisions.js';

const colliders = [
  placementCircle(rockPlacement, { radius: 0.8 }),
  ...placementCapsuleChain(logPlacement, {
    start: [0, 0, -2],
    end: [0, 0, 2],
    radius: 0.3,
  }),
];
const next = moveGrounded(position, dx, dz, {
  bounds,
  playerRadius: 0.3,
  colliders,
  isWalkable,
});
```

A placement provides `{id, kind, matrix}`. The matrix is a Three.js Matrix4 or a finite column-major 16-value array used by rendering. `placementCircle` accepts a local `center`; capsule chains accept `spacing` and cover the transformed segment with overlapping discs. Returned descriptors are immutable.

`canStandAt(x,z,options)` checks bounds, colliders and the optional walkability predicate at the centre and eight perimeter points. `moveGrounded` uses bounded substeps and axis sliding, returning `{x,z}` without mutating the input. Proxies approximate horizontal clearance; terrain height comes from the consuming world.
