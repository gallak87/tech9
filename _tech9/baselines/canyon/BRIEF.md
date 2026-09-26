# Canyon

A standalone rocky highland canyon scene and starting package. Layered sandstone walls, fractured ledges, scree and sparse scrub frame a walkable gorge that opens onto a broad overlook. A small timber shelter provides scale and a clearly covered viewpoint. The scene should be compelling to explore in ordinary clear weather and provide a second world for subsequent weather integration.

## Experience and visual direction

- Create a compact, fully authored exploration area with a readable path from the gorge floor to an overlook. Choose dimensions for the composition and traversal, with sufficient surrounding scenery for elevated views.
- Give the canyon convincing rock strata, weathering, fractures, slope debris and material variation at both walking and elevated distances. Use asymmetry and recognizable landmarks to avoid obvious repeated formations.
- Preserve a strong composition through the whole accessible area: narrow passages, light reaching the canyon floor, shadowed rock, open sky and a distant rim. Sparse grasses and scrub support the geology.
- Supply fly inspection and grounded exploration, useful named views, reset, pause and graphics controls. Traversal and camera clearance must agree with rendered surfaces and substantial obstacles.
- Make a polished, reusable scene package with concise controls and launch instructions. Keep the experience focused on exploration and environmental presentation.

## Package and reuse

Own `baselines/canyon/` as a standalone package with its own dependencies, assets/licenses, editable sources, scene definition and documentation. Reuse the forest baseline's application lifecycle, renderer, environment controls and suitable modules. Author the canyon world and its assets for this setting.

Initialize the package directly at this path using the committed baseline as the source reference. The existing game-fork command targets `games/`; this task supplies a second baseline package. Keep the forest at `baseline/` and leave baseline-selection CLI changes for the integration handoff.

Use coherent geometry and world queries for the path, ledges and shelter. The existing ground-height interface represents one ground surface at each horizontal position; use appropriate additional contact/visibility information wherever overhangs or multiple surfaces require it. Keep those additions focused on the actual scene.

## Weather integration handoff

A separate session builds `modules/weather/` against the forest baseline. Build and review the complete dry canyon independently. Keep scene-owned terrain, cliff ledges, loose ground, vegetation and shelter surfaces easy to identify for later integration. Document existing material hooks, surface queries and exposure information, including surface normals and overhead cover where needed.

The application owns the renderer, frame loop, sky, fog, lights and environment presets. Use the existing layer lifecycle and preserve material hooks so reusable effects can compose with canyon shading. Keep the integration information concise and grounded in the actual scene; the finished weather module will supply the effect interfaces.

Deliver the finished dry canyon with an integration handoff. After user review, a separate pass will adopt the weather module, author canyon presets and validate rain, snow and wind in this second world. This session's acceptance covers the standalone canyon.

## Acceptance and critic

Walk the whole intended route through real input, visit sheltered and exposed viewpoints, inspect the scene from above, and verify pause/focus loss, reset and graphics changes. Run relevant package tests, lint, build and browser checks. Measure frame timing on Balanced at 1600 × 1000, targeting 60 FPS; report browser, GPU, preset and competing load.

Run **six independent harsh art-critic passes**, with fixes and fresh captures of committed builds between passes. Use AAA environment art as the quality reference and aim for 9/10; complete all six passes even if an earlier score reaches the target. Judge geology, silhouettes, material scale/detail, lighting, composition, repetition and overall coherence. Review ordinary traversal and close-up surfaces along with named scenic views. The forest's fidelity is a reference for quality. Let the critic identify visible weaknesses without excusing them as a small pilot.

Keep scores, specific findings, source commits and captures in ignored task artifacts. Report the actual final result and remaining weaknesses; resolve correctness blockers independently of the score.

## Workspace and handoff

Use a dedicated worktree. Own the canyon package and keep coordination in `runs/canyon/` or the package's `.artifacts/`. The weather module and forest integration belong to the weather session. Record reusable discoveries for framework-dev after user review.

Preferred strict ports: dev **4520**, preview **4521**, browser verification **4522**. Check availability and record replacements. Coordinate browser/GPU capture windows with the weather session when available; disclose concurrent load in measurements. Stop task-owned servers at handoff.

Deliver launch instructions, controls, validation, critic results, weather integration points and remaining work. Leave local commits unmerged and unpublished for user review. The later integration can establish `baselines/forest/` and baseline selection after both scenes and the effects are accepted.
