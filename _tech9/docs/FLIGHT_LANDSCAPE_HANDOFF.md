# Aircraft and landscape framework handoff

Framework-dev extraction and baseline integration are complete on `codex/forest-flight`, using the current `g/scene-test` workflow and accepted weather work. The user authorized local merge after the focused integration checks. Original Forest Flight source, airport layout, markers and game rules remain game-owned.

## Reusable capabilities

| Module              | Delivered capability                                                                                                                                              | Integration                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| aircraft 1.0.0      | Trainer and sport models, presets, cockpit/exterior animation, rolled cockpit poses, keyboard controls and material targets                                       | [Guide and example](../modules/aircraft/README.md)    |
| landscape 1.1.0     | Forest kit/materials, authored scene rendering, terrain/query defaults, bounded traveling detail, editable assets/licenses and atmosphere helper                  | [Guide and example](../modules/landscape/README.md)   |
| flight-motion 2.0.0 | Canonical body-axis attitude, optional stabilization, full rolls/inverted handling and temporary recovery; existing fixed ticks and contact observations retained | [Motion contract](../modules/flight-motion/README.md) |
| weather 1.1.0       | Existing weather extended to Lambert vegetation and upright pine cards, shared wind applied once, prefiltered snow-mask atlas and preserved shader ownership      | [Weather contract](../modules/weather/README.md)      |

No follow-camera or placement-collisions changes were needed. Aircraft uses the existing mounted-camera contract; landscape supplies terrain and conservative tree queries. The terrain-relative atmosphere helper stays with landscape. Weather's selected baseline copy and provenance are synchronized. Runtime assets have bundler-visible URLs; editable forest sources and original licenses travel with the module.

Baseline **1.4.0** selects landscape through `tech9.modules` and the existing source-copy/provenance workflow. `ForestWorld.js` is a thin adapter; `forestComposition.js` retains the original terrain, tree/rock/deadfall placement and collision rules. Canonical landscape owns the kit, texture loading, material preparation, floor shaders, rendering and resource cleanup. The retired baseline assets and core atmosphere/shadow helpers were removed after successful runtime checks. There is one maintained implementation of these shared assets/helpers, plus the intentional synchronized module copy.

`createComposedLandscape` preserves the baseline's fixed 160 m forest and 256-segment terrain grid; `createLandscape` supplies the larger traveling-detail policy. They share asset/material helpers and have separate concise examples in the landscape guide. The baseline retains its scene atmosphere configuration, weather surface/cover queries and controls. Airport placement, markers and game rules remain in Forest Flight.

Consumers copy the selected module folders and dependencies, own the renderer/frame loop/environment, and decide contact outcomes. Dispose weather before participating aircraft/landscape materials. The two module guides include concise wiring examples and resource ownership details.

## Review locally

From `_tech9`:

```sh
./run exec -- vite --host 127.0.0.1 --strictPort --port 4500
```

Open `/modules/aircraft/examples/` for trainer/sport flight and cockpit/chase views. Open `/modules/landscape/examples/` for ground, low-flight and high-altitude starts, region jumps and clear/rain/winter controls. Shift accelerates landscape travel; no full flight circuit is needed. Observation/setup hooks require `?test=1`.

## Validation

- Final `./run run check`: **116 tests passed**, lint/formatting, module builds and registry validation passed.
- The completed extraction verified both aircraft models: built examples resolved their GLB/texture assets and ran without browser, request or shader errors. Real keyboard input covered trainer flight, animation, pause/camera switching, a sport roll exceeding one revolution, inverted cockpit/pitch response and upright recovery.
- Ground/low/high views and rain/winter transitions were captured and reviewed. Repeated region travel settled at **26 geometries / 31 textures / fixed 358,066 instance capacity**. Repeated aircraft replacements also settled without growth.
- Repeated landscape/weather activation on translated rectangular bounds used **23 geometries / 31 textures / 26 programs** each time. Disposal returned exactly to the example environment's **2 geometries / 6 textures / 5 programs**.
- Baseline integration: **21 CPU tests**, lint and production build passed; **10 rendering/control checks, 8 walking checks and 13 weather checks** passed. The 10 rendering checks passed again after retiring the duplicate files, proving the built package resolves the canonical assets. Weather covers presets, persistence, shared wind, UI/sound, shelter, focus changes and bounded reset lifecycle.
- Four composed-landscape tests cover authored transforms/terrain, density configuration, borrowed asset ownership, cancellation during kit/maps loading and cleanup after a failed texture load. Zero richness now correctly hides density-controlled batches.
- After shared-helper consolidation, the large-landscape example again passed ground/low/high views, clear/rain/winter, real movement and repeated region jumps without browser, request or shader errors. Travel settled at **26 geometries / 31 textures / fixed 358,066 instance capacity**. Repeated activation/disposal again returned to **2 geometries / 6 textures / 5 programs**. Module synchronization matches all **64 selected files** and provenance.
- Final source audit resolved asset URL/lifecycle ownership, rectangular field mapping, deterministic detail seeding, distant snow filtering, terrain-margin weather coverage, invalid mask targets and guide/example consistency.

Browser verification used Chromium **151.0.7922.34**, Apple M1 Pro / Metal, High settings and **4× MSAA**. The final baseline sample at **1600×1000** averaged approximately **21.2 ms**; the large-landscape ground sample at **1440×900** averaged **19.1 ms**. These are short headless requestAnimationFrame measurements including browser scheduling, not performance guarantees. Vite retains its existing large-chunk warning.

Local evidence is in `baseline/.artifacts/verification/`, `baseline/.artifacts/walking-verification/`, `baseline/.artifacts/weather-verification/` and `.artifacts/flight-landscape/baseline-integration/`; the latest large-world disposal report is `.artifacts/flight-landscape/lifecycle.json`. Validation browsers/servers are stopped. No extra art/critic rounds or new prototype were introduced.

## Material limits

Terrain is finite. The large-world policy approximates analytic heights on a 10 m mesh; the authored policy uses the caller’s selected grid and fixed instance batches, without traveling detail. Tree collision, canopy exposure and the kilometre-scale weather field are proxies, not triangle/branch collision. Distant cards retain baked daylight lighting and approximate seasonal matching. Snow uses thin ground lift and static vegetation shadows. Flight remains approachable arcade handling, without aerodynamic or weather wind-force simulation. These are documented constraints of the extracted, proven behavior.
