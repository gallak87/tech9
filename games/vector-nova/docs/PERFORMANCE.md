# Gate 2 measurement — qualified browser evidence

Target: sustained foreground 60fps at 1920×1080 on Apple M1 Pro, high preset.
Budgets: 16.7ms, 1,000 calls, 2M triangles, 512MiB estimated GPU assets, 30MB
compressed initial transfer. Foreground certification remains unverified: the
user requested hidden local review sessions with no unsolicited visible windows.

The independent critic uses Chrome 153.0.8010.53, Apple M1 Pro/Metal ANGLE,
macOS arm64, 16GB RAM, 1920×1080, DPR1, high. In round 1, two keyboard-driven
laps completed in 68.408s with valid checkpoint order, zero impacts and zero
browser/page/request errors. Its isolated full-lap sample measured 4,106 frames:
p50/p95 16.7ms, p99/max 16.8ms, zero intervals over 33.3ms, maximum 653 calls
and 1,532,791 triangles, estimated 314.6MiB GPU assets.

Later isolated samples cover start/climb/bank/drop for about 25 seconds, with no
recording, screenshots or concurrent browser tests. They are not full-course or
foreground certification.

| Round | Frames | p50 / p95 / p99 (ms) | Maximum (ms) | >33.3ms | Max calls / triangles | Estimated GPU MiB |
| ----- | -----: | -------------------- | -----------: | ------: | --------------------- | ----------------: |
| 2     |  1,502 | 16.7 / 16.7 / 16.8   |         16.8 |       0 | 780 / 1,706,101       |             338.3 |
| 3     |  1,501 | 16.7 / 16.8 / 16.8   |         16.8 |       0 | 769 / 1,686,167       |             343.5 |
| 4     |  1,499 | 16.7 / 16.8 / 16.8   |         33.4 |       1 | 780 / 1,707,419       |             373.4 |

These headless observations establish only the tested browser behavior and
budget measurements. Physical gamepad/mobile testing and independent audio
listening are unverified. Offline audio rendering verified finite samples,
full-volume peak 0.482 and silent mute/pause windows; this is not an audition.

The GPU estimate sums owned geometry/maps and approximate PMREM, shadow, HDR
postprocess and framebuffer allocations. It excludes driver overhead. The high
renderer uses single-sample HDR, GTAO, restrained bloom, OutputPass and SMAA; an
observed ANGLE Metal opaque-region bug with GTAO/MSAA was reproduced and resolved
by this pipeline. Low omits postprocessing. Startup warms shaders and render
passes before readiness.

Final build transfer is approximately 242.6KB gzip for HTML/JS/CSS plus a
1,504,842-byte original cloud panorama PNG. Procedural geometry/textures allocate
at boot. The JS chunk exceeds Vite's 500KB uncompressed advisory because it
includes Three.js and SMAA lookup data; initial transfer remains below budget.
Additional circuits/streaming remain deferred.

Current findings and build identity are in GATE2_CRITIQUE.md and STATUS.json.
Do not apply historical Gate-1 3.6km measurements to this level. Transient raw
reports and stills stay under ignored .experiments/gate2-critic/round-N/. No new
videos are recorded. The user ended further critique after round 4. Final build `index-CWszhmZj.js`
passed a short integrator production smoke check: title keyboard start, brief
throttle/boost input in start/bank/tunnel/return, pause, and zero runtime or asset
errors. These four samples peaked at 632 calls and 1,540,523 triangles with
375.7MiB estimated GPU assets. They are not a full-course maximum or isolated
timing benchmark. The normal-speed full-lap rerun was skipped at user request;
the earlier valid 68.408-second lap remains the completed lap check.

## Signature revision (0.2.1)

Checkpoint before the revision: `04a84460`. The new production build is
`index-BixP6cDB.js`. Actual three-dimensional centreline arc length remains
7,200m. The fast numerical traversal completed in approximately 213ms wall time
with a valid simulated 68.758s lap, zero impacts and minimum camera clearance
4.78m. This is a numerical check, not real-time driving evidence. No real-time
full lap or critic round was run for this revision, per user instruction.

Eleven short production-browser checks passed: the signature review link,
stationary inversion, visible steering direction while inverted, recovery,
brief actual-keyboard motion through inversion/drop/exit and pause. No runtime
or asset errors. Captured samples peaked at682 calls /1,631,663 triangles and
estimated372.5MiB GPU assets; these are sampled values, not a full-course maximum
or controlled timing benchmark. Foreground performance remains unverified.

Build transfer is about244.5KB gzip HTML/JS/CSS plus the unchanged 1.5 MB sky.
Temporary stills/reports are ignored in `.experiments/signature-revision/`.
Gate 2 remains explicitly unapproved and awaits the user's playtest.

## Compact pacing and light stability revision (0.2.2)

Current build: `index-DIQH_RTe.js`. Actual centreline is 5,000 m, with 0.3 automatic bend assistance. A fast numerical full-circuit traversal took 261 ms wall time, completed a valid 47.175 s simulated lap with zero impacts and minimum 4.83 m camera clearance. No normal-speed full lap or critic round was run.

All 55 unit tests and 43 production-browser checks pass, including visible inverted steering, stationary hold, counter-steering, recovery, replay, storage failure and the opening launch. Eighteen short scene samples peaked at 672 calls / 1,275,289 triangles and estimated 353.4 MiB GPU assets. These are sampled values, not full-course maxima or a controlled timing benchmark; foreground performance and human driving feel remain playtest items.

The reported road flicker had two supported causes: active lamp pools could disappear at nonzero intensity, and thin expansion seals intersected the tessellated road. The same three-light pool now uses continuous fades and stable fixture assignments. All 564 new seal triangles were checked at 8 mm road clearance; 20,002 forward/reverse updates checked pooled-light continuity and finite geometry. City clearance checks found no intersections across 1,506 road probes and 114 support axes.

Transfer is about 246.5 KB gzip for HTML/JS/CSS plus the unchanged 1.5 MB sky. Temporary checks stay under ignored `.experiments/pacing-revision/`. Gate 2 remains unapproved.

## Gate 3 orbital — round 2 candidate measurements

Production script `/assets/index-C_rmn5EE.js`, `?level=orbital`, hidden Chrome 154 / Apple M1 Pro ANGLE Metal, 1920×1080 DPR1 with high/low and responsive checks. The integrator's 42 real-browser checks passed with zero runtime/load errors; 66 automated tests and full lint also passed. These checks use short actual keyboard runs, sequential stills and snapshots, not a normal-speed full-lap replay.

Sampled orbital render peaks: **400 calls / 1,355,613 triangles / 419.36 MiB estimated GPU assets**. Source counts differ from rendered totals because shadows and postprocessing add passes. Planet maps total 5,583,650 bytes on disk and approximately 112 MiB decoded with mips. Environment source: 14 sites, 131 batches, 271,176 triangles, 6,261 clearance-tested component bounds and two 256px finish maps. Track source: 50 meshes / 256,891 triangles. These remain below existing graphics/asset budgets.

Screenshot-run frame timings include capture stalls and are not performance certification. The independent round 1 isolated samples are recorded in GATE3_CRITIQUE.md; they do not certify the revised round 2 build. Actual foreground pacing, physical devices and audio listening remain unverified under the user's review preferences. Current independent findings and later measurements supersede this intermediate candidate.

## Orbital round 3 candidate

Production `/assets/index-D-5ds8Q3.js`: 70 unit tests, full lint, build and all 42 short real-input browser checks pass with zero runtime/load errors. Current orbital root samples peak at 432 calls / 1,482,305 triangles / 382.12 MiB estimated GPU assets, below the original resource caps. The regional surface and weather now use 64 MiB of texture storage rather than the prior 112 MiB. These capture-heavy samples are resource observations, not timing or foreground certification. Independent review follows in the same bounded gauntlet. Report: `.experiments/gate3-regression-round3/report.json`.

## Orbital round 4 candidate

Production `/assets/index-C3Xph3wR.js`: all 70 unit tests, full lint, build and 42 short real-input browser checks pass with zero errors. Root orbital samples peak at 457 calls / 1,698,873 triangles / 403.75 MiB estimated GPU assets. Six runtime planet textures total 16,001,716 file bytes and 80 MiB estimated texture memory. Added portal and station surface construction preserves the approved route and source clearance checks. Resource caps remain unchanged; independent timing/transfer observations and the human performance limit remain separate. Report: `.experiments/gate3-regression-round4/report.json`.

## Verified orbital checkpoint after the final inspection repair

Production `/assets/index-c6gHY7PG.js` passes all 70 unit tests, 42 orbital/Halcyon browser checks and 9 focused inspection/control checks with zero errors. Root current orbital peaks: 457 calls / 1,698,825 triangles / 403.75MiB estimated assets. Full lint and production build pass. The final camera/layout repair received integrator visual checks, without reopening the six-round critic gauntlet or changing its scores. Foreground performance, listening and physical devices remain unverified.
