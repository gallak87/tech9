# Kaida: reference review and manual source handoff

**Current state:** the Meshy r2 model has completed Mixamo auto-rigging at its full 81,202 triangles. The textured 65-bone rig now has [idle and run source actions assembled in Blender](assets/kaida/sources/mixamo-clips-r1/master.blend). A [separate finished source and review copy](assets/kaida/demos/foundation-r3/README.md) now add locally authored walk, attack and hurt, in-place runtime motion and the separate 3D sword. Runtime candidate `kaida/r4` is imported and integration-checked. Her current proportions are too skinny for the owner, who explicitly wants to continue with this version for now. The amber mannequin remains a separate pipeline diagnostic.

## 03 integration update — run carry correction

The current playable release is **[Kaida r2 / Alpha a1](../releases/kaida-a1.md)**. Its prepared game export is **Kaida r5 / sword r2**, derived from the retained 02 r4 handoff. Owner playtesting exposed a right-hand snap each run loop: the carry had been solved before horizontal root travel was removed. [The corrected master](assets/kaida/sources/run-carry-r2/master.blend) solves only the run right arm in place; [the correction report](assets/kaida/sources/run-carry-r2/correction.json) verifies the other four clips and unrelated body motion are unchanged. [Production metadata](assets/kaida/asset.json) selects that master; [r5 manifest](candidates/kaida/r5/manifest.json) identifies the immutable export.

[03’s native evidence and review limits](../evidence/kaida-03/README.md) supersede the older integration status below. The r4 source and review Blender scenes remain preserved for comparison. The owner requested alpha graduation here; final art polish stays open and 04 is unstarted.

## Review / upload references

- [Current Kaida A-pose, r2](references/kaida/r2/kaida-a-pose-r2.png): 1024 × 1536, empty hands, rolled cyan cuffs and bare forearms.
- [Separate energy sword, r1](references/kaida/r1/kaida-energy-sword-r1.png): 1024 × 1536. Keep the sword out of the humanoid generation and rigging input.
- [Original A-pose, r1](references/kaida/r1/kaida-a-pose-r1.png) is retained for comparison. [Generation records](references/kaida/r2/generation.json) retain the exact built-in imagegen prompt and hashes. The built-in tool returned 1024 × 1536 despite the higher portrait resolution requested; these are its original pixels, with no upscaling.

Preserve the swept pointed magenta hair, cyan jacket, dark trousers and boots, and agile proportions. The original Chronoforge sprites were visual references only. The owner's additional screenshot guided only the revised cuffs/forearms; it did not replace the hairstyle or jacket design.

The owner generated the current model in Meshy and supplied `/Users/g/Downloads/kaida_r2/`. The task retained its original filenames and bytes under [downloads/meshy-r2](assets/kaida/downloads/meshy-r2/receipt.json); working maps have clear names with a recorded source mapping. The job URL, generation options and provider plan were not supplied and remain unresolved receipt fields.

## Current handoff

**No additional Mixamo input is required for the first phase.** The owner requested a modular grounded set to unlock 03. The local Blender authoring pass supplies the remaining three roles. Mixamo remains an optional source of useful motion for later attacks; existing rigs do not need to repeat auto-rigging. See [the review file, current candidate and reproduction commands](assets/kaida/demos/foundation-r3/README.md).

The following describes the retained idle/run source before that finishing pass:

Open [the animated textured Blender source](assets/kaida/sources/mixamo-clips-r1/master.blend) and press Space to inspect `idle.source` over frames 1–60. To inspect `run.source`, select the armature, choose that action in the Dope Sheet's Action Editor and set the timeline to frames 1–23. Both play at 30 FPS. The run still travels forward by 3.71188 m; its source motion is intentionally retained for later in-place finishing. The original two-frame static T-pose remains a separate action.

Both clips' bone names, hierarchy, rest matrices, unit transform and included geometry/UVs matched the retained base exactly. Every integer-frame bone pose matched after action transfer and save/reopen. Four scratch Blender renders confirmed textured mesh deformation; knee/boot transitions and bent elbows still need polish. This source check does not establish foot-contact, loop or game-scale acceptance. No geometry reduction or proportion change was applied.

[Reusable local Mixamo steps](MIXAMO.md) automate the texture-free upload, source-material restoration and compatible clip assembly via `pipeline.py prepare`. The owner's successful upload was [the r2 geometry-only FBX](assets/kaida/exports/mixamo-upload-r2/kaida-r2-geometry-only.fbx). The earlier textured upload failed at the upload stage; the generic upload recipe has also been verified locally as revision r3.

The owner may replace this body later; see [review notes](assets/kaida/REVIEW_NOTES.md). Treat a regenerated model as a new source revision and recheck rigging, weights, animation compatibility and grip. Continue the pipeline now, and settle proportions before extensive deformation and animation polish.

Keep original rig/clip download names and settings. Retain each new batch through `pipeline.py retain` before editing it; do not overwrite the Meshy batch. The earlier GLB is still an unrigged inspection export; the 02 runtime baseline was `kaida/r4`; use the r5 update above for the current game.

## Manual Mixamo round trip

Adobe documents FBX, OBJ and ZIP uploads; an FBX can embed media, or an OBJ/MTL/texture set can travel in one ZIP. Follow the service's marker instructions, including wrists, elbows, knees and groin, then inspect the rig preview before downloading. A rigged FBX may also be uploaded and mapped. Diagnose an actual upload error before changing the format or assuming a texture limitation. [Adobe's official upload/rigging guide](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html).

For this project, start with one **rigged base with skin**, then **animation-only** downloads for that same uploaded character/skeleton. Verify that convention by importing the first base/clip pair before collecting the rest. Retain every original file, its original clip name, and a receipt of the actual settings: skin choice, FPS, keyframe reduction, in-place option, mirror, trim and motion sliders. A starting choice is 30 FPS and no keyframe reduction if offered. Preserve source root travel; if an in-place variant is also downloaded, keep both separately.

| Game role | Source selection goal | Runtime loop |
| --- | --- | --- |
| idle | Balanced neutral stance | yes |
| walk | Forward walk | yes |
| run | Forward run; required by format 1 | yes |
| attack | One plausible single-handed slash, empty hand for the separate blade | no |
| hurt | Short standing reaction | no |

Those are gameplay roles, not invented service clip names. Record the names actually selected. Download all clips against the same rigged Kaida. Stop after these five usable roles until inspection reveals a specific need.

## Finishing and delivery

Use `mixamo_clips` to assemble compatible batches onto the retained master; compare facing visually as well. Bone names alone do not establish compatibility. An incompatible clip needs deliberate correction/retargeting. Retain useful bones/actions and source clips. Check foot contacts, wrist/grip, shoulder deformation, self-intersections and frame ranges. Keep original and corrected actions/masters as distinct revisions.

The current `skeletal_blend` recipe begins at that **finished Blender master**. It is not an automatic retargeter or a general Mixamo importer. Its one automatic motion correction removes the declared top-level bone's X/Y translation in Blender coordinates; it requires aligned root axes. An incompatible root basis, armature-object travel, constraints, or different displacement arrangement needs explicit Blender finishing and inspection before using this operation. Recheck actual output motion; never relabel it as in-place to silence a failure.

List the master, original downloads, textures and clips in production `source_files` with hashes. Map actual Blender action names to all five roles. Supply the separate blade as a static dependency and verify the real skeleton path/bone and grip offset in Dusk. The fixture's `Rig/Skeleton3D`, `Hand.R` and offsets are diagnostic examples, not a Kaida skeleton contract.

Build an immutable candidate, reimport its actual GLB, and use Dusk for material, skin, scale, facing, clip and attachment checks. The game owns collision, camera, lighting, displacement and impact timing. Step 03 begins only with the real candidate; passing this tooling proof does not accept Kaida's appearance or motion.
