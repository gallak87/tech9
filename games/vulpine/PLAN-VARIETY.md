# Vulpine — plan: making levels not look the same

**Written 2026-08-15. Branch `g/fox64`. Not yet linked from `ROADMAP.md`.**

Read with `ROADMAP.md` (the plan), `CONTRACT.md` (lane rules), `HANDOFF.md`
(queue + session log). This file is a *sequenced plan* for one problem, produced
from a read of the code, not from a build. **Nothing here has been implemented
and only what is marked "measured" has been measured.**

**Scope of this file.** All four phases are deliberately in one document because
the plan's value is the ordering: A gates B, B is the reason not to solve the
heightfield problem in D, and C is independent of all of it. Phase B should be
split into its own `PLAN-FURNITURE.md` **when it goes to implementation** and
needs an API contract — the DNA `props` schema, the placement-rule signatures,
and how the placer joins the job queue in `corneria.js:141`. That is the document
a sub-agent gets handed in its prompt; `HANDOFF.md` is explicit that making one
re-derive interfaces from source is what burned the budget before. Until then,
leave it here.

---

## The brief

Owner, 2026-08-15: built Fichina, "it looks basically the same as the first
level." Wants more levels, wants them to look different, wants the tooling to be
**reusable** so level 3 and 4 are cheaper than level 2 was. Also flagged the
z-rail as a constraint, and floated straightening it while widening the corridor
and the fly zone.

### Owner decisions taken this session

1. **Sequence: perf first, then the furniture layer.** Not furniture first — the
   frame is already over budget and props add pixels.
2. **Rail scope: verticality + a per-level offset box.** Keep the meander.
   Straightening the rail was explicitly considered and dropped (see
   [Rejected](#rejected-and-why)).

---

## Headline finding — probably the whole performance problem

**`quality=high` renders at DPR 2.5 on a Retina Mac.** `core/engine.js:99`:

```js
const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.q.pixelRatio;
```

`q.pixelRatio` **multiplies** the device pixel ratio instead of replacing or
capping it. On an M1 Mac `devicePixelRatio` is 2, `maxPixelRatio` is 2, and
`QUALITY.high.pixelRatio` is 1.25 (`engine.js:27`), so:

| tier | `q.pixelRatio` | effective DPR on M1 | pixels at a 1920×1080 window |
|---|---|---|---|
| low / medium | 1.0 | 2.0 | 8.29 MP |
| **high** | **1.25** | **2.5** | **12.96 MP** |
| ultra | 1.5 | 3.0 | 18.66 MP |

Against a DPR-1.0 reference of 2.07 MP, `high` is drawing **6.25× the pixels**.
The roadmap has already established, by measurement, that the frame is
**fill-bound** — draw count ruled out at 7% of a 38.6 ms frame, scene pass 65% of
the total. A 6.25× pixel multiplier on a fill-bound frame is the entire story.

**This also re-explains a note in `ROADMAP.md` that is currently wrong.** The
roadmap says headless ANGLE is "roughly 3× faster than real Chrome on the same
machine" and treats that as a renderer-backend difference. Playwright runs at
`devicePixelRatio` 1, so headless `high` is DPR 1.25 → 3.24 MP, against real
Chrome's 12.96 MP. **That is a 4× pixel-count difference, not a backend
difference.** The two measurements were never taken at the same resolution. Fix
the note when this is confirmed.

### Do this first, before anything else in this file

It is one line in the dev console and it either collapses the whole perf phase
into a one-line fix or rules it out:

```js
__VULPINE__.engine.setPixelRatio(0.5)   // → effective DPR 1.0 on a Retina Mac
__VULPINE__.stats()                     // fps / frameMs
```

Compare against `setPixelRatio(1.25)` (the shipped value, DPR 2.5). Take the
readings in **real Chrome on the owner's machine**, not headless — the whole
point is that headless has never seen these pixel counts. Follow the measurement
rules in [Measuring](#measuring-—-two-traps-that-have-already-cost-runs).

**Do not just lower the numbers in `QUALITY` and call it done.** The tiers are
also doing real work (`shadowMap`, `ao`, `aniso`, `bloomRes`), and DPR 1.0 on a
Retina panel will look softer than the owner is used to. The point of Phase A is
to put the *decision* in the right place and give it a knob.

---

## Why the two levels look the same

Three independent causes. Only the second is the one the owner is asking about,
and the third is the biggest.

### 1. The cross-section is a single hardcoded shape function

`world/profile.js:203`, `heightAtU(u, z, P)` is one grammar and only one:

```
riverbed dip → beach → shelf → cliff → plateau relief
```

`keys` in a DNA only feeds widths and heights into that one function. Fichina
moves `inner` 126→206 and repaints the palette, but a glacial U-trough, a
fortress trench, an open basin and a field of towers are **not expressible at any
parameter value**. Every world built from `keys` gets a flat floor at `bed`, a
terrace stack, one continuous slot, and nothing above the ship.

### 2. Both banks are the same shape

Side enters `heightAtU` only through `bankJitter()`'s phase offsets and the `wm`
side-wobble multiplier (`profile.js:208`). `P.beachW`, `P.cliffW`, `P.wallH` are
side-independent, so every world is near mirror-symmetric about the rail. One
overhanging wall against one shallow ramp reads as a different planet and costs
one term.

### 3. Neither level contains a single man-made object — this is the big one

Verified by grep, zero importers outside the defining file:

- `cityMaterial`, `concreteMaterial`, `steelMaterial`, `foliageMaterial`,
  `rockPropMaterial` — `world/world-materials.js:1313–1434`, ~500 lines of
  finished shader code, **imported by nothing**.
- `cityWeight(z)` (`profile.js:159`) tints terrain for a city that was never built.
- Eight registered review cameras (`w-city`, `w-city2`, `w-dam`, `w-bridge`,
  `w-damface`, `w-towers`, `w-arch`, `w-delta`) all frame empty canyon.
- `world/city.js` and `world/landmarks.js` do not exist.

**Two empty procedural canyons with different tint will always read as the same
game.** SF64's Corneria and Fichina barely differ in terrain either — one has
skyscrapers, arches and a waterfall, the other has radar dishes and ice rigs.

### The constraint that is not going away

`h = f(u, z)` is a **single-valued heightfield**. No overhangs, ceilings, tunnels
or arches at any parameter value, ever. The rail-aligned grid in `terrain.js` is
load-bearing for band-limiting, LOD, skirts and the baked sky-view term. **Do not
try to make the terrain do overhangs.**

The escape: **a ceiling does not have to be terrain.** Arches, ice bridges,
gantries, cavern roofs and hanging séracs are *props* — instanced meshes placed
against the height field. The single biggest missing axis falls out of the
furniture layer for free, with the terrain pipeline untouched.

---

## Phase A — perf (do first)

Goal: get real Chrome at 1080p comfortably inside budget **before** adding
geometry that covers the screen. Ship criterion 3 is 16.6 ms at 1080p on an M1
Pro.

- [ ] **A1. Measure the DPR hypothesis** in real Chrome, per the recipe above.
      Everything below branches on the result.
- [ ] **A2. Separate "device pixel ratio" from "render scale."** `q.pixelRatio`
      currently means both, which is what produced the 2.5. Intended shape:
      device DPR is *clamped* to something sane, and a separate `renderScale`
      multiplies it, defaulting to 1.0. Retune the `QUALITY` tiers around the new
      meaning — the current numbers were chosen against the old one and none of
      them survive the change unexamined.
- [ ] **A3. Expose render scale on the dev panel** (`dev/panel.js` `KNOBS`) so
      the owner can find the point where it stops looking good instead of an
      agent guessing. This is a look decision, not a perf decision.
- [ ] **A4. Only if A1 does not solve it** — the roadmap's measured conclusion
      stands and there are exactly two options, no third: cut per-pixel cost in
      the terrain/water shaders (triplanar is 3 samples where 1 often does; the
      lithology blend and the horizon lookup both run per fragment), or render
      the scene at reduced resolution and upscale. Post is death by a thousand
      cuts — six passes at 0.5–1.0 ms, none worth killing alone.
- [ ] **A5. Secondary candidate, unmeasured:** `preserveDrawingBuffer: true`
      (`engine.js:44`) is on permanently for the capture harness. It can force an
      extra full-framebuffer copy per frame. Gate it behind a capture flag and
      measure. Cheap to try, do not assume a win.

**Seams you will need.** `engine.resize()` (`engine.js:96`) is the only place DPR
is computed; `post.setSize(w, h, dpr)` (`postfx.js:1968`) fans it out to every
pass, deriving `pw/ph` once at the top. Both are already single points of truth —
this change should not need to touch individual passes.

---

## Phase B — the furniture layer (the main event)

**Build it as generic tooling, not as `world/city.js`.** The roadmap's Phase 9
names two one-off modules; that is the wrong shape for something that has to
serve four levels. This is the "reusable tooling to build level parts" the owner
asked for, and it is the largest visual differentiator available.

### Shape

A prop group is data in a DNA:

```
{ geometry: <factory>, material: <factory>, place: <rule>, z: [from, to], density, seed }
```

**Placement rules are the reusable part.** At minimum:

| rule | what it does | unlocks |
|---|---|---|
| `bank` | hugs a bank at a given height band, uses `landAtU`/`shoreU` | cities, ice rigs, gun emplacements |
| `floor` | scattered on the corridor floor | rubble, wreckage, séracs, pylons |
| `ridge` | on the skyline beyond the rim, silhouette only, cheap LOD | radar arrays, distant towers |
| **`span`** | **bridges the corridor — this is your ceiling** | arches, bridges, gantries, cavern roofs |
| `free` | explicit per-instance placement | one-off landmarks: the dam, the bridge |

Everything instanced. `render/geobuild.js` already exports ~20 mesh primitives
(`loft`, `superellipse`, `chamferBox`, `extrudePoly`, `ductGeo`, `louvers`,
`tubeAlong`, `shellArc`, `conformalPatch`, …) and the five materials are written
and tested. **The construction kit already exists; nothing consumes it.**

### Tasks

- [ ] **B1.** The placer + the five rules, driven off a `props` field on the DNA.
      Queue-based like `Terrain`, so it participates in `corneria.js`'s job list
      and the mid-flight rebuild budget (`corneria.js:141`).
- [ ] **B2.** Corneria's set: towers up both banks at `z ≈ -4400…-5800` off
      `cityWeight`, the breached dam (`-6060`), the bridge (`-4950`), natural
      arches (`-1720`), rock stacks, breakwater shoal. Ticks roadmap Phase 9.
- [ ] **B3.** Fichina's set, proving it generalises: ice rigs, radar arrays,
      pressure-ridge debris, and at least one `span` — an ice bridge or a
      collapsed sérac arch you fly under.
- [ ] **B4.** Make the eight dead review cameras show something.
- [ ] **B5.** Scatter — scrub and conifer canopy on the shelves
      (`foliageMaterial`).

### Watch for

- **Overdraw.** Props both add fill *and* occlude canyon behind them. Net effect
  is not obvious. Re-measure after B2, not after B5.
- **Instancing is not a perf win here.** Draw count is measured dead (7% of
  frame). Instance for memory and build time, not for frame time.
- **`span` props are the one thing that can occlude the rail.** They must not be
  placeable where they would put geometry inside the player's offset box without
  a gap the player can fly through. Worth an assertion at build time.
- **Chunk B so any stopping point leaves something wired.** The existing
  unimported modules are not a judgment problem — they are the residue of a
  session that fanned out to five parallel lanes, hit the usage ceiling in ~15
  minutes, and stopped mid-flight (`HANDOFF.md`, and the fan-out rule there is
  the standing fix: one sub-agent at a time plus yourself on a disjoint lane).
  The failure mode to design against is therefore **interruption**, not
  inattention. So: B1 lands with *one* placement rule and *one* real prop
  consuming it, not five rules and no consumer. Add rules one at a time, each
  with something that uses it. Ship criterion 7 then holds at every commit rather
  than only at the end of the phase.
- Good news for the estimate: the five materials are finished and tested. The
  expensive half of B is already written — what is missing is the placer.

---

## Phase C — rail verticality + per-level box (cheap, fold in anywhere)

**The rail's problem is not its curvature. It is that it is flat.** `centrelineY`
for Corneria is `base 44` plus waves of ±16 and ±7 (`dna.js:129`) — the rail
varies roughly 46 m of altitude across 9 km. Fichina is `base 52 ± 11`. It is
essentially a horizontal line in both worlds.

- [ ] **C1. Use the vertical axis that already exists.** A rail that climbs 400 m
      over a pass and dives down the far side is a completely different-feeling
      level with **zero new systems** — `centrelineY` is already sampled by the
      flight model, the cameras and the shots. Sines alone may not be enough;
      `centrelineX` has `bends` (smoothstep dog-legs, `profile.js:102`) and Y has
      no equivalent. Adding one is small and is the enabling change.
- [ ] **C2. Per-level offset box.** `TUNE.boxX` 105, `boxYUp` 78, `boxYDown` 46
      are global constants (`flight.js:22`). Move them into the DNA. Fichina's
      200–260 m trough should feel tight; an open basin should feel open. This is
      real pacing variety for a small change.
- [ ] **C3. Drop the rail below the surrounding terrain somewhere.** Combined
      with C1, this is the cheapest way to get "the world closes over you"
      without any prop work — the walls simply rise past the top of the frame.

**Constraint to respect:** the terrain grid shears along `centrelineDX`, and
`profile.js:98` records that past ~0.8 the "perpendicular" wall stops being
perpendicular and the lateral sample rate stops matching `spacing()`. A vertical
equivalent will have its own limit. Find it before authoring against it.

---

## Phase D — profile kinds + asymmetry

Cut this seam before Sector Ω, not after — that level needs it anyway.

- [ ] **D1.** `heightAtU` dispatches on `dna.profileKind` instead of hardcoding
      the terrace stack: `terrace` (today, the default), `trough` (U-shaped, no
      terraces), `trench` (near-vertical, flat floor with slots), `basin` (walls
      recede entirely — pacing as much as looks), `none` (no ground at all, for
      Sector Ω; `surface: 'none'` already exists and is handled in
      `corneria.js:134` and `groundAt`).
- [ ] **D2.** Per-side keys. Let a `keys` entry optionally carry `L`/`R` variants
      so banks can differ. One overhanging wall against one shallow ramp.
- [ ] **D3.** A floor that does something — ice steps, a floor that climbs to a
      pass and drops away, or breaks into gaps you dive through.

**Hard constraint on all three:** whatever `heightAtU` becomes, it stays a pure
function of `(u, z)` with no per-sample object dereference, and the two mesh
tiers must agree exactly at the shared boundary column at `nearHalf`. If they
disagree about the band limit there they disagree about the height there, and
that opens a seam down the entire level — this is documented at
`profile.js:188–202` and it is what the lateral skirts were papering over.

---

## Rejected, and why

- **Straightening the rail.** The owner floated it. It is a downgrade: the
  meander is what makes walls sweep past and what stops the corridor reading as a
  tube. A straight rail down a wide canyon at 175 m/s is *more* monotonous, not
  less. The half of the instinct worth keeping is C2 (per-level box) and widening
  the corridor **in some stretches as a contrast against tight ones** — uniformly
  wide is just uniformly empty.
- **Rebuilding from scratch on a different premise.** ~25k lines, a flight model
  that took several sessions to stop fighting the owner, a post chain that is
  dialled in and owner-tuned. The variety wanted lives in the content layer.
- **Making the terrain do overhangs.** See the heightfield constraint above.
  Props instead.
- **Off-rail / all-range sections.** Genuinely the biggest pacing lever, and
  `flight.detached` already exists (the campaign hop uses it). Currently in
  `ROADMAP.md`'s "Not doing", and it is meaningful new work in AI and camera. Not
  rejected on merit — deferred. Raise it again after Phase B.

---

## Measuring — two traps that have already cost runs

Both from `ROADMAP.md`, both still apply, plus one new one:

1. **A/B by flying is unreadable.** Frame time swings 25–34 ms on scene content
   alone, a bigger effect than most settings under test. Fix the `shot` and the
   `t`.
2. **Never call `env.apply()` between arms.** It bakes a PMREM whose spike
   outlives the settle window, and `engine.avgFrameMs` is a 45-frame EMA
   (`engine.js:117`) that carries it. A pass that did this reported every
   *disabled* pass as costing time.
3. **New: never compare a headless number to a real-Chrome number.** They have
   never been at the same pixel count. Every absolute in `ROADMAP.md`'s per-pass
   table is headless at DPR 1.25; the owner's 26–40 fps is real Chrome at DPR
   2.5. The *splits* in that table are still valid; the milliseconds are not
   comparable across the two.

---

## Open questions for the owner

- **Render scale is a look decision.** Once A3 lands, the owner should pick the
  point where softness stops being acceptable. Do not have an agent guess.
- **How different should level 3 be?** Sector Ω (asteroid belt, no ground) is
  nearly free once Phase B exists and is guaranteed to look nothing like the
  first two — but it also skips the terrain work entirely, so it proves nothing
  about Phase D. Venom (lava + fortress trench) exercises D1's `trench` kind.
- **Does Fichina get a boss?** `commander:ice` is still wired through the
  ordinary enemy path — no health bar, no station-keeping, no win trigger, so
  Fichina cannot hand off to a level 3 yet. This is an open Phase 8 item and it
  blocks the campaign regardless of anything in this file.
