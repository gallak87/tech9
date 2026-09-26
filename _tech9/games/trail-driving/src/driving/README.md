# Game-owned driving systems

`VehicleMotion` and `VehicleInput` use only standard JavaScript. This game keeps its local implementation when shared behavior is extracted into the framework.

```js
const motion = new VehicleMotion({ vehicle: 'jeep', world, spawn });
const input = new VehicleInput({
  onAction(action) {
    /* camera, recover, restart */
  },
  onPause(reason) {
    /* pause the game and show its menu */
  },
});
// A user gesture dismisses the menu. Blur its focused button before enabling.
input.enabled = true;
const state = motion.update(dt, input.sample());
// Recovery: retain trial gate progress and apply its penalty outside the motion system.
input.clear();
motion.recover();
// Release all input listeners when this owner is removed.
input.dispose();
```

`world` provides pure `height(x,z)` and `surface(x,z)` queries, static circle `colliders` (`{x,z,radius}`), and finite rectangular `bounds` (`minX,maxX,minZ,maxZ`). Surface data is `{kind,grip,roughness}`. Query the same terrain and obstacle placements that rendering uses. Spawn is `{x,z,heading}`. The constructor validates world bounds and static collider data; an obstructed spawn searches within 30 metres or throws.

All dimensions are metres and simulation time is seconds. Heading zero points down -Z; positive heading turns toward +X. A rendered model faces local -Z and mounts at `(state.x,state.y,state.z)`, with `YXZ` rotation `(-heading,pitch,roll+lean)` by named axis. `y` is the mean ground plane through its wheels, so level-ground wheel centers sit at `wheelRadius`. Pitch is positive nose-up; roll is positive right-side-up. Bike lean is negative in a right turn. `steer` is actual wheel steering radians (+right); Three wheel rotation around Y is its negative. `wheelSpin` is accumulated signed radians; local-X wheel rotation is its negative.

`contacts` are front-left, front-right, rear-left, rear-right for the Jeep/ATV, and front/rear for the bike. Each contains world wheel-center `x,y,z`, upward `compression` in metres and a `grounded` flag. The chassis pose is damped; wheel suspension follows sampled terrain. `surface` retains the query's kind/grip/roughness. `collision` reports a blocked sweep in the current update; `landing` is this update's peak relative vertical impact speed, otherwise zero. `airborne`, `verticalSpeed`, `speed`, `throttle`, `brake`, `slip`, `acceleration`, and traveled `distance` drive presentation. Snapshots and their nested records are immutable and detached from the live state.

The simulation clamps a caller update to 0.1 seconds and integrates at most 1/120 second per substep. Each chassis is conservatively covered by five discs, continuously swept against spatially indexed solids; solids block at any altitude. Steering and acceleration depend on vehicle/surface grip. Terrain support and velocity produce short ballistic arcs and damped reconnection. This is an assisted arcade model, with no tipping, gears, independent wheel forces, damage, or mesh-level collision solver.

Input starts disabled. W/up drive, S/down brake into reverse, A/D or left/right steer, Space brakes. C switches camera, R recovers, T restarts, Escape/P/Tab pause. OS repeats cannot reactivate keys after a clear. Blur, a hidden document, and focus in editable/menu elements clear held state and pause once. Recovery and restart clear held input before their action callback; switching cameras preserves it. Disposing is idempotent.
