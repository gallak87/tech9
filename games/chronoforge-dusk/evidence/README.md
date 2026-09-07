# Native foundation evidence — 2026-09-06

Plan 01 is implemented. Final runtime source is checkpoint `1aeb3ef`, following the foundation checkpoint `6509b34`. The tested bundle identifies its pre-commit source as `6509b345dce4+dirty`; its exact source digest is `7ef2cce1c41356d39e0ff9376046f83deaf24775d9af1a3f32cafc191320be72`, matching the runtime committed in `1aeb3ef`. Documentation changes after that checkpoint do not change the tested runtime.

## What was exercised

- **Standalone release app:** 46/46 integration checks passed in 46.3 seconds. See [native-integration.json](native-integration.json) and [full native log](native-validation.log).
- **Cold process restart:** 4/4 checks restored the selected clay revision, walk speed 2.8 m/s, camera yaw 60°, and contact fraction 0.55. See [native-restart.json](native-restart.json).
- The checks exercise the actual Godot input handlers, CharacterBody3D, imported AnimationPlayer, action component and disk save. Movement, Shift running, boundaries, camera-relative turning, ramp contact, pause/step, repeated strike rejection, exactly one impact per completed action, exact formation return, malformed descriptors, missing clips/sockets, hash mismatch, 16 candidate swaps, node/resource cleanup, six instances, and deliberate F6/F7 save/restore passed.
- Earlier editor-binary game-window checks passed 41/41 before the final validation refinements; [editor-integration.json](editor-integration.json) is that earlier baseline, not a second final-build benchmark.
- The owner also manually moved the debug actor and toggled lighting, supplying two screenshots. They reported the grid appeared to accelerate and coast. The camera now settles faster with a small-distance snap, and the grid uses one antialiased surface instead of thin overlapping geometry. The final automated settling check passed. Owner acceptance of the updated movement feel remains a later playtest judgment.
- Rendered native viewport captures were inspected: [inspect](native-inspect.png), [traverse](native-traverse.png), [rehearse](native-rehearse.png). These verify the labeled rigid mannequin, attached baton, distinct harmless target and working development UI. They do not establish Kaida quality.

## Build and performance observations

Machine: MacBook Pro18,1, Apple M1 Pro (10 CPU / 16 GPU cores), 16 GB unified memory, macOS 26.4.1. Godot `4.6.3.stable.official.7d41c59c4`, native Forward+ / Metal, standard Universal 2 release template, ad-hoc signature verified with `codesign --verify --deep --strict`. Local app size: 177.2 MiB. The final app was launched without the editor.

Internal viewport: 1920×1080. Final test window: 1440×810 pixels; reported display scale: 2.0. Active cap: 60 FPS. The roughly 46-second test includes explicit warmup and separate intervals; the table reports wall-clock pacing, not an uncapped GPU benchmark.

| Recorded interval | Samples | Median ms | p95 ms | Max ms | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Neutral idle | 308 | 16.67 | 18.90 | 87.42 | 78 |
| Continuous traversal | 399 | 16.68 | 22.88 | 26.55 | 92 |
| Repeated strikes after pause | 580 | 16.67 | 19.18 | 101.27 | 105 |
| Paused development view | 97 | 33.33 | 34.20 | 36.02 | 78 |
| Six visible instances | 300 | 16.67 | 19.14 | 25.75 | 111 |
| Simulated inactive window | 30 | 99.97 | 102.06 | 102.86 | 92 |

Active medians were about 16.7 ms; p95 exceeded the 16.7 ms target in these short runs, so this is **not a claim of locked 60 FPS**. The snapshot/readback boundaries contribute large spikes (roughly 87–101 ms); ordinary continuous traversal peaked around 27 ms. The full JSON retains the separate reload and transition intervals instead of averaging those away. Video memory was approximately 157 MiB in the final run, including render buffers; six visible instances used 111 draws / 6,248 primitives. Node and resource counts did not accumulate across the 16 swaps.

The final app reported 735 ms of engine uptime to scene readiness, of which 32 ms was scene assembly; a fresh restart reported 545 ms / 26 ms. These are engine-reported readiness times, not stopwatch measurements from a Finder double-click. Initial shader/readback/transition stalls remain distinct from warmed traversal.

GPU timestamps and a representative OS CPU/resident-memory trace were not collected. The JSON's `engine_process_ms` is Godot's process monitor, including scheduling effects; it should not be interpreted as isolated gameplay CPU cost. Real minimize/restore notification delivery and Intel execution were not verified. Focus/inactive behavior was tested by calling the actual game focus handler; OS focus callbacks are bypassed only in the opt-in scripted test mode. Computer Use was unavailable, so native controls were exercised through Godot input events, supplemented by the owner's manual debug-window play.

## Limitations and handoff

Every model, motion, target and environment shape here is an original diagnostic placeholder. No original Chronoforge, prototype or Dawn code/production assets were copied. The only external download was the official pinned Godot export template. The fixture generator uses Python 3.14.5, standard library only; Blender is not part of this fixture proof.

The runtime contract is concrete for embedded GLB clips and attachments. Skeletal deformation, production texture/material quality, separate clip libraries and real Kaida are not demonstrated. There are no ATB rules, inventory, quests or settlement systems. Plan 02 has not been started.

Use [NATIVE.md](../NATIVE.md) for editor/debug/app launch, pinned export commands, controls and saves; use [ASSET_CONTRACT.md](../_prep/ASSET_CONTRACT.md) for 02's delivery paths and complete example.
