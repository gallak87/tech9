# SNAKE2 — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns the mechanics spec: pickup tier definitions (growth amounts, point values, spawn promotion probability), speed escalation formula, state machine (idle → playing → dead → restart), and input handling rules. |
| `art` | Owns the visual language: neon palette, per-tier CSS colors and box-shadow glow values, flash keyframe specs (duration + brightness) for each tier, grid/cell sizing, snake head vs body visual distinction. |
| `dev` | Builds all game code: CSS grid rendering, snake movement, collision detection, 3-tier pickup system, CSS flash animation triggering, live score HUD, death/restart flow, speed escalation loop. |

**Skipped / Merged:**
- `asset` → merged into `art` — No sprite assets exist. All visuals are pure CSS. Art's spec is the only deliverable — asset production is identical to writing the spec, so roles collapse.
- `level` → skipped — Skipped. Snake has no level structure — single infinite grid with random pickup placement.
- `audio` → skipped — Skipped. Explicit scope constraint: audio OUT of scope.
- `qa` → skipped — Skipped. User is playing locally — no QA pass needed for this build.
- `devops` → skipped — Skipped. No deploy — user will open index.html directly or serve locally themselves.
- `release` → skipped — Skipped. No deploy.
- `postlaunch` → skipped — Skipped. Nothing shipped.
- `historian` → skipped — Skipped. Speedrun — no post-mortem.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`

Blank 20×20 CSS grid in src/index.html. Game loop wired (setInterval tick). No game logic — just the shell that runs in a browser.

### Phase 1 — Design + Visual Direction *(parallel)*
Agents: `gamedesign`, `art`

gamedesign writes the full mechanics spec (pickup tier rules, spawn promotion probability, speed escalation formula, state machine). art writes the CSS visual spec (neon palette, per-tier colors and glow values, flash animation keyframe parameters, grid cell sizing).

### Phase 2 — Full Implementation
Agents: `dev`

dev implements: snake movement and self-collision, wall-collision death, 3-tier pickup spawning with promotion logic, CSS flash animation per tier, live score counter, death overlay, restart flow, speed escalation. All from Phase 1 specs.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Exact CSS glow/flash animation parameters for each tier (keyframe timing, shadow spread) | art |
| Grid dimensions and cell size for optimal playfield density | dev |
