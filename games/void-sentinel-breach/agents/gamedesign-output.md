# Void Sentinel: Breach — Mechanics & Balance Spec

**Version:** Phase 2/3 implementation reference  
**Date:** 2026-04-29

---

## 1. Enemy Behavior Rules

All speeds are in world units/second. All positions assume the play field is X: -6 to +6, Y: 0.3 to 4.5. Enemies enter from Y > 4.5 and exit below Y < 0.

### 1.1 Scout

| Parameter | Value |
|---|---|
| HP | 1 |
| Move speed | 6.0 units/sec |
| Movement pattern | Straight down center, slight sine-wave drift (amplitude 0.5, frequency 1.2 Hz) |
| Bullet pattern | 2-bullet burst aimed at player's current position, 0.08s between bursts |
| Fire rate | 1 burst every 1.8s |
| Bullet speed | 7.0 units/sec |
| Score value | 100 |
| Weapon pickup drop % | 8% |
| Bomb pickup drop % | 0% |

**Death behavior:** No special effect. Explodes immediately.

### 1.2 Bomber

| Parameter | Value |
|---|---|
| HP | 3 |
| Move speed | 2.5 units/sec |
| Movement pattern | Slow diagonal drift — enters from upper-left or upper-right, arcs toward center, holds Y=3.0 for 2s, then exits the opposite side |
| Bullet pattern | 5-bullet spread burst, ±40° total arc, aimed downward (not homing) |
| Fire rate | 1 burst every 2.5s |
| Bullet speed | 4.5 units/sec |
| Score value | 300 |
| Weapon pickup drop % | 5% |
| Bomb pickup drop % | 40% |

**Death behavior:** Spawns a bomb pickup at death position with 40% probability. The pickup drifts downward at 1.0 units/sec.

### 1.3 Drone

| Parameter | Value |
|---|---|
| HP | 2 |
| Move speed | 4.5 units/sec |
| Movement pattern | Enters in tight horizontal pair or trio, sweeps across the field in a flat arc (enters left, exits right or vice versa), Y held between 2.5–3.5 |
| Bullet pattern | On death only: fires 3 bullets backward (upward, toward player spawn zone), spread at 0°, +20°, -20° |
| Fire rate | No live fire — death spray only |
| Bullet speed (death spray) | 6.0 units/sec |
| Score value | 200 |
| Weapon pickup drop % | 12% |
| Bomb pickup drop % | 0% |

**Death behavior:** Immediately fires the 3-bullet death spray before despawning. The spray bullets do not have collision lifetime — they persist until off-screen.

### 1.4 Elite

Elites are variants of an existing enemy type (Scout, Bomber, or Drone — one per Elite appearance). The dev should pick the base type per wave (specified in wave script).

| Parameter | Value |
|---|---|
| HP | 2× base type HP |
| Move speed | 1.15× base type speed |
| Movement pattern | Same as base type |
| Bullet pattern | Same as base type |
| Fire rate | 1.3× base type fire rate (interval ÷ 1.3) |
| Bullet speed | Same as base type |
| Score value | 2× base type score value |
| Weapon pickup drop % | 100% guaranteed |
| Bomb pickup drop % | 15% (additive, can drop both) |

**Visual:** Gold tint on the sprite + continuous gold pulse shader (sine-wave brightness, period 0.6s, amplitude +40% brightness). Elite badge marker above the enemy (small gold chevron icon).

---

## 2. Weapon Tier Bullet Patterns

Base fire rate at T1 = 5 shots/sec (0.2s interval). All tier modifiers multiply this rate. Player bullet base speed = 14.0 units/sec.

| Tier | Name | Bullet Count | Spread Angle | Piercing | Homing | Fire Rate Modifier | Visual Color |
|---|---|---|---|---|---|---|---|
| T1 | Pulse | 1 | 0° | No | No | 1.0× | White `#FFFFFF` |
| T2 | Twin | 2 | 8° total (±4°) | No | No | 1.0× | Cyan `#00EEFF` |
| T3 | Spread | 3 | 30° total (0°, ±15°) | No | No | 0.9× | Green `#44FF44` |
| T4 | Lance | 1 | 0° | Yes (pierces all) | No | 1.1× | Yellow `#FFEE00` |
| T5 | Barrage | 4 | 36° total (0°, ±12°, ±24°, staggered 0.04s) | No | No | 0.85× | Orange `#FF8800` |
| T6 | Seeker | 1 + 3 seekers | Lance: 0°; Seekers: 45° arc launch | Lance: Yes | Seekers only | 0.8× | Magenta `#FF00CC` |
| T7 | God Mode | 5 + 4 seekers | 40° total fan; seekers spread 60° | Yes (all bullets) | Seekers only | 0.75× | Red-gold `#FF4400` + gold shimmer |

**Homing seeker behavior:**
- Seekers are launched at +45°/-45°/±22.5° from player heading.
- After 0.3s flight they acquire the nearest enemy and turn toward it at 180°/sec angular speed.
- Seeker speed: 12.0 units/sec.
- Seeker max lifetime: 4.0s.
- Seekers do not pierce.

**T6 detail:** The lance fires on every shot. The 3 seekers fire once every 3 shots (every 3rd shot frame launches the seeker burst alongside the lance).

**T7 detail:** All 5 fan bullets fire every shot. 4 seekers launch every 2 shots.

**Weapon drop:** Pickups advance weapon tier by exactly 1. At T7, weapon pickups are consumed for +500 bonus points instead.

---

## 3. Weapon & Bomb Drop Probabilities (Summary Table)

| Enemy | Weapon Pickup % | Bomb Pickup % | Notes |
|---|---|---|---|
| Scout | 8% | 0% | Standard fodder |
| Bomber | 5% | 40% | Bomb is primary drop |
| Drone | 12% | 0% | Reward for timing the death spray |
| Elite | 100% | 15% | Always drops weapon, may also drop bomb |

**Bomb effect:** Screen-clear. All non-boss enemies on screen are destroyed instantly (their score is awarded, their drops are suppressed). Boss takes 10% of current HP as flat damage. Bomb pickup despawns after 8s if not collected.

---

## 4. Complete Wave Script

**World scroll speed** starts at 2.0 units/sec and increases by 0.15 units/sec per wave (capped at 4.5 for wave 12+).

Spawn timing: "staggered" = 0.4s between each unit unless otherwise noted. "Simultaneous" = all at once within one frame.

---

### Wave 1 — Tutorial Trickle
- **Enemy types:** 4× Scout
- **Formation:** Single file down center, evenly spaced
- **Spawn timing:** Staggered, 1.2s between each
- **Notes:** Easiest. Lets player find fire rhythm.

### Wave 2 — Flanking Pair
- **Enemy types:** 6× Scout
- **Formation:** 2 columns of 3, entering from left edge and right edge simultaneously, converging toward center
- **Spawn timing:** Pairs staggered 0.8s apart (both columns advance in sync)
- **Notes:** Introduces left/right threat.

### Wave 3 — First Bombers
- **Enemy types:** 3× Scout + 2× Bomber
- **Formation:** Scouts enter center-column first (staggered 0.6s). After all scouts are on screen, Bombers enter from upper-left and upper-right simultaneously.
- **Spawn timing:** Scouts first, then Bombers 1.5s after last scout spawns
- **Notes:** Player should take a bomb hit here to understand mechanic.

### Wave 4 — Drone Sweep
- **Enemy types:** 2× Drone + 4× Scout
- **Formation:** Drone pair enters left-to-right sweep at Y=3.0. Scouts trickle down center during the sweep.
- **Spawn timing:** Drones simultaneous at wave start; scouts staggered 0.5s each starting 0.8s in
- **Notes:** First death-spray exposure.

### Wave 5 — V-Formation Push
- **Enemy types:** 9× Scout
- **Formation:** V-formation from top center. Point of V leads, 4 scouts per wing. Wings are 1.0 units apart laterally.
- **Spawn timing:** Simultaneous, V moves as a unit at 5.0 units/sec
- **Notes:** Dense scout wall. Threat spike — punishes passive players.

### Wave 6 — Elite Scout Intro
- **Enemy types:** 1× Elite Scout + 4× Scout + 2× Drone
- **Formation:** Elite Scout enters dead center, scouts fill flanks (2 left, 2 right), drones sweep through at Y=2.8 behind the scouts.
- **Spawn timing:** Elite spawns first; flank scouts 0.6s later; drones 2.0s into wave
- **Notes:** First Elite. Gold pulse cue telegraphs it. Guaranteed weapon drop teaches the mechanic.

### Wave 7 — Bomber Wall
- **Enemy types:** 4× Bomber + 3× Scout
- **Formation:** Bombers in a horizontal row at Y=4.0, equally spaced across X: -4 to +4. Scouts dive down between bomber gaps.
- **Spawn timing:** All 4 bombers simultaneous; scouts staggered 0.7s each, starting 1.0s into wave
- **Notes:** Wide spread fire from bombers creates a kill zone below. Player must dodge and punch through.

### Wave 8 — Drone Murder Row
- **Enemy types:** 6× Drone + 2× Bomber
- **Formation:** 3 drone pairs, stacked vertically (Y=4.0, Y=3.2, Y=2.4), each sweeping opposite direction of the one above. Bombers arc in from sides after drones.
- **Spawn timing:** Drone pairs staggered 1.0s each; bombers 3.0s into wave
- **Notes:** Layered threat. Death sprays from middle drone layer can catch the player dodging bomber spread.

### Wave 9 — Elite Bomber
- **Enemy types:** 1× Elite Bomber + 2× Bomber + 4× Scout
- **Formation:** Elite Bomber enters center-top and holds Y=3.5 for longer (3.5s). Regular bombers flank it. Scouts swarm from top constantly.
- **Spawn timing:** Elite first; regular bombers 1.0s later; scouts stream every 0.9s for 4s
- **Notes:** Elite Bomber has 6 HP. 7-bullet spread burst at 1.3× rate. Guaranteed drop. Use bomb if held.

### Wave 10 — Cross-Formation Assault
- **Enemy types:** 4× Scout + 4× Drone + 2× Bomber
- **Formation:** Scouts in two opposing diagonal lines crossing center (X pattern). Drones sweep left-right through the X zone 1.5s after scouts. Bombers arc through from opposite sides once drones clear.
- **Spawn timing:** Scout diagonals simultaneous; drones 1.5s later; bombers 3.5s in
- **Notes:** Hardest non-elite wave. Three threat layers in sequence.

### Wave 11 — Elite Drone Pack
- **Enemy types:** 2× Elite Drone + 4× Drone + 3× Scout
- **Formation:** Elite drones lead, one sweeping each direction (mirrored), regular drones trail 0.5s behind. Scouts dive down center through the drone traffic.
- **Spawn timing:** Elites simultaneous; regular drones 0.5s after; scouts staggered 0.6s starting 1.0s in
- **Notes:** Elite Drones have 4 HP. Death spray fires 3 bullets each. Two guaranteed drops. This is the final "gear check" wave.

### Wave 12 — Convergence (Pre-Boss)
- **Enemy types:** 6× Scout + 2× Bomber + 2× Drone + 1× Elite Scout
- **Formation:** Everything at once. Scouts in V from top. Bombers from both sides. Drones cross-sweep. Elite Scout down dead center.
- **Spawn timing:** V-scouts simultaneous; bombers 0.5s later; drones 1.5s in; Elite 2.0s in
- **Notes:** Maximum chaos warm-up before boss. Designed to drain bombs and chip HP so boss phase is meaningful.

### Boss Trigger
Wave 12 completion → 3-second pause → world scroll stops → Boss spawns from top center.

**Boss selection:** Randomly select one of the three boss types (Sentinel, Interceptor, Colossus) per run.

---

## 5. Boss Types — 3 Attack Phases Each

**Global boss rules:**
- Bosses are immune to bomb screen-clears (take 10% HP flat damage instead).
- Boss bullets are visually distinct: larger, brighter, and travel at specified speeds.
- Between phase transitions there is a 1.2s pause (no attacks) with a flash effect.
- All boss HP/score values are final numbers, not scaled.

---

### 5.1 Sentinel

A tall, angular gunship. Mid-difficulty. Good first-boss archetype.

**HP:** 1200  
**Score on death:** 15000

**Movement:** Tracks player X position at 2.5 units/sec, capped at X: ±5. Stays at Y=4.0 throughout all phases.

#### Phase 1 (HP: 1200 → 800)
- **Attack:** Fires 3-shot aimed burst at player every 1.5s. Bullet speed 6.0 units/sec.
- **Secondary:** Every 6s, fires a slow horizontal sweeping wall of 8 bullets across X axis from left to right. Wall bullets travel at 3.5 units/sec downward.
- **Telegraph (sweep):** 0.8s before sweep — two orange charge lines extend from left/right wingtips inward. They flash 3 times then fire.

#### Phase 2 (HP: 800 → 400)
- **Attack:** 5-shot burst every 1.1s. Bullet speed 7.0 units/sec.
- **Secondary:** Sweep now fires every 4s, and alternates direction (L→R, then R→L).
- **New:** Every 8s, fires a 3-bullet aimed seeker spread that tracks player for 2.5s.
- **Telegraph (seekers):** 1.0s charge — ship center glows amber, expands to a circle, then fires.

#### Phase 3 (HP: 400 → 0)
- **Attack:** 5-shot burst every 0.8s. Bullet speed 8.5 units/sec.
- **Secondary:** Sweep fires every 3s, now 12 bullets wide.
- **Charge cannon:** Every 7s, fires a single high-speed piercing beam at player's position. Beam travels at 18.0 units/sec, width 0.3 units.
- **Telegraph (beam):** 1.5s — bright white line from ship to bottom of screen (static, shows the path). Line pulses 4× then fires.

---

### 5.2 Interceptor

Fast, aggressive, mobile. Darts around the arena. Higher skill check.

**HP:** 900  
**Score on death:** 18000

**Movement:**
- Phase 1: Slides to random X positions, pausing 1.2s, then dashing (12 units/sec dash, 0.4s). Y stays at 3.8.
- Phase 2: Same pattern but adds Y variation — Y oscillates between 3.0 and 4.5 on a 3s period during dashes.
- Phase 3: Dash speed 18 units/sec, pause only 0.6s, full XY movement within bounds.

#### Phase 1 (HP: 900 → 600)
- **Attack:** Fires a 2-shot aimed burst immediately after stopping at each new X position. Bullet speed 7.0 units/sec.
- **Secondary:** Every 5s, fires a ring of 12 bullets in all directions (360°, even spread). Ring bullet speed 5.0 units/sec.
- **Telegraph (ring):** 0.6s — ship briefly stops moving, pulses teal.

#### Phase 2 (HP: 600 → 300)
- **Attack:** 3-shot burst, bullet speed 8.0 units/sec.
- **Secondary:** Ring now has 16 bullets, fires every 4s, and the ring rotates 15° offset from the previous ring.
- **New:** On every dash, fires a trailing spray of 5 bullets perpendicular to dash direction (like a strafing run). Spray bullet speed 6.5 units/sec.
- **Telegraph (strafe):** Wingtips flash white for 0.3s before dash fires the spray. No extra delay — react or dodge.

#### Phase 3 (HP: 300 → 0)
- **Attack:** 4-shot burst, bullet speed 9.5 units/sec.
- **Secondary:** Ring now 20 bullets, fires every 3s.
- **Strafe spray:** Now 8 bullets per dash.
- **Death dive:** Every 10s, Interceptor charges from its current position straight down toward player Y=0. Fires 6 aimed shots during the dive. Returns to Y=3.8 over 1.5s. During dive, movement speed is 16 units/sec.
- **Telegraph (dive):** 1.2s — ship rotates nose-down, engines flash bright red, then dives.

---

### 5.3 Colossus

Massive, slow, overwhelming firepower. A wall of bullets — the hardest boss.

**HP:** 1800  
**Score on death:** 25000

**Movement:** Extremely slow lateral drift — moves at 1.2 units/sec left/right, reversing at X: ±4.5. Never changes Y (stays at 4.2). Does not track player X.

#### Phase 1 (HP: 1800 → 1200)
- **Attack:** Fires 3 parallel columns of bullets downward (at X: -2, 0, +2 relative to ship center). Each column fires 1 bullet every 0.9s. Bullet speed 5.0 units/sec.
- **Secondary:** Every 8s, releases 6 slow-moving bombs (large red orbs) that drift downward at 2.5 units/sec in a wide spread (X spread ±3.5 from ship center). Contact damage only.
- **Telegraph (bombs):** 1.2s — six launch tubes on ship hull glow red in sequence from left to right, then fire simultaneously.

#### Phase 2 (HP: 1200 → 600)
- **Attack:** Columns expand to 5 (X: -3, -1.5, 0, +1.5, +3 relative). Interval drops to 0.7s. Bullet speed 6.0 units/sec.
- **Secondary:** Bombs now 8, fire every 6s, drift speed 3.5 units/sec.
- **New:** Every 10s, fires a rotating spiral of 8 bullets. The spiral makes 1 full rotation over 2s (bullets staggered 0.25s apart, each 45° offset). Each spiral bullet speed 4.5 units/sec.
- **Telegraph (spiral):** 1.5s — ship emits a clockwise rotating glow ring before spiral fires.

#### Phase 3 (HP: 600 → 0)
- **Attack:** Columns now 7 (spread evenly X: -4.5 to +4.5). Interval 0.5s. Bullet speed 7.5 units/sec.
- **Secondary:** Bombs now 10, fire every 5s.
- **Spiral:** Now fires every 7s, 12 bullets per spiral.
- **Annihilation Beam:** Every 12s, fires a 2.5-unit-wide beam straight down the center of its current X position. Beam speed 20 units/sec, 0.6 units wide, instant on.
- **Telegraph (beam):** 2.0s — a massive red cross-hair reticle appears at ship-center X, extends down to Y=0, pulses 5 times, then fires. This is the most dangerous attack in the game — 2 full seconds to read it and move.

---

## 6. Player Parameters

| Parameter | Value |
|---|---|
| Move speed | 8.0 units/sec |
| Screen bounds X | -6.0 to +6.0 |
| Screen bounds Y | 0.3 to 4.5 |
| Base fire rate (T1) | 5 shots/sec (0.2s interval) |
| Invincibility window after hit | 2.0s |
| Player bullet speed | 14.0 units/sec |
| Player bullet lifetime | 3.0s (despawn if not hit) |

**Scout bullet speed:** 7.0 units/sec  
**Bomber bullet speed:** 4.5 units/sec  
**Drone bullet speed (death spray):** 6.0 units/sec  
**Elite bullet speed:** Same as base type (multiplier 1.0×)

**Bomb pickup:** Collected on contact with player ship. Activation is instant on pickup (no button — bomb is auto-used). Screen-clear effect duration: 0.5s flash, then all enemies die.

**Lives:** 3. No extra lives awarded during the run.

**Lives display:** Top-left HUD, icon-based.

**Weapon tier display:** Top-center HUD, tier number + color ring matching bullet color.

---

## 7. Miscellaneous Balance Notes for Dev

- All bullet-to-player collision uses a sphere radius of 0.18 units on player hitbox (smaller than the ship visual — forgiving hit detection is intentional).
- Boss hitbox is the full visible hull bounding box (no reduction).
- Pickup collection radius: 0.5 units from player center.
- If the player is at T7 and a weapon pickup spawns, display it as a "BONUS" pickup with gold sparkle — it still drifts down and disappears at Y=0. If collected: +500 pts, no tier change.
- Death animation for player: 1.2s explosion, then respawn at X=0, Y=1.0 with 2.0s invincibility.
- On respawn, player weapon tier drops to T1 regardless of current tier.
- Enemy bullets do not have friendly-fire (enemy bullets do not destroy other enemies).
- Boss phases transition mid-fight with no death — boss continues at new phase attack immediately after the 1.2s pause.

---

*End of spec. All values are final unless flagged for playtesting in the Phase 3 review.*
