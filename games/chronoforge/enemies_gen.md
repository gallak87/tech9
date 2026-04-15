# Chronoforge — World + Enemies Gen v2

Kick off all three from the `games/chronoforge/` directory. Runs sequentially; each pass takes a while.

```
node ../../tools/sprite-gen.js sprites-manifest-worlds-biome-v2.json && \
  node ../../tools/sprite-gen.js sprites-manifest-enemies-ow-tier-v2.json && \
  node ../../tools/sprite-gen.js sprites-manifest-enemies-battle-tier-v2.json
```

## What you get

**worlds-biome-v2** → 3 × 2048×1280 overhead map PNGs in `src/assets/probe/`:
- `world_mire_bog.png` — tier 2 swamp (peat/moss, murky green pools, plank trail N→S)
- `world_crater_ember.png` — tier 4 volcanic crater (obsidian, lava pools, ash trail W→E)
- `world_frost_canyon.png` — tier 3 frost canyon (snow, frozen river band N→S)

Eyeball each one in the PROBE → WORLD viewer before committing — reroll the single sprite if layout isn't walkable:
```
node ../../tools/sprite-gen.js sprites-manifest-worlds-biome-v2.json --sprite world_mire_bog
```

**enemies-ow-tier-v2** → 10 × 128×128 overhead markers in `src/assets/`:
- T1: `bog_stalker_ow.png`, `slag_rat_ow.png`
- T2: `mire_hulk_ow.png`, `glacier_wolf_ow.png`
- T3: `ember_golem_ow.png`, `frost_revenant_ow.png`
- T4: `mire_warden_ow.png`, `magma_behemoth_ow.png`
- T5: `frost_colossus_ow.png`, `ember_lord_ow.png`

**enemies-battle-tier-v2** → same 10 enemies in `*_idle.png` poses facing left for battle scenes.

## Retry one at a time

```
node ../../tools/sprite-gen.js sprites-manifest-enemies-ow-tier-v2.json --sprite magma_behemoth_ow
```

## Code slots the art lands into

Filenames above are already referenced by:
- `MAPS.<region>.backdrop` in `src/world.js` (`world_<name>` → `assets/probe/world_<name>.png`)
- `drawSprite(ctx, '<enemy>_ow', ...)` in `src/scenes.js` (overworld markers)
- `drawSprite(ctx, '<enemy>_idle', ...)` in `src/battle.js` (battle poses)

No code wiring is blocked on art — placeholders render until the PNGs land, then they hot-swap in at next game reload.
