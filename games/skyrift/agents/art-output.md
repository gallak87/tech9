# Skyrift — Art Direction

## Visual Style Decision

**Pixel art.**

The 1942-meets-Ikaruga target feel is anchored in the tactile crunch of pixel-on-pixel contact — vector glow would make bullets gorgeous but harder to read against a glowing background at bullet-hell density. Pixel art keeps silhouettes crisp, hitboxes visually honest, and the nostalgia layer earns the genre callbacks without feeling ironic.

---

## Color Palette

### Background (Sky)
| Name | Hex | Use |
|------|-----|-----|
| Abyss Navy | #0a0e1f | Dark base — the sky |
| Void Stripe | #111830 | Scroll stripe accent (subtle horizontal bands scrolling down) |

### Player Jet
| Name | Hex | Use |
|------|-----|-----|
| Titanium White | #e8eaf0 | Primary body |
| Plasma Cyan | #00f5ff | Cockpit / engine accent |

### Scout Enemy
| Name | Hex | Use |
|------|-----|-----|
| Acid Green | #39ff14 | Primary body |
| Dark Olive | #1a4a00 | Wing shading / accent |

### Bomber Enemy
| Name | Hex | Use |
|------|-----|-----|
| Bruise Purple | #6b21a8 | Primary body |
| Toxic Amber | #f59e0b | Underbelly / bomb bay accent |

### Interceptor Enemy
| Name | Hex | Use |
|------|-----|-----|
| Blood Crimson | #dc1a1a | Primary body |
| Chrome Silver | #c0c0c8 | Canard fins / thrust accent |

### Boss
| Name | Hex | Use |
|------|-----|-----|
| Gunmetal | #2d3748 | Primary body (phase 1) |
| Inferno Orange | #ff6b00 | Phase-2 glow (thrusters flare, eye pulses) |
| Rage Magenta | #ff0077 | Phase-3 rage color (whole silhouette tints) |

### Bullets — Weapon Levels
| Level | Name | Hex | Visual Note |
|-------|------|-----|-------------|
| L1 | Standard White | #ffffff | Single tight shot, 2×6px |
| L2 | Volt Yellow | #ffe000 | Twin shots, 2×6px each |
| L3 | Sky Blue | #0099ff | 3-way spread, 3×7px each |
| L4 | Lime Pulse | #aaff00 | Spread shots + homing missile (missile is 4×10px, distinct shape) |
| L5 | Piercing Violet | #cc44ff | Full spread + piercing, slight glow outline distinguishes from L3 |

### Explosion
| Name | Hex | Frame |
|------|-----|-------|
| Flash White | #ffffff | Frame 1 (instant pop) |
| Fireball Orange | #ff6b00 | Frames 2–4 |
| Char Smoke | #4a3728 | Frames 5–6 (dissipating) |

### Weapon Pickup
| Name | Hex | Use |
|------|-----|-----|
| Power Gold | #ffd700 | Glow color — rotating star/diamond shape |

---

## Sprite Dimensions

Canvas: 480×640. All dimensions in pixels (width × height).

| Entity | Width | Height | Notes |
|--------|-------|--------|-------|
| Player Jet | 40 | 48 | Fits comfortably, leaves maneuvering room |
| Scout | 28 | 28 | Fast and small — should read as nimble |
| Bomber | 48 | 40 | Wide and squat — visually heavy |
| Interceptor | 32 | 44 | Narrow and tall — aggressive silhouette |
| Boss | 160 | 140 | ~1/3 screen width — visually imposing without full-screen lock |
| Bullet L1 (single) | 2 | 6 | Tight laser sliver |
| Bullet L2 (twin) | 2 | 6 | Same shape, gold — rendered twice |
| Bullet L3 (spread) | 3 | 7 | Slightly fatter, blue tint |
| Bullet L4 (spread+missile) | 4 | 10 | Missile is elongated, distinct from spread bolts |
| Bullet L5 (piercing) | 3 | 8 | Violet, subtle outer glow pixel border |
| Explosion frame | 32 | 32 | 6 frames total (1 flash, 3 fire, 2 smoke) |
| Weapon Pickup | 20 | 20 | Rotating diamond — 4-frame spin animation |

---

## Ollama Prompt Notes

**Player Jet**
Top-down pixel art fighter jet sprite on solid black background, 40×48 pixels, white titanium body with cyan cockpit glow, twin engine exhausts, clean military silhouette pointing upward, no anti-aliasing, crisp 1-bit shading.

**Scout Enemy**
Top-down pixel art enemy scout aircraft sprite on solid black background, 28×28 pixels, acid green (#39ff14) body with dark olive wing shadows, small fast-looking delta-wing shape pointing downward, aggressive minimal design, no anti-aliasing.

**Bomber Enemy**
Top-down pixel art enemy bomber aircraft sprite on solid black background, 48×40 pixels, deep purple body with amber underbelly bomb bay, wide wingspan, heavy silhouette pointing downward, chunky pixel shading, no anti-aliasing.

**Interceptor Enemy**
Top-down pixel art enemy interceptor aircraft sprite on solid black background, 32×44 pixels, blood crimson body with chrome silver canard fins, narrow swept-wing profile pointing downward, menacing angular design, no anti-aliasing.

**Boss**
Top-down pixel art massive enemy boss aircraft sprite on solid black background, 160×140 pixels, gunmetal dark grey armored hull, multiple gun turrets, large glowing engine cores, intimidating symmetrical warship silhouette pointing downward, detailed pixel shading, no anti-aliasing.

**Bullet L1**
Pixel art game bullet sprite on black background, 2×6 pixels, single bright white laser sliver, vertical orientation, glowing core pixel, minimal, crisp.

**Bullet L2**
Pixel art game bullet sprite on black background, 2×6 pixels, volt yellow (#ffe000) laser bolt, vertical orientation, slightly brighter center pixel, clean and crisp.

**Bullet L3**
Pixel art game bullet sprite on black background, 3×7 pixels, sky blue (#0099ff) energy bolt, slightly fatter than L1, vertical orientation, soft inner glow, crisp pixel edges.

**Bullet L4**
Pixel art game missile sprite on black background, 4×10 pixels, lime green (#aaff00) elongated rocket shape with pointed nose and small fins at base, vertical orientation, distinct missile silhouette, crisp pixels.

**Bullet L5**
Pixel art game bullet sprite on black background, 3×8 pixels, violet purple (#cc44ff) piercing energy shot, vertical orientation, 1-pixel bright white core surrounded by violet, subtle outer glow pixel border, crisp.

**Explosion**
Pixel art explosion sprite sheet on black background, 6-frame animation at 32×32 pixels each, frame 1 white flash burst, frames 2-4 orange fireball expanding then contracting, frames 5-6 dark brown smoke dissipating, classic retro game explosion style, crisp limited palette.

**Weapon Pickup**
Pixel art collectible power-up sprite on black background, 20×20 pixels, spinning golden diamond shape, bright gold (#ffd700) with white highlight pixels, 4-frame rotation animation implied in single frame, glowing aura, crisp pixel art style.
