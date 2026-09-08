# Kaida a1 handoff

**Current playable release: [a1](../releases/kaida-a1.md). Model generation: r2.**

| Item | Current state |
| --- | --- |
| Character source | [a1/master.blend](assets/kaida/sources/a1/master.blend) |
| Production recipe | [asset.json](assets/kaida/asset.json), `skeletal_blend` |
| Prepared package | [kaida/a1](candidates/kaida/a1/manifest.json) |
| Runtime asset | [kaida/a1](../game/assets/kaida/a1/descriptor.json) |
| Clips | idle, walk (Running.fbx), run (Fast Run.fbx), attack, hurt |
| Equipment | Separate energy sword on SwordSocket |
| Displacement | Game controller; in-place runtime clips |
| Original inputs | [Model, rig and clips](assets/kaida/README.md) |
| Gameplay verification | [Native release evidence](../evidence/kaida-03/README.md) |

The original model has 81,202 triangles. The finished runtime rig has 67 bones. The supplied mesh and texture design remain the r2 model generation. Kaida a1 includes responsive traversal, a complete strike/recovery/return action, basic reactions and saved tuning.

## Rebuild

The checked-in package can be verified and handed off without Blender:

```sh
python3 _prep/pipeline.py verify _prep/candidates/kaida/a1/manifest.json
python3 _prep/pipeline.py handoff _prep/candidates/kaida/a1/manifest.json --register
python3 tools/native.py import
python3 tools/native.py export
```

The current master and hashed source maps support future edits. Preparation uses pinned Blender 5.1.1; export uses Godot 4.6.3. Existing package identities refuse overwrite. Prior iterations are retained by Git rather than duplicated in the working tree.

## Pitfalls

- Preserve source geometry, texture pixels and original motion downloads. Hosted acquisition settings that were not supplied remain unknown in the receipts.
- Solve carried equipment in the same in-place space used by the exported animation. Inspect complete loops, including the wrap.
- Set actor positions and collider offsets before activating physics shapes. Inspect ordinary startup before test resets.
- A changed body or blade requires fresh grip/rig/clip compatibility checks.
- Keep contact timing and movement ownership in the game. The import descriptor does not own gameplay damage or effects.

[Visual limits](assets/kaida/REVIEW_NOTES.md) remain within the alpha cutoff. No additional Meshy or Mixamo inputs are needed. **04 is paused.**
