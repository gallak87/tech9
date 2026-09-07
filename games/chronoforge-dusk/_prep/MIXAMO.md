# Manual Mixamo round trip with automated local preparation

The local stages are `mixamo_upload` and `mixamo_restore`, selected by preparation metadata through `pipeline.py prepare`. These stages retain source geometry, UVs, rig and actions; hosted upload, marker placement and downloads remain manual. A prepared rig still needs animation finishing before the `skeletal_blend` candidate recipe.

## 1. Prepare the upload

Start with a retained `.blend`: one triangulated humanoid mesh, one UV layer, no rig, modifiers or actions. Prepare its scale, ground placement and facing first. Keep its source material and packed maps in that master.

Use [Kaida's upload metadata](assets/kaida/rigging/upload-r3.json) as the template. Set the new asset ID and revision; the `editable_master` entry identifies the master with its `_prep`-relative path and SHA-256. Run from Dusk:

```sh
python3 _prep/pipeline.py prepare _prep/assets/kaida/rigging/upload-r3.json
```

Output: `assets/<asset_id>/exports/<revision>/<asset_id>-geometry-only.fbx`. The recipe strips materials/images only, preserves all triangles, and reimports the FBX to check vertex positions, connectivity and per-corner UVs. It refuses rigs or extra scene objects. No triangle target or automatic decimation is applied.

Upload this FBX to Mixamo. Gray appearance is expected. Keep the maps in the source master for restoration after rigging. Place the markers on the actual joints, inspect the rig preview, and download the rigged base with skin. For Kaida, the selected UI option was Standard Skeleton (65), with symmetry enabled.

Kaida's 81,202-triangle textured upload failed before marker placement; the same geometry uploaded successfully without materials/maps and produced a 65-bone rig. Dawn's retry notes, consulted at the owner's request, also recorded a texture-dependent failure at 24,000 triangles. This is a reason to test material-free uploads before reducing geometry, not a universal provider limit. The generic skeleton-mapping error does not establish that an unrigged file contains bones. Inspect the actual upload and browser error if this minimal upload fails too.

## 2. Retain the returned file

Keep its downloaded filename and copy it into a fresh batch using `retain`. Supply a receipt with provider, origin and attribution status, plus the settings actually selected. Unknown settings stay unknown.

```sh
python3 _prep/pipeline.py retain --asset-id CHARACTER --batch mixamo-base-r1 \
  --receipt /absolute/path/to/receipt.json /absolute/path/to/downloaded.fbx
```

The existing upload and returned file may share a filename; their separate export/download folders identify them. Never overwrite the upload with the returned rig.

## 3. Restore the material and save the rig

Use [Kaida's restore metadata](assets/kaida/rigging/restore-base-r1.json) as the template. It identifies three hashed inputs: `reference_master`, `rigged_download` and `download_receipt`. The FBX must be in that asset's retained download directory and match its receipt.

```sh
python3 _prep/pipeline.py prepare _prep/assets/kaida/rigging/restore-base-r1.json
```

Output: `assets/<asset_id>/sources/<revision>/master.blend`, with packed source maps. The recipe checks the returned bind geometry and UVs against the source before restoring its material. It requires one armature, a bound mesh and valid normalized weights on every vertex. It preserves the returned rig transforms, rest pose, weight values and actions. It reopens the saved master to check the packed maps, skin and evaluated pose.

`view_from` (`+Y` or `-Y`) controls the Blender editor view only. Kaida's returned two-frame static T-pose faces opposite her original A-pose; her restore metadata uses `-Y` to show the T-pose's front. This does not rotate or bake the rig. Align final exports deliberately during animation finishing.

The current restore scope is one mesh, one UV set and one packed source material. A changed topology, changed UV layout, transformed bind mesh or different source structure stops with an error instead of guessing material or rig correspondence. It does not retarget clips, reduce influences, normalize rig axes or label a T-pose as an idle animation.

## Revisions and checks

Existing output revisions refuse overwrite. Copy the metadata and use a new revision to rebuild. Sources, settings, scripts and tool versions are recorded in each package manifest; publication happens only after checks pass. A Blender stage that returns an error retains its diagnostic log under ignored `_prep/.build/`; failed preparation publishes no finished revision. Blender is pinned to 5.1.1 / b70da489d7f4.

```sh
python3 -m unittest discover -s _prep/tests -v
blender --background --factory-startup --python-exit-code 1 --python _prep/tests/preparation_blender_checks.py
```

Next for Kaida: obtain one actual idle clip without skin for this same uploaded character, at 30 FPS with no keyframe reduction if available. Check the base/clip pair before collecting walk, run, attack and hurt. Preserve the original clips and options. Source transforms, root axes, up to seven returned influences per vertex, final export facing and the separate sword still need the normal Blender finishing/game checks.
