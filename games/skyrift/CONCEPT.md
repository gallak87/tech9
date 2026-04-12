# SKYRIFT — Concept

## Game Summary

A top-down vertical scrolling shooter where the player pilots a fighter jet through escalating waves of enemy aircraft. Armed with an upgradeable 5-level weapon system, the player fights through Scout, Bomber, and Interceptor enemies before facing a multi-phase boss with a dedicated health bar. Collect weapon power-ups, rack up points, survive three hits — defeat the boss to win, lose all three lives and it's game over.

## Core Loop

Arrow keys move the jet freely within the screen bounds. Z or Space toggles auto-fire — bullets stream at a fixed rate while active, no button-hold required. Destroying enemies has a chance to drop a weapon power-up (glowing pickup); collecting it advances weapon level by 1.

**Weapon levels 1–5:**
- Level 1: single shot
- Level 2: twin shot
- Level 3: 3-way spread
- Level 4: spread + homing missiles
- Level 5: full spread + piercing shots

Getting hit drops weapon level by 1 and costs one life (3 lives total, weapon level floors at 1). Score accumulates from kills: Scouts = 100pts, Bombers = 250pts, Interceptors = 500pts.

After all waves clear, the boss enters — large sprite, health bar at the top of the screen, 3 attack phases triggered at 66% and 33% HP. Defeat the boss → win screen with final score. Reach 0 lives → game over with score.

## Target Feel

Fast, readable, satisfying. The screen should always be busy but never chaotic — the player has enough reaction time to dodge if they're paying attention. Weapon progression must feel like a meaningful reward: Level 5 is visually and audibly distinct from Level 1. Boss fights feel climactic — enemy waves clear, the boss fills a significant portion of the screen, audio shifts. Death should feel fair. The vibe is modern bullet-hell lite — 1942 meets Ikaruga but accessible, not punishing.

## Scope Constraints

- Single level with one boss in v1 — no level select, no stage progression beyond the one boss
- Weapon system has exactly 5 levels — each level is visually and audibly distinct
- Exactly 3 enemy types: Scout (easy, fast, 1 hit), Bomber (medium, slow, drops projectiles, 3 hits), Interceptor (hard, aggressive, evasive, 5 hits)
- Boss has exactly 3 attack phases — phase transitions triggered at 66% and 33% HP thresholds
- Audio is in scope — Web Audio API synthesized SFX only, no audio files to load
- Player has exactly 3 lives — each hit costs 1 life and drops weapon level by 1 (weapon level floors at 1)
- Auto-fire is in scope — Z or Space toggles auto-fire on/off
- No touchscreen controls — keyboard only (Arrow keys to move, Z or Space for auto-fire toggle)
- No persistent state — no localStorage, no high score board, no save between sessions
- Weapon power-up drops are the only pickups — no shields, no bombs, no extra lives
- HUD always shows: score, weapon level (1–5), lives, boss health bar (boss phase only)
- Controls are displayed on the start screen (Arrows = move, Z/Space = auto-fire toggle) — not shown during gameplay

## Known Unknowns

| Decision | Deferred To |
|----------|-------------|
| Enemy wave patterns and spawn timing across the level | gamedesign |
| Boss attack patterns per phase (projectile types, movement, timing) | gamedesign |
| Visual style — pixel art vs vector glow aesthetic, color palette | art |
| Sprite dimensions and bullet visual design | art |
| SFX synthesis approach per event (shoot, hit, explosion, level-up, boss death) | audio |
| Bullet speeds, enemy movement speeds, collision hitbox sizes, scroll rate | dev |
| Weapon power-up drop probability per enemy type | dev |
