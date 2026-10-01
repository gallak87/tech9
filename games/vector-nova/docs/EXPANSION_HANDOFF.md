# Level expansion — complete one level at a time

The user starts the existing level chats sequentially. Each level agent owns its level through production, critique, shared improvements, final mobile verification, commit and merge into the primary worktree. Resume the work already built in your assigned checkout. Read this brief, your level's brief, the [level API](EXPANSION_LEVEL_CONTRACT.md) and the [Vesper learnings](expansion/vesper/learnings.md).

## Execution and authority

Continue the full assigned level to completion when the user resumes you. Check bare route shape internally, then proceed through production and the existing capped independent critic loop. Routine art steers refine the ongoing work; keep moving unless the user explicitly stops or changes it. Human feedback constrains critic fixes: preserve the qualities the user values.

Commit and merge the finished level, including necessary shared changes, into `/Users/g/code/scratch/tech9` on its current primary branch (`g/scene-test` at this writing). This local merge is authorized as part of completion; present the merged playable result for human review. A critic score does not supply human approval. Pushing and unrelated next-feature work require their own user instruction.

Chat startup and sequencing belong to the user. Do not create, resume, message or monitor other level chats, start an integrator, or add coordination automations. There are no GPU grants, queues, port reservations, frozen-foundation packages or coordination ledgers to maintain. Do not create or update `STATUS.json` files. Keep current progress and critic results in the chat; raw evidence stays ignored, and lasting decisions belong in the relevant docs.

## Levels

| Map                   | Slug / entry | Brief / reference                                    |
| --------------------- | ------------ | ---------------------------------------------------- |
| 4 — Vesper Canopy     | `vesper`     | Complete; [learnings](expansion/vesper/learnings.md) |
| 5 — Glasswake Comet   | `glasswake`  | [Brief](expansion/glasswake/HANDOFF.md)              |
| 6 — Cindercoil        | `cindercoil` | [Brief](expansion/cindercoil/HANDOFF.md)             |
| 7 — Saffron Leviathan | `saffron`    | [Brief](expansion/saffron/HANDOFF.md)                |
| 8 — Zephyr Basilica   | `zephyr`     | [Brief](expansion/zephyr/HANDOFF.md)                 |
| 9 — Helion Flare      | `helion`     | [Brief](expansion/helion/HANDOFF.md)                 |
| 10 — Umbra Fold       | `umbra`      | [Brief](expansion/umbra/HANDOFF.md)                  |

Production entry is `?level=<slug>`; bare review adds `&review=shape`. Use a preview built from the checkout you are actually verifying. Each agent starts and maintains its own server on a free port and reports the working URL.

## Worktree and completion ownership

On resume, read the current expansion docs from the primary worktree; old isolated copies can contain superseded instructions. Bring the latest primary branch into your assigned checkout while preserving existing level work and unrelated edits. The primary branch already contains Vesper's shared support. Inspect actual exports before implementing a missing capability; use the current API rather than old foundation patches or shared-extension packages. Check Node 22.13+ once using the user's configured shell/version manager, and use the existing npm scripts and local dependencies.

When an old branch conflicts on retired status/coordination files, keep their deletions. Carry only lasting technical decisions, provenance and measured future-support coordinates into the relevant docs.

Author the level in these paths:

- `src/levels/<slug>/**`: track model, production/shape geometry, environment, backdrop/materials and local presentation.
- `assets/levels/<slug>/**`: selected scene references, editable Blender sources/generators and asset provenance.
- `public/assets/levels/<slug>/**`: runtime exports/textures only. Keep source `.blend` files and concept renders out of the served directory.
- `tools/expansion-<slug>-*.mjs`: level checks; `*.test.mjs` entries must be discovered by the existing npm test script.
- `docs/expansion/<slug>/**`: the active brief, concise reusable learnings and measured future-support notes.

The same level agent owns necessary shared framework, environment-helper, renderer, camera, UI, input, physics, lifecycle, tooling and documentation improvements. Implement a small reusable mechanism when a concrete level need justifies it, verify affected existing circuits, and merge it with the level. Update the API/architecture/tool docs and leave concise learnings for the next agent. Do not wait for another chat to deliver shared support.

Reuse existing helpers and keep world-specific geometry, materials, terrain, placement, zones, timing, audio and effects local. Vesper's connected-tree Blender generator is a useful construction pattern; extract an environment helper only when another real use demonstrates the need. Preserve approved circuits, controls and defaults. Avoid copied launchers/runtimes, hidden global retunes and speculative all-purpose frameworks.

## Gameplay and presentation boundaries

Use the existing Kestrel, controls, fixed-step simulation and steering assistance 0.3. Build the specific jumps, surface effects, hazards, environmental forces and large world events in each map's brief. Preserve ordinary magnetic handling outside explicitly declared local effects. Spread interactions through the lap.

A real gap requires actual takeoff, airborne motion, landing and recovery; never substitute an invisible magnetic bridge or a cutscene. Grounded roads need reliable frames, rails, supported undersides and camera clearance. Hazards/forces need readable boundaries and warnings, deterministic simulation/reset/replay and accurate feedback. Helion intentionally includes short unavoidable heat exposure; report its cost. Giant scenery events may animate/deform convincingly without a full physical world simulation.

Use the descriptor's optional `createRuntime` and the existing shared flight/surface/force support described in the [level API](EXPANSION_LEVEL_CONTRACT.md#shared-local-mechanics). Extend it yourself when required, preserving Nacre's approved rules and replay behavior. Keep authored zones, event state and presentation in your level adapter.

Use the existing manual boost. New pickups, boost pads/refills, inventories, protection tools and shared boost-system additions remain deferred to a later user-led gameplay round. Record future placements below. Race/AI/ship/cup/economy expansion remains separate; completed Gate 4 critic loops stay closed.

Preserve driver-left/right through banks/inversions, replay identity, pause/reset, inspection and lifecycle. Baseline slope hold and braking remain intact outside declared effect zones. Track distance/order must remain reliable at overpasses and loops. The defining interactions/spectacle and lighting direction take precedence over illustrative district tables. Lengths, widths, percentages, boundaries and landmark allocations are starting points; merge, split, reorder or reshape them for those features and good pacing. They are not a district checklist or kilometre quota. Prove the actual route numerically and with real input.

Identity extends across the world and raceway: running surface, barriers, shoulders, underside/supports, foreground detail, geological/inhabited middle distance, distant massing, sky and lighting. Ordinary connectors need the same attention as hero views. Avoid asphalt reskins, repeated Orbital U frames, tiny neon highlights standing in for design and blank stretches.

Model large/medium/small forms, material roughness and coherent light before multiplying detail. Audit parent attachment, actual terrain contact, both detail levels and road/jump/camera clearance before polishing surfaces; inspect close up as well as from the road. High/low retain the same identity and navigation cues. Quality/reduced motion may simplify decoration, flashes and camera effects, but never simulation, hazard timing, grip/drag, force strength or flight. Visible boundaries and warnings must match active hazards. No random damage, mandatory camera shake or invisible unannounced forces.

## Lighting is part of the level design

Author local light transitions: dark tree/cathedral/skull interiors with motivated fill and bright exits; cold cavern light against clear exterior ice; warm lava against cool ash; stellar exposure, shield shade and gigantic solar flares; accretion light against dark ruins. Events should affect nearby light/materials coherently. Retain darkness and depth while keeping craft, road, warnings and landings readable. Avoid flattening the scene or hiding geometry under bloom/fog. Verify darkest, brightest and transition driving views in high/low and reduced motion.

## Asset workflow: imagegen to Blender

For substantial bespoke assets and large signature scenes, use **scene imagegen → Blender assets/animation → in-game lighting and iteration**. This is the default for major creatures, traversable architecture, hero terrain, large water/lava forms and comparable spectacle, following the Nacre leviathan workflow. Small props, road panels, particles and suitable procedural parts do not need this pipeline.

1. Generate a scene concept showing the asset in its intended world with road/ship scale, composition, material hierarchy and lighting. Choose one useful direction; add focused references where modeling needs them.
2. Build actual Blender geometry, materials and animation/deformation for gameplay viewpoints, interiors and silhouettes. Animated shaders, particles and procedural elements may complement modeled forms.
3. Export early and inspect from the real driving camera at gameplay scale in the level's lighting. Fix silhouette, volume and material failures first. Reuse authored families for ordinary scenery.

Keep the selected reference, editable Blender source or reproducible generator and concise provenance under `assets/levels/<slug>/`; serve only runtime exports. Scratch concepts/renders stay ignored in `.experiments/`. Lighting, assets and whole-level finish share one eight-round independent critic counter; there are no separate asset counters. Stop at the first verified pass or the cap and retain honest shortcomings.

## Future shared pickup and boost placement

Build the approved experience now and preserve its challenge while future shared support is absent. Rough or hard no-pickup gameplay is acceptable; crashes, broken physics and invalid landing/recovery logic are defects. A player missing a difficult jump is an expected gameplay outcome.

Write one short Markdown placement note in `docs/expansion/<slug>/future-support.md` using actual built-route measurements. Give the tested track revision and route-frame convention once, then record each candidate's section, route distance `s`, lateral/height offsets, derived world position `[x, y, z]`, suggested aid, purpose and observed difficulty with current controls/boost. Add an end distance for a zone if useful. Geometric +right is driver-left; height is local +up. World position is `sample(s).position + right*lateral + up*height`. Existing [Vesper notes](expansion/vesper/future-support.md) show the format. These are durable product notes for the later gameplay round, not progress tracking or a runtime schema.

Mark setup areas before demanding jumps/forces/hazards and safe recovery shelves; each level brief names candidates. Distinguish verified difficult passages, support-dependent intended lines and defects. The critic grades implemented mechanics, art, lighting, stability and feedback; future-item balance is deferred.

## Production and critique loop

1. Resume existing work, bring in current primary code/docs and inspect the actual API. Keep the existing formal critic count when resuming; do not restart completed work or closed reviews.
2. Check the model, neutral shape, overview/section starts and road/barrier sample. Verify frames, grounded/airborne transitions, banks, clearance and controls. Implement missing shared support yourself. Continue automatically to full production without a human shape-review stop.
3. Finish the entire course on desktop: ordinary stretches, hard turns, vertical signatures, starts/returns, off-axis and close-up views, high/low and reduced motion. Record provenance and measured future-support coordinates. The level owner implements; use a separate independent critic for review. Run their browser/render work sequentially within this level, closing each batch before the next. No builder fan-out or coordinator is needed.
4. Review the actual frozen desktop production build. The critic captures its own stills and drives short real-key segments; prose and code inspection alone are insufficient. Grade art, lighting/material/depth, handling/camera, route/readability, feedback/UI and stability/performance separately. AI/race-mode scope is N/A with a reason. Critic findings require targeted fixes that preserve human art preferences. Save mobile until the final completion phase.
5. Stop at the first verified pass or **eight completed formal rounds**, including the initial critique. Every applicable category needs at least 9/10, no critical failures and actual evidence; do not average away a low category. Missing foreground-performance/listening/device evidence remains unverified. If only external evidence is missing, finish and report it instead of repeating unchanged rounds. At the cap retain shortcomings; no reset, split counter or disguised ninth art pass.
6. Once desktop production, critique and shared changes are settled, run the final mobile pass described below. Fix its findings and recheck the affected cases as part of completion. Mobile fixes and integration regressions do not start another art loop.
7. Commit the level, required new assets, shared improvements and lasting docs; merge into the primary worktree while preserving unrelated edits. Resolve conflicts yourself, build and verify the merged game, keep a working production preview available and report the result. Completion includes the merge and checks in the primary build.

## Verification and resource discipline

Use fast numerical checks for route frames/continuity, clearance, rest/steering, ordered traversal, runtime effects/jump transfers and disposal. Use short real-key production checks for acceleration/braking/steering, hard bends, vertical transitions, impact, pause/resume/restart and named signatures. Verify shape/production, replay compatibility/rejection, selected-asset isolation, load/error cleanup, review UI and repeated disposal. Check affected existing circuits and Halcyon's opt-in devices after shared changes.

**Mobile is a final pass, after desktop art and critique.** Check 390×844 portrait and 844×390/640×360 landscape, high/low and reduced motion, craft framing, notices, minimap/telemetry, review open/closed, touch controls, safe areas and input release. Repair overlaps/crops and verify changed cases. Do not repeat the responsive matrix after every art or critic round. A viewport check does not establish physical-device support. Repeat mobile checks after merging only if the merge changes the verified responsive behavior.

Starting high-preset targets: ≤1,000 visible draw calls, ≤2 million rendered triangles, ≤512 MiB estimated resident GPU assets and roughly ≤30 MB compressed initial transfer per loaded circuit. Measure actual submitted multipass totals, including transmission/shadows/postprocessing, rather than source triangle counts. Keep generation/load, shader compilation, textures, warmup and teardown bounded. Load only selected-level assets. Report overages honestly; hidden/headless timings do not certify foreground pacing. Listening and physical devices remain unverified unless actually tested.

Run `npm run check:level -- <slug>`, meaningful level tests and a production build before review/completion. Let the pre-commit hook run ESLint/Prettier. Use `VN_URL=<your preview> npm run verify:level -- <slug>` for the [shared smoke checks](../tools/level-checks/README.md), then targeted visual/input checks. After merging, build the primary game and check discovery/picker navigation, the level's production/shape entries, lifecycle and affected existing behavior there. Repeat broader suites only when changes, failures or unresolved concerns justify them.

Start/recover your own server on a free port; leave unrelated listeners and edits intact. Verify the URL serves the intended checkout/build. Run hidden/headless browsers and GPU-heavy Blender renders/bakes in sequential bounded batches, closing owned browsers/render processes afterward. No external slot request is required. No unsolicited videos or normal-speed automated full laps.

Raw stills and reports belong in ignored `.experiments/expansion/<slug>/`. Keep durable asset provenance, measured placement notes and concise reusable learnings. Put framework/API/environment-helper changes in architecture/source/tool docs where the next agent can use them. Remove completed execution handoffs after merge; Git retains history. Do not replace the removed status files with progress tables, package manifests or duplicate implementation/performance/integration reports.

## Completion report

Return the merged commit and primary worktree, working production/shape URLs and useful section starts, checks actually run, critic outcome/round count, resource peaks and remaining limitations. Point to provenance, future-support notes and reusable improvements. The deliverable is a complete merged circuit or an honest capped result with concrete shortcomings, ready for the user's playtest.
