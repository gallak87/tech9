# TRASH DAY — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns mechanics spec: proximity pickup radius, scoring increment, road generation algorithm, difficulty curve (bend frequency, can density over time), entity behaviors (truck physics feel, arm animation timing). |
| `art` | Merged with asset. Defines visual language and produces Three.js geometry/material code for all entities — truck, houses, trash cans, road, particle confetti. No sprite files; all art is code-based geometry. Owns color palette and low-poly toy aesthetic. |
| `dev` | Builds all game code: Three.js scene setup, truck geometry and tank controls, procedural road scrolling, house and can spawning, proximity detection, arm pivot animation, particle burst system, score HUD. Owns index.html and game.js. |
| `qa` | Gates each phase. Must confirm: Three.js renders on localhost, truck drives correctly, road scrolls, cans spawn and are collectable, pickup animation fires, score increments, no crash states. |
| `devops` | Merged with release and postlaunch. Owns localhost dev server (Phase 0), static deploy target, and post-launch monitoring. Simple static site — no build step needed beyond serving index.html. |
| `historian` | Runs after final phase. Captures Three.js-specific lessons (geometry composition patterns, procedural scrolling approach, particle system approach) into LESSONS.md. |

**Skipped / Merged:**
- `asset` → merged into `art` — No sprite or image assets in a Three.js game. Art agent owns both direction and geometry code production.
- `level` → skipped — Skipped. Scope constraint explicitly states no level structure, no checkpoints, no level select. Road generation is procedural — owned by gamedesign and dev.
- `audio` → skipped — Skipped. Scope constraint explicitly states audio is out of scope for v1.
- `release` → merged into `devops` — No store page, no marketing copy, no itch.io listing. Release is just a deploy — absorbed into devops.
- `postlaunch` → merged into `devops` — Simple personal project for a kid — no player support or incident response needed. Devops monitors for broken deploy.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`, `devops`

Three.js scene initialized with a perspective camera, directional light, and a flat road plane. Truck represented as a placeholder box. DevOps confirms the game loads and renders on localhost with no errors.
QA gate: localhost:3000 loads, Three.js renders without console errors, placeholder truck box visible on road plane.

### Phase 1 — Design + Visual Language *(parallel)*
Agents: `gamedesign`, `art`

Gamedesign produces the full mechanics spec (proximity radius, scoring, road gen algorithm, difficulty ramp). Art defines the color palette and writes Three.js geometry/material code for all entities: truck (cab + hopper + arm), houses, trash cans, road segments, particle confetti. Both agents run in parallel with no dependencies on each other.
QA gate: Mechanics spec reviewed and approved. Art geometry code reviewed — all entities look correct in isolation before dev integrates them.

### Phase 2 — World + Driving
Agents: `dev`

Dev integrates art geometry, implements tank-style controls (WASD), procedural road segment scrolling, house and trash can spawning at the curb, and camera following the truck. Road bends increase in frequency over time per the gamedesign spec.
QA gate: Truck drives with correct tank controls, road scrolls continuously, houses and cans appear at the curb, camera follows truck correctly.

### Phase 3 — Pickup Mechanic + Score HUD
Agents: `dev`

Dev implements proximity detection (per gamedesign spec radius), Spacebar pickup trigger, truck arm pivot animation, colorful particle burst on pickup, and the score counter HUD. Full core loop is now playable.
QA gate: Full loop playable end-to-end: drive to can, press Space, arm animates, particles fire, score increments. All scope constraints verified. No crash states.

### Phase 4 — Ship + Post-Mortem *(parallel)*
Agents: `devops`, `historian`

DevOps deploys the static game to its final host. Historian runs a post-mortem pass: reads all agent outputs and git history, writes LESSONS.md for Trash Day, flags any Three.js lessons ready to graduate into the framework.
QA gate: Game accessible at deployed URL. LESSONS.md written and cross-game meta/LESSONS.md updated.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Exact procedural generation algorithm for road bends and house/can placement spacing | gamedesign |
| Truck arm animation implementation — simple object pivot vs. articulated segments | dev |
| Color palette and geometry detail level for low-poly art style | art |
| Proximity pickup radius in world units | gamedesign |
| Difficulty ramp curve — how quickly bend frequency and can density increase | gamedesign |
