# Weather

A reusable weather module developed through the existing forest baseline. Rain, wet surfaces, settled snow, snowfall and wind compose into convincing environmental conditions while preserving the forest's visual richness. Deliver the behavior, supporting assets, presets and integration needed to use these features in another world.

## Experience

- Explore with the forest's existing fly and walking controls. Offer clear, drizzle, heavy rain, clear winter and snowfall presets, with useful intensity, coverage, wind and mute controls. Make changes easy to compare from the same viewpoint.
- Rain has depth, believable scale and motion. Ground, rocks and vegetation respond to wetness while retaining material detail. Place splashes and puddles on suitable exposed surfaces. Rain can stop while surfaces remain wet and dry gradually.
- Settled snow remains when snowfall stops. Coverage responds to slope and shelter, with convincing edge transitions and depth cues on terrain, rocks, logs and branches. Preserve bark, rock and foliage detail and readable paths.
- One wind direction and strength drive precipitation and participating vegetation consistently. Wind also works in clear weather. Use restrained gusts and motion appropriate to each affected object.
- Lighting, sky, fog and sound support the selected condition. Exposed and sheltered viewpoints differ appropriately. Clear winter and overcast snowfall should each form a coherent composition.
- Keep particles and impact work bounded around the viewer, including after camera jumps. Keep visible snow depth consistent with the movement/contact approximation and document meaningful limitations.

## Module and forest integration

Follow [FRAMEWORK_DEV.md](../../FRAMEWORK_DEV.md). Own `modules/weather/`, its focused tests, assets/licenses and concise usage example. Develop the actual features in the forest at `baseline/`, then complete the reusable module and its owned local baseline copy. Register the module through the existing conventions.

Keep related weather features in this module with clear internal file boundaries. Precipitation, wetness, snow coverage and wind have independently adjustable state. Presets configure combinations of that state. Provide useful defaults and let a consumer enable only the features it needs.

Use the existing `init(context)`, `update(dt, elapsed)`, `configure(settings)` and `dispose()` layer lifecycle. The application owns the renderer, frame loop, sky, fog and lights. Weather supplies condition state and reusable preset values; a small scene integration applies coordinated environment changes and identifies participating materials, vegetation and shelter. Seasonal presets can include scene-owned material or dressing variants. Keep forest asset names and authored placements in the forest integration.

Accept explicitly supplied surface/material targets and surface-hit/exposure information, including hit position and normal where needed. Choose a small documented interface that can describe forest ground, canyon ledges and overhead shelter. A ground-height query alone does not describe cover. Compose rain and snow material changes with each other and with existing shader hooks; restore owned modifications and release effect resources on disposal.

Complete the forest implementation independently of the canyon branch. The second-world integration follows user review, using the finished module's real interfaces. Document the smallest useful scene integration with a working example.

## Milestones and acceptance

1. Rain, wetness and clear-to-rain transitions working in the forest.
2. Settled snow, snowfall and coherent winter presentation.
3. Shared wind, coordinated presets, transitions and composed surface effects.
4. Reusable module, validation, independent review and handoff.

Exercise the individual controls and combinations through real input: rain stopping on wet ground, settled snow without snowfall, windy clear weather, wind during precipitation, and changing weather over snow-covered surfaces. Check camera travel, shelter, pause/focus loss, mute, reset and repeated activation/disposal. Run focused module tests, the framework checks and relevant forest package checks. Measure frame timing on Balanced at 1600 × 1000, targeting 60 FPS; report browser, GPU, preset and competing load.

Run **six independent harsh art-critic passes**, with fixes and fresh captures of committed builds between passes. Use AAA environment art as the quality reference and aim for 9/10; complete all six passes even if an earlier score reaches the target. Begin the scored cycle once the required conditions are present so each pass evaluates the whole feature set.

Judge lighting, wet and snowy materials, coverage, particle motion, vegetation response, sound, coherence and readability. Include matching clear/rain/winter views, close-up exposed and sheltered surfaces, ordinary exploration and recorded transitions. Review motion directly; static screenshots alone cannot establish effect quality. Preserve the baseline's visual detail across every condition.

Keep scores, specific findings, source commits and captures in ignored task artifacts. Report the actual final result and remaining weaknesses; resolve correctness blockers independently of the score.

## Workspace and handoff

Use a dedicated worktree. Own the weather module and forest integration; keep them in separately identifiable commits. Limit shared registry and module-guide edits to this capability. Local plans and review artifacts belong in `runs/weather/` or `.artifacts/`.

Preferred strict ports: dev **4500**, preview **4501**, browser verification **4502**. Check availability and record replacements. Coordinate browser/GPU capture windows with the canyon session when available and disclose concurrent load in measurements. Stop task-owned servers at handoff.

Deliver launch commands, controls, validation, critic results and the module integration example. Leave local commits unmerged and unpublished for user review. The forest stays at `baseline/` during these parallel builds; canyon adoption and the move to `baselines/forest/` belong to the subsequent integration pass.
