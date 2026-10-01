# VECTOR//NOVA architecture

## Stack and module boundaries

Standalone Vite + Three.js ES modules, WebGL2, PBR/ACES and sRGB output. No repository framework, alternate launcher or cloned runtime. See the [README](README.md) for available circuits and the [roadmap](ROADMAP.md) for planned work.

The locally owned ESLint/Prettier/lint-staged/Husky configuration was adapted from Chronoforge Echo at the user's request.

| Module                 | Responsibility                                                                  |
| ---------------------- | ------------------------------------------------------------------------------- |
| levels                 | Validated discovery, per-level factories, metadata and presentation adapters    |
| core                   | Boot/readiness, fixed-step session, replay, mode changes and teardown           |
| track                  | Optional route-frame, sweep and geometry mechanics                              |
| environment / renderer | Optional placement mechanics; shared rendering, lighting and resource metrics   |
| ships / camera         | Async Kestrel asset and local presentation; road-frame chase/inspection cameras |
| physics / race         | Vehicle motion and rail response; checkpoint/lap validation                     |
| input / ui             | Normalized controls, focus/visibility cleanup, menus/HUD/settings               |
| audio / effects        | Event-driven presentation; failure must not stop simulation                     |
| pickups/halcyon        | Explicit opt-in adapter, deterministic devices and owned presentation           |

`src/levels/<slug>/track/`, `environment/` and `backdrop/` own each circuit’s route, construction, materials, scenery and sky; Nacre also owns its overlay and flight presentation adapter. Shared directories contain reusable mechanics, never a default world style. Existing public asset URLs and replay identities remain stable across source moves.

`src/levels/` discovers asset-free metadata eagerly and imports only the selected implementation. Its [level API](docs/LEVEL_API.md) defines factories, presentation and ownership; unknown or malformed levels fail visibly.

## Route, coordinates and handling

- Metres/seconds/radians. World +Y up; ship local +Z forward, +Y up.
- `sample(distance)` wraps arc-length metres and returns `{position, tangent, right, up, quaternion, curvature, bank}`, optionally `roll`. Road, ship, camera and physics consume the same frame.
- The legacy `frame.right` is geometric +X, which appears driver-left when facing +Z. Positive input steer means driver-right: negative geometric heading/lateral displacement. Do not reverse this when adding levels.
- Reuse `src/track/frames.js` for continuous parallel-transport frames through vertical tangents/inversions and lap closure. Reconstructing every frame from world-up crossed with tangent fails at vertical directions. The optional [geometry helpers](src/track/README.md) retain authored profiles and local clearance rules; no shared world preset is applied.
- Track models expose unique/versioned identity, length, full width, ordered checkpoints, contiguous named sections, scenarios and bounds. Production and shape views share one route.
- Fixed simulation is 120 Hz, capped at 0.1 s / 12 catch-up steps. Pause/visibility loss clears the accumulator. Render interpolates distance and quaternion; presentation never mutates simulation.
- Bend assistance is 0.3. Persistent heading retains the unassisted yaw, while a separate steering response preserves manual turn-in. Pitch/roll adhere to the magnetic surface.
- Gravity projects through tangent/right axes; explicit parking hold prevents slope/bank creep. Yaw-aware swept rail bounds resolve collision, reserve loss and lateral response. Manual recovery clears heading and invalidates the lap.

Halcyon uses a 5 km route with distributed rise/descent, full roll/inverted hold and plunge. Asterion uses 4.5 km with a wall ride, raised crossing and steep dive. Authored dimensions and section data belong in their models, not duplicated documentation tables.

## Session, devices and replay

`src/core/session-runtime.js` provides the ordinary magnetic adapter and one `advanceSession` path shared by live input and replay. The [session adapter contract](docs/GATE4_RUNTIME_CONTRACT.md) defines hooks and event order. Preserve identity `{id, version, rulesId}`; replay also checks app/track/physics versions, seed and deterministic initial state. Reject incompatible or incomplete logs.

Halcyon devices load only for exact track identity plus `features=halcyon-pickups`. Baseline and feature records remain separate; other levels do not import that feature.

Device ticks expire timers and apply brake cancellation before physics, consume shields on qualifying impacts, then sweep new forward crossings. A shield collected later in a tick cannot protect an earlier impact. Effects do not stack; manual recovery clears effects while retaining the consumed-device ledger. Reverse/parking/reset farming must not rearm devices. Shields protect reserve loss, not collision separation or speed consequences. Layout/tuning/rules IDs live in `src/pickups/halcyon/`.

The opt-in `src/physics/flight.js` model supplies ballistic flight, swept landings and timed recovery. Nacre's adapter retains its authored rules, identity, scenarios and notices. Level adapters may supply pure grounded surface/force and airborne force samplers; zones, heat and events remain level-owned. Per-call surface options default to unchanged magnetic response. Optional authored jumps retain supported main-road traversal; actual transfers keep strict landing-checkpoint validation. See the [level API](docs/LEVEL_API.md#shared-local-mechanics). Automatic missed-jump recovery counts its delay as elapsed time and retains a valid lap; manual recovery still invalidates it. Keep Nacre-specific tuning out of the ordinary magnetic adapter. Local flight, surface, hazard and force rules use versioned session adapters. Shared defaults remain compatible with existing circuits.

## Ship and rendering

`await createShip(options)` returns `{group, update, dispose}`. Load the GLB before measuring inspection bounds, baking reflections or warming shaders. Core owns world pose; update animates only local presentation. Source/exporter/provenance: `assets/ships/kestrel/`; runtime asset: `public/assets/ships/kestrel/kestrel.glb`. See [ship API](src/ships/README.md).

High uses single-sample HDR, GTAO, restrained bloom, OutputPass and SMAA. Multisampled HDR plus GTAO caused an ANGLE Metal opaque-region fault; retain the working pipeline. Low omits postprocessing. DPR caps are 1.25 desktop / 1 mobile.

Sky PMREM and a static scene probe approximate reflections; these are not realtime reflections. Renderer-owned reflection textures are borrowed by ship/environment materials and must not be disposed by borrowers. Road coverage masks the analytic contact footprint over real apertures.

Camera damping follows transport through the road frame, with quaternion rotation and local road clearance to handle inverted decks and steep crests. Inspection fits the loaded ship's bounds to the available UI region. Pooled road lights use continuous fades; thin road details must follow the tessellated surface to avoid flicker.

## Lifecycle and verification

One owner releases each geometry, material, texture, listener, audio node and animation callback. `createLifetime` unwinds owners in reverse order on shutdown or failed boot; inspection owns only its floor/ring, and level components borrow renderer probes/sky textures. The shared presentation controller updates road, environment and backdrop once per frame, supplies zero dt outside racing and propagates resets. Camera flight/portrait behavior uses explicit descriptor options. Await owned assets and shader warmup before setting ready. Dispose must be idempotent; failed boot should show a useful reload error. Audio/storage failure stays recoverable, and context loss pauses.

`metadata.flyCamera` optionally enables a free inspection camera (currently Vesper): F or Circuit Views enters from the current camera pose; drag-look, WASD and Q/E move through the full environment at a fixed 200 m/s. The `fly` mode freezes simulation, lap timing and replay recording. Returning restores the prior racing/paused/title/overview mode and clears controls. Its keyboard/pointer/touch listeners are owned by `src/core/fly-camera.js` and disposed with the session.

`window.__VN` exposes readiness, snapshots/metrics, named scenarios, camera selection, start/pause/restart, replay and disposal for verification. Scenario placement is deterministic setup, not autopilot. Runtime metrics distinguish source geometry from drawn multipass totals.

Load only selected-level assets. The [common level checks](tools/level-checks/README.md) validate CPU track/module contracts and short hidden runtime behavior. Test high/low, reduced motion, pause/reset/replay, resource disposal and relevant real input after runtime changes.

## Nacre flight, water and moving scenery

The Nacre runtime owns ballistic flight, bounded air control and swept receiving-road/rail contact. Landing coverage is derived from the accepted 70%-through-boost launch envelope, including long receiving straights. Sweep the hull between ticks to prevent tunnelling; accept only the authored road and orientation. A forgiving half-width rail catch deflects the craft inward with one small penalty. Automatic recovery credits only its validated jump interval; ordinary manual recovery stays invalidating.

Keep craft, road and camera origins consistent at takeoff and landing. Transport the previous camera relative to the craft anchor, not between mismatched road-centre/world-pose origins; otherwise off-centre launches visibly jump sideways. Preserve the actual contact pose, then settle height/attitude smoothly. Both live input and replay consume the same advance routine and rules identity.

Water crossings use actual world height. Protect the mean-water road/contact corridors inside displaced storm waves, and apply underwater absorption to the scene, ship and HUD together. Seeded lightning/thunder and pooled splashes follow simulation time and obey pause/reset, mute and reduced motion. Environment geometry, not just its centreline, must clear banked roads and flight envelopes.

Moving creatures are presentation only. Reuse one loaded mesh, deform positions and normals by arc-length transport, and verify the full asset envelope. For a crossing, use a fixed world-space heading rather than successive route frames: following the road makes the creature turn alongside it. Stage the entire body across a viewing window with speed-scaled timing, including boost acceleration; a head-only or single-instant visibility check misses the intended spectacle. Keep reproducible asset sources and provenance; screenshots, critique scores and iteration histories are not architecture.
