# Agent: gamedesign
**Responsibility:** Own the mechanics, core loop, and balance rules for Orb Vacuum.

## Inputs
- `CONCEPT.md` — Core loop, target feel, scope constraints, known unknowns

## Outputs
- `agents/gamedesign.md output` — Game design spec: mechanics definitions, state machine, scoring rules, entity behaviors, balance parameters. Consumed by dev and level.

## Current Phase Goal
**Phase 1 — Design & Art Spec:** gamedesign writes the mechanics doc: starting radius, size comparison threshold, growth/shrink deltas, spawn rate curve, difficulty escalation schedule. art writes the visual spec: neon color palette, bloom recipe for dev, player vs NPC orb visual distinction, HUD layout. These two agents have no dependencies on each other.

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