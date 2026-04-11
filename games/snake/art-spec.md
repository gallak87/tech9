# Snake — Art Spec

## 1. Visual Style

**Minimal geometric / retro terminal.**

Flat filled rectangles on a dark background. No textures, no gradients, no outlines on individual segments. The grid itself is barely visible — just enough to give spatial reference without competing with the snake. Inspired by the feel of a monochrome CRT terminal but rendered cleanly at pixel-perfect resolution.

Rationale: "Satisfying and tense, clean and minimal" rules out anything decorative. The growing snake body is the visual tension — it needs contrast and clarity, not ornamentation. A dark background makes the bright snake and food pop without any extra work. The near-invisible grid keeps spatial awareness intact without clutter.

---

## 2. Color Palette

| Element              | Hex       | Notes                                  |
|----------------------|-----------|----------------------------------------|
| Background           | `#0d0d0d` | Near-black, not pure black             |
| Grid lines           | `#1a1a1a` | Barely-there, 1px lines                |
| Snake body           | `#3ddc84` | Android green — bright, saturated      |
| Snake head           | `#ffffff` | Pure white — distinct from body        |
| Food                 | `#ff4757` | Hot red-coral — high contrast, urgent  |
| Death overlay        | `#ff000033` | Red at ~20% opacity over full canvas |
| Score text (normal)  | `#e0e0e0` | Soft white                             |
| Score text (death)   | `#ffffff` | Full white, larger                     |

---

## 3. Grid Dimensions

- **Cells:** 25 wide × 25 tall
- **Cell size:** 24px
- **Canvas size:** 600px × 600px (plus 48px header bar for score = 600 × 648px total)

25×25 gives enough room for the snake to grow to a genuinely threatening length before the grid feels cramped. 24px cells are large enough to read clearly at 600px canvas without any scaling. The square grid keeps movement feel symmetric in all four directions.

---

## 4. Snake Rendering

- **Shape:** Filled rectangle, exactly cell-size with a 2px inset gap on all sides (so effective render size is 20×20px within each 24px cell)
- **Head:** Same rectangle but filled `#ffffff` instead of `#3ddc84`
- **No rounded corners** — keep it crisp and geometric
- **Gap between segments:** The 2px inset creates a natural 4px visual gap between adjacent segments, giving the snake a segmented "chain" look without any extra logic

The gap is important: a fully solid snake reads as a blob. The segmented look makes it easier to count length and feel the threat of the tail.

---

## 5. Food Rendering

- **Shape:** Circle, centered in its cell, radius 8px (diameter 16px within 24px cell)
- **Color:** `#ff4757`
- **No animation at rest** — static circle
- **On spawn:** Single 3-frame flash (3 frames × 16ms ≈ 50ms) — blink from `#ff4757` to `#ffffff` and back. Short enough to not distract, long enough to register the new position.

A circle vs. the square snake body creates an immediate visual language: squares are snake, circles are food. No ambiguity.

---

## 6. Feedback Specs

### On Eat
- **Snake head:** Flashes `#3ddc84` → `#ffffff` → `#3ddc84` over 100ms (two frames at 50ms each) — confirms the eat without being distracting
- **Score:** Increments instantly, no animation on the number itself
- **No screen flash** — keep it tight

### On Death
1. **Immediate:** Snake body color shifts from `#3ddc84` to `#555555` (desaturated gray) — the whole body, including head, in one frame
2. **Frame 2 (16ms later):** Red overlay `#ff000033` fills the full canvas
3. **Frame 3–8 (next 100ms):** Overlay pulses — opacity oscillates between `33` and `66` hex (20% → 40%) twice, then settles at `33`
4. **Score display:** After the pulse settles (~200ms total), centered text appears over the overlay:
   - Line 1: `GAME OVER` — 28px, all caps, letter-spacing 4px
   - Line 2: `SCORE: {n}` — 20px
   - Line 3: `PRESS SPACE TO RESTART` — 13px, muted (`#999999`)
5. **Restart:** Pressing Space clears everything instantly, no fade

The body going gray is the key death signal — it reads as "dead" before anything else hits. The overlay reinforces it without obscuring the board state (player wants to see where they died).

---

## 7. Typography

**Font:** `"SF Mono", "Fira Code", "Consolas", monospace`

All text is monospace. Monospace fits the terminal aesthetic, and fixed-width digits mean the score counter never causes layout shift as it increments.

- **Live score (top center of header bar):** 18px, `#e0e0e0`, weight 500, format: `SCORE  {n}` with two spaces as separator
- **Game over / score display:** See §6 above
- **All text:** No anti-aliasing adjustments needed — browser default is fine at these sizes

---

*Written by: art agent | For: dev agent*
