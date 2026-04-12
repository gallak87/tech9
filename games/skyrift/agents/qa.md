# Agent: qa
**Responsibility:** Test skyrift and produce a clear pass/fail verdict before deployment.

## Inputs
- `CONCEPT.md` — Core loop and scope — defines what 'working correctly' means
- `src/index.html` — The game running on localhost — QA plays it
- `agents/devops.md output` — How to run the local server, what URL to hit

## Outputs
- `agents/qa.md output (QA report)` — Bug list with reproduction steps, severity, and status. Pass/fail verdict for current phase. Consumed by dev for fixes and devops for deploy gate.

## Current Phase Goal
_See GAME_PLAN.md for phase schedule._

## Hard Constraints
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