# Producing a game

The producer owns the outcome. The plan is a compact execution contract, not a fixed roster of model identities.

## 1. Direct

Turn the idea into a one-paragraph player experience: what the player does, why it is interesting, how a session begins/ends, and the target input/device. Inspect an available starter, its limitations and licenses. Identify the smallest complete game that proves the idea.

Write `runs/<slug>/plan.json` using the [schema](./schemas/execution-plan.schema.json) and [Alder Signal example](./runs/alder-signal/plan.json). Include must-have/out-of-scope work, milestone acceptance, disjoint file ownership, dependencies, real-input playthrough, performance target, critic threshold/round limit and explicit stopping point.

## 2. Gate and fork

The gate checks feasibility, actual starter availability, scope, validation and authority. `authorization.mode` is `delegated` when the user has already authorized autonomous execution; record the basis accurately. Use `explicit` when the user approved that concrete plan. Do not manufacture approval or ask again when existing authority covers the work. Resolve material missing requirements before dependent implementation.

From the repository root, `npm --prefix _tech9 run t9 -- validate <plan>` verifies structure and cross-references. Plan paths remain repository-relative even though npm runs in `_tech9`. `fork --dry-run` previews the source copy. Commit the starter checkpoint before the actual fork, then create the owned game under root `games/<slug>` and install its dependencies. The receipt is evidence of what was copied, not a claim that the game is complete. Leave the existing root framework intact while proving this foundation.

## 3. Build vertically

Assign bounded builder lanes only where they can progress independently; give each its APIs, owned paths and acceptance. Keep integration under one producer. First deliver start → real input → core action → result → restart. Add depth and polish inside that working loop.

A QA lane may own tests; the critic owns no implementation. Serialize edits and captures when they share a running build. No reviewer should grade a moving source tree. If an ownership transfer is needed, finish the previous lane and record the new owner.

## 4. Verify and critique

For each deliverable checkpoint:

1. Run relevant unit/lint/build checks and a browser playthrough that sends actual input. Confirm loading, game states, failures, restart, controls and cleanup. Test hooks support observation and rare-state setup, but cannot substitute for playing the core loop.
2. Freeze and commit the implementation. Record exact source commit, commands, browser/GPU/viewport/preset and observed frame timing. Scheduling measurements are not isolated GPU timings or hardware guarantees.
3. Ask a separate reviewer to inspect evidence and code, with an independent playthrough when useful. Engineering gates use findings; game/art gates additionally grade up to 10 against the stated ambition. Visual beauty, gameplay correctness and performance remain separate results.
4. Commit a small review JSON and at most one or two representative screenshots. Record severity, concrete evidence and highest-value fixes. Keep transient logs in ignored `.artifacts`.
5. Fix actionable issues, make another implementation commit and repeat only within the task's authorized review scope. When a full art gate is requested, the default target is 8/10, maximum four rounds. At the cap, report the honest score and remaining deficits; never relabel a failed gate as passed. Alder Signal's current stop is a playable user handoff after engineering/behavior checks, not an autonomous four-round polish cycle; follow its execution plan.

No mandatory screenshot of documentation-only changes. Give those a contract/engineering review. Security or correctness blockers remain blockers even when the art round limit is exhausted.

## 5. Deliver and learn

Write a short game README with launch/controls/validation/limitations. Record completion against plan, exact review evidence and remaining work. Preserve licenses and source art. Stop task-owned servers. Discuss the next project only after this scope is complete.

Capture a lesson with its evidence and applicability. Promote a module after at least two real uses reveal a stable seam, with its own tests, limits and example. A future `/generate` adapter should invoke this workflow and CLI; it should not resurrect rigid role counts or substitute a roster for a playable result.
