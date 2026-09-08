# Coastal exploration — 06 handoff

The native app opens into a compact coastal reclamation site with Kaida a1: arrival quay and tide pump, a repaired timber crossing, a 3 m seawall ascent, an upper ruin, an optional sea overlook and a connected west return. Nine original Blender scenery assets, weathered surfaces, shoreline motion, moving grasses, soft daylight, original procedural shore audio and grounded stone/timber footfalls establish the outdoor scene. No story, combat, progression, interiors or room transitions were added. **Stop at 06.**

Launch [`dist/Chronoforge Dusk.app`](../../dist/Chronoforge%20Dusk.app), or follow [NATIVE.md](../../NATIVE.md). [Authoring guidelines](../../ENVIRONMENTS.md) record the route/camera/collision lessons for future work.

## Play and review

WASD/arrows walk; Shift runs; R returns to the safe arrival; Esc/P opens pause, reset and quit; F2 opens the existing Inspect/Traverse/Rehearse development scene and returns to the coast; F9 writes coastal diagnostics. Normal exploration hides the development UI. The inspection/rehearsal settings remain independent of the coastal camera.

The elevated camera uses **0° yaw**. The route and camera-relative keyboard axes agree; the camera opens gently at the overlook without rotating the movement frame. Native regressions hold only D across the crossing and only W up the ascent, with less than 2 cm of lateral drift. Larger foreground props/arches fade smoothly when they obstruct Kaida.

[Arrival](arrival.png) · [Repair crossing](crossing.png) · [Upper ruin](upper-ruin.png) · [Sea overlook](overlook.png) · [Foreground treatment](foreground.png) · [Native motion](coastal-traversal.webp).

## Exact content

Kaida a1 maps normal movement (`walk`) to the supplied **Running.fbx**, and Shift-run (`run`) to **Fast Run.fbx**. Speeds remain **2.99 m/s** and **6.63 m/s**. Source cycle speeds are 5.01623 and 6.48387 m/s; playback follows controller travel. Sword carry is retained. Current model SHA-256: `d772a516d6114c99dce66e90e84bb216042927e2f8cce7be6bd0ead4ca425136`; sword: `3dc29eb1cd115158bc841cba8412754b5040aeb6c7c3cef20fc0af2246f2bbea`.

The focused check passes **16 native assertions and 6 cold-start assertions**, with no external input. Measured one-second travel is 2.99 m and 6.63 m. Left-hand sweeps measure 60.2 cm and 68.4 cm; maximum sword-hand steps are 2.64 cm and 4.17 cm at 60 Hz. Export checks confirm unchanged geometry, weights, textures, idle, attack and hurt data. Both new in-place clips close with identical first/last poses.

[Normal movement](locomotion-walk.png) and [Shift-run](locomotion-run.png) captures use the actual coastal camera. Normal native launch confirms the same model and tested runtime source SHA-256: `be0145f11ac317666c7d5fa929a1ab55671a9c99c075d790224e0b0cc447381a`. Movement feel remains for owner review. The full-route/rendering results below record the environment baseline before these clip replacements.

Full-route/rendering source SHA-256:

```text
c0ccce620f453c49f925fc814c3dea4b5979fdd13664e1f3bc480ebae7217ca1
```

The kit selects seawall, arch, bollard, supplies, rocks, grass, tower and pump r1; repair bridge r2. Original/editable Blender sources and packed texture maps are under `_prep/assets/coast.*`; production scripts are under [`_prep/assets/coast`](../../_prep/assets/coast/README.md). Original audio sources and provenance are under [`_prep/audio`](../../_prep/audio/README.md).

Every new mesh used the existing `static_blend` recipe, including Blender export/reimport, texture pixel/inventory checks and runtime hash validation. The runtime uses `DuskAssetAssembly`, then shared imported meshes/batches; simple collision stays game-owned. No importer, pipeline framework, hosted credits or service downloads were added.

The repair bridge uses a visible timber deck, bolted salvage rails and masonry supports. Remove blockout paving that covers the imported deck and align collision with its walking surface.

Only existing Dusk components and the current Kaida handoff were reused. Original Chronoforge Haventide imagery was viewed for color/material reference. No original-game, Dawn or prototype production code, models, textures, rigs or audio were copied.

## Checks actually performed

| Check | Result |
| --- | --- |
| Exported environment / cold restart | 43 + 6 passed, fresh matching run ID, no external input |
| Existing Kaida gameplay / cold restart | 61 + 6 passed, fresh matching run ID |
| Original source preparation tests | 23 passed |
| Native report integrity helper | 4 passed |
| Nine selected static packages | Export/reimport + verify passed |
| Native motion capture | Continuous running route with mapped input; see [capture](coastal-traversal.webp) |

The route suite walks the entire connected route and runs it in reverse, including the side space, slopes/seams, corners, boundary pushing, return and reset. It checks ordinary cold startup before resetting, foot grounding, accepted movement values, full landmark framing, foreground fading, footsteps, pause/inactive handling, and a real scene round trip through the existing inspection/traversal/rehearsal tools. The route recorded zero consecutive airborne physics frames and a minimum world height of −1.15 mm, within ground-contact tolerance.

The full-route input is automated `Input.parse_input_event` using physical WASD/Shift through the actual game mappings and controller; it does not teleport between route points. Direct OS UI checks additionally exercised cold native launch, Escape pause, mouse Resume/Quit, F2 into rehearsal, Space strike and return to coast. The owner walked an earlier build and supplied the axis-alignment feedback. The final full route has **not** had a separate owner/manual held-key playthrough; the OS automation's instantaneous movement key taps did not establish sustained walking. Owner review of final movement feel, visuals and audible mix remains separate from engineering verification.

The motion artifact was captured at source `2b0ddd704fd98ec58d2d71be65ed70fe13906394a6e348947310c468876c01b2`. The subsequent change corrected foreground sight lines for the orthographic camera; route, assets, movement and framing are the same. The stills and route report use the final source above.

Automated runs show an explicit banner/window title and retain interference state across the development round trip. External key or mouse input invalidates the result.

No accepted tuning file was present in this test account; it remained absent, and factory movement settings were reproduced on cold restart. The coastal scene contains no acceptance-file write path. The separate Kaida gate uses its isolated test save to verify full saved-tuning restoration. This distinguishes the exercised case from a pre-existing nondefault owner save.

## Native performance

Godot 4.6.3, Forward+ / Metal, Apple M1 Pro, 1920×1080 internal rendering, 2× MSAA, 60 FPS active cap. These are warmed desktop frame intervals from the actual exported app, including pacing. No concurrent editor/Blender/motion encoder ran during the final measurement. Each interval retains at most the latest 600 frames; a long route's label does not imply every earlier frame is retained.

| Interval | Samples | Mean ms | p95 ms | p99 ms | Max ms | >33.34 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Arrival stationary | 599 | 16.66 | 19.29 | 20.65 | 25.65 | 0 |
| Main walk segment | 600 | 16.67 | 18.67 | 19.70 | 21.30 | 0 |
| Ascent / upper route | 600 | 16.67 | 19.41 | 20.47 | 23.15 | 0 |
| Reverse running route | 600 | 16.67 | 19.36 | 20.52 | 21.43 | 0 |
| Boundary / corner movement | 600 | 16.67 | 18.75 | 21.74 | 42.12 | 1 |
| Paused | 120 | 33.33 | 35.24 | 36.54 | 41.15 | 62 |
| Inactive handler | 30 | 99.94 | 101.16 | 101.31 | 101.76 | 30 |

Representative movement/stationary interval endpoints report **142–206 draw calls**, **62,736–82,264 rendered primitives**, and **319.50 MiB video memory**. These are Godot's per-frame counters, not the sum of source mesh triangles or process RSS; the imported meshes use Godot's LODs. `engine_process_ms` snapshots range from about **5.21 to 7.99 ms** across those intervals; this monitor is not a full CPU profile. GPU frame time was unavailable and is not inferred from FPS.

One boundary interval contained a 42.12 ms frame; it is retained in the report rather than discarded. Pause caps rendering at 30 FPS and the inactive handler at 10 FPS, so their >33 ms counts are expected. Simulation, water/grass time and footfalls are paused with the scene. Focus-handler checks are simulated in the suite; separate OS background/foreground pacing is unverified. Capture/readback intervals and the dedicated motion run are excluded from normal-play measurements. The evidence supports the measured capped run, not a guarantee of locked 60 FPS on all hardware or sessions.

## Remaining review boundary

- This is a compact outdoor exploration foundation. No rooms/enter-exit prototype, combat, story gating, progression, additional actors or 07 systems were added.
- Kaida keeps a1's accepted alpha limitations in proportions, detailed grip and animation polish. Foreground fading protects visibility; it does not replace a future animation/IK pass for individual stair treads.
- Scenery is an original small repeated kit with baked/procedural wear; it does not claim unique scanned materials or final commercial art acceptance. Audio is synthesized, with subjective mix quality still for owner review.
- The app is a local ad-hoc signed universal bundle. Apple Silicon execution was exercised; Intel execution and distribution signing/notarization were not.

Raw reports and logs stay local under the [evidence policy](../README.md); prior committed reports are in Git history. 06 ends at owner review of the app and authoring guidelines.
