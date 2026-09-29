# Gate 4.2 independent critique

One lane counter, **2/8 completed formal rounds**. Stop at the first verified pass or eight completed rounds. Every applicable category requires at least 9/10 and no critical failure. Missing external evidence does not become a pass or justify unchanged repeated rounds. Final human approval is separate.

## Early parent taste review — not a formal round

Inspected the actual initial production PNGs from `/assets/index-BQMhB16o.js`. Approach hardware, amber/teal distinction and compact feature HUD fit Halcyon. Requested refinements: replace rigid boost sticks with coherent tapered/fading propulsion, strengthen detached shield brackets into a restrained hull-conforming field, and keep impact feedback truthful after shield consumption. Parent routed the unconditional shared reserve-loss notice and inherited short-landscape minimap/speed overlap to the shared owner. Those local and shared refinements were completed before round 1.

## Formal round 1 — changes required

Independent critic `pickup_critic` inspected its own 34 stills and real-key runs on `/assets/index-NyVun_6Y.js` with `/assets/halcyon-Buu509ep.js`. Zero runtime, asset or shader errors. Nineteen valid assertions passed; a raw strict 5000m equality check was a documented test precision false positive (actual 5000.000000021678m). No false game failure or rerun is attributed to that assertion.

| Category                                |           Score |
| --------------------------------------- | --------------: |
| Art                                     |             9.0 |
| Lighting/materials/depth                |             9.0 |
| Handling/camera                         |             7.0 |
| Placement/readability                   |             8.0 |
| Mechanic fairness                       |             9.3 |
| Visible feedback/UI                     |             8.5 |
| Stability/observed headless performance | 9.0 provisional |

1. **F1, P1, blocking:** Aegis overhead beam hides the craft and lower road after collection followed by braking. Repro `aegis-crown`, W until pickup, then S 0.8–1.0 simulation seconds; stop around 371.5m, with arch at 360m. Owner: pickup geometry/presentation. Required: both arches remain camera-safe through approach, crossing, slow exit and parked +10..14m, high/low and desktop/portrait/landscape; retain approach silhouette without popping.
2. **F2, P2:** At 390×844 the pickup HUD and message span roughly x16..218/y186..307, masking the upcoming Crown road. Owner: pickup CSS/presentation. Required: compact/reflow portrait status while preserving readable timer/charge and hit/expiry text, and keeping upcoming road/apex visible.

Protected and subsequent unprotected impact notices now agree with actual reserve. Boost/shield refinement meets the art target. Replay re-exports all 261 recorded inputs exactly. Raw independent report/stills are git-ignored under `.experiments/gate4-2-critic-round1/`; the same lane counter continues for repairs.

Foreground target performance, listening, physical devices, actual OS-lock behavior and final Nacre integration remain unverified. Stability score covers observed hidden execution and resource bounds only. No overall verified pass or human approval is claimed.

## Formal round 2 — pickup blockers closed; original FAIL retained

Exact production: `/assets/index-If0PLV6o.js`, `/assets/halcyon-AknBKWAf.js`, `/assets/halcyon-DuSPI87g.css`. Independent critic inspected 41 own main stills and six exact-stop supplemental stills across 1600×900, 390×844 and 844×390, high and low. Fourteen main checks and three exact-stop checks passed; zero runtime, shader or asset errors. Both capture browsers were closed after verification.

| Category                                |           Score |
| --------------------------------------- | --------------: |
| Art                                     |             9.0 |
| Lighting/materials/depth                |             9.0 |
| Handling/camera                         |             8.8 |
| Placement/readability                   |             9.0 |
| Mechanic fairness                       |             9.3 |
| Visible feedback/UI                     |             9.0 |
| Stability/observed headless performance | 9.0 provisional |

**F1 closed.** Raised arch pieces now fade locally when they intersect the chase view; ground cassettes retain their solid surfaces. Both arches were independently checked during approach, collection, camera passage, slow departure and actual-key brake stops. Crown stopped at 371.6289m; Corkscrew at 1719.0124m plus a real W→S supplement stopping at 1721.42/1721.53m. Every viewport/quality retained the road and craft view without the former opaque slab.

**F2 closed.** Portrait pickup status now occupies x15.59/y180/width218/height50.19, ending near y230 rather than y307. Inactive chips collapse, while active timer/charge and pickup/hit/expiry text remain explicit. Upcoming road stays visible.

**F3, P2:** At the Corkscrew pickup line, the 390×844 chase frame crops the right turbine/outer shell and shield edge. Repro: real W to pickup then S for one simulation second; stop at 1719.0124m, lateral -4.1636, heading -0.0537, speed zero. Reproduced high/low and at +11.4m beyond the pickup. This is why the original round-2 verdict is FAIL and handling/camera is 8.8. The likely owner is shared camera framing; no baseline same-pose comparison was yet available when scored. The parent requested a bounded same-round matched baseline comparison before changing approved shared behavior. No camera fix or reclassification is claimed until that evidence lands.

Transactional rejected replays preserve vehicle, runtime, lap, tick, events, mode, input log and re-exported replay. Valid replay re-export retains all 261 identical real-key inputs and reconstructs exact simulation. Protected and subsequent damaging contacts remain distinct. Plain Halcyon and orbital production/shape with the feature query allocate no pickup runtime, HUD or resource. Actual OS lock and final Nacre integration remain outside the observed evidence.

Additional baseline diagnostic observation: orbital bare-shape controls overlap speed at 844×390. No evidence attributes that overlap to pickup code; it is recorded for later baseline iteration, not hidden or expanded into a new mechanic task. Full raw reports remain in `.experiments/gate4-2-critic-round2/`.

## Same-round baseline supplement and handback

The independent critic compared the identical parked Corkscrew pose on plain Halcyon and feature Halcyon at 390×844, high and low, producing four own images on the unchanged final build. Vehicle distance/lateral/heading matched exactly; settled camera, 61° FOV and normalized craft screen x≈0.42379392395668 matched to floating precision. Both plain and feature crop the same right turbine/outer shell. Zero runtime/asset/shader errors; browser closed and GPU slot released.

Method: a temporary unique non-enumerable inherited scenario fixture fed the existing `loadScenario` diagnostic, was deleted in `finally`, then actual S input and chase settling were used. No production source or dist changed. Both runtimes began unarmed. This establishes an existing base-craft/framing limitation; it does not manufacture active-shield or gameplay proof. Those remain covered by the separate real-key evidence above. Raw supplement: `.experiments/gate4-2-critic-round2/baseline-match/report.json`.

The parent integrator explicitly deferred equivalent approved-baseline framing for later iteration. The independent critic agreed the matched comparison demonstrates no pickup-specific base-craft/camera regression. F3 remains a visible known limitation; the original round-2 FAIL and camera 8.8 are preserved, with no replacement score and no added round. No full portrait framing certification is claimed.

**Final outcome: playable candidate handed back at 2/8 rounds, with pickup-specific F1/F2 closed, a deferred baseline framing limitation, and external-evidence hold. No overall verified pass and no human approval.** Do not run unchanged extra rounds to fill the counter. Foreground target performance, listening, physical devices, actual OS lock and combined Nacre integration remain unverified in this lane. Final human review decides mechanic/art/feel approval; broader rollout and default-on policy are not authorized by this handback.

## Human approval — 2026-09-29

The user reviewed the playable candidate and said, “its a great starting point - lets go ahead and merge”. Gate 4.2 is human-approved and its commit/local merge is authorized. The parent confirmed a Gate 4.2-only merge while Nacre receives separate feedback. Pickups remain explicitly opt-in; no other level or mechanic expansion is included.

The original two-round history, camera 8.8, baseline framing deferral and unverified foreground/audio/device evidence are unchanged. Human acceptance closes this gate without rewriting the independent critic outcome.
