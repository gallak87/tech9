# Placement collisions · 1.0.0

Pure horizontal collision helpers whose proxies are generated from the same authored transforms used to render props. No renderer or Three.js dependency. This promotes the repeated pilot fixes for reachable deadfall and shoreline boulders without introducing a physics engine.

`placementCircle({id,kind,matrix}, {radius,center=[0,0,0]})` returns one frozen `{id,kind,x,z,radius}`. `matrix` accepts a column-major affine 4×4 array or an object with `.elements`, including Three's Matrix4. `radius` and `center` use local metres. The largest horizontal transform scale gives a conservative disc, including rotated non-uniform scale and shear.

`placementCapsuleChain(placement, {start=[0,0,0],end,radius,spacing=radius})` returns a frozen list of overlapping frozen discs. It transforms the authored local centerline and inflates each sample disc enough to cover the interval between samples. IDs append their sample index. Radius, spacing and transformed horizontal scale must be positive and finite; excessive sample counts fail during authoring.

```js
const placements = authoredProps.map((prop) => ({
  id: prop.id,
  kind: 'solid',
  matrix: prop.transform,
}));
renderInstances(placements);
const colliders = placements.flatMap((placement) =>
  placementCapsuleChain(placement, {
    start: [0, 0, 0],
    end: [5.44, 0, 0],
    radius: 0.4,
  }),
);
```

`canStandAt(x,z,{bounds,playerRadius=.3,colliders=[],isWalkable=()=>true})` checks the player disc against static circles, rectangular bounds and a sampled shore/surface predicate. `moveGrounded(position,dx,dz,options)` returns a new `{x,z}`, performs substeps of at most `min(.12, playerRadius*.5)` metres, and slides along free axes. Work is capped at 512 substeps; extreme deltas move only through their first 512 substeps. Callers should additionally clamp simulation time. Input objects and authored arrays are never modified.

The forest example exports `getForestPlacements()` and `getForestColliders()`. Its mature trees, rocks and five deadfalls use the same immutable transforms for rendering and collision. Log centerline dimensions match the local Blender authoring source. The pond example derives shoreline boulders from shared scene placements. Vegetation density/graphics quality never changes physical obstacles.

## Provenance and limits

Promoted at merged-pilot checkpoint `2713c2fc45cebc50b523900d6c49fc4f4eaf450d` from the authored forest circle contract (`_tech9/scenes/scene-test/src/world/ForestWorld.js`), Pinewatch's rendered-deadfall proxy fix (`_tech9/games/pinewatch-hunt/src/game/encounter.js`) and Stillwater's shared `BANK_ROCKS` rendering/collision placements (`_tech9/games/stillwater-fishing/src/world/ForestWorld.js`). Walking/substep lessons also come from all three game controllers. The generic extraction contains no game-specific terrain, prop names, rules or rendering imports.

Repository-authored code; no third-party code or assets are bundled. The repository declares no general redistribution license; this record does not add one. Forest assets retain the licenses recorded in their own source package.

Run `node --test _tech9/modules/placement-collisions/tests/*.test.js` with supported Node. Tests cover transformed non-uniform scale, capsule coverage, invalid authoring parameters, shoreline footprint, thin obstacles, axis sliding and bounded work. Scene tests compare every proxy with its immutable render placement and exercise all five logs.

These are static XZ approximations for a grounded heightfield walker. Capsule chains slightly overestimate their silhouette, and tree/rock circles do not follow the exact mesh. Small vegetation and log branch tips are not individually modeled. No moving bodies, height separation, gravity, trigger system, ray tracing or mesh collision. Spawn selection/depenetration stays with the scene. A shoreline predicate samples center plus eight perimeter points, so tiny holes or highly irregular shores need tighter application-specific geometry.
