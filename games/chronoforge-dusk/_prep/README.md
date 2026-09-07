# Asset preparation

**Current character: [Kaida a1](../releases/kaida-a1.md).** Production sources and tools live here, outside Godot's `game/` import/export scope. The game owns consumption, inspection, tuning and playtesting. 04 is paused.

## Current assets

- [Kaida source and package](assets/kaida/README.md): current editable master, original downloads, maps, five role clips and separate sword.
- [Runtime contract](ASSET_CONTRACT.md): descriptor, imported scene, equipment and saved tuning.
- [Diagnostic fixtures](fixtures/README.md): test assets for the importer, attachment and action systems.
- [Mixamo preparation](MIXAMO.md): local upload/restore/clip stages around manual hosted steps.
- [Blender connection](BLENDER_MCP.md): optional interactive authoring setup.

## Recipes

| Recipe | Input | Output |
| --- | --- | --- |
| `static_blend` | Finished Blender prop | Static GLB and runtime descriptor |
| `skeletal_blend` | Finished rig, weights, materials and five actions | Skinned GLB, embedded role clips and equipment references |
| `mixamo_upload` | Unrigged textured Blender master | Geometry-only FBX for hosted rigging |
| `mixamo_restore` | Original master and returned rigged FBX | Rig with verified bind geometry/UVs and restored packed maps |
| `mixamo_clips` | Compatible rig and supplied motion FBXs | Master with original actions preserved |

Preparation metadata selects named stages; it does not execute arbitrary shell commands. Static props bypass character stages. Hosted generation/rigging remains manual when needed. No provider automation or universal asset framework is required.

## Commands

Run from `games/chronoforge-dusk`. Python uses the standard library. Blender is pinned to **5.1.1 / b70da489d7f4**; set `BLENDER_PATH` if needed.

```sh
python3 _prep/pipeline.py inspect _prep/assets/kaida/asset.json
python3 _prep/pipeline.py verify _prep/candidates/kaida/a1/manifest.json
python3 _prep/pipeline.py handoff _prep/candidates/kaida/a1/manifest.json --register
python3 tools/native.py import
python3 tools/native.py export
python3 -m unittest discover -s _prep/tests -v
```

The checked-in a1 package is already built. `pipeline.py build` refuses an existing output identity. For an edit, update a copied source and its metadata/hash entries, choose a new preparation identity, then build, inspect and hand off explicitly. Candidate hash checks and native play determine readiness. Import does not refresh the packaged app; export does.

## Package contents

| File | Purpose |
| --- | --- |
| `metadata.json` | Source roles/hashes, recipe, clips, dimensions, attachments and acquisition facts |
| `runtime/` | Runtime descriptor, GLB and selected dependency bytes |
| `working/export.blend` | Editable export scene |
| `inspection.json`, `reimport.json`, `structural-checks.json` | Source/export/reimport measurements |
| `manifest.json`, `export-settings.json`, `build.log` | File inventory, hashes, settings and tool versions |

Builds verify source and dependency hashes before publishing atomically. Checks include geometry, embedded resources, skin arrays, animation roles and declared in-place motion. They do not certify anatomy, foot contact, grip or subjective motion quality; inspect those in Dusk.

## Release checkpoints

Keep original provider inputs, source maps, current editable masters and current release packages. A release uses one alpha identity across source, package and runtime. Remove superseded candidates, demos, scratch probes and iteration reports from the checkout at graduation; Git preserves those checkpoints. Documentation describes the current state and useful pitfalls.

Downloads are retained byte-for-byte with receipts through `pipeline.py retain`. `history.jsonl` records operations during active work; release cleanup may compact obsolete entries into Git history. Visual reviews can be recorded with `pipeline.py record-review`; saved gameplay tuning remains game-owned. A playable alpha does not imply final art polish.

Failed builds retain logs and partial outputs under ignored `.build/` until diagnosed. Remove resolved scratch at the next release checkpoint. Do not overwrite inputs to a running comparison.
