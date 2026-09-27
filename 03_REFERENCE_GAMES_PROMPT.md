# 03 — Check the framework against other game styles

Review existing repository games for concrete requirements and reusable tooling that make `_tech9` useful across game styles. Supply evidence for the Echo extraction and starting-point selection, and implement independently scoped improvements where justified.

## Start

Prompts 01–03 can run concurrently from the same accepted commit, each in an isolated worktree. Read `_tech9/AGENTS.md`, `_tech9/WORKFLOW.md`, `_tech9/FRAMEWORK_DEV.md`, `_tech9/GENERATE.md`, `HANDOFF-tech9-graduation.md`, the other two prompts, and local instructions for each reference package.

## Parallel ownership

Own reference analysis and any justified standalone authoring tools, with their focused tests and usage instructions. Prompt 01 owns extracted modules and sprite-world; prompt 02 owns generation, schemas and shared framework docs. Supply actionable findings for those areas in the session handoff, with file references and concrete examples. The integrated review resolves them against the completed implementations.

## References

| Source | Perspective |
| --- | --- |
| `games/void-sentinel/` | Canvas2D top-down scrolling shooter |
| `games/vulpine/` | Three.js flight/shooter, authored worlds and audio |
| `games/void-sentinel-breach/` | Three.js game with a Blender/GLB asset pipeline |
| `games/void-fracture/` | Native Godot scenes, scripts and package structure |
| `tools/` | Stack selection, sprite/scenery authoring and development tooling |

Inspect actual implementations and completion state. The reference set provides evidence, not a requirement to extract a module or baseline from every game.

## Deliver

1. Trace how a new top-down shooter, a Three.js action game and a native Godot game would enter the framework. Distinguish implemented paths from future support.
2. Identify assumptions that unnecessarily require a forest, RPG campaign, browser renderer or particular control scheme. Give prompts 01 and 02 concrete integration requirements grounded in reference code. Distinguish an actual blocker from an optional future capability.
3. Compare candidate helpers and authoring tools with existing modules. Promote a standalone authoring tool only when it supplies a concrete missing capability with a usable interface, required assets and integration. Propose changes to concurrently owned modules for the integration pass.
4. Deliver a short reference matrix with supported paths, concrete fixes and useful deferred opportunities. Put durable tool usage alongside any promoted tool. Fold accepted findings into normal framework docs during integration.

Keep game-specific missions, content and balancing in their packages. A complete port, universal renderer abstraction or extraction from every reference is outside this pass.

## Verify and hand off

Run checks appropriate to the framework changes. Use independent review for changed interfaces and the shared visual critique when promoting visual assets. Reference-game inspection does not require launching unfinished games or changing their source.

Commit any completed source changes in the worktree. A review that finds no worthwhile promotion can finish with its evidence and recommendations alone. Leave changes ready for review and merge. Combine the findings with prompts 01 and 02 before the new game and framework-dev gate in `04_TBD_PROMPT.md`.
