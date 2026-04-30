# Trash Day — Mechanics Spec (Phase 2 input)

## Truck Movement

| Parameter | Value |
|-----------|-------|
| Forward speed | 8 units/sec |
| Reverse speed | 4 units/sec (S key included) |
| Turn rate | 60 degrees/sec |
| Turn style | Tank — A/D rotate in place, no lateral drift |
| Speed during arm animation | 0 — truck is locked while arm swings |

Turn rate and forward speed are both fixed values in v1. No acceleration ramp — the truck moves at full speed the instant a key is held.

Reverse is included. Kids will overshoot cans constantly; reverse lets them correct without requiring a 180-degree turn. Cap it at half forward speed so it feels like backing up, not racing backward.

---

## Road Generation

| Parameter | Value |
|-----------|-------|
| Road width | 12 units |
| Segment length | 40 units |
| Bend type | Fixed direction offset per segment — no smooth curves |
| Max bend angle per segment | 25 degrees |
| Segments active at once | 10 |
| Recycle method | Pool of 10 segments; when a segment's far end is more than 1 segment behind the truck, detach it, reposition it at the front of the road chain, and re-populate it with new houses and cans |

### How bends work

Each segment is a flat rectangular road quad placed end-to-end. When a new segment is appended, it is rotated by a bend angle randomly chosen from {-25, -15, 0, 0, 15, 25} degrees relative to the previous segment's heading. Zero appears twice to bias toward straighter roads at low scores. Segments are rigid — no bezier curves. The road looks like a track with hard corners, which reads clearly at low-poly toy scale.

The road is built in world space by chaining segment transforms: each segment's start position and heading is derived from the previous segment's end position and heading. Store each segment as `{ position: Vector3, heading: number (radians), mesh: Mesh }`.

---

## Can Spawning

| Parameter | Value |
|-----------|-------|
| Curb placement | Both sides — one can on the left curb and one on the right curb per spawn event |
| Base cans per segment | 2 (one each side) |
| Curb offset from road center | 7 units (just past road edge) |
| Can spacing along segment | Cans spawn at a fixed point 20 units from the segment's start (midpoint) |
| Starting density | 2 cans per segment (1 left, 1 right) |
| Density increase | Every 10 cans collected, add 1 additional can per segment |
| Max cans per segment | 6 |
| Placement jitter | ±2 units along-road, ±0.5 units cross-road — applied per can to break uniformity |

### Density mechanics detail

At 0–9 cans collected: 2 cans per segment (1L + 1R).
At 10–19: 3 cans per segment (add a second can on one side, alternating L/R each segment).
At 20–29: 4 cans per segment (2L + 2R, staggered along segment at 15u and 28u from start).
At 30–39: 5 cans per segment.
At 40+: 6 cans per segment — cap, never increases further.

When density exceeds 2, additional cans are spaced evenly along the segment's length rather than all at midpoint. At 6 cans, spacing is every ~6 units starting 8 units from segment start.

---

## Pickup Mechanic

| Parameter | Value |
|-----------|-------|
| Proximity radius | 5 units (3D distance from truck origin to can origin) |
| Prompt display | A bold "SPACE" label appears above the nearest in-range can when truck enters radius |
| Pickup trigger | Spacebar — only works if truck is within radius of at least one can |
| Pickup target | Nearest can within radius if multiple overlap |
| Animation lockout | Yes — truck movement is frozen for the full arm animation |
| Arm animation duration | 0.8 seconds |
| Can disappears | At the start of the animation (frame 0), not at the end — instant visual feedback |
| Particle burst | Fires at frame 0, coinciding with can disappearance |
| Score increment | At frame 0 — score ticks up immediately when Space is pressed |

The lockout is intentional. 0.8 seconds is short enough to not frustrate a kid, and freezing the truck lets the camera stay still so the arm swing reads clearly. If Space is pressed while not in range of any can, nothing happens — no feedback, no penalty.

---

## Difficulty Curve

Only two values change as score increases: **bend frequency** and **truck forward speed**. Can density is handled by the spawning rules above.

| Cans Collected | Forward Speed | Bend Angle Pool |
|---------------|--------------|-----------------|
| 0–9 | 8 units/sec | {0, 0, 0, 15, 25} — mostly straight |
| 10–19 | 8 units/sec | {-15, 0, 0, 15, 25} — balanced |
| 20–29 | 9 units/sec | {-25, -15, 0, 15, 25} — all angles equal |
| 30–39 | 9 units/sec | {-25, -25, -15, 15, 25, 25} — bias toward sharp |
| 40+ | 10 units/sec | {-25, -15, 15, 25} — never straight |

Speed increases are small and infrequent — the goal is a gentle sense of momentum growth, not a frantic racing game. At age 3–6, the difficulty ceiling is low; 10 units/sec and twisty bends is enough to feel challenging without being frustrating.

Turn rate never changes. The truck always turns at 60 degrees/sec regardless of score — consistent control feel is more important than mechanical punishment.

---

## Score Display

Format: `🗑️ 12` — trash can emoji followed by the number.

Position: Top-left corner, 24px padding from edge.
Font: System sans-serif, bold, 48px, white with a 2px black text-shadow for legibility on any road color.
Implementation: HTML overlay div positioned absolute over the canvas, updated via `element.textContent` each frame. No Three.js canvas text.

At pickup, the number increments by exactly 1. No multipliers, no bonus ticks, no streak system in v1.

---

## Entities Summary

### Truck
- **Mesh:** Cab box + hopper box + arm pivot group (single pivot bone). Assembled as a Three.js Group.
- **Origin:** Center-bottom of the cab.
- **Properties:** `position` (Vector3), `heading` (radians), `speed` (current units/sec), `isAnimating` (bool).
- **Controls:** W = forward, S = reverse, A = rotate left, D = rotate right. No diagonal movement.
- **Camera:** Third-person, fixed offset behind and above truck. Offset: 0 back, 8 up, 12 behind (in truck-local space). Camera lerps toward target each frame at factor 0.1 for soft follow.

### Road Segment
- **Mesh:** Flat box, 12 units wide × 40 units long × 0.2 units tall. Single color (gray or asphalt).
- **Properties:** `position` (Vector3 — start of segment), `heading` (radians), `cans` (array of TrashCan refs), `distanceBehindTruck` (computed each frame).
- **Pool:** 10 segments, recycled when behind truck.

### House
- **Mesh:** Two boxes — body + roof prism. Attached to road segment, not independently pooled.
- **Properties:** `side` (left or right), `position` (world Vector3, placed 14–18 units from road center).
- **One house per segment per side** — 2 houses per segment total.
- **Recycled with its parent segment.**

### Trash Can
- **Mesh:** Cylinder (8-sided, low poly). Lid is a slightly wider flat cylinder on top.
- **Properties:** `position` (Vector3), `collected` (bool), `segment` (parent segment ref).
- **State:** Visible until Space is pressed within range — then removed from scene at frame 0 of pickup.
- **No physics.** Cans are static until collected.

### Pickup Prompt
- **Not a 3D entity.** HTML div that appears above the nearest in-range can, projected to screen space via `camera.project()` each frame.
- **Content:** Bold "SPACE" text with a soft background pill.
- **Visible when:** Truck is within 5 units of any can and `isAnimating` is false.

### Particle (Trash Confetti)
- **Count per burst:** 20 particles.
- **Mesh:** Each particle is a small flat box (0.3 × 0.3 × 0.1 units), randomized rotation.
- **Colors:** Pulled from a set of 6 bright colors — red, yellow, green, cyan, orange, magenta.
- **Behavior:** On spawn, each particle gets a random velocity (outward from can position, slight upward bias). Gravity applied at −9.8 units/sec². Lifetime: 1.2 seconds. Fade out linearly from 0.8s to 1.2s via material opacity.
- **Pool:** 60 particle objects (3 bursts worth) recycled. No GC pressure.
- **No collision.** Particles pass through road and houses.

### Truck Arm (sub-entity of Truck)
- **Mesh:** Single elongated box, child of a pivot Group attached to the truck's right side.
- **Pivot origin:** At the truck body — arm rotates outward (positive Z-axis rotation in local space).
- **Rest angle:** 0 degrees (flush against truck side).
- **Extended angle:** 90 degrees (pointing straight out).
- **Animation:** Tween from 0 → 90 → 0 degrees over 0.8 seconds. Use a simple sine ease — fast out, slow return. No external tween library; implement with a timer and `Math.sin(t * Math.PI)` where t is 0→1.

---

## State Machine

```
DRIVING
  → [Space pressed + can in range] → PICKUP_ANIM
  → [no input] → DRIVING

PICKUP_ANIM (0.8 sec)
  → [timer expires] → DRIVING
  [movement locked, arm animating, score already incremented, can already removed]
```

That's it. Two states. No menu, no pause, no game over.
