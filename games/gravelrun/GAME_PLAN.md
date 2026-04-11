# GRAVELRUN — Game Plan

## Team

| Agent | Role | Notes |
|-------|------|-------|
| `dev` | Core engine — physics, collision, game loop, canvas rendering, state machine | Heaviest lift. Owns all code. |
| `art` | Sprite design — player, 2 enemy types, tile sheet, BG layer | Pixel art, limited palette, decided by art agent |
| `level` | Level geometry — platform layout, enemy placement, start/exit | Single level, hand-crafted as a data structure |
| `qa` | Playtest — physics feel, collision accuracy, all state transitions | Plays on localhost; files bugs; signs off before deploy |
| `devops` | Local dev server, build, deploy to GitHub Pages | Localhost first. Always. |

**Skipped / Merged:**
- `gamedesign` → absorbed into concept (done, above)
- `asset` → merged into `art` — no separate pipeline at this scope
- `audio` → skipped v1 (explicit scope constraint in concept)
- `release` → merged into `devops` — single deploy, no ceremony
- `postlaunch` → out of scope entirely

---

## Phase Plan

### Phase 0 — Engine Skeleton
Dev sets up `src/` with:
- HTML entry point + canvas
- Game loop via `requestAnimationFrame`
- State machine: `MENU → PLAYING → WIN → DEAD`
- Placeholder rendering (colored rects)

DevOps confirms it runs on localhost before any game logic is written.
Nothing proceeds until localhost is green.

### Phase 1 — Player Movement
- Player entity: position, velocity, gravity, horizontal run, jump
- Coyote time (~6 frames), jump buffer (~8 frames)
- Player renders as a placeholder rect
- Platform collision (AABB, land on top, block sides and bottom)
- Camera: follows player horizontally, fixed vertically

QA gate: does movement feel right? Is the jump arc satisfying? Sign off before enemies.

### Phase 2 — Level Geometry
- Level agent provides level data: array of platform rects, start pos, exit pos, pit boundaries
- Dev reads level data and renders platforms + exit marker
- Camera scroll confirmed working end-to-end

QA gate: can you walk/jump the full level? No geometry bugs, no camera jank?

### Phase 3 — Enemies + Score
- 2 enemy types:
  - **Walker**: patrols a platform back and forth, bounces at edges
  - **Jumper**: stationary base, hops straight up on a timer, lands in same spot
- Stomp detection: player falling (vy > 0) + overlapping enemy top hitbox → kill + bounce player
- Side/bottom enemy contact → player dies → DEAD state
- Score counter in HUD (top-left), +100 per stomp
- Exit collision → WIN state

QA gate: stomping feel + death states + score accuracy. All must pass.

### Phase 4 — Art Pass
- Art agent delivers: player sprite sheet (idle + run frames), walker + jumper sprites, tile sheet, simple parallax BG (1 layer)
- Dev swaps placeholder rects for sprites
- No gameplay changes in this phase — art drop only

QA gate: visual regression check. No new collision or rendering bugs allowed through.

### Phase 5 — Polish + Ship
- Start menu: game title + "PRESS SPACE TO START", nothing else
- Win screen: final score + "PRESS SPACE TO PLAY AGAIN" (returns to MENU)
- Dead screen: "YOU DIED" + "PRESS SPACE TO TRY AGAIN" (returns to MENU)
- DevOps final build + deploy to GitHub Pages

QA: full playthrough sign-off on the deployed build.

---

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Platform count, gaps, height variation, overall level length | level |
| Enemy count and placement | level |
| Sprite size (16×16 vs 32×32) and color palette | art |
| Gravity constant, jump velocity, max fall speed | dev |
| Walker patrol speed, Jumper hop height and timing | dev |
| Whether win screen auto-returns or waits for input | dev |
| Exact camera lerp vs snap behavior | dev |
| GitHub Pages repo/branch config | devops |
