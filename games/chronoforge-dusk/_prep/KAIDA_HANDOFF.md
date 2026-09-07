# Kaida: reference review and manual source handoff

**Current state:** the owner supplied Meshy r2 geometry and all four PBR maps. The [real Kaida is prepared for Blender inspection and manual rigging](assets/kaida/README.md); no production rig or clips have arrived. Her current proportions are too skinny for the owner, who explicitly wants to continue with this version for now. The amber mannequin remains a separate pipeline diagnostic.

## Review / upload references

- [Current Kaida A-pose, r2](references/kaida/r2/kaida-a-pose-r2.png): 1024 × 1536, empty hands, rolled cyan cuffs and bare forearms.
- [Separate energy sword, r1](references/kaida/r1/kaida-energy-sword-r1.png): 1024 × 1536. Keep the sword out of the humanoid generation and rigging input.
- [Original A-pose, r1](references/kaida/r1/kaida-a-pose-r1.png) is retained for comparison. [Generation records](references/kaida/r2/generation.json) retain the exact built-in imagegen prompt and hashes. The built-in tool returned 1024 × 1536 despite the higher portrait resolution requested; these are its original pixels, with no upscaling.

Preserve the swept pointed magenta hair, cyan jacket, dark trousers and boots, and agile proportions. The original Chronoforge sprites were visual references only. The owner's additional screenshot guided only the revised cuffs/forearms; it did not replace the hairstyle or jacket design.

The owner generated the current model in Meshy and supplied `/Users/g/Downloads/kaida_r2/`. The task retained its original filenames and bytes under [downloads/meshy-r2](assets/kaida/downloads/meshy-r2/receipt.json); working maps have clear names with a recorded source mapping. The job URL, generation options and provider plan were not supplied and remain unresolved receipt fields.

## Exact next input

Upload [kaida-r2-for-mixamo.fbx](assets/kaida/exports/rigging-r1/kaida-r2-for-mixamo.fbx). It contains the real Kaida mesh and embedded textures, with empty hands. Inspect the rig preview and return one **rigged base with skin** plus one **idle animation-only FBX** for that same character first, with the selected settings and clip name. The local Blender import will check their compatibility before collecting the remaining roles.

For inspection now, open [kaida-r2-prepared.blend](assets/kaida/sources/meshy-r2/kaida-r2-prepared.blend). It has four packed 2048 × 2048 maps, metre units, ground origin, Blender Z up and +Y forward. Source height is 1.89819 m; no height, topology or proportion adjustment was made. The import master and original FBX are retained separately. Front/back/side and hand views, structural measurements and export reimport checks are linked in the [source overview](assets/kaida/README.md).

The owner may replace this body later; see [review notes](assets/kaida/REVIEW_NOTES.md). Treat a regenerated model as a new source revision and recheck rigging, weights, animation compatibility and grip. Continue the pipeline now, and settle proportions before extensive deformation and animation polish.

Keep original rig/clip download names and settings. Retain each new batch through `pipeline.py retain` before editing it; do not overwrite the Meshy batch. The current GLB is an unrigged inspection export, not a game-ready character candidate.

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

Import the base and first clip into Blender; compare bone names, hierarchy, rest matrices, unit scale and facing. A matching name alone does not establish compatibility. Assign compatible source motion to the retained skeleton; otherwise correct/retarget deliberately. Retain useful bones/actions and source clips. Check foot contacts, wrist/grip, shoulder deformation, self-intersections and frame ranges. Keep original and corrected actions/masters as distinct revisions.

The current `skeletal_blend` recipe begins at that **finished Blender master**. It is not an automatic retargeter or a general Mixamo importer. Its one automatic motion correction removes the declared top-level bone's X/Y translation in Blender coordinates; it requires aligned root axes. An incompatible root basis, armature-object travel, constraints, or different displacement arrangement needs explicit Blender finishing and inspection before using this operation. Recheck actual output motion; never relabel it as in-place to silence a failure.

List the master, original downloads, textures and clips in production `source_files` with hashes. Map actual Blender action names to all five roles. Supply the separate blade as a static dependency and verify the real skeleton path/bone and grip offset in Dusk. The fixture's `Rig/Skeleton3D`, `Hand.R` and offsets are diagnostic examples, not a Kaida skeleton contract.

Build an immutable candidate, reimport its actual GLB, and use Dusk for material, skin, scale, facing, clip and attachment checks. The game owns collision, camera, lighting, displacement and impact timing. Step 03 begins only with the real candidate; passing this tooling proof does not accept Kaida's appearance or motion.
