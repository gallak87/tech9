# Orb Vacuum — Art Spec (Phase 2)

## Color Palette

### Player Orb
- Base color: `#00e5ff` (cyan-white, slightly ice-blue)
- Emissive: `#00b8d4`
- The player reads instantly as "you" — distinct from every NPC tier

### NPC Orbs — Size Tiers

Danger is communicated through color temperature: **safe = cool/green, dangerous = hot/red**. The further into red, the more threatening.

| Tier | Size relative to player | Base color | Emissive | Meaning |
|---|---|---|---|---|
| Tiny | < 40% of player radius | `#39ff14` | `#1a7a00` | Very safe, eat freely |
| Small | 40–80% of player radius | `#b0ff12` | `#5c8000` | Safe |
| Near | 80–99% of player radius | `#ffee00` | `#998700` | Caution — almost same size |
| Threat | 101–150% of player radius | `#ff6a00` | `#993d00` | Will shrink you — avoid |
| Danger | > 150% of player radius | `#ff1a1a` | `#990000` | Very dangerous |

The "near" tier (yellow) is intentional — it creates the tense near-miss moment when you're almost big enough to eat something.

### Arena
- Floor grid: `#1a1a2e` lines on transparent — rendered via `GridHelper`, color `0x1a1a2e`, secondary color `0x0d0d1a`, opacity `0.6`
- Wall wireframes: `#0d2b4f`, opacity `0.35` (barely visible cage, just enough to read the boundary)
- Scene clear color: `#020408` (near-black with a hint of deep navy, not pure black)
- Fog: `THREE.FogExp2`, color `0x020408`, density `0.018` — orbs fade at distance, reinforces the arena feeling closed in

### HUD
- Score text color: `#ffffff` with `text-shadow: 0 0 12px #00e5ff, 0 0 24px #00e5ff`
- Font family: `'Orbitron', monospace` — load from Google Fonts, fallback `monospace`
- Secondary/label text: `#4dd0e1` (desaturated cyan)

---

## Orb Materials

All orbs use `MeshStandardMaterial`. Reason: supports emissive properly and reads correctly under HDR bloom. `MeshPhongMaterial` emissive is additive on top of diffuse and looks washed out at high emissiveIntensity.

### Player Orb
```js
{
  color: 0x00e5ff,
  emissive: 0x00b8d4,
  emissiveIntensity: 1.8,
  roughness: 0.15,
  metalness: 0.05,
  transparent: false,
}
```
Low roughness gives a glassy, liquid look. Near-zero metalness keeps it from looking chrome — it should look like a glowing water droplet.

### NPC Orbs (all tiers, same material structure — different color values)
```js
{
  color: <tier base hex>,
  emissive: <tier emissive hex>,
  emissiveIntensity: 1.4,   // slightly dimmer than player so player always pops
  roughness: 0.2,
  metalness: 0.0,
}
```

NPC orbs use the same material type as the player. The visual hierarchy (player always most prominent) is achieved purely through emissiveIntensity differential (1.8 vs 1.4) and the cyan hue being unique.

### Bloom/Glow Approach

**Recommendation: `UnrealBloomPass` from Three.js post-processing.**

Justification: The game has 20–80 orbs on screen at once. Faking bloom with a `PointLight` child on every orb means 20–80 dynamic lights — that's a per-fragment cost multiplied by light count, which tanks on integrated GPUs at orb counts > 30. `UnrealBloomPass` is one fullscreen pass, cost is flat regardless of orb count.

Suggested bloom parameters:
```js
UnrealBloomPass({
  strength: 1.2,
  radius: 0.6,
  threshold: 0.4,  // only bright emissive surfaces bloom, floor grid stays clean
})
```

The `threshold: 0.4` is important — it prevents the dark floor grid from softly haloing, keeping the floor crisp while orbs glow hard.

---

## Visual Feedback

### Absorb Pulse (player eats an orb)
- **Scale spike**: player orb scales from `1.0` to `1.12` over `80ms`, then eases back to its correct size over `180ms`. Total duration: `260ms`.
- **Color flash**: emissiveIntensity briefly spikes from `1.8` to `3.5` at the peak of the scale spike (`80ms` in), then returns to `1.8` over the following `180ms`.
- **Orb death effect** (the eaten orb): scale it from `1.0` to `0.0` over `120ms` with an ease-in — it implodes into the player. Do NOT fade opacity; just collapse the scale. Fast and satisfying.
- No particle burst — keeps the scene clean and the frame budget low.

### Hit Flash (player is shrunk by a larger orb)
- **Screen overlay**: inject a `<div id="hit-flash">` as an absolutely-positioned fullscreen overlay. CSS:
  ```css
  #hit-flash {
    position: fixed;
    inset: 0;
    background: rgba(255, 30, 0, 0.28);
    pointer-events: none;
    opacity: 0;
    z-index: 10;
  }
  ```
  On hit: animate opacity `0 → 1` over `60ms`, then `1 → 0` over `320ms`. Total: `380ms`.
- **Player orb**: simultaneously flash emissive color from `0x00b8d4` to `0xff1a1a` over `60ms`, return to `0x00b8d4` over `200ms`. This makes the orb itself react even if the player is looking away from the screen edge.
- No screen shake — the concept says "gut-punch but not punishing." Shake reads as punishing.

### Orb Spawn
- No special effect. Orbs appear at the arena boundary and immediately exist. The spawn rate is high enough that drawing attention to each spawn would be noise.

---

## HUD

### Score Display
```css
#score {
  position: fixed;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Orbitron', monospace;
  font-size: 64px;
  font-weight: 700;
  color: #ffffff;
  text-shadow:
    0 0 8px #00e5ff,
    0 0 20px #00e5ff,
    0 0 48px #0077aa;
  letter-spacing: 0.08em;
  user-select: none;
  pointer-events: none;
}
```

The double text-shadow (tight + loose) is the cheap CSS version of bloom. On dark backgrounds it reads as genuinely glowing text without any canvas work.

### Secondary HUD Elements
One additional element: a **size indicator** — a thin horizontal bar below the score showing the player's current radius relative to the session maximum. This tells the player at a glance whether they're growing or shrinking without adding a number they have to interpret.

```css
#size-bar-container {
  position: fixed;
  top: 108px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
}
#size-bar-fill {
  height: 100%;
  background: #00e5ff;
  box-shadow: 0 0 6px #00e5ff;
  border-radius: 2px;
  transition: width 0.2s ease;
}
```

Keep it small and centered directly under the score — it's ambient feedback, not a focal point.

---

## Arena Visuals

### Floor
Use Three.js `GridHelper(arenaSize, arenaSize / 5, 0x1a1a2e, 0x0d0d1a)`. Position it at `y = 0`. The player floats slightly above it (`y = playerRadius`).

Do NOT use a solid plane mesh under the grid — the grid lines on pure void is the look. A solid floor would read as a flat surface and break the floaty-lava-lamp feel.

### Walls
Four wireframe planes forming the arena boundary. Use `EdgesGeometry` on a `PlaneGeometry`, with `LineBasicMaterial`:
```js
{
  color: 0x0d2b4f,
  transparent: true,
  opacity: 0.35,
}
```
Walls are barely visible — they exist to catch peripheral vision and tell the player "this is the edge," not to dominate the scene.

### Background / Fog
- `renderer.setClearColor(0x020408)`
- `scene.fog = new THREE.FogExp2(0x020408, 0.018)`

The exponential fog means the far wall fades into the void at mid-range orb counts. At high orb counts (late game, arena dense), the fog gives depth and prevents the far wall from feeling like a hard boundary.

### Ambient Particles / Background Detail
**None.** Keep it clean. Every extra element competes with the orbs for attention, and the orbs are already the entire visual language. The dark void + fog + grid is exactly enough context. Adding particles would push the scene toward "space screensaver" and away from "hypnotic arena."

### Lighting
One `AmbientLight(0xffffff, 0.08)` — just enough to prevent the dark sides of orbs from going fully black, which would make them look flat. The emissive material does the heavy lifting; ambient is a safety net.

No directional lights. No point lights (see bloom reasoning above). The glowing look comes entirely from emissive + bloom pass.
