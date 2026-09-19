# Production asset inventory

This inventory describes the required sources imported by the running game. It does not assign an art-quality score. Actual world, battle, walking, interiors, UI and animation reviews are documented in [SHOWCASE_CRITIQUE.md](SHOWCASE_CRITIQUE.md), with raw captures under [evidence](../evidence/).

## Coverage

- **3 heroes:** Kaida, Vex and Rune each have twelve canonical poses, a portrait extracted from their own sheet, and a dedicated twelve-frame directional walk sheet (four phases each for side, front and back; left mirrors side). Runtime anticipation, lunges, shield launch, casting, hurt, defense, healing, defeat and victory use the corresponding grounded poses and the authoritative combat clock.
- **19 distinct enemies:** all eighteen continuity identities plus the separate Void Architect. Every identity has its own six-pose source and measured feet/extent metadata. Large bosses have individual silhouettes and source scales. Down poses remain visible before a short fade.
- **Regional environments:** each installed biome has its own eight-prop atlas and six-material ground atlas. The renderer composes outdoor depth, roads, water/cliffs, landmarks, foreground layers and encounter backdrops at a consistent native scale. All eight outdoor worlds are 5760×2520.
- **8 civic structures × four levels:** Town Center, Farm, Mine, Energy Extractor, Barracks, Forge, Research Lab and Walls, the original production/culture sheets plus four dedicated regional town-center families (Haventide, Emberline, Orbital Reach and Last Crown), each with growing per-tier world dimensions and a futuristic final stage. Shared settlement rules drive the visible level.
- **Interiors and residents:** eight market furnishings plus eight domestic furnishings (bed, stove, table, desk, bookshelf, lantern, chair and pantry), six civilians with front/back views and matching portraits, six interior floor materials and six wall materials. Four liberated town centers and sixteen houses/caves use authored footprints, furniture, events and exits.
- **34 item identities:** generated transparent resource, consumable and accessory icons plus code-native equipment icons, shared by inventory, shops and queued reward badges. See [icon assets](icon-assets.md) and [src/item-art.js](../src/item-art.js).
- **Interface:** seven parchment expedition tabs, compact neutral field UI and the folding battle interface with lava-orange focus/timing cues. Barlow and EB Garamond fonts are bundled locally. See [accepted UI direction](UI_DIRECTION.md).
- **Combat effects:** original pixel ribbons, shards, arcs, petals, waves, contact accents and fading hit numbers in [src/combat.js](../src/combat.js); each coordinated technique has distinct staging. These effects share the action clock with outcomes.
- **Audio:** original synthesized regional motifs, battle variation and compact interaction/contact/timing/critical cues in [src/audio.js](../src/audio.js). There are no downloaded recordings, sound packs or external runtime assets.

## Immutable source files

82 required PNG sources, 167.79 MiB on disk. A complete SHA-256 and byte inventory is in [asset-inventory.json](asset-inventory.json). This compressed-file size is distinct from decoded source and ground-cache memory; live measurements are in [performance.json](../evidence/performance.json).

| ID | Use | Source dimensions | Source frames/cells | File |
| --- | --- | --- | --- | --- |
| haventide_town_center | townCenter | 1254×1254 | 4 | [PNG](../public/assets/town-centers/haventide-town-center-tiers-v1-source.png) |
| emberline_town_center | townCenter | 1254×1254 | 4 | [PNG](../public/assets/town-centers/emberline-town-center-tiers-v1-source.png) |
| orbital_reach_town_center | townCenter | 1254×1254 | 4 | [PNG](../public/assets/town-centers/orbital-reach-town-center-tiers-v1-source.png) |
| last_crown_town_center | townCenter | 1254×1254 | 4 | [PNG](../public/assets/town-centers/last-crown-town-center-tiers-v1-source.png) |
| kaida_walk | kaidaWalk | 1448×1086 | 12 | [PNG](../public/assets/kaida-walk-source.png) |
| kaida_showcase | kaida | 2172×724 | 12 | [PNG](../public/assets/kaida-showcase-source.png) |
| coast_props | environment / coast | 1774×887 | 8 | [PNG](../public/assets/coast-props-source.png) |
| coast_ground | ground / coast | 1536×1024 | 6 | [PNG](../public/assets/coast-ground-source.png) |
| emberline_props | environment / desert | 1774×887 | 8 | [PNG](../public/assets/emberline-props-source.png) |
| emberline_ground | ground / desert | 1536×1024 | 6 | [PNG](../public/assets/emberline-ground-source.png) |
| interior_ground | interiorGround | 1536×1024 | 6 | [PNG](../public/assets/interior-ground-source.png) |
| interior_wall | interiorWall | 1536×1024 | 6 | [PNG](../public/assets/interior-wall-source.png) |
| civic_production | building | 1254×1254 | 16 | [PNG](../public/assets/civic-production-source.png) |
| civic_culture | building | 1254×1254 | 16 | [PNG](../public/assets/civic-culture-source.png) |
| haventide_interior | interior | 1774×887 | 8 | [PNG](../public/assets/haventide-interior-source.png) |
| domestic_furniture | domestic | 1774×887 | 8 | [PNG](../public/assets/domestic-furniture-source.png) |
| haventide_civilians | civilian | 2172×724 | 12 | [PNG](../public/assets/haventide-civilians-source.png) |
| rust_scrapper | enemy | 1536×1024 | 6 | [PNG](../public/assets/rust-scrapper-source.png) |
| forest_veil_props | environment / forest | 1774×887 | 8 | [PNG](../public/assets/forest-veil-props-source.png) |
| forest_veil_ground | ground / forest | 1536×1024 | 6 | [PNG](../public/assets/forest-veil-ground-source.png) |
| mire_bog_props | environment / mire | 1774×887 | 8 | [PNG](../public/assets/mire-bog-props-source.png) |
| mire_bog_ground | ground / mire | 1536×1024 | 6 | [PNG](../public/assets/mire-bog-ground-source.png) |
| crater_ember_props | environment / volcanic | 1774×887 | 8 | [PNG](../public/assets/crater-ember-props-source.png) |
| crater_ember_ground | ground / volcanic | 1536×1024 | 6 | [PNG](../public/assets/crater-ember-ground-source.png) |
| orbital_reach_props | environment / snow | 1774×887 | 8 | [PNG](../public/assets/orbital-reach-props-source.png) |
| orbital_reach_ground | ground / snow | 1536×1024 | 6 | [PNG](../public/assets/orbital-reach-ground-source.png) |
| frost_canyon_props | environment / ice | 1774×887 | 8 | [PNG](../public/assets/frost-canyon-props-source.png) |
| frost_canyon_ground | ground / ice | 1536×1024 | 6 | [PNG](../public/assets/frost-canyon-ground-source.png) |
| last_crown_props | environment / alien | 1774×887 | 8 | [PNG](../public/assets/last-crown-props-source.png) |
| last_crown_ground | ground / alien | 1536×1024 | 6 | [PNG](../public/assets/last-crown-ground-source.png) |
| world_interactions | worldProp | 1774×887 | 8 | [PNG](../public/assets/world-props-source.png) |
| food | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/food-source.png) |
| ore | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/ore-source.png) |
| energy | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/energy-source.png) |
| renown | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/renown-source.png) |
| field_tonic | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/field_tonic-source.png) |
| ether_cell | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/ether_cell-source.png) |
| dawn_seed | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/dawn_seed-source.png) |
| tide_elixir | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/tide_elixir-source.png) |
| star_cell | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/star_cell-source.png) |
| data_chip | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/data_chip-source.png) |
| crit_lens | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/crit_lens-source.png) |
| swamp_coil | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/swamp_coil-source.png) |
| moss_ward | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/moss_ward-source.png) |
| ember_crown | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/ember_crown-source.png) |
| witness_prism | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/witness_prism-source.png) |
| quiet_prism | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/quiet_prism-v3-source.png) |
| namekeeper | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/namekeeper-source.png) |
| open_gate | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/open_gate-source.png) |
| mara_compass | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/mara_compass-source.png) |
| xp | itemIcon | 1254×1254 | 1 | [PNG](../public/assets/icons/xp-source.png) |
| road_waymarker | roadSign | 1254×1254 | 1 | [PNG](../public/assets/signs/road-waymarker-source.png) |
| npc_haventide | npc | 2172×724 | 7 | [PNG](../public/assets/npcs/haventide-source.png) |
| npc_emberline | npc | 1774×887 | 7 | [PNG](../public/assets/npcs/emberline-source.png) |
| npc_orbital_reach | npc | 1774×887 | 7 | [PNG](../public/assets/npcs/orbital_reach-source.png) |
| npc_last_crown | npc | 1774×887 | 7 | [PNG](../public/assets/npcs/last_crown-source.png) |
| npc_house_keepers | npc | 2172×724 | 8 | [PNG](../public/assets/npcs/house_keepers-source.png) |
| signal_beacon | structure | 1254×1254 | 1 | [PNG](../public/assets/structures/signal-beacon-source.png) |
| listening_dish | structure | 1254×1254 | 1 | [PNG](../public/assets/structures/listening-dish-source.png) |
| expedition_caravan | structure | 1254×1254 | 1 | [PNG](../public/assets/structures/expedition-caravan-source.png) |
| vex_walk | heroWalk | 1447×1087 | 12 | [PNG](../public/assets/vex/faceless-vex-hood-v2-walk-source.png) |
| rune_walk | heroWalk | 1447×1087 | 12 | [PNG](../public/assets/rune-walk-source.png) |
| rune | hero | 2172×724 | 12 | [PNG](../public/assets/rune-source.png) |
| vex | hero | 1447×1087 | 12 | [PNG](../public/assets/vex/faceless-vex-hood-v2-source.png) |
| bog_stalker | enemy | 1536×1024 | 6 | [PNG](../public/assets/bog-stalker-source.png) |
| drone_sentinel | enemy | 1536×1024 | 6 | [PNG](../public/assets/drone-sentinel-source.png) |
| gravbot | enemy | 1536×1024 | 6 | [PNG](../public/assets/gravbot/obsidian-gravbot-source.png) |
| mutant_hound | enemy | 1536×1024 | 6 | [PNG](../public/assets/mutant-hound-source.png) |
| neon_cultist | enemy | 1536×1024 | 6 | [PNG](../public/assets/neon-cultist-source.png) |
| sandworm | enemy | 1536×1024 | 6 | [PNG](../public/assets/sandworm-source.png) |
| slag_rat | enemy | 1536×1024 | 6 | [PNG](../public/assets/slag-rat-source.png) |
| ember_golem | enemy | 1536×1024 | 6 | [PNG](../public/assets/ember-golem-source.png) |
| ember_lord | enemy | 1536×1024 | 6 | [PNG](../public/assets/ember-lord-source.png) |
| frost_revenant | enemy | 1536×1024 | 6 | [PNG](../public/assets/frost-revenant-source.png) |
| glacier_wolf | enemy | 1536×1024 | 6 | [PNG](../public/assets/glacier-wolf-source.png) |
| mire_hulk | enemy | 1536×1024 | 6 | [PNG](../public/assets/mire-hulk-source.png) |
| wraith_core | enemy | 1536×1024 | 6 | [PNG](../public/assets/wraith-core-source.png) |
| architect_herald | enemy | 1536×1024 | 6 | [PNG](../public/assets/architect-herald-source.png) |
| frost_colossus | enemy | 1536×1024 | 6 | [PNG](../public/assets/frost-colossus-source.png) |
| magma_behemoth | enemy | 1536×1024 | 6 | [PNG](../public/assets/magma-behemoth-source.png) |
| mire_warden | enemy | 1536×1024 | 6 | [PNG](../public/assets/mire-warden-source.png) |
| void_architect | enemy | 1536×1024 | 6 | [PNG](../public/assets/void-architect-source.png) |

## Import and provenance

Active source PNGs are retained unchanged under public/assets. Retired designs, rejected generations and interactive UI prototypes are retained separately in [experiments](../experiments/README.md), outside the production build. Explicit crop rectangles and foot anchors account for generated nonintegral grids. Neutral exterior flood extraction and selected interior seeds remove baked neutral backgrounds while preserving pale hair, eyes and armor. True alpha is preserved. A handful of crop-local exclusions remove neighboring-frame fragments without modifying the original sheet. Required files and frame bounds are validated before readiness; missing required content gives a visible load failure.

[Source provenance](../public/assets/PROVENANCE.md), [hero notes](hero-assets.md), [ordinary enemy notes](enemy-assets.md), [middle enemy notes](mid-enemy-assets.md), [boss notes](boss-assets.md) and the adjacent exact-prompt JSON files record generation and extraction choices. Public source-side prompt/provenance records describe regional additions. No reference-game source or third-party art pack was copied into this project.

The four-phase gait and discrete combat poses are intentionally limited animation, with expressive motion supplied by their authored timeline. Generated sheets and code recipes were reviewed in actual production scenes; source contact sheets alone were never treated as final acceptance. Run **node scripts/asset-inventory.mjs** after changing the manifest to refresh this document and its hashes.
