# <Level> — wider circuit brief

Use this with the [campaign process](README.md) and [AGENTS.md](../../AGENTS.md). Replace placeholders before assignment; keep the brief self-contained and specific to one level.

## Outcome and boundaries

- Original level and comparison URL: `<slug>`.
- Experimental name, slug, and independent identity: `<slug>-wide`.
- Current full road width → target full road width, percentage, and any explicit exceptions.
- Preserve: route centerline/elevation/banking, jump intervals, signature construction, ship size, handling, and existing scenery/art direction.
- Additional authorized tweaks: list concrete items, or none.
- Exclusions: unrelated roadmap work, global world scaling, generic deformation tooling, and unrequested changes to other levels.

## Source and asset map

Link the actual route, road construction, collision, runtime, device, scenery-placement, material, and asset-authoring files. Identify enclosing structures, terrain/support dependencies, baked colliders, special effects, and identity checks that copying the level must account for. Specify which assets remain shared and where modified copies belong.

## Whole-level implementation

Describe how to create the playable copy, retain the exact route, rebuild the entire road and its collision at the target width, and refit adjacent scenery using the original as reference. Keep working assets until actual conflicts are known. Specify treatment of enclosures, jumps, boundaries, supports, materials, devices, hazards, and AI lines. The first playable review must cover the full circuit.

## Bounded agents

Assign one geometry/visual inspector and one physics/runtime verifier. The owner integrates and either edits or, when requested by the user, delegates the current phase to one implementation subagent as its sole editor. Inspection/verification agents report findings and write only ignored evidence. Name their cases/views, finite budgets, and acceptance evidence. Allow one main pass and one focused recheck each, with no nested delegation. Share a frozen build and track aggregate launch budgets. Unresolved failures at the cap remain explicit blockers to acceptance.

## Human gates

Name the implementation steps requiring human review, the complete reviewable result and checks for each, and what remains unfinished. Stop at each assigned gate until the user explicitly approves continuing; carry the same stop condition into delegated work. Keep these as whole-level phase reviews, not incremental section approvals. Final human driving acceptance remains separate from intermediate gates.

## Acceptance and verification

List measurable width/route invariants, visual connections to preserve, collision/jump/racing outcomes, replay/identity checks, relevant desktop test commands, and original-level regression controls. Confirm harnesses actually target the experimental slug and physics configuration.

**Desktop only. No mobile, portrait, touch-emulation, or mobile-landscape tests, including embedded CPU camera cases and final checks.** The user handles these after all levels. Do not run a combined suite that includes them.

## Handoff

Provide original/variant preview links, concise changes, checked outcomes, unresolved issues, and deferred mobile coverage. Keep evidence in `.experiments/`; preserve the original pending the user's driving review. Do not auto-promote, commit, merge, or begin another level.
