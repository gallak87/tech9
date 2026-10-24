# VECTOR//NOVA

Standalone Three.js/Vite game. Work inside this app; do not import repository frameworks or modify reference games.

## Read only what the task needs

Start with this file and the assigned task's brief.

- Runtime/geometry changes: relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md) and the [level API](docs/LEVEL_API.md).
- Visual work: [art direction](docs/ART_BIBLE.md).
- Ship model/material improvement: read the [ship visual improvement workflow](assets/ships/README.md#visual-improvement-workflow) before editing or starting a critique loop. Establish a visible improvement on one representative assembly before full baking or fleet rollout; reassess a plateau instead of repeating small tweaks.
- Planning: [ROADMAP.md](ROADMAP.md).

## Working rules

- Preserve approved levels, shared controls and 0.3 steering assistance unless the user requests a change.
- Work in the assigned checkout and preserve unrelated edits and servers. Reuse existing helpers; keep world-specific art and tuning local. Verify affected behavior when changing shared code.
- Follow the user's scope and assigned brief; finished critic loops stay closed.
- After changing a circuit's route, scenery, lighting, staging camera or rendered assets, refresh its saved menu still using [the preview workflow](ARCHITECTURE.md#circuit-preview-refresh). Refresh consumers of borrowed assets too; shared presentation changes need an all-circuit refresh. Commit the current WebPs and their capture manifest with the change. Menu hover must never construct a level.
- For work beyond a simple bug fix, defer all mobile/portrait verification until implementation and desktop iteration are complete and the final code is ready. Do not run mobile/portrait checks between implementation or critic rounds. Run relevant mobile/portrait checks once at the end; repeat only if subsequent changes affect those cases. A simple mobile/portrait bug fix may use targeted checks during the fix.
- User-requested exception: the [circuit expansion campaign](docs/expansion/README.md) is desktop-only. Do not run mobile, portrait, touch-emulation, or mobile-landscape checks, including embedded CPU camera cases or a final per-level pass. The user will handle that verification separately after all levels; inspect/filter combined suites accordingly.
- Every player-facing flow must work with keyboard and standard controller for Steam readiness, including garage, rewards, settings and save dialogs; no pointer-only actions. Use native focusable controls and the shared action/navigation path; verify new controls are reachable, activatable, and return focus correctly by both inputs. Follow the [menu input contract](ARCHITECTURE.md#menu-input-contract), including custom widgets and new overlay roots.
- Run targeted tests and a production build when appropriate; check documentation links. Let the pre-commit hook run ESLint/Prettier through lint-staged. Do not repeat manual lint/format passes for routine edits. Ensure generated Husky hooks exist in a new worktree via the existing package prepare script.
- Run `nvm use 22` once at the start of each shell session, then use its Node/npm without hard-coded runtime paths.
- Default to hidden/headless browsers for autonomous verification. When the user asks to watch a test, replay, or browser interaction, use headed mode without requesting confirmation again. Avoid normal-speed automated full laps unless requested by the user results.
- For visual inspection use `?artPass=1&level=<id>`: direct production level, no Tunes, free camera and Dev tools open. Copy view link or `__VN.getArtPassURL()` preserves a camera pose for the next pass; URL/API details and comparison limits are in [architecture](ARCHITECTURE.md#lifecycle-and-verification).
- Use a free port for your server, close owned verification processes afterward.
- No unsolicited videos. The maintained `npm run verify` frontend check writes no artifacts; generic `verify:level` reports go to stdout unless `VN_EVIDENCE` is explicitly supplied. Do not use a historical browser harness as proof of the current front end; see tools/README.md.
- Commit and merge when requested. Human approval cannot be supplied by an agent.

## Keep documentation small

Keep progress and review findings in the chat. Document enduring technical decisions and actual APIs in architecture/source/tool docs, visual direction in the art bible and future features in the roadmap. Keep asset provenance and licences registered in `docs/ASSET_MANIFEST.json`. Temporary captures, reports and one-off verification scripts belong in ignored `.experiments/`; remove your own when the pass is complete. Keep reusable build/asset tools and regression tests, not evidence bundles or duplicate implementation/performance/integration reports.
