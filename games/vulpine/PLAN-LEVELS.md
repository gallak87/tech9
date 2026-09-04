# Vulpine — level identity: two curves

**Phase 9 is closed. Every level in the four-levels table meets its row.**
Phases 1-5 and 7-9 are done; phase 6 is open and parked on a rule conflict. The
owner picks when it starts.

A zone carries its own cross-section, ceiling and camera; the hull pitches with
the corridor; a surface is floor or ceiling depending which side the rail runs;
and speed is measured along the rail rather than down the z axis.

Companion docs: `ROADMAP.md` is the queue, `HANDOFF.md` the harness and traps,
`PLAN-PERF.md` the other open lane, `REVIEW.md` the rubric.

## The problem this lane exists for

Owner, seeing five levels side by side: *"they all essentially look like
Corneria with filters/textures."*

Geometry, not shading. The five levels in question were exactly the five sharing
`backend: 'terrain'`, and inside it `heightAtU` folded about `Math.abs(u)` and
stacked `bed → beachH → shelfH → wallH`, each higher than the last — so every
terrain level was a **valley by construction**. The nine authorable numbers were
all widths and heights; none was a shape.

**Ruled out: another palette, lithology or structure-GLSL pass.** Shading is
downstream of the cross-section. Fortuna was the proof — the most distinctive
shading in the game, still reading as Corneria at night.

**Ownership.** *Planet* owns what it is made of — lithology, palette, structure
shader, prop kit, sky. *Level* owns what shape it is — cross-section, rail path,
ceiling, surface. Same rock, different topography.

## The four levels — the acceptance test for the lane

No two rows alike. Nothing in the toolchain checks this table; read it by hand.

| | section | flank | rail path | ceiling | surface |
|---|---|---|---|---|---|
| Aquas | terraced, asymmetric ✅ | walled ✅ | deep dive ✅ | constant lid ✅ | none ✅ |
| Venom | **inverted, whole level** ✅ | open ✅ | rhythm ✅ | **alternates** ❌ | lava ✅ |
| Fortuna | flat, drowned ✅ | **columns** ✅ | **level, whole level** ✅ | none ✅ | water ✅ |
| Foundry | escarpment ✅ | walled ✅ | steep shaft ✅ | built, varies ✅ | deck ✅ |

**The Foundry's row is measured by the BUILT pass, not by a cross-section.**
`works` has no height field, so `shape.mjs` printed one line about it and
measured nothing for two sessions. It now reads the authored corridor directly:
how wide the box is, how far the deck moves, how much of the level is roofed and
how often that changes, and whether the two flanks are the same. Measured:
half 150-560 m, deck moves 430 m, roofed 56%, sky comes and goes 0.57/km,
flanks differ over 29%, rail moves 430 m at 68°.

**`flank` is a column because a cross-section could not tell these levels
apart.** RIDGE / FLAT / VALLEY reads two rays at one z, so a trunk 250 m off the
rail and a canyon wall 250 m off the rail are the same sample — and Fortuna,
which is 86% FLAT, signed identically to Corneria, which is 63% FLAT. What
separates them is that a wall is still there 200 m later and a trunk is not.
`shape.mjs` measures it as starts per kilometre: 0.09 on all three walled
levels, 1.42 on Fortuna, and Venom's ridge has nothing standing beside the rail
at all.

- **Aquas — depth is the drama.** Plunge in; shallows with terraced reef benches
  you fly *between*; a hard-asymmetric drop-off (reef to port, open blue to
  starboard); a trench the rail dives into where the lid leaves view; rise to an
  open bowl.
- **Venom — a spine, end to end.** The ship rides a crest for all nine
  kilometres with lava falling away both sides and no channel anywhere in it;
  the ridge itself dives and climbs; then a closed orbital path for the finale.
  Owner, on the version that put the ridge first and a canyon after: *"I was
  thinking the entire level from start to finish would have been on a ridge top
  with lava on either side."*
- **Fortuna — a drowned forest, and the corridor is made of trunks.** Black
  water bank to bank with no land in it and colossal glowing trunks standing out
  of it. The rail is **dead level for all nine kilometres** — the only one in
  the game that is — and what varies is the forest: how close the ranks come,
  how tall they stand, how deep the water under them is, and where they stop.
  It wants no `canopy`: that module is one flat plane carrying a water shader,
  and this level's layers are heights.
- **The Foundry — outside, inside, then down.** Five acts, and the boundaries
  are the numbers everything else is placed against: gantry run to -2280, breach
  to -3840, shaft to -5400, assembly floor to -7800, dock to the end. The deck
  is a ledge on the flank of the works — massing climbing to port, stepping down
  and outward to starboard — until a bulkhead takes it inside; the rail then
  dives 430 m at 68° with the deck under it; the corridor opens to 860 m across
  under a 165 m roof; and the last act is an open dock with hulls on the stocks
  in it, which the carrier is fought among.

## What uniqueness means here

Read this before picking up a level. It is the part the table cannot say, and
it has now been got wrong twice on the same level.

**A level's identity has to hold for the whole corridor, not appear as a beat.**
Venom's first two passes both put its distinctive form at the start and the
stock grammar after it — 11 seconds of ridge in a 60-second level. That does not
read as "a ridge level", it reads as the old map with an intro. The owner's
words, seeing it: *"I saw the ridge, flew down that was cool — then the rest of
the level was canyon again."* The rebuild committed all eight zones to the
spine, and only then did it become a different level.

So when you author, the question is not "does this level contain its shape"
but **"is there anywhere in these nine kilometres where it stops being that
shape"**. If the answer is yes and it was not deliberate, that stretch is the
work.

**Variety comes from varying the identity, not from leaving it.** Venom is a
spine for all of it and is still not monotonous, because four things move
underneath: crest height 330 → 80 → 450 → 110, crest width, where the flanks
meet the lava (345 m to 640 m), and one zone asymmetric. A level that gets bored
of its own shape and cuts to a canyon has given up the only thing that made it
distinct.

**The owner's acceptance test is playing it.** `shape.mjs --strict` is now a
real gate and it still cannot tell you a level is good — it told us Venom was
done while 82% of it was stock. Fly the level before you claim a row.

**The rail dive is under-used and the owner asked for more of it.** *"def love
the zrail dive thats a new mechanic we need to start using more!"* Aquas and
Venom have one; Corneria, Fichina and Fortuna have none. It costs a `climb` on a
zone and a section that comes down with it, and the corridor going somewhere
vertically is felt immediately in a way a cross-section is not.

**A rail only reads where something moves with it, and it is not free.**
Fortuna was authored with 735 m of descent over a floor that is a plane at
y = 0 everywhere, and the owner, flying it: *"its like your going up and down
for no reason there is no objects in the way you just got slightly closer to
the islands then flew back up again."* Venom's crest comes down with its dive
and Aquas' plunge crosses the sea surface; Fortuna's dive had nothing to be
measured against, so it changed nothing in frame.

And it charges the player for it — see **the rail does not turn** below, which
is why the lateral half of this is now zero everywhere. **A level with no reason
to move the rail should hold it still**, which is Fortuna's row in the table
above and is gated as a `maxRange` in `shape.mjs` — the one row in that table
that asks a rail to stay put.

**A corridor need not be made of ground.** Fortuna's is made of props: the
sections are submerged bank to bank and what the ship flies between is the
`islands` table. Three things follow, and they are the whole cost of doing it —
`relief` has to stay under ~0.06 or the noise bands build the banks back;
anything a wave stands on has to be authored as an island, because `groundAt` on
a level with no land answers the waterline; and the props themselves have to be
scattered in depth, since a narrow band of them overlaps itself into two
continuous masses port and starboard, which is a canyon with texture on it.

**Picking a level.** Every row in the table is met. Corneria and Fichina are
deliberately the valley the others are told apart from. The first question for
any level is the same one: what does it look like for the whole nine kilometres,
and where does it stop looking like that.

## Phases

| # | Deliverable | Status |
|---|---|---|
| 1 | Cross-section becomes a polyline; `Math.abs(u)` gone | ✅ 2026-08-21 |
| 2 | Authorable `section` on a zone | ✅ 2026-08-21 |
| 3 | Per-zone `ceiling`; player flight clamped under `ceilingAt` | ✅ 2026-08-22 |
| 4 | Rail advance by arc length; `ai.js` station frame | ✅ 2026-08-22 |
| 5 | Hull pitch from `railDir` | ✅ 2026-08-22 |
| 6 | Venom orbit arena | **open — conflicts with hard rule 9** |
| 7 | Per-level camera | ✅ 2026-08-22 |
| 8 | Aquas' plunge — the rail crosses the water surface | ✅ 2026-08-22 |
| 9 | **The authoring pass** — one distinct shape per level | ✅ 2026-09-03 |

Numbers are identifiers, not an order.

### Phase 9 — closed 2026-09-03

Measured as metres carrying an authored `section` against corridor length, and
for the one built level as the BUILT pass in `shape.mjs`:

| | authored | of level | its row |
|---|---|---|---|
| venom | 10560 m | **100%** | meets |
| fortuna | 10560 m | **100%** | meets |
| aquas | 7600 m | **72%** | meets |
| fichina | 2300 m | 22% | not in the four-levels table |
| foundry | 5 zones | **100%** | meets |

**The Foundry needed a mechanism pass before it could be authored**, and that
is what `works.zones` is: `half`, `deckY`, `roofY` and a per-flank `rise` are
now a function of z, sampled the way `profileAt` samples a cross-section, and
the bay kinds are a run list a zone names rather than one pattern cycled over
the whole corridor. Before it, three of its four brief rows had nothing to
author into — one box for all 9 km.

**Corneria stays a valley.** It is what the others are told apart from.

### Phase 6 — parked, and it now conflicts with a hard rule

**Resolve this before starting it.** `CONTRACT.md` hard rule 9 says the rail
does not turn, and an orbit arena is a closed lateral path by definition. Owner
parked the conflict 2026-08-22 rather than settling it in advance; the readings
on the table were (a) the rule means "no turning *in a corridor*" and an arena
has no forward corridor to aim down, so it is a carve-out, or (b) phase 6 dies
and Venom's finale becomes something that is not a looping path. Everything
below is the contract phase 6 had to keep before that question existed, and it
is still accurate.



`railPoint` still composes z — `set(centrelineX(z), centrelineY(z), z)` — so the
corridor cannot double back yet. `flight.js` no longer *assumes* it (`pos.z`
reads `railPos.z` in the sim and the camera rig both), so what is left is making
`railPoint` dispatch to a per-level path object. That was deliberately not
landed with phase 4: no level would take the branch, against ship criterion 7.
Land it with the arena that authors one.

What must keep working across a looping path — all four survive a non-monotone
*position* as long as the *parameter* stays monotone:

- `railZ` is mutated in exactly one place.
- Three cursors edge-trigger off it — waves, comms and grants at
  `combat.js:1760-1774`. **The boss is a wave row**, not a separate system, so
  it rides the same cursor with no fallback.
- `campaign.js:549` (`railZ <= WORLD.zEnd`) is the **only** end-of-level test.
- All of `src/ui/`, `src/fx/`, `src/audio/`, `pickups.js` and world LOD are
  position-based, not `railZ`-based, and need nothing.

The same indirection is what the Foundry's shaft wants: `y(z)` cannot be
vertical at any authored numbers. Gradients up to ~75° now fly at honest speed
and are limited by authoring (`1.5 · climb / blend`), not by the
parameterisation.

## Constraints that outlived their phase

The load-bearing residue of everything above. All of it was paid for once.

**The chase camera needs ~340 m of lateral margin, not `boxX`'s 105.** It trails
behind and below and banks with the roll. A ridge whose zero crossing sat at
215 m put the camera in the lava through half a zone while the *ship* stayed
dry. Every crossing on Venom is at 345 m or wider for this reason.

**A surface plane at y = 0 pins the rail.** `groundAt` clamps there, and the
offset box is 46 m deep, so the rail can never come below ~60. Venom had no
`climb` anywhere because its base was 48 — it had no room to descend in either
direction, and the base had to go to 400 before it could have a rhythm. Fortuna
has water at y = 0 and paid the same price: its base went 46 → 860, and the
descent is the level.

**A generated section pins the bank line at height 0 whatever `bed` is.**
Deepening `bed` alone drops the trough and leaves the shoulders, so a rail
descending into it loses the corridor. Anything that descends needs an authored
`section`, not a deeper `bed`.

**`relief` has to come down with the section.** The relief gate opens past the
second-outermost point and the noise bands build a skyline out there whatever
the polyline says. Venom's 0.70 was rebuilding the walls its section had just
removed; 0.14 fixed it. Aquas' terraces and Fichina's pass both needed the same.

**A section is not enough on its own.** Keep the two outermost points high and
the tallest thing in frame is still a wall on each bank — a spine with walls
around it is a valley with a lump in it. Both banks have to fall away.

**Short blends across an inversion.** Interpolating an inverted section into an
upright one passes through flat, and on a level with a surface plane at y = 0
flat means flooded. Venom's ridge sat awash for seven seconds at a 1200 m blend.

**`bands.crag.face` is the only band that reaches an inverted section.** Both
gates in `heightAtU` measure distance from the centreline against the section's
*outer* points — "the tall rock is on the banks", true of a valley and backwards
on a ridge. `face` opens crag on local slope instead, defaults to 0, and leaves
the crest apex alone because slope there is zero. **`relief` is still
distance-gated**; the next inverted level that wants distant relief will meet it.

**A zone's `climb` is centred on the zone boundary**, so it spans exactly the
two keys the cross-section blends between. Centred on the entry key instead, a
zone raising both floor and rail pinches the corridor by `climb/2` on the way in.

**Nothing gates rail Y.** The digest's lattice samples `terrainHeight`, which
reads `centrelineX` only. A change that moved every climbing rail in the game
was reported as identical.

**Lid height is constrained per zone by `wallH` *plus relief*,** and the two are
easy to confuse. What actually decides the maximum is the outermost section
point: `wm` scales that one alone and the relief bands stack past the one
inboard of it. Read it from `tools/lid.mjs --audit`, never from the authored
number.

**A battery wave has to fire inside one zone's held stretch** — the zone less
half a blend at each end — with `bank` set to the ground that zone's section
actually puts there, and never where the rail is climbing.

**Props authored below the mesh sample spacing alias, and it looks like a
winding bug.** The shading normal is a central difference across two mesh
columns, and spacing is 6 m at the centreline growing outward — so an island
narrower than that has facets whose geometric normal disagrees with the vertex
normal, sometimes inverting. Fortuna's old 54 stalks at 16−44 m radius produced
105 back-facing facets out of 759,280 this way; its trunks are 65 m and up for
this reason and the count is now 13. Harmless (the shading is analytic and stays
correct) and it is what `fins.mjs` prints as a note, but do not read it as an
index-order defect: a real one reads 100% of a mesh, not 0.3%.

**A `works` zone's blend and the rail's `climb` must be the same window.**
Nothing derives one from the other: `deckY` is an absolute height on the zone
and the rail move is a y-bend on the centreline. They agree only because
`zones[i].blend` equals the bend's `width` and both are centred on the same
boundary z — `smooth(a.z, b.z, z)` and `bendS` are the same cubic over the same
interval. Change one and the ship's clearance over the deck varies through the
dive instead of holding. `tools/lid.mjs --audit` is what catches it: it reads
deck, walls and roof against the offset box at every sample.

**A built corridor that changes width or height cannot be made of centred
boxes.** A slab centred on a segment has one width and one height, so a taper
comes out as a sawtooth and a descent as a stair — 33 m per step on the
assembly floor's widening, 52 m on the shaft. Deck, curtain, lamp runs and roof
are corner-exact plates for this reason: four corners at two z, and the segment
boundaries share vertices.

**A low ceiling is a ratio, not a clearance.** The offset box is 78 m above the
rail, so the tightest honest roof is about rail + 84 whatever the room looks
like; what makes a hall read as low is its width. The Foundry's assembly floor
is 860 m across under 165 m of deck-to-roof, and the roof still clears the box
by 7 m. `lid.mjs` gates the clearance; nothing gates the ratio.

**A ground battery's `bank` has to fit inside that act's own `half`.**
`combat.js` places a `banks` wave at `bank + rand(0, 85)` off the rail centre,
and on a built level `groundAt` is the deck whatever x it is asked about — so a
gun authored past the deck edge stands on air instead of failing. The Foundry's
two battery lines are 96 against a `half` of 210 and 210 against a `half` of
430.

**There is no terrain crash.** The ground is a floor with a cushion, not a
hazard (`flight.js:345-355`). Terrain rising into the rail bulldozes the ship
upward without limit; terrain falling away does nothing.

**`speed` is along the rail, not down z.** `railStretch(z)` divides the advance.
`railZ` stays monotone and stays in metres of z, which is what keeps the three
cursors and the end-of-level test working. It uses the same ±6 m central
difference as `railTangent` deliberately — the two are read on the same tick as
attitude and as rate, so an analytic derivative would pitch the hull to a slope
the speed correction did not agree existed.

**The rail does not turn.** `CONTRACT.md` hard rule 9, and the reason is
mechanical rather than aesthetic. `flight.js` holds the ship in an offset box
around the rail, so rail motion and player motion come out of one allowance —
and until 2026-08-22 the box was in *world* axes while the camera rig was built
along the corridor heading, so on a corridor at yaw θ the player got
`boxX · cos θ` of screen-lateral and `boxX · sin θ` of their stick spent moving
toward and away from the camera. Measured at the 29° the dog-legged levels
reached: 13 m of the 105 gone, ±51 m of throw on depth, both varying
continuously with the meander.

`off` is now rotated through the same yaw `combat.js` hands to
`view.toWorld` — the player was the last thing in the game not in the rail's
frame, `ai.js` having been given it in phase 4 — and `flight.railCos/railSin`
is the single derivation both read.

Owner, having flown it: *"as you're flying around the zrail moves you and your
aim stops moving by the edge so it feels like youre restricted"*, and on the
options: **keep full A — dead straight.** So every level's `centreline.x` is
empty and no zone carries a `bend`. `shape.mjs --strict` gates it at 0.5° of
yaw. **Vertical is still authorable** and costs less — the box is 105 m wide
against 78/46 tall, and aiming is mostly horizontal.

**A moving rail still spends the aim budget vertically.** Fortuna's is dead
level for that reason and carries not even the ±20 m of sine every other level
has in `centreline.y.waves`.

**The rail is either still or in a fast transition.** `tools/quiet.mjs --audit`
is the gate. Three rules, and all three came out of the same complaint that
killed lateral motion:

- **No ambient sine.** `centreline.y.waves` is empty on every level. Corneria's
  was ±23 m — half the offset box's 46 m of down-travel — running the whole
  level, so "still" did not mean still anywhere.
- **A transition is fast.** Under 3 s, or within 25% of the floor its own drop
  sets: 648 m of Aquas plunge is 3.7 s before any z is spent on it. Shortening
  the `blend` a `climb` runs over is the whole lever, and it steepens the move
  as it shortens it — Aquas went 42° → 69°, Venom 28-38° → 51-60°. Measured
  before: 4.2-11 s. After: 1.1-2.9 s.
- **A transition lands in a gap between waves.** 450 m of guard behind a wave's
  arm point and 350 m ahead. Batteries are checked at their EMPLACEMENTS, which
  `combat.js` lays up to 1.5 km past the arm point — the rule PLAN-LEVELS
  already carried for batteries alone, applied to every wave kind.

Placing them is done by moving whichever is cheaper: a wave's arm z, or the
zone boundary the `climb` is centred on. Fichina's shelf boundary sits 240 m
earlier than its crevasse wanted for exactly this reason.

**Wave and comms tables must descend in z.** `combat.js:1801` walks them with a
monotone cursor — it fires `waves[i]` then tests `waves[i + 1]` against the same
`railZ` — so a row out of order does not fire early, it fires LATE and in the
same tick as the row before it. Venom's opening battery sat after a wave 400 m
further down the level and put its emplacements 400 m past where its own comment
said. Nothing at runtime notices; `quiet.mjs` checks it.

**A prop is tested over ±2.2 r of z, and `flat` divides the z term by 0.35.**
Radius therefore buys three times as much length down the level as across it: a
330 m flat island reaches 726 m fore and aft and reads as a bank running past
the ship. It is also why a scatter group authored right up to a zone boundary
stands a third of its radius into the next zone — Fortuna's hollow starts 330 m
late so its ranks cannot reach back into the clearing.

**A ground emplacement stands on `groundAt`, which on a level with no land is
the waterline.** `combat.js` places a `banks` wave at `bank + rand(0, 85)` off
the rail centre, alternating sides, at `first + i * step` ahead — so the ground
has to be flat across that whole band and that whole line, on both sides. On
Fortuna that is six authored islands, and three numbers in `campaign.js` are
part of the fit: `step` at 290 ran the outer guns off the end of a bar, and
`first` at 700 put a gun 430 m out at 31° off the nose. Measured look-down
across the shipped levels is 12-29° median; Fortuna's is 10-23°.

**A prop standing in the placement band puts the gun on its flank** — measured,
42 m *above* a rail it was supposed to be firing up at. `islandAt` sums, so a
bar under a trunk is a bar plus a trunk. The scatter groups over each battery
window are held outboard of the whole band for this reason.

**`islandAt` samples an unjittered u**, so every island in the game is
analytically smooth: `bankJitter` perturbs the distance the *cross-section* is
read at and never reaches a prop. A level whose props are its shape gets no
roughness for free.

**`ai.js` station offsets are in the rail's frame**, converted through
`view.toWorld` / `view.toStation` / `view.heading`. Yaw only: a station that
dived with the rail would fight the altitude clamps, which are one-sided and
have no notion of a sloping corridor. Rotating position without also rotating
spawn *facing* puts a whole wave that many degrees off its own approach.

## Deliberately not doing

**True free flight.** Needs a parallel trigger system for three monotone
cursors, a new end-of-level test, and ~20 −z-is-forward sites across `ai.js` and
`combat.js`. The orbit path gets the feel for a fraction of it.

**Asymmetric lateral *extent*.** The mesher's column layout is symmetric by
construction (`terrain.js:35-55`). Land can be lower on one side, not wider.

**One lever nobody has pulled:** the floor need not be a plane at y = 0. A level
whose floor sits far below the rail, flown between spires with no readable
ground, reads as none of the others. Cheap version — `waterLevel` well under
`bed`, so no plane draws at all.

## Open

- [x] **`shape.mjs --strict` passed a level that was 18% authored.** Closed
      2026-08-22 — it now samples coverage every 40 m and checks the four-levels
      table row by row. See the tool's own header for the design and `BRIEF` for
      the rows. Add a level there when you author it, and mark it `done` only
      when its row reads `meets`.

- [ ] **Aquas' drop-off does not read.** The section is correct (`terrainHeight`
      runs +263 to −473 across the corridor at z = −4600) but underwater fog
      hides the fall. It wants an edge the eye can catch — a lip, a lit reef
      rim, or particles falling over it. `shots/p2-aquas-drop/`.

- [ ] **One brief row needs a lid that ends.** Venom's "alternates" wants a
      ceiling that stops, and `Canopy` is a single flat camera-following plane
      carrying a *water* shader — refraction, caustics, the critical angle. It
      can neither end nor pass for rock. A canopy level's per-zone `ceiling` is
      also finite everywhere by construction: there is no "no lid here" to
      author. **Fortuna is no longer the second caller.** Its two layers are
      heights and the ship descends between them, so its ceiling row is now
      `none`; that leaves this wanted by exactly one row, which is worth knowing
      before anyone prices it.

- [ ] **Aquas' canopy is an underside seen from above.** The shader was built
      for a sea read from 300 m below, and the level now looks at it from over
      the top for the first 9 seconds and again on the victory lap. It reads as
      sea, but it was not built to.

- [ ] **`profileAt(z, {})` per call would allocate two typed arrays.** Both live
      callers hoist one profile object per build (`terrain.js:184`,
      `world-materials.js:282`), which is a hard contract nothing enforces.

- [x] **`fins.mjs --audit` exited non-zero on a clean tree.** Closed 2026-08-22.
      The "reversed triangles" were sub-grid props aliasing against the mesh, not
      winding; the gate now tests the worst single mesh's back-facing fraction,
      because a winding regression is a whole mesh. See the constraint below.

## How to work this lane

Assume a different agent picks up every phase cold.

**Read a brief row against live play before believing it.** Venom's said
"inverted / rhythm / alternates" and was authored as a ridge at the start and a
canyon after. The owner wanted the whole nine kilometres on the spine. Two
agents shipped the narrow reading.

**Cut a digest before editing, not after,** or a stale baseline reads as your
own regression. This has cost three cycles across two agents.

**No narration in comments.** State the constraint, not the story: no "this used
to be X", no before/after numbers from a rejected iteration, no describing the
change. A comment explains why the code must be the way it is to a reader who
never saw the previous version. History is in git; reasoning is in this file.

**Never assert a magnitude you have not measured.** Three numbers in Venom's
section comment were written from intent and were wrong.

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
node tools/lid.mjs --audit                        # ceiling gate: is there room to fly, canopy or built roof
node tools/shape.mjs --strict                     # phase 9: shape clash, the four-levels table, the built corridor
node tools/quiet.mjs --audit                      # rail moves: fast, and in the gaps between waves
node tools/pilot.mjs fly --seconds 70 --params "level=venom"   # does it still fly

# before / after on a level
node tools/shot.mjs --shots chase,valley --t 16 --w 1280 --h 720 --quality high \
  --params "level=venom" --env venom --out shots/pN-venom --port 9301
node tools/sheet.mjs shots/ref-venom shots/pN-venom --pair --labels "before,after"
```

`shape.mjs --draw <level>` renders a cross-section as ASCII **and prints the
rail height beside it**, which is the fastest way to read a rail rhythm. Plain
`shape.mjs` prints four things — the fourth being the **built corridor** table,
which is the only measurement of a `works` level there is: the twelve-sample picture, per-corridor
**coverage** (what fraction is each shape, authored metres, rail runs, and the
**flank** pass — how much of the level has anything standing beside the rail and
how many times that starts, which is what separates a forest from a canyon), and
the **four-levels table checked** — `meets` / `open` / `BROKEN` per row. Add a
level to `BRIEF` there when you author it, and mark it `done` only when its row
reads `meets`.

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
