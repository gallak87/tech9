# Agent: gamedesign
**Responsibility:** Own the mechanics, core loop, and balance rules for Void Sentinel: Breach.

## Inputs
- `CONCEPT.md` — Core loop, target feel, scope constraints, known unknowns

## Outputs
- `agents/gamedesign.md output` — Game design spec: mechanics definitions, state machine, scoring rules, entity behaviors, balance parameters. Consumed by dev and level.

## Current Phase Goal
**Phase 1 — Design + Art Spec:** gamedesign delivers: complete wave script (all formations, timing, density curve), all 3 boss types x 3 attack phases each (bullet patterns, movement paths, charge-cone timing), all 4 enemy behavior rules, 7 weapon tier bullet patterns, drop probabilities. art delivers: visual style decision, full color palette, exact sprite dimensions for every entity (player, 4 enemies, 3 bosses, 7 bullet variants, explosion, 2 pickups) — dimensions must be billboard-ready for THREE.Sprite.

## Hard Constraints
- IN: Third-person behind-the-fighter camera — low angle, locked behind player, world streams forward. Camera shake on hit and boss phase transitions.
- IN: Arrow keys and WASD move the fighter. Spacebar or Z cycles weapon tier. Auto-fire always on.
- IN: 7-tier weapon system — T1: single shot, T2: dual shot, T3: 3-way spread, T4: piercing shot, T5: 4-bullet barrage fan, T6: pierce + 3 homing seekers, T7: full spread + piercing + seekers (godtier).
- IN: 4 enemy types — Scout (1-hit, fast, 2-bullet burst), Bomber (3-hit, slow, spread bursts, drops bomb pickup), Drone (2-hit, sprays 3 bullets backward on death), Elite (every 3rd wave, gold pulse, 2x HP and score, guaranteed pickup drop).
- IN: 3 distinct boss types rotating per cycle — Sentinel (homing focus), Interceptor (fast sweeping), Colossus (screen-filling spread). Each has 3 attack phases at 66%/33% HP with charge-cone telegraph.
- IN: Bomb pickup from Bombers — clears all on-screen enemies and bullets instantly.
- IN: Phase 0 uses placeholder polygon geometry (BoxGeometry, ConeGeometry) for all entities. Art integration phase replaces with THREE.Sprite billboards using Ollama-generated PNG textures.
- IN: Scrolling 3D world — distant terrain plane, mid-layer cloud banks at multiple scroll speeds, near atmosphere haze. All procedural Three.js geometry.
- IN: UnrealBloomPass post-processing — bloom on bullet trails, engine glows, explosions, pickups.
- IN: Web Audio API synthesized SFX — shoot (7 variants per weapon tier), enemy hit, explosion, weapon tier-up fanfare, bomb blast, boss phase transition sting, boss death. No audio files.
- IN: HUD — score, weapon tier (1-7), lives, bomb count always visible. Boss health bar during boss phase only.
- IN: Start screen with controls. WIN and GAME_OVER screens with final score.
- OUT: No touchscreen or gamepad — keyboard only for v1.
- OUT: No persistent state — no localStorage, no high score board.
- OUT: No level select — single run from wave 1 to boss.
- OUT: No multiplayer.

## Balance Notes
- **Spawn sizes: always specify relative to player start radius, not absolute units.** Absolute sizes are only safe when the player's size is fixed for the whole game. If the player can grow or shrink, any absolute spawn size becomes meaningless mid-game — an orb that starts as a threat becomes food once the player doubles in size. Spec spawn sizes as multiples of player start radius (e.g. "food: 20–80% of start radius, threats: 140–300% of start radius") so the distribution stays coherent across the full size range.
- **Verify food/threat ratio at game start.** At the moment the game begins, with the player at start radius, check that the spawn distribution actually produces the intended ratio of safe-to-eat vs dangerous orbs. A distribution that looks balanced on paper can produce an all-threat first 30 seconds if the absolute sizing doesn't line up with start radius.