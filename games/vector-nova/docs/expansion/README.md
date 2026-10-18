# Circuit expansion

Widen complete existing circuits and refit their immediate surroundings while preserving their route, identity, assets, and accumulated polish. Work case by case, with one owner chat per level brief. The original expansion levels are already merged; their completed briefs remain in Git.

## Road finish briefs

The separate [road finish set](roads/README.md) documents the Halcyon process and per-level starting points for improving existing surfaces. It preserves each circuit's material identity, leaves Vesper deferred. Its workflow is independent of the widening sequence and human gates below; these briefs do not start or approve widening work.

## Current circuits and remaining scope

Saffron Leviathan (`saffron`) has a 40 m roadway; Umbra Fold (`umbra`) has a 35 m roadway. These are the canonical courses. Surrounding-world review remains separate from road finish work: see the [Saffron refit brief](saffron.md) and the [roadmap](../../ROADMAP.md) for future assignments.

## Process

1. Record the original level's route, important views, and behavior. Inspect the full circuit and identify connections that widening affects.
2. Create a separately playable experimental copy. Give it distinct level, track, geometry, and replay identities. Reuse unchanged assets without duplicating their binaries; preserve the original level and its exports for comparison.
3. Rebuild the full roadway at the brief's target width using existing construction, materials, and detail. Update physical bounds and collision together with visible geometry. Retain the route centerline, elevation, banking, and jump intervals unless the brief explicitly authorizes changes.
4. Refit adjacent scenery, enclosures, supports, terrain, devices, and hazards against the complete wider road. Keep nearby assets initially to expose actual conflicts; move, resize, or selectively edit affected pieces. Preserve working distant scenery and deliberate placements.
5. Present and inspect the complete revised circuit. Reviews cover the whole level at the brief's phase gates; no preliminary approval cycle for widening individual sections. Use the shared free camera alongside driving views.
6. Run bounded desktop inspection and focused verification, repair concrete findings, then hand the complete variant to the user for driving review. Technical checks do not substitute for human acceptance.

Keep ship size and handling unchanged. Start with the existing camera; adjust local framing only where the revised geometry demonstrably requires it. Avoid a universal deformation framework, wholesale asset regeneration, and unrelated roadmap polish. Any extra level changes must be named in its brief.

## Inspection and verification agents

The implementation chat owns integration and human gates. When the user requests delegation, it may assign one implementation subagent as the sole source/asset editor for the current phase, with an explicit stopping gate and no concurrent owner edits to those files. Each brief also assigns at most two inspection/verification agents: one for geometry/visual inspection and one for physics/runtime verification. They may read code, operate separate desktop browser contexts, and write ignored evidence, but must report proposed fixes to the owner. No nested delegation or independent redesign tasks.

Give each agent a concrete scope, source revision or frozen working-tree state, preview URL when needed, evidence directory, finite case/view budget, and stopping condition. Inspection and verification can run concurrently against the same frozen build. The owner must finish edits before requesting rechecks; do not compare results from different builds. Each agent gets one main pass and one focused recheck of affected failures. On reaching a cap, report unresolved issues honestly rather than starting another review loop or declaring success.

## Desktop-only campaign

**Do not run any mobile, portrait, touch-emulation, or mobile-landscape testing during this campaign, including at the end of an individual level.** The user will run a separate pass after all levels. This is the user's explicit exception to the usual final mobile check in [AGENTS.md](../../AGENTS.md).

This also excludes portrait or mobile aspect-ratio cases inside CPU tests. Inspect harnesses before running them; do not invoke a blanket suite or combined browser runner that includes excluded cases. Run the relevant desktop and non-viewport numerical tests. Retain existing responsive behavior and record deferred coverage in the handoff without claiming it passed.

Use the [level API](../LEVEL_API.md), [architecture](../../ARCHITECTURE.md), [art direction](../ART_BIBLE.md), [verification tools](../../tools/README.md), and bounded [launch collision gauntlet](../../tools/level-checks/launch-gauntlet.md). Headless checks are the default; show driving/review when the user asks. No unsolicited videos or automated normal-speed full laps.

## Keep the folder small

Briefs are execution instructions, not running status reports. Keep findings and progress in chat; put captures and raw reports under ignored `.experiments/`. Preserve asset sources and provenance. On human acceptance, move enduring decisions into the existing technical/art docs, keep real deferred work in the [roadmap](../../ROADMAP.md), and remove the completed brief and its active-index row. Retain the experimental/original comparison until the user decides whether to promote or remove it; do not automatically replace originals, commit, or merge.
