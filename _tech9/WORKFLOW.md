# Working with Tech9

Choose the task's purpose at kickoff:

- **game-dev:** consume a registered starter and build a playable game. Start with [GENERATE.md](./GENERATE.md).
- **framework-dev:** build or improve a shared capability, including bringing one back from a game. Start with [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md).

Both flows work from a fresh clone. Neither needs a historical run folder or a fixed agent roster. Resolve paths relative to the directory containing this file: `_tech9/` today, repository root after a separately authorized migration. CLI path adapters still require that future migration; the workflow itself stays the same.

## Coordinate locally

Create ignored `runs/<task>/` only when needed. Keep the active scope, acceptance, ownership, dependencies, validation, authority and stop condition there. Game forks require `plan.json` following the [execution-plan schema](./schemas/execution-plan.schema.json). Framework work can use a short local plan without a game starter or the game-fork schema.

The user can delegate routine execution. Record that authority accurately; a planning gate does not require another confirmation when the request already covers the work. Ask only about material missing requirements before dependent work.

Plans, briefs after kickoff, agent assignments, review reports, captures, execution logs and handoff notes are temporary coordination. Do not commit `runs/`, force-add ignored records, or relocate the same history into tracked documentation. Other worktrees do not receive ignored files: send the task's current instructions directly when coordinating agents. After completion and handoff, remove that task's local run folder; preserve active work from other tasks. Consumers must never depend on run records. Git records source history.

## Build and verify

Assign one owner per edited path. Use bounded agents only when authorized and useful. Keep renderer ownership, content, controllers and game rules at concrete seams; every new system must participate in a running integration. For games, complete start → real input → core action → result → restart before adding depth.

Run relevant unit/lint/build checks and real-input browser checks for behavior changes. Test hooks support observation and rare-state setup, not a substitute for playing the core loop. Use engineering checks for tooling/docs changes without inventing an art gate or redundant captures.

Keep validation within its ownership boundary. Framework-dev runs canonical module/tooling checks (`./run run check`) and affected maintained starter checks. Consumer games are independent projects, even when stored under `games/`; do not run or modify their suites as framework regressions. Game-dev owns that game's checks. Inspect a game when a promotion is requested, then test the promoted code in framework-owned tests. A consumer may continue its game indefinitely and never promote anything back.

Freeze and commit source before independent review. Serialize browser/GPU captures against that build. Keep findings and captures locally; fix blockers in source/tests and communicate results in the task. Record browser, GPU, viewport, preset and frame timing locally when making performance claims. Scheduling measurements are not isolated GPU timings or hardware guarantees.

When a game art gate is requested, use a demanding independent critic and stop at **8/10 or four rounds**, whichever comes first. At the cap, report the actual result and remaining limits; correctness blockers still require fixes. Visual quality and behavioral correctness are separate results. Framework promotion normally uses an engineering review, not a new art cycle.

## Finish

Commit the deliverable, tests and required licenses. Keep current launch/controls/limitations with the game. A graduated capability gets **one** usage aid: a working example **or** concise documentation, chosen according to what teaches its use with less maintenance. An existing scene integration can be that example; do not add a parallel module manual or promotion report.

Useful findings become implementation, tests or current operating guidance. Bring unresolved capability requests into a scoped framework-dev task; no permanent historian report is required. Existing games own their copies and are not silently upgraded. Stop task-owned processes and stop at the agreed handoff; do not publish, push, migrate the root or start another game without that scope.
