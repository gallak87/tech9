# Kaida — supplied Meshy r2

**Geometry prepared; rig and animations pending.** The owner says this body is too skinny and may regenerate it, but wants work to continue with this version. Its proportions remain provisional; [review notes](REVIEW_NOTES.md) track that direction and the implications of a replacement.

## Files to use

- **Open in Blender:** [kaida-r2-prepared.blend](sources/meshy-r2/kaida-r2-prepared.blend), the real Kaida with four packed maps and normalized placement.
- **Upload for manual rigging:** [kaida-r2-for-mixamo.fbx](exports/rigging-r1/kaida-r2-for-mixamo.fbx), with embedded textures and no sword.
- **Inspect as GLB:** [kaida-r2-unrigged.glb](exports/rigging-r1/kaida-r2-unrigged.glb). This has no skin or clips and is not registered as a runtime character candidate.
- **Before placement changes:** [kaida-r2-imported.blend](sources/meshy-r2/kaida-r2-imported.blend), with the supplied PNG maps explicitly wired and packed.
- **Untouched download:** [receipt and hashes](downloads/meshy-r2/receipt.json). The original `/Users/g/Downloads/kaida_r2/` was copied, not moved or renamed.
- **Clearly named working textures:** [source mapping](sources/meshy-r2/source-map.json), retaining the exact base-color, normal, roughness and metallic PNG bytes.

## Preparation and inspection

The supplied FBX contains one mesh, 40,569 vertices, 81,202 triangles, one UV layer, no armature and no actions. Preparation preserved topology, proportions, scale and texture pixels. It wired the four 2048 × 2048 maps, rotated the observed front by 180 degrees into Blender +Y, and grounded the feet. Height remains 1.89819 m. This is the measured source height, not a chosen final character height or collider size.

Base color uses sRGB; normal, roughness and metallic use Non-Color. The supplied tangent normal map has no channel inversion. Both Blender masters pack the maps. The FBX embeds four maps; glTF combines metallic/roughness into a shared texture. The original embedded FBX material and its media remain available in the untouched download.

[Preparation report](inspection/meshy-r2/preparation.json) records settings, tools and before/after measurements. [FBX/GLB reimport results](inspection/meshy-r2/roundtrip.json) confirm 81,202 triangles, matching bounds, UV presence, preserved base-color pixels and the expected unrigged state. The prepared surface has no boundary/nonmanifold edges or degenerate faces under these checks. Those checks do not prove rigging success, deformation quality or visual acceptance.

Inspection views: [front](inspection/meshy-r2/front.png), [back](inspection/meshy-r2/back.png), [side](inspection/meshy-r2/side.png), [hand front](inspection/meshy-r2/hand-front.png), [hand back](inspection/meshy-r2/hand-back.png), [hand side](inspection/meshy-r2/hand-side.png). The inspection lighting is neutral and does not establish Dusk's final presentation. Meshy added brown wristbands absent from the r2 reference; the source preserves that mismatch.

## Reproduction and next step

[prepare_meshy_r2.py](prepare_meshy_r2.py) is the batch-specific preparation record. Run with Blender 5.1.1 and `--background --python-exit-code 1 --python`; it refuses existing output revisions. Reproduction belongs in a clean copy containing the retained download, not over the reviewed masters. [verify_meshy_r2.py](verify_meshy_r2.py) reimports both exports and refreshes reports/views; `-- --render-only` refreshes inspection images alone without saving over the master. A scratch `_prep/.build/` directory is required. [Integrity record](inspection/meshy-r2/integrity.json) hashes the retained preparation outputs and scripts at this checkpoint.

Next: return a rigged base with skin and one idle clip for that same character. Then verify the first pair before collecting walk, run, attack and hurt. See the [manual handoff](../../KAIDA_HANDOFF.md) for settings and motion retention. The separate blade remains a [2D reference](../../references/kaida/r1/kaida-energy-sword-r1.png); weapon modeling, skin weights, animations and a finished game candidate are still outstanding.
