# Regen overworld sprites @ 64×64

Run from `games/chronoforge/`.

## Enemies (8 encounter markers)

```bash
node ../../tools/sprite-gen.js sprites-manifest-enemies-ow-64.json
```

Outputs overwrite `src/assets/<name>_ow.png`. Reload the page to pick them up.

Reroll a single one:

```bash
node ../../tools/sprite-gen.js sprites-manifest-enemies-ow-64.json --sprite drone_sentinel_ow
```

## Party heroes (kaida / vex / rune)

```bash
node ../../tools/sprite-gen.js sprites-manifest-heroes-ow-64.json
```

Reroll a single one:

```bash
node ../../tools/sprite-gen.js sprites-manifest-heroes-ow-64.json --sprite kaida_overworld
```

## Battle scene (3 heroes + 8 enemies, directional)

Heroes advance right, enemies advance left, so the two sides face off in-frame. Painterly + black-bg formula, 128×128.

```bash
node ../../tools/sprite-gen.js sprites-manifest-battle-128.json
```

Reroll a single one:

```bash
node ../../tools/sprite-gen.js sprites-manifest-battle-128.json --sprite kaida_battle_idle
```
