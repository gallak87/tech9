# Enemy and item sprite identity audit

Sources inspected: only `games/chronoforge/src/` and the authorized remake modules. Original pixels were inspected to identify subjects but were never supplied to imagegen or reused in generated assets. Settlement art was excluded.

## Counts and omissions resolved

- Original enemy assets: 18 regular identities × 5 PNGs (overworld, idle, attack, hurt, death), plus 3 Void Architect phase PNGs = 93 PNGs across 19 identities. The original battle catalog did not reference the Architect phase assets.
- Remake before this pass: 13 procedural enemy identities. Six original enemy types were absent.
- Result: all 19 identities have their own generated 6-column × 4-row transparent atlas, 24 frames each, 456 generated enemy frames total. All six omitted types have optional authored encounters.
- Original equipment catalog: 17 definitions, of which 8 had unique item PNGs; the rest used generic slot icons. Two additional named item PNGs had no item definitions or runtime references.
- Remake before this pass: 16 retained equipment definitions plus 3 new supplies. Swamp Coil and the two orphan PNG identities were absent.
- Result: 22 current item identities. Swamp Coil, Slag Tooth, and Mire Charm are now obtainable through shops and deterministic first-clear loot, with equipment and save support.

## Enemy mapping and observed appearance

| Original asset prefix | Current ID / atlas basename | Coverage | Textual appearance cue |
| --- | --- | --- | --- |
| rust_scrapper | scrapper | Retained identity, original appearance restored | A stocky bald bearded human male scavenger, weathered tan skin, brown leather and rust-red patchwork metal armor, heavy boots, short salvaged steel dagger in his forward hand. Human, not a robot. |
| drone_sentinel | drone | Retained identity, original appearance restored | A silver and gunmetal hovering mechanical sentry: horizontal oval body, two bright red circular optical lenses, short cylindrical side pods, and a compact cannon suspended underneath. Its walk row is a hovering patrol cycle. |
| bog_stalker | stalker | Retained identity, original appearance restored | A hunched green-skinned bog humanoid scout in a moss-fringed hood, ragged olive leaf armor and wraps, carrying a narrow steel dagger. Long green moss hair, alert sly face, angular wiry proportions. |
| slag_rat | rat | Retained identity, original appearance restored | A small fierce charcoal-gray rat with large pointed ears, ember-orange eyes, glowing orange molten fissures across its back, and a long curved tail with an orange flame at the tip. Four legs and a clear rat silhouette. |
| mutant_hound | hound | Retained identity, original appearance restored | A muscular mutated canine, deep burgundy exposed sinewy skin, dark red paws, pale bone-plated skull and dorsal spines, sharp ivory teeth, long dark curved tail. A threatening four-legged creature with powerful shoulders. |
| gravbot | gravbot | Restored omitted enemy | A white-and-silver bipedal combat mech with broad angular shoulder armor, blue-gray articulated limbs, compact helmet with a small cyan lens, black mechanical joints, one fist and a large luminous cyan circular energy shield projected from its other forearm. |
| mire_hulk | mire_hulk | Restored omitted enemy | A huge green swamp ogre, broad muscular chest, heavy hunched shoulders, long massive arms and blunt hands, moss growing over its head and shoulders, primitive tattered olive cloth around the waist, barefoot. Slow crushing brute. |
| glacier_wolf | wolf | Retained identity, original appearance restored | A graceful white and pale-blue wolf with pointed ears, glowing icy cyan eyes, a thick frost mane, sharp blue crystal spines along the back and shoulders, white bushy tail, four agile legs. |
| neon_cultist | neon_cultist | Restored omitted enemy | A mysterious humanoid cultist wearing a vivid hot-magenta hood and long split robe, almost-black concealed face, glowing pink arcane runes along the hem and sash. Both raised hands gather branching magenta lightning. |
| sandworm_hatchling | sandworm_hatchling | Restored omitted enemy | An ochre and golden-tan segmented sandworm larva rearing upright in an S-curve, round blunt head, two tiny dark eyes, wide circular mouth with triangular ivory teeth, thick plated belly segments and curved tapered lower tail. Legless creature. |
| ember_golem | golem | Retained identity, original appearance restored | A squat powerful humanoid golem assembled from large angular charcoal basalt boulders, orange molten cracks between every stone, small fiery eyes, enormous rock fists, broad black rock shoulders, short heavy legs. |
| frost_revenant | frost_revenant | Restored omitted enemy | An undead knight completely enclosed in jagged white and ice-blue armor, a skull-like frost helmet with glowing cyan eyes, serrated icy shoulder plates and a tattered pale-blue cape, wielding a long crystalline ice sword. |
| wraith_core | wraith | Retained identity, original appearance restored | A slender floating translucent purple spectral humanoid with a smooth faceless head, a brilliant magenta circular core in its chest, elongated claw-like fingers, wispy tendrils and a fading smoky lower body. No robe or crown. |
| mire_warden | warden | Retained identity, original appearance restored | A solemn green hooded swamp sorcerer in layered deep-olive robes with bright turquoise runes embroidered around the hem, face hidden in hood shadow, one hand holding a twisted wooden forked staff that sprouts curling pale-green magical roots. Tall robed wizard, not a muscular brute. |
| magma_behemoth | magma_behemoth | Restored omitted enemy | An enormous four-legged volcanic beast shaped like a hulking armored boar and bear, black basalt hide split by bright orange lava seams, lowered horned rock head, great clawed paws, thick armored back with a blazing orange flame mane and small burning tail. |
| architect_herald | herald | Retained identity, original appearance restored | A tall slender knight in sleek dark-purple and black angular plate armor, silver highlights, narrow masked helmet, a glowing cyan circular halo behind the head, carrying a long branching cyan lightning sword. Elegant ominous posture. |
| frost_colossus | colossus | Retained identity, original appearance restored | A massive humanoid titan made from opaque white and pale-blue glacial crystal armor, broad chest, huge angular shoulders with long upward ice spikes, pointed faceless ice helmet with cyan eye slits, enormous icy fists and heavy crystalline boots. |
| ember_lord | emberlord | Retained identity, original appearance restored | A regal armored fire knight: black volcanic plate traced with glowing orange lava, a jagged gold-and-flame crown, bright amber eyes beneath a masked helmet, large black-and-orange shoulders, a long flaming golden sword and a ragged fire-red cloak. |
| void_architect | architect | Three original asset-only forms now used | A reality-shaping cosmic sorcerer with three distinct forms. Phase 1: faceless black-purple hood and flowing starfield cloak, wide sleeves, one brilliant magenta chest orb. Phase 2: deep-violet robes, multicolored cyan/magenta clockwork glyphs running down the chest, magenta lightning in both hands. Phase 3: exposed slender humanoid body woven entirely from brilliant magenta and cyan energy filaments, dark core, crackling silhouette, no robe. |

## Item mapping

| Stable item ID | Original name | Current name | Original visual or textual evidence |
| --- | --- | --- | --- |
| iron_blade | Iron Blade | Ferry Blade | No unique original PNG; crude salvaged steel sword. |
| void_shard | Void Shard | Glass Focus | No unique original PNG; cyan crystallized null energy. |
| rune_gauntlet | Rune Gauntlet | Rescue Gauntlet | No unique original PNG; gold resonant alloy gauntlet. |
| scrap_vest | Scrap Vest | Patchwork Coat | No unique original PNG; layered gray scrap armor. |
| bio_weave | Bio-Weave | Fenweave Mantle | No unique original PNG; green living alien fiber. |
| data_chip | Data Chip | Quickstep Dial | No unique original PNG; orange reflex chip became a copper pocket clock. |
| crit_lens | Crit Lens | Copper Sight | No unique original PNG; magenta targeting optic. |
| bog_fang | Bog Fang | Reedsteel Saber | icon_bog_fang.png: curved jagged green dagger with a brown handle. |
| swamp_coil | Swamp Coil | Swamp Coil | RESTORED. icon_swamp_coil.png: intertwined green reeds and copper bracelet. |
| glacial_claw | Glacial Claw | Glacier Gauntlet | icon_glacial_claw.png: pale cyan crystalline claw/gauntlet with three points. |
| moss_ward | Moss Ward | Moss Ward | icon_moss_ward.png: round green and cyan moss amulet with bronze ring. |
| ember_core | Ember Core | Cinder Focus | icon_ember_core.png: dark staff with an orange flaming orb. |
| frost_plate | Frost Plate | Winterguard Plate | icon_frost_plate.png: pale blue spiked breastplate. |
| void_scepter | Void Scepter | Unbound Focus | icon_void_scepter.png: dark hooked staff with a purple orb. |
| magma_blade | Magma Blade | Daybreak Saber | icon_magma_blade.png: long steel sword with red-orange molten core. |
| titan_shard | Titan Shard | Dawnsteel Harness | No unique original PNG; gold Architect-era alloy armor. |
| ember_crown | Ember Crown | Shared Hour | No unique original PNG; original smoldering circlet became a three-hand clock charm. |
| slag_tooth | Asset only; no original item definition | Slag Tooth | RESTORED. icon_slag_tooth.png: orange-gray fang pendant on brown cord. |
| mire_charm | Asset only; no original item definition | Mire Charm | RESTORED. icon_mire_charm.png: forked gray-blue tooth pendant on dark chain. |
| potion | New to remake | Field Tonic | Pink restorative bottle. |
| ether | New to remake | Ether Flask | Cyan mana bottle. |
| phoenix | New to remake | Wakeflower | Golden restorative flower; original remake placeholder depicted a bottle. |

## Runtime integration

- `data.js`: 19 ENEMIES and 22 ITEMS. New accessory loot: rat → Slag Tooth, stalker → Mire Charm, drone → Swamp Coil. Existing shop tier filtering exposes the new items at tiers 1/2.
- `world.js`: six optional encounter definitions expose the restored enemies without changing story gates or settlement.
- `art.js` (root-owned): loads each atlas and selects six-column frames. Normal rows: idle 0, walk 1, attack/cast 2, hurt/death 3. Architect rows 0/1/2 are phases 1/2/3; row 3 is hurt/death.
- `battle.js`: passes Architect phase as drawEnemy argument 8 from live HP thresholds (>66%, >33%, otherwise phase 3). Existing single-impact action timing drives anticipation frames 0–2, impact frame 3, and recovery frames 4–5.
- Lethal damage starts deathAge at zero. The first 0.32 seconds render the dedicated collapse frames; the final defeated frame then holds. Nonfatal hurt uses only the first three hurt-row frames. This avoids looping a defeated character through live poses.
- `prompts.json`: exact built-in imagegen prompts and identity mapping. `alpha-report.json`: read-only alpha/grid verification. No generated pixels were manually edited, keyed, resampled, or composited.

## Validation

All 19 PNGs are RGBA, 1536×1024, with 24 occupied cells and transparent background pixels. Every native output was visually inspected. `tests/systems.mjs` passes 16 grouped checks, 5 fixed campaign milestones, and 6 restored-enemy battle scenarios using production combat actions. It also verifies the new items through shop/equip/save/loot and checks defeat animation age.

