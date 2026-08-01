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

---

# Godot / 3D

Tags: [godot] [mcp] [terrain] [shader] [process]

First established in duneglide. See `games/duneglide/LESSONS.md` for the full derivation of
each. These are the ones that generalise beyond that game.

---

## [mcp] Verify with numbers before pictures

Order the loop: `run_project` → `game_get_errors` → `game_eval` (assert state) →
`game_screenshot` → draw calls. A screenshot tells you something is wrong; an eval tells you
what. `game_get_errors` first because it returns only what is new since the last call, so a
late call misses the compile errors entirely.

---

## [mcp] Prove invariants over thousands of cases, don't hunt for a frame

If a bug has an arithmetic or geometric statement behind it, test that statement over
thousands of random cases inside one `game_eval`. In duneglide this converted a multi-hour
intermittent-artifact hunt (a dozen failed screenshot attempts, three wrong root causes) into
a proven cause in a single call — 44,830 of 60,000 LOD seams violated the invariant.

**Corollary: after one wrong diagnosis of a visual artifact, stop looking and start deriving.**

---

## [mcp] [process] When deriving keeps saying "the model is fine", the model *is* fine — ask the renderer

The lesson above is right and incomplete, and the missing half is expensive. Deriving works when
the defect has an arithmetic statement behind it. It fails completely when the model is correct
and the *renderer* disagrees with it — because every derivation you run will confirm the model,
truthfully, forever.

Vulpine had dark tapering ribbons hanging off every cliff. Three sessions attacked it by
deriving. Sampled the height field on the exact mesh grid looking for blades: zero hits. Rebuilt
the mesh offline and compared every vertex against the height function re-evaluated at that
vertex's own coordinates: zero vertices off the surface. Checked lateral neighbours, z
neighbours, steepest slope: all clean. Every one of those results was true. The geometry was
perfect.

Every triangle was wound backwards. Back-face culling was keeping the faces turned *away* from
the camera and discarding the ones turned toward it, so the terrain rendered as a hollow shell
and the slivers of far wall that still faced you hung in open air. Nothing in the pipeline was
looking at index order, and the shading normals were written analytically rather than derived
from winding — so the surface still shaded correctly and nothing looked inside-out.

**The tell: your tests keep coming back clean while the artifact is still on screen.** That is
not "keep deriving harder", it is a category error — you are interrogating the model and the
disagreement is between the model and the renderer. Switch instruments:

- **Raycast the artifact itself.** Fire a ray through the offending pixels and ask what mesh and
  what triangle comes back. A control ray fired straight down from 5000 m onto a chunk's own
  bounding-sphere centre returned *no hit* — impossible for a front-facing heightfield, and that
  single result was the whole diagnosis.
- **Compare the geometric normal to the shading normal.** `(b-a) × (c-a)` against the normal the
  mesher wrote at the same vertex. Dot of −1.000 says winding is inverted; nothing else does.
- **Diff two renders**, one with the suspect meshes hidden. The difference is the silhouette
  exactly as rasterised, with no assumptions.
- **Flip the thing you cannot otherwise observe.** Forcing `cull_disabled` / BackSide draws
  precisely the triangles the GPU was throwing away. If the frame becomes correct, you are done.

General form: **derive against the model, raycast against the render.** Use the second the
moment the first starts returning clean results on a visible defect.

---

## [process] Validate the instrument before you trust it reporting "nothing"

An instrument that reports *no effect* is the one most likely to be lying, and it is the most
dangerous reading because it looks like a result.

Vulpine's homing-guidance probe reported **0 hits out of 49 rounds** while the guidance was in
fact connecting on two thirds of them. It sampled bullet-to-target distance once per tick; the
sim tests the swept segment between ticks; a round covers 16 m per tick. Every clean strike was
recorded as a 13 m near miss. Worse, the numbers were *stable across parameter changes* — which
reads exactly like "my change did nothing" and nearly caused a working system to be retuned into
a broken one.

Two rules:

1. **Before believing a null result, prove the instrument can see a positive one.** Feed it a
   case you know is true. If it cannot detect that, it cannot detect anything.
2. **Measure at the source, not by sampling from outside.** An entity is usually destroyed on the
   frame its event fires, so an external sampler structurally *cannot* observe the event — the
   last frame it sees is always the one before. Count the event where it is applied. In Godot
   that means a counter incremented in the collision/damage handler and read via `game_eval`, not
   a poll loop over live nodes.

**Tell: a measurement that does not move when you change the parameter it measures.** That is
almost never a real invariance. Suspect the instrument first.

---

## [process] Screenshots cannot answer time-domain or input-domain questions

A capture is one frame with no keys held. Whole classes of defect are invisible to it no matter
how many you take, and each needs its own instrument:

- **Input domain.** The screenshot harness never presses a key, so "does the fire button fire"
  is unanswerable by capture. Vulpine had a gun-convergence bug survive a dozen review captures;
  a harness that pressed real keys and reported what the sim did with each control found it
  immediately. Godot makes this cheap — `game_key_press` / `game_key_hold` plus `game_eval` on
  the resulting state.
- **Time domain.** "Is there dead air in this encounter", "how long does a target stay
  shootable", "does the boss drift out of range" are questions about the sim over seconds. Step
  the fixed-step sim and sample state 10×/second. This found an AI station-seek bug that had
  every enemy in the game lagging its commanded position.
- **Sim-internal truth.** Whether a guided round actually converges is a fact about velocity over
  time that no frame contains.

**Build these three before building content, not after.** They are the difference between
iterating and guessing, and each one here found a bug that captures had already missed.

---

## [process] Wire every seam on the first commit — orphaned modules are the default failure

A Vulpine session fanned out five parallel lanes and **three of them never wired their work in**:
4,873 lines of finished, correct, fully-commented modules — a complete combat system, a complete
HUD, a complete audio graph — that nothing imported. All of it looked like progress in the diff
and none of it existed in the running game.

Agents build modules readily and integrate them reluctantly, because integration is where the
conflicts and the unknowns are. Counter it structurally: **demand a playable end-to-end loop
before any depth** — the ship flies, one enemy spawns, one gun fires, one HUD element updates,
death and respawn work — then deepen each in place. In Godot the rule states itself: if it is not
in the scene tree and running, it does not exist. A `.gd` file is not a feature.

---

## [process] One background agent plus yourself — and the reason is not merge conflicts

Five parallel lanes hit the usage ceiling in ~15 minutes. But the binding constraint at two lanes
is subtler and cost a whole comparison before anyone spotted it: **disjoint files never conflicted
once.** The problem is that every lane drives the *same running game*. A before/after capture
renders whatever the other lane's files happen to be at that instant, so any A/B measures both
changes at once. It produced a confident "the artifact is fixed" off a frame captured mid-edit by
another lane, which was simply false.

This bites harder in Godot than on the web, because the MCP bridge is **one game per port** —
two agents calling `run_project` and `game_eval` are fighting over one instance, not just one
filesystem.

Rules: one background agent plus yourself inline, on disjoint files. Hand the agent the API
contract it needs *in the prompt* — making it re-derive interfaces from source is the single
biggest budget burn. If a look must be measured while another lane is live, isolate it: a git
worktree, and an explicit `--mcp-port` so the two games cannot touch.

---

## [mcp] Screenshots return stale frames when the window is occluded

macOS stops compositing an unfocused or covered window; `game_screenshot` then returns the
last frame with no error, indefinitely. Two successive impossibly-identical screenshots means
verify liveness via `game_eval` on a moving value — not that the change did nothing.

---

## [mcp] `load()` returns the cached resource

Editing a `.gdshader` or `.gd` on disk does not affect the running game. Restart the project
to pick up file edits. Likewise, values set through `game_eval` are runtime-only — bake them
into files and re-verify from a cold start, or lose the tuning.

---

## [godot] Any game with configurable/tuned systems needs an in-game dev overlay from Phase 1

Same lesson as the web games' editor, and it lands harder in 3D: overlay on a dedicated key,
`PROCESS_MODE_ALWAYS`, live telemetry, runtime knobs for anything tuned by eye, and a
freeze-and-orbit camera. Being able to stop time and fly around the geometry is worth more
than any number of forward-facing screenshots. The overlay is a view — knobs drive the owning
script's exported vars so defaults stay in the scripts.

---

## [godot] Vertex displacement has four non-negotiables

`custom_aabb` (or chunks blink out when the camera turns), `flags = 0` on
`add_surface_from_arrays` when a vertex attribute carries geometry rather than texture data,
index counts under 65536 per surface, and `cast_shadow = OFF` on dense procedural geometry.
Also: **never enable TAA** — Godot builds motion vectors from `PREV_MODEL_MATRIX`, which knows
nothing about vertex-shader displacement, and smears it to mush at speed.

---

## [terrain] Every clipmap ring snaps on the finest ring's grid

Per-ring snapping tears chunk-sized holes wherever adjacent rings' snap points disagree, which
is most of the time. One shared snap makes ring coverage and the next ring's hollow centre
identical by construction. Requires `chunk_n % 2^(lod_count-1) == 0` — assert it at startup.

---

## [terrain] Don't put a smooth surface under a stepped one

The gap between them is a free variable that moves with slope and will generate a stream of
distinct-looking bugs that are all the same bug. If the surface is stepped, make the stepped
thing solid and let it *be* the ground.

**General form: when three symptoms keep trading places under fixes, the representation is
wrong, not the tuning.**

---

## [shader] A sky's below-horizon colour feeds ambient, aerial-perspective fog, and grazing reflections

Changing it to hide a world-edge affects all three and can wash out the entire scene. Hide an
edge with a narrow fog-coloured band under the horizon instead. Size the band from
`atan(eye_height_above_distant_terrain / world_radius)` — the driver is height above *distant*
terrain, so skimming a ridge is the worst case, not flying high.

---

## [shader] Check the value relationship before adding detail

"Reads like vector art, not a real surface" is usually an inverted value relationship against
the reference, not missing surface detail. Compare which surface is bright and which is dark
before adding finish passes. Comment *why* every tuned constant is what it is — emission
energies, hue ranges and fill factors are all context-dependent and get "simplified" into
breakage otherwise.
