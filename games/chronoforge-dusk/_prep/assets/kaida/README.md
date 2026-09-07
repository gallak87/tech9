# Kaida — supplied Meshy r2

**First five-clip runtime candidate is ready for 03: `kaida/r2`, with a separate energy sword.** The owner says this body is too skinny and may regenerate it, but wants work to continue with this version. Its proportions remain provisional; [review notes](REVIEW_NOTES.md) track that direction and the implications of a replacement.

## Files to use

- **Current five-animation review:** [review file and scene-switching instructions](demos/foundation-r1/README.md). One scene per clip sets its playback range automatically and includes the sword.
- **Current production animation master:** [foundation-r1/master.blend](sources/foundation-r1/master.blend). All five roles, unit-scale rig, motion carrier, grip socket and explicit packed metallic/roughness map.

- **Simple authored wave:** [demo and beginner playback instructions](demos/wave-r1/README.md), a separate review file with an Action Editor for switching wave/idle/run. The owner liked the first wave; this does not change the production source master.
- **Retained idle/run source before finishing:** [master.blend](sources/mixamo-clips-r1/master.blend), the real Kaida with 65 bones, idle/run and the retained original T-pose, plus four packed maps. Press Space for idle; see playback instructions below.
- **Rig before clip assembly:** [base master](sources/mixamo-base-r1/master.blend), with the original returned static T-pose.
- **Successful rigging upload:** [kaida-r2-geometry-only.fbx](exports/mixamo-upload-r2/kaida-r2-geometry-only.fbx), without materials/maps. The earlier textured upload failed. The generic upload recipe also produced [r3](exports/mixamo-upload-r3/kaida-geometry-only.fbx).
- **Inspect as GLB:** [kaida-r2-unrigged.glb](exports/rigging-r1/kaida-r2-unrigged.glb). This has no skin or clips and is not registered as a runtime character candidate.
- **Before placement changes:** [kaida-r2-imported.blend](sources/meshy-r2/kaida-r2-imported.blend), with the supplied PNG maps explicitly wired and packed.
- **Untouched download:** [receipt and hashes](downloads/meshy-r2/receipt.json). The original `/Users/g/Downloads/kaida_r2/` was copied, not moved or renamed.
- **Clearly named working textures:** [source mapping](sources/meshy-r2/source-map.json), retaining the exact base-color, normal, roughness and metallic PNG bytes.

## Returned rig

[Original Mixamo download and receipt](downloads/mixamo-base-r1/receipt.json) retain the owner's returned file unchanged. [Restore metadata](rigging/restore-base-r1.json) drives the reusable local command; [source checks](sources/mixamo-base-r1/preparation.json) show matching bind geometry and per-corner UVs, 65 bones, no unweighted vertices, normalized weights and four restored packed maps. Some vertices have seven influences; those source weights are preserved for later export finishing.

The two-frame `Armature|mixamo.com|Layer0` action is a static T-pose, not an idle clip. It faces opposite the original A-pose. The Blender editor looks at its front, while the rig and action retain the original transforms. The owner liked the rig preview; proportions remain provisional.

## Idle/run assembly

The owner supplied both FBXs directly into [downloads/mixamo-kaida-r2](downloads/mixamo-kaida-r2/receipt.json); their bytes and filenames are unchanged. [Clip metadata](rigging/assemble-clips-r1.json) drives `mixamo_clips`; [assembly checks](sources/mixamo-clips-r1/preparation.json) record matching bone names, hierarchy, rest pose, transforms and included bind mesh/UVs. Source curve data and every integer-frame bone pose match after transfer and save/reopen.

The assembled master opens with `idle.source` active at 30 FPS, frames 1–60. Press Space to play. Select the armature and use the Dope Sheet's Action Editor to switch to `run.source`, then set the timeline to frames 1–23. The run preserves 3.71188 m of forward travel; it is not yet the game's in-place run. The original T-pose remains available separately.

Four scratch renders checked visible idle/run deformation with textures. The knee/boot transitions and bent elbows need later polish; foot contacts, loop seams, grip and game-scale appearance still require review. The source model, rest rig, four packed maps and up to seven influences per vertex remain intact.

## Original preparation and inspection

The supplied FBX contains one mesh, 40,569 vertices, 81,202 triangles, one UV layer, no armature and no actions. Preparation preserved topology, proportions, scale and texture pixels. It wired the four 2048 × 2048 maps, rotated the observed front by 180 degrees into Blender +Y, and grounded the feet. Height remains 1.89819 m. This is the measured source height, not a chosen final character height or collider size.

Base color uses sRGB; normal, roughness and metallic use Non-Color. The supplied tangent normal map has no channel inversion. Both Blender masters pack the maps. The FBX embeds four maps; glTF combines metallic/roughness into a shared texture. The original embedded FBX material and its media remain available in the untouched download.

[Preparation report](inspection/meshy-r2/preparation.json) records settings, tools and before/after measurements. [FBX/GLB reimport results](inspection/meshy-r2/roundtrip.json) confirm 81,202 triangles, matching bounds, UV presence, preserved base-color pixels and the expected unrigged state. The prepared surface has no boundary/nonmanifold edges or degenerate faces under these checks. Those checks do not prove rigging success, deformation quality or visual acceptance.

Inspection views: [front](inspection/meshy-r2/front.png), [back](inspection/meshy-r2/back.png), [side](inspection/meshy-r2/side.png), [hand front](inspection/meshy-r2/hand-front.png), [hand back](inspection/meshy-r2/hand-back.png), [hand side](inspection/meshy-r2/hand-side.png). The inspection lighting is neutral and does not establish Dusk's final presentation. Meshy added brown wristbands absent from the r2 reference; the source preserves that mismatch.

## Reproduction and next step

[prepare_meshy_r2.py](prepare_meshy_r2.py) is the batch-specific preparation record. Run with Blender 5.1.1 and `--background --python-exit-code 1 --python`; it refuses existing output revisions. Reproduction belongs in a clean copy containing the retained download, not over the reviewed masters. [verify_meshy_r2.py](verify_meshy_r2.py) reimports both exports and refreshes reports/views; `-- --render-only` refreshes inspection images alone without saving over the master. A scratch `_prep/.build/` directory is required. [Integrity record](inspection/meshy-r2/integrity.json) hashes the retained preparation outputs and scripts at this checkpoint.

Next: review the first grounded set, then refine it in 03. More Mixamo downloads are optional. [Reusable Mixamo steps](../../MIXAMO.md) document all three automated preparation recipes and their metadata. See the [manual handoff](../../KAIDA_HANDOFF.md) for settings and motion retention. The separate blade now has [new Blender geometry](../kaida.energy-sword/sources/r1/master.blend) based on the retained [2D reference](../../references/kaida/r1/kaida-energy-sword-r1.png). Deformation, grip, stride/blending and visual polish remain 03 work.
