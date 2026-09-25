# Promote the accepted pilot capabilities

## Authority and scope

The user playtested Pinewatch Hunt and Stillwater Fishing before merging and accepted both as framework trials. They explicitly requested bringing walking/input lifecycle, placement-derived collisions, supported Node startup and water back into `_tech9` now, with historian work in parallel. Water promotion is authorized despite its single game use; the normal second-consumer guideline must not delay this scoped extraction. Record that evidence boundary honestly.

Deliver reusable source modules, working framework examples and reliable local startup. Keep accepted games and their immutable receipts unchanged. Root framework graduation, another game, game depth, publishing, pushes and additional AAA art rounds are out of scope. The earlier failed visual scores remain historical evidence, not inherited module ratings.

## Ownership and dependencies

- Producer: framework tooling/startup, module copy/provenance mechanism, catalog/version metadata, current framework docs, module copies in framework scenes, run records, integration and final validation.
- Walking builder (`promote_walking`): `modules/grounded-walking/**`, `modules/placement-collisions/**`, forest `src/main.js`, `src/world/ForestWorld.js`, `tests/walking-browser.mjs`, `tests/placement.test.js`. Pure placement helpers feed the neutral grounded controller; forest rendering and proxies share authored transforms.
- Water builder (`game_builder`): `modules/pond-water/**` and new `scenes/pond-test/**`, excluding copied grounded-walking/placement-collisions module directories. Retain the pilot's coupled shore, terrain and vegetation contract, strip fishing rules/content and use the promoted controller.
- Historian (`promotion_historian`): read-only comparison of all three games, source/license inventory and pitfalls; send findings during implementation. Producer records its report. Historian is not an approval gate.
- Independent critic: read-only review of the frozen implementation checkpoint; producer records review evidence separately. A builder does not review its own implementation.

Canonical runtime modules live under `modules/<id>/src`. Framework scenes carry byte-identical source copies under `src/capabilities/<id>/src`; generated games inherit those local copies and never import framework runtime code. Producer alone updates registry and copy metadata. Forest remains the default fly-camera example, with an optional walking launch; the new pond example demonstrates water and grounded traversal without fishing gameplay.

## Acceptance

- Walking has explicit enable/pause/reset/dispose ownership, grounded normalized movement, bounded collision steps, editable/menu input protection, drag/keyboard fallback and canvas-specific pointer-lock handling. Known native-event testing limits are stated separately from synthetic tests.
- Collision geometry derives from the same placements used by meshes, including relevant rocks/deadfall. Conservative horizontal proxies are documented without claiming full physics.
- Node launcher accepts the declared supported versions, offers an explicit executable override and safe local discovery, forwards arguments, reports missing dependencies clearly, and never installs runtimes or changes hooks implicitly.
- Pond source has configurable shore data shared by terrain, vegetation exclusion and walking; reflection quality/cadence and resource cleanup are explicit. Preserve MIT/CC0 source records and authored assets. No duplicate renderer or frame loop.
- Both framework scenes run, build, lint and pass relevant unit/real-input browser checks. New starters are only advertised as available after an independent source fork builds and its relevant browser checks pass.
- Accepted game paths and legacy root files are unchanged. Source versions, catalog and extension instructions describe only demonstrated capabilities.

## Validation and stopping point

Run framework unit/lint checks, module contract/input/placement tests, scene unit/lint/build checks and serialized browser input checks on stable source. Reserve ports 4450–4452 for the pond example and 4470–4473 for integration/fork verification after checking availability; never stop other sessions' processes. Observe water quality changes and cleanup. Record browser/GPU/viewport/settings if reporting timings, without comparing uncontrolled workloads.

Commit implementation, prove fresh standalone source copies in temporary fixtures, obtain independent engineering/contract review, fix blockers and commit compact evidence separately. Stop after all four requested capabilities are integrated, documented and verified; no unrelated framework expansion or automatic root migration.

## Added preparation scope

While implementation was underway, the user requested a future boat-driving pilot brief/prompt. Prepare only `_tech9/games/tidebreak/{BRIEF,PROMPT}.md`: a roughly 160 m island, surrounding bounded ocean and one complete buoy-course/docking loop. Require a fresh agent/worktree from the finished promotion checkpoint. Do not scaffold or implement that game in this session.
