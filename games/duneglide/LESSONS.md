# duneglide — Lessons

Free-roam terrain-glide game in Godot 4.6 Forward+. Built ad-hoc, outside the `/generate`
pipeline — which is itself the first lesson.

Tags: [godot] [terrain] [shader] [mcp] [process]

---

## [process] The framework could not have built this game

duneglide and void-fracture were built by hand because `rendering_tier` had no `godot` option,
`dev` was hardcoded to Vite + npm, and the MCP bridge was documented in the README rather than
being a capability an agent could be handed. Every Godot lesson below was therefore learned
outside the pipeline and had no route back into it.

Patched: `godot` tier, `godot_dev` / `godot_techart` / `godot_tools` roles,
`capabilities/godot-mcp.md`, `vocab/templates/stacks/stack-godot.md`.

---

## [mcp] Screenshots lie when the window is occluded

macOS stops compositing an unfocused/covered window and `game_screenshot` returns the **last
frame with no error** — pixel-identical, indefinitely. This cost close to an hour across two
separate debugging sessions, both spent concluding that changes "did nothing".

**Rule: if two successive screenshots are impossibly identical, verify the game is live via
`game_eval` on a moving value before believing them.**

---

## [mcp] Prove invariants with `game_eval`, not with screenshots

An intermittent chunk-sized terrain artifact survived roughly a dozen screenshot-hunting
attempts and three wrong diagnoses. What actually solved it was stating the geometric
invariant and testing it over 20,000 random player positions in a single `game_eval` call:
**44,830 of 60,000 LOD seams were uncovered.** Root cause proven in one call.

**Rule: if a bug has an arithmetic or geometric statement behind it, test the statement over
thousands of cases. Do not go frame-hunting.** This is the single highest-leverage technique
found in the whole build.

---

## [mcp] Debug colours beat staring

Setting a value to pure red and seeing what turns red converts a hypothesis into a yes/no in
one frame. It also catches couplings you did not know existed — setting the sky's ground
colour red turned the *entire terrain* pink, which is how `fog_aerial_perspective` was
discovered to tint distance fog with sky radiance along the view ray. The accident was the
finding.

---

## [terrain] A smooth sheet cannot sit under a stepped surface

The terrain was tiles-with-a-skirt hovering over a separate smooth substrate mesh. The gap
between skirt-bottom and sheet is a free variable that moves with slope, and it produced
**three distinct bug reports that were all one bug**: substrate punching up through tile tops,
seeing under the tiles to the far slope, and tall risers added to chase it. Each fix moved the
error rather than removing it.

Solid full-width columns, with the columns *being* the ground, made all three states
unrepresentable and deleted an entire mesh, shader, and set of tuning params. Draw calls
halved, 19 → 11.

**Rule: when three symptoms keep trading places under fixes, stop fixing symptoms — the
representation is wrong.**

---

## [terrain] Clipmap rings must share one snap point

Ring L covered `snap_L ± 2·s_L` while ring L+1's hollow centre was `snap_(L+1) ± 2·s_L` — the
same size, so they only aligned when the two snaps were equal, which they were not for ~75%
of player positions. A one-chunk strip of the hole was covered by nothing at all.

**Rule: every clipmap ring snaps on the finest ring's grid.** Coverage and hole become
identical by construction. Requires `chunk_n % 2^(lod_count-1) == 0` so the shared step stays
a whole number of cells at the coarsest ring — asserted at startup.

---

## [shader] The sky's below-horizon colour is not just sky

It feeds three things at once: ambient irradiance, `fog_aerial_perspective` (which tints
distance fog with sky radiance *along the view ray*), and the grazing reflection on any glossy
ground material. Raising it to hide the clipmap edge washed the entire scene to white via all
three paths.

**Rule: hide a terrain edge with a narrow fog-coloured band under the horizon, never by
raising the ground colour.** Size the band from
`atan(eye_height_above_distant_terrain / clipmap_radius)` — and note the driver is height
above *distant* terrain, not altitude, so ridge-flying is the worst case, not high altitude.

---

## [shader] Value relationships beat surface detail

The terrain read as "vector art, not concrete" and the instinct was to add finish detail. The
actual cause was an inverted value relationship against the reference: the reference had dark
sparse marks on a bright glossy floor; the build had light dense marks on a dark floor.
Swapping which surface was bright fixed the read with no geometry change and no added detail.

**Rule: check the value relationship against the reference before adding detail.**

---

## [shader] Comment why a constant is what it is

Every tuned constant that got "cleaned up" later broke the look. Emission energies tuned for
thin neon strips blow out completely on full faces (3.5 → 0.10). A per-cell hue range that
reads fine on a light albedo goes speckly on a dark one. None of that is inferable from the
number.

---

## [process] Three wrong diagnoses in a row, all confidently stated

The artifact hunt produced three consecutive wrong root causes, each stated with more
confidence than the evidence supported, each "fixed" and committed before the next report
proved it wrong. The pattern that broke it was switching from *looking* to *deriving* — the
invariant test above.

**Rule for agents: after one wrong diagnosis of a visual artifact, stop iterating on
screenshots and derive the invariant instead. State confidence honestly; a hypothesis called a
finding costs the next three hours.**
