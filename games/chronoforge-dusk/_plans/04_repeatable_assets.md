# 04 — Repeatable asset updates

**Type:** bounded integration assignment. **Status:** not started.

**Requires:** 03's accepted Kaida, 01's runtime, and 02's tooling/static prop.

**Read:** [AGENTS.md](../AGENTS.md), [asset handoff](../_prep/ASSET_CONTRACT.md), and relevant [validation](../VALIDATION.md). Use the actual existing Dusk components rather than redesigning the pipeline.

## Outcome and work

Prove that the next asset iteration is routine:

- Make a small useful new Kaida source/export revision without losing the accepted one. Record the intended difference.
- Rebuild and import it through the normal recipe and runtime selection. Verify the displayed revision, clips, attachments, and materials.
- Confirm game-owned movement, animation blending, camera, and action settings survive reimport. Report renamed/removed references clearly rather than silently discarding overrides.
- Compare accepted and candidate under identical settings, then restore the accepted asset/game-settings combination and reproduce its result after restart.
- Send the static prop through the shorter recipe and place it in the same game. Show that it never invokes humanoid rigging or clip acquisition.
- Repeat asset selection/reload enough to reveal stale caches, duplicate actors, or accumulating resources. Measure rather than assume successful cleanup.

Own this integration exercise, coordinate edits to producer and consumer components, and keep one identified running build for comparisons. The deliverable is a working repeatable handoff plus a short report of versions, tests, and any defects fixed.

Do not redesign for every future provider or asset category. A second-humanoid import/animation smoke test becomes useful after Kaida when Vex or Rune is available; it is not a requirement to finish the other characters now.

## Done and next

A revised Kaida and static prop reach the game without per-version code repair, lost settings, or misleading provenance. The accepted result can be restored, and repeat operations do not show unexplained resource growth. Remaining limits are explicit.

The owner may discuss 05 while this work runs. Begin the complete game loop in 06 only after both this step and the story/region design in 05 are ready.
