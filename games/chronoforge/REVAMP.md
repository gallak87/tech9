# CHRONOFORGE — REVAMP

Written 2026-09-05, after parking `chronoforge-dawn`. This is the decision doc, not a
plan. It records what was tried, what failed and why, and what to do next — so the
next session executes instead of re-deciding.

---

## The call

**Come back to chronoforge. Polish this game. `chronoforge-dawn` is parked.**

The 3D remake reached Phase 4a of 12 — twelve maps of blocked-in ground, a working
generated-mesh character pipeline, and a verification harness. It is not abandoned and
it is not a failure. It is where the 3D skills came from. But finishing it is a content
problem eight biomes wide, and that does not fit a solo dev on a weekly budget.

Chronoforge already has, working and shipped: ATB battle with a Tech submenu, a
three-hero party, inventory and equip, skills with unlock gating, quests, save, a
region graph with tier gates, fog of war, a minimap, settlement build plots with six
building types, and city interiors.

That is six of dawn's twelve phases, already done.

---

## Why dawn felt 5% done, and the fix

**The unit of work was wrong.** Every phase in dawn's plan is *one layer across the
entire game*: "Tier 1 across 12 maps", "battle, everywhere", "six regions to full
fidelity". Nothing is ever finished — each phase is 100% of the game at one thickness.
So after real work there is nothing you can point at and call done.

**The new unit is one loop, finished.** Not "beef up every domain". Pick the loop,
close it, then decide whether to do it again. Chronoforge's core loop is:

> explore region → fight encounter → loot + XP → return to town → build → unlock next region

Every step of that works **except going inside**. Rooms and town centres are empty.
That is the one structural hole, it is bounded, and closing it makes everything after
it genuinely optional.

---

## The root cause of the original stall: ASSET CONSISTENCY

This is the real reason chronoforge stopped, and it is not an art-direction problem.

Local text-to-image (Ollama / Klein) **cannot produce two related assets that match.**
Kaida loses a sleeve between stances. Hair changes layout. Regenerating one asset in a
set breaks the set. No amount of prompt engineering fixed it, and no amount ever will —
there is no shared state between two generations, so consistency is a coin flip.

### Two distinct consistency problems

| Problem | Why gen fails | Answer |
|---|---|---|
| **Characters** — one character, many poses | Nothing carries identity between generations | A 3D model. Same mesh every frame, by construction. |
| **Environments** — many maps, one world | Each map is an independent roll | Don't regenerate maps. See below. |

### What was already tried and does NOT work

**Tilesets with matching edges.** Attempted, failed. Diffusion models have no mechanism
for exact edge continuity — a pixel-perfect seam between two generations is luck, not
prompting. Left/right/top/bottom colour-matched prompts were tried repeatedly and never
lined up. **Do not attempt this again.** It is not a skill gap; it is impossible with
this class of tool.

---

## The overworld: two layers that never touch

The fix that dodges every failure above.

- **Ground** — stays ONE generated painting per map. One image, matches nothing, no
  drift possible. These already exist and are fine.
- **Everything vertical** — free-standing sprites **with alpha**, composited on top.
  Rocks, dead trees, ruined arches, hulls, cliffs, towers.

Free-standing props never share an edge with anything, so **edge matching disappears as
a category of problem.**

### Why this also fixes how the overworld *feels*

Diagnosed by comparing screenshots. The Orbital Reach **interior** is the best-looking
frame in the project: catwalks stacked three deep, girders crossing in front of the
character, one committed teal key light, haze in the distance. She is *inside* something.

The overworld is grass, rocks and bushes — **everything is knee-high.** Nothing towers,
nothing overlaps, nothing occludes her, nothing casts a long shadow. It reads as a
ground texture with scatter on it, not a place.

Same generator, same author. The difference is that one was prompted as a scene and the
other as a tile map.

The prop layer supplies what is missing:

- **Big silhouettes** — things taller than the character that she can walk behind
- **One committed key light per region** — free, if every prop is rendered from one
  fixed camera and light (see below)
- **Atmospheric depth** — haze and desaturation toward the top of the map
- **Uneven density** — clearings and thickets, not a uniform sprinkle. Density
  variation *is* composition, and you only get it by placing props deliberately.

---

## 3D as the consistency engine

`chronoforge-dawn` accidentally built the right tool for a 2D game.

### Characters — PROVEN

`games/chronoforge-dawn/tools/rig.mjs` renders **7 poses × 6 phases = 42 frames** from
one rigged model at 192×288 per cell. Kaida cannot lose a sleeve, because it is the same
mesh in every frame.

For 2D sprites you need **poses, not blend trees** — this is why the 3D animation cliff
does not apply. At overworld scale she is ~50–64 px tall; a hip bob is 2–3 px and the
pixel-snap pass quantises it away. Nobody will see it, and a still that slides is far
worse than an imperfect walk.

Note the irony: dawn's `snapUnitPx`, `SPRITE_PX_PER_METRE` and palette-quantise bands
were built to make a 3D rig read as a sprite. In a 3D game that was fussy detail. **For
pre-rendered 2D it is the entire point.**

### Props — UNTESTED, but strictly easier

**Static props need no rig at all.** Mesh → render from the fixed overworld camera →
PNG with alpha. No skeleton, no auto-rigging, no Mixamo round trip.

Every prop then shares one camera angle and one light direction by construction — which
is exactly the committed key light the overworld lacks.

This path has not been tried. It is simpler than the character path, which has been.

### The cost that remains

The manual **Meshy → Mixamo → download** round trip. It is once *per character*, not per
asset — three heroes and a handful of enemies, then never again. Props skip it entirely.

**Open question: does Mixamo have an API?** There is no official public one; automating
it means driving the browser flow. Worth verifying before building anything around it.
If it can be automated, a drip-style reproduction of every character asset becomes
viable. If not, three manual round trips is still an acceptable one-time cost.

---

## Seriously consider off-the-shelf

There is no prize for generating every pixel yourself, and the thing that actually
stopped this project is asset consistency — which asset packs solve by construction.

itch.io / Kenney / Oryx sell internally-consistent top-down kits for $0–30. That is a
better-looking overworld this week than either pipeline delivers this month.

**Recommended split:**

1. **Asset pack** for the environment prop kit — unblocks the overworld immediately
2. **3D pipeline** for characters only — the one thing a pack cannot give you
3. **Ollama** for one-off hero art where drift does not matter — title screen, region
   cards, portraits generated once and never regenerated

Nothing then depends on the technique that burned this project.

---

## Ranked work

Feel-per-effort. **The first item is an hour and is the difference between a map and a
floor.**

| # | Work | Effort | Note |
|---|---|---|---|
| 1 | **Walkable mask** | tiny | The check already exists — `src/scenes.js:253` does `if (!t \|\| !t.passable) return;`. It never fires because `src/world.js:30` writes `passable: true` on every tile. Sample the map PNG per tile → classify water/rock/cliff. Fixes water-walking AND validates portal placement in one pass. |
| 2 | **Vertical prop layer** | medium | The real feel upgrade. Free-standing alpha sprites over the existing ground painting. See above. |
| 3 | **Battle background from the region** | tiny | Battles happen on a flat purple gradient. Crop the map at the encounter tile → blur → darken → draw behind the ATB. Battles start happening *where you were standing*. |
| 4 | **Kill grid lines, soften fog** | small | Visible grid + hard-edged fog squares are what make it read "engine" instead of "world". Fog is already a per-map canvas (`src/scenes.js:179`) — render at ¼ res and upscale smoothed. |
| 5 | **Colour grade + vignette per region** | tiny | Cheapest mood upgrade available, and the fastest way to make art you don't love read as deliberate. |
| 6 | **Fill the rooms and town centres** | medium | The structural hole. Closes the core loop. |
| 7 | **Contact shadow + depth sort** | small–med | She's a sprite on a flat teal ellipse. Sorting her behind tall props is most of the win, and item 2 is a prerequisite. |
| 8 | **Hit-stop + shake on crits** | small | Freeze 60–90 ms on impact, kick the camera 3–4 px. Most of what "juice" means in a turn-based game. |

---

## The next session

**Do not** start eight regions of art direction.

Do the cheap proof instead: render Kaida's 42-frame sheet at chronoforge's overworld
scale and drop her in beside the current sprite. One session. If she reads at 64 px next
to the existing art, the character pipeline is decided on evidence rather than hope.

Then item 1. It is an hour.

---

## What carries over from dawn, and what doesn't

**Carries:** the discipline of instruments that exit non-zero. In one session that habit
caught four bugs that were invisible by eye — an actor shot rendering an empty scene, a
harness photographing a placeholder because the real asset loads 120 frames late, a gate
grading a mesh the game doesn't draw, and a ground texture tiling once every 21.8 m.
Every one rendered fine and exited 0. **Scale it down — three tools, not sixteen.**

**Does not carry:** most of the code. `world-graph.mjs` and `heightfields.mjs` hold a
better region topology than chronoforge's inherited 7-edge tree, but that is a tuning
change, not a port. Do not re-derive dawn's world data here unless the graph is actually
the problem.

**The real inheritance is that you now understand 3D, rigging and game dev.** That is
not code and it does not need porting.
