# Vehicle motion

Renderer-independent arcade motion extracted from the accepted three-vehicle Trail Driving game. Copy `src/` into your package's owned modules. Version 1.0.0; no runtime dependencies, assets, external listeners or disposal requirement. This module contains original project code; no third-party art is bundled.

```js
import {
  VehicleMotion,
  VEHICLE_PRESETS,
} from './modules/vehicle-motion/src/VehicleMotion.js';

const motion = new VehicleMotion({
  config: {
    ...VEHICLE_PRESETS.quad,
    topSpeed: 24,
    dimensions: { ...VEHICLE_PRESETS.quad.dimensions },
  },
  world: {
    height: (x, z) => terrain.height(x, z),
    surface: (x, z) => terrain.surface(x, z),
    colliders: [{ x: 12, z: -20, radius: 1.3 }],
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  },
  spawn: { x: 0, z: 0, heading: 0 },
});
// While playing; input may come from vehicle-input, a gamepad or an AI.
const state = motion.update(dt, { throttle: 1, steer: 0.3, brake: 0 });
// Send the immutable snapshot to presentation/camera/game rules.
// Reset clears movement and safe history; recovery keeps traveled distance.
motion.reset();
motion.recover();
```

The consumer owns the frame loop, terrain queries, model, camera, sound and rules. `config`, bounds and static circles are copied and frozen; later caller edits do not alter them. Recreate the controller to change these. Height/surface functions retain their original receiver, remain consumer-owned, and must be pure and stable for the controller's lifetime. Terrain must cover wheel samples up to ten metres beyond center positions. Height must be finite within ±1,000,000 m; exceptions from queries propagate. Surface is optional and returns `{kind,grip,roughness}`: `kind` is a string, grip clamps to 0.15–1.5, roughness to 0–1; nonfinite values use 1 and 0. Malformed nonstring kinds become `ground`.

`VEHICLE_PRESETS.fourWheel`, `.quad`, and `.twoWheel` are frozen neutral starting configurations with distinct dimensions and handling. A custom `config` supplies every field, commonly by spreading a preset. `layout` is `four-wheel` or `two-wheel`; two-wheel assistance prevents a full fall and uses front/rear contact points. Numeric limits reject invalid or extreme scales before simulation:

| Field                                       | Accepted range                                     |
| ------------------------------------------- | -------------------------------------------------- |
| `topSpeed`, `reverseSpeed`                  | 0.1–150, 0.1–30 m/s                                |
| `acceleration`, `braking`                   | 0.1–100 m/s²                                       |
| `wheelRadius`, `suspension`                 | 0.02–5, 0–3 m                                      |
| `steering`, `grip`, `weightTransfer`        | 0.01–1.2 rad, 0.1–3, 0–0.2                         |
| `steeringResponse`, `suspensionResponse`    | 0.1–100 s⁻¹                                        |
| `dimensions.wheelBase`, `.length`, `.width` | 0.1–20, 0.1–30, 0.1–15 m                           |
| `dimensions.track`                          | 0.1–15 m for four wheels; exactly 0 for two wheels |

Wheelbase must fit length; track must fit width. Bounds are a nonempty rectangle within ±1,000,000 m. At most 10,000 static circles are accepted, with center coordinates in that same range and radius in (0,256] m; a 16 m spatial index caps total cell references at 100,000 and rejects larger configurations. Large direct `collisionBetween(from,to)` queries fall back to scanning the bounded circle array. Invalid poses are blocked. Five discs conservatively enclose chassis slices and sweep continuously; solids block at any altitude. This is a horizontal arcade collision model, with no mesh collisions, tipping, gears or independent wheel forces.

`update(dt,input)` uses seconds, clamps a frame to 0.1 s, integrates at most 1/120 s per substep, and drops excess time. Throttle/steer clamp to −1…1, brake to 0…1; nonfinite numeric input becomes zero. It provides traction-limited acceleration/turning, sampled terrain support, short ballistic crest jumps, landing impact and damped body attitude. Call only while playing. `snapshot()` returns detached frozen records; controller state is private. `reset(spawn?)` validates `{x,z,heading}` before changing state, reuses the last valid spawn when omitted, and searches up to 30 m for a safe grounded pose or throws. `recover()` chooses a recent earlier safe pose, clears velocity, and preserves traveled distance. Checkpoint progress and recovery penalties belong to the game.

Coordinates use metres and radians: heading 0 faces −Z; positive heading turns right toward +X and wraps to ±π. The root mounts at `(x,y,z)`, with `y` the mean wheel ground plane. Positive pitch raises the nose; positive roll raises the right side; assisted lean is negative in a right turn. `steer` and `wheelSpin` are signed wheel angles. A model facing local −Z can use `YXZ` Euler order with Y=`-heading`, X=`pitch`, Z=`roll+lean`; wheel steering Y and spin X use negative snapshot angles.

`contacts` are front-left, front-right, rear-left, rear-right or front/rear. Each supplies world wheel-center `x,y,z`, suspension `compression` in metres and `grounded`. Snapshots include `layout`, pose, `speed`, `steer`, `airborne`, `verticalSpeed`, `wheelSpin`, `throttle`, `brake`, `slip`, `acceleration`, `distance`, and `surface`. `collision` is true if any substep was blocked; `landing` is the update's peak relative impact speed, otherwise zero. `validPose(pose)` checks the shared static footprint and safe pitch/roll. Snapshots drive [vehicle-presentation](../vehicle-presentation/README.md) without creating a runtime dependency.
