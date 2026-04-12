# Agent: devops
**Responsibility:** Own the delivery pipeline for skyrift — localhost first, then build, then deploy.

## Inputs
- `CONCEPT.md` — Scope — informs deploy target (GitHub Pages, itch.io, Netlify, etc.)
- `src/index.html` — Entry point — must confirm it serves correctly on localhost

## Outputs
- `agents/devops.md output` — How to run the local dev server (command, URL, any setup steps). Build pipeline config. Deploy target and URL once live.

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Canvas on screen. Game loop running at 60fps. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER. Player jet moves with arrow keys. Vertical scroll background (static color or simple gradient). Nothing fancy — just the skeleton everything hangs off.

## Hard Constraints
Localhost always comes first. The sequence is always: local dev server → QA signs off → build → deploy. Never deploy before QA has passed on localhost.

- Single level with one boss in v1 — no level select, no stage progression beyond the one boss
- Weapon system has exactly 5 levels — each level is visually and audibly distinct
- Exactly 3 enemy types: Scout (easy, fast, 1 hit), Bomber (medium, slow, drops projectiles, 3 hits), Interceptor (hard, aggressive, evasive, 5 hits)
- Boss has exactly 3 attack phases — phase transitions triggered at 66% and 33% HP thresholds
- Audio is in scope — Web Audio API synthesized SFX only, no audio files to load
- Player has exactly 3 lives — each hit costs 1 life and drops weapon level by 1 (weapon level floors at 1)
- Auto-fire is in scope — Z or Space toggles auto-fire on/off, no manual fire rate management
- No touchscreen controls — keyboard only (Arrow keys to move, Z or Space for auto-fire toggle)
- No persistent state — no localStorage, no high score board, no save between sessions
- Weapon power-up drops are the only pickups — no shields, no bombs, no extra lives
- HUD always shows: score, weapon level (1–5), lives, boss health bar (boss phase only)
- Controls are displayed on the start screen (Arrows = move, Z/Space = auto-fire toggle) — not shown during gameplay