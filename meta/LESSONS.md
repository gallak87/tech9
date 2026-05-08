# tech9 Framework: Cross-Game Lessons

Engineering principles extracted from shipped games. Apply to any new Three.js game in tech9.

Tags: [threejs] [corridor] [landscape] [editor] [tools]

---

## [tools] [landscape] Manifest → codegen → module pipeline

The pattern: `*-manifest.json` → `tools/*-gen.js` → `src/*.js`

AI describes geometry as JSON (counts, positions, palettes, types). A codegen script produces the Three.js module. AI never hand-edits imperative geometry code.

This is reusable for any Three.js game with procedural or configurable geometry. Benefits:
- AI iterates in the design domain (JSON description) not the implementation domain (Three.js calls)
- Generated module is deterministic and reviewable
- Regeneration is a single script run — no merge conflicts with manual edits

First established in VSB's landscape system. Adopt from Phase 1 for any game with non-trivial world geometry.

---

## [editor] In-game editor should be standard from Phase 1

Any game with configurable world geometry should have a browser editor by Phase 2 at the latest. VSB built it mid-project and immediately accelerated iteration.

Minimum viable editor: sliders for key geometry params → live Three.js preview → Save → regenerate manifest → codegen. The iteration loop (tweak → preview → ship) should be under 5 seconds.

---

## [editor] Lazy iframe loading for embedded tooling

Embed editors as iframes in the game's dev tools panel:
- On open: `iframe.src = '/editor.html'`
- On close: `iframe.src = ''`

Clearing src tears down the WebGL context. If left running, the editor canvas burns GPU while the game runs. This pattern costs zero overhead when closed and zero extra infrastructure — no separate server, no port conflicts.

---

## [editor] Camera presets are essential editor UX

Every editor needs at minimum three camera presets: **Game** (match actual in-game camera exactly), **Top** (orthographic or high-angle), **Side**.

Perspective view alone misleads. Perceived bugs (asymmetry, misalignment) often disappear in top-down view and turn out to be projection artifacts. Without a game-camera preset, design decisions made in the editor will not match the shipped game.

---

## [threejs] Remove fog first when iterating visually

`FogExp2` at any significant density (≥0.015) hides geometry beyond a short distance. When iterating on world layout, fog makes it impossible to see whether buildings, scenery, or skylines are placed correctly.

**Rule: remove fog entirely during any geometry iteration phase. Add it back last, with density tuned to the confirmed geometry extents.**

---

## [landscape] [corridor] Define density as "N objects visible at once"

For corridor scrolling games, express density as "I want N buildings visible at any time" and derive pool size and spacing from that:

```
zSpacing = (camera_far - camera_near) / N
poolCount = ceil(zSpacing_total / zSpacing) + 1  // +1 for the wrap in-flight
zReset = zStart - poolCount × zSpacing
```

Never tune pool size and spacing as independent knobs — they're coupled. Fixing one while eyeballing the other produces under- or over-dense pools that break at edge cases.

---

## [landscape] Evenly-spaced placement beats random for pools

Random placement within a range causes object overlap as count grows (birthday problem). Even spacing (`zStart + i × zSpacing`) guarantees exactly one object per slot.

Use random placement only when: (a) density is low enough that occasional overlap is acceptable, or (b) objects are small relative to the range. For walls, buildings, or anything structural: even spacing.

---

## [landscape] zReset must be derived, never hardcoded

```
zReset = zStart - poolCount × zSpacing
```

Any change to `poolCount` or `zSpacing` invalidates a hardcoded `zReset`. Stale zReset causes reset objects to land inside existing ones (overlap/z-fighting). Always recompute. Put the formula in a comment next to the constant so it's obvious when to update.

---

## [editor] [tools] RNG stability: fix loop counts, seed the PRNG

For editors with seeded random layouts:

1. **Seed the PRNG** (mulberry32 or similar). Same seed = same layout regardless of other slider values.
2. **Fix every loop count to a constant.** Any variable that controls how many times `rng()` is called must be a constant. If `rows = Math.floor(H / sliderValue)`, changing the slider shifts every object after it. Fix: `rows = 8`.
3. **Debounce rebuilds** at ~100ms to avoid thrashing during slider drag.

Violating rule 2 means sliders that should only change geometry values also change positions — the layout is unstable and iteration is painful.

---

## [landscape] Palette fields should be separate from geometry type

In a manifest, keep color/material palettes as separate fields from geometry/shape description:

```json
{
  "type": "slab",
  "body": { "palette": ["#0a0a1a", "#0d1020"] },
  "windows": { "palette": ["#00ffcc", "#ff00aa"] }
}
```

This lets AI iterate on color intent independently from shape. "Make buildings darker, keep windows bright" maps to a one-field manifest change. If palette is embedded in the geometry type, every color change requires understanding the full type schema.

---

## [threejs] [corridor] Parallax elements must respect geometry extents

Any element with parallax drift (mountains, background layers, atmosphere meshes) must be placed outside the x-extents of foreground geometry. When foreground layout changes (e.g., walls move from x=±35 to x=±49), parallax elements at the old boundary are now inside the walls.

Checklist on any layout change: review all parallax/decorative elements against new x-extents.

---

## [threejs] Z-spacing must exceed object Z-depth

`zSpacing > object_Z_depth` (with ≥1 unit margin). Violating this causes z-fighting between adjacent pool instances. The margin prevents edge-case overlap from floating point. If panel Z-width is 55, `zSpacing = 56` minimum.
