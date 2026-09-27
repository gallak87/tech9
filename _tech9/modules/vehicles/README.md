# Vehicles

One source-copy module for the improved Jeep, ATV and dirt bike: editable models and riders, matched handling presets, terrain motion, wheel/suspension/control animation, mounted-view attachments, optional keyboard input, reflections and driving feedback. Requires Three.js **0.186.1**. No game or sibling module is required; [follow-camera](../follow-camera/README.md) remains a separate optional capability.

Copy `src/`, `assets/`, this README and the license/notice files together. Install Three.js in the consumer. The procedural model sources are the editable assets; no downloaded models or textures are needed. See [asset sources and rights](assets/README.md).

## Integration

```js
import { createVehicle, VehicleInput } from './modules/vehicles/src/index.js';

const vehicle = createVehicle({
  type: 'atv', // 'jeep' | 'atv' | 'bike'
  world: {
    height: (x, z) => terrain.height(x, z),
    surface: (x, z) => terrain.surface(x, z), // optional
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    queryObstacles: (area) => worldObstacles.overlappingCircles(area),
    // Or colliders: [{ x: 12, z: 8, radius: 2 }] for copied static circles.
  },
  spawn: { x: 10, z: 20, heading: 0 },
});
scene.add(vehicle.group);
let paused = true;
const input = new VehicleInput({
  onPause: () => {
    paused = true;
  },
});
function resume() {
  // call from the consumer's Start/Resume button
  document.activeElement?.blur();
  input.setEnabled(true);
  paused = false;
}
function update(dt) {
  // called by the consumer's existing frame loop
  const controls = input.sample();
  if (!paused) vehicle.update(dt, controls);
  // Update your camera, then render your scene.
}
function dispose() {
  input.dispose();
  vehicle.dispose();
}
```

A complete [working scene](example/main.js) supplies its own terrain and obstacles, vehicle selector, keyboard controls and the separate follow-camera. From `_tech9/`: `./run install`, then **`./run run example:vehicles`** and open `http://127.0.0.1:4490`. WASD/arrows drive; Space brakes; C switches camera; R recovers; T resets; Esc pauses. This desktop example contains no routes, checkpoints or scoring. Stop its server with Ctrl-C.

## Contract and ownership

`createVehicle({type='jeep', world, spawn={x:0,z:0,heading:0}, handling={}, lighting})` owns one model and simulation. Add its `group` to your scene. Metres, seconds and radians; +Y is up, heading zero faces −Z, positive heading turns toward +X. Spawn/reset use **world coordinates**; move the vehicle with `reset`, not by writing its group transform. Translated/rotated parent groups work; vehicle and ancestors must retain unit scale and automatic matrices.

- `update(dt, {throttle, steer, brake})` advances motion and all transforms, returning the current immutable snapshot. Throttle/steer are −1…1, brake 0…1. Missing/nonfinite control components become zero. `dt` must be finite and nonnegative; excess beyond 0.1 s is dropped, with simulation substeps ≤1/120 s. Call once per active frame; stop calling to pause.
- `snapshot()` returns the last immutable state: `vehicle`, world `x/y/z`, `heading`, `pitch`, `roll`, `lean`, signed `speed`, steering radians `steer`, `wheelSpin`, `contacts`, `surface`, `airborne`, `verticalSpeed`, `collision`, `landing`, `slip`, `acceleration`, `throttle`, `brake`, and cumulative `distance`. Collision/landing describe the last update. Contacts are front-left, front-right, rear-left, rear-right; bike is front, rear. Each contact has world `x/y/z`, `compression` and `grounded`.
- `reset(pose?)` resets velocity, distance and animation to a grounded pose; omitted pose uses the last reset spawn. If blocked/too steep it searches up to 30 m away, then throws. `recover()` uses recent safe history, clears kinetic state and retains distance. Read the returned actual pose. Neither action changes game progression.
- `mountedPose()` returns fresh world arrays `{position,target,up}` after articulation. `setDriverView(boolean)` hides obstructing rider parts while retaining hands/controls. Integrate with your camera or optional follow-camera, updating it after `vehicle.update`.
- `dispose()` detaches the group and releases owned meshes, materials and generated textures once. Further mutation/pose calls throw; `snapshot()` retains the last state. The caller owns renderer, lights, scene, camera, input, optional feedback and shared lighting. Do not attach consumer-owned render assets inside the owned vehicle group.

`handling` may override `topSpeed`, `reverseSpeed`, `acceleration`, `braking`, `steering`, `steeringResponse`, `grip`, `suspensionResponse`, and `weightTransfer`. These values are copied/validated. Dimensions, wheel radius/layout and suspension travel remain matched to the included models. For custom meshes use the lower-level motion/presentation interfaces instead.

| Preset    | Max forward / reverse (m/s) | Wheelbase / track / wheel radius (m) |
| --------- | --------------------------- | ------------------------------------ |
| Jeep      | 25 / 5.2                    | 2.8 / 1.65 / 0.43                    |
| ATV       | 28 / 4.5                    | 1.55 / 1.1 / 0.31                    |
| Dirt bike | 31 / 2.4                    | 1.48 / 0 / 0.35                      |

### World queries

`world.height(x,z)` is required and must return finite height in ±1,000,000 m. Bounds are a finite nonempty `{minX,maxX,minZ,maxZ}` rectangle in the same range. `world.surface(x,z)` optionally returns `{kind, grip, roughness}`; defaults are `'ground'`, 1, 0; grip clamps to 0.15…1.5 and roughness to 0…1. Terrain queries must cover the bounds plus the small wheel footprint outside them. Use the same terrain definition as the rendered mesh.

Supply `world.colliders`, `world.queryObstacles`, both, or neither. Static circles are copied at construction. The synchronous query receives a frozen world-space `{minX,maxX,minZ,maxZ}` area and must return an array of circles whose **extents overlap** that area, conservatively including every possible solid. Each `{x,z,radius}` has finite coordinates within ±1,000,000 m and radius in (0,256]; max 10,000 circles per array. Static indexing allows at most 100,000 cell references. Queries retain their original `this` receiver. Results are validated and copied, never retained from the caller. Callbacks should be pure, fast, nonthrowing and stable within an update: collision performs multiple queries per substep. A throwing callback aborts that update and may leave simulation partly advanced; fix the query and reset before continuing.

The query can reflect world changes between frames, but does not simulate moving solids, push objects apart or sweep an obstacle's own motion. An obstacle newly overlapping the vehicle requires consumer recovery/reset. Collisions are conservative horizontal circles with infinite vertical extent, even during jumps; there are no mesh, box, bridge, tunnel or multilevel collision tests.

### Optional parts and internal boundaries

`Vehicle.js` composes the feature. `VehiclePresets.js` contains frozen model-matched data. `VehicleMotion.js` is renderer-free movement; `VehiclePresentation.js` binds snapshots to Three.js transforms; `VehicleModel.js`, `VehicleGeometry.js` and `RiderModel.js` are editable art and animation. These stay together in the one module.

- `VehicleInput`: optional event listeners only. Starts disabled. `setEnabled`, `sample`, `clear`, `pause`, `dispose`; blur/hidden/menu focus clears input and calls `onPause(reason)`. The consumer must stop simulation on pause and explicitly resume with fresh key presses. Default actions passed to `onAction(name)` are C=`camera`, R=`recover`, T=`restart`; recovery/restart clear held movement. Default pause keys are Esc/P/Tab. Options: `target` EventTarget (default window), movement `bindings` keyed by forward/reverse/left/right/brake with arrays of KeyboardEvent codes, `actions` code→name, `pauseKeys`, `clearActions`. Keys cannot overlap. Editable controls/buttons retain native input. Disposal removes listeners; no game loop is created.
- `createVehicleLighting(renderer)`: optional shared PMREM environment. Pass as `lighting` when constructing vehicles, then dispose it **after** all vehicles. Models borrow the environment texture. It does not own the renderer, scene lighting or camera.
- `DrivingFeedback({scene,camera})`: optional bounded surface dust and synthesized audio. Call `start()` directly from a user gesture, `update(vehicle.snapshot(),dt)` after movement, `setVolume(0…1)`, and `dispose()`. On pause, immediately call `update({...vehicle.snapshot(),paused:true},0)` even if frame callbacks stop; this silences audio. Scene/camera are borrowed. Audio is optional and browser-policy dependent.
- `VehicleMotion({config=VEHICLE_PRESETS.jeep,world,spawn})`: lower-level simulation for custom model integration, with the same world/state/reset/recover contract. Config includes the preset fields; use a full copied preset plus overrides. It allows custom `layout`, `dimensions`, `wheelRadius` and `suspension`, validates ranges and owns frozen copies. Unlike the factory, nonfinite/negative dt becomes zero.
- `VehiclePresentation({root,wheels,wheelRadius,suspension=0.3})`: lower-level nonowning transform binding for custom meshes. Supply 2 or 4 ordered `{hub,steering,spin,front}` entries with hierarchy `hub > steering > spin` descending from root and equal front/rear counts. `update(snapshot,dt)` sets chassis world pose and exact world contacts; absent contacts use copied hub rest positions plus clamped compression. Spin uses `wheelSpin`, or integrates speed if omitted. Root ancestry must be rigid/unit scale; wheel ancestors may be invertible affine transforms. `dispose()` releases bindings only.
- `createVehicleModel(type)`: art-only adapter with `group`, `update`, `reset(snapshot)`, `mountedPose`, `setDriverView`, `dispose`. Reset also clears smoothed airtime posture and mounted eye motion. Use a compatible complete motion snapshot (finite world x/y/z/heading) and the matching preset; it owns its render resources as described above.

## Validation and limits

Framework: `./run run check`; browser integration: `./run run verify:vehicles`. The latter builds the example, uses an installed Playwright Chromium (or `CHROMIUM_PATH`), owns strict port 4490 (`VEHICLES_PORT` override), and closes its server/browser in `finally`. Evidence goes to ignored `.artifacts/vehicles-framework`. Hooks exist only with `?test=1`. No game source is imported or changed; the original game remains independently owned.

Motion is assisted arcade handling with sampled suspension, ballistic jumps and bike balance, not rigid-body vehicle physics. No gamepad/touch input, networking, LODs or fleet instancing are included. Procedural detailed models have a meaningful construction/render cost; test fleets on target hardware. Canvas graphics require a browser for full visual detail. Vehicle art reached **7.0/10 at the six-round cap**, below 9/10: primary surfaces, material variation and rider anatomy remain stylized. No claim of universal rider clearance follows from sampled poses.

Final framework validation passed 143 CPU tests, lint/formatting, canonical builds and registry validation (seven modules). Baseline copy/provenance checks passed. Production-example browser verification at source checkpoint `42d05fd7` passed all three vehicle selections, real-keyboard acceleration/steering/braking/reverse, mounted views, circle obstruction, recovery/reset, pause/focus, repeated replacement, disposal and production-hook isolation. Chromium 151.0.7922.34, ANGLE Metal on Apple M1 Pro, 1440 × 900 at device scale 1. Warmed counts after identical bike-ending selection cycles stayed at 134 geometries, 16 textures and 12 programs, with no page/console/request errors. This was functional verification, not a fleet or frame-rate benchmark. Six follow/mounted screenshots and `verification.json` are retained locally in `.artifacts/vehicles-framework`.

The example build emits Vite's size advisory for its approximately 645 KiB minified bundle including Three.js and all three procedural models. It remains a working integration example; production consumers should choose loading/quality budgets for their target hardware. Optional synthesized audio/feedback retains the game-proven implementation but is not enabled in this minimal browser example. The game source, tests, fork receipts, baseline copies and separate follow-camera module remain byte-for-byte unchanged from `c7f5d72e`; only the game's historical module documentation links were updated. These results describe the extraction checkpoint on `codex/trail-driving`; later integration is recorded in Git.
