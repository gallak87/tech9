---
name: generate
description: Simulate the full tech9 pipeline — Concept Generator → Director → scaffold — for a given game idea. Creates a game folder under games/ with CONCEPT.md, GAME_PLAN.md, and agent stubs.
---

You are simulating the tech9 pipeline manually. The user has provided a game idea as the argument to this command.

Work through these steps in order:

## Step 1 — Concept Generator

Produce a `CONCEPT.md` for this game. Be specific and opinionated — make real decisions, don't hedge. Cover:

- **Game summary** (1-2 sentences)
- **Core loop** (what does the player do, moment to moment?)
- **Target feel** (what emotion/sensation are we going for?)
- **Scope constraints** (what's explicitly out of scope to keep this shippable?)
- **Known unknowns** (what decisions are deferred to agents?)

## Step 2 — Director

Read the concept you just wrote and assemble the right team. For each role in the vocabulary, decide: needed or not? Merge any roles that would obviously overlap for this game's complexity.

Vocabulary to select from: `gamedesign`, `art`, `asset`, `level`, `audio`, `dev`, `qa`, `devops`, `release`, `postlaunch`

Produce a `GAME_PLAN.md` with:
- **Team** — which agents are active and why (or why a role was merged/skipped)
- **Phase plan** — tailored to this specific game (not generic)
- **Key decisions deferred to agents** — what the Director explicitly did not decide

## Step 3 — Scaffold

Create the following structure under `games/[game-name]/`:

```
games/[game-name]/
├── CONCEPT.md
├── GAME_PLAN.md
└── agents/
    └── [one .md stub per active agent]
```

Each agent stub should contain:
- Role name + one-line responsibility
- Inputs (what they receive / read)
- Outputs (what they produce)
- Current phase goal
- Any hard constraints from the concept

## Step 4 — Confirm

Print a short summary of what was generated and ask if anything should be revised before committing.
