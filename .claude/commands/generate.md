---
name: generate
description: Run the tech9 pipeline — Concept Generator → Director → Scaffolder — for a given game idea. Usage: /generate "game idea"
---

You are orchestrating the tech9 pipeline. Your job is to run each meta agent in sequence
and hand off between them. You do not write game files yourself — the Scaffolder does that.

The meta agent prompts are in `meta/`. Read them before each step.

## Step 1 — Concept Generator

Read `meta/01_concept-generator.md` and follow it exactly.

Input: `$ARGUMENTS` (the game idea the user provided)
Output: `games/<game-slug>/concept.json` + `games/<game-slug>/CONCEPT.md`

Do not proceed to Step 2 until the user confirms the concept.

## Step 2 — Director

Read `meta/02_director.md` and follow it exactly.

Input: `games/<game-slug>/concept.json` + `vocab/roles/*.json`
Output: `games/<game-slug>/team_config.json`

Show the user the team composition (active / merged / skipped) and the phase plan before writing.
Ask: "Does this team and phase plan look right?" Do not proceed until confirmed.

## Step 3 — Scaffolder

Run the Scaffolder:

```
node tools/scaffold.js games/<game-slug>/team_config.json
```

This generates:
- `games/<game-slug>/GAME_PLAN.md`
- `games/<game-slug>/agents/<role>.md` for each active role
- `games/<game-slug>/src/index.html` skeleton (if dev active)
- `games/<game-slug>/.claude/commands/run-art.md` (if art active)
- `games/<game-slug>/sprites-manifest.json` (if art active)

## Step 4 — Confirm

Show the user:
1. The file tree of what was generated (`ls -R games/<game-slug>/`)
2. The wave execution order derived from active roles and their dependencies:
   - Wave N: [role ids] — what each wave delivers

Ask: "Ready to start Wave 1?" If yes, the user kicks off the relevant agents.
