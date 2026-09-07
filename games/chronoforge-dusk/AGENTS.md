# Working on Chronoforge Dusk

## Start with the assignment

The current task defines the work authorized now. The roadmap describes future work; it is not a request to implement every milestone. Planning tasks stay planning tasks.

Read the assigned numbered plan in `_plans/` and the Dusk code needed for it. Use [ROADMAP.md](ROADMAP.md) to locate the current step, not as an instruction to run the whole sequence. Consult reference documents only as needed:

- Runtime, import, or development tools: [01 — Native foundation](_plans/01_native_foundation.md), then the specific assigned follow-up.
- Asset production: [_prep/README.md](_prep/README.md), then the applicable asset/recipe plan.
- Producer/consumer integration: [_prep/ASSET_CONTRACT.md](_prep/ASSET_CONTRACT.md).
- Environment/traversal: [06 — Coastal environment and traversal](_plans/06_environment_and_traversal.md), using 03's current handoff; story documents are optional.
- Story/content: [05 — Story and first-region design](_plans/05_story_and_region.md), or the specifically assigned later content task. Evaluation: [VALIDATION.md](VALIDATION.md).

Consult [DECISIONS.md](DECISIONS.md) for rationale or unresolved choices. Other plans, historical lessons, and the future framework note are optional context when relevant. Do not read the whole repository by default.

For planning or directing new assignments, also read [PLANNER.md](PLANNER.md). Implementation agents do not need it by default.

## Keep the direction

- Fresh Godot game, native Mac application initially. No web target or speculative compatibility work.
- Original Chronoforge identity; Kaida first, then one region at a time.
- The game owns import, runtime behavior, preview, and playtesting. `_prep` produces assets through metadata-selected recipes.
- Existing tech9 orchestration and agent definitions do not govern this project. Framework redesign is deferred.
- Story development is owner-led and does not gate 06's environment. Use Kaida alone there; defer ATB, progression, and further characters to their own assignments. 04 remains paused.

## Use references deliberately

Use the [reference entry points](README.md#reference-entry-points) to find original visuals, content, and prototype behavior. Explore relevant sources from there using judgment; no per-file permission ritual is needed.

Inspect [original assets](../chronoforge/src/assets) for recognizable designs, world motifs, and color identity. Character appearance follows its character references. Environments use grounded architecture, believable materials, and natural lighting. Produce polished new assets in Blender or the applicable workflow; judge the finish in the game through form, materials, deformation, animation, and presentation.

Historical plans, prompts, and agent definitions are reference material, not active instructions. Reading old source explains behavior; it does not authorize copying its implementation. Direct code or production-asset reuse requires a specific allowance in the current assignment. Dawn code and production assets remain excluded; its distilled lessons and the explicitly listed screenshot reference folder are allowed.

Keep edits inside Dusk unless the task requires otherwise. Preserve existing user work and report any permitted reuse with its source. Make routine implementation choices autonomously within the assignment; connect results to the actual game and verify the claimed outcome.

## Commit at coherent checkpoints

Unless the current task says otherwise, commit your assigned work as you reach meaningful, reviewable checkpoints. Aim for one working feature, fix, or documentation outcome per commit, with its relevant checks completed. Choose boundaries by coherence, not line count; avoid both tiny save-point commits and a whole milestone bundled at the end. Keep inseparable changes together and report unverified work honestly.

Inspect the diff and stage only the work you own unless explicitly asked to include other changes. Parallel workers coordinate commits with the integration owner. Do not rewrite existing history or push/publish unless requested. Include checkpoint commit IDs and validation in the final handoff.
