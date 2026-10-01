# Level expansion

The user resumes the existing level chats one at a time. Each agent finishes its assigned level, implements necessary shared improvements, completes desktop critique, checks mobile last, commits and merges into the primary worktree. Resume existing work; chat startup and sequencing belong to the user.

Expansion-specific briefs and process belong only in this folder. Keep progress and review findings in the chat, with raw evidence ignored in `.experiments/`. Do not create status files, coordination ledgers, budget reports or interim handoff packages. Once a level is merged, remove its completed execution notes; its merged availability is enough. General docs should describe the shipped game, actual APIs and general working practices.

| Map                   | Entry        | Brief / completion             |
| --------------------- | ------------ | ------------------------------ |
| 4 — Vesper Canopy     | `vesper`     | Merged                         |
| 5 — Glasswake Comet   | `glasswake`  | [Brief](glasswake/HANDOFF.md)  |
| 6 — Cindercoil        | `cindercoil` | [Brief](cindercoil/HANDOFF.md) |
| 7 — Saffron Leviathan | `saffron`    | [Brief](saffron/HANDOFF.md)    |
| 8 — Zephyr Basilica   | `zephyr`     | [Brief](zephyr/HANDOFF.md)     |
| 9 — Helion Flare      | `helion`     | [Brief](helion/HANDOFF.md)     |
| 10 — Umbra Fold       | `umbra`      | [Brief](umbra/HANDOFF.md)      |

## Execution and authority

Continue to the full scoped finish when the user resumes you. Check route shape internally, then proceed to production without an early human-review stop. Small art steers refine the ongoing work. Critic fixes must preserve the qualities the human values.

Local commits and the final merge into `/Users/g/code/scratch/tech9` are part of completion. Confirm its current branch (`g/scene-test` at this writing), preserve unrelated edits and present the merged playable result for human review. A critic score does not supply human approval. Pushing and unrelated feature work need their own user instruction.

Do not message, resume or monitor other level chats, launch an integrator, or add coordination automations. Start your own server on a free port. Run browser/render batches sequentially and close owned processes afterward; there are no GPU grants or queues.

## Worktree and completion ownership

Read the current brief from the primary worktree on resume and incorporate its latest code into your assigned checkout, preserving authored work. Use the actual [level API](../LEVEL_API.md) and existing shared helpers. Do not reuse old foundation packages or resurrect deleted status files when resolving conflicts.

Author local track, scenery and presentation under `src/levels/<slug>/`; sources and provenance under `assets/levels/<slug>/`; runtime exports under `public/assets/levels/<slug>/`; and meaningful checks under `tools/expansion-<slug>-*.mjs`. Keep `.blend` files and concepts out of the served directory.

The level owner also implements concrete framework, environment-helper, camera, UI, physics, lifecycle or tooling improvements needed for the level. Verify affected existing behavior and merge those changes with the level. Document lasting technical APIs or decisions in the relevant general/source docs; keep expansion instructions here. Keep world-specific materials, terrain, placement, zones, timing and effects local. Extract reusable helpers when a real need demonstrates their value.

## Gameplay and presentation boundaries

Preserve the existing Kestrel, controls, fixed-step simulation and 0.3 steering assistance. Build the brief's named jumps, surface effects, hazards, forces and spectacle with deterministic reset/replay and readable cues. Real gaps require actual takeoff, flight, landing and recovery. Preserve baseline handling outside declared local effects and Nacre's existing rules/replay behavior.

Use current manual boost. Shared pickup/boost additions, inventory, race/AI/ship/cup/economy expansion remain separate scope. Preserve the intended challenge while those systems are absent; distinguish difficult play from broken physics or application failures.

Defining interactions and lighting take precedence over illustrative district tables and dimensions. Author a complete world and raceway, including ordinary stretches, barriers, undersides/supports, foreground, middle distance, sky and local light transitions. Audit attachment, terrain contact and road/jump/camera clearance before surface polish. High/low retain identity and navigation cues; reduced motion never changes simulation or hazard boundaries. See the [art principles](../ART_BIBLE.md).

## Asset workflow: imagegen to Blender

Use scene imagegen → Blender geometry/materials/animation → in-game iteration for major bespoke architecture, creatures, terrain and spectacle. Small props, repeats, road panels, particles and suitable procedural elements do not need this pipeline.

1. Choose a useful scene reference with road/ship scale, composition, materials and lighting.
2. Build real geometry for gameplay views, interiors and silhouettes; shaders and particles may complement it.
3. Export early and inspect in the actual driving camera and level lighting. Fix large forms first and reuse authored families for secondary scenery.

Retain selected references, editable sources or reproducible generators, provenance and licences with the assets. Keep temporary renders ignored. Assets, lighting and whole-level finish share the same critic counter.

## Production and critique loop

1. Resume existing work and formal round count. Inspect current code and validate route shape/frames, grounded/airborne transitions, clearance and controls; implement missing shared support yourself.
2. Finish desktop production across the whole course. Inspect ordinary stretches, hard turns, signatures, starts/returns, close-up and off-axis views in high/low and reduced motion.
3. Use a separate independent critic on the actual frozen desktop build. It captures its own stills and drives short real-key segments, grading art, lighting/material/depth, handling/camera, route/readability, feedback/UI and stability separately. Run its browser/render work after yours has closed; no builder fan-out is needed.
4. Stop at the first verified pass or eight completed formal rounds, including the initial critique. Each applicable category needs at least 9/10, actual evidence and no critical failures. Preserve honest shortcomings at the cap; do not restart counters or add a disguised ninth art pass. Missing external evidence remains unverified and does not justify repeating unchanged rounds.
5. Once desktop art, critique and shared changes are settled, run the final mobile pass. Fix findings and recheck affected cases without reopening the art loop.
6. Commit and merge the completed level and necessary shared changes. Resolve conflicts, build and verify the primary game, and leave a working preview for the user's playtest.

## Verification and resource discipline

Run meaningful route/runtime tests, `npm run check:level -- <slug>`, a production build and `VN_URL=<your preview> npm run verify:level -- <slug>`. Use short real-key checks for named interactions, controls, camera, impact, pause/reset, replay, selected-asset loading and disposal. Let the pre-commit hook handle routine lint/format. Recheck affected existing circuits after shared changes and verify discovery/picker/lifecycle in the merged primary build.

Mobile comes last: check portrait and short landscape, craft framing, HUD/notices/minimap, review open/closed, touch controls and input release in high/low and reduced motion. Do not repeat the responsive matrix after each critic round; recheck changed cases when necessary. Viewport checks do not establish physical-device support.

Include a final loading and performance check. Investigate observed slowdowns or excessive loading when they appear; no numeric budgets or recurring measurement reports are required. Report only what was actually verified. Browsers stay hidden/headless; no unsolicited videos or normal-speed automated full laps.

## Completion

Report the merged commit, working production/shape URLs, checks run, actual critic outcome and remaining limitations in the chat. Keep the shipped game docs current and remove completed execution notes. Do not retain measurement, review or integration reports as permanent documentation.
