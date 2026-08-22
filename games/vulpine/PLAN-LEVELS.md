# Vulpine — level identity: two curves

Open lane. **1-5, 7 and 8 landed, and 9 all but the Foundry; 6 open.**
The owner picks when each starts.

A zone carries its own cross-section, its own ceiling and its own camera; the
hull pitches with the corridor; a surface can be floor or ceiling depending
which side of it the rail runs; and speed is measured along the rail rather than
down the z axis. **Phase 6 is what is left**, and it needs the last piece of
phase 4 — see "Phase 4, as landed".

Companion docs: `ROADMAP.md` is the queue, `HANDOFF.md` the harness and traps,
`PLAN-PERF.md` the other open lane, `REVIEW.md` the rubric.

## The problem

Owner, seeing five levels side by side: *"they all essentially look like
Corneria with filters/textures."*

Geometry, not shading, and provable twice. The five levels in question are
exactly the five sharing `backend: 'terrain'`; the two the owner did not reach
for are Omega (`field`) and the Foundry (`works`). And inside that backend
`heightAtU` folded about `Math.abs(u)` and stacked `bed → beachH → shelfH →
wallH`, each higher than the last — so every terrain level was not merely
symmetric but a **valley by construction**. The nine authorable numbers were all
widths and heights; none was a shape.

**Ruled out: another palette, lithology or structure-GLSL pass.** Shading is
downstream of the cross-section. Fortuna is the proof — the most distinctive
shading in the game, still reads as Corneria at night.

**Why it collapsed onto one backend** is an incentive, not a discipline failure.
A level via DNA costs a data object and no code; a backend costs a mesher, a
`groundAt` branch and new materials. Everyone took the cheap path and the cheap
path only produces parameter variation.

## Ownership

**Planet** owns what it is made of — lithology, palette, structure shader, prop
kit, sky. **Level** owns what shape it is — cross-section, rail path, ceiling,
surface. Same rock, different topography.

## The two curves

**Curve 1 — the cross-section.** A polyline in (u, height), signed across both
banks, replacing the band stack. Landed in phase 1.

**Curve 2 — the rail.** Today `z ↦ (centrelineX(z), centrelineY(z), z)`, with
`flight.js:335` binding `pos.z ≡ railZ` exactly — z is simultaneously the
parameter and a world axis. Becomes an arc-length parameterised 3D path `p(s)`.
Buys real vertical excursion and the orbit arena; `railZ` stays monotone so the
three cursors at `combat.js:1759-1774` keep working. Phase 4.

## The four levels

| | section | rail path | ceiling | surface |
|---|---|---|---|---|
| Aquas | terraced, asymmetric | deep dive | constant lid | none |
| Fortuna | near-flat | dive + climb | **enters/exits** | water |
| Foundry | escarpment | steep shaft | built, varies | deck |
| Venom | **inverted** | rhythm | **alternates** | lava |

No two rows alike — the acceptance test for the lane.

- **Aquas — depth is the drama.** Plunge in; shallows with terraced reef benches
  you fly *between*; a hard-asymmetric drop-off (reef to port, open blue to
  starboard); a trench the rail dives into where the lid leaves view; rise to an
  open bowl.
- **Fortuna — two layers, and the canopy is both.** Fly *over* a sea of glowing
  crowns (canopy as floor), dive through a gap, thread the dark understory
  (canopy as ceiling), climb back out. Nothing else changes which side of an
  object you are on.
- **The Foundry — outside, inside, then down.** Exterior gantry run as an
  escarpment, breach to interior, a steep shaft down through decks, then a wide
  low-ceilinged assembly floor.
- **Venom — rhythm, then the arena.** Inverted profile riding a caldera crest
  with lava falling away both sides; plunge into a tube; out, in, out; then a
  closed orbital path for the finale.

## Phases

| # | Deliverable | Status |
|---|---|---|
| 1 | Cross-section becomes a polyline; `Math.abs(u)` gone | **done 2026-08-21** |
| 2 | Authorable `section` on a zone; Venom's ridge, Aquas' terraces + drop-off | **done 2026-08-21** |
| 3 | Per-zone `ceiling`; wire player flight to `ceilingAt` | **done 2026-08-22** |
| 4 | `path` refactor — rail becomes arc-length `p(s)` | **done 2026-08-22**, less the path indirection phase 6 carries |
| 5 | Hull pitch from `railDir` — anything steep is wrong until this lands | **done 2026-08-22** |
| 6 | Venom orbit arena | open |
| 7 | Per-level camera — the lens, not the world | **done 2026-08-22**; Venom authored, 6 levels on defaults |
| 8 | Aquas' plunge — the rail crosses the water surface | **done 2026-08-22** |
| 9 | **The authoring pass** — one distinct shape per level | Fichina, Fortuna, Venom, Aquas **done**; the Foundry open |

Numbers are identifiers, not an order. **7 and 9 block on nothing** — 7 is a
data change, and 9 can author any level whose mechanism exists, which after
phase 3 is section and ceiling on all five terrain levels.

Phases 8 and 9 were split out of phase 5, which carried "the vertical drama in
all four" as a clause. Phase 9's acceptance test is `tools/shape.mjs --strict`.

**Still to author (phase 9):** Corneria stays as it is — it is the reference.
Only the Foundry is left, and it is **not** an authoring job: `works` is one box
for all 9 km (`half`, `deckY`, `roofY` fixed in `dna.js`, and `Works.deckY()` is
a static with no z), so three of its four brief beats have nothing to author
into. It needs the mechanism pass phases 2 and 3 gave `terrain`, done again for
`works`, before a section means anything there.

### Deliberately not doing

**True free flight.** Needs a parallel trigger system for three monotone
cursors, a new end-of-level test (`campaign.js:523` is the only one), and ~20
−z-is-forward sites across `ai.js` and `combat.js`. The orbit path gets the feel
for a fraction of it.

**Asymmetric lateral *extent*.** The mesher's column layout is symmetric by
construction (`terrain.js:35-55`). Land can be lower on one side, not wider.

## Two levers that are not phases

Decisions a level makes, not stages. Neither depends on phase 4.

**The floor need not be a plane at y = 0.** Four of the five terrain levels put
a surface there (water, ice, lava); the fifth is bare terrain at the same
height. A level whose floor sits far below the rail, flown between spires with
no readable ground, reads as none of the others. Cheap version: `waterLevel`
well under `bed`, so no plane draws at all.

**The camera never changes.** `camBack` 17.0, `camUp` 3.15, `camLookAhead` 46,
`camLookUp` 2.6, `fovBase` 58 — one set of numbers for all seven levels, so a
different world still arrives through an identical lens. Per-level values are a
data change: `TUNE` is a mutable export and `main.js:46` already overrides
`railYawFollow` from a URL param. Phase 7.

Measure with `tools/framing.mjs`. Known reading: ~3.5° of hands-off yaw is
shake, not drift — `off.x`/`off.y` measure zero variance. Do not chase it.

## Phase 1, as landed

`profileAt` generates a nine-point polyline onto the profile object; `heightAtU`
evaluates it with `sectionAt` at a signed offset. The band fields still drive
everything — phase 2 opens the authoring path.

Equivalence was measured rather than assumed: 340.7 M samples across all five
terrain levels, every `wm` extreme, both banks, worst difference **3.4e-13 m**
(1.4e-14 relative). After the Float32 the mesh stores, 0.0034% of samples move
by one ULP — about 30 µm at wall height — because the old band stack accumulated
`beachH + (shelfH - beachH)` where the polyline uses `shelfH` directly. The
digest baseline was re-cut at that commit rather than contorting the evaluator
to reproduce a float-ordering artefact.

## Phase 2, as landed

A zone may carry `section: [[u, h] x 9]`, validated in `zones.js` for count,
finiteness and strictly ascending u. Zones without one still generate the
symmetric nine-point equivalent from the band fields, so authored and generated
sections mix freely and `profileAt` blends them point-wise. `MAX_HALF_WIDTH` now
measures an authored section's own extent rather than the band sum. `freecam`
gained `--level`, without which it could only ever park in Corneria — which is
useless to a lane about level shape.

Authored: **Venom zone 1**, the inverted caldera rim — a basalt spine at y = 26
with the lava plane at 0, lakes past 500 m and the caldera wall a kilometre out
at 210 m. **Aquas zone 1**, terraced reef benches, deliberately unequal across
the channel. **Aquas zone 4**, the drop-off — port wall at +300, starboard
falling to −420.

Three things learned authoring them, all of which cost a capture cycle:

- **The chase camera needs about 340 m of margin, not 105.** A spine whose zero
  crossing sat at 215 m put the camera in the lava through half the zone while
  the *ship* stayed dry: the camera trails behind and below and banks with the
  roll, so `boxX` is a floor on the margin, not the margin.
- **Blending an inverted section into an upright one passes through flat**, and
  on a level with a surface plane at y = 0 flat means flooded. Venom's ridge sat
  awash for seven seconds at a 1200 m blend. Short blends across an inversion.
- **A drop-off needs something to read against.** Aquas' starboard side falls
  420 m into fog, and fog is what the eye already expects there, so the void
  reads as distance rather than as a cliff edge. Geometry is correct and
  measured; the *look* is unresolved — see the open item below.

## Phase 3, as landed

A zone may carry `ceiling: <metres>`, rejected at author time on a level with no
`canopy` — the field would otherwise be inert. `ceilingAtZ(z)` in `profile.js`
blends it between keys with its own key walk rather than a field on `profileAt`:
the lid is read once per craft per tick, while `profileAt` feeds a per-vertex
loop with no use for it. Every key is given a finite lid at load, so the blend
never meets a sentinel, and a world with no canopy answers `Infinity` before it
reaches the keys.

`Canopy.ceilingY(z)` takes a z and the plane tracks the lid at the camera's own
z, so a varying ceiling is drawn where `ceilingAt` reports one. The plane is
still flat and still camera-following: a lid that must be *seen* to slope needs
`water.js`'s rail-aligned strips and the triangle argument in `canopy.js`'s
header re-made. Deferred, not forgotten.

Player flight honours it at `flight.js:352-370`, mirroring the ground's
cushion-then-clamp. Three things it does that the floor does not:

- **Runs before the floor**, so the floor wins a corridor too tight for both.
  Through the roof is a wrong picture; through the ground is no picture at all.
- **Stands down while `climb` is non-zero.** The hop deliberately leaves the
  level, and a lid is the one thing that would hold it in.
- **A 6 m cushion against the floor's 9.** A roof is ducked under, not skimmed.

Measured, not assumed. With a 120 m lid authored onto Aquas zone 2 and the clamp
disabled, the ship goes **40.2 m through the roof**; with it wired, held under,
worst approach **−5.5 m** with the cushion engaged. The lid it is held at reads
106.1 = the authored 120 less the canopy's 14 m margin, so the authored number
reaches the clamp intact.

**The Foundry's roof was never reachable.** `boxYUp` is 78, and its lid sits
25.9 m above the highest the offset box can carry the ship — measured identical
on the pre-change tree. The player could not fly through it in practice, so this
phase is a mechanism for phases 5-6 to author against rather than a fix to
something that was being felt.

## Phase 7, as landed

A DNA may carry `camera: { back, up, lookAhead, lookUp, fov }`; unset fields
fall through to `TUNE`, so a level frames as it always did until it says
otherwise. Unknown or non-finite keys throw at activation — a misspelled key is
otherwise a level that silently frames like every other one, which is the defect
the field exists to fix.

Resolved through a `lens` getter on `Flight`, cached on `WORLD.camera`'s
identity. Not by mutating `TUNE`, which would persist across a level swap.

**Venom authors values**, the rest are on defaults. `{ up: 9, back: 21,
lookAhead: 38, lookUp: 0, fov: 66 }` — a ridge is read across the corridor, not
down it, and the default lens fills the frame with whatever stands at the end of
the channel. Framed against Corneria rather than by eye: Corneria's ship sits at
ndcY −0.124 to −0.515, Venom at −0.239 to −0.488.

`framing.mjs` gained `--level`. Without it it could only measure Corneria.

## Phase 9, as landed so far

**Fichina — the pass is terrain.** The rail climbed 154 m over it while the
floor stayed flat at −10, so the pass was the same ice from higher up: clearance
went 59 → 215 m and nothing about the place changed. The pass and the narrows
after it now carry sections that climb with the rail, holding 55−74 m
throughout, and the descent belongs to the zone carrying the −160. Asymmetric
through it: sheer face to port, a hanging bench at ~275 running 340 m to
starboard. `shots/p9-fichina-pass/`.

**A section is not enough on its own.** The first pass at both of these kept
the two outermost points high, so the tallest thing in frame was still a wall on
each bank — a spine with walls around it is a valley with a lump in it. Both now
fall away to below their surface plane at both ends.

`relief` has to come down with the section. The relief gate opens past the
second-outermost point and the noise bands build a skyline out there whatever
the polyline says; Venom's 0.70 was rebuilding the walls the section had just
removed. 0.14.

**Fortuna — the glade is a plateau.** It was the most static level in the game,
FLAT at nine of twelve samples with the floor moving 9 m over 10 km. The glade
now sits on a mat plateau at 110, inside the stalks' own 90−320 rather than
under them, and the gorge after it drops the same 130 back to lagoon level.
`shots/p9-fortuna-glade/`.

Its two layers are **heights, not sides of a surface**: `surface: 'water'` at
y = 0 makes `groundAt` clamp there, so Fortuna cannot descend at all. The
brief's over/under-the-canopy version needs phase 8.

**The fix this surfaced.** A zone's `climb` yBend was centred on the entry key,
so it was half done when the held stretch began — against this file's own
comment. Centred on the zone boundary it spans exactly the two keys the
cross-section blends between. A zone raising both floor and rail was pinching
the corridor by `climb/2` on the way in: Fichina's pass measured 19 m mid-blend
against 55−70 either side.

**Nothing gates rail Y.** `centrelineY` moves the rail; the digest's lattice
samples `terrainHeight`, which reads `centrelineX` only. That fix moved every
climbing rail in the game and the digest reported nothing.

**Aquas — read against its brief, and two of five beats were missing.** The
plunge, the drop-off and the bowl were there. The terraces and the trench were
not, and both failures were structural rather than a matter of numbers.

*The terraces were stranded by phase 8.* They were authored onto zone 0, which
phase 8 turned into the above-water approach: the ship flies it at 710 and the
benches top out at 151, so they sat 590 m below through teal extinction, and no
section authored into that zone could have been seen. They moved to zone 1,
whose held section starts at the key the dive ends on — so they arrive as the
ship levels out. At 280−300 m rather than 555−790, port topping 118 and
starboard 78 against a rail at 62, which is what makes it flying *between* them.
`shots/p9-aquas-terrace-out.png`.

Measured as a shift from the far field into the near: at the sample that lands
there, near-field rise went 31 → 96 m and the far wall behind it 406 → 99. The
benches are now the tallest thing in frame rather than something in front of a
wall — the same lesson Fichina and Fortuna cost.

**400 m is the floor on how close a bench can come, and it is the camera.** The
tracked item asked for "inside ~350 m". What actually binds is phase 2's
finding that the chase camera wants ~340 m of margin, not `boxX`'s 105 — so a
bench is only allowed closer than that where the near field under it stays below
the rail. Aquas' does: ±105 reads −12 to −24 against a rail at 62, and the
outermost the ship or the trailing camera reaches is clear by 68−75 m.

*The rail did not dive into the trench.* It ran flat at 19−20 through it while
the floor rose, which is a corridor tightening, not a descent — and the corridor
it left was **29 m** against the 55 the offset box and its cushion want. The
gorge now carries `climb: -55` and the bowl returns +85 instead of +30.

**A generated section pins the bank line at 0 whatever `bed` is.** Deepening
`bed` alone moves the trough and leaves the shoulders, so the first attempt
dropped the rail 55 m into a corridor that had not widened and made clearance
*worse* — median 23 → −2. Both zones needed authored sections, which put the
whole cross-section down with the rail: median clearance 23 → 65 in the trench
and 22 → 68 in the narrows. Anything that descends is subject to this; it is
waiting for the Foundry's shaft.

**The walls stop just short of the lid on purpose.** "Where the lid leaves view"
and "terrain must not break the sea" pull opposite ways, and the resolution is
40−65 m of water over the rim: peaks 547 and 580 against the 620 lid, from
829/775 before. `shots/p9-aquas-trench-out.png`.

Flown, not only measured: `pilot.mjs fly --params level=aquas` runs the corridor
end to end, 12 kills, no console error, and 0 of 19 samples with the hull near a
frame edge.

## Phase 4, as landed

`railStretch(z)` in `profile.js` is the length of dp/dz, and the rail advance
divides by it:

```js
if (!this.detached) this.railZ -= (this.speed / railStretch(this.railZ)) * dt;
```

That is the whole mechanism. `railZ` still parameterises the rail, is still in
metres of z and is still monotone, so the three cursors at `combat.js:1760-1774`
and the end-of-level test at `campaign.js:549` never knew it changed.

**What it was.** `speed` was the projection of velocity onto world −z, not
speed along the path, so any gradient or turn flew the ship faster than the
number it was set to and nothing reported it. Integrated at the sim's own 120 Hz
over all seven levels, true speed against a `cruiseSpeed` of 175:

| | before | after | level takes |
|---|---|---|---|
| corneria | 175.0−180.2 | 175.0−175.0 | +0.7 s |
| highlands | 175.0−200.5 | 174.9−175.1 | +1.0 s |
| omega | 175.0−180.5 | 175.0−175.0 | +0.6 s |
| foundry | 175.0−175.7 | 175.0−175.0 | +0.1 s |
| aquas | 175.0−**234.3** | 174.9−175.1 | +1.9 s |
| fortuna | 175.0−211.2 | 174.8−175.1 | +1.6 s |
| venom | 175.0−203.7 | 174.9−175.1 | +0.7 s |

Worst residual 0.13%, which is the ±6 m central difference against the true
local derivative. **`railStretch` uses that same epsilon deliberately** — it is
what `railTangent` orients the hull to, and the two are read on the same tick as
attitude and as rate. An analytic derivative here would pitch the hull to a
slope the speed correction did not agree existed.

Nothing else needed a table: the ODE is `dz/dt = -speed / |dp/dz|`, and at
120 Hz a tick moves at most 2.5 m while the stretch is driven by smoothstep
bends hundreds of metres wide. The digest is green on all seven, which is the
proof the geometry did not move — only the rate along it.

**The HUD needed no change.** `ui/radar.js:30` already read `flight.speed`; the
number simply became true.

**`ai.js`'s world axes went with it.** Station offsets are authored in the
rail's frame — `offset.z = -600` means 600 m ahead — and were added to the
player's position raw, so "ahead" meant −z. `view` now carries the rail's
heading as cos/sin of its yaw with `toWorld`/`toStation`/`heading` on it, and the
four sites that crossed between frames use them. Spawn *facing* rotates too:
rotating position without facing put a whole wave that many degrees off its own
approach, measured as Fortuna's hornets losing a third of their time on target
before facing was fixed as well.

Yaw only. Pitch is deliberately left out — a station that dived with the rail
would fight `ai.js`'s altitude clamps, which are one-sided against `groundAt`
and `ceilingAt` and have no notion of a sloping corridor.

Measured with `pacing.mjs` over a whole level, which is the only fair window:
over 40 s the player now covers less z, so a late wave has barely armed and the
comparison is of the clock, not the change.

| | corneria before → after | fortuna before → after |
|---|---|---|
| vanguard closest | 320 → **265** m | 361 → **58** m |
| vanguard on target | **0.0 → 6.4 s** | 0.0 → 0.0 s |
| hornet on target | 3.4 → **4.4 s** | **3.6 → 2.0 s** |
| raptor on target | 2.3 → 2.0 s | 1.9 → 1.9 s |

Counts and entry ranges are unchanged to within 10 m on both. Corneria gains:
its vanguard was never shootable and now is. **Fortuna's hornets lost a third of
their time on target** — its waves were authored against the unrotated frame on
the game's most-curving corridor at 34° of yaw, and that is a re-authoring cost,
logged in `ROADMAP.md` rather than absorbed here.

### What phase 4 did not do

**`railPoint` still composes z.** `out.set(centrelineX(z), centrelineY(z), z)`,
so world position is still a function of z and the corridor still cannot double
back. `flight.js` no longer *assumes* it — `pos.z` reads `railPos.z` rather than
`railZ`, in the sim and in the camera rig both — so the binding the plan named
is gone from the code. But a closed path needs `railPoint` to dispatch to a
per-level path object, and **that belongs in phase 6, with the arena that
authors one**: landing it here would ship a branch no level takes, against ship
criterion 7.

**A vertical shaft is still not authorable.** The speed blow-up is gone — 75°
now flies at 175 m/s where it would have flown at 676 — so gradients are limited
by authoring (`1.5 · climb / blend`) rather than by the parameterisation. But
`y(z)` cannot be vertical at any authored numbers, so the Foundry's shaft still
waits on the same path indirection phase 6 needs.

## Phase 5, as landed

`railYaw` put the corridor's heading into the hull; its slope was never there,
while `updateCamera` has always used the full 3D tangent. On any gradient the
camera pitched and the hull did not.

Measured on Fortuna: the hull ran −17.8° to +14.2° off the camera axis, 32°
peak to peak, against a rail at +18.3°. Now −2.55° to +2.86°, and the residual
is the player's own pitch from offset velocity and stick.

`framing.mjs` could not see this — `noseDeg` projects the nose onto the
camera's **right** axis, so it is a yaw measurement and reported a hull in
agreement through the whole divergence. It now also reports `nosePitch` against
the camera's up axis and `railPitch` off the tangent.

## Phase 8, as landed

`railOverSurface(z)` is the rail's signed clearance over the canopy. Above it
the sea answers `groundAt`; below it `ceilingAt`; within `PIERCE` (70 m)
neither, which is the only way through. Taken off the **rail**, so it is a
function of z alone — off the ship it would flip as the player crossed and the
two clamps would fight over the same plane at the moment the dive needs both
quiet.

Aquas' rail base is 710, 90 m over the sea at 620, and zone 1 spends the whole
648 back down. Measured: z 720 to −880 the sea is the floor, z −1080 is inside
`PIERCE`, from z −1280 it is the lid. The rest of the level flies at the 62 it
always did.

The dive is **41.6°**, two and a half times the steepest gradient the game had,
and the hull tracks it to 3.9°. Before phase 5 it would have been 41° off the
camera for the whole plunge.

`lid.mjs` needed two rules corrected to describe this: it measured headroom
where the rail is *above* the surface, which is not a lid, and it demanded full
box headroom immediately under the crossing, where clearance necessarily ramps
from zero. A lid answers for itself once the box fits under it.

**Leaving.** The lap surfaces you: where `railOverSurface` says the rail is
under a surface, it eases `flight.climb` to clear it by 95 m over `LAP_MIN`, and
the ship flies above the water for the rest of the lap. The hop's ascent then
starts from that value rather than zero — restarting at zero drops the ship back
through the surface on the hop's first frame. Measured on a real boss kill:
y 71 → 717 through the sea at 620, lap ending at climb 648 and the ascent
picking up at 650, continuous to 2200.

That also closes `ROADMAP.md`'s "leaving Aquas climbs 2200 m out of a level with
a lid on it" — the ascent no longer starts underwater.

**Still open here.** The canopy shader is an underside — refraction, caustics,
the critical angle — and the opening now looks at it from above for 9 seconds.
It reads as sea, but it was not built to. The benches this stranded moved to
zone 1 in phase 9 below.

## Open, found in phase 2 and its quality pass

- [x] **`keySection` writes onto the DNA's own key objects.** Closed 2026-08-21:
      `setActiveDNA` copies each key before compiling the polyline, so the source
      DNA stays clean whether it was `keys`- or `zones`-authored. The
      `if (key.su) return` memo went with it — the copies are fresh per load, so
      a rebuild recompiles from the band fields. Geometrically a no-op, verified
      by digest A/B on corneria, aquas and venom against digests cut from the
      pre-change tree.

- [ ] **`profileAt(z, {})` per call would allocate two typed arrays.** Both live
      callers hoist one profile object per build (`terrain.js:184`,
      `world-materials.js:282`), which is now a hard contract that nothing
      enforces.

- [ ] **Aquas' drop-off does not read.** The section is correct (`terrainHeight`
      runs +263 to −473 across the corridor at z = −4600) but underwater fog
      hides the fall. It wants an edge the eye can catch — a lip, a lit reef
      rim, or particles falling over it. `shots/p2-aquas-drop/`.
- [x] **Terraces read weakly from the chase camera.** Closed 2026-08-22 by
      phase 9's Aquas pass: the benches moved off zone 0, which phase 8 had
      turned into the above-water approach, and onto zone 1, where they are held
      from the key the dive ends on. Now at 280−300 m rather than 555−790, and
      standing 15−56 m ABOVE the rail instead of below it.

- [x] **`shots/ref-geometry-*.json` were stale.** Closed 2026-08-22: diagnosed,
      found intended, and re-cut. All seven levels are green.

      The drift is from **`5501801`** (phase 2), not `2cdabf1` — bisected with a
      headless replica of the digest's lattice, since the baselines were cut
      21:51, two minutes before `708f20a`. `5501801` moved section construction
      from the *interpolated* band fields to a per-key compile, so the summation
      order went from `lerp(inner) + lerp(beachW)` to `lerp(inner + beachW)`.
      Same value, different rounding.

      Nor was the geometry identical on all five. Measured against the phase-1
      tree:

      | | lattice moves | worst | cause |
      |---|---|---|---|
      | corneria | 558/7081 | 2.8e-13 m | rounding |
      | highlands | 347/7081 | 4.0e-13 m | rounding |
      | fortuna | 291/7081 | 4.0e-13 m | rounding |
      | aquas | 3532/7081 | **423 m** | its authored section |
      | venom | 1301/7081 | **356 m** | its authored ridge |

      Aquas also moved 325 geometry arrays and Venom 156 — phase 2's authored
      sections, exactly as intended. Omega and the Foundry never moved: neither
      routes `groundAt` through `terrainHeight`. The lattice is `Float64` and
      the mesh stores `Float32`, which is why a rounding change shows there and
      nowhere else.

      **Cut a digest before editing, not after**, or a stale baseline reads as
      your own regression. It cost the previous agent two cycles and it still
      landed on the wrong commit.
- [x] **Coverage, not mechanism, was what made the levels look alike.** Half
      closed 2026-08-22 — Fichina and Fortuna authored, Aquas and Venom already
      passing. Measured with `tools/shape.mjs`:

      | | shape mix, 12 samples | floor moves |
      |---|---|---|
      | corneria | FLAT x7, VALLEY x5 | 28 m *(reference)* |
      | fichina | FLAT x9, VALLEY x3 | **149 m** |
      | aquas | FLAT x5, VALLEY x3, VALLEY+asym x3, FLAT+asym x1 | 74 m |
      | fortuna | FLAT x9, VALLEY x2, VALLEY+asym x1 | **133 m** |
      | venom | FLAT x7, VALLEY x3, RIDGE x2 | 60 m |

      Every level now names a shape combination no other level uses, which is
      CONTRACT rule 8's weak form. Fichina and Corneria previously shared one.

      Two things the first, cruder version of this measurement got wrong, both
      corrected here: Fortuna is **FLAT**, not a valley — its brief calls for
      near-flat, so authoring a valley in would have removed the one thing
      already right — and no level is a single shape once the sampling is dense
      enough to hit every zone.

- [x] **Aquas' walls break its own sea surface.** Closed 2026-08-22 by phase
      9's Aquas pass. Both zones took authored sections, and the outermost point
      is what `wm` scales and what the relief bands stack on, so it is the number
      that decides the maximum. Measured over the zone, sampled every 5 m:
      the trench went 75% of samples above the 620 lid to **0%**, the narrows
      80% to **0%**, peaks 829/775 → 547/580. `lid.mjs --audit` no longer prints
      the note on any run.

- [ ] **`fins.mjs --audit` exits non-zero on a clean tree**, so the second half
      of the verification block is not currently a gate. Not this lane's work:
      the reversed triangles predate the cross-section lane (`1ea5288`) and are
      already tracked in `ROADMAP.md` under "Found while auditing".

## What the open phases already know

Read out of the source 2026-08-21 so none of it is re-derived. All line numbers
are from that date; verify before trusting one.

**Phase 3 — ceilings.** Landed; see "Phase 3, as landed" above. One thing from
the research that outlived it: lid height is constrained per zone by that zone's
`wallH` **plus relief**, and the two are easy to confuse — Aquas' lid went
330 → 620 because at 330 it sat on the corridor rim and the level read as a cave
(`dna.js:459-469`), and its `wallH` still under-reads the terrain by 215 m. Both
ends are now checked by `tools/lid.mjs --audit`.

**Phase 4 — landed; see "Phase 4, as landed" above.** What outlived it, for
phase 6: `railZ` is mutated in exactly one place; three cursors edge-trigger off
it — waves, comms and grants at `combat.js:1760-1774` — and **the boss is a wave
row**, not a separate system, so it rides the same cursor with no fallback;
`campaign.js:549` (`railZ <= WORLD.zEnd`) is the **only** end-of-level test.
All four survive a non-monotone *position* as long as the *parameter* stays
monotone, which is the contract phase 6's path object has to keep.

**Phase 5 — landed.** The hull pitch and the `ai.js` station frame both closed
(phases 5 and 4). One thing from the research outlived both: there is **no
terrain crash**. The ground is a floor with a cushion, not a hazard
(`flight.js:345-355`). Terrain rising into the rail bulldozes the ship upward
without limit; terrain falling away does nothing.

**Everything free.** All of `src/ui/`, `src/fx/`, `src/audio/`, `pickups.js` and
world LOD are position-based, not `railZ`-based, and survive phase 4 untouched.

**Phase 8 — the plunge.** Re-enter, fly a few seconds *above* the water, dive
through the surface, fly the level, kill the boss, climb back out above the
surface, then hop.

- **Does not need phase 4.** The rail already moves in Y: a zone's `climb`
  becomes a `yBend` (`zones.js:200-204`) into `centrelineY`, and Aquas'
  drop-off descends on `climb: -30`. It needs phase 5 for the *look* —
  `flight.js:397` orients the hull yaw-only, so on a dive the camera pitches and
  the hull does not. Steepest shipped is Fichina at 16.7°.
- **The blocker: one surface must be both floor and ceiling.** Aquas' sea is a
  `canopy` at y = 620 answered by `ceilingAt` and clamped against since phase 3.
  Above it, the same plane is a floor. `groundAt` and `ceilingAt` are separate
  one-sided queries, and a canopy level's per-zone `ceiling` is finite
  everywhere by construction — there is no "no lid here" to author.
- **Same problem as Fortuna's canopy**, whose whole idea is that nothing else
  changes which side of an object you are on. Solve once, for both.
- **Also two `ROADMAP.md` items**: Aquas has no arrival beat (an orbital
  re-entry ending 300 m underwater wants a plunge, not a wash), and leaving
  Aquas climbs 2200 m straight through the sea surface on an unconditional
  `HOPS.orbital.climb`. One feature, not three.

**Phase 9 — the authoring pass.** No new mechanism. Every level gets a shape.

Acceptance test: near-field cross-section (±250 m, what the ship reads) at six
points down each level, and **no level may measure `valley` at every sample**.
Same method as the 2026-08-22 row in the open list above.

**Fortuna first** — the only terrain level with no authored section, valley six
times out of six, and the level named as proof that shading cannot fix this.
Corneria stays a valley: it is what the others are told apart from.

## How to work this lane

Assume a different agent picks up every phase cold.

**No narration in comments.** `HANDOFF.md` carries this rule and it keeps
slipping. State the constraint, not the story: no "this used to be X", no
before/after numbers from a rejected iteration, no describing the change. A
comment explains why the code must be the way it is to a reader who never saw
the previous version. History is in git; reasoning is in this file.

**Never assert a magnitude you have not measured.** Three numbers in Venom's
section comment were written from intent and were wrong; the quality pass caught
them by checking against the authored points.

**Every phase ends with a separate quality pass**, run after the work is
committed rather than folded into it — an author checking a fresh diff reads
what they meant, not what they wrote. It is read-only, so it is a reasonable
place to spend a sub-agent. It covers: the verification block below on **all
seven** levels; every comment added or touched, against the no-narration rule;
every comment *near* changed code, for staleness; a grep for modules added but
never imported and functions left with no callers; and anything found that is
not this phase's work written into `ROADMAP.md` under its phase.

**Leave the trail before stopping.** In the same commit that closes a phase:
tick its row in the table above, and re-cut `HANDOFF.md`'s "Where we left off"
to name what closed, what is open, and the single next action.

## Verification

Run from `games/vulpine`. **Non-zero exit = console errors = automatic fail.**

```bash
# did a change reach a level it should not have
for L in corneria highlands omega foundry aquas fortuna venom; do
  node tools/digest.mjs --level $L --against shots/ref-geometry-$L.json || echo "MOVED: $L"
done
node tools/fins.mjs --audit                       # inverted-winding gate
node tools/lid.mjs --audit                        # ceiling gate: is there room to fly
node tools/shape.mjs --strict                     # phase 9: no two levels share a shape set

# before / after on a level
node tools/shot.mjs --shots chase,valley --t 16 --w 1280 --h 720 --quality high \
  --params "level=venom" --env venom --out shots/pN-venom --port 9301
node tools/sheet.mjs shots/ref-venom shots/pN-venom --pair --labels "before,after"
```

The digest is a *sanity* check, not a bit-identity contract — read the diff and
judge whether it is the change you meant. **Do not pixel-diff captures:** the
harness is not deterministic frame to frame (measured: same code, two runs, 3-11%
of pixels differ, max channel delta 205). Read the sheet.

Baseline: `shots/ref-<level>/` (chase + valley, all seven) and
`shots/ref-geometry-<level>.json`. Omega is chase-only — `field` backend, no
corridor for the `valley` camera.

**`shots/` is gitignored** (`.gitignore:9`), so no baseline travels with the
repo. A fresh clone has nothing to compare against and has to cut its own:

```bash
for L in corneria highlands omega foundry aquas fortuna venom; do
  node tools/digest.mjs --level $L --out shots/ref-geometry-$L.json
done
```

Read `digest.mjs --against` by **exit code**, never by grepping its output: the
failure line is `*** OUTPUT IS NOT IDENTICAL ***`, so a grep for "identical"
matches both outcomes and reports every level green.

## Guardrail

`CONTRACT.md` hard rule 8: **a new or reworked level must name a `section`/`path`
combination no existing level uses.** If it cannot, it is not a new level — it
is a variant of one that exists. This counteracts the incentive that produced
five levels on one cross-section.
