# art — Phase 1.1 output: Rig, Material, Menu & HUD Spec

Evidence base: `docs/PROTO-REF.md` + all 10 frames in `shots/proto-ref/`, plus
`shots/phase0.1/h20/wide.png` and `shots/exposure-ramp/h6.4/{wide,hero}.png`
(Dawn's current signed-off look — no rig exists yet; those two frames show
placeholder totem/sphere geometry, not a character).

Runnable artifacts (all pass `node <file>`, exit 0):
- `docs/specs/rig.mjs` — joints, sockets, pixel-snap, tone bands
- `docs/specs/palette.mjs` — per-hero palettes, IFF beacon, colour quantise
- `docs/specs/hud.mjs` — tabs, type scale, panel chrome, portrait, loot, title

Import from `src/core/const.js` where a number already exists there
(`HERO_M`, `TILE_M`) rather than re-declaring it — one source of truth.

---

## 1. Rig spec

**Proportions** (metres, ground up, sums to `HERO_M` = 1.72 exactly — see
`rig.mjs::validate()`):

| Segment | Length | Cumulative |
|---|---|---|
| foot (ankle height) | 0.08 | 0.08 |
| lowerLeg | 0.46 | 0.54 |
| upperLeg | 0.42 | 0.96 (= hips joint height) |
| spine_lower | 0.14 | 1.10 |
| spine_upper (chest) | 0.22 | 1.32 |
| neck | 0.08 | 1.40 |
| head | 0.32 | **1.72** |

Arms (from the chest joint): shoulder offset 0.19 out / 0.04 up → upperArm
0.28 → lowerArm 0.24 → hand 0.09 to the grip point.

Per-hero height variance stays inside ±6% of `HERO_M` (Kaida 1.72 baseline,
Vex 1.66 slight, Rune 1.78 bulky) so the Phase 2 silhouette-area gate in
`tools/rig.mjs` doesn't need per-hero special-casing.

**Joints — 19, no fingers/toes/per-vertebra spine.** At ~62px on-screen hero
height, a joint that can't move the silhouette at that size is budget spent on
nothing. Full parent/offset table in `rig.mjs::JOINTS`.

```
hips → spine_lower → spine_upper → neck → head
                   ├→ shoulder_L → upperArm_L → lowerArm_L → hand_L
                   └→ shoulder_R → upperArm_R → lowerArm_R → hand_R
hips → upperLeg_L → lowerLeg_L → foot_L
hips → upperLeg_R → lowerLeg_R → foot_R
```

`shoulder_*` is a separate joint from `upperArm_*` rather than baked into the
bind pose — the one place a combo finisher's close-in cut can still sell a
wind-up cheaply.

**Sockets** — empty `Object3D` nodes on a joint, not part of the 19-bone
skeleton:

| Socket | Joint | Carries |
|---|---|---|
| `weapon` | hand_R | primary weapon — **distinct mesh per item** |
| `offhand` | hand_L | shield / tome / parry weapon |
| `head` | head | helmet / hood / hair topper |
| `back` | spine_upper | cape / backpack / quiver |
| `chest` | spine_upper | accessory charm **and** the IFF ident-beacon (§4a) |

Axis convention, every socket: local **+Y** = the prop's natural swing/extend
axis (blade tip, staff head), local **+Z** = away from the body surface.
Every weapon mesh is authored with its grip at its own local origin against
this convention — that's what lets Kaida's three swords (starting Iron Blade
plus two upgrades on gamedesign's item table) share one socket transform with
zero per-item offset hacks. Armour is **not** a socket prop: it re-skins the
torso/upperArm/upperLeg shell meshes bound to the same 19 joints, because
armour changes body coverage broadly rather than adding a point decoration.

**Pixel-snap.** Applies to the actor render only, never terrain — terrain
stays smooth 3D (defects 1/2/5 want continuous fog, no grid, real elevation
lighting). This is the Octopath-style trick: a continuously-lit 3D rig snapped
to a coarse grid inside its own screen-space bounding box, standing on a
scene that isn't snapped at all.

Grid defined in **metres of character**, not screen pixels, so density holds
constant across the locked overworld framing, a battle push-in, and the
portrait camera:

```
snapUnitPx = actorScreenHeightPx / (actorHeightM × SPRITE_PX_PER_METRE)
SPRITE_PX_PER_METRE = 28   →   hero ≈ 48 virtual rows tall
```

At the locked framing's ~62px hero height that's `snapUnitPx ≈ 1.3` — a fine,
faceted silhouette stepping, not blown-up 8-bit blocks. Starting point, not a
locked constant: tune it at the Phase 2 rig gate against a real screenshot.

**Palette-quantise.** Two independent layers:
- *Tonal* (`rig.mjs::TONE_BANDS = 5`): the rig's own N·L response is banded
  through a 5-step toon ramp (shadow / core-shadow / mid / light / rim), not a
  smooth falloff. This does more of the "reads as sprite" work than the pixel
  grid does. Runs underneath the scene's global grade pass (exposure,
  split-tone, ACES) — same as everything else in the frame.
- *Colour* (`palette.mjs::HERO_PALETTES`): each hero draws from a fixed
  9-colour array (skin, hair, eyes, 2× cloth, trim, metal, weapon-emissive,
  shadow-tint) — a hand-authored-sprite-sheet-sized budget, not ad-hoc hex
  literals scattered through the actors lane.

---

## 2. Material and colour language

Magenta/cyan neon over dusty earth is already established in
`src/render/materials.js` (`neonMagenta` 0xff2fa0, `neonCyan` 0x22e5ff,
`painted` 0x8d3b52, `metal` 0x9aa3ad) — the rig draws from that kit, doesn't
invent a parallel one.

- **Heroes** = clean scavenged tech: dielectric painted cloth/armour +
  brushed metal trim + one emissive neon accent (weapon blade or eye glow),
  matching each hero's already-established identity colour from the
  prototype's portrait rings (Kaida magenta, Vex cyan, Rune gold —
  `palette.mjs::HERO_PALETTES`).
- **Enemies** = feral/corrupted organic: hide/chitin earth tones
  (`ENEMY_PALETTE_FAMILY`), no neon accent except a hazard-orange
  bioluminescent marking that doubles as the IFF hostile colour (§4a) — this
  makes friend/foe a *material-family* read, not only a beacon read.
- Every material response differs under the same key light (metal picks up
  the sky via `envMapIntensity`, painted cloth stays matte, chitin sits
  between the two) — this is the "material variety" bar CONTRACT.md sets, and
  the rig needs to clear it at ~62px, which is why colour separation between
  materials matters more here than roughness variation does.

**Close-crop survival**: the combo-finisher cinematic is the stress test — it
breaks the 55° pitch lock and pushes in. The 5-band toon ramp and 9-colour
budget were sized so a close-up shows *discrete, deliberate* bands, not a
blown-up-and-now-visibly-empty flat-shaded low-poly mesh. If a finisher crop
reveals an untextured flat face, that's a defect against CONTRACT.md §6, not
an acceptable cost of the close-up.

**Five quality notches**: the rig's look must not visibly change across
`potato → ultra` — only its cost should. See §4c for the potato read
specifically; the short version is the toon-ramp + limited palette were
chosen because they don't depend on bloom or SMAA to be legible, so turning
those off (potato) barely moves the character even though it clearly moves
the environment.

---

## 3. Menu chrome, HUD, title screen, loot drop

Structure kept from the prototype exactly — proto-ref says it's the best
screen in the build and there's no reason to touch information design that
already works: 7 tabs (Map·Party·Inventory·Skills·Quests·Save·Settings),
`Q/E` + `1–7` + `Esc/Tab`, Map tab's extra drag/zoom hint. Table in
`hud.mjs::TABS`.

**What actually changes** (defect 7: 1px neon rectangle → depth/glow
bleed/panel weight; defect 8: unstyled debug text → designed HUD):

`ui` draws to the DOM/canvas `#ui` layer only — it never touches the post
chain, so there is no real bloom pass available here. Glow bleed is faked
with stacked shadows (`hud.mjs::PANEL.glowBleed`, three passes at increasing
blur / decreasing alpha — a CSS answer to a bloom falloff curve). Panel is
three layers, not one: a scrim behind it (the prototype had none — that's
most of why its chrome read as painted onto the game rather than floating
above it), a translucent blurred fill, and a 1.5px hairline border in the
active tab's colour carrying the glow. Small corner accent brackets, not full
rounding — sci-fi panel weight, not soft-app rounding.

Type hierarchy replaces the prototype's flat debug-text everything: player
UI gets a clean sans (`Inter`/system-ui), monospace is kept but demoted to
where alignment actually matters — stat columns and the keyboard-hint row.
Reusing `devpanel.js`'s monospace-everywhere look for player UI is exactly
how defect 8 happens again; kept them visually distinct on purpose. Full
scale in `hud.mjs::TYPE_SCALE`, contrast-checked against the panel background
(`node docs/specs/hud.mjs` prints 17.4:1 body / 5.7:1 muted — both clear WCAG
AA).

HP/red, MP/cyan, XP/yellow bars are kept — already legible, already distinct
from any hero's identity colour, no reason to invent new ones.

**Portrait crop** — see §4b, it's load-bearing enough to live there.

**Title screen** (proto-ref finding 4 — exists, unassigned until now, lands
Tier 5 with the rest of menu chrome): same content — neon wordmark, subtitle,
CONTINUE/NEW GAME, `↑↓ / ENTER` hint, save-summary line
(`Tier {tier} · Lv {k}/{v}/{r} · {date}`) — through the same panel-chrome
material as everything else, not a bespoke treatment. `hud.mjs::TITLE_SCREEN`.

**Loot drop** — diegetic per CONCEPT.md ("not a silent inventory increment"):
item mesh tosses from the source with a short physical arc and one bounce,
settles as a small standing prop (thin neon light pillar + slow-rotating item
mesh), rarity read through pillar colour along the existing
`materials.js::M.ramp` gradient rather than a new colour system. A
lower-third toast (`+{itemName}`) confirms pickup for players looking at
their party, not the ground. `hud.mjs::LOOT_DROP`.

---

## 4. Three mandatory findings

### 4a. Blob-shadow friend/foe → IFF ident-beacon (this is the real one)

**Problem.** Proto-ref: hero blobs are teal, the Bog Stalker's is red-orange —
the shadow's *colour* is currently the only friend/foe tell. Defect 3 (real
contact shadowing) kills that: a physically-lit, correctly-shaped shadow
cannot also be a coloured faction paint without stopping being a shadow.
Defect 6 additionally rules out a non-diegetic marker — no floating icon, no
screen-space chip pretending to be part of the world.

**Rejected options, briefly:**
- *Recolour the rim light per faction* — collides with per-hero identity
  colours that already exist (Kaida is magenta, an enemy rim in magenta would
  read as "another Kaida," not "hostile").
- *A third UI hue for hazard* — CONCEPT.md's whole palette is magenta/cyan;
  introducing green/red dilutes an identity the game is built around.
- *Silhouette alone* — works for beast-shaped enemies (Bog Stalker) but proto-
  ref's `overworld-fog-off` frame shows a humanoid raider enemy close enough
  in body plan to a hero that silhouette alone isn't reliable at a glance,
  especially under fog/dusk.

**Fix: shape-first, colour-second, diegetic.** A small emissive pennant on
`socket.chest` (`rig.mjs`), built from the existing neon-emissive material —
zero new geometry budget beyond one quad per actor, no point light (per
`materials.js`'s own rule against per-strip point lights).

| | Shape | Colour | Pulse |
|---|---|---|---|
| Ally | points **up** | cyan `#22e5ff` | 0.6 Hz |
| Hostile | points **down** | hazard amber `#ff5a2a` | 0.9 Hz |

Shape is primary: it survives colourblindness and survives fog/dusk
desaturation, where a colour-only tell is exactly the kind of thing that
degrades first. Colour reinforces for players who have it. It's diegetic —
in-fiction, chrono-forge ident tech every actor visibly wears (fits "alien-
terraformed ruins / chrono tech" tone directly) — and it's lit by the same key
light as everything else, so it's unaffected by whatever the *ground* shadow
underneath is doing. The hazard-amber also matches the enemy palette family's
bioluminescent warning marking (§2), so the read starts at the material level
before a player even clocks the beacon. Full spec + a colour-distance
self-check: `palette.mjs::IFF_BEACON`.

### 4b. Portrait — generated by the rig, no reference to match

Proto-ref: Party tab portraits are placeholder letter-circles (K/V/R), no
portrait art exists anywhere in the prototype. So the crop has to be
authored, not matched.

**Spec** (`hud.mjs::PORTRAIT`): a dedicated camera, not a cropped gameplay
frame. Front three-quarter — 15° yaw off the character's own forward, 6°
downward pitch. Gameplay's 55° overhead pitch on a portrait reads as the top
of a head, not a face; this camera exists specifically so it doesn't. Bust
framing, mid-chest to just above the crown (0.55m of a 1.72m character),
square 256px render — UI applies the circle mask, same footprint as the
prototype's badges.

Same rig, same equipped meshes, same palette and tone-band rules as the
overworld render — the portrait is required to re-render live on
`weapon:equipped` / `armor:equipped` / `accessory:equipped` /
`hero:levelUp` so a sword swap changes the hero in the world, in battle, *and*
in the portrait, per CONCEPT.md. Virtual-pixel density matches the overworld
rig's `SPRITE_PX_PER_METRE`, not an independently-tuned "sharper" portrait
resolution — because the bust fills far more of the frame, it lands at a
higher *absolute* row count (~15 rows for 0.55m of character) automatically,
without the portrait looking like a different rendering system attached to
the same game.

### 4c. Potato notch (renderScale 0.45, shadowMap 512, no bloom, no SMAA)

The rig's legibility does not depend on the passes potato turns off, by
construction:

- **Toon-ramp shading is already hard-edged, flat-region banding** — it was
  never leaning on bloom to look soft or on SMAA to look clean. Turning both
  off costs the rig almost nothing; it costs the *environment* (neon
  strip bleed, terrain edge AA) far more, which is the correct trade — the
  character is the thing that has to keep reading.
- **Lower renderScale coarsens the pixel-snap grid for free.** At potato the
  actual framebuffer the snap shader runs against is ~0.45× resolution — hero
  height in the real render target drops toward the same order as the
  virtual-pixel grid itself, so the deliberate "sprite" stepping and the
  engine's native low-res stepping reinforce each other instead of fighting.
  This is a case where the cheap notch coincidentally *helps* the intended
  look rather than degrading it.
- **What actually degrades**: neon trim loses its soft glow bleed (reads as a
  flat bright colour instead of an atmospheric glow — still unambiguously
  "the neon bit," just less moody), and the character's own *cast* shadow
  onto the ground gets blockier at 512 vs 4096 shadow-map texels (the rig's
  own self-shading is toon-ramp-driven, not shadow-map-driven, so this only
  affects the contact shadow it throws, not its own body read).

Net: expect potato to look flatter and less atmospheric, not less legible.
Verify this claim, don't take it on my word — see the QA note below.

---

## Human QA warranted

**Yes, before Phase 2 starts building against this spec.** Nothing here has
been screenshotted yet — there's no rig to screenshot; Phase 2 is the gate
where dev builds the first one from this document and critic scores it. What
*is* worth a human eyeball right now, cheaply, before that phase burns a
round on a wrong assumption:

1. **The IFF beacon shape convention** (§4a) — up/down pennant, cyan/amber.
   This is a genuine design call with no prior art in this codebase to check
   against; five minutes looking at a mocked-up up-pennant vs down-pennant at
   arm's length (print two sketches, or squint at the hex swatches in
   `palette.mjs`'s output) is cheap insurance against building the wrong
   convention into 19 joints and three heroes' worth of rig code.
2. **The pixel-snap density** (48 rows / `snapUnitPx ≈ 1.3`) — I picked this
   from the framing math in `core/const.js`, not from a rendered image,
   because no rig exists to render. It's explicitly flagged as a starting
   point for the Phase 2 gate, but if the human has an opinion on "chunky
   8-bit" vs "faceted-but-smooth" *before* dev spends a round on it, that's
   the moment to say so — changing `SPRITE_PX_PER_METRE` after a working rig
   exists is cheap; changing it after animation/pose work is layered on top
   is not.

Would count as **wrong**: the beacon reads as a UI element rather than
something the character is wearing; the pixel-snap grid is coarse enough to
look like a resolution bug rather than a style choice; either hero-palette or
enemy-palette departs far enough from the prototype's established colours
(magenta Kaida, cyan Vex, gold Rune) that a returning player wouldn't
recognise them.
