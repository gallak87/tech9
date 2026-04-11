# Agent: art
**Responsibility:** Design and produce all visual assets — player sprites, enemy sprites, tile sheet, background layer.

## Inputs
- `CONCEPT.md` — aesthetic direction (late-90s action platformer, gritty industrial)
- `GAME_PLAN.md` — what assets are needed and when (Phase 4)
- `agents/dev.md` — sprite size constraints, how assets will be loaded

## Outputs
- Player sprite sheet: idle (1 frame is fine) + run cycle (4 frames minimum)
- Walker enemy sprite (1-2 frames, patrol loop)
- Jumper enemy sprite (1-2 frames, idle + mid-air)
- Tile sheet: at least ground tile, platform tile, wall tile
- Background layer: single parallax layer (can be simple geometric shapes, no photo-realism)
- All assets as PNG, dimensions clearly documented in a companion `art-spec.md`

## Current Phase Goal
**Phase 4:** Deliver all sprites and tiles so dev can swap out placeholder rects.
Before Phase 4, provide dev with the *sprite size decision* (16×16 or 32×32) so collision
boxes can be sized correctly from Phase 1 onward.

## Hard Constraints
- **Pixel art only.** No smooth gradients, no anti-aliasing on edges.
- **Limited palette.** Pick 4–6 colors max and stick to them. Industrial/dark theme —
  dark grays, concrete, rust orange or acid green as an accent. Player should read clearly
  against the background at a glance.
- **Player must be visually distinct from enemies at a glance.** Different silhouette,
  different color. No ambiguity.
- **No animated background.** Static or very subtle parallax. Keep it cheap.
- **No UI art.** Score font is system/monospace. Menus are plain text on a dark background.
  Art agent does not own the HUD.
