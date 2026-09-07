# Kaida source review

**Current disposition — 2026-09-07:** the owner wants “good enough” to keep overall progress moving. Use foundation R3 / runtime r4 and sword r2 as the provisional integration baseline. The previous visual objections remain recorded below, but another grip/attack polishing pass, body regeneration or Mixamo download does not block 03. See the [phase-one cutoff](../../../DECISIONS.md#phase-one-quality-cutoff--2026-09-07). Fix missing/broken functionality; defer finer grip contact, body proportions and attack naturalness.

## Owner direction — 2026-09-07

The current Meshy r2 model is **too skinny**. The owner may regenerate her with fuller proportions later, but explicitly wants to keep working with this model for now. Treat its body proportions as provisional, not visually accepted. Do not thicken or regenerate the current mesh without a new direction; continue preparation and the rigging/export proof with the supplied geometry.

A replacement body should be a new immutable source/candidate revision. Expect another rig/weight pass and verification of clip compatibility, contacts, collision dimensions and the separate sword grip. The source-retention workflow, named animation roles and game integration can carry forward. Retargeting is assessed against the actual replacement rig/rest pose; existing animations are not assumed to transfer unchanged. Settle body proportions before extensive deformation and animation polish in 03.

## Inspection observations

- Meshy added small brown wristbands, despite the r2 reference's exposed forearms/wrists. Record this mismatch for the next visual pass. The supplied source and current working geometry preserve them.
- Front/back/side hand close-ups show separate fingers. Finger webs and the thumb profile have uneven contours; inspect finger curl and sword grip after rigging before investing in local cleanup. The six retained renders are source inspection, not deformation approval.
- The returned Mixamo base has 65 bones and a static two-frame T-pose. The owner liked its rig preview; the five gameplay clips are now available, with hand/joint deformation refinement pending in 03.
- The separate sword now has authored Blender geometry and a runtime dependency. It was not included in the humanoid upload.

## Mixamo upload lesson

The 81,202-triangle textured FBX failed before marker placement. Removing material/media content let the same geometry upload and rig successfully; no 24k reduction was needed. Use the reusable `mixamo_upload` and `mixamo_restore` steps in [MIXAMO.md](../../MIXAMO.md) for subsequent characters. The original download, materials and source weights remain retained.

## First grounded animation review — correction required

The owner inspected `demos/foundation-r1/kaida-foundation-review.blend` and found the sword fingers bending the wrong way and the rising elbow unnatural. These are defects in the authored grip/arm pass, not evidence that the model needs regeneration. Runtime r2 passes integration checks but is not visually accepted. Correct finger flexion toward the palm, the thumb wrap, elbow path and wrist rotation, then inspect close-ups through the full strike before replacing the review file.

## Follow-up grip fit — review pending

The owner also rejected `foundation-r2`: fingers still failed to enclose the shaft. Its runtime r3 was exported/imported but did not receive a new native probe or visual acceptance. The label “corrected grip and arm” was premature.

[Foundation R3](demos/foundation-r3/README.md) moves the socket forward near the knuckles, angles it across the palm, uses individual finger poses and thumb targets, and fits a narrower handle. Palm/back/fingertip source close-ups were inspected at frames 1, 15 and 21, with all attack frames rendered/measured. The generated hand contours and grip pressure still merit owner review. The slash remains a motion draft; a suitable source attack plus local cleanup is the recommended next quality pass. No body regeneration or proportion edits were made.
