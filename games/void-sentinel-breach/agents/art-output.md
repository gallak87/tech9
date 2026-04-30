# Agent: art
**Game:** Void Sentinel: Breach
**Phase:** 1 — Art Spec

---

## 1. Visual Style Decision

**Clean digital sci-fi illustration on a cold void — "deep space arcade gothic."**

All sprites are clean digital sci-fi illustrations rendered at high resolution (256×256 or 512×512 canvas). The style uses sharp crisp edges, detailed hull plating, smooth color gradients, hard rim lighting, and strong readable silhouettes that hold up as THREE.Sprite billboards at Z-distance. The palette is cold dark sci-fi base (near-black void, deep blue-grey metal) shattered by saturated neon accent colors: electric cyan, hot magenta, acid yellow, plasma orange. Enemies read as hostile machinery — angular, insectoid, asymmetric. The player ship reads as disciplined and fast — swept wings, glowing engine core. Bosses are enormous and architecturally complex, filling half the screen at close range. Every entity has a strong silhouette that reads at distance. Backgrounds are dark enough that neon bullets and bloom are the dominant light sources in any frame.

Reference mood: Everspace ship design's crisp rendered detail + FTL's strong readable silhouettes + modern indie shooter concept art — dark, high contrast, neon-lit, rendered rather than pixelated.

---

## 2. Color Palette

### Entities

| Entity | Primary | Accent / Glow | Dark Fill |
|---|---|---|---|
| Player ship | `#1A9FFF` (ice blue) | `#00E5FF` (cyan engine glow) | `#0A1A2E` (hull shadow) |
| Scout | `#FF3060` (hot crimson) | `#FF6090` (pink rim) | `#1A0510` |
| Bomber | `#8B30FF` (deep violet) | `#C070FF` (lavender glow) | `#120818` |
| Drone | `#00FF99` (toxic green) | `#80FFD0` (pale mint glow) | `#001A0D` |
| Elite | `#FFD700` (gold) | `#FFEE80` (gold pulse) | `#1A1000` |
| Sentinel boss | `#00BFFF` (deep sky) | `#60DFFF` (homing lock glow) | `#001830` |
| Interceptor boss | `#FF6B00` (plasma orange) | `#FFAA40` (sweep trail) | `#1A0800` |
| Colossus boss | `#CC00FF` (ultra-violet) | `#FF40FF` (spread bloom) | `#130020` |

### Bullet Tiers (T1 through T7 — escalating power progression)

| Tier | Color | Glow | Read |
|---|---|---|---|
| T1 | `#80CFFF` | `#B0E8FF` | Pale ice — starter, subtle |
| T2 | `#40FFFF` | `#90FFFF` | Cyan — clearly upgraded |
| T3 | `#40FF80` | `#90FFB0` | Acid green — spread, energetic |
| T4 | `#FFFF00` | `#FFFF80` | Yellow — piercing, sharp |
| T5 | `#FF9900` | `#FFCC60` | Orange — barrage, hot |
| T6 | `#FF4060` | `#FF8090` | Crimson — seekers, dangerous |
| T7 | `#FF00FF` | `#FF80FF` | Pure magenta — godtier, blinding |

Enemy bullets: `#FF2020` (enemy red) with `#FF6060` glow — always readable as threat vs player shots.

### World / Environment

| Element | Color |
|---|---|
| Terrain plane (distant) | `#0D1520` (near-black blue-grey) |
| Terrain grid lines | `#1A3A5A` (dim steel blue) |
| Cloud layer 1 (mid, slow) | `#0A2040` (deep ocean) |
| Cloud layer 2 (near, fast) | `#142840` (slightly lighter) |
| Atmosphere haze | `#061020` (void black with blue tint) |
| Star field | `#FFFFFF` at 15–40% opacity scatter |

### HUD

| Element | Color |
|---|---|
| Score text | `#FFFFFF` |
| Score glow | `#00E5FF` |
| Weapon tier active | `#FFD700` |
| Weapon tier inactive pips | `#2A3A5A` |
| Lives (filled) | `#FF3060` |
| Lives (empty) | `#2A1020` |
| Bomb count (active) | `#C070FF` |
| Bomb count (empty) | `#201030` |
| Boss health bar fill | `#FF3060` (phase 1) → `#FF6B00` (phase 2) → `#FF00FF` (phase 3) |
| Boss health bar bg | `#1A0010` |
| Boss health bar border | `#FF40FF` |

---

## 3. Sprite Dimensions

### Player Ship
- Texture: `256×256`
- World-space scale: `2.0 × 2.0` Three.js units
- Note: Player occupies bottom-center of screen, ship faces camera in billboard mode; swept-wing silhouette should read clearly at this scale.

### Enemies

| Entity | Texture | World Scale | Notes |
|---|---|---|---|
| Scout | `256×256` | `1.2 × 1.2` | Small, fast — tight silhouette |
| Bomber | `256×256` | `2.2 × 2.2` | Bulky, rounded — reads as a tank |
| Drone | `256×256` | `1.0 × 1.0` | Smallest enemy, swarm unit |
| Elite | `256×256` | `1.6 × 1.6` | Same slot as Scout/Bomber but gold aura adds apparent size |

### Bosses

| Entity | Texture | World Scale | Notes |
|---|---|---|---|
| Sentinel | `512×512` | `5.0 × 5.0` | Should feel oppressive at mid-Z distance |
| Interceptor | `512×512` | `4.5 × 4.0` | Wider than tall — swept lateral wings |
| Colossus | `512×512` | `7.0 × 6.0` | Largest entity in the game, screen-filling at close range |

### Bullets

All bullet tiers share one texture resolution, individually colored via material color tint at runtime:
- Texture: `64×64`
- World Scale: `0.25 × 0.6` (portrait oval — reads as a shot, not a dot)
- T7 exception: `0.3 × 0.8` (slightly larger, reinforces godtier feel)
- Enemy bullets: same `64×64`, `0.2 × 0.5` — marginally smaller than player shots for readability

### Explosion
- Texture: `256×256`
- World Scale: varies by entity killed — see below
- Animation: 6-frame sprite sheet (6 columns, 1 row) at `1536×256` total
- Alternatively for Phase 4 MVP: single frame explosion sprite, scale-out via Tween over 400ms
- Enemy explosion scale: `1.5 × 1.5` at spawn → `3.0 × 3.0` at end of tween
- Boss explosion scale: `4.0 × 4.0` → `10.0 × 10.0`, orange-to-white bloom chain (3 sequential explosions)

### Pickups

| Entity | Texture | World Scale | Notes |
|---|---|---|---|
| Weapon pickup | `128×128` | `0.9 × 0.9` | Rotating glow orb with lightning arc motif |
| Bomb pickup | `128×128` | `1.0 × 1.0` | Slightly larger — purple crystalline bomb shape |

---

## 4. Bloom / Post-Processing Parameters

### UnrealBloomPass Values

```js
// Base gameplay — bullets and engine glows pop, world stays dark
bloomPass.strength  = 0.9;
bloomPass.radius    = 0.6;
bloomPass.threshold = 0.3;

// Boss phase 3 — ramp up for climax
bloomPass.strength  = 1.4;
bloomPass.radius    = 0.8;
bloomPass.threshold = 0.2;

// Bomb blast moment (500ms pulse then revert)
bloomPass.strength  = 2.5;
bloomPass.radius    = 1.0;
bloomPass.threshold = 0.0;
```

Animate bloom parameters with a simple lerp when transitioning between states. Do not hard-cut bloom values — it reads as a flash glitch.

### Material Assignments

**MeshBasicMaterial (unlit — always exceeds bloom threshold, never affected by scene lighting):**
- All bullet sprites (player and enemy)
- All explosion sprites
- Pickup sprites (weapon, bomb)
- Engine glow geometry on player and enemies
- Elite gold-pulse emitter
- Boss charge-cone telegraph geometry
- HUD elements

**MeshStandardMaterial (lit — affected by scene, contributes to bloom only if emissive is set):**
- Terrain plane (dark, no emissive)
- Cloud layer planes (dark, slight emissive for volumetric feel: `emissive: #0A2040`, `emissiveIntensity: 0.3`)
- Player ship hull (emissive on engine area: `emissive: #00E5FF`, `emissiveIntensity: 1.5`)
- Enemy hulls (emissive on weapon mounts and engine exhausts)
- Boss bodies (emissive on attack nodes, ramp emissiveIntensity per phase)

---

## 5. Visual Feedback Specs

### Player Hit Effect
- **Screen flash:** White vignette overlay, `opacity 0.0 → 0.6 → 0.0`, duration 180ms, CSS `mix-blend-mode: screen` on overlay div
- **Ship flash:** Toggle player sprite `material.color` between `#FFFFFF` and `#1A9FFF` at 60ms intervals, 4 cycles (240ms total)
- **Camera shake:** ±0.3 world units on X and Y, 8 pulses over 300ms, exponential damping
- **Weapon tier drop:** Brief HUD pulse — tier indicator flashes red for 400ms

### Enemy Death Effect
- Spawn explosion sprite at entity position, scale `1.5 → 3.0` over 400ms
- Material opacity `1.0 → 0.0` over final 150ms of the 400ms window
- Enemy sprite itself: scale to 0 over 80ms simultaneously (fast collapse)
- Drone death additionally spawns 3 enemy bullets at death position (per design spec)

### Weapon Tier-Up Effect
- **Pickup contact:** HUD tier number slams to new value with scale punch (1.0 → 1.8 → 1.0, 250ms)
- **Screen edge glow:** Cyan vignette pulse on screen edges, 300ms fade
- **Ship flash:** `#00E5FF` flash on player sprite, 2 cycles at 80ms each
- **Audio:** tier-up fanfare (handled by audio agent) pairs with these visuals

### Bomb Blast Effect
- **Frame 0–100ms:** Bloom ramps to max (strength 2.5, threshold 0.0)
- **Frame 0–80ms:** White radial flash expands from player position outward (CSS radial-gradient overlay, `opacity 0 → 1 → 0`)
- **Frame 50–200ms:** All on-screen enemies and bullets run death animations simultaneously (scale to 0 in 150ms)
- **Frame 200–700ms:** Bloom lerps back to normal values
- **Net read:** "everything exploded at once" — should feel like pulling the sun

### Boss Phase Transition Effect
- **Camera shake:** ±0.8 world units, 12 pulses over 600ms
- **World color shift:** Scene background color lerps from `#000810` to `#100018` (phase 2) or `#180008` (phase 3) over 1000ms — the void itself changes color
- **Boss flash:** Boss sprite flashes white 3 times at 120ms intervals
- **Bloom spike:** strength 1.8 for 400ms then eases back to phase-appropriate value
- **Charge cone telegraph:** Cone geometry appears in front of boss, emissive `#FF40FF`, scale from 0 → full over 800ms before attack begins

---

## 6. HUD Visual Spec

### Layout
All HUD is DOM overlay (CSS positioned over the canvas). Canvas fills 100vw × 100vh. HUD layer is `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none`.

### Font
```css
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
/* Fallback: monospace — the game works without the font load */
font-family: 'Share Tech Mono', monospace;
```

### Score Display
```css
#hud-score {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 28px;
  color: #FFFFFF;
  text-shadow: 0 0 8px #00E5FF, 0 0 20px #00E5FF;
  letter-spacing: 4px;
}
```

### Weapon Tier Indicator
```css
/* 7 pip elements in a row, bottom-left */
#hud-weapon {
  position: absolute;
  bottom: 24px;
  left: 24px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.tier-pip {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: #2A3A5A;
  border: 1px solid #1A2A4A;
}
.tier-pip.active {
  background: #FFD700;
  box-shadow: 0 0 8px #FFD700, 0 0 20px #FFD70080;
}
/* Label left of pips: */
.tier-label {
  font-size: 13px;
  color: #8090B0;
  letter-spacing: 2px;
  margin-right: 8px;
}
```

### Lives Display
```css
#hud-lives {
  position: absolute;
  top: 16px;
  left: 24px;
  display: flex;
  gap: 8px;
  align-items: center;
}
/* Use Unicode heart ♥ or SVG icon */
.life-icon {
  font-size: 20px;
  color: #FF3060;
  text-shadow: 0 0 6px #FF306080;
}
.life-icon.empty {
  color: #2A1020;
  text-shadow: none;
}
```

### Bomb Count
```css
#hud-bombs {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.bomb-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #C070FF;
  box-shadow: 0 0 6px #C070FF;
}
.bomb-icon.empty {
  background: #201030;
  box-shadow: none;
}
.bomb-label {
  font-size: 13px;
  color: #8060A0;
  letter-spacing: 2px;
}
```

### Boss Health Bar
```css
#hud-boss-health {
  position: absolute;
  top: 56px; /* below score */
  left: 50%;
  transform: translateX(-50%);
  width: 500px;
  max-width: 80vw;
  display: none; /* shown only during boss phase */
}
#boss-name {
  text-align: center;
  font-size: 14px;
  color: #C040FF;
  letter-spacing: 6px;
  text-transform: uppercase;
  text-shadow: 0 0 8px #C040FF;
  margin-bottom: 6px;
}
#boss-bar-bg {
  width: 100%;
  height: 10px;
  background: #1A0010;
  border: 1px solid #FF40FF;
  border-radius: 2px;
  overflow: hidden;
}
#boss-bar-fill {
  height: 100%;
  background: #FF3060; /* changes to #FF6B00 phase 2, #FF00FF phase 3 */
  box-shadow: 0 0 10px currentColor;
  transition: width 0.15s linear, background 0.4s ease;
}
/* Phase markers at 66% and 33%: */
.phase-marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: #FFFFFF80;
}
```

---

## 7. Ollama Sprite Prompts

```
name: player_ship
prompt: "clean digital sci-fi illustration of a fighter jet spacecraft viewed from directly above at slight 3/4 angle, solid black background, sleek swept-wing silhouette, ice blue metallic hull #1A9FFF with detailed hull plating, glowing cyan engine exhaust trails #00E5FF, hard rim lighting along wing edges, sharp crisp edges, twin engine pods, no cockpit canopy visible from above, high contrast dark background, smooth color gradients, strong silhouette, center of frame, no text no watermarks no borders"
size: 256x256
```

```
name: scout
prompt: "clean digital sci-fi illustration of an alien fighter drone viewed from above, solid black background, hot crimson body #FF3060 with pink hard rim glow #FF6090, insectoid angular wings with detailed hull plating, compact aggressive silhouette, twin forward gun mounts with neon glow accent, dark fill hull #1A0510, sharp crisp edges, detailed shading, high contrast dark background, smooth color gradients, centered, no text no watermarks no borders"
size: 256x256
```

```
name: bomber
prompt: "clean digital sci-fi illustration of a heavy alien bomber spacecraft viewed from above, solid black background, deep violet hull #8B30FF with lavender neon glow accent #C070FF, bulky rounded fuselage wider than long with detailed hull plating, side-mounted bomb bays visible, slow imposing silhouette, glowing weapon hardpoints, dark fill #120818, hard rim lighting, sharp crisp edges, detailed shading, high contrast dark background, centered, no text no watermarks no borders"
size: 256x256
```

```
name: drone
prompt: "clean digital sci-fi illustration of a small alien combat drone viewed from above, solid black background, toxic green body #00FF99 with pale mint neon glow accent #80FFD0, compact shape with strong silhouette, swarm unit with sharp crisp edges, slightly asymmetric wing nubs with detailed shading, dark fill #001A0D, hard rim lighting, high contrast dark background, smooth color gradients, centered, no text no watermarks no borders"
size: 256x256
```

```
name: elite
prompt: "clean digital sci-fi illustration of an elite alien fighter spacecraft viewed from above, solid black background, gold metallic hull #FFD700 with bright neon glow accent #FFEE80, larger than standard scout with ornate angular plating and detailed hull plating, glowing weapon nodes, radiating gold energy aura around ship, dark fill #1A1000, hard rim lighting, sharp crisp edges, detailed shading, high contrast dark background, smooth color gradients, centered, no text no watermarks no borders"
size: 256x256
```

```
name: sentinel_boss
prompt: "clean digital sci-fi illustration of a large alien boss spacecraft viewed from above, solid black background, deep sky blue hull #00BFFF with homing lock neon glow accent #60DFFF, symmetrical architecture with multiple rotating gun turrets in circular pattern, central targeting eye glowing, massive presence, detailed hull plating with intricate mechanical detail, dark fill #001830, hard rim lighting, sharp crisp edges, smooth color gradients, strong silhouette, high contrast dark background, centered, no text no watermarks no borders"
size: 512x512
```

```
name: interceptor_boss
prompt: "clean digital sci-fi illustration of a fast alien interceptor boss spacecraft viewed from above, solid black background, plasma orange hull #FF6B00 with neon glow accent sweep trails #FFAA40, dramatically wide swept wings dominating the frame, elongated fuselage with detailed hull plating, multiple cannon barrels along wing edges, turbine exhausts with neon glow, aggressive predatory silhouette, dark fill #1A0800, hard rim lighting, sharp crisp edges, smooth color gradients, high contrast dark background, centered, no text no watermarks no borders"
size: 512x512
```

```
name: colossus_boss
prompt: "clean digital sci-fi illustration of a colossal alien mothership boss viewed from above, solid black background, ultra-violet hull #CC00FF with neon glow accent #FF40FF, enormous screen-filling architecture, hexagonal segments and layered armor plates with detailed hull plating, dozens of gun emplacements with neon glow, city-block scale imposing presence, central reactor core blazing, dark fill #130020, hard rim lighting, sharp crisp edges, smooth color gradients, strong silhouette, high contrast dark background, centered, no text no watermarks no borders"
size: 512x512
```

```
name: bullet_generic
prompt: "clean digital sci-fi illustration of an energy projectile bullet, solid black background, elongated oval capsule shape portrait orientation, bright glowing core with neon glow accent halo, neon cyan #40FFFF with white hot center, sharp crisp edges, smooth color gradients, centered, no text no watermarks no borders"
size: 64x64
```

```
name: explosion
prompt: "clean digital sci-fi illustration of an explosion burst, solid black background, circular expanding ring of flame and energy, hot white center fading to orange #FF6B00 to magenta #FF00FF at edges, radiating jagged shrapnel debris with detailed shading, neon glow accent on energy ring, dramatic high contrast dark background, sharp crisp edges, centered, symmetric burst pattern, no text no watermarks no borders"
size: 256x256
```

```
name: pickup_weapon
prompt: "clean digital sci-fi illustration of a weapon upgrade pickup item, solid black background, glowing orb shape with crackling electric arcs surrounding it, cyan core #00E5FF with white lightning bolts radiating outward, crystalline gem facets with detailed shading, pulsing neon glow accent aura, sharp crisp edges, smooth color gradients, high contrast dark background, centered, no text no watermarks no borders"
size: 128x128
```

```
name: pickup_bomb
prompt: "clean digital sci-fi illustration of a bomb pickup item, solid black background, crystalline purple bomb shape #C070FF, faceted gem geometry with detailed shading, internal neon glow accent pulsing deep violet #8B30FF, subtle spark particles around edges, slightly rounded overall silhouette, hard rim lighting, sharp crisp edges, smooth color gradients, high contrast dark background, centered, no text no watermarks no borders"
size: 128x128
```

---

## Implementation Notes for Phase 4

1. All sprites loaded via `THREE.TextureLoader` — set `texture.magFilter = THREE.LinearFilter` and `texture.minFilter = THREE.LinearMipmapLinearFilter` for smooth filtering appropriate for detailed illustration sprites.
2. Transparent PNG: Ollama prompts use solid black background; chroma-key it in a post-processing step (any pixel where R < 15 && G < 15 && B < 15 → alpha=0) or generate with alpha from the start if the model supports it.
3. Bullet sprites should share one `THREE.SpriteMaterial` instance per tier with `color` property tinted per the tier palette — avoids 7 separate texture loads.
4. Explosion sprites: if going single-frame, use the Tween scale-out approach. If going spritesheet, divide UVs by 6 columns and step frame index every 60ms.
5. Bloom threshold 0.3 means `MeshBasicMaterial` objects with color brightness > 0.3 (most neon colors here qualify) will glow — no extra config needed on the material side.
6. Boss health bar color transition (phase 1 → 2 → 3) driven by watching boss HP percentage; update CSS custom property `--bar-color` and the `box-shadow` color simultaneously.
