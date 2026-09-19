# Asset provenance and production inventory

## Regional town center exterior pass

`town-centers/emberline-town-center-tiers-v1-source.png`, `town-centers/orbital-reach-town-center-tiers-v1-source.png` and `town-centers/last-crown-town-center-tiers-v1-source.png` are unchanged built-in imagegen outputs. Each is a separate cohesive 2×2 upgrade family generated against the approved Haventide sheet and its inspected regional props reference. All three returned 1254 × 1254 RGB with baked checkerboards. Runtime connected extraction and measured seeds supply alpha; Last Crown also has a lower neutral threshold and crop-local neighboring-frame exclusions. See [integration and temporary preview controls](../../docs/regional-town-centers.md).

## Haventide town center exterior pass

`town-centers/haventide-town-center-tiers-v1-source.png` is the unchanged built-in imagegen output `exec-95dda299-98e0-4cb6-8448-a250360c2e9e.png`. It contains four increasingly large town-center exteriors, ending in a futuristic civic spire. The source is 1254 × 1254 RGB; runtime neutral-background extraction, enclosed-air seeds and a scoped glow threshold remove its baked checkerboard. See [metadata and controls](../../docs/haventide-town-center.md). It replaces Haventide's use of the original civic production row; that atlas remains necessary for the other civic structures.

Retired Vex and Gravbot sources have moved to [the experiments archive](../../experiments/2026-09-ui-and-art/README.md). This historical record retains original filenames; [the archive manifest](../../experiments/2026-09-ui-and-art/archive-manifest.json) maps them to preserved files and hashes. The current loaded sources are listed in [the production inventory](../../docs/ASSET_INVENTORY.md).

All shipped visual assets are original project artwork generated for Chronforge Echo with OpenAI image generation, or original pixel drawing code in `src/art.js`. No third-party asset pack is included. Kaida’s appearance is guided by the user-provided reference at `../chronoforge-remake/sprite-gen/kaida-reference.png`; the reference project is unchanged. Source PNGs remain immutable. Atlas cropping, transparency interpretation, palette composition and native-resolution placement happen in the renderer. The original synthesized score and sound effects are in `src/audio.js`.

## First showcase sources

| File | Source generation | Production treatment |
| --- | --- | --- |
| `kaida-showcase-source.png` | `exec-3f4a55f9-6320-4c61-9a91-8a0a0598df7f.png` | 12 poses: idle, two gait poses, anticipation, sword contact, cast, hurt, guard, down, victory, front, back. Neutral exterior keyed on import; individual measured bounds and foot anchors. |
| `coast-props-source.png` | `exec-50fccd9f-d293-4ac6-8ba7-d59350353e21.png` | Tree, cypress, broken ring, arch, rocks, cottage, fern, sea cliff. Manual crop rectangles avoid neighboring cells. |
| `coast-ground-source.png` | `exec-7481cc21-828b-468c-b706-1f0e5d6988a2.png` | Six material tiles: coast grass, light moss, limestone path, shaded grass, shallow sea, deep sea. Native 128px repeats, blended grass patches and fine shore edges. |
| `rust-scrapper-source.png` | `exec-77f9d6e3-b06c-47ba-8a51-d795f1c51c80.png` | Six articulated poses of a bronze salvage crab with magnet claw and teal sensor. Measured bounds and foot anchors. True alpha confirmed in-engine. |

Original generation directory: `/Users/g/.codex/generated_images/01a0a929-8b56-7232-96c6-2836dc495256/`. These filenames are provenance identifiers, not runtime dependencies; copied assets are self-contained here.

A background-cleanup variant `exec-8b3e0c5a-98f5-4a37-b5a6-312bf8a8d986.png` was generated but is **not shipped**: the original Rust atlas proved transparent in the actual renderer. Avoid replacing a working asset based only on a viewer’s background compositing.

## Production inventory and current gate

The initial showcase established a 960×540 logical view and approximately 48–62×72–84 hero scale. Following hands-on review, the game now renders a 1920×1080 backing surface with filtered scaling, preserving finer source detail at the same world and character sizes. Kaida, Vex and Rune have matching combat sheets, portraits and directional walks. Two civic atlases cover all eight building types at all four upgrade levels. All eight regional environments and nineteen enemy identities are implemented; `docs/STATUS.json` records verification and remaining limits. This source inventory alone is not a quality certificate.

UI icons, instrument insignia, effects, reward badges, map swatches and typography are original code-native artwork. No emoji is used as an item or command icon. Required atlas failures stop boot visibly; optional audio failure leaves play available.

## First-chapter additions

- `haventide-interior-source.png`: generation `exec-5947a3a8-ceb4-447a-bbe6-c6cda601dbbc.png`, eight market/interior furnishings. RGB neutral exterior is keyed on import.
- `haventide-civilians-source.png`: generation `exec-f463122a-821b-49ec-8b2a-7e889a53603c.png`, six adults with front/back views and matching cropped portraits. RGB neutral exterior is keyed on import.
- `kaida-walk-source.png`: generation `exec-8ba4e78b-521b-4855-a201-b3ab7e60e0be.png`, four gait phases in side/front/back directions. RGB key, explicit cross-cell bounds and foot anchors, fixed .23 source scale. Earlier battle poses are preserved.
- `drone-sentinel-source.png`: see `docs/drone-asset.md` for exact source identity, SHA-256, six-pose crop metadata and prompt.
- `civic-production-source.png`: generation `exec-f208396b-ed14-4b23-b4cc-38bcdc76a3d0.png`; four tiers each of Town Center, Farm, Mine and Energy Extractor.
- `civic-culture-source.png`: generation `exec-df0da6fd-070b-477e-b987-45b88d2de9bc.png`; four tiers each of Barracks, Forge, Research Lab and Walls.
- `vex-source.png`: generation `exec-c0971df0-84f6-443f-96e0-4e6c3822ac86.png`; twelve canonical character poses. See `docs/hero-assets.md` and `src/hero-frames.js` for measured crops and selective neutral-background extraction.
- `rune-source.png`: generation `exec-be76d07f-4b51-4ee2-bfec-c640faa26ecb.png`; twelve canonical poses, matching portrait, fixed source scale and foot anchors.
- `bog-stalker-source.png`: generation `exec-857cfa93-f800-4ec0-80d0-2735502cbf46.png`; six poses of the reed-legged wetland ambusher.
- `slag-rat-source.png`: generation `exec-43503c45-bdac-4ad9-8659-99e1a2827c23.png`; six poses of the ceramic-armored charcoal scavenger. Its darker neutral background requires a measured per-source threshold.
- `emberline-props-source.png`: generation `exec-505f4604-5569-40e5-8bc1-2d4d47991ccf.png`; cactus, signal mast, observatory ruin, sandstone arch, boulders, adobe caravan house, agave and conduit cliff.
- `emberline-ground-source.png`: generation `exec-492b5601-5701-4e40-97bb-3e48fedc84d1.png`; six desert and oasis materials.
- `interior-ground-source.png`: generation `exec-279d4541-2c3e-4373-a53b-9fe808e59a61.png`; limestone, wooden boards, slate, cave earth, woven teal and civic mosaic materials.

Exact first-chapter generation prompts are recorded in `docs/asset-prompts.json`; enemy-specific prompts are in their asset notes. Raw sheets do not establish scene quality: the runtime crops and gameplay captures are part of acceptance.

## Complete campaign additions

The complete runtime manifest now contains 49 required PNG sources: six hero pose/walk sheets, nineteen enemy identities, sixteen regional prop/ground atlases, two civic tier atlases, three market/domestic/resident atlases, two interior material atlases and one world interaction atlas. The generated inventory and SHA-256 hashes are in `docs/ASSET_INVENTORY.md` and `docs/asset-inventory.json`; actual acceptance remains tied to scene and sequence review.

- `vex-walk-source.png`: generation `exec-52345c47-d5d6-416b-89ae-c4727f5dbba4.png`; four gait phases in side/front/back directions. Exact canonical-reference prompt and source result are recorded in `docs/companion-walk-prompts.json`.
- `rune-walk-source.png`: generation `exec-26c17d83-7446-46e2-9f67-aef23ea3b3f6.png`; matching four-phase directional coverage. The same prompt record and `docs/hero-assets.md` document measured crops and background seeds.
- `interior-wall-source.png`: generation `exec-773b2088-e1f7-462b-b655-aa37ad17bff5.png`; six original materials for limestone, volcanic stone, glacial walls, timber, roots and transformed ivory architecture. Exact prompt in `docs/interior-wall-prompt.json`; runtime walls follow the actual room footprint.
- `domestic-furniture-source.png`: generation `exec-3d5e1ea3-847c-4a38-9dfe-8175bc03947c.png`; eight true-alpha home furnishings, including bed, stove, table, writing desk, bookcase, copper lantern, chair and pantry. Exact prompt, source path and dimensions are in `public/assets/region-prompts/domestic.json`. Homes and settlement courts use the actual objects at gameplay scale.
- Mutant Hound, Gravbot, Neon Cultist and Sandworm: individual original sheets and source identifiers/prompts in `docs/enemy-assets.md`.
- Mire Hulk, Glacier Wolf, Ember Golem, Frost Revenant, Wraith Core and Ember Lord: six distinct true-alpha sources with exact prompts/results in `docs/mid-enemy-prompts.json`; extraction decisions in `docs/mid-enemy-assets.md`.
- Mire Warden, Magma Behemoth, Architect Herald, Frost Colossus and Void Architect: five separate original six-pose sources; exact prompts and results in `docs/boss-prompts.json`, `docs/boss-generation-results.json` and `docs/boss-assets.md`.
- Forest Veil, Mire Bog, Crater Ember, Orbital Reach, Frost Canyon and Last Crown: six distinct pairs of prop and ground atlases. Exact prompts live under `public/assets/region-prompts/`; `REGIONAL_PROVENANCE.json` records each generated source and destination.

Originals are generated project assets, with no third-party pack or remote image loaded at runtime. The official Sea of Stars screenshots mentioned in `ART_DIRECTION.md` were viewed solely for craft calibration and are not included in the shipped game.

## Hands-on review additions

- `world-props-source.png`: original generated RGBA atlas containing chest, salvage crate, provisions bag, signal console, three rest-lantern phases and unfinished foundation. The exact prompt and generation source are in `world-props-prompt.json`; measured extraction and actual scene/animation evidence are in `../../docs/world-prop-assets.md`.
- `src/alpha-masks.js` describes measured background pockets and bounded exterior key regions for existing hero and civilian sheets. It changes runtime transparency without modifying immutable source PNGs or globally removing pale armor, eyes or weapon highlights.
