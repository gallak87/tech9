# Phase 2 — Running Handoff

Working notes for the character phase. GAME_PLAN.md holds the *plan*; this holds
*where we actually are*, what was tried, and what was learned. Append, don't
rewrite — the point is that an interrupted session resumes without re-deriving.

Last updated: 2026-09-04, after the play-tester landed.

---

## Where we are

| | |
|---|---|
| **Phase 2** | build wave landed (`4673b83`). Rig gate green. **Look gate NOT passed.** |
| **Phase 2.0.1** | play-tester landed (`fd55f3d` + follow-up). WASD, real terrain. |
| **Phase 2.1+** | Kaida redesign — not started |

## The thing that matters

**Every part of every character is one primitive: `prism()`, a tapered box.**
`src/actors/rig.js` says so in its own comment: *"Everything on this character is
one of these — that is the point."* That was the wrong call. Pixel-snap, tone
bands and palette are all downstream of a silhouette made of rectangles. No
amount of tuning the three fixes it.

Human verdict, 2026-09-04: *"the entire shape of the characters really really
doesn't match what I want for this game."* The animation is fine — run, attack
and victory all read. It is the **modelling** that is wrong.

### What the reference has that the rig doesn't

Read off `games/chronoforge/src/assets/kaida_*.png` (6 images, 128×128, RGB on
black — no alpha, but the mask extracts on a luminance threshold).

| Sprite | Rig |
|---|---|
| Pink bob as a real volume, asymmetric | flat magenta slab glued to a cube |
| A small face; head ≈ 1/6 of height | a cube with a glowing white bar that eats it |
| Shoulders, waist, hips, tapered limbs | one box torso, four box limbs |
| ~6.5 heads tall, flared boots and gloves | realistic 7.5-head, reads generic at any distance |

### The fix: `geobuild.js`, already in this repo

`games/vulpine/src/render/geobuild.js` — 819 lines, imports only `THREE` and
`mergeGeometries`, **zero vulpine coupling**. A clean lift.

```
loft()        superellipse(count, rx, ry, p)    chamferBox()
extrudePoly() tubeAlong()   shellArc()   mirrorX()   blisterGeo()
```

The Arwing fuselage is a swept superellipse: a stack of cross-sections each with
its own `rx / ry / p / squash`. **`p` is the box↔round knob** — p=2 ellipse, p=4
rounded rectangle, p→∞ box. That is precisely the primitive the character rig
lacks. A limb is a 4-station loft; a torso a 7-station loft with a waist; a head
a `chamferBox` plus hair from `shellArc` / `extrudePoly`.

No Blender, no Meshy, no voxels, no new dependency. Considered and rejected:
Blender/Meshy is the binary asset pipeline this game exists to avoid; voxel *is*
boxes; billboarded sprites is chronoforge2d, which is the thing that stalled.

---

## Rules for this phase — human decisions, do not drift

1. **KAIDA ONLY.** Vex, Rune, the grunt, per-character animation clips and the
   victory/cast tweaks all wait. Nail her; she becomes the reference.
2. **The sprites are a DESIGN INPUT, NOT A SCORING TARGET.** Take the
   originality — pink hair, glowing blue blade, the fact that every character is
   distinct. Do **not** build an A/B scorer grading 3D cross-sections against 2D
   illustration pixels. A silhouette-IoU scorer was proposed and *rejected by the
   human*: it optimises toward matching an illustration, which is not the goal.
3. **THE HUMAN IS THE LOOK GATE.** An agent critic may only hold ground the human
   has already taken — once a part is signed off it is hash-locked via
   `gate.fingerprint(part)` and the critic asserts it has not drifted. It never
   judges an unsigned part. Symmetric parts derive: left arm signed ⇒ critic
   covers the right.
4. **2.3 is two passes.** Whole-body silhouette first, one sign-off — proportion
   is the thing that cannot be fixed later. Then detail per part.
5. **Animation feedback is parked** until the end of the character phase.
   Standing note: victory and cast each want a tiny tweak, and clips should
   eventually be per-character rather than shared.

---

## Play-tester — `src/traversal/index.js`

Phase 2.0.1. A **sample**, not the traversal tier: one character, no party, no
collision, no footfalls. Writes `base.x/z/yaw`; the actors lane's own `place()`
grounds her. No shared-core file touched.

```
?play=1            boot into it, no panel
?play=1&dev=1      readouts you glance at while driving
?play=1&dev=2      LOOK MODE — Orbit / Tilt / Zoom / Reset, and nothing else
?play=1&tune=1     the knobs, when you mean to tune something
```

WASD / arrows · **Shift** sprint · **Space** attack · **C** cast · **V** victory
· **H** hurt.

- Movement is camera-relative. Diagonals normalise. Facing eases on a shorter
  half-life than movement or she reads drunk. Blur clears held keys.
- `Animator.timeScale` (added in `poses.js`) is driven from ground speed against
  `REF_RUN_SPEED`, so a sprint takes *faster steps* rather than longer ones.
  One multiply; it is the whole fix for foot skate.
- `PLAY_FRAME_HEIGHT_M = 10.0` overrides the shipping 18 while playing — 18 puts
  her at 43 px, too far to judge a character by. Not a re-lock; `assertLocked()`
  only guards pitch and yaw.

### Bugs found and fixed here

- **One-shot latch.** Pressing Space once left her floating for the rest of the
  session. Traversal mirrored the current clip in a local variable, but a
  one-shot queues itself back to `idle` *inside* `anim.update()`, so `finished`
  is true for zero observable frames from outside. The mirror latched on
  `attack` forever. Fix: read `player.anim.clip` directly — the animator is the
  single source of truth. The human first suspected the rig dev-panel controls;
  it was not those, it reproduced with the panel closed.
- **Rig viewer fights the play sample.** It stages its own four-actor lineup and
  force-poses every actor in the scene. It is no longer registered while
  `?play=1` is driving.

### devpanel gotchas, learned the hard way

`src/core/devpanel.js` is **INTEGRATOR ONLY**. Both of these were found by trying:

- Its `update()` starts `if (root.className) return` — it treats *any* class on
  `#dawn-dev` as "hidden". Adding a class to the root silently stops its own
  readouts. Hide groups by setting `display` on the `.grp` divs instead.
- `register()` rejects a control with a falsy `label`, so a control registered
  purely for a side effect still needs a real one.
- Toggles `sync()` **on click only**, never per frame. A toggle is the wrong
  widget for state a module changes on its own — that is why WASD and Viewer
  read OFF while Kaida was live. Use a readout.

Open issue `devpanel-no-group-filter`: hiding other lanes' groups is done in
this file as a stopgap. The real fix is a `collapsed` option on `dev.register`,
and it belongs to the integrator.

---

## Measurements worth not re-deriving

**Framing.** Live at 1920×1080, dawn 6.4, `showcase=actors`:

| FRAME_HEIGHT_M | heroPx | snapUnitPx |
|---|---|---|
| 18 (shipping) | 43.1 | 0.895 |
| 15.4 (Phase 1.3 battle floor) | 47.2 | 0.981 |
| 12.4 | 52.1 | 1.082 |
| 11.0 | 53.9 | 1.119 |

The pixel-snap is a **no-op** at the shipping framing — snapping to under one
pixel does nothing. The spec assumed ~62 px / 1.3. **Framing cannot get there**:
a vertical character at 55° pitch does not scale with metres-of-ground-plane,
and 11.0 is already well under the battle floor. Only `SPRITE_PX_PER_METRE`
reaches it — 19.3 gives 1.3, 16.7 gives 1.5, 12.5 gives 2.0, i.e. a hero of
33 / 29 / 21 virtual rows instead of 48. **Art call, deferred.** The human found
the whole pixel-density question unactionable without seeing the character
first, which is fair — it is downstream of the redesign.

**Slope.** `MAX_WALKABLE_SLOPE_DEG = 34`; biomes run 18–28°. Driving the play
sample reaches **38.3°** on the placeholder dunes. At a run her feet are ~0.7 m
apart fore-aft, so 34° is **0.47 m of height difference against an 0.88 m leg** —
more than half a leg in the air. At a routine 20° slope it is still 0.25 m.
Placement is a single `heightAt()` sample at the root and she stands
world-vertical. Human predicted this before seeing it. Issue
`rig-no-slope-response`, scheduled Phase 2.4.

**Rig gate.** `tools/rig.mjs` — 4 characters × 7 poses × 6 phases = 168 samples.
Zero material drift. Bands are surveyed with ~1.4× headroom, not invented.
`--selftest` injects four faults and catches all four. Note for whoever changes
the rig: the head-re-tint fault was originally aimed at the PALETTE assertion and
**missed** — the head is ~8% of the silhouette, so painting it magenta moves the
frame histogram *less* (tv 0.096) than raising an arm into the key light does
(0.190). Per-part identity lives in the fingerprint. Re-run `--selftest` after
any change to the rig, the material, or the bands.

---

## Open, and blocking nothing yet

- `uPivot 0.34` crushes the cast to black under dawn exposure; 0.10 restores the
  palettes. It is a knob, but the right default needs an hour sweep, not a single
  dawn frame. Probably moot after the redesign — re-measure then.
- Dither reads as checkerboard on small limbs. `MeshStandardMaterial
  dithering:true` fights a material that deliberately bands. Try `false`.
- `docs/specs/rig.mjs` prose says the bind pose faces −Z; its own socket offsets
  say +Z. `src/actors/rig.js` builds +Z because the offsets are load-bearing.
  Art should fix the prose.
- No contact shadow on any actor. Defect 3. Phase 2.4.

---

## 2026-09-04, later — Kaida rebuilt (2.1 + 2.2 + 2.3 pass 1)

Done while the human was away. **Not signed off** — 2.3 pass 1 is silhouette, and
the human is the look gate.

**2.2 — geobuild ported.** `src/render/geobuild.js`, a straight lift from
vulpine. `src/actors/shape.js` wraps it in three body-shaped helpers: `limb()`
(a stack of superellipse cross-sections lofted up the bone), `slab()`, `spike()`.
They return `{pos,nor,idx}` because that is what `mergeParts` consumes, not a
BufferGeometry.

**2.1 + 2.3 — `src/actors/kaida.js`.** `shellParts()` in rig.js delegates when
`id === 'kaida'`; the other three keep prisms until their own pass. Her palette
is **sampled** off `kaida_overworld.png` — the inherited `HERO_PALETTES.kaida`
was invented and wrong where you can see it (`clothPrimary #1c2f44`, a dark navy,
for a jacket that is plainly teal).

Landed: lofted pelvis and torso with a **real waist** (narrower than both the
ribs above and the hips below — the relationship a box cannot express), a rounded
skull that tapers to a jaw, a four-mass bob replacing the slab, rolled-sleeve
cuff over a bare forearm, boot flaring over the calf, crystal blade with a brass
guard, and the IFF chest triangle deleted.

### Three bugs found on the way, all worth keeping

- **The snap scaled with zoom.** `snapUnitPx` reached **16.6** in look mode and
  shattered her into loose plates with gaps. The human saw that and read it as a
  modelling failure; it was the snap. Clamped at `SNAP_MAX_PX = 2.4`.
- **Hand sockets point every weapon at its owner's shoulder.** A hand bone's
  local +Y runs *up* the arm, so the spec's grip-at-origin/+Y-to-tip convention
  aimed Kaida's blade backwards. Rotating the hand sockets fixes it — but doing
  it for everyone failed the gate on Vex, whose staff then dangles below her feet
  (1.816 m vs a 1.660 m spec). Scoped to Kaida. Issue `weapon-socket-inverted`.
- **Hair buried inside the skull.** The fringe sat at z 0.062 with a half-depth
  of 0.020, so its front landed at 0.082 while the skull's own front is at 0.092.
  What read as a black hole where her face should be was the skull's shadowed
  interior showing through a z-fight. **Sit hair outside the skull, always.**

### What is still wrong — say this out loud, do not oversell

- **The face is a blank white mask.** No features read from the front. This is
  the first thing anyone will look at.
- **The hair reads as a helmet**, not a bob — the masses are too hard-edged and
  sit like headphones.
- Trousers still crush to near-black under the toon ramp even after lifting the
  sampled colour. Same root cause as `rig-toon-pivot-miscalibrated`.
- The blade blows to white rather than reading magenta.
- No contact shadow. She floats. Phase 2.4.
- She reads leggier than the intended 5.5 heads.

Gate: `tools/rig.mjs --selftest` exits 0, all four characters, 4/4 faults caught.
Dawn 6.4 unregressed at median 0.212. Shots in `shots/kaida/`.
