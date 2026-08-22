# Vulpine — the levels read as one level

Open lane, opened 2026-08-21. Status: **diagnosed, baselined, nothing built.**
The owner picks an option before anything starts.

Companion docs: `ROADMAP.md` is the queue, `HANDOFF.md` is the harness and the
traps, `PLAN-PERF.md` is the other open lane, `REVIEW.md` is the rubric.

## The complaint, verbatim

> most of the levels "look" the same, just different textures - they all have a
> canyon with vertical rocks/cliffs or whatever, and i just can't identify the
> right way to "unique"-ify the levels […] i love the biome/themes for them, but
> i cant get past the "look" - they all essentially look like corneria with
> filters/textures

And the target:

> im okay with corneria and highlands looking similar, thats like 2 sectors on 1
> planet, but i really want after jumping to another planet, that the map looks
> REALLY different […] still has the zrail etc, but not just a "canyon with
> walls, some variating vertical cliffs"

With the constraint that the answer be "common sense and not error prone", not a
wildly abstract or 30x-pluggable system. Manual seeding or a pre-generation step
is explicitly acceptable.

## The diagnosis

**It is geometry, not shading.** Two facts, both checkable in ten seconds.

**1. The complaint lands exactly on one backend.** The levels the owner
screenshotted were Corneria, Highlands, Aquas, Fortuna and Venom. Those are
precisely the five on `backend: 'terrain'`. `grep -n "backend:" src/world/dna.js`
returns three lines in the whole file — Corneria declares `terrain`, Omega
declares `field`, the Foundry declares `works`, and Highlands, Aquas, Fortuna
and Venom inherit the default, which `hasBody` spells as `?? 'terrain'`. The two
levels the owner did *not* reach for are the two that are not on that backend.
The complaint is a description of the terrain backend.

**2. Inside that backend, every level is the same shape.** `profile.js:267`:

```js
export function heightAtU(u, z, P) {
  const right = u >= 0;
  const d0 = Math.abs(u);
```

The cross-section is a function of **|u|**, so it is mirror-symmetric by
construction: same wall, same distance, both banks, always. Everything a level
author can set — `inner`, `bed`, `beachW`, `beachH`, `shelfW`, `shelfH`,
`cliffW`, `wallH`, `relief` — only says how wide and how tall that one trough
is. Five levels are the same object at different scales wearing different
shaders.

The compositional tell, present in all five captures: a flat surface at y = 0,
the rail on the centreline, matching walls left and right, an open strip of sky
above, and the horizon at the same screen height with the vanishing point dead
centre.

## What is already ruled out

**Another palette, lithology or structure-GLSL pass.** That axis is exhausted
and Fortuna is the proof: it has the most distinctive shading in the game — an
emissive ground, a two-colony hue split, an aurora sky, a night preset shared
with nothing else — and it still reads as Corneria at night. Three sessions have
gone into that axis. It moves the *filter*, which is the half of the problem the
owner is already happy with.

**Raising the light rig on a dark level.** Measured 2026-08-21 on Fortuna and
recorded in `ROADMAP.md`: zeroing sun, hemi, fill and rim moved the chase median
0.017 → 0.014, and *raising* hemi from 2.25 to 6.0 got 0.018. Terrain faces up
and takes `hemiSky`. This is a note about tone, not shape, but it is the other
lever people reach for and it is not one.

## The baseline — take it before touching geometry

Captured 2026-08-21, at the commit that opened this lane, so every option below
has a real before-image. **Options A and B change baked geometry and will
invalidate these as before-images the moment they land — do not re-take them.**

| what | where |
|---|---|
| `chase` + `valley`, all 7 levels, 1280x720 high | `shots/ref-<level>/` |
| the seven of them on one page | `shots/ref-corneria/sheet.png` |
| generator hashes, per level | `shots/ref-geometry-<level>.json` |

Omega has `chase` only — it is the `field` backend and has no corridor for the
`valley` camera to frame. That is not a missing capture.

Per-level generator hashes as of the baseline:

| level | overall |
|---|---|
| corneria | `276edbb3` |
| highlands | `dc1533a8` |
| omega | `ee9b9a9f` |
| foundry | `c3102f0d` |
| aquas | `cf8b45d1` |
| fortuna | `71c4f94c` |
| venom | `7ebf25a8` |

To prove a change did **not** reach a level you did not mean to touch:

```bash
node tools/digest.mjs --level omega --against shots/ref-geometry-omega.json   # exit 1 on any difference
node tools/sheet.mjs shots/ref-venom shots/n-venomN --pair --labels "before,after"
```

## The options

Independent — any subset works. Cheapest first. **A + E is the smallest thing
that would actually change the read.**

### A — asymmetric cross-section

Give a zone `left` and `right` field sets and drop the `Math.abs`. Buys a sheer
wall on one side and open plain on the other, a bank that falls away to nothing,
a corridor that is a shelf against a cliff rather than a trough. One function,
one doubled field set, no new module.

*This is the root cause, and it is the option that stops the other four from
being decoration.*

**Risk:** the baked shore field (`MAX_HALF_WIDTH`, 1250 m) and the `groundAt`
lattice both assume the current profile, and the flight model samples
`profileAt` per tick. Cut the digest baseline above first — this is exactly the
change `tools/digest.mjs` was built for.

### B — enclosure as a per-zone property

`world/canopy.js` already builds a lid for Aquas at y = 620 and answers
`ceilingAt`. Generalise it: any zone gets a ceiling at any height with its own
material. A collapsed lava tube on Venom, a reef roof on Aquas, a stalk canopy
on Fortuna.

**The single biggest change to the composition**, because capping the sky strip
destroys the horizon-down-the-middle read that is in all five captures.

**Risk:** low mechanically. The ceiling query exists and the Foundry already
flies enclosed, so nothing new is being proven. The cost here is art, not
wiring.

### C — a per-planet structure kit

What the owner asked for, and worth being precise about why `islands` is not
already it: every `islands` group is a terrain-derived blob placed by the same
code, so a spatter cone, a plug dome and a mycelial stalk are one prop
recoloured. That is the same failure as the walls, one level down.

What changes it is props the rail passes **through and under** rather than
beside — reef arches, wrecks, colonnades, gantries.

**Risk:** the real work, and the one that needs a rule about collision against
the rail. Start it last, not first.

### D — the floor is not always a flat plane at y = 0

Four of the five put a surface there (water, ice, lava) and the fifth is bare
terrain at the same height. A level with its floor far below the rail, flown
between spires with no readable ground, would not read as any of the others.
Cheapest version: `waterLevel` well under `bed`, so no plane shows at all.

### E — per-level camera, and it is nearly free

The camera never changes: same height, same FOV, same centred vanishing point in
all seven levels, so even a genuinely different world arrives through an
identical lens. A per-level camera height, FOV and rail lateral offset is a data
change of a few numbers, and it multiplies whatever A–D buy.

Measure with `tools/framing.mjs`, which already reports ndcX/ndcY, nose-vs-camera
angle and camera yaw over time. Note its known reading: ~3.5° of hands-off yaw
is shake, not drift — `off.x`/`off.y` measure zero variance. Do not chase it.

## Recommended order

**E → A → B → C.** E because it is a few numbers and the read changes
immediately; A because it is the actual cause and everything else is decoration
until it lands; B for the largest visual return once shape can vary at all; C
when there is real art time to commit.

D is a per-level decision rather than a stage — fold it into whichever level
wants it.

## Rules that apply to this lane

From `HANDOFF.md`, the ones this lane will actually hit:

- **Do not add a module the roadmap does not ask for.** Ship criterion 7 is no
  dead code, and this project has shipped ~5,400 lines of finished, unimported
  modules across two sessions. Option C is where that risk lives.
- **One sub-agent at a time**, plus yourself inline on a disjoint lane. Every
  lane drives the same running app, so two concurrent lanes make every
  before/after capture measure both changes at once.
- **Never claim a look without a PNG you have read**, and non-zero exit from
  `shot.mjs` means console errors, which is an automatic fail. A GLSL reserved
  word cost Fortuna its entire terrain across two sessions of captures because
  nobody read that exit code.
- **When you change what code does, re-read the comment above it.** The zone
  kind table in `zones.js` and the transitions block in `campaign.js` both
  describe a game that has since changed shape.
