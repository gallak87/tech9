# VECTOR//NOVA — architecture

## Milestone and stack

Gate 1 approved. Gate 2 completes only the first Halcyon level and core handling/presentation; all broader expansion requires later human review. See ROADMAP.md. Standalone Vite + Three.js ES modules; no framework imports, symlinks, launchers or registries. WebGL2 baseline, no WebGPU requirement. PBR, ACES exposure, sRGB output, instancing and real geometry. Chosen for browser reach and fast physically coherent iteration. Official renderer/color guidance: https://threejs.org/docs/pages/WebGLRenderer.html and https://threejs.org/manual/pages/color-management.html.

## Ownership and APIs (before parallel feature work)

Integrator owns package/config/docs and cross-module integration. Each delegated builder exclusively owns its assigned folder and requests core changes.

- `src/core`: integrator; runtime, clocks, shared contract, fixed-step orchestration, readiness/errors, seeded RNG and teardown.
- `src/track`: track builder; `createTrack()` -> `{length,width,sample(s), checkpoints, sections}`; `buildTrackVisual(track)` -> THREE.Group. `sample(s)` uses wrapping arc-length metres and returns `{position,tangent,right,up,quaternion,curvature,bank}`. Vectors are THREE.Vector3, quaternion maps local X/Y/Z to right/up/tangent. Positive curvature bends toward geometric right (driver-left). Geometry shares exactly the same frame. Width is full road width. Track origin near starting grid, +Z tangent preferred. Gate 2 circuit length 7,200 m, width 28 m, target 60–90 second lap at pace. Smooth closed centreline, continuous bank/elevation, short roof, underside/barriers/supports. Model independent of renderer.
- `src/ships`: ship builder; `createShip()` -> `{group,update({speed,boost,steer,time,energy}),dispose()}`. Original craft, local +Z nose/+Y up, centred at hover hardware, length about 7 m, width 4.5 m. Core applies world pose; update animates children only. No external assets.
- `tools`: verification builder; Playwright harness starts app if needed, waits for `window.__VN.ready`, drives actual keyboard, captures PNG sequences + JSON. No video recording or visible browser windows. Own scripts/scenarios only; request runtime changes.
- `src/renderer`: renderer, lights/reflection, colour management, resize/dispose, graphics and metrics.
- `src/environment`: city architecture, distance layers, seeded variation, instancing, landmark.
- `src/physics`: `createVehicleState`, `stepVehicle(state,input,track,dt)`; track-space kinematics with heading, lateral velocity, speed, energy. No meshes in state.
- `src/input`: keyboard/gamepad/touch normalized `{throttle,brake,steer,airbrake,boost}`, command callbacks, clear on blur/hidden, listener cleanup.
- `src/camera`: anticipatory chase, damped local up, inspection preset, conservative road clearance.
- `src/race`: eight track-provided ordered checkpoints, lap validation and reset invalidation. Repeatable practice laps for staging.
- `src/effects`, `src/audio`: subordinate state/event presentation; WebAudio engine/hover/wind/boost and contact feedback; failure cannot stop simulation.
- `src/ui`: title/briefing, inspection, HUD, pause/restart, working settings, touch. Semantic buttons/focus, no dead controls.
- `src/progression`: guarded settings/best storage. Replay compatibility after approval.
- `src/content`: declarative staging metadata.
- `src/ai`, `src/pickups`: reserved; no implementation before approval.

## Runtime contracts

Metres/seconds/radians; world +Y up. Ship local +Z forward/+Y up. The legacy `frame.right` API names geometric +X, which appears on the driver’s left when facing +Z; driver-right is `-frame.right`. Input steer +1 always means driver-right and therefore produces negative geometric heading/lateral displacement. Upright right=worldUp×tangent, up=tangent×right; bank rotates about tangent. Staging excludes vertical tangent singularities; production parallel transport with seam correction for wall rides/loops. All consumers share sample(s), wrapping at length with finite difference across seam. Arc lookup avoids parameter-speed variation. Fixed 120 Hz simulation; cap elapsed at .1 s / 12 catch-up steps; clear accumulator on pause or visibility loss. Render interpolates previous/current unwrapped distance and shortest rotation.

Vehicle state `{distance,lateral,speed,lateralSpeed,heading,energy,time,boosting,impact,resetCount}`. Track sample wraps distance. Steering changes relative heading while the magnetic base frame still follows the road tangent; this automatic alignment is explicitly reserved for the Gate 2 user decision. Curvature applies a bounded lateral load; grip drives lateral velocity, airbrake adds rotation/slip, brake lowers speed, boost spends energy. Sweep old/new lateral body limits each step; impact removes speed/energy and reflects lateral motion with cooldown. Magnetic adhesion constrains staging to surface: not free flight. Reset recentres at last checkpoint and invalidates lap. Ordered forward checkpoint crossings; seam only counts after all checkpoints. Production swept hull/triangles, jumps and arbitrary gravity deferred.

Events `{type,tick,time,payload}`: `impact:{severity,side}`, `boost:{active}`, `checkpoint:{index,lapTime}`, `lap:{duration,valid}`, `recover:{penalty}`, `pause:{active}`. Presentation never mutates simulation. Seeded RNG, separate decoration seed. Tick input log with build/track/physics version+seed; production ghosts must reject mismatches.

## Verification API

`window.__VN={ready,version,loadScenario(name,seed),setCamera('chase'|'inspection'|'vista'),getSnapshot(),getMetrics(),getInputLog(),start(),pause(),restart()}` after shader warmup. Scenarios: staging, fast-corner, bank, impact, inspection. Scenario selection sets deterministic initial state, never autopilots. Snapshot includes mode/scenario/seed/settings/vehicle/lap/checkpoint/errors. Metrics: frame p50/p95/p99, long frames >33.3ms, calls/triangles/geometries/textures, browser/GPU. Real control motion verification. Remaining scenarios only with their features.

## Lifecycle, failures, budgets

One owner disposes geometries/materials/textures/audio/listeners/RAF. Immutable track/scenery; dispose via builder or root traversal. Essential WebGL/build errors replace loader with readable reload feedback. Audio/storage failure goes to diagnostics without breaking practice. Context loss pauses with reload. Pause/blur releases inputs and freezes race time.
Target (unverified): Apple M1 Pro integrated GPU, Chrome, 1920×1080, 60 Hz / 16.7 ms. Report actual host and percentiles. High budgets ≤1,000 calls, ≤2M triangles, estimated GPU assets ≤512MiB, initial compressed ≤30MB. DPR cap 1.25 desktop/1 mobile, scalable shadows/resolution. Restrained bloom and contact AO on high; no motion blur. GPU-byte counts explicitly estimates. Later circuits streamed after approval. Physical mobile/gamepad marked unverified if unavailable.

## Implemented first-level geometry

Halcyon is 7,200m with eight ordered checkpoints, eleven contiguous districts, 62° maximum bank, elevations approximately -14..117.6m and ground at -78m. The high crossing provides about 100m separation from the opening straight. Replay instrumentation adds getReplay/playReplay with version/track/physics compatibility checks; reset-containing sessions must restart before capture. Asset source counts are distinct from actually drawn renderer totals. Full first-level budget and runtime observations are recorded in docs/PERFORMANCE.md after verification.

## Gate 2 renderer and physics

Physics schema version2 projects gravity through tangent/right axes, uses explicit stationary magnetic parking hold and yaw-aware swept rail bounds, retains automatic tangent alignment, and smoothly releases boost. Renderer uses original generated cloud-only sky panorama plus analytic solar radiance and its PMREM reflection, warm low key/cool fill, practical track fixtures, restrained GTAO contact occlusion and high-threshold bloom. Renderer owns postprocess resources; low preset omits postprocessing. A single-sample HDR target plus SMAA avoids an observed ANGLE Metal multisample/AO compositing fault. A static city radiance probe generated from the actual scene supplies architectural reflections for the craft, while the world uses the sky probe; this is an approximation, not realtime reflection. An analytic ambient footprint follows sampled road vertices beneath the chassis to supplement sun shadows in city shade; it is a local approximation, not another shadow-casting light. Chase-camera damping acts on relative offset after transporting along the track, so acceleration does not add unintended follow lag. Track exports optional `userData.update(distance)` for reused practical lights; environment may export `userData.update(cameraPosition,time)` for local visibility. All transient review captures are git-ignored .experiments. No new game systems are authorized during Gate 2.
