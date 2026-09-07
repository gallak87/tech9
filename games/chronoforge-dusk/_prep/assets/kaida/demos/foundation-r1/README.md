# Kaida — first grounded animation review

Open [kaida-foundation-review.blend](kaida-foundation-review.blend). This is the current review file, with the separate sword included. The earlier `kaida-wave-demo.blend` only contains the earlier wave/idle/run experiment. Work saved by a headless Blender process does not update another open Blender window.

Press **Space** to play/pause. Use the **Scene dropdown at the top right** to choose a clip. Each scene sets its frame range automatically; leave its Action Editor assignment as-is. **Shift+Left Arrow** returns to the beginning.

| Scene | Frames at 30 FPS | Source |
| --- | --- | --- |
| 01 Idle | 1–60 | Retained Mixamo idle, corrected for in-place use and sword carry |
| 02 Walk | 1–21 | Authored contact/swing cycle |
| 03 Run | 1–23 | Retained Mixamo run, with source travel removed and sword carry adjusted |
| 04 Attack | 1–41 | Authored planted slash; wind-up 15, contact 21, follow-through 25, recovery complete 41 |
| 05 Hurt | 1–24 | Authored standing recoil and recovery |

All five source actions are in [the production master](../../sources/foundation-r1/master.blend). The review file contains separate scene instances for convenient playback, so do not feed it into the runtime exporter. The original Mixamo rig/actions remain in [the retained source master](../../sources/mixamo-clips-r1/master.blend); the original wave remains separate and unchanged.

**Game candidate:** `res://assets/kaida/r2/descriptor.json`, with `kaida.energy-sword/r1` as a separate dependency. Runtime r1 is retained as an earlier timing revision; r2 starts each clip at time zero, matching the authored halfway contact. Meshy source r2, production source `foundation-r1`, review revision `foundation-r1`, and runtime revision r2 identify different stages.

Run `python3 tools/native.py run` from Dusk. Choose **Kaida r2 / grounded first pass** in Prepared Candidate. **1** inspects individual clips, **2** enables traversal (WASD and Shift), and **3**, then **Space**, runs approach/attack/recovery/return against the foundation target. The packaged `.app` was not rebuilt by this source/import handoff.

This set unlocks 03; it is a first pass. Review the thin provisional body, knee/boot and elbow deformation, finger wrap, sword carry/strike silhouette, foot planting, and transitions. Walk’s nominal stride speed is 2.28 m/s and the retained run’s is about 5.06 m/s; 03 must match playback and controller speeds and tune the approach stop. No aerial moves or full ATB combat were added.

**Owner review: correction required.** The fingers curl backward and the rising elbow looks unnatural. This first pass is retained for comparison; the next pass is correcting the grip and arm path. The native smoke check did not establish visual quality.

## Reproduce and iterate

Run from Dusk with the pinned Blender 5.1.1. Authoring scripts refuse existing revisions. Use a fresh revision for deliberate iteration, update the explicitly selected source paths in the review script/production metadata, and refresh source hashes before a build.

```sh
blender --background --python-exit-code 1 --python _prep/assets/kaida/author_foundation.py -- NEW_SOURCE_REVISION
blender --background --python-exit-code 1 --python _prep/assets/kaida/author_sword.py -- NEW_SWORD_REVISION
blender --background --python-exit-code 1 --python _prep/assets/kaida/make_foundation_review.py -- NEW_REVIEW_REVISION

# Existing candidate bytes can be verified without rebuilding.
python3 _prep/pipeline.py verify _prep/candidates/kaida/r2/manifest.json
python3 _prep/pipeline.py verify _prep/candidates/kaida.energy-sword/r1/manifest.json
```

[Production metadata](../../asset.json) maps the five roles to actual action names and declares the socket/dependency. [Authoring measurements](../../sources/foundation-r1/authoring.json) retain source hashes, extracted travel and influence reduction. [Native evidence](../../../../evidence/kaida-r2/README.md) records the integration checks and their limits. No extra Mixamo download is required for this first set.
