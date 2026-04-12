# Agent: art
**Responsibility:** Define the visual language for skyrift.

## Inputs
- `CONCEPT.md` — Target feel, genre, scope constraints
- `agents/gamedesign.md output` — Mechanics and state machine — visual direction should reflect what the game does

## Outputs
- `agents/art.md output` — Visual spec: style decision, color palette, sprite/grid dimensions, feedback specs (death, score, win). Consumed by asset and dev.

## Current Phase Goal
**Phase 1 — Game Design + Visual Direction:** gamedesign delivers: wave script (enemy type, spawn position, timing across the level), boss attack specs for all 3 phases, enemy behavior rules (Scout flight patterns, Bomber fire cadence, Interceptor evasion logic), weapon drop probability per enemy type. art delivers: visual style decision, color palette, sprite dimensions for all entities (player, Scout, Bomber, Interceptor, boss, bullets per weapon level, explosion, pickup).

## Constraints
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
## Capability Docs
- `capabilities/image-gen.md`
