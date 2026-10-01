# Level-building learnings

Human art and workflow steers from Vesper Canopy, 2026-09-29–30. Carry these into the next level agent's brief.

- **Carry the concept's strongest identity into the game.** The user especially loves the deep amber resin road and its thin glowing border. Preserve the sense of translucent depth, warm reflections, and light within the resin. Fix blown highlights without flattening the road into a dull opaque surface. The edge should remain a thin luminous accent.
- **Preserve distinctive spaces while improving their art.** The enclosed, colossal hollow tree in the first pass was a feature the user liked. Keep it whole and retain its enclosing scale; improve bark, lighting, organic detail, and necessary entrances/exits within that form. Do not open it into disconnected wall strips or remove its presence from production views to satisfy a readability critique. Bare shape review can remain a separate route study.
- **Human art preferences constrain critic fixes.** A critic finding should lead to a targeted improvement that preserves the qualities the user values. Do not trade away an approved visual idea merely to simplify inspection or chase a score.
- **Save mobile verification for the end.** Iterate on desktop art and driving first. Run one mobile pass when the level is otherwise finished, rather than repeating the responsive matrix after every art change.
- **Keep moving after a small steer.** These comments refine the ongoing work; they are not a request to stop, restart, or ask for another routine approval.

- **Whole means a complete top as well as walls.** Restoring an enclosing trunk is insufficient if the skyline still exposes an abruptly cut, open stump. Inspect the upper trunk and crown from actual driving views; complete the giant tree while preserving road entrances and camera clearance.
- **Use a bounded finish pass for secondary creatures.** If the creature looks toyish, first give its body, legs, and face visible, coherent surface texture. Avoid many Blender remodeling rounds or perfection cycles. The later steer below supersedes showing this creature in Vesper.

- **Keep the road edge simple.** Remove the raised pale/brown petal decorations; the low orange curb and thin glowing edge are enough. The concept did not need extra edge ornaments.
- **Let resin transmit some light.** Keep its amber body and reflective surface, but allow a restrained view into and through the deck rather than only painting depth onto an opaque material.
- **Retire an unsuccessful secondary spectacle promptly.** Hide the creature and its associated movement/effects; retain its source and asset for possible reuse. The map stands on its environment and does not require a moving hero. Do not spend more creature-polish cycles.
- **Lift a dim scene modestly.** Increase the existing lighting by about ten percent while preserving the night mood. Use a dedicated generated cloud-and-distant-forest sky to complete the scene instead of a mostly flat dark background.
- **Respect a direct finish request.** This pass is implementation and verification only: the user explicitly requested no more critic rounds.

- **Build trees as connected structures.** Branches must start on the actual bent parent trunk, shoots on branches, and leaves on supported stems. Root collars must meet the rendered terrain. Surface texture cannot repair floating parts. Borrow useful construction methods without importing another game engine.
- **Prove a new asset method in the first driving view.** Checkpoint first, replace the exact tree the human selected, and show it in place before rolling the method across the forest. The connected pilot was approved; regenerate secondary trees while preserving the colossal hollow.

- **After a successful pilot, carry its structure through every detail level.** Regenerate the secondary forest consistently, including distant trees and floating leaf islands. Preserve any landmark the human explicitly excludes. Fit roots to the rendered terrain triangles; retain supported branches even in simplified distance meshes.

- **Keep the oversized leaf identity when repairing trees.** Connected geometry should still feel colossal and lush. The user preferred larger trees, substantial boughs and broad, clearly visible leaves. Enlarge foliage in both near and distant models; do not normalize the new dimensions back into the old size. Preserve attachment and road clearance.

- **Adapt a proven tree method to the landmark’s architecture.** For a hollow tree containing the circuit, preserve the shell, full top and route portals. Regenerate the exterior limbs/crown with roots sampled on the actual curved shell and forks/leaves attached to their parents. Checkpoint first; compare the starting view and audit road/jump clearance. Do not replace the navigable hollow with a scaled ordinary solid tree.

- **Make environment inspection easy.** Provide a fly camera so the human can inspect trees and scenery directly without driving to every angle or supplying screenshots. Freeze the session during inspection, preserve the whole environment, and offer an obvious return to the previous view.

- **Inspect foliage close up, not only from the road.** Large flat polygons become obvious in fly-camera views. Preserve broad leaf scale while adding curved midribs, cupped/rolled margins, curled tips, veins and surface variation. Keep stems connected and give simplified distance leaves some volume too. Use a bounded pass.

- **Keep inspection controls simple.** The user found adjustable fly speed awkward. Use a fixed 200 m/s and remove speed UI, wheel adjustment and Shift acceleration.

- **Share mechanisms; keep world identity local.** Flight/landing, surface response, camera framing, fly inspection and optional HUD layouts belong in shared code. Resin, foliage, sky tuning and hollow-tree architecture stay level-owned. A standalone deterministic tree builder is enough reuse until a second environment demonstrates a shared API need.
- **Audit structure before polishing surfaces.** Check parent attachment, actual terrain triangles, both detail levels and full road/jump clearance. Preserve whole branches around portals instead of clipping individual triangles into floating pieces. Numerical checks and close-up views catch different defects.
- **Budget what the renderer submits.** Transmission, shadows and postprocessing multiply source geometry. Record actual high/low draw counts and memory; a lower source asset size does not prove lower rendering cost. Keep known budget overages visible rather than presenting headless frame times as foreground performance.
- **Verify the merged game, not just the lane preview.** Preserve unrelated work, merge the level with its shared dependencies, then check discovery/picker navigation, selected assets, pause/reset/replay, fly-camera opt-in and the existing circuits from the main worktree's build. Archive completed handoff/history in Git while retaining provenance and future-support coordinates.

- **A plain resin edge means no roadside ornaments.** Remove the little glowing bulbs and their stalks as well as raised petals, including jump-edge beacons. Keep guidance on the deck and in the thin luminous curb.
- **Respect the repository tooling.** Let the pre-commit hook run ESLint/Prettier for routine edits. Use the shell's configured Node/npm, checking the required version once instead of repeating an absolute PATH override.
