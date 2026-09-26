# Trail Driving architecture

A standalone 600 × 600 metre driving park copied from Tech9 baseline 1.3.0. One world unit is one metre; +Y is up, heading zero faces −Z and positive heading turns toward +X. The game owns its source copies, authored content and frame loop. Immutable `tech9.json` and `GAME_PLAN.json` record the original fork, not current completion status.

## Runtime ownership

`src/main.js` builds the park scene definition and `TrailGame` state machine. The copied `SceneApp` owns the renderer, camera, lighting, postprocessing, graphics settings and one animation loop. The game replaces the baseline camera controller through `setController`; its synchronous update advances motion and trial rules, updates model articulation and audio/effects, then the camera and HUD. The world layer remains independently disposable. The inherited `src/world/` forest code provides asset/rendering conventions; the active park is `src/park/ParkWorld.js`.

`parkData.js` supplies the same triangulated terrain height, surfaces, bounded placements and solid proxies to rendering, motion and cameras. Forest instances, garage, rocks and signposts derive from shared placement data. Collision uses conservative horizontal discs, including airborne motion. Low groundcover is decorative. Routes, directional gates, spawn poses and per-vehicle medal times belong to the game.

`VehicleMotion` accepts pure world queries and static colliders. It owns simulation state and safe recovery history, returns independent snapshots, and never imports Three.js or route rules. Its three separately tuned configurations define acceleration, braking, dimensions, steering, traction and suspension. Sampled wheel contacts drive support pitch/roll; airborne motion follows gravity and reconnects to ground. The bike uses assisted balance and lean. See [driving contracts](src/driving/README.md) for contact ordering and units.

`VehicleInput` owns keyboard and focus/visibility listeners. Menus, pause, lost focus and recovery clear held keys; re-enabling requires fresh input. The game consumes semantic camera/recover/restart/pause actions. The input owner does not advance motion or award progression.

`VehicleModel` owns its original procedural meshes, materials and live instrument textures. It receives snapshots, applies chassis rotation, transforms world wheel centres through the chassis inverse, then updates wheel steer/spin, suspension and attached rider posture. Mounted poses come from the current model transform. The game replaces and disposes the old model and driving camera when changing vehicle. [Editable vehicle sources](art/VEHICLES.md) document assets and ownership.

`DrivingCamera` wraps the game's copied follow-camera 1.0.1 with vehicle-specific chase framing, turn anticipation and terrain/solid boom clearance. Mounted views hide obstructing driver/vehicle parts while retaining controls. The camera updates after model articulation. `DrivingFeedback` owns a bounded dust pool, tire marks and synthesized Web Audio graph; pause explicitly silences audio even when the browser stops rendering.

## Game state and progression

Garage and settings disable motion input. Starting a free drive or trial constructs clean motion/rule state and enables input. Driving can pause/resume, recover, restart, finish or return to garage. Results stop input and offer retry, another vehicle or garage. Recovery clears velocity and controls, selects a valid grounded recent pose, and adds five seconds to a timed run without advancing or erasing legitimate gates.

`TrialRules` uses swept directional crossing and accepts only the next gate. The final valid gate produces elapsed time plus penalties, a vehicle-specific medal and the result. Records are keyed by vehicle/route. Storage access and writes are guarded; denied storage leaves session play usable. A deliberate two-press reset clears records. Volume and graphics have separate persisted settings.

`GameUI` owns the menu/HUD DOM, route map and semantic buttons; it delegates actions to the game. HUD updates are throttled during driving and initialized synchronously when rendered. Narrow menus scroll and controls remain keyboard-focused.

## Testing and later reuse

Only `?test=1` exposes observations, shared route/world data, graphics changes and targeted pose arrangement. Completed trial evidence uses normal-speed keyboard input with snapshot reads only. See [verification](tests/README.md) and [recorded acceptance](README.md#recorded-acceptance).

The later framework extraction lives in canonical `vehicle-motion`, `vehicle-input`, `vehicle-presentation` and follow-camera 1.1.0. It does not silently replace this accepted game's local implementations. Framework modules omit route layouts, progression, authored vehicles and park art; future consumers explicitly copy the selected source and dependencies.
