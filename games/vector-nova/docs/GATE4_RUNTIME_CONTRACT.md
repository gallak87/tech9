# Session runtime adapter contract

The shared session adapter supports baseline magnetic driving, opt-in Halcyon pickups and Nacre flight. Baseline physics remains version 3 with steering assistance 0.3.

Factory `createHalcyonRuntime({track, scene, ship, host, settings, emit})` is dynamically imported only when `track.id === "halcyon-viaduct-4-compact"` and the exact query `features=halcyon-pickups`. Other tracks ignore the opt-in. The ordinary baseline factory is `createMagneticRuntime`.

The returned object has:

- `id`, integer `version`, string `rulesId`: deterministic compatibility identity, included in replay, snapshot and race record domain. Configuration/rules changes must change identity. Baseline and feature race instances never share best/history state.
- `scenarios`: dictionary of `{label, state}`. `state` is deterministic initial vehicle fields; core merges these before scenario reset. Metadata extends the existing review selector, without adapter core edits.
- `advance(state, input, dt)`: sole vehicle mutation path, returns ordered event array. Called at fixed 1/120s **instead of** `stepVehicle`. Adapters delegate unchanged magnetic physics as needed. Adapters must increment `state.time` once per tick, including immobilized recovery. Presentation cannot change simulation.
- `reset({reason, state, scenario, seed})`: clear or reinitialize owned simulation. Reasons: `initialize`, `fresh-lap` (start/restart), `scenario`, `manual-recover`, `home`. Only `manual-recover` may retain pickup consumed/cooldown eligibility; it must clear airborne state. Scenario receives already-assigned vehicle state and seed. Pause/resume does not reset or advance simulation.
- `snapshot()`: JSON-serializable simulation state; returned under `getSnapshot().runtime.state`. `restore(data)` reinstates it without presentation side effects. Runtime transient meshes/audio/DOM are excluded.
- `pose(alpha)`: `null` for magnetic motion, or interpolated `{position: THREE.Vector3, quaternion: THREE.Quaternion}` for world motion. Ship +Z is forward, +Y up; driver-right is geometric -X. Core and chase camera both consume this pose; contact footprint is suppressed while a world pose exists.
- `update({state, dt, time, mode, camera, settings})`: presentation after pose/camera, once per rendered frame. `dt` is zero outside racing, `time` is simulation time. Settings are live references. Never mutate simulation here.
- `dispose()`: remove and dispose exclusively owned resources/listeners/DOM/audio; do not dispose supplied host/scene/ship resources.

Core tick order: save previous vehicle state; log input; `advanceSession` calls adapter advance; emit adapter events; call race step with old/new distance and dt; emit race events; increment tick. Live play and replay call the same routine. `emit` from factory context is for presentation feedback only outside deterministic advance; deterministic events must be returned from advance. Event envelopes add tick and simulation time.

Replay header includes application version, track ID, physics version, runtime `{id,version,rulesId}`, seed, scenario and tick inputs. Mismatch is rejected. Replay resets to deterministic scenario and re-runs the same advance path. Existing manual R recovery invalidates lap and disables clean input-only replay; automatic Nacre recovery does not set that manual reset counter. Race history includes rulesId; no persistence or additional time-trial feature is introduced.

Nacre-specific extension: its adapter holds distance at the exact unwrapped takeoff through flight/recovery, then emits `jump-transfer` with `{id,from,to,outcome:"landed"|"recovered"}`. Core race checks this against only that jump's authored takeoff, landing and apron interval before crediting ordered checkpoints. Recovery delay is included in normal dt, no surcharge, no invalidation. This does not affect Halcyon adapters.

Tests cover baseline state/event equivalence, feature guards, shared live/replay determinism and rules compatibility; each feature owns its outcome tests.

## Replay initialization

Replay also carries `initial:{vehicle,runtime}` captured after deterministic fresh/scenario reset. Playback validates all values are finite and initial state exactly matches the versioned scenario's deterministic reset state, then restores the vehicle and calls adapter `restore`. Tampered or stale initial state is rejected. The restore hook is exercised by normal replay, not an unused promise. Owned presentation `update` is invoked in inspection as well as every other mode, with zero dt outside racing, so owned craft fields/audio can hide or stop correctly.
