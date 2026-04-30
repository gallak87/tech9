# Agent: qa
**Responsibility:** Test Orb Vacuum and produce a clear pass/fail verdict before deployment.

## Inputs
- `CONCEPT.md` — Core loop and scope — defines what 'working correctly' means
- `src/index.html` — The game running on localhost — QA plays it
- `agents/devops.md output` — How to run the local server, what URL to hit

## Outputs
- `agents/qa.md output (QA report)` — Bug list with reproduction steps, severity, and status. Pass/fail verdict for current phase. Consumed by dev for fixes and devops for deploy gate.

## Current Phase Goal
**Phase 3 — QA & Deploy:** qa runs a full playtest against every scope constraint and files any bugs. devops runs the Vite build and deploys to the chosen target (GitHub Pages or itch.io).

## Hard Constraints
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