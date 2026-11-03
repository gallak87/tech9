# Ravel — the heliopause loom

A closed 13.5 km circuit using Shatterline’s faster, level-owned pace profile. The course races across an anchored solar-sail installation: physically drivable membrane terrain, traveling swells, interwoven routes and ballistic transfers. It is available in the development course picker; existing championships and the packaged release list stay unchanged.

The 100 m connecting sails expand into three asymmetric, continuously supported basins. The first spans roughly 880 m in the world, with a low open left side and a right wall curling 463 m above its floor. Transverse coordinates measure real membrane arc distance; changing surface width never substitutes decorative shells for support. The main route has four full corkscrews, steep supported vertical sweeps, six mandatory jumps and a giant Sundiver transfer. All paths share ordered progress checkpoints; each ribbon pays its own actual world distance through the sampled surface metric.

The braided district tears into a short inner sail, a middle line with moving swells and a longer high outer sail. The inner and outer routes grow broad, physically drivable outboard wings that curl past vertical; their original racing lines remain unchanged. The inner wing narrows smoothly through its tight return before reopening. The outer route has a sustained 600 m Vector strip and a real gap onto the shared receiving apron. Separate heights allow the ribbons to cross.

Six-metre traveling swells deform the actual sampled road. Magnetic craft follow the membrane; the reinforced left seam stays comparatively steady. In the first bay, the right crest lane has a real cut and the left lane remains supported. Every craft crossing that cut launches. Wave slope and material velocity determine the result; wave phase never creates invisible support. The rigid receiving shelf stays still.

Each racer owns its simulation clock. Rendering uses the same analytic displacement and deformed normals on the GPU, with the player’s interpolated simulation time. Native per-chunk batched culling avoids drawing the entire circuit in every view; the chase camera preserves the selected sail coordinate through look-ahead and banking. Static collision excludes live bays, so a frozen mesh cannot override their moving support. The sail terrain has open edges: leaving a ribbon drops the ship and normal Practice applies timed recovery.

## Playtest

Run Vite from this checkout, then select Ravel in Practice or Quick Race.

- Open `?level=ravel` through the current frontend and start Practice. Pause, choose **Test section**, then **Drive selected section** to repeat a feature directly.
- Cases include the steady seam, favourable/adverse crest phases, supported bypass, all three ribbons, the outer transfer and giant-jump approach/launch/short/landing.
- W/arrows drive, Shift boosts, Space airbrakes, R recovers, F opens free camera. Section practice uses ordinary timed recovery. The retained automation-only `test=jump` lab disables automatic recovery and R repeats its case.
- Keyboard/controller use the existing shared controls and native pause-menu section selector.

Validation: `npm run check:level -- ravel`, the `tools/ravel-*.test.mjs` suites, and `VN_URL=<server> npm run verify:level -- ravel`. The driving suites include actual Rapier flight/landing, wave phase, replay, wall support and branch traversal checks.

## Environment layers

The supported lower sails establish the large forms first. Unmarked upper collector sails overlap at the sides with reserved route and flight clearance. The Blender anchor fleet supplies formed ceramic hulls, open working bays, bridge glazing, radiators, recessed nozzles and named cable sockets. Taut stays connect those sockets to the real sail edges. Public Worldkit industrial assemblies add winding drums, bearings, motors, service galleries and attached load hardware; the consuming level owns placement and clearance.

Long bonded foil strips, irregular tension creases and fitted racing seams share the membrane coordinates. Traveling displacement and smooth deformed normals run on the GPU; the CPU support equation remains the authority. Warm stellar key light, cool reflected sky and a deterministic star field define the heliopause setting. The same world and navigation cues remain in High and Low.

Editable fleet sources and exact reference prompts are retained in `assets/levels/ravel/`; runtime assets and canonical Worldkit finish provenance are registered in `docs/ASSET_MANIFEST.json`.
