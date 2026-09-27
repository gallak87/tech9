<!-- Authoring template for GENERATE.md. Replace all bracketed guidance with concrete game decisions, retain the three headings, and save the result as runs/<slug>/PROMPT.md. Match BRIEF.md and plan.json. Prepare this before the review gate; drafting it does not authorize execution. -->

# Goal

Build [title and a concise, specific description of the game]. The player [core actions and distinctive challenge], working toward [session outcome], then [retry/replay/progression loop].

User direction: [preserve the original pitch and explicit constraints]. Design choices: [the few consequential inferred decisions, including bounded content and target devices]. Include [must-have experience]; leave [scope exclusions] outside this build.

Use [verified starting point, renderer and selected modules] in `_tech9/games/[slug]/`. [Describe what is reused, what authored content is replaced, and any concrete capability gap.] Give it [cohesive visual/audio direction and observable quality goals]. Target [performance budget, representative viewport/device class and quality preset]; measurements must state the actual environment.

# How to work

1. **Architecture first.** After creating the package through `GENERATE.md`, adapt `ARCHITECTURE.md` before feature code. Define [game-specific subsystems], their public interfaces, shared state and ownership, coordinate/time conventions, lifecycle, and asset/source/license policy. Keep [game-specific rules] local and reuse [selected capabilities]. Scale the design to this game; handle recoverable subsystem failures without leaving a broken UI.

2. **Build the verification loop early.** Establish [readiness observation, real-input smoke route, representative camera/state captures and useful diagnostics]. Capture errors and [relevant performance/resource measurements]. Add small reproducible showcase scenarios for [the risky visual or behavioral systems] where they improve diagnosis. Record original source assets and inspect rendered results; a screenshot alone does not prove gameplay or motion quality.

3. **Build and integrate in dependency order.** Complete [the smallest enjoyable start → action → outcome → restart slice] before expanding to [remaining content]. Assign [exclusive path ownership and application integration owner]. Use bounded parallel builders when authorized and available; otherwise execute those responsibilities sequentially. Integrate and verify at [concrete milestones]. Keep a working app between milestones and coordinate the server/capture schedule.

4. **Review and improve.** Commit stable checkpoints before independent critique. Review [visual composition/materials/readability and game-specific motion/feel] against [brief, style direction and any supplied references]. Use [score target and round cap, defaulting to the shared workflow] and report actual scores. Feed ranked findings into focused fixes and affected checks. Review individual systems when useful without requiring a separate module or critic loop for every folder. Record a missing independent review honestly if it cannot be obtained.

5. **Verify the whole game.** Play [the full user journey] through real input and test [genre-specific failure/exploit/recovery cases] on [target layouts and inputs]. Run [owning package commands and affected framework checks]. Review the integrated game's presentation and motion, not just isolated showcases. Record measured performance and device-coverage limits. Fix correctness blockers independently of art scores.

6. **Finish and hand off.** Keep milestone, validated commit, checks/evidence, review rounds/scores, ranked open issues and next action in `runs/[slug]/STATUS.json`. Resume from unresolved work and respect the round cap. Commit the completed source, editable assets and required notices. Report launch commands, controls, validation, actual review results and remaining limits. Stop task-owned processes and clean up the completed run folder per `WORKFLOW.md`; [state the user-authorized stopping point].

# Rules

- Start implementation after the GENERATE.md review gate is accepted or explicitly waived. Honor user constraints; make routine decisions within the approved scope and review material departures. Preserve prior approval on resume and continue through the authorized task.
- Keep ownership explicit. Builders edit their assigned paths; the integration owner handles shared application changes. Do not invent tools, agents, permissions or review results.
- Preserve unrelated work, standalone package boundaries and immutable fork receipts. Use package-owned dependencies and the framework's compatibility checks.
- Judge completion by playable behavior and observed presentation. Report failures, unmet targets and unverified device/motion claims honestly; do not inflate scores or repeat review indefinitely.
- Keep new rules/content in the game. Follow `FRAMEWORK_DEV.md` for authorized reusable changes and respect any separate extraction-approval requirement. Record useful follow-ups without automatically expanding the task.
