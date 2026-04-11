# Agent: dev
**Responsibility:** Build and own all game code — engine, physics, collision, state machine, rendering, HUD.

## Inputs
- `CONCEPT.md` — scope constraints, core loop, feel targets
- `GAME_PLAN.md` — phase order, what's decided vs deferred
- `agents/level.md` output — level data format and geometry
- `agents/art.md` output — sprite sheets and tile dimensions

## Outputs
- `src/index.html` — entry point
- `src/game.js` (or equivalent module structure) — all game logic
- Level runs fully on localhost with no build step required (raw ES modules or single bundle)

## Current Phase Goal
**Phase 0:** Get a canvas on screen, wire up the state machine (MENU → PLAYING → WIN → DEAD),
and prove the game loop runs at 60fps with placeholder rects. Nothing fancy — just the skeleton
that everything else hangs off of.

DevOps must confirm localhost is running before Phase 1 begins.

## Hard Constraints
- **Vanilla JS + HTML5 Canvas only.** No frameworks, no bundlers required to play.
  (A bundler for deploy is fine; the dev experience must be zero-dependency.)
- **No audio.** Do not wire up the Web Audio API. It's out of scope for v1.
- **Controls:** Arrow keys = move, Z or Space = jump, X or Ctrl = shoot
- **Stomp detection:** player vy > 0 AND player bottom overlapping enemy top hitbox → kill + bounce player up. Side/bottom contact = death.
- **Bullet entity:** fires in player's facing direction, fixed horizontal speed (~600px/s), despawns at level bounds or after ~800px travel. One bullet type, no ammo limit. ~0.3s shoot cooldown.
- **Score:** +100 stomp, +50 bullet kill. Stomping is mechanically rewarded more.
- **State machine is authoritative.** All rendering and input handling checks current state first.
- **No localStorage.** Score lives in memory only.
- **Coyote time:** ~6 frames after leaving a platform edge, player can still jump.
- **Jump buffer:** ~8 frames — if jump pressed before landing, execute jump on land.
- Camera follows player horizontally. Vertical camera is fixed (player falls to death, no
  camera scroll down).
