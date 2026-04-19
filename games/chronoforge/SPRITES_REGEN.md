# Sprite Regen

All commands run from **repo root** (`tech9/`).
Single manifest: `games/chronoforge/sprites-manifest.json`

---

## Heroes

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=kaida
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=vex
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=rune
```

## T1 Enemies

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=rust_scrapper
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=drone_sentinel
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=mutant_hound
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=gravbot
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=neon_cultist
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=sandworm_hatchling
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=wraith_core
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=architect_herald
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=void_architect
```

## T2–T5 Enemies

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=bog_stalker
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=slag_rat
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=mire_hulk
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=glacier_wolf
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=ember_golem
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=frost_revenant
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=mire_warden
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=magma_behemoth
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=frost_colossus
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=ember_lord
```

## World Drop Icons

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=drops
```

## Portraits

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=portraits
```

## City Landmarks

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=cities
```

## City Interiors (NEW)

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=city_interior
```

## Buildings — overhead angle, no black bg (re-run)

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --tags=buildings
```

## Haventide landmark — overhead angle, no black bg (re-run)

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --sprite city_haventide
```

---

## Single sprite

```
node tools/sprite-gen.js games/chronoforge/sprites-manifest.json --sprite kaida_battle_idle
```
