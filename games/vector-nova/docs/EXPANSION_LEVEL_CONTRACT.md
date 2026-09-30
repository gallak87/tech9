# Expansion level contract — requirements

The integrator must implement and verify this small shared API before dispatch, then replace these requirements with exact exports and a working example. The [launch ledger](expansion/LAUNCH_STATE.json) owns the current foundation state and frozen revision. Preserve the existing session adapter; do not introduce a second entry point or cloned runtime.

## Required capabilities

1. **Lazy discovery/loading.** A lane provides a module under `src/levels/<slug>/`; loading its `?level=<slug>` requires only that module's owned code/assets. Use a small validated catalog or Vite-supported lazy module discovery. Missing/invalid new entries must have deliberate error behavior; never silently show Halcyon and label it the requested map. Ordinary Halcyon, its exact pickup opt-in and Orbital production/shape keep their existing behavior.
2. **Track contract.** Reuse the real track API: unique/versioned track identity, title, length, width, ordered checkpoints and `sample(distance)` returning position/tangent/right/up/quaternion/curvature/bank. Explicitly document wrap/seam behavior, units, geometric +X versus driver-right and required metadata. Frame data must be shared by collision, road, ship and camera. New routes retain default magnetic motion/controls and do not import Nacre flight code.
3. **Separate shape and production.** The lane supplies neutral shape geometry and finished raceway geometry. `review=shape` must use the same authored route/frames, with massing/overview support, not a second unrelated spline. Production preview must be reachable through the ordinary app controls.
4. **Owned world and backdrop.** Supply per-level environment and an optional sky/backdrop/lighting configuration through shared renderer hooks, without editing shared renderer source in each lane. Specify settings access, async asset loading/readiness, fog/background, sun/fill/ambient/exposure limits, reflections, quality/reduced-motion behavior and resource ownership. No forced use of the Halcyon cloud panorama or Orbital planet for unrelated worlds.
5. **Review metadata and scenarios.** Enable course title/briefing, named districts, 3D/top/profile overview and deterministic parked/approach scenarios from lane metadata. Document the schema expected by the current review camera/UI and prohibit direct DOM replacement or duplicate UI shells. A fixture must prove metadata actually renders, not merely exports unused fields.
6. **Lifecycle.** Define update inputs (vehicle, camera, simulation time, dt, mode/settings) and reset/dispose/reflection hooks. Paused/inspection states must not advance owned gameplay or keep racing-only audio/effects active. The renderer owns borrowed reflection textures; lane disposal must free only lane-owned resources. Presentation may not mutate vehicle/race state.
7. **Identity and isolation.** Replay/records must distinguish track/version/rules. Only Halcyon accepts the existing pickups opt-in; new maps ignore it without importing device code. No cross-level mutable singleton state or asset requests on unloaded levels. Baseline defaults remain exact unless an explicit new-level option is active.

## Ownership

The integrator owns the catalog/loading bridge, any shared renderer/UI/camera hook, contract tests and this document. Builders own only `src/levels/<slug>/**`, assets, lane tools and lane docs. Do not require a lane to patch shared files just to boot its level. A lane may request one narrow missing hook with its use case and a reproducible failure; the integrator patches/tests/freezes and distributes an identical supplement to all affected lanes.

Suggested implementation shape is a level descriptor exporting metadata plus track, shape, road, environment and optional backdrop factories. This is **not a promised function signature**. Choose the smallest interface that fits the existing renderer and write down exact signatures/defaults after testing. Do not expose arbitrary DOM/core mutation or unbounded renderer callbacks as a shortcut.

## Preflight completion evidence

- A temporary fixture drives through the shared entry point using a distinct track, road, backdrop and UI/review metadata; shape and production differ only in presentation.
- Real controls, parked slope, overview, start/inspection/pause/restart, replay compatibility and disposal work through the same runtime as existing levels.
- Unknown/missing/duplicate level entries and malformed required exports fail clearly. Arbitrary query text cannot import unrelated paths.
- Plain Halcyon, feature Halcyon, Orbital production/shape remain correct; only requested level assets load.
- Contract tests, full lint/build and bounded hidden production checks pass with exact build recorded and browser closed. External hardware/listening/performance limits remain explicit.
- Test-only fixture source/assets/routes are removed from the delivered catalog; tests may retain fixtures that are not production entries.
- A binary-capable foundation patch applies against the recorded approved base in a clean fixture and matches its manifest hashes, including untracked new files.

Record implemented/frozen status, final package hash, test/build evidence and the exact public API here, then update `docs/expansion/LAUNCH_STATE.json`. The seven builders must receive that verified document rather than these provisional requirements.
