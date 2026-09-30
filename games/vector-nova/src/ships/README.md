# Kestrel — Concept 01

The human-approved jet-like redesign replaces the broad procedural hull with an
original Blender-authored model. Source and reproducible exporter are in
`assets/ships/kestrel/`; the runtime loads
`public/assets/ships/kestrel/kestrel.glb`. The approved concept is a design
reference, never a runtime billboard or substitute for geometry. Completed
review history is retained in Git (approved integration: `1dfff691`).

`await createShip({plumeExposure})` returns `{group, update, dispose}`. Loading
finishes before the core measures inspection bounds, bakes reflections or warms
shaders. Missing assets or attachment points reject boot through its existing
visible failure path. `createShip({model})` accepts an already parsed glTF scene
for asset tests; it clones owned resources so the caller's scene stays reusable.

Local +Z points forward, +Y points up; y=0 is the hover hardware datum. The core
owns world position/orientation and retains its existing 0.72 m road clearance.
`Exhaust_L` and `Exhaust_R` mark the aft apertures. Both levels use the existing
Orbital emission volume to avoid transparent surface facets around the angular
nozzles. The user's follow-up requests a more powerful blue beam: cruise has a
fuller blue core, while boost widens and lengthens it with restrained compression
variation. Orbital retains its brighter exposure compensation.
`update({speed,boost,steer,time,energy})` accepts
the existing presentation input; rigid integrated suspension does not articulate
separately with steer. Boost animates emission and exhaust below the root only.

`dispose()` is idempotent and releases the instance's geometry, materials and
asset textures. City reflections assigned later are borrowed from the renderer
and are not disposed by the ship. No global model/resource cache is retained.

The development-only `/src/ships/showcase.html` shows the actual loaded game
asset with orbit controls and a neutral studio. `window.__KESTREL.ready` is set
after shader warmup. The main game's inspection mode uses the same asset and
fits its measured envelope, including portrait layouts.

Run `npm test`, `npm run lint` and `npm run build` from this application. With
private dev and production servers running, `node tools/kestrel-verify.mjs`
checks real keyboard throttle/boost/release on Halcyon and Orbital, both quality
presets, portrait inspection and seven studio angles. Set `VN_URL`, `VN_SHIP_URL`
and `VN_EVIDENCE` to override its private review defaults. It starts no servers,
opens no visible windows and records no videos. Temporary stills and reports
remain in ignored `.experiments/`; hidden-browser timings are not foreground
performance certification.

The independent ship review stopped at round 2 with 9/10 in each of its five
scoped categories. The user approved the finished ship on 2026-09-29 and requested
integration into the shared `g/scene-test` branch. Foreground frame rate, physical
devices and audio listening remain unverified.
