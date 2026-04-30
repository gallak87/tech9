# Agent: devops
**Responsibility:** Own the delivery pipeline for Void Sentinel: Breach — localhost first, then build, then deploy.

## Inputs
- `CONCEPT.md` — Scope and rendering_tier — informs deploy target (GitHub Pages, itch.io, Netlify, etc.)
- `package.json + src/index.html` — Must confirm npm install + npx vite serve correctly on localhost

## Outputs
- `agents/devops.md output` — How to run the local dev server (command, URL, any setup steps). Build pipeline config. Deploy target and URL once live.

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Three.js scene with behind-jet camera at low angle. Scrolling world: terrain plane + 2 cloud layers at different speeds + atmosphere haze, all procedural geometry. Player ship as BoxGeometry placeholder. WASD/arrows move player within screen bounds. Auto-fire shoots BoxGeometry bullet placeholders forward. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER (transitions work, states are stubs). DevOps confirms npm install + npx vite on localhost:5173.

## Hard Constraints
Localhost always comes first. The sequence is always: local dev server → QA signs off → build → deploy. Never deploy before QA has passed on localhost.

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