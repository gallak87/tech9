# Agent: historian
**Responsibility:** Capture learnings from Void Sentinel: Breach and write them into the cross-game lesson log.

## Inputs
- `GAME_PLAN.md` — Planned phases vs what actually shipped
- `CONCEPT.md` — Original intent — compare against what was built
- `agents/*-output.md` — What each agent actually produced and where it deviated from plan
- `git log` — What was actually committed vs planned — drift is a signal
- `ROADMAP.md patch-out entries added during the build` — Learnings already captured mid-build

## Outputs
- `games/<game>/LESSONS.md` — Per-game observations: what worked, what didn't, numbers that felt right. Tagged by domain (perf, art, scaffold, audio, ux).
- `meta/LESSONS.md` — Aggregated cross-game lessons. Director reads this on every run, filtered by concept tags. Lessons graduate out of this file into framework defaults when proven across 2+ games.

## Current Phase Goal
Post-mortem pass. Read all agent outputs and git history. Write LESSONS.md for this game. Flag any lessons ready to graduate into the framework.

## Constraints
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