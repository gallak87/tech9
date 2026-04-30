# Snake2 — Visual Spec (Art Agent Output)

All values are copy-paste ready. No vague descriptions.

---

## 1. Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0a0a0f` | Page / game background |
| `--grid-cell` | `#0f0f1a` | Empty cell fill |
| `--grid-border` | `#1a1a2e` | Cell border (1px) |
| `--snake-head` | `#00ffcc` | Head fill |
| `--snake-body` | `#00cc99` | Body segment fill |
| `--pickup-common` | `#39ff14` | Common pickup fill |
| `--pickup-rare` | `#ffd700` | Rare pickup fill |
| `--pickup-legendary` | `#ff2020` | Legendary pickup fill |
| `--score-text` | `#e0e0ff` | HUD score |
| `--death-overlay` | `rgba(255, 20, 20, 0.18)` | Death tint over grid |

---

## 2. Glow / Box-Shadow

### Snake Head
```css
box-shadow:
  0 0 6px 2px #00ffcc,
  0 0 18px 4px #00ffcc80,
  inset 0 0 4px #00ffff40;
```

### Snake Body
```css
box-shadow:
  0 0 4px 1px #00cc9966,
  0 0 10px 2px #00cc9933;
```

### Pickup — Common
```css
box-shadow:
  0 0 6px 2px #39ff14,
  0 0 16px 4px #39ff1466;
```

### Pickup — Rare
```css
box-shadow:
  0 0 8px 3px #ffd700,
  0 0 22px 6px #ffd70055,
  0 0 40px 8px #ffaa0022;
```

### Pickup — Legendary
```css
box-shadow:
  0 0 10px 4px #ff2020,
  0 0 28px 8px #ff202066,
  0 0 60px 14px #ff000033,
  inset 0 0 6px #ff606040;
```

---

## 3. Flash Animations (on pickup)

All flashes are applied to the **grid wrapper** element (`.grid`), not individual cells.

### Common Flash — subtle green pulse
Duration: 300ms, once, ease-out

```css
@keyframes flash-common {
  0%   { background-color: #0a0a0f; }
  30%  { background-color: #0d2010; }
  100% { background-color: #0a0a0f; }
}

.flash-common {
  animation: flash-common 300ms ease-out 1;
}
```

### Rare Flash — gold surge
Duration: 500ms, once, ease-out

```css
@keyframes flash-rare {
  0%   { background-color: #0a0a0f; filter: brightness(1); }
  20%  { background-color: #1a1200; filter: brightness(1.6); }
  60%  { background-color: #110e00; filter: brightness(1.2); }
  100% { background-color: #0a0a0f; filter: brightness(1); }
}

.flash-rare {
  animation: flash-rare 500ms ease-out 1;
}
```

### Legendary Flash — catastrophic white-red blast
Duration: 800ms, once, cubic-bezier(0.22, 1, 0.36, 1)

```css
@keyframes flash-legendary {
  0%   { background-color: #0a0a0f; filter: brightness(1) saturate(1); }
  8%   { background-color: #ffffff; filter: brightness(3.5) saturate(0); }
  20%  { background-color: #ff1010; filter: brightness(2.2) saturate(2); }
  50%  { background-color: #1a0000; filter: brightness(1.3) saturate(1.5); }
  100% { background-color: #0a0a0f; filter: brightness(1) saturate(1); }
}

.flash-legendary {
  animation: flash-legendary 800ms cubic-bezier(0.22, 1, 0.36, 1) 1;
}
```

---

## 4. Snake Head vs Body Distinction

| Property | Head | Body |
|---|---|---|
| `background-color` | `#00ffcc` | `#00cc99` |
| `border-radius` | `4px` | `2px` |
| `box-shadow` | (see §2 head) | (see §2 body) |
| `z-index` | `2` | `1` |
| `transform` | `scale(1.08)` | `scale(1.0)` |
| `border` | `1px solid #80fff0` | `1px solid #00cc9944` |

The head is slightly brighter, slightly scaled up (8%), and has a white-tinted border so it reads as the leading edge at a glance. No extra size — still fits the 24px cell. The `transform: scale(1.08)` gives perceived pop without breaking grid alignment (use `overflow: hidden` on `.grid`).

---

## 5. Death State

Applied as a class on `.grid` (`class="grid state-dead"`). Two simultaneous effects:

### Red flash then desaturate
```css
@keyframes death-flash {
  0%   { filter: brightness(1) saturate(1) hue-rotate(0deg); }
  10%  { filter: brightness(2.5) saturate(0.2) hue-rotate(0deg); }
  25%  { filter: brightness(1.4) saturate(0) hue-rotate(-20deg); }
  100% { filter: brightness(0.55) saturate(0) hue-rotate(0deg); }
}

.state-dead {
  animation: death-flash 700ms ease-out 1 forwards;
  /* stays desaturated + dim at end via forwards fill */
}
```

### Death overlay
A `div.death-overlay` is absolutely positioned over `.grid`:
```css
.death-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(255,20,20,0.22) 0%, rgba(255,20,20,0.06) 70%, transparent 100%);
  pointer-events: none;
  opacity: 0;
  animation: death-overlay-in 400ms ease-out 100ms 1 forwards;
}

@keyframes death-overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

---

## 6. Score HUD

Positioned **above the grid**, full width of grid, right-aligned.

```css
.score-hud {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;            /* matches grid width (20 * 25px = 500px) */
  margin-bottom: 8px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e0e0ff;
  text-shadow:
    0 0 6px #a0a0ff,
    0 0 14px #6060ff66;
}

.score-hud .label {
  color: #5050aa;
  font-weight: 400;
}

.score-hud .value {
  color: #e0e0ff;
}

.score-hud .value.score-bump {
  /* applied briefly on score increase */
  animation: score-bump 200ms ease-out 1;
}

@keyframes score-bump {
  0%   { color: #e0e0ff; text-shadow: 0 0 6px #a0a0ff; }
  40%  { color: #ffffff; text-shadow: 0 0 12px #ffffff, 0 0 24px #8080ff; }
  100% { color: #e0e0ff; text-shadow: 0 0 6px #a0a0ff; }
}
```

---

## 7. Class Names

All classes the dev should implement. No deviation — these are the canonical names.

### Cell state classes (applied to `.cell` divs)
```
.cell                   — base class, every div in the grid
.cell-empty             — default, dark background
.cell-snake-head        — snake head segment
.cell-snake-body        — snake body segment
.cell-pickup-common     — common pickup
.cell-pickup-rare       — rare pickup
.cell-pickup-legendary  — legendary pickup
```

### Grid / game state classes (applied to `.grid`)
```
.grid                   — base class
.state-playing          — normal gameplay
.state-dead             — death triggered
.flash-common           — grid flash, common pickup (brief, auto-removed after 300ms)
.flash-rare             — grid flash, rare pickup (brief, auto-removed after 500ms)
.flash-legendary        — grid flash, legendary pickup (brief, auto-removed after 800ms)
```

### HUD classes
```
.score-hud              — HUD container
.score-hud .label       — "SCORE" / "HIGH" text
.score-hud .value       — numeric value
.score-hud .value.score-bump  — transient class, triggers bump animation
```

### Overlay
```
.death-overlay          — absolute div inside .grid, shown on death
```

---

## Grid sizing reference

```css
.grid {
  display: grid;
  grid-template-columns: repeat(20, 24px);
  grid-template-rows: repeat(20, 24px);
  gap: 1px;
  background-color: #1a1a2e;  /* gap color = grid line color */
  padding: 1px;
  position: relative;
  overflow: hidden;
}

.cell {
  width: 24px;
  height: 24px;
  background-color: #0f0f1a;
  transition: background-color 60ms linear;
}
```

Total grid rendered size: `(24 × 20) + (1 × 21) = 501px` per axis.
