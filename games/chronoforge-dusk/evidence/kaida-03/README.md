# 03 — Kaida gameplay review

The playable increment uses the unchanged `kaida/r4` / `kaida.energy-sword/r2` handoff. Owner motion/visual acceptance is pending. **Stop for owner review before 04.**

## Checkpoints and checks so far

- `ee4fa7d`: default Kaida, quicker starts/stops/turning and displacement-driven stride playback. [46 foundation regressions](locomotion-regression.json) and [four cold-restart checks](locomotion-restart.json) passed in the editor binary’s rendered game window.
- Rehearsal checkpoint: [55 focused Kaida checks](editor-kaida.json) and [four Kaida cold-restart checks](editor-kaida-restart.json) passed. The source digest in these reports identifies the tested files before committing them. Packaged native verification follows this checkpoint.

The authored attack is retimed, with an explicit plant, exact source contact at 0.666667 seconds (halfway through the source clip), 65 ms hit stop, hurt/defeat reaction, sound/effect events and return to formation. Clip time and impact use one physics timeline. The eight-cycle repetition check verifies exactly one swing and impact presentation event per action and no leftover action state. Kaida’s basic defeat holds hurt while tipping to the ground; it is a presentation draft, not a new source animation or ragdoll.

Walk defaults to 2.3 m/s and run to 5.1 m/s. Source stride calibration is 2.28 / 5.06165 m/s. Acceleration is 28 m/s², braking 36 m/s², with exponential turning response 18. The camera uses yaw 25°, pitch 34°, size 9.6 with game lighting. F6/F7 save and reproduce traversal, stride, attack, hit-stop, camera and light settings outside generated imports. Tests use their own save, preserving the owner’s acceptance file.

## Findings retained

[First pass](first-pass-diagnostics.json) had four failed checks. The static sampler retained an animation blend, socket reads were taken before the attachment update, a hit-stop assertion ran after the physics event, and the slow-motion test used scaled timers. Those checks were corrected to sample an unblended clip, read the evaluated bone pose, observe the impact signal, and wait in wall time.

[The corrected diagnostic then exposed a real contact miss](contact-miss-diagnostics.json): the blade passed 0.540 m from the target’s torso center. The game-owned contact position is now `(0.79, 0.02, -0.54)` with a −20° Kaida strike-facing offset. The blade passes 0.154 m from the torso center at the logical impact, within the target body. No grip offsets, meshes, source clips or production descriptors changed to produce this correction.

## Review scope and limits

The original battle/overworld sprites were viewed directly as visual references. New runtime work stays in Dusk; no Dawn/prototype code or assets were copied. Sound cues are original deterministic synthesis, reproducible with `python3 tools/generate_rehearsal_audio.py`.

Complete clips were sampled for root/socket stability and attack poses were inspected in native viewport captures. The generated body remains slender, finger contact and weight transfer remain provisional, and the basic fall can intersect nearby props. The target remains a labeled diagnostic mannequin. These are deferred presentation refinements under the owner’s cutoff, not claims of final character acceptance.

The Mac was locked when direct UI control was attempted. Rendered test windows ran, but direct OS-keyboard play, audible cue judgment, real focus/minimize behavior and the owner’s subjective movement/attack review remain unverified. Focus throttling is exercised through the existing game handler in test mode. GPU timing is unavailable. Reported frame intervals include pacing; capture/readback intervals are separated from normal-play samples.
