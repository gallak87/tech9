---
name: generate
description: "Run the tech9 pipeline — Concept Generator → Director → Scaffolder — for a given game idea. Usage: /generate \"game idea\""
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

## Step 4 — Confirm and hand off

Show the user:
1. The file tree of what was generated (`ls -R games/<game-slug>/`)
2. The phase execution order — each phase, which agents are in it, what it delivers

Then say exactly:

> Team is assembled. Say **let's go** to kick off Phase 1.

## Step 5 — Run phases via subagents

When the user says "let's go" (or equivalent):

**For each phase in order:**

1. Spawn each agent in the phase as a subagent using the Agent tool
   - Agent prompt = contents of `games/<game-slug>/agents/<role>.md`
   - Agent context = `games/<game-slug>/CONCEPT.md` + `games/<game-slug>/GAME_PLAN.md`
   - Parallel phases → spawn agents concurrently in a single message
   - Sequential phases → wait for prior agent to complete before spawning next

2. Each subagent runs autonomously and writes its outputs to `games/<game-slug>/`

3. Surface to the user only when:
   - A subagent returns blocked (ambiguous decision, missing peer output, tool failure)
   - A phase completes and the build needs human review before proceeding

4. When blocked: show the user exactly what the agent needs, get the call, resume the agent

5. When a phase completes:
   - Summarise what was built
   - Ask the user to play the build on localhost
   - Wait for confirmation before spawning the next phase

**Block vs surface heuristic:**
- Missing file or tool error → try to resolve automatically first, only surface if unresolvable
- Ambiguous design decision → always surface, never guess
- One agent waiting on another agent's output → surface with a clear "X is blocked on Y"

**Never** proceed to the next phase without explicit user confirmation. The user may want
to run `/expand` or `/run-art` between phases before continuing.
