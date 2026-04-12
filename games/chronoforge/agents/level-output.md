# Level Design — Chronoforge, Phase 2

World data lives in `src/world.js`. This doc is the design-intent companion.

---

## World dimensions

- **60 tiles wide × 40 tiles tall** = 1920×1280 world-space pixels at 32px/tile
- Roughly 3 screens wide at 1920×1080 viewport

## Biome layout (hand-placed rectangles)

```
x:  0........22........44........60
   ┌──────────┬──────────┬──────────┐
   │          │          │          │
   │ GRASS-   │  NEON    │  ALIEN-  │  y: 0..40
   │ LAND     │  WASTES  │  TERRA-  │
   │ RUINS    │          │  FORM    │
   │          │          │          │
   └──────────┴──────────┴──────────┘
   (starting zone)        (endgame zone)
```

Intent: left-to-right difficulty curve. Grassland is the tutorial biome with the starting city; wastes are mid-game; alien terraform is late-game gated by tech tier.

## Tile distribution

Within each biome, tile type is selected per-tile from a seeded RNG with an 8-10% accent chance (for rubble, trees, neon cables, crystals, etc.). Seed `0xC410FA` is fixed — regenerating the world gives identical output.

## Cities (4)

| id | name | tile (x,y) | biome | landmark sprite | unlock |
|----|------|-----------|-------|-----------------|--------|
| `haventide` | Haventide | 12, 28 | grassland_ruins | `city_haventide` | **starting** — fast-travel always on |
| `emberline` | Emberline | 32, 28 | neon_wastes | `city_emberline` | unlock by walking to the tile |
| `orbital_reach` | Orbital Reach | 45, 14 | neon_wastes | `city_orbital_reach` | unlock by walking to the tile |
| `last_crown` | Last Crown | 52, 22 | alien_terraform | `city_last_crown` | unlock by walking to the tile (Transcendent tier gate in later phase) |

Cities render as 128×96 landmark sprites on the overworld, anchored so their tile is the bottom-center.

## Roads

Three hand-carved `tile_cracked_road` paths connect cities:
1. Haventide → Emberline (via a ridge detour at y=20)
2. Emberline → Orbital Reach (northward)
3. Orbital Reach → Last Crown (east and down into the terraform biome)

Roads are purely cosmetic for Phase 2 but set up visual path guidance.

## Encounter zones (8)

Visible enemy markers (32×32 `_ow` sprites) that trigger a battle when the party steps on them:

| id | tile | enemy | biome |
|----|------|-------|-------|
| e1 | 18, 25 | rust_scrapper | grassland_ruins |
| e2 | 24, 32 | mutant_hound | neon_wastes |
| e3 | 28, 20 | drone_sentinel | neon_wastes |
| e4 | 37, 22 | gravbot | neon_wastes |
| e5 | 42, 18 | neon_cultist | neon_wastes |
| e6 | 47, 10 | sandworm_hatchling | alien_terraform |
| e7 | 48, 20 | wraith_core | alien_terraform |
| e8 | 55, 25 | architect_herald | alien_terraform |

Difficulty rises roughly left-to-right. `architect_herald` is the mini-boss guarding Last Crown.

## Impassable tiles

`tile_stream` (grassland) and `tile_bio_pool` (alien) block movement. Everything else is walkable.

## Fog of war

- Reveal radius on party position: **4 tiles (circular)**
- Revealed tiles are added to `game.explored` set and persist for the session
- Unexplored tiles are darkened to 82% black on the overworld, fully obscured on the Map tab
- Starting zone around Haventide is pre-revealed for gentle onboarding

## Player start

- `(12, 28)` — Haventide's tile.

## Deferred (future phases)

- Quest waypoints and NPC positions (Phase 5)
- Cave / interior sub-maps (post-v1)
- Dynamic encounter respawn rules (currently: once cleared, gone)
- Hidden crystal / collectible placements (Phase 5)
- Difficulty tuning on enemy stats per zone (Phase 5)
