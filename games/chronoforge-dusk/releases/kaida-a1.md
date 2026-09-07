# Kaida r2 — playable alpha a1

**Current playable release: a1. Stable model generation: r2.** The owner requested this alpha graduation after native movement/rehearsal review and the run-hand fix. This release adopts the existing body and first-pass art cutoff; it does not require a replacement model or final cosmetic polish. 04 remains unstarted.

## Which version means what

| Identity | Meaning | Current value |
| --- | --- | --- |
| Kaida model generation | The supplied Meshy body/design and original texture set | **r2**, unchanged |
| Playable release | The game integration, prepared animations/equipment and tested gameplay settings | **a1** |
| Prepared export | Immutable internal GLB/descriptor package, used for hashes and rollback | `kaida/r5` |
| Sword export | Independently prepared equipment package | `kaida.energy-sword/r2` |
| Blender source revision | A named authoring checkpoint within its own folder | `run-carry-r2`, derived from `foundation-r3` |

The earlier bare r3/r4/r5 labels were export iterations of the same r2 body, not new model generations. The UI now leads with **Kaida r2 / Alpha a1**. Technical diagnostics retain the exact prepared export identity.

The arm fix changed animation bytes inside the GLB, so it needed a new immutable export. Replacing r4 in place would break its recorded hashes, saved comparisons and rollback. That did not regenerate Kaida or change her r2 design. Alpha graduation is a game-owned release record selecting the verified export; it does not need yet another duplicate mesh export.

## Release contents

[Runtime release manifest](../game/content/releases/kaida-a1.json) pins `kaida/r5` and sword r2 by hash. [Source handoff](../_prep/KAIDA_HANDOFF.md) identifies the retained raw r2 model, rig, source clips, corrected Blender master and export recipe. [Native evidence](../evidence/kaida-03/README.md) pairs the tested source digest with default movement/action/camera tuning and the built app.

Included: responsive walk/run/start/stop/turn/collision, five imported clips, separate sword, complete approach/strike/contact/feedback/recovery/return, basic hurt/defeat/reset, slow/stepped inspection and saved tuning. The run-hand snap is corrected; character/target spawn positions and collider offsets are set before activation. This fixes both the four-instance overlap and blank startup. Native checks cover cold startup before reset, grounded contact, walls and the ramp with the original controller.

Open `dist/Chronoforge Dusk.app`. [Controls and rebuild commands](../NATIVE.md). This is the local Mac alpha; game version is `0.3.0-alpha.1`, while the macOS numeric bundle version remains `0.3.0`.

## Retirement and naming

Older prepared builds are superseded, retained as history/rollback rather than treated as current releases. The development selector labels r4 **previous export**; a1 is the current entry. Original downloads, Blender masters and immutable candidate evidence are preserved. No files were deleted as part of graduation. Packaging cleanup can later exclude unused runtime exports without destroying their upstream source/history.

Going forward, reserve **r2/r3… for the model generation in owner-facing discussion** and **a1/a2… for playable alpha releases**. Name new internal export revisions `prep-006`, `prep-007` and so on, and use descriptive authoring checkpoint names. Existing immutable paths keep their names and are interpreted within their namespace; renaming all retained sources would add risk without changing the asset.

Future alpha fixes can use the same model generation. A genuinely replaced/regenerated body changes the model generation and must be checked for rig/animation/grip compatibility.

## Alpha limits

The body remains slender and its finger fit, weight transfer and basic held-hurt fall remain first-pass presentation. The fall can intersect props. The earlier off-patch/blank-view startup is fixed by setting spawn positions and collider offsets before activation; normal startup was inspected without a reset. Full audible/subjective polish and broader OS focus behavior are not automatically certified by tests. These are recorded limits of a1, not an authorization to begin 04.

## Graduation verification

Before the alpha checkpoint, the standalone app passed 61 Kaida checks plus six cold restarts, and 47 foundation regressions plus five cold restarts, with fresh invocation IDs and no external input. Four helper tests reject stale, incomplete or interfered evidence. Tested game source SHA-256: `6c5ffa22575c618e6b9b4c467a275e0fee47f5f4a40b09a6ac140689f5198f70`. The [graduation event](../_prep/history.jsonl) pins the release manifest and report hashes; [native evidence](../evidence/kaida-03/README.md) retains performance and captures.
