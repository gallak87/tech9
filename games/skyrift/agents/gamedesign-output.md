# SKYRIFT — Game Design Spec
**Output of the gamedesign agent. Consumed by dev (Phases 2–4) and qa.**

---

## 1. Balance Parameters

| Constant | Value |
|---|---|
| Canvas width | 480 px |
| Canvas height | 640 px |
| Background scroll rate | 80 px/sec |
| Player speed | 280 px/sec |
| Player bullet speed | 520 px/sec (upward) |
| Enemy bullet speed | 220 px/sec (downward) |
| Auto-fire rate | 8 bullets/sec |

### Collision Hitboxes (width × height, centered on sprite)

| Entity | Hitbox |
|---|---|
| Player | 28 × 32 px |
| Scout | 22 × 18 px |
| Bomber | 30 × 28 px |
| Interceptor | 26 × 26 px |
| Boss | 90 × 80 px |
| Player bullet (any level) | 4 × 10 px |
| Enemy bullet | 5 × 10 px |
| Weapon pickup | 18 × 18 px |

Hitboxes are intentionally smaller than sprites — prioritizes "fair" feel over strict pixel accuracy.

---

## 2. Enemy Specs

### Scout
- **HP:** 1
- **Point value:** 100
- **Sprite size:** 32 × 28 px (placeholder rect)
- **Movement:** Enters from top at random x (bounded: 30–450 px). Moves straight down at **180 px/sec**. Applies a sine-wave horizontal drift: amplitude ±35 px, frequency 1.2 Hz. Does not stop or reverse — exits off bottom of screen if not killed.
- **Attack:** None. Scouts never fire.
- **Weapon drop:** 8% chance per kill.

### Bomber
- **HP:** 3
- **Point value:** 250
- **Sprite size:** 44 × 38 px (placeholder rect)
- **Movement:** Enters from top at random x (bounded: 50–430 px). Moves straight down at **90 px/sec**. No lateral drift — moves in a slow, predictable straight line to make the player commit to killing it.
- **Attack:** See Section 5 (Bomber Fire Pattern).
- **Weapon drop:** 20% chance per kill.

### Interceptor
- **HP:** 5
- **Point value:** 500
- **Sprite size:** 38 × 34 px (placeholder rect)
- **Movement:** Enters from top at a fixed x (chosen from spawn positions in the wave script). Moves down at **140 px/sec** for the first 80 px of travel, then locks onto the player's current x position and slides laterally at **160 px/sec** to track it. Once aligned within ±15 px of player x, it stops lateral movement and dives straight down at **200 px/sec** for the rest of its path. Does not reverse or re-target — one tracking pass per Interceptor.
- **Attack:** None. Interceptors rely on collision threat, not projectiles.
- **Weapon drop:** 15% chance per kill.

---

## 3. Wave Script

Total pre-boss gameplay: ~3.5 minutes. Waves are separated by breathing room where the screen is clear. Boss enters when **all enemies from the last wave are dead**.

Spawn positions are expressed as x values in pixels (absolute, not fractions). Spawns happen at y = -30 px (just above visible canvas). `delay` = seconds between individual spawns within the wave.

---

```
Wave 1 (t=5s):
  - Scout × 3, x=[80, 240, 400], delay=0.5s

Wave 2 (t=15s):
  - Scout × 4, x=[60, 160, 320, 420], delay=0.4s

Wave 3 (t=26s):
  - Scout × 3, x=[120, 240, 360], delay=0.4s
  - (scouts enter in a V-shape — spawn them simultaneously, all delay=0)

Wave 4 (t=37s):
  - Bomber × 1, x=[240], delay=0s
  - Scout × 4, x=[80, 160, 320, 400], delay=0.6s (scouts spawn 2s after bomber)

Wave 5 (t=52s):
  - Bomber × 2, x=[140, 340], delay=2.0s
  - Scout × 2, x=[60, 420], delay=0s (scouts spawn simultaneously, 1s after first bomber)

Wave 6 (t=68s):
  - Scout × 5, x=[48, 132, 240, 348, 432], delay=0.3s

Wave 7 (t=82s):
  - Interceptor × 1, x=[240], delay=0s
  - Scout × 2, x=[100, 380], delay=0s (scouts enter 1.5s after interceptor)

Wave 8 (t=100s):
  - Bomber × 2, x=[160, 320], delay=1.5s
  - Interceptor × 1, x=[240], delay=0s (interceptor spawns 3s after first bomber)

Wave 9 (t=120s):
  - Scout × 3, x=[80, 240, 400], delay=0.3s
  - Interceptor × 2, x=[140, 340], delay=1.0s (interceptors spawn 2s after scouts)

Wave 10 (t=142s):
  - Bomber × 1, x=[120], delay=0s
  - Interceptor × 1, x=[360], delay=0s
  - Scout × 3, x=[60, 240, 420], delay=0.5s (scouts spawn 2s after others)

Wave 11 (t=165s):
  - Interceptor × 3, x=[120, 240, 360], delay=1.2s

Wave 12 (t=188s):
  - Bomber × 3, x=[100, 240, 380], delay=1.0s
  - Interceptor × 2, x=[60, 420], delay=0s (interceptors spawn 4s after first bomber)

Wave 13 (t=210s) — final wave before boss:
  - Scout × 4, x=[80, 180, 300, 400], delay=0.3s
  - Bomber × 2, x=[140, 340], delay=1.5s (bombers spawn 1s after scouts)
  - Interceptor × 2, x=[100, 380], delay=0s (interceptors spawn 3s after bombers)
```

**Boss trigger:** When the last enemy of Wave 13 is destroyed, pause 2 seconds, then begin boss entry sequence.

---

## 4. Boss Spec

- **Name:** DREADWING
- **HP total:** 300
- **Sprite size:** 120 × 110 px (placeholder rect)
- **Hitbox:** 90 × 80 px
- **Point value:** 2000 pts on defeat

### Entry
Boss slides in from y = -110 px at 180 px/sec, centered at x = 240 px. Decelerates and settles at y = 100 px. Entry takes ~1.2 seconds. During entry, boss is invulnerable and does not fire.

### Phase Thresholds
- **Phase 1:** HP 300 → 200 (100%)–(67%)
- **Phase 2:** HP 200 → 100 (66%)–(34%)
- **Phase 3:** HP 100 → 0 (33%)–(0%)

Phase transitions: boss flashes white 3 times over 0.4 seconds, pauses all attacks for 0.5 seconds, then immediately resumes in the new phase pattern.

---

### Phase 1 — Suppression Grid

**Movement:** Boss rocks left-right in a slow sine oscillation: center x=240, amplitude ±80 px, period 4 seconds. Stays at y=100 px.

**Attack — Twin Spread (fires every 2.0s):**
- Fires 2 bullets simultaneously
- Left bullet: x = boss_x − 40, angled 15° outward from straight down
- Right bullet: x = boss_x + 40, angled 15° outward from straight down
- Bullet speed: 220 px/sec
- Bullet size: 6 × 14 px

**Attack — Aimed Shot (fires every 3.5s, offset by 1.0s from Twin Spread timer):**
- Fires 1 bullet directly at the player's current position
- Speed: 260 px/sec
- Bullet size: 7 × 7 px (round)

---

### Phase 2 — Suppression Grid+

**Movement:** Same side-to-side oscillation but amplitude increases to ±120 px, period shrinks to 3 seconds.

**Attack — Wide Burst (fires every 1.5s):**
- Fires 5 bullets in a fan: angles at −30°, −15°, 0°, +15°, +30° from straight down
- All fire from boss center x
- Speed: 230 px/sec
- Bullet size: 6 × 14 px

**Attack — Aimed Double Shot (fires every 2.5s, offset by 0.75s from Wide Burst timer):**
- Fires 2 bullets aimed at player, 0.12 seconds apart
- Speed: 275 px/sec
- Bullet size: 7 × 7 px (round)

**Transition into Phase 2:** After flash + pause, boss slams from current position to x=240 instantly (hard snap, 1 frame) as a visual tell that something changed.

---

### Phase 3 — Frenzy

**Movement:** Boss stops oscillating. Instead, it actively tracks the player horizontally: moves toward player x at **90 px/sec** lateral speed. Simultaneously begins slow vertical creep downward at 12 px/sec, floor at y=180 px (stops descending there). This makes safe vertical space shrink over time.

**Attack — Spiral Burst (fires every 1.2s):**
- Fires 8 bullets in a circle (evenly spaced at 45° intervals)
- Rotation offset increases by 22.5° each firing (spiral effect over time)
- Speed: 210 px/sec
- Bullet size: 6 × 6 px (round)

**Attack — Rapid Aimed (fires every 0.8s):**
- Fires 1 bullet directly at player
- Speed: 320 px/sec
- Bullet size: 5 × 12 px

**Charge Attack (triggers once at 15% HP remaining — one-time event):**
- Boss pauses all attacks for 0.3 seconds
- Rapidly slides to x = player_x at 400 px/sec, then lunges downward at 500 px/sec to y = 500 px
- If player is hit by the boss body during the lunge, it counts as a collision hit
- Boss then slides back up to y = 180 px at 250 px/sec and resumes normal Phase 3 patterns

**Transition into Phase 3:** After flash + pause, boss fires one full circle of 12 bullets (30° spacing, speed 180 px/sec) as a burst discharge. Player has ~0.5s warning from the flash.

---

## 5. Bomber Fire Pattern

The Bomber fires on a **fixed timer with a randomized initial offset** so multiple Bombers on screen don't fire simultaneously.

- **Initial delay:** random 0.8–1.8 seconds after spawn (uniform distribution) before first shot
- **Fire rate:** every **2.2 seconds** after the first shot
- **Projectile count per burst:** 3 bullets
- **Spread:** center bullet fires straight down; left bullet at −18° from vertical; right bullet at +18° from vertical
- **Projectile speed:** 220 px/sec (same as standard enemy bullet speed)
- **Projectile size:** 5 × 10 px
- **Firing origin:** base of Bomber sprite (bottom-center x, y + sprite_height/2)

Bomber continues firing on this timer for its entire lifetime regardless of player position — no aim correction, no reaction to being hit. It just drops bullets on a clock.

---

*End of gamedesign spec. All values above are final — dev should treat these as constants, not suggestions.*
