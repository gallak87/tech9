# VECTOR//NOVA

Standalone Three.js/Vite game. Work inside this app; do not import repository frameworks or modify reference games.

## Read only what the task needs

Start with this file and the assigned task's brief.

- Runtime/geometry changes: relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md) and the [level API](docs/LEVEL_API.md).
- Visual work: [art direction](docs/ART_BIBLE.md).
- Planning: [ROADMAP.md](ROADMAP.md).

## Working rules

- Preserve approved levels, shared controls and 0.3 steering assistance unless the user requests a change.
- Work in the assigned checkout and preserve unrelated edits and servers. Reuse existing helpers; keep world-specific art and tuning local. Verify affected behavior when changing shared code.
- Follow the user's scope and assigned brief; finished critic loops stay closed.
- For work beyond a simple bug fix, defer all mobile/portrait verification until implementation and desktop iteration are complete and the final code is ready. Do not run mobile/portrait checks between implementation or critic rounds. Run relevant mobile/portrait checks once at the end; repeat only if subsequent changes affect those cases. A simple mobile/portrait bug fix may use targeted checks during the fix.
- Run targeted tests and a production build when appropriate; check documentation links. Let the pre-commit hook run ESLint/Prettier through lint-staged. Do not repeat manual lint/format passes for routine edits. Ensure generated Husky hooks exist in a new worktree via the existing package prepare script.
- Run `nvm use 22` once at the start of each shell session, then use its Node/npm without hard-coded runtime paths.
- Browsers stay hidden/headless. No unsolicited videos or normal-speed automated full laps. Use a free port for your server, close owned verification processes afterward and report only actually verified results.
- Commit and merge when requested. Human approval cannot be supplied by an agent.

## Keep documentation small

Keep progress and review findings in the chat. Document enduring technical decisions and actual APIs in architecture/source/tool docs, visual direction in the art bible and future features in the roadmap. Keep asset provenance and licences. Raw captures/reports belong in ignored `.experiments/`. Remove temporary reports and completed execution handoffs; Git retains history. Do not create status files or duplicate implementation/performance/integration reports.
