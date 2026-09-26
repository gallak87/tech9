# Flight / landscape extraction checkpoint

Stopped at the user's request. Implementation is committed through `e96a9d66` on `codex/forest-flight`; the branch remains unmerged into `g/scene-test`. Current framework-dev instructions and accepted weather work were incorporated from that branch.

## Delivered

- **aircraft 1.0.0:** both editable trainer/sport models, handling presets, cockpit poses, propeller/control-surface/instrument bindings, weather targets and keyboard controls. Optional assistance, full sport rolls/inversion and temporary upright recovery use canonical **flight-motion 2.0.0**.
- **landscape 1.0.0:** baseline forest assets and editable sources/licenses, terrain materials, deterministic layout/queries, finite canopy and fixed 7×7 traveling detail pools. Defaults and translated/rectangular bounds are supported. Clear/rain/winter examples provide ground, low and high viewpoints plus fast travel.
- **weather 1.1.0:** composable Lambert grass and upright pine-card support. A fixed prefiltered snow-mask atlas preserves distant coverage. Shared wind is applied once; original Standard/Physical behavior is retained. Selected baseline copies and provenance are synced.
- Existing follow-camera supports inverted cockpit poses without modification. Collision queries and terrain-relative atmosphere stay within landscape. Airport layout, markers, game rules and the original game remain game-owned.

Integration and lifecycle guides: [aircraft](../modules/aircraft/README.md), [landscape](../modules/landscape/README.md), [flight-motion](../modules/flight-motion/README.md), [weather](../modules/weather/README.md).

## Validation completed

- Full `./run run check`: **111 tests passed**, lint/formatting, module builds and registry validation passed after the final implementation changes.
- Both examples built successfully with resolved GLB/texture assets and ran in Chromium 151, Apple M1 Pro / Metal, 1440×900, High settings, 4× MSAA and 3072 shadows. No browser/request/shader errors.
- Real keyboard controls validated trainer flight, animation, cockpit/chase, pause, sport roll (8.37 radians), inverted cockpit/pitch response and upright recovery.
- Ground/low/high clear views plus winter/rain were captured and reviewed. Repeated region travel settled at 26 geometries / 31 textures / fixed 358,066 instance capacity. Repeated aircraft replacements also settled without growth.
- Repeated landscape/weather activation on relocated rectangular bounds passed: both activations used 23 geometries / 31 textures / 26 programs; disposal returned exactly to 2 geometries / 6 textures / 5 programs owned by the example environment. No errors. This last check completed before the stopping request was handled.
- Baseline build and all **13 focused weather browser regression checks** passed, including presets, shared wind, material persistence, real inputs, sound/mute, cover, focus changes and bounded reset lifecycle.
- Local evidence and validation scripts are in `.artifacts/flight-landscape/`; baseline regression evidence is in `baseline/.artifacts/weather-verification/`. Preview servers and validation browsers have stopped.

Short uncontrolled frame samples were approximately 18 ms clear ground, 11.7 ms low flight, 8.3 ms high altitude, 25.4 ms winter ground and 23.9 ms rainy ground. These include headless browser scheduling and are not performance guarantees.

## Remaining handoff work

Implementation and focused integration validation are complete. Before declaring the framework task fully closed, perform the final documentation/source audit, replace this checkpoint with the final concise extraction handoff, and remove only the completed `runs/flight-landscape-extraction/` coordination folder. No further full flight circuit is needed. Keep the branch unmerged for user review.

Material limits: finite terrain; approximate tree collision/canopy/weather fields; baked daylight lighting for distant cards; approximate seasonal matching at distance; arcade flight rather than aerodynamic or wind-force simulation. Terrain snow is thin and vegetation shadows retain the original static pose. These limits are documented with the modules.

To review examples later, from `_tech9` run `./run exec -- vite --host 127.0.0.1 --strictPort --port 4500`, then open `/modules/aircraft/examples/` or `/modules/landscape/examples/`.
