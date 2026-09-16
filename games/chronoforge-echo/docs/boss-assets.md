# Five late guardians: source, import and live verification

Generated on 2026-09-16 with the built-in `image_gen` tool, one call per distinct creature. These are original images for Chronoforge Echo, generated from the existing enemy descriptions and the project's material/palette direction; no third-party character reference was supplied. The exact full prompts are in [boss-prompts.json](boss-prompts.json). Tool output paths and matching prompts are retained in [boss-generation-results.json](boss-generation-results.json). Selected sources are copied into `public/assets/`; the original generated files remain untouched.

All five selected files are **1536×1024 RGBA**, with real zero-alpha background pixels and preserved generated alpha. The tool preview exposes colored RGB values behind the alpha, but those are invisible in the actual canvas importer. No neutral key is applied. Dimensions, alpha counts and SHA-256 values are recorded in [boss-source-inspection.json](../evidence/boss-source-inspection.json).

| Source | Identity | Fixed source scale | Idle crop height in native pixels |
| --- | --- | ---: | ---: |
| `mire-warden-source.png` | Bronze/root archive heron, lamplit ribs, canopy wings | .27 | 133 |
| `magma-behemoth-source.png` | Low basalt salamander, molten glass chimney spine | .34 | 112 |
| `architect-herald-source.png` | Faceless ivory sextant envoy, narrow suspended cloak | .305 | 145 |
| `frost-colossus-source.png` | Bridge-shouldered elevator guardian, glacier slabs | .33 | 156 |
| `void-architect-source.png` | Small luminous human inside a vast broken armillary | .38 | 177 |

These are native source-derived sizes before the production battle renderer's per-enemy staging multipliers. Hero and enemy multipliers are intentionally different; this table does not claim every boss is multiplied by 1.25. The final Architect is distinct from the narrower Herald in silhouette, proportion and motion, not a recolor.

## Import contract

[src/boss-frames.js](../src/boss-frames.js) exports five individual descriptors. Each has six source-space crops in order: idle, anticipate, attack, hurt, down, guard/cast. Frame support points are crop-relative source pixels. For the two floating instruments they project below the hanging ornaments; grounded guardians align their toes/slabs. The same source scale is used for every pose; down poses retain their naturally reduced height.

Alpha-component measurement at threshold 64 established the principal bounds, then visual inspection assigned floating fragments, effect extents and support points. Some attacks cross the requested nominal grid boundary. Mire's pulse is preserved left of its cell and the previous pose's lower tail is excluded. Small Magma pulse/tail intersections and the final Architect's adjacent lower-row fragments have explicit absolute `exclude` rectangles. These clear only private imported frame canvases; source PNGs are unchanged. Crops pass numeric image-bound checks.

## Actual production review

[tests/boss-art-critic.mjs](../tests/boss-art-critic.mjs) captures production battles at 1920×1080 with deterministic party/skill fixtures, real `createBattle`, legal `battleKey` choices and the real `Game.update`. It does not assign health, resources, damage or poses. The fixture is for art and action verification, not ordinary progression. All five bosses reached actual victory; all six additional mid/late enemies performed their first two natural actions. The run recorded zero browser, application or asset errors. [States and evidence index](../evidence/boss-art-critic.json).

Idle, anticipation, attack, casting and hurt artwork has clean alpha, stable support and no visible adjacent-pose fragments in inspected frames. Down **states** were reached, but the production victory fade hides the defeated silhouette very quickly; a state labelled down is not proof of a long visible collapse animation. Raw down crops have been measured, not falsely presented as manually observed sustained battle motion.

The live visual limitation is choreography rather than extraction: giant charged party-wide blows move the entire attacker into Kaida's lane. The Warden's long beak overshoots Vex and its body covers other heroes, the Colossus fist goes above Kaida's head, and the final Architect crowds Kaida during Unwritten Sky. The combat owner has the exact contact captures and a recommendation for anchored party-wide casting and contact stops based on the attack extent. Other biome backdrops were still being produced during this run, so their primitive backgrounds in these captures are not approved final regional art.

Representative actual captures: [Mire idle](../evidence/critic-boss-mire_warden-idle.png), [Mire windup](../evidence/critic-boss-mire_warden-enemy0-windup.png), [Magma idle](../evidence/critic-boss-magma_behemoth-idle.png), [Herald idle](../evidence/critic-boss-architect_herald-idle.png), [Colossus contact issue](../evidence/critic-boss-frost_colossus-enemy1-contact.png), [final Architect idle](../evidence/critic-boss-void_architect-idle.png), [final phase-three hurt](../evidence/critic-boss-void_architect-hurt-phase3.png).
