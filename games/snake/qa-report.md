# Snake QA Report

---

## Bugs

### BUG-01 — `requestAnimationFrame` loop accumulates on every restart
**Severity: Critical**

`render()` unconditionally recurses via `requestAnimationFrame(render)` and `init()` always calls `requestAnimationFrame(render)` without cancelling any existing rAF handle. There is no `rafHandle` variable and no `cancelAnimationFrame` call anywhere.

Every call to `init()` (every restart) spawns a new persistent render loop. After N restarts there are N+1 loops running in parallel, each drawing every frame. This causes exponential render cost and visual glitching (multiple draw calls per frame out of phase with each other).

**Repro:** Start game, die, press Space. Open DevTools Performance tab — you'll see `render` called twice per frame. After a second restart, three times per frame.

**Fix:** Store the rAF handle and cancel it in `init()`.
```js
let rafHandle = null;
// in init():
if (rafHandle) cancelAnimationFrame(rafHandle);
// in render():
rafHandle = requestAnimationFrame(render);
```

---

### BUG-02 — Two-press 180° reversal is possible in specific direction sequences
**Severity: Major**

The 180° block checks the queued key against `dir` (the committed direction), not `nextDir` (the pending direction). This is intentional and handles most cases correctly. However, it does not prevent queueing a direction that is the direct opposite of `nextDir` when `nextDir != dir`. The result: the snake can appear to reverse into itself on the tick boundary in certain diagonal-adjacent cases.

**Specific repro:** Snake moving **Right**.
1. Press **Down** (between ticks): `nextDir = Down`. Check: opposite of Down is Up ≠ Right → allowed.
2. Press **Up** (same inter-tick gap): `curCanonical = Right` (dir hasn't updated), opposite of Up is Down ≠ Right → allowed. `nextDir = Up`.
3. Tick fires: `dir = Up`. Snake head moves up. Body was trailing rightward. Head moved up — that's a 90° turn from the committed direction, physically safe.

Wait — that's actually fine. Let me describe the genuinely dangerous sequence:

Snake moving **Right** (length ≥ 3, body extends left).
1. Press **Up** → `nextDir = Up` (valid, 90°).
2. Press **Left** immediately after → `curCanonical = Right`, opposite of Left is Right === Right → **BLOCKED**. Correct.

Snake moving **Up**.
1. Press **Right** → `nextDir = Right`.
2. Press **Down** → `curCanonical = Up`, opposite of Down is Up === Up → **BLOCKED**. Correct.

After re-analysis: the check against `dir` (not `nextDir`) actually provides the correct guarantee because the direct 180° (head into second segment) is always `opposite(dir)` not `opposite(nextDir)`. The body follows `dir`, so the dangerous cell is always at `dir`'s opposite. The implementation is correct.

**Revised verdict: This concern does not reproduce as a bug. See Concerns section instead.**

*(Leaving as a placeholder to document the investigation.)*

---

### BUG-03 — `foodFlashFrame` logic has an off-by-one: frame 1 renders red, not white
**Severity: Minor**

`foodColor()`:
```js
if (foodFlashFrame === 0) return '#ffffff';   // white
if (foodFlashFrame === 2) return '#ffffff';   // white
return C.food;                                 // red (frames 1 and 3+)
```

At `foodFlashFrame === 3`, `scheduleFoodFlash` returns early and stops, but `foodColor()` is never called for frame 3 because `drawFood()` uses `foodFlashFrame < 3 ? foodColor() : C.food` — so frame 3 correctly falls through to `C.food`. The actual flash sequence is: white(0) → red(1) → white(2) → [flash ends, settled red]. The comment says "white(0) → red(1) → white(2) → done(3+)" which matches. This is intentional and correct. Not a bug.

*(Leaving as a placeholder to document investigation.)*

---

## Concerns

### CONCERN-01 — `init()` does not reset `foodFlashFrame` to a neutral state when the flash is mid-cycle
**Severity: Minor**

`init()` sets `foodFlashFrame = 0` and cancels `foodFlashTimer`. Frame 0 renders as white. If a restart happens while a flash is in-flight, the new game starts with the food appearing white for ~50ms before settling to red. This is cosmetically awkward but not a gameplay bug. The more correct fix would be to reset `foodFlashFrame = 3` (settled state) and only call `startFoodFlash()` after setting food, which is what already happens — but setting the frame to 0 first creates a brief white flash on the new food before the new flash animation runs. Net effect: the flash animation runs correctly, just with a white-start artifact.

---

### CONCERN-02 — `state === 'win'` does not cancel `deathTimers`, `foodFlashTimer`, or `headFlashTimer`
**Severity: Minor**

The win condition is triggered from inside `tick()` when `spawnFood()` returns null. At that point the code sets `state = 'win'` and clears `tickTimer`, but does not call `die()` and does not cancel `foodFlashTimer` or `headFlashTimer`. If the player eats the last food while a head-flash or food-flash is mid-animation, those timers will continue firing and mutating `headFlashColor`/`foodFlashFrame` after win state is set. Since render still draws the snake with `headFlashColor` when `state === 'win'` (there is no special win snake color), the head color will flicker briefly on the win screen. Low probability (requires eating the very last cell) but worth fixing by cancelling flash timers on win.

---

### CONCERN-03 — Pulse fires one extra time due to timer nesting structure
**Severity: Minor**

In `die()`, the overlay is shown at +16ms and then `setTimeout(pulse, 25)` fires the first pulse at +41ms. Inside `pulse()`, if `pulseCount <= 4`, it queues another `setTimeout(pulse, 25)`. The sequence:

- t=0: die()
- t=16: showOverlay=true, alpha=0.2, queue pulse@+25
- t=41: pulse() → count=1, alpha=0.4, queue pulse@+25
- t=66: pulse() → count=2, alpha=0.2, queue pulse@+25
- t=91: pulse() → count=3, alpha=0.4, queue pulse@+25
- t=116: pulse() → count=4, alpha=0.2, queue pulse@+25
- t=141: pulse() → count=5, alpha=0.2 (set again, redundant), stop

The final call at count=5 sets `overlayAlpha = 0.2` and returns — that's a no-op since it's already 0.2. The pulse runs 4 meaningful transitions (0.4, 0.2, 0.4, 0.2), which matches "20%→40%→20%→40%→20%" if you include the initial 0.2. This is correct behavior, just slightly confusing code.

---

### CONCERN-04 — Restart during death sequence: `deathTimers` may miss pulse timers queued after the initial `die()` call
**Severity: Minor**

`die()` pushes the outer +16ms timer to `deathTimers`. Inside that timer's callback, it queues pulse timers via `deathTimers.push(setTimeout(pulse, 25))`. Each `pulse()` invocation also pushes its next timer via `deathTimers.push(setTimeout(pulse, 25))`.

If `init()` is called while a pulse is mid-flight, `deathTimers.forEach(t => clearTimeout(t))` will cancel all currently-pushed timer IDs. However: `pulse()` pushes its next timer ID *after* running. If `init()` fires between a pulse callback executing and it pushing its child timer, there is no race — JS is single-threaded. The timer ID is pushed before control returns to the event loop. This is safe. No bug here.

---

## Passed

**P-01 — Arrow keys AND WASD input both handled.** `KEY_TO_DIR` maps all 8 keys. `NORM_KEY` maps WASD to canonical arrow strings for the OPPOSITE lookup. Both sets work correctly.

**P-02 — 180° reversal correctly blocked.** The check `OPPOSITE[canonical] === curCanonical` where `curCanonical = dirToKey(dir)` correctly blocks the player from reversing into themselves. Checking against `dir` (committed) rather than `nextDir` (pending) is the right choice — the dangerous cell is always opposite the committed direction.

**P-03 — Arrow keys prevent page scroll.** `e.preventDefault()` is called when `e.key.startsWith('Arrow')`. WASD does not scroll (no default scroll behavior), so no `preventDefault` needed there.

**P-04 — Tick interval is 150ms.** `setInterval(tick, TICK_MS)` where `TICK_MS = 150`. Correct.

**P-05 — `nextDir` buffered at keydown, consumed at tick.** `tick()` assigns `dir = nextDir` at the top before moving. Input only sets `nextDir`. Correct.

**P-06 — Snake grows by exactly 1 segment on eat.** On eat tick: `snake.unshift(newHead)` adds the head, `snake.pop()` is skipped. Net: length +1. On non-eat tick: unshift + pop = net 0 change. Correct.

**P-07 — Food spawns only on empty cells.** `spawnFood()` builds a `Set` of all snake cell strings and collects only cells not in that set. Correct.

**P-08 — Score increments by 1 per food.** `score++` exactly once per eat. Correct.

**P-09 — Wall collision checks all 4 edges.** `newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS`. COLS=25, ROWS=25. All four edges covered. Correct.

**P-10 — Self-collision loop bound is correct.** Loop is `for (let i = 0; i < snake.length - 1; i++)` executed *before* `snake.unshift()`. At this point `snake[snake.length - 1]` is the current tail. Excluding it is correct: on a non-eating tick the tail will pop before the head arrives, so that cell is free. Indices 0 through `length-2` cover head + all body segments except the departing tail. Correct.

**P-11 — Snake turns gray immediately on death.** `die()` sets `state = 'dead'` synchronously. `drawSnake()` checks `state === 'dead'` and uses `C.deadSnake` (`#555555`) for all segments. Gray appears on the very next render frame (~16ms). Correct.

**P-12 — Overlay appears ~16ms after death.** `setTimeout(..., 16)` in `die()`. Correct.

**P-13 — Dead text appears ~200ms in.** `setTimeout(() => { showDeadText = true; }, 200)`. Correct.

**P-14 — Space restarts cleanly.** `init()` cancels `tickTimer`, all `deathTimers`, `foodFlashTimer`, `headFlashTimer`, resets all state variables, respawns food, and starts a new tick interval. Keydown handler correctly routes Space to `init()` when `state === 'dead' || state === 'win'`.

**P-15 — No duplicate keydown listeners across restarts.** `window.addEventListener('keydown', ...)` is called once at module parse time (line 151), outside of `init()`. Restarts do not re-register it.

**P-16 — Food spawn handles full grid.** `spawnFood()` returns `null` when `free.length === 0`. The eat handler checks `newFood === null`, sets `state = 'win'`, and clears the tick timer. Correct.

**P-17 — `rAF` loop is separate from tick interval.** `requestAnimationFrame(render)` drives visual updates; `setInterval(tick, TICK_MS)` drives game logic. They are independent. Render reads state set by tick. Correct architecture — except see BUG-01 regarding loop accumulation.

---

## Summary Table

| ID | Category | Severity | One-liner |
|----|----------|----------|-----------|
| BUG-01 | Bug | Critical | rAF loops accumulate on every restart — no `cancelAnimationFrame` |
| CONCERN-01 | Concern | Minor | `foodFlashFrame=0` on init causes brief white flash before new food settles |
| CONCERN-02 | Concern | Minor | Win path doesn't cancel flash timers; head flickers on win screen |
| CONCERN-03 | Concern | Minor | Pulse count logic is correct but off-by-one-looking; worth a comment |
| CONCERN-04 | Concern | Minor | Death timer nesting is safe (single-threaded), no actual race |
