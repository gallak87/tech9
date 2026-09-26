# Build Trail Driving

Build the complete driving game in the adjacent `BRIEF.md`, with a Jeep, ATV and dirt bike, then carry its proven reusable driving systems through a framework-dev extraction. Use `_tech9/GENERATE.md` for game-dev and `_tech9/FRAMEWORK_DEV.md` for the later module phase.

Work in this session's assigned dedicated worktree, based on the committed framework and launch packet. Read `_tech9/AGENTS.md`, `README.md`, `WORKFLOW.md`, the baseline's README/architecture, the module guide and this brief. Inspect the actual source before choosing implementation seams.

Create a managed goal to deliver the complete game, validation, bounded review, module extraction and handoff. This execution request delegates routine design and implementation decisions, local package dependency installation, asset authoring, validation and local milestone commits. Use bounded subagents where useful, including independent engineering and art reviewers, with explicit file ownership. Keep browser/GPU work serialized.

First relocate this exact two-file launch packet to `_tech9/runs/trail-driving/` following GENERATE.md. Create a schema-version-2 execution plan there using the version in `baseline/package.json`, the brief's milestones and the delegated authority in this prompt. Validate it, then use the CLI to copy the baseline into `games/trail-driving`. If a game package already exists, inspect and resume it. Use the framework-relative CLI paths and the brief's preferred ports after checking availability.

Develop the game as its own package. Reuse the baseline's rendering and assets and the existing module interfaces where they fit. Inspect `follow-camera` and `placement-collisions`; their current contracts inform integration, while land-vehicle dynamics, suspension/contact, bike balance and the driving game loop are implementation work. Keep simulation, input, vehicle presentation, camera, world queries and route/progression rules at concrete interfaces.

Complete the Jeep's full playable loop first, then the distinct ATV and dirt bike, then all routes, progression and presentation. Deliver every required milestone in the brief. Use the actual three vehicles to find what deserves sharing. Make routine tuning and art decisions autonomously, and surface genuine blockers or material scope changes.

Validate through real input and meaningful tests, commit stable source, and obtain independent engineering review. Fix actionable findings. Run the demanding independent art-critic cycle to 8/10 or four rounds, whichever comes first. Resolve correctness blockers; report the actual art result at the cap. Keep review reports, plans and captures in ignored run/artifact directories. Preserve immutable copy receipts, editable asset sources and licenses.

Once game acceptance is complete, switch to **framework-dev** as a separate phase of this task. Inspect the finished implementation, extract the reusable driving behavior into descriptively named modules, and bring back concrete improvements to existing modules. Supply canonical tests, concise integration examples, dependency/resource ownership and required assets/licenses. Update `modules.json` and the module guide, run the framework checks, review the extraction and commit it. The game continues to own its local implementation and content.

Finish after the game and module handoff. Provide launch commands, controls, real-input validation results, review outcomes and the reusable module entrypoints. Leave task coordination local, remove the completed run folder after handoff and stop task-owned processes. Complete the managed goal when those deliverables are finished.
