# Pipeline quality sweep — 2026-09-07

Reviewed the plan 02 producer, Mixamo preparation/clip tools, Blender export checks, native character probe, and immediate game asset/controller handoff after baseline commit `3cc317a`. Kaida r4 and sword r2 remain unchanged. No animation polish or plan 03 gameplay work was added.

Fixed four concrete reliability issues:

- Build/preparation timeouts and validation failures discarded temporary logs. Both entry points now share failure retention, keeping metadata and partial outputs with an actionable error path. Existing candidates are rejected before tool startup.
- The GLB checker accepted an armature without its declared motion-root bone and silently truncated mismatched joint/weight arrays with `zip`. It now checks the root's skin hierarchy, inverse-bind matrix count/type, per-vertex array counts/encoding, and binary accessor bounds. Decoded accessors are reused.
- Blender inspection ignored `fps_base`, understating durations for fractional frame rates. It now uses the effective scene rate.
- The character probe could overwrite evidence or report fewer successful checks in headless mode. It now requires a native window and fresh output directory, checks directory/report writes, and stops if the second character fails assembly.

Validation:

- `python3 -m unittest discover -s _prep/tests -v`: 23 tests passed. New cases cover six failed build/preparation paths, six malformed skin cases, four invalid accessor layouts, a truncated chunk header, and early rejection of an existing candidate.
- `blender --background --factory-startup --python-exit-code 1 --python _prep/tests/preparation_blender_checks.py`: nine geometry/UV/skin/rig rejection checks passed, plus a real Blender 29.97 FPS duration check.
- Both retained diagnostic candidates, Kaida r4 and sword r2 pass immutable package verification and the tightened GLB checker.
- The updated native probe passed all 29 checks against Kaida r4; [runtime.json](runtime.json) retains the result. A second run targeting the same directory exited 1 before loading the game. A headless run also exited 1 without creating an evidence directory.

Run the native probe with the command in [Kaida r4 evidence](../kaida-r4/README.md), choosing a fresh output path. This sweep used `_prep/.build/quality-sweep-r1-native`; its seven screenshots remain local scratch outputs. The prior retained r4 captures show the same asset bytes. The report's game build stamp predates this tooling-only sweep because the probe launches the game directly; [run.json](run.json) records the repository base and exact checked script hashes.

The nine Blender rejection cases and 29 runtime checks establish structural/integration behavior. They do not establish final hand anatomy, sword contact, foot planting or normal-play performance. Those remain under the owner's provisional quality cutoff and plan 03 refinement.
