# Asset preparation for Chronoforge Dusk

**Status: local static and skeletal recipes implemented and verified with diagnostic assets. Real Kaida runtime r4 now has all five gameplay clips, a separate sword, and a verified native rehearsal; owner review and 03 polish remain pending.** This folder owns source references, immutable downloads, editable working assets, recipes, export metadata, and candidate/review history. See [Kaida's current source and candidate handoff](KAIDA_HANDOFF.md) and [proof evidence](evidence/proofs-r1/README.md).

**The game owns asset consumption, preview, inspection, tuning, and playtesting.** `_prep` does not contain a second engine or the authoritative character viewer. Asset work is evaluated through the actual Dusk runtime and its development mode.

The original animated-character idea remains a useful route, now within a reusable asset system. Metadata selects the necessary steps for each asset. A static prop does not need rigging; a Blender-authored model does not need Meshy; a moving machine does not need Mixamo.

Inspect [Chronoforge's original assets](../../chronoforge/src/assets) directly as the art-style and design reference. For assets being made in 3D, Blender work should translate those designs into highly polished models and materials, with animation where needed. AAA-quality finish is the target ambition, evaluated in Dusk while preserving the original identity.

## Recipes

| Asset kind | Example route |
| --- | --- |
| Humanoid character | Approved image/reference → Meshy or Blender modeling → Blender cleanup → Mixamo rig and selected animations → Blender finishing/export → game import |
| Static prop or environment piece | Blender modeling or an existing source → material/geometry preparation → export → game import |
| Animated machinery/prop | Blender model and rigid animation → export → game import |
| Non-humanoid animated character | Suitable modeling and rigging workflow → source clips → finishing/export → game import; choose the rigging tool when this asset is needed |
| Portrait, icon, or texture | Image creation/editing → image processing → game import |

These are examples, not mandatory service chains. A static asset may use Meshy if useful; it still bypasses humanoid rigging. Animation needs are explicit: none, rigid, or skeletal.

## Read next

- [Pipeline plan](../_plans/02_asset_pipeline.md): metadata-driven processing, source retention, manual steps, and promotion.
- [Kaida plan](../_plans/03_kaida_in_game.md): first character's visual and motion goals.
- [Asset handoff](ASSET_CONTRACT.md): shared producer/consumer expectations to prove with real assets.
- [Game foundation](../_plans/01_native_foundation.md): the runtime and tools that consume the result.
- [Roadmap](../ROADMAP.md): numbered sequence and parallel work. Production assignments are in `../_plans/`; this folder holds production sources, tools, and handoff reference material.

## Working boundaries

Use hosted generation/rigging where useful and manual downloads where practical. Blender CLI/Python can handle repeatable local preparation. Neither Blender MCP nor a local ML stack is required to begin. Provider-specific automation is future work only if repetition makes it worthwhile.

Keep raw downloads and editable sources. Export candidates into distinct revisions and preserve the last accepted version. Passing structural checks means an asset is ready to evaluate, not that it looks or plays correctly.

02's tooling proof uses a newly authored static grip probe and a genuinely skinned diagnostic mannequin. The mannequin is not Kaida or a character-quality target. The real-asset proof now has [prepared Kaida geometry](assets/kaida/README.md) and a [five-clip runtime candidate](assets/kaida/demos/foundation-r3/README.md), ready for in-game refinement in 03. Do not generate the entire cast, enemy roster, or biome catalog upfront. Do not copy Dawn's assets, skeleton contract, or processing code.

The Godot project is in sibling `../game/`, so production sources stay outside its import/export scope. Only explicitly handed-off runtime GLBs/descriptors enter the game.

The production approach may later become a tech9 capability for other games, including 2D side-scrollers. See [future framework direction](../FRAMEWORK_FUTURE.md). Prove the current recipes first; do not turn `_prep` into a universal asset platform before Dusk works.

## Local commands

Run from `games/chronoforge-dusk`. Python uses its standard library. Blender is pinned to **5.1.1, build b70da489d7f4**; set `BLENDER_PATH` if it is not on PATH. Godot remains the game's pinned 4.6.3. Blender's background startup needs access to Metal on this Mac; the restricted automation sandbox crashed before Python ran, so verified builds used a normally authorized local Blender process.

```sh
# Validate declared inputs and hashes; no Blender or hosted service call.
python3 _prep/pipeline.py inspect _prep/assets/diagnostic.grip-probe/asset.json

# Build the static dependency first, then the humanoid. Existing revisions refuse overwrite.
python3 _prep/pipeline.py build _prep/assets/diagnostic.grip-probe/asset.json
python3 _prep/pipeline.py build _prep/assets/diagnostic.skin-probe/asset.json

# The delivered checkout already includes these candidates: verify or hand off them directly.
python3 _prep/pipeline.py verify _prep/candidates/diagnostic.skin-probe/r1/manifest.json
python3 _prep/pipeline.py handoff _prep/candidates/diagnostic.grip-probe/r1/manifest.json
python3 _prep/pipeline.py handoff _prep/candidates/diagnostic.skin-probe/r1/manifest.json --register
python3 tools/native.py import

# Failure-path tests against real GLBs; temporary test destinations only.
python3 -m unittest discover -s _prep/tests -v

# Actual Dusk scene, rendered import/skin/attachment/motion proof; no accepted tuning writes.
godot --path "$PWD/game" --script "$PWD/_prep/tools/runtime_probe.gd" --resolution 1440x810
```

To rebuild an existing source, copy its metadata, give it a new `revision`, and run `build` on that copy. The static r2 candidate demonstrates this: its model GLB is byte-identical to r1 while its candidate identity/path is distinct. Builds are explicit, without a cache or automatic provider calls. Source and dependency hashes are rechecked before publishing a package atomically. Handoff is a separate operation and refuses changed runtime bytes at an existing revision.

`python3 tools/native.py run` opens the updated game; its candidate selector uses descriptor labels, including **Skinned diagnostic / NOT KAIDA**. Static props are loaded by the probe and attachments; the existing development selector is for characters. The previously packaged `.app` is not refreshed by `import`; use `python3 tools/native.py export` to rebuild it. The 02 evidence uses the native editor binary running the actual game scene.

## Humanoid rigging preparation

For interactive posing and review in the open Blender app, see [the shared Blender MCP setup](BLENDER_MCP.md). The automated preparation/export commands below remain reproducible without MCP.

Before the finished `skeletal_blend` recipe, use [the reusable Mixamo upload/restore/clip steps](MIXAMO.md):

```sh
python3 _prep/pipeline.py prepare _prep/assets/kaida/rigging/upload-r3.json
python3 _prep/pipeline.py prepare _prep/assets/kaida/rigging/restore-base-r1.json
python3 _prep/pipeline.py prepare _prep/assets/kaida/rigging/assemble-clips-r1.json
```

These example revisions already exist; use a new revision to rebuild. Preparation metadata selects `mixamo_upload`, `mixamo_restore` or `mixamo_clips`, records hashed inputs, and publishes to the asset's export/source directory. It does not create a runtime descriptor. Uploads omit materials without reducing geometry; restoration checks the returned bind mesh and UVs before reattaching packed source maps. Clip assembly checks skeleton/rest/scale/FPS compatibility and preserves source motion on the textured rig. See the linked guide for the manual provider step, input constraints and failure checks.

## Production metadata and packages

See [the static metadata](assets/diagnostic.grip-probe/asset.json), [skeletal metadata](assets/diagnostic.skin-probe/asset.json), and [skeletal candidate manifest](candidates/diagnostic.skin-probe/r1/manifest.json). Production metadata uses `production_format: 1`; it is an upstream recipe document, not a replacement for the game's runtime format 1.

| Field / file | Responsibility |
| --- | --- |
| `asset_id`, `revision`, `label` | Stable asset identity, immutable candidate revision, readable label |
| `source_files` | Exact paths, roles and SHA-256 for master, maps, raw geometry and animation originals |
| `recipe`, `animation_mode` | Fixed `static_blend` / `none`, or `skeletal_blend` / `skeletal`; no shell code or provider plugin hooks |
| `clips`, `root_motion` | Source action-to-role mapping; named local correction; all five roles embedded in one model GLB |
| `required_outputs` | Explicit required package files; missing/unknown output declarations fail |
| `dependencies`, `attachments` | Verified static candidate manifests, separate equipment GLBs, game-format attachment declaration |
| `provenance` | Asset origin and attribution; provider facts stay out of the runtime descriptor |
| `runtime/` | Prepared model, descriptor and selected dependencies; only these are copied to the game |
| `working/export.blend` | Corrected editable export scene; source master still contains original root travel |
| `inspection.json`, `reimport.json`, `structural-checks.json` | Measurements and checks, explicitly separate from visual acceptance |
| `export-settings.json`, `build.log`, `metadata.json`, `manifest.json` | Settings, diagnostic log, metadata snapshot, source/script/tool fingerprints and package hashes |

Both recipes inspect source geometry, materials, textures, scale and grounding; save the export scene; export GLB; reimport it in Blender; and check the actual glTF bytes independently. The skeletal route additionally validates weights/bones, corrects a declared aligned root's horizontal travel, verifies roles, and measures evaluated deformation. UV/material correspondence, facing and the grip are also inspected in the actual game. These are readiness checks, not automatic anatomy, motion, performance or art acceptance. Unsupported source rigs require deliberate Blender preparation, documented in the Kaida handoff.

The original proof sources are editable [static r2](assets/diagnostic.grip-probe/sources/r2/master.blend) and [skeletal r2](assets/diagnostic.skin-probe/sources/r2/master.blend). `tools/author_proofs.py` is their authored construction source, not a Kaida generator. It refuses existing source folders. Development source r1 is retained, but the metadata selects r2: the root bone's local axes were corrected to make original forward travel and export correction agree. No geometry reduction was used.

## Retention and review history

Manual acquisitions use `retain` with a provider receipt; see [the exact example](KAIDA_HANDOFF.md). Downloads are copied byte-for-byte to new batch folders. Blender master/maps/original clips belong in `source_files` with their hashes. Keep original and corrected actions/masters rather than destructively replacing them.

`history.jsonl` is an append-only local record of explicit handoffs and review decisions. No candidate in this task has been marked visually accepted. Once an actual owner review has occurred, record it with:

```sh
python3 _prep/pipeline.py record-review _prep/candidates/ASSET/REVISION/manifest.json \
  --decision accepted --evidence _prep/evidence/REVIEW.md --game-revision ACTUAL_GAME_REVISION
```

Use `rejected` for a rejected review. Evidence must exist and is hashed. Each event preserves preceding decisions and candidate bytes; this command does not modify game-owned saved tuning. Pair real Kaida acceptance with the evidence required by `VALIDATION.md`. Diagnostic checks never imply that acceptance.
