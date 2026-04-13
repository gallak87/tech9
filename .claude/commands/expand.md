---
name: expand
description: "Expand the current phase — find thin spots and propose concrete improvements for the user to pick from. Usage: /expand [game-name] [focus area]"
---

You are reviewing what was built this phase and finding where depth was left on the table.
Your job is to propose expansions — not execute them. The user picks, then you build.

## Determine the game

If `$ARGUMENTS` is non-empty, treat the first token as the game name.
Second token (optional) is a focus area hint (e.g. "bosses", "audio", "world").

If no argument: look for a single game in `games/*/` — if multiple exist, ask.

## Step 1 — Read the current state

Read:
- `games/<game>/GAME_PLAN.md` — which phase just completed, what was scoped
- `games/<game>/agents/*-output.md` — what each agent actually produced
- `games/<game>/CONCEPT.md` — original intent and scope constraints

Identify the phase that most recently completed.

## Step 2 — Find thin spots

Look for places where the phase delivered the minimum viable version of something
that could be richer. Examples:

- One boss → could be 3 with distinct move sets and sprites
- One biome → could be 3 with different tile sets and encounter tables
- Flat audio → could have per-enemy stingers, ambient beds, combo cues
- Single hero ability → could branch into a skill tree
- One building tier → could have visible upgrade progression across 4 tiers

Do not flag things that are intentionally out of scope per CONCEPT.md.
Do not propose rewrites — only additive expansions.

## Step 3 — Present proposals

Show 3–5 concrete expansion options ranked by impact. For each:

```
[1] Multiple boss types (currently: 1 boss)
    Add 3 bosses with distinct sprites, move sets, and drop tables.
    Art cost: 3 sprites. Dev cost: boss state machine variant per type.
    → agree to expand, tweak, or skip?
```

Wait for the user to respond to each before moving to the next, or let them
approve a set all at once.

## Step 4 — Execute approved expansions

For each approved expansion:
- Update the relevant agent's output or manifest directly
- If new sprites are needed, add them to `sprites-manifest.json` and note that `/run-art` should follow
- If new game logic is needed, implement it
- If scope constraints in CONCEPT.md need updating to reflect the expansion, update them

Commit when done. Tell the user what changed and what (if anything) still needs `/run-art`.
