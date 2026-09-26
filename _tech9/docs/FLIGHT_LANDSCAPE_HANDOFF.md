# Aircraft and landscape framework handoff

A follow-up baseline integration is paused at the user’s request. See the [current checkpoint](./FLIGHT_LANDSCAPE_CHECKPOINT.md) for uncompleted work and current validation. The extraction results below describe the previously completed iteration; they do not validate the follow-up changes.

Framework-dev extraction is complete on `codex/forest-flight`, using the current `g/scene-test` workflow and accepted weather work. The branch is intentionally unmerged for user review. Original Forest Flight source, airport layout, markers and game rules remain game-owned.

## Reusable capabilities

| Module              | Delivered capability                                                                                                                                              | Integration                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| aircraft 1.0.0      | Trainer and sport models, presets, cockpit/exterior animation, rolled cockpit poses, keyboard controls and material targets                                       | [Guide and example](../modules/aircraft/README.md)    |
| landscape 1.0.0     | Baseline forest kit/materials, editable assets and licenses, terrain/query defaults, bounded traveling vegetation detail and atmosphere helper                    | [Guide and example](../modules/landscape/README.md)   |
| flight-motion 2.0.0 | Canonical body-axis attitude, optional stabilization, full rolls/inverted handling and temporary recovery; existing fixed ticks and contact observations retained | [Motion contract](../modules/flight-motion/README.md) |
| weather 1.1.0       | Existing weather extended to Lambert vegetation and upright pine cards, shared wind applied once, prefiltered snow-mask atlas and preserved shader ownership      | [Weather contract](../modules/weather/README.md)      |

No follow-camera or placement-collisions changes were needed. Aircraft uses the existing mounted-camera contract; landscape supplies terrain and conservative tree queries. The terrain-relative atmosphere helper stays with landscape. Weather's selected baseline copy and provenance are synchronized. Runtime assets have bundler-visible URLs; editable forest sources and original licenses travel with the module.

Consumers copy the selected module folders and dependencies, own the renderer/frame loop/environment, and decide contact outcomes. Dispose weather before participating aircraft/landscape materials. The two module guides include concise wiring examples and resource ownership details.

## Review locally

From `_tech9`:

```sh
./run exec -- vite --host 127.0.0.1 --strictPort --port 4500
```

Open `/modules/aircraft/examples/` for trainer/sport flight and cockpit/chase views. Open `/modules/landscape/examples/` for ground, low-flight and high-altitude starts, region jumps and clear/rain/winter controls. Shift accelerates landscape travel; no full flight circuit is needed. Observation/setup hooks require `?test=1`.

## Validation

- Final `./run run check`: **112 tests passed**, lint/formatting, module builds and registry validation passed.
- Built examples resolved their GLB/texture assets and ran without browser, request or shader errors. Real keyboard input covered trainer flight, animation, pause/camera switching, a sport roll exceeding one revolution, inverted cockpit/pitch response and upright recovery.
- Ground/low/high views and rain/winter transitions were captured and reviewed. Repeated region travel settled at **26 geometries / 31 textures / fixed 358,066 instance capacity**. Repeated aircraft replacements also settled without growth.
- Repeated landscape/weather activation on translated rectangular bounds used **23 geometries / 31 textures / 26 programs** each time. Disposal returned exactly to the example environment's **2 geometries / 6 textures / 5 programs**.
- Baseline build and all **13 focused weather browser regression checks** passed: presets, material persistence, shared wind, real UI inputs, sound/mute, cover, focus changes and bounded reset lifecycle. The final audit added early rejection of invalid snow-mask targets; supported shader behavior is unchanged.
- Final source audit resolved asset URL/lifecycle ownership, rectangular field mapping, deterministic detail seeding, distant snow filtering, terrain-margin weather coverage, invalid mask targets and guide/example consistency.

Browser measurements: Chromium **151.0.7922.34**, Apple M1 Pro / Metal, **1440×900**, High settings, **4× MSAA**, 3072 shadow maps. Short samples measured approximately **18 ms clear ground**, **11.7 ms low flight**, **8.3 ms high altitude**, **25.4 ms winter ground** and **23.9 ms rainy ground**. These include headless browser scheduling and are not performance guarantees.

Local evidence and validation scripts remain in `.artifacts/flight-landscape/`; baseline regression evidence is in `baseline/.artifacts/weather-verification/`. Validation browsers/servers are stopped. Task coordination files have been removed.

## Material limits

Terrain is finite; analytic heights approximate the rendered 10 m terrain grid. Tree collision, canopy exposure and the kilometre-scale weather field are proxies, not triangle/branch collision. Distant cards retain baked daylight lighting and approximate seasonal matching. Snow uses thin ground lift and static vegetation shadows. Flight remains approachable arcade handling, without aerodynamic or weather wind-force simulation. These are documented constraints of the extracted, proven behavior.
