# Snake2 — Mechanics Spec

**Author:** gamedesign agent  
**Date:** 2026-04-13  
**Implements:** CONCEPT.md Snake2

---

## 1. State Machine

Three states. No substates.

```
IDLE ──[any key / click]──► PLAYING ──[death condition]──► DEAD
                                                              │
                             ◄──────[any key / click]────────┘
```

### IDLE
- Grid is rendered with a static 3-segment snake in the center, facing right.
- No pickups visible.
- Display: game title centered on grid, "Press any key to start" subtitle beneath.
- No ticking.

### PLAYING
- Tick loop runs.
- All gameplay systems active.
- Score displayed live, top-right corner of grid.

### DEAD
- Tick loop stops immediately on the frame death is detected.
- Snake remains visible in its final position (no fade, no animation).
- Display: "GAME OVER" centered on grid, final score on line below, "Press any key to restart" beneath that.
- Pressing any key or clicking anywhere on the grid transitions to IDLE and resets all state (score = 0, snake = starting config, pickup cleared).

---

## 2. Snake Movement

### Grid
- 30 columns × 20 rows. Each cell is 24×24 px. Total canvas 720×480 px.
- (0,0) is top-left. X increases right. Y increases down.

### Starting configuration
- Snake spawns at center (15, 10), 3 segments, facing right.
- Head at (15,10), body at (14,10), tail at (13,10).

### Tick rate
- Base interval: **150 ms**.
- See Section 4 for speed escalation.

### Direction queuing
- The snake has a **pending direction** slot that holds at most **1 buffered input**.
- On each tick, if a buffered input exists, it is consumed and becomes the active direction before movement resolves.
- 180° reversal is illegal: if the buffered direction is exactly opposite the current active direction, the input is **discarded silently** (not queued).
  - Opposite pairs: LEFT↔RIGHT, UP↔DOWN.
- If the buffer already holds an input and another arrives before the next tick, the newer input **replaces** the buffered one. No multi-deep queue.

### Movement resolution (per tick)
1. Consume buffered input if present → set active direction.
2. Compute new head position: head + direction vector.
3. Check death conditions (Section 5) against new head position.
4. If dead, transition to DEAD.
5. Otherwise:
   a. Prepend new head to segment list.
   b. If a pickup was eaten this tick (new head == pickup cell), apply pickup effect (Section 3), do **not** remove tail.
   c. If no pickup eaten, remove last segment (tail).

Segments are stored as an ordered array of `{x, y}`. Index 0 is head.

---

## 3. Pickup System

### Tier definitions

| Tier | Segment gain | Points | CSS glow color |
|---|---|---|---|
| Common | +1 | +10 | `#00ffcc` (cyan) |
| Rare | +3 | +30 | `#ff00ff` (magenta) |
| Legendary | +6 | +100 | `#ffdd00` (gold) |

"Segment gain" is implemented by skipping tail removal for N ticks after eating. Track `pendingGrowth: number`; each tick where no pickup is eaten, if `pendingGrowth > 0`, decrement it and do not remove tail.

### Spawn logic
- Exactly **one** pickup exists on the grid at all times during PLAYING.
- On game start, spawn one Common pickup.
- After a pickup is eaten:
  1. Determine next tier (see Promotion below).
  2. Pick a random empty cell (not occupied by any snake segment).
  3. Place pickup there.

### Promotion chain
- Each promotion roll is independent with P = 0.20.
- After eating a pickup of tier T:
  - Roll once. If hit (20%), next pickup is T+1 (Common→Rare, Rare→Legendary).
  - Legendary does not promote further; the roll is skipped entirely for Legendary.
- **Double-promotion is not a thing.** One roll, one possible step up. No cascading. The 20% is not re-rolled on the promoted tier.

### Grid-full edge case
- If no empty cell exists (all cells occupied by snake), do **not** spawn a pickup.
- Re-attempt spawn at the start of every subsequent tick until a cell is free.
- This is a near-win state; no special handling beyond that.

---

## 4. Scoring

### Points
Exact values in tier table above. Score is a non-negative integer, starts at 0 each game.

### Speed escalation
```
interval(score) = max(FLOOR_MS, BASE_MS - floor(score / 50) * DECREMENT_MS)
```

| Constant | Value |
|---|---|
| BASE_MS | 150 |
| DECREMENT_MS | 10 |
| FLOOR_MS | 60 |

Examples:
- 0–49 pts → 150 ms
- 50–99 pts → 140 ms
- 100–149 pts → 130 ms
- …
- 450+ pts → 60 ms (floor, stays here)

Speed is recalculated **after** each point gain and applied to the **next** tick's setTimeout/setInterval delay. The current tick completes at its scheduled interval; the new speed takes effect from the tick that follows.

Use `setTimeout` with a recalculated delay each tick, not a fixed `setInterval`. This makes speed changes clean.

---

## 5. Death

### Conditions
Death triggers if the computed new head position satisfies either:
- **Wall collision:** `x < 0 || x >= 30 || y < 0 || y >= 20`
- **Self collision:** `{x, y}` matches any cell in the current segment array (all segments, including what will become the new body after movement — check against the array *before* the tail is removed this tick)

### Death screen
- Tick loop halts.
- Overlay rendered on top of grid (semi-transparent dark layer, no blur).
- Text stack centered on grid:
  - Line 1: `GAME OVER` — large, `#ff4444`
  - Line 2: `Score: {N}` — medium, white
  - Line 3: `Press any key to restart` — small, `#888888`

### Restart
- Any `keydown` event or `pointerdown` on the grid while in DEAD state resets to IDLE.
- Full reset: score = 0, snake = starting config (3 segments, center, facing right), `pendingGrowth = 0`, pickup cleared, active direction = RIGHT, buffer = empty.
- Transition: DEAD → IDLE (show title screen), not directly to PLAYING. Player must press again to start.

---

## 6. Input

### Key bindings

| Action | Keys |
|---|---|
| Move up | `ArrowUp`, `w`, `W` |
| Move down | `ArrowDown`, `s`, `S` |
| Move left | `ArrowLeft`, `a`, `A` |
| Move right | `ArrowRight`, `d`, `D` |
| Start (IDLE) | any `keydown` |
| Restart (DEAD) | any `keydown` |

- Listen on `document` for `keydown`.
- Default browser scroll behavior for arrow keys is suppressed (`event.preventDefault()`) only when game state is PLAYING.

### Direction queue depth
- **1 buffered input maximum.** New input replaces existing buffer (not appended). This prevents input lag buildup during fast play while still allowing one-ahead queuing for smooth cornering.

---

## 7. Balance Notes

**Segment growth accumulation:** `pendingGrowth` is additive. If the player somehow eats a second pickup before growing is done (impossible with one pickup at a time, but noted), gains stack. With one-pickup-at-a-time this is a non-issue.

**Speed floor at 60 ms:** At 60 ms per tick on a 30×20 grid the game is very fast but mechanically possible. Do not go lower. The speed curve reaches floor at 450 points (45 commons, fewer if rares/legendaries are eaten). A skilled player will hit this in a moderate run.

**Legendary frequency:** The promotion chain means legendary is never the starting tier. Earliest possible legendary: eat a common (20% → rare spawn), eat the rare (20% → legendary spawn). P(legendary within 2 pickups) = 0.04. This is correct — legendary should feel like a lucky event.

**Grid dimensions:** 30×20 at 24 px = 720×480. This is a standard 3:2-ish ratio that fits common viewport widths. Dev should not change these without re-checking the CSS layout.

**No pause state.** This is intentional. Pausing adds complexity and cuts against the arcade feel.

**No high score persistence.** Session-only. The CONCEPT says no persistence; do not add localStorage.
