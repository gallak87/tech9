# Agent: historian
**Responsibility:** Capture learnings from Orb Vacuum and write them into the cross-game lesson log.

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
- IN: WASD movement in the horizontal plane, camera orbits with mouse drag or Q/E keys.
- IN: Size-based absorption — player absorbs any orb smaller than themselves on contact.
- IN: Size penalty on contact with a larger orb — player shrinks, never dies.
- IN: Running score counter (orbs absorbed) displayed on-screen at all times.
- IN: Procedural orb spawning at arena boundary, increasing in rate and difficulty over time.
- IN: Bloom-style glowing appearance for all orbs — neon colors on dark background.
- IN: Brief visual feedback on absorb (scale pulse) and on hit (screen flash).
- OUT: No audio — sound effects and music are out of scope for v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No mobile or touch controls in v1.
- OUT: No powerups, special orbs, or abilities beyond grow/shrink.
- OUT: No vertical movement — the player moves only in the horizontal plane.