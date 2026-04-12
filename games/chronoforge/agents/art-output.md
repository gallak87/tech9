# Art Spec — Chronoforge

Visual direction + full sprite catalog. Consumed by dev (dimensions, fallback contract) and by `/run-art chronoforge` pipeline (generation prompts).

---

## 1. Visual direction

**Pitch in one line:** SNES-era pixel heroes & tiles layered with modern neon particles, bloom, and cinematic camera — "Chrono Trigger if it got a synthwave reboot."

**References:**
- Chrono Trigger (battle poses, portrait flashes, dual-tech framing)
- Hyper Light Drifter (neon + dusk palette, silhouette clarity)
- Octopath Traveler HD-2D (chunky pixel heroes + bloom)
- Katana Zero (magenta/cyan accent discipline)
- Age of Empires II (building tier reads at a glance)

**Silhouette rule:** every sprite must be instantly readable at 32×32. Heroes have distinct headgear shapes (Kaida: short sweep; Vex: tall hood; Rune: goggles + antenna).

---

## 2. Palette

```
bg-night      #07060d   deep void
bg-alt        #120a22   panel fill
grid          #1d1638   faint line
ink           #e7e5ff   primary text / highlight
dim           #8a83b8   secondary text

accent-magenta #ff2dd4  crit / Kaida / UI primary
accent-cyan    #22e3ff  magic / Vex / water
accent-yellow  #ffd23f  energy / Rune / warnings
accent-green   #3fc870  heal / toxic biome
accent-pink    #ff5ea8  neon-city warm
sand           #c89b6a  wasteland
steel          #7682a8  metal buildings
rust           #a65a3a  early-tier buildings
```

All sprites generate on **transparent or pure black (#000)** backgrounds to composite cleanly.

---

## 3. Dimensions

| asset type | size | frames |
|-----------|------|--------|
| Overworld character | 32×32 | 1 (idle) for v1; walk cycle later |
| Battle character | 64×64 | 1 per pose (idle/attack/cast/hurt/victory) |
| Portrait (dialog) | 128×128 | 1 (neutral) |
| Enemy (battle) | 64×64 | 1 per pose (idle/attack/hurt/death) |
| Enemy (overworld) | 32×32 | 1 (idle) |
| Building | 96×96 | 1 per tier |
| Tile | 32×32 | 1 |
| City landmark | 128×96 | 1 |
| UI icon | 24×24 | 1 |
| VFX sheet | 64×64 | 1 frame, dev loops procedurally |
| Projectile | 16×16 | 1 |

Dev reads dimensions from `sprites-manifest.json`. Placeholder = flat rectangle in palette color with 1px accent border and centered emoji/letter label.

---

## 4. Placeholder contract (dev consumes this)

Each sprite in the manifest has an `out` path like `src/assets/kaida_battle_idle.png`. Dev's renderer:
1. Tries to load `out`.
2. If 404 / missing, falls back to a **procedural placeholder**: a filled rect in the sprite's declared palette color, with the first letter of `name` centered, sized to `w × h`.
3. Settings tab toggle: "Show placeholders" forces fallback even if PNG exists (for A/B beta comparison).

This contract lets dev ship Phase 2 with zero blocking on art generation.

---

## 5. Comprehensive sprite catalog

Full list below — manifest in `sprites-manifest.json`. Grouped for review.

### Heroes (battle — 5 poses each × 3 heroes = 15)
- `kaida_battle_idle`, `kaida_battle_attack`, `kaida_battle_cast`, `kaida_battle_hurt`, `kaida_battle_victory`
- `vex_battle_idle`, `vex_battle_attack`, `vex_battle_cast`, `vex_battle_hurt`, `vex_battle_victory`
- `rune_battle_idle`, `rune_battle_attack`, `rune_battle_cast`, `rune_battle_hurt`, `rune_battle_victory`

### Heroes (overworld — 1 each × 3 = 3)
- `kaida_overworld`, `vex_overworld`, `rune_overworld`

### Portraits (128×128 × 3 = 3)
- `kaida_portrait`, `vex_portrait`, `rune_portrait`

### Enemies (4 poses × 8 enemies + final boss = 33)
For each of `rust_scrapper, drone_sentinel, mutant_hound, gravbot, neon_cultist, sandworm_hatchling, wraith_core, architect_herald`: `_idle, _attack, _hurt, _death`
- Plus `void_architect_p1`, `void_architect_p2`, `void_architect_p3` (final boss, 3 phases × 1 large sprite)
- Plus overworld minis (32×32) for visible encounter markers: 8 `*_ow` sprites

### Buildings (8 types × 4 tiers = 32)
- `town_center_t1…t4`, `farm_t1…t4`, `mine_t1…t4`, `energy_extractor_t1…t4`, `barracks_t1…t4`, `forge_t1…t4`, `research_lab_t1…t4`, `wall_t1…t4`

### Tiles (3 biomes × ~6 each = 18)
- **grassland_ruins:** `grass, dirt, ruin_rubble, dead_tree, stream, cracked_road`
- **neon_wastes:** `sand, rust_patch, neon_cable, barricade, billboard, broken_highway`
- **alien_terraform:** `bio_moss, crystal_shard, bio_pool, alien_tree, terraform_pipe, growth_tile`

### City landmarks (4 cities × 1 each = 4)
- `city_haventide` (coastal fishing port, pink-neon docks)
- `city_emberline` (desert trade hub, rust + brass)
- `city_orbital_reach` (ruined space-elevator base, cyan steel)
- `city_last_crown` (final capital, magenta megacity)

### VFX (8)
- `vfx_slash_trail`, `vfx_burst`, `vfx_shockwave`, `vfx_timefreeze_pulse`, `vfx_flame`, `vfx_ice_shard`, `vfx_void_rift`, `vfx_heal_sparkle`

### Projectiles (5)
- `proj_pulse_bolt`, `proj_chrono_shard`, `proj_drone_pellet`, `proj_enemy_arrow`, `proj_void_lance`

### UI icons (16)
- Resource: `icon_food, icon_ore, icon_energy, icon_renown, icon_skill_point`
- Gear: `icon_weapon, icon_armor, icon_accessory`
- Status: `icon_crit, icon_heal, icon_shield, icon_buff, icon_debuff`
- Menu tabs: `tab_map, tab_party, tab_inventory, tab_skills, tab_quests, tab_save, tab_settings`

**Total catalog: ~140 sprites.** Generation priority (for art agent when running `/run-art`):

1. **Priority 1 (Phase 2 needs):** 3 hero overworld + 3 hero battle idles + 3 portraits + 6 grassland tiles + 4 city landmarks + menu tab icons + resource icons
2. **Priority 2 (Phase 3 needs):** all enemy battle poses + VFX + projectiles
3. **Priority 3 (Phase 4 needs):** all buildings × 4 tiers
4. **Priority 4 (Phase 5 needs):** remaining biomes + status icons + remaining hero poses

Each manifest entry lists `priority` (1-4) so the art pipeline can generate in order.
