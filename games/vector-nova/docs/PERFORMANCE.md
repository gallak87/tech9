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
