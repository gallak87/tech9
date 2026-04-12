# SKYRIFT — Phase 2 QA Report

**Auditor:** QA agent (static code audit)
**Date:** 2026-04-11
**File audited:** `src/game.js`
**Refs:** `CONCEPT.md`, `agents/gamedesign-output.md`, `agents/art-output.md`

---

## Criterion-by-Criterion Results

### 1. Player can shoot — weapon system implemented for all 5 levels with distinct bullet patterns

**PASS**

All five levels are implemented in `fireBullets()` (lines 277–338):
- L1: single center shot
- L2: twin parallel shots (±6px offset)
- L3: center + 15° left/right spread (3 bullets)
- L4: 3-way spread + 2 pseudo-missiles with lateral velocity
- L5: 3-way spread (all piercing) + 2 missiles + center piercing shot

Colors and dimensions match `art-output.md` exactly. L4 and L5 missiles are marked `TODO Phase 3: real homing` which is acceptable per scope.

---

### 2. Collecting pickups advances weapon level (cap 5)

**PASS**

`checkCollisions()` line 476:
```js
player.weaponLevel = Math.min(5, player.weaponLevel + 1);
```
Cap at 5 is correctly enforced.

---

### 3. Weapon level drops correctly on player hit (floor 1)

**PASS**

`playerHit()` line 485:
```js
player.weaponLevel = Math.max(1, player.weaponLevel - 1);
```
Floor at 1 is correctly enforced.

---

### 4. Lives decrement on player hit, reach 0 → GAME_OVER

**PASS**

`playerHit()` lines 484–493 decrements `player.lives`, syncs to `game.lives`, and transitions to `STATE.GAME_OVER` when `player.lives <= 0`. Correct.

---

### 5. Score accumulates correctly (Scout=100, Bomber=250, Interceptor=500)

**PASS**

`ENEMY_SPECS` (lines 121–124) defines the correct point values:
```js
scout:       { score: 100,  ... }
bomber:      { score: 250,  ... }
interceptor: { score: 500,  ... }
```
`checkCollisions()` line 449 adds `e.score` to `game.score` on kill. Correct.

---

### 6. HUD shows score, weapon level, lives in PLAYING state

**PASS**

`drawHUD()` (lines 632–670) renders in PLAYING (and BOSS) state:
- Score: top-left, `SCORE: 000000` format
- Lives: top-right, heart characters (♥/♡), red
- Weapon level: top-right below lives, `WPN: N`, lime green

All three elements are present and legible (shadow applied for contrast).

---

### 7. WIN and GAME_OVER screens show actual score

**PASS**

`draw()` lines 516–518:
```js
drawOverlay('YOU WIN',   `Score: ${String(game.score).padStart(6, '0')}`);
drawOverlay('GAME OVER', `Score: ${String(game.score).padStart(6, '0')}`);
```
Both use `game.score` (not a placeholder). `game.score` is correctly accumulated during play. Correct.

---

### 8. Auto-fire toggle works (Z or Space)

**PASS**

`keydown` handler lines 176–182:
```js
if ((game.state === STATE.PLAYING || game.state === STATE.BOSS) &&
    (e.code === 'KeyZ' || e.code === 'Space')) {
  player.autoFire = !player.autoFire;
  e.preventDefault();
  return;
}
```
`updatePlayer()` lines 385–393 accumulates `fireTimer` and calls `fireBullets()` at the 8/sec rate. Toggle correctly resets `fireTimer` to 0 when turned off (line 392). Correct.

---

### 9. Invincibility period after player hit (1.5 sec, player blinks)

**PASS**

- Duration: `INVINCIBILITY_DURATION = 1.5` (line 101). Correct.
- `playerHit()` sets `player.invincible = true` and `player.invincibleTimer = 1.5` (lines 486–487).
- `updatePlayer()` lines 396–403 counts down and clears the flag.
- `drawPlayer()` lines 552–554 skips rendering on alternating 100ms intervals while invincible — produces visible blink.
- Enemy↔player collision is gated on `!player.invincible` (line 462). Correct.

---

### 10. Pickup drop logic exists per enemy type

**PASS**

`ENEMY_SPECS` defines per-type drop probabilities matching `gamedesign-output.md`:
- Scout: 8%
- Bomber: 20%
- Interceptor: 15%

`checkCollisions()` lines 451–453 rolls `Math.random() < e.dropChance` on kill and pushes a pickup at the enemy's position. The pickup has the correct 18×18 hitbox (halfW/halfH = 9). Correct.

---

## Minor Issues / Notes (non-blocking)

### A. Spread angle bug — L3/L4/L5 (cosmetic, not a correctness failure for Phase 2)

In `fireBullets()` at line 315, the right-spread bullet at +15°:
```js
bullets.push({ ..., vx: vxFromDeg(-15), vy: vyFromDeg(-15), ... });  // left
bullets.push({ ..., vx: vxFromDeg( 15), vy: vyFromDeg( 15), ... });  // right
```
`vyFromDeg(15)` = `-BULLET_SPEED * cos(15°)` ≈ `-502`, which is correct upward velocity. `vxFromDeg(15)` = `BULLET_SPEED * sin(15°)` ≈ `+135`, also correct. The sign looks fine on inspection — the apparent oddity is that the same helper is used for both left (negative angle) and right (positive angle), which works because sin is antisymmetric. No actual bug here.

### B. Background scroll rate mismatch

`gamedesign-output.md` specifies **80 px/sec** scroll rate. Code has `SCROLL_SPEED = 60` (line 68). Minor spec deviation — low priority.

### C. Sprite sizes don't match art spec

Enemy `w`/`h` values in `ENEMY_SPECS` (used for placeholder rect drawing) don't match `art-output.md`:
- Bomber: code uses 44×38, art spec says 48×40
- Interceptor: code uses 32×34, art spec says 32×44

These are placeholder rects that Phase 3 replaces with real sprites. Non-blocking for Phase 2.

### D. `game.lives` is redundant

Both `game.lives` and `player.lives` track the same value. `playerHit()` syncs them (line 489), but `startGame()` sets both independently. `drawHUD()` reads `player.lives`. This dual-track is benign now but is a latent inconsistency to clean up before the codebase gets larger.

### E. DEV shortcuts left in

`KeyW` → WIN and `KeyG` → GAME_OVER shortcuts are present (lines 185–196). Fine for Phase 2 dev, but the comment "remove before ship" should be tracked.

---

## Overall Verdict

**Ready for Phase 3.**

All 10 QA gate criteria pass. The weapon system, pickup progression, lives/hit logic, score accumulation, HUD, end screens, auto-fire, invincibility, and drop probabilities are all correctly implemented and mutually consistent. The minor issues identified (scroll speed off by 20px/sec, placeholder rect dimensions, dual lives tracking) are low-priority and don't block Phase 3 work. Phase 3 should replace `spawnPlaceholderEnemies()` with the real wave spawner from `gamedesign-output.md` and implement enemy AI movement.
