# Phase 2 — Character Handoff

Status and rules. `docs/phase2-retry/` holds the character pipeline and its detail.

Last updated: 2026-09-05.

---

# Status

Kaida's mesh is **generated, not code-built** — ruled 2026-09-04. The
binary-asset ban is overturned for character meshes and their textures; it
stands for procedural world materials.

| | |
|---|---|
| Reference generation | ✅ `docs/phase2-retry/ (reference generation not yet ported)` |
| Image → mesh | ✅ Hunyuan3D-2.1 MLX, local, both stages |
| Auto-rig | ❌ Not solved. Mixamo by hand for now. |
| Engine loader | ✅ A rigged character loads, scales, maps and animates |
| Retarget delta | ❌ `bindMode: additive` is a stand-in |

**GRADUATED 2026-09-05.** Kaida IS the forged character — no flag. Just open the
game. `?forge=0` forces the code-built rig for everyone, which is the A/B when
something looks wrong and the question is whether the mesh or the engine did it.

**Supersedes 2.1–2.3 in GAME_PLAN.md.** Those phases specify cross-section
station tables, a geobuild port and per-part silhouette passes, all of which
assume code-built geometry.

## Next for the pipeline

1. Rig a generated mesh and check shoulder deformation — the test that decides whether generated meshes are viable
2. Wire the auto-rig stage in `docs/phase2-retry/pipeline.mjs`, which still refuses
3. Re-baseline `tools/rig.mjs` palette bands against a generated mesh

Detail, commands and failures: `docs/phase2-retry/README.md` and
`docs/phase2-retry/README.md`.

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

# What exists — code-built path

Still what Vex, Rune and the enemies are built from, and still the fallback if a
glb fails to load. Kaida no longer uses it except under `?forge=0`.

## Play-tester — `src/traversal/index.js`

A **sample**, not the traversal tier: one character, no party, no collision, no
footfalls (all Phase 5). Writes `base.x/z/yaw`; the actors lane's `place()`
grounds her. No shared-core file touched.

Graduated out of `?play=1` on 2026-09-05 — driving is how the game opens.

```
(nothing)          boot into it, no panel
&play=0            opt OUT. Every tool in tools/ passes this, so review captures
                   frame the world and not the back of Kaida's head.
&dev=1             readouts while driving: Move / Slope / Frame / Rig / Cast / Feet
&dev=2             LOOK MODE — Spin / Orbit / Tilt / Zoom / Reset
&tune=1            speed, damping, frame height, position
&map=<id>          any of the twelve, or `proto` for the placeholder dune
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

Decals (belt, buckle, lapels, cuff, eyes) sit on another surface rather than
forming the silhouette, and sit a measured `CLR` clear of their host rather than
coincident with it. They used to also carry `aInk` so the outline hull would not
expand them out through their host; the outline was removed 2026-09-05 and the
attribute with it. The clearance is the half that was always about geometry.

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
| `rig-gate-palette-margin-eroded` | **Partly resolved 2026-09-05**: removing the outline hull restored `normals flipped` detection — the hull was masking it. `--selftest` now misses only `limb blow-up`, a SILHOUETTE-band miss, not a palette one. Original note: The joint-overlap geometry changed the histogram until a full flip no longer clears `tv ≤ 0.28`. **Re-survey clean tv across all four characters and TIGHTEN the band to ~1.4× above the new clean worst. Do not widen it** — that deletes the assertion. |
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
