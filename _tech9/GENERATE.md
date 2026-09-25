# Generate a playable game

This is the agent-facing kickoff for the active Tech9 framework. The user supplies an idea or a pilot brief; the agent carries it through to a playable handoff. The intended user entrypoint is `/generate <idea>`. Slash-command registration is deferred: today, ask an agent to read this file and execute a brief. The CLI is an implementation tool inside this workflow, not the user interface.

## Locate the active framework

The directory containing this file is the framework root: currently `_tech9/`, eventually the repository root after a separately authorized migration. Resolve workflow documents, `runs/`, `scenes/` and `games/` relative to this file. Read its `AGENTS.md`, `README.md`, `WORKFLOW.md`, catalog and the selected starter's README/ARCHITECTURE before editing.

While `_tech9` is active, ignore the legacy root planners, `meta/` and `.claude/commands/generate.md` for this workflow. Preserve those files. New pilots belong in `_tech9/games/<slug>`; execution records belong in `_tech9/runs/<slug>`. The existing Alder Signal at repository-root `games/alder-signal` is an earlier pilot and stays in place for now.

The current CLI still takes repository-relative catalog and plan paths, even when invoked from `_tech9`. This is a tooling detail, not a change to the user's kickoff. Root graduation will update those path adapters and metadata separately; this document does not claim that moving the directory today is supported.

## Direct and authorize

Turn the idea into a short player experience with a clear objective, core action, outcome and restart. Inspect actual starter capabilities. For a pilot, prefer one satisfying complete loop to a large feature list. Ask only about material missing requirements; ordinary creative choices can follow delegated authority. If the user asked for planning only, deliver a plan and stop before implementation.

For an existing launch packet, first perform the relocation described under “Bootstrap one owned game,” before creating any run directory or plan. Then preserve/refine its `runs/<slug>/BRIEF.md` and write `plan.json` following the execution-plan schema. For a new idea without a launch packet, create those run files directly. Record scope, acceptance, concrete path ownership, dependency order, validation, authority and stopping point. Do not claim the user approved a plan they have not seen: use delegated authority when their request covers execution. Preserve user constraints across the entire run.

For the hunting and fishing launch packets, set `artGate` to `{ "threshold": 8, "maxRounds": 4 }`. First build and verify the complete loop, then run the bounded critic/fix cycle below. Hand over the playable build when the gate passes or reaches its cap; further depth waits for user playtesting. A cap below 8 means a failed art gate, reported plainly.

## Managed goal and bounded critique

Executing a launch prompt explicitly requests a managed goal for the complete game handoff. After inspection and scope definition, create that goal when the host provides a goal mechanism; never replace an unfinished goal silently. A planning-only request does not start one. If the host has no goal tool, use the written execution plan and report that limitation. The CLI itself does not create goals or run agents.

The goal covers the complete playable loop, correctness checks, checkpoint commits, independent critique and handoff. It is not merely “make the screenshot score 8.” Keep progress and stop conditions tied to those concrete deliverables. Only mark it complete when required work is finished; if the visual round cap was reached below target, the handoff may be complete while the art gate explicitly remains failed. Do not hide unverified gameplay behind a visual score.

Use a separate, demanding AAA art critic against frozen committed builds and actual browser captures. The critic must judge composition, lighting, materials, asset/animation quality, visual coherence and readability, identify concrete deficits and score honestly against the stated visual ambition. Do not relabel starter limitations as a pass or quietly lower the standard because this is a pilot. For each failed round, prioritize the highest-value game-local fixes, rerun affected checks and commit before another review. Stop at 8/10 or four rounds; report the final score and remaining deficits at the cap. Keep gameplay/engineering findings separate and resolve correctness blockers regardless of art score.

## Bootstrap one owned game

Some pilots start with only `BRIEF.md` and `PROMPT.md` under `games/<slug>`. The fork command deliberately refuses any existing destination. Inspect that directory first. If it contains exactly those launch files and `runs/<slug>` does not exist, move the entire launch-packet directory to `runs/<slug>`, then write the plan there. This preserves the brief and frees the output path. Never remove or overwrite a game, an existing run, or unexpected files to make the fork succeed. If a game already has a provenance receipt, inspect it and resume it instead of forking again.

From the current framework directory (`_tech9`), use a supported Node version and these commands, substituting the chosen starter, slug and ports:

```sh
npm ci
npm run t9 -- catalog
npm run t9 -- validate _tech9/runs/<slug>/plan.json
npm run t9 -- fork --starter <starter-id> --slug <slug> --plan _tech9/runs/<slug>/plan.json --port <dev-port> --dry-run
npm run t9 -- fork --starter <starter-id> --slug <slug> --plan _tech9/runs/<slug>/plan.json --port <dev-port>
npm --prefix games/<slug> ci
```

Only fork a clean committed starter. Inspect the current catalog: the forest source now includes fly/grounded walking and placement-derived collision helpers; the pond example additionally integrates water and shoreline. Read the relevant module contracts in `modules/` and `docs/CAPABILITIES.md`. Starter selection chooses a tested source combination; arbitrary module composition is not an automatic CLI feature. Animals, fishing rules and complete game loops remain game work. Build needed systems inside the game. Preserve the generated `tech9.json` and `GAME_PLAN.json` bytes and source/license records. Replace inherited starter documentation with truthful game documentation. Give game storage and presentation their own identity.

## Build, verify and hand over

Follow WORKFLOW.md. Keep renderer ownership, world content, controller and rules separate at concrete seams. Every new system must participate in the running loop. Use bounded agents when authorized and useful; an independent critic reviews a stable committed checkpoint. One owner edits each path. Games own their copied source and never import runtime code from the framework or another game.

Run the game's unit, lint, build and browser checks. Verify the core action, success, failure/recovery, pause/resume and restart with real input. Test hooks stay behind `?test=1`; they must not replace the core playthrough. Record browser, GPU, viewport, preset and frame timing for performance claims. Keep compact independent review evidence separate from implementation commits.

For simultaneous worktrees, edit only the assigned game and run directory. Record framework friction and promotion candidates in that run's `CONSUMER_NOTES.md`; do not patch shared starter/tooling or the other pilot as part of game development. Use the assigned ports, check availability, and do not replace repository hooks. Worktrees share machine resources: coordinate GPU captures, or disclose competing load and defer isolated performance claims. Never stop another session's server.

Deliver launch instructions, controls, a short validation checklist, evidence and known limitations. Stop at the agreed handoff; do not begin another game, publish, push, migrate the root framework or promote modules without that scope being authorized. A useful game-local water layer or animal controller is a candidate for reuse, not an automatic framework feature.

## Future slash-command adapter

When command integration is requested, `/generate` should pass the user's idea and current authorization to this workflow, resolving paths from the active framework root. It should retain the user's playtest gates and resume an existing run when appropriate. It should not introduce a second planning/build pipeline or require the user to operate the CLI. Until that adapter is installed, the manual prompt is the supported kickoff.
