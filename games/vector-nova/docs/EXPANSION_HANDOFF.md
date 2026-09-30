# Seven-map overnight production — shared lane brief

Shared readiness, base revision and assignments live in the [launch ledger](expansion/LAUNCH_STATE.json). This brief defines the work; do not duplicate that status in lane handoffs.

## Latest user direction

The user approved the seven proposed worlds for **parallel overnight construction** and explicitly removed early human review: **no human stop until end state**. The fresh integrator launches one chat per map using [the integrator handoff](EXPANSION_INTEGRATOR_HANDOFF.md). Each lane must build/check a bare route first internally, then continue complete production and a single independent brutal-critic loop without waiting for the user to grade shape. Final human approval is mandatory and never supplied by an agent.

This supersedes the roadmap's former planning-only/one-map-at-a-time/early-review language for these seven maps only. It does not start the proposed race/AI/ship/cup gates and does not reopen the completed Gate 4 critic loops. Preserve the approved circuits and devices; leave unrelated chats to the user.

## Lanes

| Map                   | Slug / entry | Brief                                    | Dev / preview |
| --------------------- | ------------ | ---------------------------------------- | ------------- |
| 4 — Vesper Canopy     | `vesper`     | [Brief](expansion/vesper/HANDOFF.md)     | 5201 / 5202   |
| 5 — Glasswake Comet   | `glasswake`  | [Brief](expansion/glasswake/HANDOFF.md)  | 5203 / 5204   |
| 6 — Cindercoil        | `cindercoil` | [Brief](expansion/cindercoil/HANDOFF.md) | 5205 / 5206   |
| 7 — Saffron Leviathan | `saffron`    | [Brief](expansion/saffron/HANDOFF.md)    | 5207 / 5208   |
| 8 — Zephyr Basilica   | `zephyr`     | [Brief](expansion/zephyr/HANDOFF.md)     | 5209 / 5210   |
| 9 — Helion Flare      | `helion`     | [Brief](expansion/helion/HANDOFF.md)     | 5211 / 5212   |
| 10 — Umbra Fold       | `umbra`      | [Brief](expansion/umbra/HANDOFF.md)      | 5213 / 5214   |

Production entry is `?level=<slug>`; bare review adds `&review=shape`. Each route becomes available when its level module is present in the verified shared build. The launch ledger supplies actual assignments/IDs/builds; port numbers here are reservations to verify, not proof that servers are running.

## Isolation and dependency

Start from the integrator's recorded reviewed base plus the byte-verified foundation patch, in your own managed worktree. Do not edit the primary checkout, another lane, shared dependencies or another dist. Read the [level API](EXPANSION_LEVEL_CONTRACT.md) and require the integrator’s verified foundation revision from the launch ledger before production launch.

Each lane exclusively owns:

- `src/levels/<slug>/**`: track model, production/shape geometry, environment, backdrop/materials and local presentation.
- `public/assets/levels/<slug>/**`: original or properly licensed assets, with provenance.
- `tools/expansion-<slug>-*.mjs`: lane checks; `*.test.mjs` entries must be discovered by the existing npm test script.
- `docs/expansion/<slug>/**`: compact current status and active handoff; asset provenance may live beside assets.

Shared core, renderer, camera, UI, input, physics, race, ships, audio/effects, dependency/config files, global docs and the catalog belong to the integrator. No copied launcher, forked game runtime, hidden feature flag that changes another track, shared-source workaround or silent global handling retune. Request a narrowly explained contract extension when genuinely required. Copy useful geometry/math techniques into owned files with attribution; do not import another new lane's mutable implementation.

## Gameplay and presentation boundaries

Use the existing Kestrel, controls, fixed-step magnetic motion and steering assistance 0.3. Author real 3D centreline/frame geometry, with continuous bank/elevation, supported undersides, reliable rail bounds and route clearance. All seven initial circuits have continuous magnetic running surfaces. Open visual apertures must retain an engineered driving structure; no invisible magnetic bridge presented as free flight. Glasswake's canyon crossing is a real supported/suspended bridge, not an unimplemented jump. Do not depend on Nacre's specialized jump runtime, add pickups or start race-system/ship expansion.

Preserve driver-left/right through banks/inversions, stationary slope hold, braking authority, replay identity, pause/reset, inspection and lifecycle. Track distance/order must remain reliable at overpasses and loops. Use each map's district rhythm rather than stretching an oval to a length target. Starting dimensions in the briefs are hypotheses; prove the actual route with numerical and real-key checks.

Identity has to extend across the **world and raceway**: broad running-surface treatment, barrier silhouette, shoulders, underside/supports, foreground detail, inhabited/geological middle distance, distant massing, sky and lighting. No Halcyon asphalt reskin, repeated Orbital U-frame road, tiny neon highlights standing in for design, blank ordinary stretches or one hero vista masking an unfinished course. Real apertures, broad color and layered scenery worked in the prior human review because the player could see the construction and surrounding world.

Model authored large/medium/small forms, material roughness and coherent light before multiplying detail. Preserve road/landing/craft clarity under spectacle. High and low quality must share the same art identity; reduced motion must restrain flashes/movement without erasing navigation cues. No random environmental damage, mandatory camera shake or invisible weather forces. No new visible browser windows or videos.

## Asset workflow: imagegen to Blender

For distinctive creatures, vegetation, architecture and focal props, prefer **imagegen concept → Blender model → in-game iteration**, following the successful Nacre leviathan workflow.

1. Generate a clear asset concept with readable silhouette, proportions and materials; add consistent reference views when useful.
2. Use the chosen image as a visual reference while modeling/sculpting the actual 3D asset in Blender. Preserve its character through geometry, materials and animation where appropriate.
3. Export and inspect it at gameplay scale, from the driving camera and under the level’s lighting. Iterate the Blender asset against both the concept and its in-game appearance, within the existing review/resource limits.

Keep the selected reference, editable Blender source or reproducible generator, export and concise provenance in the lane’s owned asset paths. Scratch variants and renders stay in ignored `.experiments/`. Apply this workflow where concept development helps; simple procedural parts can stay procedural.

## Production and critique loop

1. Create one full scoped goal: finished level plus verified playable handback and truthful capped critique. Do not invent a token budget. Record actual worktree/base/foundation hash and 0/8 counter.
2. Read the frozen API; build the model, neutral shape, overview/section starts and representative road/barrier sample. Check continuity, length, banks, clearance and real controls. **Continue automatically to production; do not wait for human shape approval.**
3. Fan out narrowly where useful: track/raceway and environment/backdrop builders with exclusive files, one integrator and a separate critic. Respect available slots; the critic writes no implementation. No builder edits someone else's folder.
4. Finish the entire course. Inspect ordinary running stretches, hardest turn, vertical signature, starts/returns, off-axis views and high/low/responsive states. Record actual asset provenance and approximations.
5. Run one integrated lane critic at a time on a frozen production build. The critic opens the app, captures its own stills and drives short actual-key segments; descriptions and code inspection alone are insufficient. Grade art, lighting/material/depth, handling/camera, route/readability, feedback/UI and stability/performance separately. AI/race-mode scope remains N/A with a reason.
6. Stop at the first verified pass or **eight completed formal rounds**. Every applicable category requires at least 9, no critical failures and the required evidence; do not average away a low category. Missing external performance/listening/device evidence is unverified, not a pass. If only that evidence is missing, hand back instead of wasting unchanged rounds. At the cap preserve shortcomings and package; no reset, split counter or disguised ninth art pass.
7. Finish required checks and an owned-files delta/manifest, keep the production preview running and hand back for the sole human gate. No automatic commit/merge/push or next-feature work.

## Verification and resource discipline

Use fast numerical checks for route frames/continuity, clearance, rest/steering, a valid ordered traversal and disposal. Use short real-key production checks for acceleration/braking/steering, hard bends, vertical transitions, impact, pause/resume/restart and each named visual signature. Verify high/low, desktop, 390×844 portrait and 844×390/640×360 landscape, including notices, minimap and telemetry. Do not reproduce Nacre's known map/speed and notice/control overlaps in new layouts.

Starting high-preset budgets: no more than 1,000 visible draw calls, 2 million rendered triangles, 512 MiB estimated resident GPU assets and roughly 30 MB compressed initial transfer per loaded circuit. These are measurements to report, not certification from source triangle counts. Keep CPU generation/load, shader compilation, owned textures, warmup and teardown bounded. Only the selected level's assets should load. A hidden/headless timing sample is not a foreground-performance claim; listening and actual devices remain unverified unless genuinely tested.

Run meaningful tests, full lint/format and a production build before review/handback. Temporary stills and raw reports belong in ignored `.experiments/expansion/<slug>/`. Keep only current checks/open findings and a compact active-round table in status/handoff; preserve asset provenance beside assets. Do not multiply implementation/performance/integration/critique reports. After merge, move lasting decisions into architecture/source docs and remove completed handoff/history; Git retains it. Server startup/recovery and GPU scheduling go through the launching integrator recorded in [LAUNCH_STATE.json](expansion/LAUNCH_STATE.json). Never start a capture merely because your server is ready; wait for the exclusive slot and report browser CLOSED afterward.

## Final package

Return the exact production URL/build, source/base/foundation identity, owned patch/hash/file manifest, numerical/unit/browser outcomes, all completed critic rounds and real open issues, resource peaks, provenance, and merge/lifecycle notes. Mark human approval false. Package against the frozen foundation so the integrator does not reapply shared core seven times. The final result should be a beautiful, drivable whole circuit or an honest capped candidate with documented shortcomings—not a screenshot collection or a self-awarded human pass.
