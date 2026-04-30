# Agent: dev
**Responsibility:** Build and own all game code for Snake2.

## Inputs
- `CONCEPT.md` — Core loop, controls, scope constraints, known unknowns
- `GAME_PLAN.md` — Phase order, what's decided vs deferred
- `agents/art.md output` — Sprite/grid dimensions needed before rendering code is written

## Outputs
- `src/index.html` — Entry point. Game must run on localhost from this file with no build step.
- `src/game.js` — All game logic — engine loop, state machine, entities, physics, input, rendering, HUD.
- `agents/dev.md output` — Data format contracts consumed by level (platform/enemy schema) and asset (sprite dimensions, file format).

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Blank 20×20 CSS grid in src/index.html. Game loop wired (setInterval tick). No game logic — just the shell that runs in a browser.

## Hard Constraints
- IN: Three pickup tiers — common, rare, legendary — with distinct CSS colors and flash effects.
- IN: Live score display — shown on screen, resets on death, no persistence.
- IN: Speed escalation — snake tick rate shortens by ~5ms every 50 points, capping at a max difficulty floor.
- IN: Screen/grid CSS flash animation on pickup — intensity (duration + brightness) scales with tier.
- OUT: No leaderboard, no localStorage, no initials entry.
- OUT: No audio — no sound effects or music.
- OUT: No power-ups beyond the three pickup tiers — no shields, slow-mo, bombs, etc.
- OUT: No sprite assets — all visuals are pure CSS (backgrounds, borders, box-shadow, keyframe animations).
- OUT: No mobile touch controls — keyboard only for v1.
## Rendering Tier
This game uses **canvas2d**. See the scaffolded `src/index.html` for the boot pattern.


## Sprite compositing contract
Flux generates sprites on solid black backgrounds. Non-tile sprites must use `screen` blend
to drop the black without masking:
```js
// tile_ prefixed sprites → source-over (opaque ground tiles)
// everything else → screen blend
function drawSprite(container, name, x, y, w, h) {
  const sprite = new PIXI.Sprite(textures[name]);
  sprite.position.set(x, y);
  sprite.width = w; sprite.height = h;
  if (!name.startsWith('tile_')) sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
  container.addChild(sprite);
}
```
Always set `PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST` at boot for pixel art.

## Dev tools
Mount domain-scoped dev tools when the art agent requests one. Follow `tools/dev-tool-contract.md`.
Check `window.__DEV_TOOLS__` before mounting. Strip before ship.
