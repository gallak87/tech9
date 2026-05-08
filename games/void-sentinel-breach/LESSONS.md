# VSB: Lessons Learned

Engineering lessons from the void-sentinel-breach build, focused on the procedural landscape system.

---

## Fog

`FogExp2(0.018)` kills visibility past z≈-50. At that density every building beyond the first row is invisible from the ground camera. **Remove fog entirely while iterating on geometry. Add it back last, tuned to confirmed geometry extents.**

---

## Landscape-gen pipeline

`landscape-manifest.json` → `tools/landscape-gen.js` → `src/scenery.js`

AI describes the layout as JSON (counts, ranges, palettes, types). The codegen script turns that into Three.js module code. No hand-editing of generated code. This keeps the AI in the design loop without it needing to touch imperative geometry math.

---

## Wall panels vs individual buildings

Canyon wall panels (continuous Z-tiling, x=±49, h=75, W=55 in Z) beat discrete buildings for corridor feel. Continuous panels eliminate gaps, read clearly from ground-level cameras, and tile without visual seams. Individual buildings at the same x-position leave gaps between them that break immersion.

---

## Two-layer depth architecture

`walls` layer: close (x=±49), fast scroll, continuous panels — immediate depth cue.  
`skyline` layer: far (x=±80+), slow scroll, city slabs — horizon fill, parallax separation.

Two layers with different speeds and x-extents creates depth without fog. The speed ratio matters: skyline should move at ~0.3–0.5× wall speed.

---

## Camera height effects

Ground camera (y=1.2) requires buildings to be very tall (h=75+) or very close to read well. From y=1.2, a building 15 units wide at x=±49 must be at least h=40 to appear as a wall, not a low slab.

The orbital editor camera (y=14 default) gives a completely different read. **Camera presets matching the actual game camera are mandatory for editor-based design decisions.**

---

## X-offset calibration

`xRange [min, min]` (min==max) locks all instances to a single x-plane. Use this for walls to guarantee no gap between instances — random x scatter creates visible lane breaks. Walls should be fixed-plane, decorative far buildings can have mild x scatter.

---

## Z-spacing and z-fighting

Panel Z-width was 55 units. `zSpacing` must be strictly greater than panel Z-width or panels overlap (z-fighting). Fixed to `zSpacing = 56`. General rule: **zSpacing > object Z-depth, with ≥1 unit margin.**

---

## Z-reset calculation

`zReset = zStart - countPerSide × zSpacing`

Always derive this. If zReset is stale after changing count or spacing, newly-reset objects land inside existing ones. There is no safe hardcoded value — it must be recomputed whenever count or spacing changes.

---

## Even spacing vs random placement

Random `zRange` placement causes overlap as count grows (birthday problem). Even spacing (`zStart + i × zSpacing`) guarantees exactly one object per slot, always. Use even spacing for any pool where overlap must be prevented. Random placement only works when density is low enough that collisions are acceptable (decorative scatter).

---

## RNG stability in editors

Two rules for seeded PRNG layouts:

1. **Use a seeded PRNG** (mulberry32 or similar). Same seed = identical layout. Sliders that change values (height, width, color) must not change layout positions.
2. **Fix all loop counts to constants.** `rows = Math.floor(H / 5)` means changing H changes RNG call count, which shifts every subsequent object's position. Fixed: `rows = 8`. Any variable that controls how many times you call `rng()` must be a constant.

Debounce editor rebuilds at 100ms to avoid thrashing during slider drag.

---

## Window palette separation

`windows.palette` is separate from `body.palette`. Building bodies can be dark blues/greys; window glow can be bright neons. Separating these fields lets AI iterate on color intent independently — "make buildings darker, keep windows bright" maps cleanly to manifest changes without touching geometry.

---

## Parallax elements must respect building extents

Mountains (ConeGeometry at hardcoded x positions) clashed with the building layout when walls moved to x=±49. The mountains were at x=±40, inside the walls. Parallax decorative elements need to know the building x-extents and be placed outside them. When building layout changes, all parallax elements need re-review.

---

## Billboard type caveat

A `billboard` building type (forward-facing flat rectangle) produces floating rectangles from the low forward-facing camera (y=1.2). The panel appears to hover with no visible depth. Avoid billboard geometry for ground-camera games unless depth/thickness is added. Works fine in top-down or isometric perspectives.

---

## Haze mesh

A large translucent plane at a fixed z appeared as a grey box blocking the horizon once the building layout changed. Haze/atmosphere planes are fragile — they depend on the camera FOV, the building layout, and the sky color all being tuned together. Remove on any major layout change and re-evaluate.

---

## Editor: iframe with lazy loading

The landscape editor is a Vite-served page (`/editor.html`) embedded as an iframe in the game's dev tools panel. On open: `iframe.src = '/editor.html'`. On close: `iframe.src = ''`. This tears down the WebGL context on close, preventing a background canvas from burning GPU while the game runs. **Lazy iframe loading (set src on open, clear on close) is mandatory for any embedded tooling that creates a WebGL context.**

---

## Editor camera presets

Editor has Game / Top / Side preset buttons. Top-down view confirmed that both wall sides ARE symmetric — perceived asymmetry in the game view was the orbital camera angle + dark wall panels occluding left-side buildings from that angle. Without a top-down preset this would have been diagnosed as a data bug and wasted time.
