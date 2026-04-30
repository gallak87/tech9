# Orb Vacuum — History

## What Was Built vs What Was Specced

### Core mechanics — matched
All scope constraints from CONCEPT.md shipped: WASD horizontal movement, size-based absorption, size penalty on hit (no death), running score counter, procedural spawning with difficulty escalation, bloom visuals, pulse/flash feedback. No audio, no persistence, no mobile controls — all explicit out-of-scope items stayed out.

### Bloom — matched
Art spec recommended `UnrealBloomPass` over per-orb `PointLight` for flat cost regardless of orb count. Shipped exactly that: `strength: 1.2, radius: 0.6, threshold: 0.4`.

### HUD — matched
Score element + size-bar-fill landed per art spec. Orbitron font loaded from Google Fonts. Hit flash overlay injected as a `<div>` with red rgba background. All CSS values from art spec were used verbatim.

### Orb color tiers — minor deviation
Art spec defined tiers relative to player radius (tiny < 40%, small 40–80%, near 80–99%, threat 101–150%, danger > 150%) and gave specific hex values (`#39ff14`, `#b0ff12`, `#ffee00`, `#ff6a00`, `#ff1a1a`). Shipped code uses the same tier thresholds but different hex values — brighter/more saturated greens and reds that read better under bloom. The tier system and logic are identical; only palette was tuned.

### Arena — matched
`ARENA_HALF = 30` as specced. Wireframe walls via `EdgesGeometry` + `LineBasicMaterial` at opacity 0.35. `GridHelper` floor. `FogExp2` density 0.018. `AmbientLight` at 0.08 intensity. No directional lights, no point lights.

### Wall behavior — matched
Orbs despawn on wall contact (no bounce, no wrap), as specced.

---

## Key Decisions That Changed During Implementation

### Player start radius: 1.5 → 0.6
Gamedesign specced `PLAYER_RADIUS_START = 1.5`. Shipped value is `0.6`. This was changed during balance tuning because at 1.5 the player started large enough to immediately eat most of the pre-populated food orbs without moving, removing early tension. At 0.6, the player must work to grow, and the early arena feels genuinely threatening.

### Player min radius: 0.6 → 0.4
Gamedesign specced min floor of `0.6`. Shipped as `0.4`. Combined with the lower start radius, this gives more room to shrink before hitting the floor.

### Spawn balance: absolute sizing → relative-to-player sizing
This is the most significant deviation. Gamedesign specced absolute spawn radii (0.4–4.0 units) with a square-root distribution, and explicitly noted "no special sizing relative to player." Shipped code uses a split food/threat model:

- **65% food:** `playerRadius * (0.2 + Math.random() * 0.6)` — always clearly smaller than player
- **35% threat:** `playerRadius * 1.4` to `min(playerRadius * 3.5, spawnMaxRadius)` — always clearly larger

The absolute sizing spec produced a broken first experience: with `PLAYER_RADIUS_START = 1.5` and orbs spawning up to 4.0 units, most initial orbs were threats. The fix required both lowering start radius and switching to relative spawn sizing so the food/threat ratio is preserved regardless of player size.

### Initial orb count and placement: 12 random → 28 (20 food + 8 threats)
Gamedesign specced 12 orbs placed at random positions. Shipped as 28 orbs (20 food, 8 threats) with minimum distance constraints: food must be ≥5 units from origin, threats ≥8 units. This ensures the player has a clear safe zone to orient in before being pressured.

### Spawn rate at start: 1.5/s → 2.0/s
Minor increase. At 1.5/s with relative sizing and the player growing quickly early on, the arena thinned out mid-game. 2.0/s keeps density up without hitting the 80-orb cap prematurely.

### Camera: fixed distance → scales with player radius
Not specced at all — CONCEPT.md deferred camera behavior to dev, and neither gamedesign nor art mentioned it. Shipped implementation uses `CAM_DISTANCE = Math.max(10, playerRadius * 8 + 6)`, ranging from roughly 10.8 units (tiny player) to 102 units (max size player). A fixed camera distance of ~22 would have been unusable: a max-size player (radius 12) fills the entire view, and a tiny player (radius 0.6) is a pixel.

### invincibility flicker implementation
Art spec said "opacity pulse at ~8Hz during invincibility window." Shipped as `Math.sin(gameTime * Math.PI * 16) > 0 ? 1.0 : 0.3` — binary flip rather than smooth sine, which reads more clearly as a flicker at game speed.

---

## Final Numbers

```
Player start radius:    0.6   (specced: 1.5)
Player min radius:      0.4   (specced: 0.6)
Player max radius:      12.0

Absorb threshold:       player >= orb * 1.1
Growth per absorb:      orb.radius * 0.25
Shrink threshold:       orb >= player * 1.1
Shrink per hit:         orb.radius * 0.35
Invincibility window:   1.2s

Initial orb count:      28 (20 food, 8 threats)   (specced: 12 random)
Spawn rate (start):     2.0 /s                     (specced: 1.5 /s)
Spawn method:           relative to player radius   (specced: absolute)
  Food:                 20–80% of player radius
  Threat:               140–350% of player radius, capped at spawnMaxRadius
Food/threat ratio:      65% / 35%

Spawn rate (max):       5.5 /s
Max spawn radius cap:   0.4 – 9.0 (absolute ceiling; relative method still used)
Drift speed (start):    0.8 – 1.4 u/s
Drift speed (max):      2.3 – 2.9 u/s
Escalation interval:    30s
Escalation ticks:       10 (5 min to max)

Max live orbs:          80 (hysteresis at 70)
Arena half-size:        30 (60×60 total)

MOVE_SPEED:             60
TURN_SPEED:             3.2
DRAG:                   6
Camera distance:        max(10, playerRadius * 8 + 6)
Camera elevation:       π/5.5 (~33° above horizon)

Bloom strength:         1.2
Bloom radius:           0.6
Bloom threshold:        0.4
```
