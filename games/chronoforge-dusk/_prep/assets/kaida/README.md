# Kaida a1 source

**Current release: [a1](../../../releases/kaida-a1.md). Stable model generation: r2.**

| Input or output | Location |
| --- | --- |
| Current editable rig and five clips | [sources/a1/master.blend](sources/a1/master.blend) |
| Source textures | [sources/a1/textures](sources/a1/textures) |
| Export recipe and hashed inputs | [asset.json](asset.json) |
| Prepared release package | [a1 manifest](../../candidates/kaida/a1/manifest.json) |
| Runtime descriptor | [game a1](../../../game/assets/kaida/a1/descriptor.json) |
| Original model and maps | [Meshy receipt](downloads/meshy-r2/receipt.json) |
| Original rig | [Mixamo base receipt](downloads/mixamo-base-r1/receipt.json) |
| Original motion clips | [Mixamo clip receipt](downloads/mixamo-kaida-r2/receipt.json) |
| Editable sword | [Sword master](../kaida.energy-sword/sources/r2/master.blend) |

The character master contains idle, walk, run, attack and hurt actions, a unit-scale rig, MotionRoot and SwordSocket. Materials are packed in the Blender file; editable map files are retained beside it. The game owns displacement, facing, stride matching and action timing.

## Export and verification

Run from the Dusk directory:

```sh
python3 _prep/pipeline.py inspect _prep/assets/kaida/asset.json
python3 _prep/pipeline.py verify _prep/candidates/kaida/a1/manifest.json
python3 tools/native.py test
```

The package is already built. `pipeline.py build` refuses existing output identities. For future work, use a new preparation identity, update source hashes and verify the resulting native game. Graduation establishes the next alpha checkpoint and removes superseded working copies. Git retains prior iterations.

## Production constraints

Keep the original download bytes and source motion. Solve weapon carry after establishing in-place motion. Inspect hand loops, feet and contact at gameplay scale. A changed body or weapon requires actual rig, weight, clip and grip checks; matching bone names alone do not prove compatibility.

[Current visual limits](REVIEW_NOTES.md). No new source downloads are required for a1.
