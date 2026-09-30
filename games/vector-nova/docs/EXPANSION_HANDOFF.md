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

Use the existing Kestrel, controls, fixed-step simulation and steering assistance 0.3. Build the specific jumps, surface effects, hazards, environmental forces and large world events in each map’s brief. These are approved level scope; the former blanket continuous-road/no-new-mechanics restriction is retired. Preserve ordinary magnetic handling outside explicitly declared local effects. Spread the interactions through the lap instead of concentrating every signature in one short sequence.

A real gap requires actual takeoff, airborne motion, landing and recovery; never substitute an invisible magnetic bridge or a cutscene. Grounded roads still need reliable frames, rails, supported undersides and camera clearance. Hazards/forces must have readable spatial boundaries and warning cues, deterministic simulation/reset/replay, and accurate feedback. Helion’s brief intentionally includes short unavoidable heat exposure; report its cost rather than removing it. Giant scenery events may animate/deform convincingly without a full physical world simulation.

The descriptor’s optional `createRuntime` is the integration boundary, not a promise of a universal flight/hazard kit. Read the actual API: Nacre’s existing flight is still level-local, and shared jump/checkpoint rules have constraints. Ask the integrator for small reusable extensions when required, then keep authored zones, timing, paths and presentation local. Do not clone Nacre’s entire runtime or fork core to bypass a missing interface. The integrator owns shared changes and baseline regressions. Do not silently drop an approved interaction because its support needs coordination.

Use the existing manual boost. New pickups, boost pads/refills, item inventories, protection tools and shared boost-system changes are deferred to a later user-led gameplay round; mark future placements as described below. No race/AI/ship/economy expansion belongs in these lanes.

Preserve driver-left/right through banks/inversions, stationary slope hold, braking authority, replay identity, pause/reset, inspection and lifecycle. Track distance/order must remain reliable at overpasses and loops. Use each map's district rhythm rather than stretching an oval to a length target. Starting dimensions in the briefs are hypotheses; prove the actual route with numerical and real-key checks.

Identity has to extend across the **world and raceway**: broad running-surface treatment, barrier silhouette, shoulders, underside/supports, foreground detail, inhabited/geological middle distance, distant massing, sky and lighting. No Halcyon asphalt reskin, repeated Orbital U-frame road, tiny neon highlights standing in for design, blank ordinary stretches or one hero vista masking an unfinished course. Real apertures, broad color and layered scenery worked in the prior human review because the player could see the construction and surrounding world.

Model authored large/medium/small forms, material roughness and coherent light before multiplying detail. Preserve road/landing/craft clarity under spectacle. High and low quality must share the same art identity; reduced motion must restrain flashes/movement without erasing navigation cues. Environmental consequences must match the declared local mechanic and visible cues; no random damage, mandatory camera shake or invisible unannounced forces. No new visible browser windows or videos.

## Lighting is part of the level design

Author meaningful local light transitions, not one global environment wash. Use each lane’s direction: dark tree/cathedral/skull interiors with motivated fill and bright exits; cold cavern light against clear exterior ice; warm lava against cool ash; stellar exposure, shield shade and a couple of gigantic solar flares; accretion light against dark ruins. Large events should affect nearby light/materials coherently. Shadowed areas should retain depth and darkness while the ship, road, hazard cue and landing remain readable. Do not flatten the scene to satisfy visibility or hide geometry beneath bloom/fog. Verify representative darkest, brightest and transition views while driving in high/low and reduced motion.

## Asset workflow: imagegen to Blender

For most substantial bespoke assets and the large signature scenes, use **scene imagegen → Blender assets/animation → in-game lighting and iteration**. This is the required default for major creatures, traversable architecture, hero terrain, large water/lava forms and comparable spectacle, following the Nacre leviathan workflow. Do not impose it on every prop, road panel, particle or small procedural part.

1. Generate a scene concept showing the asset in its intended world, with the road/ship for scale, composition, material hierarchy and intended lighting. Choose one useful direction; add consistent focused/reference views only where modeling needs them.
2. Use that scene as the reference for actual Blender geometry, materials and animation/deformation. Model the needed gameplay viewpoints, interior passages and silhouettes, including large flowing-water/terrain forms; a beautiful image is not a substitute for convincing in-game geometry. Animated shaders, particles and procedural elements may complement the modeled forms where appropriate.
3. Export early and judge from the real driving camera at gameplay scale and in the level’s lighting. Correct major silhouette, volume and material failures first. Reuse a small family of authored modules for ordinary scenery rather than concepting/modeling every instance separately.

Keep the selected reference, editable Blender source or reproducible generator, export and concise provenance in owned asset paths. Scratch concepts/renders stay ignored in `.experiments/`. Lighting, hero assets and whole-level finish share **one eight-round independent critic counter**, with every applicable category at least 9/10; there are no separate eight-round asset loops. Stop at the first verified pass or the cap, and preserve honest shortcomings instead of endlessly regenerating concepts. Simple structural geometry, repeats, secondary effects and small props can stay procedural when that produces the right result.

## Future shared pickup and boost placement

Build the approved level experience now. Note where future game-wide pickups/boost support could help, but implement no new items, spawn systems, boost pads/refills, inventories, protection abilities or substitutes. The current manual boost remains available. Do not flatten jumps, remove hazards or replace the brief with an easier concept merely because future support is absent. Rough or hard no-pickup gameplay is acceptable at this stage; crashes, broken physics, missing landings and dishonest claims are not.

Keep one compact `futureSupport` array in the lane’s existing `STATUS.json`; this is a handoff note, not a runtime schema or a new document. Populate actual coordinates after route construction, not invented planning coordinates. Each entry should include `id`, `section`, route distance `s` (metres), `lateral`/`height` offsets in the documented route-frame convention, derived world position `[x, y, z]`, suggested shared aid, purpose, and observed difficulty with current controls/boost. Add an `endS` for a zone when useful. Record the tested track revision once alongside the array so placements can be reprojected if geometry changes.

Mark candidates before demanding jumps/forces/hazards and on safe recovery shelves as appropriate; each lane brief names the relevant areas. Suggestions may include boost/refill, protection, recovery or stability support, but they are product notes for the later shared gameplay round, not authorization to build those systems. Handback distinguishes a verified difficult passage, a support-dependent intended line and an actual defect. The critic still grades the implemented local mechanics, art, lighting, stability and readable feedback at 9/10; future-item balance is explicitly deferred, not a reason to change the design or restart review.

## Production and critique loop

1. Create one full scoped goal: finished level plus verified playable handback and truthful capped critique. Do not invent a token budget. Record actual worktree/base/foundation hash and 0/8 counter.
2. Read the frozen API; build the model, neutral shape, overview/section starts and representative road/barrier sample. Check route frames, grounded/airborne transitions, length, banks, clearance and real controls; identify any required shared-runtime extension early. **Continue automatically to production; do not wait for human shape approval.**
3. Fan out narrowly where useful: track/raceway and environment/backdrop builders with exclusive files, one integrator and a separate critic. Respect available slots; the critic writes no implementation. No builder edits someone else's folder.
4. Finish the entire course. Inspect ordinary running stretches, hardest turn, vertical signature, starts/returns, off-axis views and high/low/responsive states. Record actual asset provenance and approximations, plus measured future-support coordinates without implementing those aids.
5. Run one integrated lane critic at a time on a frozen production build. The critic opens the app, captures its own stills and drives short actual-key segments; descriptions and code inspection alone are insufficient. Grade art, lighting/material/depth, handling/camera, route/readability, feedback/UI and stability/performance separately. AI/race-mode scope remains N/A with a reason.
6. Stop at the first verified pass or **eight completed formal rounds**. Every applicable category requires at least 9, no critical failures and the required evidence; do not average away a low category. Missing external performance/listening/device evidence is unverified, not a pass. If only that evidence is missing, hand back instead of wasting unchanged rounds. At the cap preserve shortcomings and package; no reset, split counter or disguised ninth art pass.
7. Finish required checks and an owned-files delta/manifest, keep the production preview running and hand back for the sole human gate. No automatic commit/merge/push or next-feature work.

## Verification and resource discipline

Use fast numerical checks for route frames/continuity, clearance, rest/steering, a valid ordered traversal, declared runtime effects/jump transfers and disposal. Use short real-key production checks for acceleration/braking/steering, hard bends, vertical transitions, impact, pause/resume/restart and each named visual signature. Verify high/low, desktop, 390×844 portrait and 844×390/640×360 landscape, including notices, minimap and telemetry. Do not reproduce Nacre's known map/speed and notice/control overlaps in new layouts.

Starting high-preset budgets: no more than 1,000 visible draw calls, 2 million rendered triangles, 512 MiB estimated resident GPU assets and roughly 30 MB compressed initial transfer per loaded circuit. These are measurements to report, not certification from source triangle counts. Keep CPU generation/load, shader compilation, owned textures, warmup and teardown bounded. Only the selected level's assets should load. A hidden/headless timing sample is not a foreground-performance claim; listening and actual devices remain unverified unless genuinely tested.

Run meaningful tests, full lint/format and a production build before review/handback. Temporary stills and raw reports belong in ignored `.experiments/expansion/<slug>/`. Keep only current checks/open findings and a compact active-round table in status/handoff; preserve asset provenance beside assets. Do not multiply implementation/performance/integration/critique reports. After merge, move lasting decisions into architecture/source docs and remove completed handoff/history; Git retains it. Server startup/recovery and GPU scheduling go through the launching integrator recorded in [LAUNCH_STATE.json](expansion/LAUNCH_STATE.json). Never start a capture merely because your server is ready; wait for the exclusive slot and report browser CLOSED afterward.

## Final package

Return the exact production URL/build, source/base/foundation identity, owned patch/hash/file manifest, numerical/unit/browser outcomes, all completed critic rounds and real open issues, resource peaks, provenance, and merge/lifecycle notes. Mark human approval false. Package against the frozen foundation so the integrator does not reapply shared core seven times. The final result should be a beautiful, drivable whole circuit or an honest capped candidate with documented shortcomings—not a screenshot collection or a self-awarded human pass.
