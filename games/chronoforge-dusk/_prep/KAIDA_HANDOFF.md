# Kaida: reference review and manual source handoff

**Current state:** 2D references created; revision 2 removes the forearm guards and straps at the owner's request. No Meshy model, production rig or source clips have been received. The amber mannequin is only a diagnostic asset. Do not upload it as Kaida.

## Review / upload references

- [Current Kaida A-pose, r2](references/kaida/r2/kaida-a-pose-r2.png): 1024 × 1536, empty hands, rolled cyan cuffs and bare forearms.
- [Separate energy sword, r1](references/kaida/r1/kaida-energy-sword-r1.png): 1024 × 1536. Keep the sword out of the humanoid generation and rigging input.
- [Original A-pose, r1](references/kaida/r1/kaida-a-pose-r1.png) is retained for comparison. [Generation records](references/kaida/r2/generation.json) retain the exact built-in imagegen prompt and hashes. The built-in tool returned 1024 × 1536 despite the higher portrait resolution requested; these are its original pixels, with no upscaling.

Preserve the swept pointed magenta hair, cyan jacket, dark trousers and boots, and agile proportions. The original Chronoforge sprites were visual references only. The owner's additional screenshot guided only the revised cuffs/forearms; it did not replace the hairstyle or jacket design.

The owner reviews the reference before Meshy generation. The owner may then generate the humanoid from r2. No hosted generation has been performed by this task.

## Exact next inputs

Return the **untouched model download** (prefer a textured GLB when available) plus every separately downloaded texture/map or source archive. Keep original filenames. Also supply the job/page identifier and actual generation/export options. Do not reduce geometry just to reach a generic triangle target. No sword or animation download is required for this first geometry inspection.

Create a receipt JSON with the actual values, then retain the files with the local command below. `origin` can be a job URL or an owner-provided identifier. Record the applicable asset/provider attribution or its unresolved status; an unknown status is not a license grant. Do not include credentials.

```json
{
  "provider": "Meshy",
  "origin": "REPLACE with the actual job URL or identifier",
  "attribution": "REPLACE with applicable terms/attribution or unresolved status",
  "reference": "references/kaida/r2/kaida-a-pose-r2.png",
  "options": {},
  "notes": "Record the actual selected generation and export options here"
}
```

Run from `games/chronoforge-dusk` with actual download paths:

```sh
python3 _prep/pipeline.py retain --asset-id kaida --batch meshy-r1 \
  --receipt /absolute/path/to/receipt.json /absolute/path/to/model.glb /absolute/path/to/textures.zip
```

This copies bytes into `_prep/assets/kaida/downloads/meshy-r1/`, writes per-file hashes and provenance, and refuses an existing batch. Keep receipts for corrected downloads and later clips in separate batches.

## Local preparation after the download arrives

Open the acquired model in Blender 5.1.1. Preserve a packed editable master before changing geometry, UVs or materials. Inspect front/back/side and close views of hands, armpits, shoulders, elbows, hips, knees and feet. Check separated fingers, thumb/palm thickness, joints, open seams, intersecting clothing, normals, UV islands, missing maps and texture correspondence. Keep the agile silhouette and palms when optimizing. Texture source pixels, color-space assignments and editable sources remain upstream of the runtime GLB.

Prepare metres, ground origin, Blender Z up and +Y forward. The glTF exporter converts this once to Godot Y up and -Z forward. Measure the actual height and choose the collider radius with the game. The diagnostic height/radius are not Kaida dimensions or budgets. Use a neutral A/T pose suitable for the rigging service, without the separate weapon.

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
