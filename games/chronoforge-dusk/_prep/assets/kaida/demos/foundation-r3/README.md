# Kaida — fitted grip review (foundation R3)

Open [kaida-foundation-r3-review.blend](kaida-foundation-r3-review.blend). This is the current review. **The grip has a new fit; the authored attack remains a provisional motion draft.** The owner rejected the earlier grip and unnatural arm lift. Native integration success is not visual acceptance.

**Current cutoff:** the owner has asked for “good enough” so overall progress continues. Keep this revision as the provisional baseline and move on to 03's gameplay integration. Finer grip/attack polish and a replacement body are deferred; no new Mixamo input is required. Final visual acceptance remains separate from permission to keep building with this version.

Press **Space** to play/pause. Use the **Scene dropdown at the top right** for **01 Idle**, **02 Walk**, **03 Run**, **04 Attack**, or **05 Hurt**. Each scene selects its own action and playback range. **Shift+Left Arrow** goes to the beginning. Headless saves do not update an already open Blender file.

The handle now crosses near the knuckles on a diagonal; each finger has its own pose and the thumb crosses the grip. Only the handle and binding cross-section became 30% narrower; blade, guard and length retain their design. Elbow positioning keeps the hand beside the head during wind-up. Wrist orientation accounts for the diagonal grip and forearm direction. [Palm](inspection/grip-001-palm.png), [back](inspection/grip-001-back.png), and [contact close-up](inspection/grip-021-fingertips.png) show the evaluated source.

All 41 attack frames were rendered and measured; wind-up, contact, follow-through and recovery poses were inspected along with three hand views at frames 1, 15 and 21. [Measurements](inspection/motion-check.json) report a maximum hand/forearm-axis angle of 30.58 degrees and elbow flexion of 112.68 degrees. These are geometric observations, not an anatomical quality score. Remaining concerns include grip pressure/thumb contact, generated hand contours, whole-body weight transfer, foot planting, timing and blending. Starting a later slash from a suitable Mixamo clip is a reasonable way to reduce motion-authoring work; it still needs local grip/contact cleanup.

| Stage | Current revision |
| --- | --- |
| Meshy geometry | r2, unchanged provisional body |
| Production rig/actions | [foundation-r3/master.blend](../../sources/foundation-r3/master.blend) |
| Review scenes | foundation-r3, this folder |
| Runtime character | kaida/r4 |
| Separate runtime sword | kaida.energy-sword/r2 |

Run `python3 tools/native.py run` from Dusk and choose **Kaida / grip-fit review**. **1** inspects clips; **2** enables traversal (WASD/Shift); **3**, then **Space**, runs approach/attack/recovery/return. The attack spans frames 1–41 at 30 FPS, with contact at 21. Godot owns travel. No additional Mixamo input blocks this draft's integration; polished combat remains 03 work. The packaged app is not rebuilt by import.

## Repeat the check

[grip_pose.py](../../grip_pose.py) contains this rig's fitted hand-local pose, used by [author_foundation.py](../../author_foundation.py). These values must be re-fit for a changed hand or weapon. They are not universal rig defaults. [render_foundation_review.py](../../render_foundation_review.py) renders every attack frame and close-ups without saving or modifying the source:

```sh
blender --background --python-exit-code 1 --python _prep/assets/kaida/render_foundation_review.py -- foundation-r3 r2 _prep/.build/NEW_REVIEW_DIRECTORY
python3 _prep/pipeline.py verify _prep/candidates/kaida/r4/manifest.json
python3 _prep/pipeline.py verify _prep/candidates/kaida.energy-sword/r2/manifest.json
```

The output directory must be new. For new source iterations, run the authoring scripts with fresh revisions, select their paths in the review generator and production metadata, and refresh all declared input hashes before building. The review file contains scene copies for playback and is not the export source. See [native evidence](../../../../evidence/kaida-r4/README.md) for runtime checks and their limits.
