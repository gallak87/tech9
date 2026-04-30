# Agent: qa
**Responsibility:** Test Void Sentinel: Breach and produce a clear pass/fail verdict before deployment.

## Inputs
- `CONCEPT.md` — Core loop and scope — defines what 'working correctly' means
- `src/index.html` — The game running on localhost — QA plays it
- `agents/devops.md output` — How to run the local server, what URL to hit

## Outputs
- `agents/qa.md output (QA report)` — Bug list with reproduction steps, severity, and status. Pass/fail verdict for current phase. Consumed by dev for fixes and devops for deploy gate.

## Current Phase Goal
_See GAME_PLAN.md for phase schedule._

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