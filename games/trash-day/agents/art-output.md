# Art Output — Trash Day

## Color Palette

| Name            | Hex       | Used On                          |
|-----------------|-----------|----------------------------------|
| Truck Yellow    | `#F5C518` | Truck cab body                   |
| Truck Orange    | `#E87722` | Truck hopper body                |
| Truck Dark      | `#2B2B2B` | Truck chassis underside, wheels  |
| Truck Windshield| `#A8D8EA` | Cab windshield block             |
| Truck Bumper    | `#888888` | Front bumper                     |
| Arm Gray        | `#9E9E9E` | Pickup arm segments              |
| Arm Claw        | `#BDBDBD` | Arm claw/scoop tip               |
| Road Asphalt    | `#4A4A52` | Road surface                     |
| Road Stripe     | `#F5F0C0` | Center line stripes              |
| Sidewalk        | `#C8C0A8` | Road shoulder / sidewalk band    |
| House Red       | `#E05C5C` | House body variant 1             |
| House Blue      | `#5B8DD9` | House body variant 2             |
| House Cream     | `#F0E2A0` | House body variant 3             |
| House Mint      | `#6FCF97` | House body variant 4             |
| House Lavender  | `#B47FD8` | House body variant 5             |
| Roof Dark Brown | `#7A4E2D` | Roof (all houses)                |
| Window Pale     | `#D6EEFF` | Window squares on houses         |
| Door Warm       | `#C47C3A` | Front door                       |
| Trash Can Dark  | `#3D3D3D` | Trash can body                   |
| Trash Can Lid   | `#555555` | Trash can lid (lighter)          |
| Trash Can Rim   | `#222222` | Lid rim edge                     |
| Sky Blue        | `#87CEEB` | Scene background (already set)   |
| Grass Green     | `#7BC96F` | Ground plane (lawn)              |
| Confetti Red    | `#FF3B30` | Particle burst                   |
| Confetti Yellow | `#FFD60A` | Particle burst                   |
| Confetti Blue   | `#007AFF` | Particle burst                   |
| Confetti Green  | `#34C759` | Particle burst                   |
| Confetti Orange | `#FF9500` | Particle burst                   |
| Confetti Pink   | `#FF2D78` | Particle burst                   |

---

## Entity Visual Descriptions

### Truck

A chunky, front-heavy garbage truck. Think a happy toy — wide cab, squat hopper, oversized wheels. Viewed from a 3/4 rear-above angle (camera is behind and above).

**Cab** — Bright yellow (`#F5C518`) box, wider than it is tall. A smaller pale-blue windshield block sits recessed on the front face. A gray bumper strip runs along the bottom front edge.

**Hopper** — Orange (`#E87722`) box, slightly taller and longer than the cab, sits directly behind it at the same ground level. Flat top. Could be imagined as a big dumpster on wheels.

**Chassis** — Dark (`#2B2B2B`) thin flat slab underneath both cab and hopper, extending a little wider on each side to imply a frame.

**Wheels** — 4 dark cylinders (CylinderGeometry, rotated 90° on Z), one at each corner. Proportionally large — toy-truck scale. No detail needed.

**Arm** — Two-segment arm mounted on the right side of the hopper. Lower segment is a tall thin gray box (the boom). Upper segment is a shorter, slightly wider scoop/claw. The entire arm Group pivots from its base at hopper-right-side level. `arm.name = 'arm'` set on the top-level arm Group.

---

### House

A simple happy suburban house. Slightly randomised body color each call (cycles through 5 house colors). Same roof and trim on all variants.

**Body** — Chunky box, roughly 3 wide × 2.5 tall × 2.5 deep.

**Roof** — Triangular prism (CylinderGeometry with radiusTop=0, 4 radial segments for a pyramid, or a low-poly cone), dark brown, sitting squarely on top of the body and slightly overhanging on all sides.

**Windows** — Two small pale-blue flat boxes inset slightly on the front face, side by side.

**Door** — One warm-brown flat box on the lower-center front face.

---

### Trash Can

Stubby silver-gray cylinder — the classic round trash can. Slightly tapered (wider at top). Lid is a separate, slightly wider and shorter cylinder that sits on top like a cap.

**Body** — CylinderGeometry, dark charcoal (`#3D3D3D`), radiusBottom slightly smaller than radiusTop for a subtle taper. Height ~1.5 units.

**Lid** — CylinderGeometry, slightly lighter gray (`#555555`), same radius as top of body but wider, very short height. Sits flush on top.

---

### Road Segment

Flat plane. Warm asphalt color (`#4A4A52`). Width and length passed as params. No subdivisions needed — just a PlaneGeometry rotated flat. Sidewalk bands could optionally be added as two thin flat boxes flanking the road (out of scope for v1, noted for expansion).

---

### Confetti Particle

A single tiny flat box (`BoxGeometry(0.15, 0.15, 0.02)`). Random color from the 6-color confetti palette, chosen at creation time. Designed to be spawned 20–30 at once in a burst, each with a random velocity vector applied in game logic.

---

## Lighting Setup

Main.js already has:
- `DirectionalLight` (sun) at `(10, 20, 10)`, intensity 1.4, shadows enabled
- `AmbientLight` white, intensity 0.4

Recommendation: Replace the flat white ambient with a `HemisphereLight` for a soft sky/ground gradient that reads better on toy geometry:

```js
// Remove the flat ambient, add hemisphere instead
const hemi = new THREE.HemisphereLight(
  0x87CEEB,  // sky color — matches scene background
  0x7BC96F,  // ground color — grass green
  0.6        // intensity (lower than ambient was, sun compensates)
);
scene.add(hemi);
```

This gives geometry a subtle warm-bottom / cool-top shading that reinforces the outdoor toy-set feel without any extra work from Lambert shading.

---

## Particle Confetti Spec

**Count:** 24 particles per pickup event  
**Geometry:** `BoxGeometry(0.15, 0.15, 0.02)` — flat square chip  
**Material:** `MeshLambertMaterial`, color random from palette (6 colors)  
**Spawn position:** Top of the trash can at pickup moment  
**Velocity:** Each particle gets a random velocity vector:
  - XZ spread: random direction, magnitude 0.08–0.18 units/frame  
  - Y: random 0.12–0.22 upward initially, then gravity pulls it down at ~0.008/frame  
**Rotation:** Random spin added each frame (tumbling)  
**Lifetime:** ~60 frames (1 second at 60fps), then remove from scene  
**No physics engine needed** — simple ballistic loop in game update

---

## Score HUD Style

**Font:** system-ui, bold — no font file needed  
**Size:** `font-size: 48px` at 1080p reference  
**Color:** White (`#FFFFFF`) with a 2px black text-shadow for legibility against any background  
**Position:** Top-left, `position: absolute; top: 24px; left: 32px`  
**Content:** `🗑 {score}` — trash can emoji + space + number (or plain text `Cans: {score}` if emoji rendering is inconsistent in target env)  
**Implementation:** Plain DOM overlay div, not Three.js canvas text. Simpler and more reliable for kids' readability.

```html
<div id="score" style="
  position: absolute;
  top: 24px;
  left: 32px;
  font-family: system-ui, sans-serif;
  font-size: 48px;
  font-weight: 900;
  color: #ffffff;
  text-shadow: 2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000;
  pointer-events: none;
  user-select: none;
">Cans: 0</div>
```

Update via `document.getElementById('score').textContent = 'Cans: ' + score`.

---

## Pickup Prompt Indicator

When truck is in range of a can, show a simple pulsing indicator above the can — a flat ring (TorusGeometry) or just a DOM badge. Suggested: a small `[SPACE]` text badge that appears in world space above the can, implemented as a CSS2DObject or simply as a DOM overlay that tracks screen position. Out of scope for v1 art spec but flagged for dev.
