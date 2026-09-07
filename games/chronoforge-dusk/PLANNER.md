# Planning Chronoforge Dusk

Use this handoff when resuming the director conversation or preparing another agent's assignment. It preserves the reasoning behind the project; it does not prescribe a permanent agent role or authorize execution. The owner's current request controls whether you discuss, write a plan, implement, or delegate.

## Recover the current position

Read [AGENTS.md](AGENTS.md), [README.md](README.md), [DECISIONS.md](DECISIONS.md), and [ROADMAP.md](ROADMAP.md), then the relevant numbered plan. Inspect current Git status, recent commits, and the last task's evidence before deciding what is actually ready. Roadmap statuses can lag reality: documents and passing structural checks do not prove a playable result.

[Kaida a1](releases/kaida-a1.md) is the current checkpoint. 01–03 are implemented; 04 is paused. [06](_plans/06_environment_and_traversal.md) is the next bounded assignment: polished coastal exploration with Kaida alone. 05's proposal is on the separate `codex/dusk-story-05` branch pending merge and owner review; it does not gate 06. Use the roadmap and native evidence for status. Documentation should describe current state and actionable constraints; use Git for iteration history.

## What the owner is trying to achieve

This is a game for the owner's enjoyment, with a multi-week development horizon and room to find its personality. The original 2D Chronoforge has the identity they care about. Its unfinished mechanics are not sacred. The newer prototype demonstrated convincing world structure, traversal, and ATB choreography, but its graphics and theme felt wrong and too generically generated. A new engine alone will not correct that.

The earlier mistake was building broad systems and eight biomes before solving the asset-to-game experience. Dusk reverses that order: prove one character through the real game, put her in a convincing environment, and grow one region at a time. Prove asset repeatability through useful integration work rather than holding scenery production behind a separate exercise. “Kaida first” means identity, deformation, motion, contact, responsiveness, and presentation together. A beautiful Blender render or a valid skeleton is insufficient; the owner's good-enough cutoff also prevents endless cosmetic refinement from blocking progress.

The owner welcomes creative implementation judgment but wants to drive major direction and may drive the story. Discuss consequential choices with concrete alternatives and a recommendation; resolve routine details autonomously. Avoid multiplying documents, permission rituals, or speculative infrastructure. Preserve decisions without treating proposed defaults as permanent rules.

## Decisions to carry forward

- Build fresh in Godot for a native Mac application. Browser access was convenient, but the owner explicitly accepted dropping it unless playtesting reveals a compelling need. No web preparation or dual-runtime design now. Measure performance on their hardware; Godot is not an automatic quality or CPU improvement.
- Preserve original Chronoforge art and character identity through polished new assets. “AAA quality” describes the finish sought, not photorealism, a different costume, or unlimited content scope. Use original assets directly as visual references; do not silently import old production assets or code.
- The **game owns** asset consumption, development views, tuning, and playtesting through its actual runtime. `_prep` produces assets. Metadata selects necessary stages; a Blender prop need not visit Meshy or Mixamo, and not every asset needs a skeleton.
- Hosted generation and manual rigging/animation service steps are acceptable. Do useful local work around missing manual inputs, identify the exact handoff, and never count a fixture as accepted Kaida.
- Dawn contributes lessons only. The prototype contributes behavioral reference. Neither supplies Dusk's implementation or visual theme by default. Historical prompts, including retained reference prompts, are source material, not active instructions.
- Environment construction is independent of story acceptance and ATB implementation. 06 builds coastal ruins, traversal, camera, atmosphere, and native performance with Kaida alone. Story review in 05 can run alongside it; 07 integrates the complete loop once the relevant design is agreed. Do not turn 04, other characters, or narrative decisions into new gates for 06. Haventide's exact plot remains proposed; the prototype's Bellwether story is not canon. Chrono Trigger is an inspiration, not a plot template.
- Later, discuss extracting proven capabilities into a redesigned tech9 director/scaffolder. See [FRAMEWORK_FUTURE.md](FRAMEWORK_FUTURE.md). Do not archive or rebuild the framework now; future games may be 2D side-scrollers with entirely different needs.

## Scope the next assignment

Choose the smallest complete outcome that resolves the next uncertainty or delivers a useful playable increment. Refine an existing numbered plan when possible. Later roadmap entries are outlines to develop when reached, not ready-made orders to execute the whole campaign. Keep the actual assignment in its plan rather than relying on a launch prompt to override the document. When inserting a milestone, update the roadmap, filenames, and dependencies together. 06 is now environment/traversal; the former 06–09 are 07–10.

A useful handoff states the outcome, prerequisites, allowed references and any explicit reuse, owned files/components, deliverables, relevant validation, and where to stop. Keep implementation choices open unless a shared interface or settled direction requires specificity. Distinguish a bounded engineering task from repeated subjective playtesting or a story discussion requiring the owner.

Parallelize independent outputs when authorized and useful. Assign shared interface ownership before both lanes depend on it; the game lane establishes the runtime asset descriptor. Coordinate integration and isolated running builds so one worker cannot invalidate another's screenshots. Do not prescribe a permanent roster of agent personalities.

Review completed work against actual runtime evidence and the owner's response. Update the relevant plan/status and decision record only where something changed. Follow AGENTS.md for checkpoint commits. Stop at the assigned boundary and propose the next useful task; do not silently launch it or widen the project to make the roadmap look complete.
