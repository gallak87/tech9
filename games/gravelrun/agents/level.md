# Agent: level
**Responsibility:** Design the single level — platform geometry, enemy placement, start and exit positions.

## Inputs
- `CONCEPT.md` — scope constraints (single level, stomp-only, no checkpoints)
- `GAME_PLAN.md` — phase 2 is when this data is consumed
- `agents/dev.md` — level data format the engine expects

## Outputs
A level data object (JS or JSON) that dev drops into the codebase. Must include:
- Array of platform rectangles: `{ x, y, w, h }`
- Player start position: `{ x, y }`
- Exit position: `{ x, y, w, h }` (a rect the player walks into to win)
- Enemy list: `[{ type: 'walker'|'jumper', x, y, platformIndex? }]`
- Level total width (how far the camera can scroll)

Also produce a simple ASCII diagram of the level layout (for review before coding starts).

## Current Phase Goal
**Phase 2:** Deliver level data so dev can render platforms and confirm camera scrolling works.
Enemy placement can come in Phase 3 if geometry is delivered first.

## Hard Constraints
- **Single level.** Design it to take roughly 90–120 seconds on first play. Not too short
  (feels cheap), not too long (the scope is "bare bones").
- **Difficulty curve must exist.** Easy intro section, harder mid-section, hardest near the exit.
  Player needs time to learn stomping before it's required.
- **Pits are valid** — gaps in the floor where the player falls to death. Use them deliberately.
- **All platforms must be reachable** with a single jump (no double-jump in this game).
  Max safe gap width and jump height must be confirmed with dev before final geometry is locked.
- **Enemy placement** must leave room to stomp — Walkers need a platform long enough to approach
  from above. Jumpers need clear vertical space above them.
- **At least 8 enemies total.** Score matters, give the player things to stomp.
- **No secrets, hidden areas, or alternate paths.** Single linear route, right to exit.
