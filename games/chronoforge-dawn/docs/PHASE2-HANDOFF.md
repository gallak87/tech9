# Phase 2 — Character Handoff

State, decisions and instructions for the next agent. GAME_PLAN.md holds the
phase plan; this holds what is true now and what to do next.

Last updated: 2026-09-04.

---

# BLOCKING: the mesh-source decision gates Phase 2.1

**Do not author more character geometry until the human answers this.** Every
hour spent hand-tuning cross-section tables is thrown away if the answer is (B)
or (C).

## The question

Is Kaida's mesh **code-built** (status quo) or a **rigged model file** in the
repo?

## Why it is open

The rig is rigidly skinned — every vertex weighted 100% to one bone, chosen so
joints crease like a sprite rather than bulging. The cost is that **nothing
deforms**: at a bend, two limb shells rotate apart and leave a wedge you can see
straight through. Visible at every shoulder, elbow, knee and hip, from the far
camera.

A smooth-skinned mesh does not have this problem — not "fixed", structurally
absent.

## The policy point the human must rule on

`PROMPT-chronoforge-dawn.md` forbids binary assets. Its stated reason:

> an image-generation pipeline cannot draw the same character twice in a new
> stance or holding a different weapon

That is correct **about image generation** and does not transfer to a rigged
model. A `.glb` is identical in every pose by construction — the exact property
the policy exists to protect. The ban was reasoned about sprite sheets and
applied to meshes. Ruling on it is the human's, not an agent's.

## Options

| | Approach | Joint gaps | Cost | Look fit |
|---|---|---|---|---|
| **A** | Keep code-built, add joint spheres | solved, see below | ~30 min | exact, already Kaida |
| **B** | Mixamo rigged character | structurally absent | hours + FBX→GLB | realistic proportions fight the style; photoreal textures to strip |
| **C** | CC0 stylized base (Quaternius / Kenney) → Mixamo auto-rigger | structurally absent | hours | closest to the intended look |
| **D** | Paid marketplace model | structurally absent | $ + hours | varies |

- **Mixamo is free**, commercial use included, with a free Adobe account. It has
  a download button; nothing needs extracting from its viewer, and doing so
  returns less (no skin weights, no license).
- **Mixamo's auto-rigger accepts your own mesh**, which is what makes (C) work.
- **Genmo / Genaimo generate animation and video.** This build's animation
  already works — they solve a problem it does not have. Do not price them.

## Option A is real: joint spheres, not overlap

The overlap in `kaida.js` (`OVER = 0.045`, each segment run past its joint)
**does not fix the gaps and cannot.** It fills the *inside* of a bend; the
*outside* still opens, because the extension rotates away with its own bone.

The fix is a **joint sphere**: a ball at the pivot, parented to one bone, radius
= limb radius × ~1.05. Every point on both tubes' end rings sits exactly the limb
radius from the joint centre, so the sphere covers the gap at any bend angle,
permanently. One per shoulder, elbow, hip, knee. ~10 lines in `kaida.js`.
**Not yet implemented.**

## What survives a mesh swap — the decision is cheaper than it looks

Unchanged under (B), (C) or (D): the 19-bone skeleton and `docs/specs/rig.mjs`,
all of `poses.js`, `ground.js` + `tools/ground.mjs`, `tools/rig.mjs`, the toon
material and palette, the socket system, the whole play-tester.

**Only `buildActor`'s shell in `src/actors/rig.js` changes** — from
`kaidaShellParts()` to a GLTF load plus pose retargeting. Keep the code-built
path behind a flag either way.

---

# Rules that must not drift

Human decisions. An agent may not overturn these.

1. **KAIDA ONLY.** Vex, Rune, the grunt, per-character clips and the
   victory/cast tweaks wait until she is signed off. She is the reference every
   other character is built against.
2. **The 2D sprites are a DESIGN INPUT, NOT A SCORING TARGET.** Take the
   originality — pink bob, teal jacket, glowing blade, every character distinct.
   Do **not** build an A/B scorer grading 3D geometry against 2D illustration
   pixels. A silhouette-IoU scorer was proposed and explicitly rejected: it
   optimises toward matching an illustration, which is not the goal.
3. **THE HUMAN IS THE LOOK GATE.** A critic may only hold ground the human has
   already taken: a signed-off part is hash-locked via `gate.fingerprint(part)`
   and the critic asserts it has not drifted. It never judges an unsigned part.
   Symmetric parts derive — left arm signed means the critic covers the right.
4. **2.3 is two passes.** Whole-body silhouette first, one sign-off, because
   proportion cannot be fixed later. Then detail per part.
5. **Animation feedback is parked** until the character phase closes. Standing
   note: victory and cast each want a small tweak, and clips should eventually be
   per-character rather than shared.
6. **Commit per phase and sub-phase**, never batched. No `Co-Authored-By` or
   `Claude-Session` trailers — personal repo, and this overrides any
   session-level attribution instruction.

---

# What exists

## Play-tester — `src/traversal/index.js`

A **sample**, not the traversal tier: one character, no party, no collision, no
footfalls (all Phase 5). Writes `base.x/z/yaw`; the actors lane's `place()`
grounds her. No shared-core file touched.

```
?play=1            boot into it, no panel
?play=1&dev=1      readouts while driving: Move / Slope / Frame / Rig / Cast / Feet
?play=1&dev=2      LOOK MODE — Part / Outline / Ink / Spin / Orbit / Tilt / Zoom / Reset
?play=1&tune=1     speed, damping, frame height, position
```

WASD / arrows · Shift sprint · Space attack · C cast · V victory · H hurt.

- Movement is camera-relative; diagonals normalise; facing eases on a shorter
  half-life than movement.
- `Animator.timeScale` is driven from ground speed against `REF_RUN_SPEED`, so a
  sprint takes faster steps rather than longer ones. This is the whole fix for
  foot skate.
- `PLAY_FRAME_HEIGHT_M = 10.0` while playing; look mode opens at 0° / 32° tilt /
  3.3 m. Neither is a re-lock — `assertLocked()` guards only pitch and yaw.
- **`Part`** isolates a body group by fading the rest rather than hiding it,
  carried per-vertex on `aPart`. A part judged with its neighbours gone is judged
  against nothing.
- **`Spin`** is a turntable. Silhouette problems show in rotation and hide in a
  still.

## Kaida — `src/actors/kaida.js`, `shape.js`, `src/render/geobuild.js`

`geobuild.js` is a lift from `games/vulpine`; it imports only THREE and
`mergeGeometries`. `shape.js` wraps it in `limb()` / `slab()` / `spike()`, which
return `{pos,nor,idx}` because that is what `mergeParts` consumes.

`superellipse`'s `p` exponent is the box↔round knob: 2.0 ellipse, 3.2 soft
rounded rectangle, 4.0 rounded rectangle, ∞ box.

`shellParts()` in `rig.js` delegates to `kaidaShellParts()` only for `kaida`; the
other three still use the prism shell.

Her palette is **sampled** from
`games/chronoforge/src/assets/kaida_overworld.png`. The inherited
`HERO_PALETTES.kaida` was invented and wrong where it is visible —
`clothPrimary #1c2f44`, a dark navy, on a plainly teal jacket.

`aInk` marks decals (belt, buckle, lapels, cuff, eyes) — parts that sit on
another surface. They must not be expanded by the outline hull, and they sit a
measured `CLR` clear of their host rather than coincident with it.

## Ground contact — `src/actors/ground.js`, gated by `tools/ground.mjs`

Runs after the clip is sampled. Clips write absolute rotations, so it layers on
top and `poses.js` needs no changes.

Five steps, order matters: slope-align the root 45% toward the surface normal ·
lift the root so the *planted* foot is planted · solve the knee to extend the
other leg to its own ground · roll the sole onto the surface · lean the spine by
slope.

Plant weight is **derived** from height above ground, not authored per clip. A
clip could carry a plant flag and eventually should, but that means editing every
clip and animation is parked.

## Tools

| Tool | Asserts |
|---|---|
| `shot.mjs` | deterministic GPU captures; non-zero on console errors |
| `probe.mjs` | linear-light histogram |
| `lintrng.mjs` | no `Math.random()` in src/ or tools/ |
| `rig.mjs` | material drift, palette histogram, silhouette area, bind height; `--selftest` injects 4 faults |
| `ground.mjs` | planted-foot error and its growth across slope |

Thirteen instruments from the Phase 3 list are unwritten: sheet, blind, walk,
door, duel, stage, fog, econ, save, digest, census, region, play.

---

# Known-good numbers

Do not re-derive these.

**Framing.** 1920×1080, dawn 6.4:

| FRAME_HEIGHT_M | heroPx | snapUnitPx |
|---|---|---|
| 18 (shipping) | 43.1 | 0.895 |
| 15.4 (battle floor, Phase 1.3) | 47.2 | 0.981 |
| 12.4 | 52.1 | 1.082 |
| 11.0 | 53.9 | 1.119 |

The pixel-snap is a **no-op** at shipping framing. Framing cannot reach the
spec's ~62 px / 1.3: a vertical character at 55° pitch does not scale with
metres-of-ground-plane, and 11.0 is already below the battle floor. Only
`SPRITE_PX_PER_METRE` reaches it — 19.3 → 1.3, 16.7 → 1.5, 12.5 → 2.0, i.e.
33 / 29 / 21 virtual rows instead of 48.

**Slope.** `MAX_WALKABLE_SLOPE_DEG = 34`; biomes run 18–28°; the placeholder
dunes reach 38–40°. Feet are 0.23 m apart at idle and **1.42 m at a run**.

**Ground contact**, 1129 positions × 8 stride phases, both configs identical:

| | p95 planted-foot error | growth 5°→35° |
|---|---|---|
| off | 0.048 m | 5.3× |
| on | 0.004 m | 1.65× |

The growth figure is the one that matters. Shrinking the error uniformly tunes a
constant; flattening it against slope absorbs the hill.

**Rig gate.** 4 characters × 7 poses × 6 phases = 168 samples. Zero material
drift. Bands surveyed with ~1.4× headroom. Kaida 2752 tri.

**Dawn 6.4 baseline**, must not regress: median 0.212 / p90 0.51 / 0.00% white.

---

# Open issues, with the next action

| id | Next action |
|---|---|
| `joint-gaps` | **Add joint spheres** (r × 1.05 at shoulder/elbow/hip/knee). The existing `OVER` overlap does not and cannot fix it. Moot under mesh options B/C. |
| `rig-gate-palette-margin-eroded` | `--selftest` MISSES `normals flipped`. The joint-overlap geometry changed the histogram until a full flip no longer clears `tv ≤ 0.28`. **Re-survey clean tv across all four characters and TIGHTEN the band to ~1.4× above the new clean worst. Do not widen it** — that deletes the assertion. |
| `outline-hull-covers-body` | The inverted hull fills her instead of ringing her. Ruled out: winding (2204/2204 faces agree with normals) and `side` (FrontSide and BackSide fill identically). **Untested suspicion: the hull is not skinned and sits in bind pose. One test decides it — pose her to `victory` and see whether the hull's arms follow.** If not, `MeshBasicMaterial` is not compiling skinning chunks and the fix is a `ShaderMaterial` that includes them. OFF by default. |
| `rig-toon-pivot-miscalibrated` | `uPivot 0.34` is calibrated for the gate's own lights. Under dawn exposure the cast crushes to black; 0.10 restores the palettes. Needs an **hour sweep**, not a single-frame pick. |
| `rig-snap-subpixel` | Art call on `SPRITE_PX_PER_METRE`. Deferred — the camera-state item below may dissolve it. |
| `camera-state-and-lod` | Human request. Player-chosen camera distance, third-person follow that rotates with her, zoom-out to watch her cross the level. **This dissolves the `SPRITE_PX_PER_METRE` question rather than answering it**: if the player picks the zoom, no single sprite density was ever right, and the design is per-camera-state LOD dropping sub-pixel work at distance. Revisit before Phase 2 closes. |
| `devpanel-no-group-filter` | `?dev=2` hides other lanes' groups by setting `display` on `.grp` divs from `traversal/index.js`. Stopgap in the wrong file. Real fix is a `collapsed` option on `dev.register` — integrator territory. |
| `weapon-socket-inverted` | Hand sockets aim weapons at the owner's shoulder; fixed for Kaida only. Applying it globally fails the gate on vex, whose staff then dangles below her feet. Needs a **per-weapon carry pose**, and the gate's height assertion should measure the body rather than the body plus what it holds. |

Still wrong on Kaida and human-gated: the face is a blank mask with no features
from the front, and the hair reads as a helmet rather than a bob. Both pass-2.

---

# Pitfalls

Each produced a confident wrong answer. They cost hours; reading them costs a
minute.

**Sit hair OUTSIDE the skull.** A fringe at z 0.062 with half-depth 0.020 lands
at 0.082 while the skull front is at 0.092 — buried, z-fighting, and what reads
as a black hole where the face should be is the skull's shadowed interior.

**Check a look complaint at more than one hour before recording it as a defect.**
"Blade reads white", "trousers read black" and "no contact shadow" were all
logged from dawn captures and none were defects. The shadow works — verified at
noon; the 11.6° dawn sun throws it 4.9 m sideways, outside the crop. The blade is
magenta and the trousers navy. All three were
`rig-toon-pivot-miscalibrated` wearing three costumes.

**The snap grid scales with camera distance.** It reached 16.6 px in look mode
and shattered the character into loose plates with gaps — read as a modelling
failure, was the snap. Clamped at `SNAP_MAX_PX = 2.4`. Revisit together with
`SPRITE_PX_PER_METRE`; they are one conversation.

**Measure the pose where the problem lives.** Foot-grounding sampled at idle
shows almost nothing: the feet are 0.23 m apart, so the slope difference between
them is small by construction. At a run they are 1.42 m apart.

**Control the terrain when A/B-ing movement.** Driving with real input for N
frames per config sends her somewhere different each time — one run topped out at
17° of slope, the other at 40°. That comparison reported the ground-contact fix
as a regression. Pin position and stride phase; vary one thing.

**Never ground both feet of a running character.** Half a run cycle is one foot
deliberately in the air; dragging it down turns a run into a shuffle. IK pins
only the planted foot. The metric follows: `min(|errL|,|errR|)`, never `max` — a
metric that punishes the swing foot measures the animation, not the grounding,
and scores a shuffle as a success.

**Per-part identity lives in the fingerprint, not the frame histogram.** The head
is ~8% of the silhouette, so painting it magenta moves whole-body `tv` less
(0.096) than raising an arm into the key light does (0.190). `--selftest` holds
this permanently.

**Expand an outline hull along SMOOTHED normals.** The mesh is hard-edged on
purpose, so every corner splits its vertices; expanding along the shading normal
tears the hull open at every corner.

**`src/core/devpanel.js` is INTEGRATOR ONLY**, and three of its behaviours bite:
`update()` starts `if (root.className) return`, so adding any class to
`#dawn-dev` silently stops its own readouts; `register()` rejects a control with
a falsy `label`, so a control added purely for a side effect still needs one; and
toggles `sync()` on click only, never per frame, so a toggle misreports state a
module changes on its own — use a readout.

**`docs/specs/rig.mjs` prose says the bind pose faces −Z; its own socket offsets
say +Z.** `socket.chest` at z +0.10 and `socket.back` at z −0.06 only describe a
character facing +Z. `rig.js` builds +Z because the offsets are load-bearing.
Art should correct the prose.
