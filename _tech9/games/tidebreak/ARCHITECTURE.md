# Tidebreak architecture

One Three.js renderer, one frame loop, one camera owner. Metres, +Y up, water at y=0. Each game file and asset is locally owned; runtime imports never leave this game.

- `src/main.js` composes layers and transitions. `SceneApp` owns renderer, sky, light, settings, frame timing and resource lifecycle. Boat/rules update before boat visuals and the HUD; the camera follows with a damped single-frame lag.
- `src/world/islandDefinition.js` owns the coast function, terrain height, finite navigation bounds, rock/dock placements, start, gates and mooring zone. Rendering and collision queries consume those same definitions. All vegetation lies inward of the dry coast. The boat footprint conservatively covers its 5.6 m length.
- `src/game/BoatSimulation.js` is a pure 120 Hz planar simulation: forward thrust, braking/reverse, drag, lateral damping and speed-dependent steering. Swept substeps against coast/rock/dock/boundary predicates retain a free component for glancing contact. No render state or input ownership.
- `src/game/LapRules.js` owns start/running/pause/result, ordered directed segment crossings, the clock, docking hold and session best. Actual planar speed, including reverse and sideways slip, determines safe docking.
- `src/game/BoatInput.js` owns held keyboard state. Blur, hidden page, pointer release, pause and reset clear held inputs. It does not move the camera or boat.
- `src/camera/ChaseCamera.js` is the sole camera owner. It damps behind the hull, looks slightly toward the coast and lifts above terrain.
- `src/world/IslandWorld.js` owns island mesh, local source forest instances, rocks, lighthouse, dock, buoys and mooring ring. Authoritative obstacle placements are imported rather than repeated.
- `src/world/OceanLayer.js` uses the unchanged copied `pond-water/WaterSurface.js` reflection engine. It substitutes a finite plane with an island hole for the pond's filled shoreline and replaces inward pond sediment shading with an outward ocean shelf. It owns mesh, normals and geometry; `Water` owns reflection target/material. Balanced/High/Ultra retain 1024/1536/2048 targets and 3/2/2 reflection cadence. There is no extra renderer, frame loop or shadow pass owner.
- `src/world/BoatView.js` owns the authored hull, fittings, seated pilot, heave/roll/trim and bounded world-space wake/spray. Effects cannot alter motion or route state.
- `src/ui/TidebreakUI.js` owns presentation and the chart, displaying state and invoking explicit actions. Graphics settings keep the `tidebreak.settings` namespace.

The promoted water assumes a flat mirror and previously shaded shallows toward the outside of a pond. An ocean consumer needs the opposite land/water topology, a much farther camera horizon, explicit coastal depth tinting and a boat wake separate from the reflection layer. Those changes stay game-owned. The inherited walking and pond example implementations remain available to their copied CPU contract tests; the Tidebreak production bundle does not import them.

Read-only snapshots exist only under `?test=1`. CPU tests exercise physical motion, shared coast/collision contracts, route transitions and inherited reflection cleanup. The serialized browser lane drives the full game through keyboard/button events against a committed production build. Local performance/capture/review evidence is ignored, never source history.
