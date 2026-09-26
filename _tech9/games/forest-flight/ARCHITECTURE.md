# Forest Flight architecture

One metre is one world unit, +Y is up, and heading zero faces −Z. Positive heading and bank turn right. The game owns its copied code, assets and package dependencies.

- `src/main.js` supplies the flight valley definition and registers the world and gameplay controller.
- `src/core/SceneApp.js` owns the Three.js renderer, sky, lights, settings, single frame loop and layer lifecycle. The flight renderer uses direct MSAA rendering and a long camera range.
- `src/flight/FlightSimulation.js` owns aircraft state and substepped movement, throttle/drag, speed-dependent control and lift, coordinated banking, stall response and terrain contact. The two aircraft profiles drive distinct handling. Game rules track optional markers, landing completion, valley bounds and crash recovery.
- `src/flight/FlightInput.js` maps keyboard state to normalized control intent and releases listeners/held input on cleanup. Focus loss requests pause.
- `src/flight/FlightGame.js` owns session UI, state transitions, aircraft selection, audio, camera integration and one visual aircraft. It supplies the active controller to SceneApp, advances simulation before camera tracking and disposes its listeners/resources.
- `src/flight/FlightWorld.js` owns the graded height query, clear runway and approach corridors, airfield content, instanced forest, spatially indexed tree/hangar proxies and optional landmark rings. The same height/placement data drives visuals and collision queries.
- `src/flight/AircraftVisual.js` authors both meshes and cockpit panels, animates propellers and control surfaces, and releases unique geometry/material resources. The caller owns its world transform.
- `src/flight/FlightAudio.js` owns a local Web Audio engine tone. It starts on a user gesture, follows throttle, silences on pause and closes its context on disposal.
- `src/modules/follow-camera` supplies copied chase and mounted camera behavior. The game provides world-space target/pose data.

Assets load locally. Airfield terrain, aircraft and textures are authored in code; `art/` preserves the baseline forest kit sources. Baseline world/controller sources remain available as owned reference code; the running game selects only the flight world.

`?test=1` exposes read-only state snapshots and lifecycle disposal plus one rare collision setup. Success-path browser checks use normal keyboard controls from initial runway spawn through a complete circuit and landing. Tests cover simulation, pause/focus input clearing, terrain/approach clearance and inherited renderer lifecycle contracts.
