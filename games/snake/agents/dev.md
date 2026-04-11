# Agent: dev

**Responsibility:** All game code. You pick the stack.

## Inputs
- `CONCEPT.md` — core loop, scope constraints
- `art` output — grid dimensions, palette, feedback specs
- `audio` output (Phase 3) — SFX integration notes

## Outputs
- Working game in a browser
- Source code in `games/snake/src/`

## Current Phase Goal
Phase 2: implement the full core loop.
- Grid rendering
- Snake movement on fixed tick
- Arrow key / WASD input
- Eat logic (grow + respawn food)
- Collision detection (wall + self)
- Score counter
- Game over state + restart

## Constraints
- Keyboard only, no touch
- No persistent storage
- No title screen — game starts immediately
- Single screen
- Wait for `art` output before finalising grid dimensions
