# Flight / landscape extraction checkpoint

Paused at the user's request for a committed stopping point on `codex/forest-flight`. **This is work in progress, not a completed framework-dev release.** The branch has not been merged into `g/scene-test`.

## Completed at the checkpoint

- Read the current `g/scene-test` framework-dev workflow and merged accepted base/weather work into this branch (`b6d59281`). Registry/guide conflicts preserve flight-motion, sailing-ships and weather. Accepted weather behavior has not been changed.
- Updated canonical flight-motion with the proven body-axis roll/inverted controls and optional stabilization; preserved fixed ticks, swept contacts and caller-owned game outcomes. Documented version 2 / Three.js dependency.
- Drafted `modules/aircraft`: both editable procedural aircraft, handling linkage, propeller/control-surface/instrument bindings, rolled cockpit pose, resource cleanup and F/Space control binding.
- Drafted `modules/landscape`: finite terrain/detail renderer, deterministic layout/query factory, default terrain/trail, owned forest GLB/textures and editable asset sources/licenses, atmosphere helper. Airport exclusions/mowing are injected callbacks; airport layout, markers and game rules remain in the game.
- Original Forest Flight game remains unchanged and playable. New modules are deliberately not listed as released capabilities in modules.json yet.

## Resume here

1. Finish weather compatibility. Landscape targets include Lambert midgrass and BasicMaterial pine impostors; current accepted weather only accepts Standard/Physical. Decide the smallest composable adapter, preserve original terrain shader hooks and owned restoration, match near/far seasonal response, and use weather's shared wind exactly once. Do not blindly enable the current draft targets. Check depth/shadow handling and disposal order.
2. Review landscape contracts: rectangular cover/shade field mapping, custom ground/coverage validation, seed behavior, configure-before-init and disposal-during-async-load ownership. Move provisional hardcoded options into documented constraints only where needed.
3. Add runnable concise integration examples: both aircraft with chase/mounted view and controls; landscape at ground/low/high positions with weather. Use baseline-quality settings and shared wind/material state, no airport or game loop in modules. Existing follow-camera mounted poses already work; avoid unnecessary camera/collision rewrites.
4. Add meaningful lifecycle/shader-composition/contact/camera tests, run `./run run check`, finalize module IDs/versions and guide. Format canonical source and sync selected baseline copies if any shared module changes.
5. Commit stable source, then focused browser checks with ordinary input and short/fixed setups: both models, roll/inversion/recovery, cockpit animation, landscape transitions/travel, weather presets/wind and settled resource counts. No full game circuit is necessary. Review source and resolve findings.
6. Finish README ownership/constraints/examples, record validation and material limits, commit, stop owned processes, remove `runs/flight-landscape-extraction`. Leave branch unmerged for user review.

## Validation at this checkpoint

Focused CPU validation: 18/18 tests passed across flight-motion, aircraft binding/disposal and relocated landscape queries. Extraction source/tests pass ESLint; touched modules/docs were formatted. The roll test uses four seconds of held sport-roll input to allow a full revolution at the preset rate. No browser/GPU, full framework check or final module-release validation is claimed. No preview servers or GPU jobs are running. Coordination plan remains in ignored `runs/flight-landscape-extraction/BRIEF.md` for resumption.
