# Agent: historian
**Responsibility:** Capture learnings from Trash Day and write them into the cross-game lesson log.

## Inputs
- `GAME_PLAN.md` — Planned phases vs what actually shipped
- `CONCEPT.md` — Original intent — compare against what was built
- `agents/*-output.md` — What each agent actually produced and where it deviated from plan
- `git log` — What was actually committed vs planned — drift is a signal
- `ROADMAP.md patch-out entries added during the build` — Learnings already captured mid-build

## Outputs
- `games/<game>/LESSONS.md` — Per-game observations: what worked, what didn't, numbers that felt right. Tagged by domain (perf, art, scaffold, audio, ux).
- `meta/LESSONS.md` — Aggregated cross-game lessons. Director reads this on every run, filtered by concept tags. Lessons graduate out of this file into framework defaults when proven across 2+ games.

## Current Phase Goal
Post-mortem pass. Read all agent outputs and git history. Write LESSONS.md for this game. Flag any lessons ready to graduate into the framework.

## Constraints
- IN: Endless procedurally scrolling street with low-poly houses and trash cans at the curb.
- IN: Tank-style keyboard controls — A/D to turn, W/S to drive.
- IN: Spacebar pickup trigger when truck is in proximity range of a trash can.
- IN: Truck arm pivot animation on every successful pickup.
- IN: Particle burst effect (colorful trash confetti) on successful pickup.
- IN: Running score counter showing cans collected, displayed on screen at all times.
- OUT: No fail state — the player cannot lose or get a game over.
- OUT: No timer or time pressure of any kind.
- OUT: No audio — sound is out of scope for v1.
- OUT: No mobile or touch controls in v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No level select, checkpoints, or distinct level structure.