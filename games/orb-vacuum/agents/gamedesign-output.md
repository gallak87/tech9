# Orb Vacuum — Mechanics Numbers Doc
## Phase 2 Implementation Reference

---

## Player

- **Starting radius:** 1.5 units
- **Min radius (floor):** 0.6 units — player cannot shrink below this regardless of hit severity
- **Max radius (ceiling):** 12.0 units — hard cap, growth stops once reached; player can still absorb orbs for score but size doesn't increase

---

## Absorption Rule

**Condition:** Player absorbs an orb if `player.radius >= orb.radius * 1.1` — i.e. player must be at least 10% larger. Exact same size = no interaction (both just pass). This prevents micro-absorbs that feel cheap and makes the threshold feel clear.

**Growth amount:** Player grows by `orb.radius * 0.25`. Fixed fraction of the absorbed orb's radius — bigger prey = bigger reward, but growth is always sublinear so the player can't rocket to max size off one big orb.

**Score:** +1 per absorb flat. Size of absorbed orb does not affect score. Score is purely a count of absorb events — it's legible at a glance and rewards aggression over cherry-picking large targets.

---

## Shrink Rule

**Condition:** Player is shrunk if `orb.radius >= player.radius * 1.1` — symmetrical with absorption. A larger orb touching the player from below the 10% threshold does nothing (glancing passes).

**Shrink amount:** Player shrinks by `orb.radius * 0.35`. Slightly steeper than growth rate so hits feel meaningful. Getting hit by a very large orb is a serious setback.

**Invincibility window:** 1.2 seconds after being hit. During this window the player flashes (opacity pulse at ~8Hz) and cannot be shrunk again. This window prevents rapid cascade-shrinking from a cluster of large orbs. Score is unaffected — player can still absorb during the window.

---

## Orb Spawning

**Initial orb count:** 12 orbs pre-populated in the arena at game start, placed at random positions inside the boundary (not just at the wall), distributed across the full size range.

**Spawn rate at start:** 1.5 orbs/second. Orbs spawn continuously; rate escalates over time (see Difficulty Escalation).

**Orb size range at spawn:**
- Min spawn radius: 0.4 units
- Max spawn radius: 4.0 units at game start (this ceiling grows with difficulty)

**Size distribution:** Weighted toward smaller orbs using a square-root distribution — `r = min + (max - min) * Math.sqrt(Math.random())`. This produces a natural lava-lamp spread where small orbs are common and large ones are rare but present. No special sizing relative to player — the escalation system handles the difficulty curve via the large-orb ceiling rising, not by targeting player size.

**Spawn position:** Exactly on the arena boundary wall — `ARENA_HALF` distance from center, random angle. Orbs spawn fully outside contact range; a tiny 0.5-unit inset offset is fine to prevent wall clipping but spawn point is effectively the wall edge.

**Drift behavior:**
- Direction: inward toward arena center with ±25° random angle offset. Not purely inward, not random walk — has clear directionality but never beelines straight at the player.
- Speed: `0.8 + Math.random() * 0.6` units/second at game start (range: 0.8–1.4). Speed escalates (see below).
- No steering, no homing — pure linear drift after spawn. Orbs do not accelerate or decelerate.

---

## Difficulty Escalation

**Interval:** Every 30 seconds. Confirmed.

**Changes per tick:**

| Parameter | Per-tick change |
|---|---|
| Spawn rate | +0.4 orbs/second |
| Max spawn radius ceiling | +0.5 units (more large orbs can appear) |
| Orb drift speed range | +0.15 units/second added to both min and max |

**Max difficulty reached at:** Tick 10 (5 minutes in). After tick 10 all values are clamped — no further escalation. Parameters do NOT continue growing past these caps:

| Parameter | Max value |
|---|---|
| Spawn rate | 5.5 orbs/second |
| Max spawn radius ceiling | 9.0 units |
| Orb drift speed range | 2.3–2.9 units/second |

At max difficulty the arena is dense and fast-moving. Large orbs that can instantly punish a mid-sized player are common. The player at or near max radius (12.0) is relatively safe but a shrunk player is in serious danger.

---

## Arena

**Size:** Confirmed — `ARENA_HALF = 30`, so 60×60 units. This is the right scale for the opening feel; the arena feels spacious at start, crowded at max difficulty.

**NPC orb wall behavior:** Despawn on contact with the wall. No bouncing, no wrapping. Rationale: bouncing creates clustered chaos near walls that's hard to read; wrapping breaks the "bounded arena" feel. Orbs have a fixed inward trajectory — if one makes it all the way to the far wall without being absorbed, it's done its job and should quietly vanish.

**Max orbs alive at once:** 80 orbs. If the live count hits 80, spawning pauses until count drops below 70 (hysteresis band prevents flicker-spawning). At max difficulty the spawn rate will fight this cap regularly, creating natural density pressure.

---

## Summary of Key Numbers

```
Player start radius:    1.5
Player min radius:      0.6
Player max radius:      12.0

Absorb threshold:       player >= orb * 1.1
Growth per absorb:      orb.radius * 0.25

Shrink threshold:       orb >= player * 1.1
Shrink per hit:         orb.radius * 0.35
Invincibility window:   1.2s

Initial orb count:      12
Spawn rate (start):     1.5 /s
Spawn radius (start):   0.4 – 4.0
Drift speed (start):    0.8 – 1.4 u/s

Escalation interval:    30s
Escalation ticks:       10 (5 min to max)
Spawn rate (max):       5.5 /s
Spawn radius (max):     0.4 – 9.0
Drift speed (max):      2.3 – 2.9 u/s

Max live orbs:          80
Arena half-size:        30 (60x60 total)
```
