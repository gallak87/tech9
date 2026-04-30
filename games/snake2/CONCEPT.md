# Snake2 — Concept

## Game Summary

Snake2 is a high-octane arcade game where the player steers a glowing neon snake across a dark grid, eating pickups to grow longer and accumulate score. Three tiers of pickup exist — common (green), rare (gold), and legendary (red) — each growing the snake by a different amount and triggering an escalating screen-flash effect. The game ends when the snake collides with itself or a wall. There is no win condition — the goal is a high score.

## Core Loop

The player uses arrow keys (or WASD) to steer the snake one grid cell at a time on a fixed interval. Each tick the snake advances one cell in the current direction. Hitting a pickup: common pickups add 1 segment and award 10 pts, rare pickups add 3 segments and award 30 pts, legendary pickups add 6 segments and award 100 pts. On pickup, the grid flashes — a brief CSS animation whose intensity scales with tier. Pickups spawn one at a time at a random empty cell; after each pickup the next one is promoted one tier 20% of the time (so rares and legendaries appear occasionally but not constantly). Speed increases every 50 points. Colliding with a wall or the snake's own body ends the run. The current score is displayed live and resets on death — no persistent leaderboard.

## Target Feel

The vibe is neon-arcade — think Tron mixed with classic DOS snake. Moment to moment it should feel twitchy and satisfying: every pickup feels like a tiny victory, every rare pop feels electric, legendary feels catastrophic in a good way. Death should sting but bounce the player straight back into it. The scoreboard adds just enough ego to keep replaying.

## Scope Constraints

- IN: Three pickup tiers — common, rare, legendary — with distinct CSS colors and flash effects.
- IN: Live score display — shown on screen, resets on death, no persistence.
- IN: Speed escalation — snake tick rate shortens by ~5ms every 50 points, capping at a max difficulty floor.
- IN: Screen/grid CSS flash animation on pickup — intensity (duration + brightness) scales with tier.
- OUT: No leaderboard, no localStorage, no initials entry.
- OUT: No audio — no sound effects or music.
- OUT: No power-ups beyond the three pickup tiers — no shields, slow-mo, bombs, etc.
- OUT: No multiplayer — single player only.
- OUT: No sprite assets — all visuals are pure CSS (backgrounds, borders, box-shadow, keyframe animations).
- OUT: No mobile touch controls — keyboard only for v1.

## Known Unknowns

| Decision | Deferred To |
|----------|-------------|
| Exact CSS glow/flash animation parameters for each tier (keyframe timing, shadow spread) | dev |
| Grid dimensions and cell size for optimal playfield density | dev |
