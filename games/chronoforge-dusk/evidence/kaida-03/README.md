# 03 — Kaida gameplay review

The owner-requested playable release is **[Kaida r2 / Alpha a1](../../releases/kaida-a1.md)**, selecting prepared export r5 / sword r2 from the same r2 model generation. Movement, complete strike rehearsal, basic reactions and reproducible tuning are implemented under the owner’s first-pass cutoff. Final art polish remains open. **Stop for owner review before 04.**

## Checkpoints and validation

- `ee4fa7d`: responsive starts/stops/turning and displacement-driven stride playback. [46 foundation regressions](locomotion-regression.json) and [four cold-restart checks](locomotion-restart.json) passed in the editor binary’s rendered game window.
- `5809a26`: strike timing, physical blade contact, feedback and reactions. [55 editor Kaida checks](editor-kaida.json) / [four restart checks](editor-kaida-restart.json), then [55 packaged native checks](native-kaida.json) / [four native restart checks](native-kaida-restart.json) passed. The packaged app also passed [46 foundation regressions](native-regression.json) and [four restarts](native-regression-restart.json). [r4 bundle receipt](native-build.json).
- `4f022a5`: owner-reported periodic run-hand snap fixed in a preserved r5 source and immutable candidate. [Precommit native run](r5-precommit-native-kaida.json) passed 56 checks, including the new repeated-loop regression; [four fresh-process restores](r5-precommit-native-kaida-restart.json) passed. r4 was then kept in the catalog for older saves. The subsequent committed-build run was interrupted by owner input and is not counted; [its log](r5-interrupted-native.log) is retained. The clean alpha rerun supersedes it.

The focused suite checks all five clips and root ownership, real rig/equipment identity, continuous run loops, walking/running/stopping, wall and ramp collision, turns, hurt/defeat/reset, exact contact and hit stop, paused/stepped/quarter-speed action, eight repeated strikes, finisher/reset, canceled actions, six candidate reloads, four Kaidas, saved tuning and a fresh-process restore. Automated gameplay checks exercise the actual scene and Godot input event path. They do not establish subjective acceptance.

The clean alpha rerun passed **61 focused native checks + six fresh-process restart checks**, with matching invocation IDs/source digests and no external input: [native report](a1-native-kaida.json), [restart](a1-native-kaida-restart.json), [full log](a1-native-kaida.log). This includes the fixed four-instance layout and running contact (root height −0.00051 m within the floor tolerance; minimum horizontal separation 0.64050 m). [Four grounded instances](a1-kaida-four-instances.png).

The same source passed [47 foundation regressions](a1-native-regression.json) and [five foundation restarts](a1-native-regression-restart.json). [Full log](a1-native-regression.log). Four Python helper regression tests passed, and `git diff --check` was clean.

## Play and reproduce

Open `dist/Chronoforge Dusk.app`; [native instructions](../../NATIVE.md) include rebuild/test commands. The current default is **Kaida r2 / Alpha a1**. An explicitly saved older candidate remains available as a previous export; select the alpha entry to review this release. WASD/arrows move, Shift runs, **3 then Space** performs a strike, K finishes the target and R resets/replays. F1 hides the panel; T slows to quarter speed; P/Step pause and advance; M shows diagnostic rig/blade/target markers. F6/F7 save/restore the candidate and tuning. Tests use separate saves and leave the owner’s acceptance file alone.

Walk/run defaults are 2.3/5.1 m/s, source stride 2.28/5.06165 m/s, acceleration 28 m/s², braking 36 m/s² and exponential turn response 18. Camera yaw/pitch/size are 25°/34°/9.6 with game lighting. The game owns displacement; source clips remain in place.

The authored attack has approach, a short plant, retimed source animation, contact at source time 0.666667 seconds, 65 ms hit stop, hurt/defeat and sound/effect events, recovery and return. Clip time and impact share one physics timeline. Eight repetitions verify exactly one swing/impact event per action and no leftover action state. Basic defeat holds hurt while tipping to the ground; it remains a presentation draft.

## Run-hand fix

The owner reported that holding Shift made the sword hand shoot outward each second. The 0.733-second run loop reproduced a **0.486 m** one-frame jump in the imported r4 GLB. The carry arm had been solved against a world-space wrist target while the source root traveled; removing that travel afterward left the arm stretched backward and snapping at the loop boundary.

[The correction script](../../_prep/assets/kaida/fix_run_carry.py) solves only the right arm/hand in the already in-place source. [Source measurements](../../_prep/assets/kaida/sources/run-carry-r2/correction.json) confirm identical hashes for idle, walk, attack and hurt, unchanged unrelated body poses, and a continuous loop seam. Mesh, weights, maps and sword r2 are preserved. The runtime maximum hand step is now **0.0181 m** at 60 Hz across multiple loops ([before/after results](run-carry-fix.json)); the regression threshold is 0.08 m.

Current model SHA-256: `ce8669efca5b747b34c35a44fb95f82e97ec153e422cf8ae5bacbb2dcc8b3fa0`. [r5 manifest](../../_prep/candidates/kaida/r5/manifest.json), GLB reimport and structural checks passed. The original r4 master and candidate remain intact.

## Instance collision and test integrity

The owner observed Kaida above another instance during automated testing. [The isolated overlap probe](instance-spawn-diagnostic.json) reproduced a 1.897 m rise when two capsules occupied the same spawn. The test layout now resets the controlled actor before creating the three copies. A new native running-contact assertion showed that resetting the player alone was insufficient ([first alpha diagnostic](a1-first-pass.json)): the actor was still 1.898 m above the floor despite zero external input.

A cylinder experiment failed the ramp and instance checks ([diagnostic](a1-cylinder-diagnostic.json)) and was discarded. The original capsule controller remains. Copies now receive their final position **before** entering the tree and installing their collider, preventing temporary overlap at the origin while loading. The native suite rechecks the ramp, walls, running contact, separation and four grounded instances. No model, clip or collider redesign is part of the final spawn-order fix.

Synthetic test keys carry a marker; actual keyboard/mouse presses mark a run as interfered. The native helper requires a completed zero-failure report with a fresh invocation ID, matching game source digest and expected editor/native mode. Early quit, stale reports and interfered runs are rejected; [four helper regression tests](../../tools/test_native.py) cover those cases. The app labels automated runs clearly. The clean alpha rerun is performed before committing the release. The stable game source digest is `6c5ffa22575c618e6b9b4c467a275e0fee47f5f4a40b09a6ac140689f5198f70`; the precommit report’s `+dirty` label identifies the uncommitted checkpoint, while that digest identifies the exact tested files.

## Native performance

Measured on Apple M1 Pro / macOS 26.4.1, Godot 4.6.3 Forward+ on Metal, 1920×1080 internal viewport, 1440×810 window, 2× display scale, 60 FPS active cap. The clean alpha native report provides per-interval results. Frame intervals include pacing; they are not GPU timings. Each normal interval stores at most 600 samples, so the eight-cycle strike result represents its final approximately ten seconds. Capture/readback and reload intervals are separate.


| Alpha a1 interval | Samples | Mean ms | p95 ms | Max ms | Frames >33.34 ms | Video MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Neutral idle | 599 | 16.66 | 18.22 | 19.62 | 0 | 223.9 |
| Traversal / turns | 600 | 16.67 | 17.77 | 18.68 | 0 | 223.9 |
| Repeated strikes | 600 | 16.67 | 18.40 | 19.37 | 0 | 223.9 |
| Four Kaidas | 595 | 16.65 | 18.66 | 23.35 | 0 | 226.7 |

The [initial r4 native run](native-kaida.json) averaged 16.7–17.2 ms in normal scenes but recorded four repeated-strike intervals over 33.34 ms, with a 189.6 ms maximum. The corrected-r5 precommit run averaged about 16.67 ms; traversal, repeated strikes and four-Kaida intervals had zero frames over 33.34 ms. That is a measured run, not a guarantee against stalls. GPU timing is unavailable; `engine_process_ms` is a last-sample engine monitor, not total CPU frame cost. Pause/inactive targets remain 30/10 FPS.

## Other findings and review limits

[The first diagnostic run](first-pass-diagnostics.json) had stale animation blending/socket samples and mistimed assertions. Corrected sampling then exposed [a real contact miss](contact-miss-diagnostics.json): the blade passed 0.540 m from the target torso center. The game contact position `(0.79, 0.02, -0.54)` and −20° facing offset reduce that to 0.154 m, within the body. No grip or asset changes were used to move the attack contact. [r5 contact capture](r5-kaida-contact.png), [neutral inspection](r5-kaida-neutral.png), [traversal](r5-kaida-traverse.png) and [basic defeat](r5-kaida-defeat.png) show the tested runtime.

The original battle/overworld sprites were inspected as visual references. Runtime work stays in Dusk; no Dawn/prototype code or production assets were copied. Sound cues are original deterministic synthesis, reproducible with `python3 tools/generate_rehearsal_audio.py`.

The Mac was initially locked, so early tests were scripted rendered runs. After unlocking, the owner launched/played the app and reported the run-arm defect above. Direct UI inspection also observed the r5 native rehearsal. Audible quality, comprehensive OS focus/minimize behavior and subjective movement/attack feel still require owner review; test focus throttling uses the runtime focus handler in isolation.

The earlier blank-world report was initially deferred at the owner’s request. A normal-launch alpha spot-check reproduced it before any movement input ([failure report](a1-startup-failure.json)). The same spawn ordering affected the hidden target: bodies and collision offsets were activated before their final positions were assigned. The target/player are now positioned before entering the tree, and each collider offset is set before its shape is activated. A normal native launch, with only F9 pressed and no reset, stayed at `(0, 0.000046, 0)` and rendered the patch correctly ([normal-startup report](a1-normal-startup.json)). The Kaida suite also observes cold startup before any test reload or placement.

Remaining optional refinement: fuller proportions, finer finger contact, more natural weight transfer, smoother trail appearance and a proper authored defeat. The draft fall can intersect props, and the target is a labeled diagnostic mannequin. These remain within the owner’s first-pass cutoff; they are not claims of final character quality. **04 has not begun.**
