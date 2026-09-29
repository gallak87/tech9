# Gate 4.2 measured resources

Initial production build `/assets/index-BQMhB16o.js`, feature chunk `/assets/halcyon-4fGQWzwx.js`, Node 22.15.0. Hidden HeadlessChrome 154, ANGLE Metal Apple M1 Pro, 1600×900, DPR 1. Parent serialized browser GPU work; concurrent lane CPU tests/build work may exist. No foreground 60 fps claim.

| Same parked grid | Calls | Triangles | Estimated GPU MiB | Textures |
| ---------------- | ----: | --------: | ----------------: | -------: |
| Baseline         |   622 | 1,257,677 |           297.829 |       68 |
| Feature          |   638 | 1,258,853 |           297.999 |       68 |
| Delta            |   +16 |    +1,176 |            +0.170 |        0 |

Across initial functional stills, highest sampled calls were 705 and highest sampled triangles 1,327,013; high estimated GPU memory was approximately 298 MiB at that viewport. Low launch sample: 369 calls, 745,496 triangles, 193.628 MiB estimate. Estimates include approximate renderer buffers and exclude driver overhead.

Capture-containing RAF samples had varying small counts and warmup/capture overhead. They are unsuitable for a clean frame-time comparison; raw intervals remain in git-ignored `.experiments/gate4-2-initial/report.json`. Foreground performance, listening and physical-device checks remain unverified.

## Final affected candidate samples

Final production `/assets/index-If0PLV6o.js`, feature `/assets/halcyon-AknBKWAf.js`, feature CSS `/assets/halcyon-DuSPI87g.css`. The refined VFX use 133,968 geometry bytes (about 0.1278 MiB). Separating the two arch groups for local camera visibility gives 34 source meshes and 2,154 triangles; no new lights/textures.

Independent round 2 affected high-quality views measured at most 568 rendered calls and 1,181,887 triangles. Estimated GPU memory at 1600×900 high was 297.9564 MiB, about 0.1278 MiB above the earlier matched baseline asset estimate. The broader round 1 view set had 722 calls and 1,327,013 triangles at its peak; that is historical evidence for its exact prior build, not a claim that the narrower round 2 views remeasured every whole-course maximum.

Round 2 includes both arches at high/low and desktop/portrait/landscape, plus exact second-arch stopped-position checks. Raw reports live in `.experiments/gate4-2-critic-round2/`. No additional foreground, sound-listening, physical-device or OS-lock evidence was obtained.
