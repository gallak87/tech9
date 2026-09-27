<!-- Authoring template for GENERATE.md. Replace all bracketed guidance with concrete game decisions, retain the three headings, and save the result as runs/<slug>/PROMPT.md. Match BRIEF.md and plan.json. Prepare this before the review gate; drafting it does not authorize execution. -->

# Goal

Build [title and a concise, specific description of the game]. The player [core actions and distinctive challenge], working toward [session outcome], then [retry/replay/progression loop].

User direction: [preserve the original pitch and explicit constraints]. Design choices: [the few consequential inferred decisions, including bounded content and target devices]. Include [must-have experience]; leave [scope exclusions] outside this build.

Use [verified starting point, renderer and selected modules] in `_tech9/games/[slug]/`. [Describe what is reused, what authored content is replaced, and any concrete capability gap.] Aim for **AAA-level art direction, game feel and polish** within [chosen style and bounded scope], with [strong visual references and concrete goals for assets, lighting/materials, animation, camera, effects, UI and audio]. Preserve any explicit user quality override. Target [performance budget, representative viewport/device class and quality preset]; measurements must state the actual environment.

# How to work

1. **Architecture first.** After creating the package through `GENERATE.md`, adapt `ARCHITECTURE.md` before feature code. Define [game-specific subsystems], their public interfaces, shared state and ownership, coordinate/time conventions, lifecycle, and asset/source/license policy. Keep [game-specific rules] local and reuse [selected capabilities]. Scale the design to this game; handle recoverable subsystem failures without leaving a broken UI.

2. **Build the verification loop early.** Establish [readiness observation, real-input smoke route, representative camera/state captures and useful diagnostics]. Capture errors and [relevant performance/resource measurements]. Add small reproducible showcase scenarios for [the risky visual or behavioral systems] where they improve diagnosis. Record original source assets and inspect rendered results; a screenshot alone does not prove gameplay or motion quality.

3. **Fan out and integrate.** Establish interfaces, then delegate [independent work packages] to the approved subagent roster with [exclusive paths per builder] as dependencies permit. Keep one integrator responsible for shared application code and resolving seams. Complete [the smallest enjoyable start → action → outcome → restart slice] before expanding to [remaining content]. Run dependency-ordered waves and integrate at [concrete milestones]. If tools or useful parallel work are unavailable, state the reason and execute sequentially. Keep a working app between milestones and serialize browser/GPU captures.

4. **Use a harsh AAA art critic.** Assign a separate, demanding reviewer who writes no implementation code. After each stable committed checkpoint, have the critic inspect representative gameplay views and moving play, and listen to relevant audio. Compare [composition, assets, lighting/materials, animation, camera, effects, UI, sound and game-specific feel] against [selected references and brief]. A polished menu or isolated showcase cannot establish whole-game quality. Use [the brief's score target and round cap; default 8.5/10 and four rounds]. Require honest scores, specific evidence and ranked fixes; builders address the highest-value issues before re-review. Record missing review or unobserved motion/audio honestly. At the cap, report the actual score and remaining gaps; resolve correctness blockers independently.

5. **Verify the whole game.** Play [the full user journey] through real input and test [genre-specific failure/exploit/recovery cases] on [target layouts and inputs]. Run [owning package commands and affected framework checks]. Review the integrated game's presentation and motion, not just isolated showcases. Record measured performance and device-coverage limits. Fix correctness blockers independently of art scores.

6. **Finish and hand off.** Keep milestone, validated commit, checks/evidence, review rounds/scores, ranked open issues and next action in `runs/[slug]/STATUS.json`. Resume from unresolved work and respect the round cap. Commit the completed source, editable assets and required notices. Report launch commands, controls, validation, actual review results and remaining limits. Stop task-owned processes and clean up the completed run folder per `WORKFLOW.md`; [state the user-authorized stopping point].

# Rules

- Start implementation after the GENERATE.md review gate is accepted or explicitly waived. Honor user constraints; make routine decisions within the approved scope and review material departures. Preserve prior approval on resume and continue through the authorized task.
- Keep ownership explicit. Builders edit their assigned paths; the integration owner handles shared application changes. Do not invent tools, agents, permissions or review results.
- Preserve unrelated work, standalone package boundaries and immutable fork receipts. Use package-owned dependencies and the framework's compatibility checks.
- Judge completion by playable behavior and observed presentation. Report failures, unmet targets and unverified device/motion claims honestly; do not inflate scores or repeat review indefinitely.
- Treat AAA as the quality target, never an unsupported completion claim. Replace placeholder/programmer art before calling presentation finished; prioritize the playable experience alongside menus and showcases.
- Keep new rules/content in the game. Follow `FRAMEWORK_DEV.md` for authorized reusable changes and respect any separate extraction-approval requirement. Record useful follow-ups without automatically expanding the task.
