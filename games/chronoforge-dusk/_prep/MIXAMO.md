# Mixamo preparation

The local stages are `mixamo_upload`, `mixamo_restore` and `mixamo_clips`, selected through `pipeline.py prepare`. Hosted upload, markers and downloads remain manual. **Kaida a1 already has its required clips; no new round trip is required.**

## Metadata

Preparation metadata uses `preparation_format: 1`, `asset_id`, a new `revision`, `recipe` and `source_files`. Each source declares its `_prep`-relative `path`, `role` and SHA-256. Use metadata for the actual new input; previous output paths are not templates to overwrite.

| Recipe | Required source roles | Result |
| --- | --- | --- |
| `mixamo_upload` | `editable_master` | Material-free FBX in `assets/<asset_id>/exports/<revision>/` |
| `mixamo_restore` | `reference_master`, `rigged_download`, `download_receipt` | Textured rig in `assets/<asset_id>/sources/<revision>/master.blend` |
| `mixamo_clips` | `rigged_master`, `download_receipt`, one `clip_<role>` per mapping | Compatible source actions on the textured rig |

```sh
python3 _prep/pipeline.py prepare PATH_TO_PREPARATION_METADATA
```

Clip metadata also maps supplied gameplay roles to distinct action names, for example `{"idle":"idle.source","run":"run.source"}`. Restore metadata accepts `view_from` (`+Y` or `-Y`) for editor framing; this does not rotate the rig.

## Upload and restore

Start with one unrigged triangulated mesh, one UV layer and packed source maps in a Blender master. Establish scale, grounding and facing. The upload stage strips material/media content while preserving geometry and UVs, then checks an FBX reimport. Test material-free upload before reducing geometry in response to a provider error.

Place hosted rig markers on the actual joints and inspect the preview. Download a rigged base with skin. Keep its original name and record the selected provider settings; unknown settings remain unknown.

```sh
python3 _prep/pipeline.py retain --asset-id CHARACTER --batch NEW_BATCH \
  --receipt /absolute/path/to/receipt.json /absolute/path/to/downloaded.fbx
```

The restore stage checks bind geometry and UV correspondence before applying packed maps. It requires one armature, a bound mesh and normalized weights. It preserves rig transforms, rest pose, weights and actions, then verifies a reopened master. A static T-pose is not an idle clip.

## Source clips

Use the same uploaded skeleton. Start with 30 FPS and no keyframe reduction when available; record actual settings. Animation-only files avoid duplicate mesh data. Files with skin are accepted only when bind geometry and UVs match. Preserve original travel before making an in-place working copy.

Assembly checks bone names, hierarchy, rest matrices, transforms and FPS. It transfers actions without replacing the textured mesh, checks every integer-frame pose and repeats verification after reopening. Incompatible rigs require deliberate retargeting. Existing action names refuse replacement.

The export recipe starts from a finished master; it is not a general retargeter. Check root axes, foot contact, joints, grip and facing in Blender and the native game. Weapon carry must be solved in the exported motion space. A replaced body or weapon needs new compatibility checks.

## Validation

Blender is pinned to 5.1.1 / b70da489d7f4. Existing output identities refuse overwrite. Failed stages retain local diagnostics and publish no completed package.

```sh
python3 -m unittest discover -s _prep/tests -v
blender --background --factory-startup --python-exit-code 1 --python _prep/tests/preparation_blender_checks.py
```

[Current Kaida source and inputs](assets/kaida/README.md). Superseded exports and upload experiments are in Git history.
