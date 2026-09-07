# 02 local pipeline proof

**Tooling verified; real Kaida model, rig and clips still pending.** No visual acceptance has been recorded. Kaida's current deliverable is the [revised 2D A-pose](../../references/kaida/r2/kaida-a-pose-r2.png), with a [separate sword reference](../../references/kaida/r1/kaida-energy-sword-r1.png).

## Tested inputs and output

| Asset | Proof source | Runtime candidate | Scope |
| --- | --- | --- | --- |
| `diagnostic.grip-probe` | Original Blender source r2; 324 triangles / 168 source vertices; packed 64×64 sRGB calibration texture | r1; 3 materials, 1 embedded texture, no clips/skin | Static route, texture retention and separate attachment |
| `diagnostic.skin-probe` | Original Blender source r2; 1,680 triangles / 864 source vertices; original diagnostic motion | r1; 16 bones, 12 skinned meshes, 256 exported vertices with blended weights, 5 clips | Skeletal export/reimport, actual deformation, root correction, hand attachment |
| `diagnostic.grip-probe` | Same source r2, rebuilt with the final local runner | candidate r2, retained upstream | Same model GLB bytes as candidate r1; distinct descriptor/revision/history |

Exported vertex counts may exceed Blender source counts because of face normals and UV seams. These tiny assets are fixtures; their sizes are not a production budget. Hands are simple diagnostic blocks, not a humanoid hand-quality proof. No original/Dawn model, clip, texture or implementation was copied. Original Chronoforge sprites guided only the requested 2D Kaida references.

Pinned Blender: **5.1.1 / b70da489d7f4**. Game: **Godot 4.6.3 / 7d41c59c4**, native Forward+ / Metal, Apple M1 Pro. The runtime JSON records the exact model hash, tested game source hash, revision, camera and lighting. This run uses the editor binary's native game process and the actual foundation scene; it is not a packaged-app or performance acceptance run.

## Evidence

- [Runtime report](runtime.json): **22 checks, 0 failures**. Both descriptors load through `DuskAssetAssembly`; all character meshes bind to the skeleton; five roles resolve; texture and hand attachment survive import; Godot evaluates **0.700 m** maximum right-arm vertex displacement between attack samples; walk/run roots remain horizontally stationary; rehearsal emits exactly one impact and returns to formation. No accepted tuning file was written.
- [Idle screenshot](idle.png) and [attack screenshot](attack.png): actual Dusk viewport. The standalone static prop sits beside the mannequin; another instance attaches to the right hand. Both are diagnostic assets.
- [Skeletal source/export report](../../candidates/diagnostic.skin-probe/r1/inspection.json): source bounds, rig/rest matrices, geometry/material inventory, action durations and recorded root correction. Walk/run originals retain **1.0 m / 2.4 m** forward travel in the master; exports follow the controller's in-place policy.
- [Blender reimport report](../../candidates/diagnostic.skin-probe/r1/reimport.json): skin/bones retained, **0.922 m** maximum evaluated vertex displacement across the entire character during attack. This is a different measurement domain from the Godot right-arm-only check.
- [Independent GLB checks](../../candidates/diagnostic.skin-probe/r1/structural-checks.json): embedded resources, weighted skin, declared clips and constant horizontal root tracks.
- [Static reimport report](../../candidates/diagnostic.grip-probe/r1/reimport.json): dimensions and texture pixels preserved; source and imported sRGB pixel hashes match.
- [Rebuild report](rebuild.json): two static builds produced the same model SHA-256 (`91a604a7757c0721337fd7d061028d13937ebd1185398311cd9214531fdc78b9`). Manifest timestamps, descriptor paths and `.blend` bytes need not match.
- [Failure-path tests](pipeline-tests.txt): **8 tests pass**, covering source/candidate mutation, unexpected files, command/path injection, missing skin/roles, residual root travel, safe handoff refusal, and immutable download retention.

The fixture cannot establish Kaida topology, palm quality, garment deformation, art quality, believable locomotion, polished grip or final performance. The real source/clip handoff and manual inspection remain in [KAIDA_HANDOFF.md](../../KAIDA_HANDOFF.md).

## Findings incorporated

The sandboxed Blender startup crashed in Metal detection before executing Python; a normally authorized local launch worked. Blender loads texture pixels lazily, so inspection reads them before checking availability. Its glTF importer creates an editor-only Icosphere for bone display; model bounds must exclude actual bone custom-shape objects. Skin bounds use evaluated geometry. Godot sanitizes imported node names and adds the equipment below the skeleton, so the runtime probe counts skinned meshes independently of equipment.

These fixes correct the tooling's measurements. The game descriptor stayed at format 1. Its candidate selector now reads descriptor labels so a new candidate appears as **Skinned diagnostic / NOT KAIDA**, rather than the generic filename `descriptor`.

The first textured import exposed Godot's default image extraction. The game now defaults scene imports to `gltf/embedded_image_handling=3`, keeping lossless textures embedded in the generated scene instead of creating additional editable PNG dependencies. The final runtime check runs after removing this task's extracted copies and reimporting the GLBs; no separate runtime PNG is required. Production source PNGs remain preserved upstream.
