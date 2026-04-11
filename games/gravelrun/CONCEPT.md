# GRAVELRUN — Concept

## Game Summary
A single-level side-scrolling platformer where an armored runner blazes through an abandoned
industrial facility, shooting and stomping robot enemies and racing to the exit. Fast, punchy, no mercy.

## Core Loop
- Player runs right through a hand-crafted level: Arrow keys to move, Z/Space to jump, X/Ctrl to shoot
- Shoot enemies with bullets (+50 pts), stomp them from above (+100 pts, player bounces up)
- Stomping is worth more — skilled players will prefer it
- Touch an enemy from the side or below (without stomping) → instant death, return to start menu
- Fall into a pit → instant death
- Reach the exit door → win screen with final score

Score is live in the HUD corner. That's the whole game.

## Target Feel
Speed and weight simultaneously. The player should feel *planted* — not floaty — but still
fast. Stomping an enemy should feel satisfying: a clear visual squash and a score pop.
Death should feel immediate and fair ("I walked into that, not the game's fault").
Reaching the exit should feel earned, not handed to you.

The vibe is late-90s action platformer. Duke Nukem / Contra energy. Gritty, industrial,
no cutscenes, no story, no fluff.

## Scope Constraints
- **Shooting is in scope** — X or Ctrl fires a bullet, no ammo limit, ~0.3s cooldown between shots
- **No ammo management** — infinite bullets, cooldown only
- **No checkpoints** — die anywhere, back to start menu, no progress saved
- **No lives/continues** — single run per session
- **No audio** — out of scope for v1 (no sound engine, no asset pipeline)
- **No touch/mobile controls** — keyboard only (Arrow + Z or Space to jump)
- **No persistent state** — no localStorage, no high score board
- **No settings, config, or player customization whatsoever**
- **Single level only** — hand-crafted, no procedural generation
- **No power-ups, collectibles, or secondary mechanics**
- **No double jump, wall jump, or special moves**

## Known Unknowns
- Exact level geometry and enemy placement → deferred to level agent
- Sprite designs for player, enemies (2 types), tiles, background → deferred to art agent
- Jump feel tuning (gravity constant, coyote time window, jump buffer) → deferred to dev agent
- Win screen behavior (auto-return vs wait for input) → deferred to dev agent
- Enemy count and patrol/jump timing → deferred to dev agent
