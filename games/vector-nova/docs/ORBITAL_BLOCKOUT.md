# Asterion Orbital — early human shape gate

Gate 2 is explicitly approved. Latest user direction tables the industrial circuit and makes Gate 3 the orbital circuit above a planet. The user requested bare track first so human art review can grade the route before the full goal-setting and brutal critic loop. **This early checkpoint is now human-approved.** The user authorized full orbital production and the bounded critic loop; current counters are in [status](STATUS.json) and [critique](GATE3_CRITIQUE.md). The measurements below describe the preserved bare checkpoint, before production.

## Play

[Orbital bare-track review](http://127.0.0.1:5180/?level=orbital&review=shape) opens with the whole real track. Use 3D VIEW, TOP or PROFILE to inspect it, DRIVE FULL CIRCUIT to race from the grid, or the section chooser for parked, untimed starts. W/Up throttle; A/D or arrows steer; S/Down brake; Space airbrake; Shift boost; R recover; Escape pause. The ordinary [Halcyon URL](http://127.0.0.1:5180/) remains available.

## Proposed shape

4,500 actual 3D arc metres, 28 m width. An early climbing bank leads into a broad 98° wall ride, then a lower recovery arc, rising crossover, high reversal/overlook, roughly 75° dive and compact docking return. Elevation spans about −21 to 311 m. The tightest final turn has about 65 m radius and invites braking. Nine section starts let the user isolate each feature. All use the existing Kestrel, 0.3 bend assistance and magnetic surface driving.

Neutral road, slab, rails and sparse direction markers are provisional. A simple planet sphere gives orientation and scale. There is no finished planet, shipyard, track engineering, art pass or new game system at this checkpoint. The route source is `src/track/level2/`; the folder denotes the second playable circuit, not the now-tabled industrial concept. No new external assets or dependencies were added.

## Actual verification

- Production build and full lint pass; 60 automated tests pass, including five new geometry/clearance/review tests.
- 42 hidden-browser checks pass across the integrated review build and final real-key wall-ride/braking follow-up. All nine parked starts, overview controls, pause/recovery, mobile-sized layout and Halcyon launch regression were exercised. Zero recorded runtime errors. Final HUD spacing also passed a focused smoke check against `/assets/index-sdiDAEZT.js`.
- Fast numerical full course: 43.192 simulated seconds, zero impacts, minimum chase-camera road clearance 4.77 m. This is a diagnostic controller, not a human driving assessment or realtime replay.
- Short production-browser steering and brake runs used actual keyboard events and sequential stills; no videos or normal-speed full-lap replay. Still evidence was inspected by the integrator, not an independent critic.
- Sampled orbital rendering peaked at 99 calls / 348,494 triangles / approximately 209.3 MiB estimated GPU assets. Hidden Chrome on Apple M1 Pro / ANGLE Metal; these are qualified samples, not foreground certification. Human feel, audio listening and physical controllers/mobile remain unverified.

Raw captures, inputs and reports live in ignored `.experiments/orbital-blockout/`. Preserve this approved shape during production. Final Gate 3 human approval remains a separate checkpoint.
