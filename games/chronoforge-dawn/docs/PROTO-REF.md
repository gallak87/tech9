# Prototype reference — what is actually on screen

Ten human-captured frames from the live prototype (`gallak87.github.io/tech9/chronoforge/`),
archived in `shots/proto-ref/`. **Content and systems reference only.** The prototype is not the
quality bar — see `CONCEPT.md`. Two Dawn frames are included because they document a live defect.

Everything below is read off the images, not remembered.

---

## Defect confirmations

| # | Defect | Frame | What is actually visible |
|---|---|---|---|
| 1 | Fog is hard squares | `overworld-fog-on` | Translucent tan/olive squares on the tile grid, stepping to solid black. A literal checkerboard over the painted art. |
| 2 | Grid drawn over the world | `overworld-fog-on` | Thin dark lines across every cell. **Gone entirely in `overworld-fog-off`** — so the grid ships *with the fog overlay*, not as a separate world pass. Start there. |
| 3 | Nothing touches the ground | `overworld-fog-off`, `battle-open` | Overworld actors sit on flat ellipse blobs. Battle actors have no floor at all. Zero cast shadows anywhere in any frame. |
| 4 | Battle has no place | `battle-open` | Three heroes in a left column, one enemy right, over a flat purple vertical gradient. No horizon, no ground, no props. |
| 5 | World is flat | `overworld-fog-off` | Uniform lighting across the whole frame. No elevation, no parallax, no shadow direction. The painted ground art is genuinely good and is getting nothing from the light. |
| 6 | Grey-ghost enemies | `overworld-fog-on` | A Bog Stalker renders as a translucent grey silhouette through the fog, up-left of Kaida. Concealment is neither hidden nor shown. |
| 7 | 1px neon menu chrome | `menu-map` | Outer 1px magenta rect, inner 1px cyan rect. No depth, no glow bleed, no panel weight. |
| 8 | Unstyled HUD | `overworld-fog-on` | `Food 10  Ore 162  Energy 0  Renown 13` as plain coloured text. Party bar is `Kaida · Vex · Rune  pos (31, 8)`. Debug readouts. |

---

## What the prototype gets RIGHT — port the structure

**Menu information design.** Seven tabs with icons: Map · Party · Inventory · Skills · Quests · Save
· Settings. Keyboard hints row is always present: `[Q/E] tabs  [1–7] jump  [Esc/Tab] close`, and the
Map tab adds `(Map: drag / WASD / wheel / =- zoom / R reset)`. Keep all of it.

**Map tab is a region graph, not a minimap.** Painted thumbnails per region, connected by cyan edges,
each badged with its tier (T1–T4). Legend: red = active enemies, green = cleared, cyan diamond =
world drop, magenta = city. This is the twelve-map graph made legible — it is the best screen in the
build.

**Party tab.** Three cards: circle portrait, name, class, level, HP (red) / MP (cyan) / XP (yellow)
bars, six stats in two columns, three equip slots. Classes are named here and nowhere in
`battle.js`: **Kaida = Warrior, Vex = Mage, Rune = Sentinel.**

**Inventory tab.** Owned-item list on the left with icon, name, stat deltas and flavour text; equip
slots on the right under a per-hero tab strip, 3 slots each. Item values on screen match `ITEM_DEFS`
exactly (Data Chip +3 SPD, Scrap Vest +4 DEF, Rune Gauntlet +5 TEC +3 DEF, Void Shard +6 INT +10 MP,
Iron Blade +5 STR).

**Dev panel.** Bottom-right: `BATTLE 1x/3x`, `WORLD FOG: ON/OFF`, `MINIMAP: ON/OFF`, `RESET MAP`,
`REPLAY REWARDS`. Every one of these earns its place. Dawn's `src/core/devpanel.js` already covers
time-of-day, camera shot, sim step and perf; these five are the gameplay half still missing.

**Minimap.** Top-left, labelled with the region name, painted region art with live markers.

**Battle actors reposition.** `battle-midfight` shows Kaida moved out of the column and up beside the
Bog Stalker to strike, then presumably returns. The ATB battle already has actor movement — Tier 4
stages that movement, it does not invent it.

---

## Findings that change the specs

**1. Blob shadow colour carries faction.** Hero blobs are teal, the Bog Stalker's is red-orange.
Replacing blobs with real contact shadows (defect 3) **removes a readability affordance nobody wrote
down.** Friend/foe must stay readable at a glance by some other diegetic means. → `art`, Phase 1.1.

**2. Portraits are placeholders.** Party tab portraits are a coloured circle with a single letter —
K, V, R. There is no portrait art in the prototype at all. So the rig must *generate* the menu
portrait; there is no reference to match and nothing to port. → `art`, Phase 1.1.

**3. Party-tab layout bug.** `SKILL POINTS: 3` renders on top of the Map tab label. Do not reproduce.

**4. Title screen exists and is unspecified.** Neon wordmark, subtitle, CONTINUE / NEW GAME,
`↑↓ to select · ENTER to confirm`, and a save summary line: `Tier Survivor · Lv 2/2/2 · 9/3/2026`.
Not named anywhere in the tier plan. → lands in Tier 5 with the rest of the menu chrome.

**5. Battle HUD is a per-hero row.** Name, HP, MP, a green bar, a cyan bar, then a magenta ATB bar
with a numeric percentage. Combat log prints bottom-right (`A Bog Stalker appears!`,
`Bog Stalker strikes Kaida for 12`).

---

## Dawn's own defect, documented here because it is live

`dawn-2000h-dark` and `dawn-0510h-dark` are Dawn, not the prototype — the `ridge` shot at 20.0h and
5.1h. Both are near-black. Measured on the same camera:

| Hour | median | black% | exposure |
|---|---|---|---|
| 19.75 | 0.118 | 0.0% | 1.99 |
| **20.0** | **0.006** | **34.1%** | 1.72 |
| 21.5 | 0.012 | 41.8% | 1.05 |
| **5.1** | **0.004** | **60.3%** | 1.24 |
| 6.4 (signed off) | 0.212 | 0.0% | 1.05 |

Band floor is median 0.09 with blackPct < 14. Exposure is already *higher* at the failing hours than
at signed-off dawn and returns nothing, which rules out the exposure ramp: there is no light to
expose. Cause is the absence of a twilight/night lighting model — `KEY_RAMP` decays toward zero below
the horizon with no moon key, sky ambient floor or twilight scattering term to take over. This is
**Phase 0.1**, the first task after the gate.
