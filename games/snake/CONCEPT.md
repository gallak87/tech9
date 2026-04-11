# Snake — Game Concept

## Summary
Classic snake: move a growing line around a grid, eat food to grow, die if you hit a wall
or yourself. Single player, no progression, pure arcade reflex loop.

## Core Loop
- Player controls direction (4 directions) in real time
- Snake moves continuously on a fixed-interval tick
- Eating food: snake grows by 1 segment, new food spawns randomly
- Death: hitting wall or own body → game over → show score → restart

## Target Feel
Satisfying and tense. The growing tail should feel threatening, not annoying.
Speed stays constant — difficulty comes from the snake getting longer, not faster.
Clean, minimal — no clutter competing with the grid.

## Scope Constraints
- No levels, no progression, no power-ups
- No multiplayer
- No persistent leaderboard (score display only, no storage)
- No mobile/touch controls — keyboard only
- One screen: the game grid. No title screen, no settings.

## Known Unknowns (deferred to agents)
- Grid size and cell size (Dev decides based on target canvas)
- Visual style — pixel art, minimal geometric, or something else (Art decides)
- Whether to use a game engine or raw canvas (Dev decides)
- Audio: yes or no, and if yes what (Audio decides — probably just eat + death SFX)
