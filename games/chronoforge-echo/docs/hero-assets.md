# Vex and Rune source inspection

The immutable source files are `public/assets/vex-source.png` and `public/assets/rune-source.png`, each 2172×724. Both are **RGB**, with no alpha channel; the light neutral checkerboard is actual pixel content. They require the same connected exterior neutral-background extraction used by the Kaida import. These notes describe source inspection and import metadata, not a claim that the completed party has already been inspected in game.

The generation prompt ledger is `docs/asset-prompts.json`. The delivered image files, rather than the requested dimensions in a prompt, define these measurements. No source image was repainted, resized, or replaced during this inspection. `src/hero-frames.js` exports `VEX_ART` and `RUNE_ART` for the renderer's import stage.

## Frame convention and scale

The nominal grid is six columns by two rows, 362×362 per cell, with the same twelve-pose order as Kaida: idle, two stride phases, anticipation, attack, casting/healing, hurt, guard, down, victory, front and back. The content does not always stay inside its nominal cell. Crops therefore use measured artwork extents, usually with two source pixels of transparent padding. Right and bottom bounds are exclusive.

`anchorX` and `anchorY` are **crop-relative source pixels**, located at a consistent ground point between the planted feet. Horizontal anchors follow the actor's stance, rather than the center of a long staff, shield or spell effect. The down pose uses the body’s grounded position and retains its low silhouette. Back/front frames are centered on the feet, not on an offset staff. The draw formula is `(worldX - anchorX * scale, worldY - anchorY * scale)` with crop width and height multiplied by the same scale.

- Vex uses `pixelScale = nativeSourceScale = 0.232`. The idle hat-to-sole artwork spans 336 source pixels, yielding 77.95 native pixels. Raised staffs and magic can extend beyond the hat height. The down artwork is about 50 native pixels high, as drawn; it must not be stretched to standing height.
- Rune uses `pixelScale = nativeSourceScale = 0.25`. The idle head-to-sole artwork spans 336 source pixels, yielding 84 native pixels. His shield, shoulders and stance deliberately read broader than the other two heroes. His crouched anticipation is about 65 pixels tall and down pose about 46 pixels tall, retaining the original proportions.
- Portrait rectangles use the front pose's face, headwear and upper body. They are separate from the full-body crop, avoiding the legacy magnified-full-sprite portrait approach.

Both exports provide `pixelScale` and `nativeSourceScale` as aliases for the two existing adapter conventions. They are the same value, not sequential transforms. The shared `poseIndex` maps named animation states to these rows; the movement adapter should alternate frames 1 and 2. Facing left can mirror the source, while up/down idle can use back/front.

## Cross-cell extents and exclusions

Vex’s attack runs from x1437 to x1946, including the forward staff and amber glyph; the nominal fifth cell ends at x1810. Restricting this attack to its cell would remove a large part of the staff and the entire impact glyph. The following cast pose begins near x1934, so full rectangular crops intersect two unrelated pieces of art:

1. The attack crop catches approximately 197 dark/colored cast-coat pixels around x1936–1946, y272–303. Its absolute-source exclusion `{x:1932, y:262, w:16, h:102}` removes that neighboring cloth while retaining the attack glyph above y234.
2. The cast crop catches the preceding attack glyph's far-right tail. Its exclusion `{x:1932, y:70, w:16, h:180}` removes that fragment. The cast's own staff head lies above that strip and its coat lies below it, so both remain intact.

These are **import-frame exclusions**, not source edits. For each affected frame, first draw its rectangle into a private canvas, then clear each exclusion at `(exclude.x - frame.x, exclude.y - frame.y)`. Canvas clipping can handle the few exclusion pixels outside the crop. The final canvas remains at the crop's original source size and keeps its original anchor. Do not clear these regions on the shared whole-sheet canvas, because they contain valid pixels for the neighboring pose.

Rune’s attack shield and sparks also exceed the nominal fifth cell, reaching x1891. The next cast silhouette begins at x1898, leaving a usable gap. Its expanded x1444–1893 crop retains the sparks without requiring an exclusion. His lowered shield in the down pose also remains fully within the measured expanded crop.

## Inspection method and practical limits

The source sheets were viewed at their delivered dimensions. A read-only pixel analysis simulated the production import threshold (`minimum channel >= 175` and channel spread `< 16`), flooded the connected exterior, and located foreground components. Before clearing, roughly 70.50% of Vex and 63.85% of Rune pixels classify as connected exterior. Foreground-component bounds supplied the crop extents; lower-foot pixel runs and visual stance inspection supplied the anchors. The small exclusions were cross-checked against the neighboring actor's connected component, rather than guessed from the nominal grid.

The source’s checkerboard and outlines can enclose pale interior islands. Background extraction is therefore an import operation that still requires actual rendered review: confirm that Vex’s staff loops and amber spell rings do not retain conspicuous checker patches, that his silver hair remains intact, and that Rune’s bright ivory plates preserve their outer edge. Fixed crop/scale metadata cannot establish those final visual results by itself.

The initial two-stride-frame limitation is **superseded** by the separate four-phase directional walk sheets described below. The twelve-pose combat sheets retain their two side-stride illustrations for their own action adapter; outdoor walking now uses authored side, south and north cycles.

## Installed directional walking and measured interior seeds

`public/assets/vex-walk-source.png` and `public/assets/rune-walk-source.png` are the selected immutable generations, each **1447×1087 RGB**. Exact generation prompts, canonical character reference paths and original generated-file paths are retained in [companion-walk-prompts.json](companion-walk-prompts.json). Each sheet has four columns and three rows: side walking right (mirrored for left), walking toward the camera, and walking away. The four gait phases change actual limbs and cloth. The delivered one-pixel dimension difference from the prompt is handled by explicit measured crops in [hero-walk-frames.js](../src/hero-walk-frames.js), not implicit equal-cell resizing. Vex retains scale .232 and Rune .25 across every phase.

Connected exterior neutral extraction is supplemented by measured enclosed-background seeds, using the same minimum channel 175 / channel spread below 16 flood criterion. Only confirmed checker holes are seeded; Vex's silver hair and Rune's ivory armor remain untouched.

- Vex front staff/face: `(135,475)`, `(490,484)`, `(865,487)`, `(1260,477)`; lower staff/arm: `(135,554)`, `(503,550)`, `(860,562)`, `(1256,550)`; back staff/shoulder: `(598,836)`, `(946,829)`, `(1334,809)`; back staff/coat: `(228,901)`, `(593,905)`, `(962,903)`, `(1338,893)`.
- Rune front inner-arm: `(121,518)`, `(487,507)`, `(844,516)`, `(1210,510)`.
- The original combat sheet also now seeds Vex front `(1565,471)`, victory `(1232,459)`, guard `(520,545)` and back `(2067,555)`, plus Rune front `(1569,518)`. The first two portrait gaps were confirmed in the actual Party screen before correction, then rechecked in [clean live portraits](../evidence/critic-party-portraits-keyed.png).

Independent sustained live review used real arrow keys for 1.2 seconds in each direction. Logged follower facings confirm that every character finished each turn; both companions visibly use front/back poses during vertical movement, resolving the earlier side-facing stride problem. Body identity, relative scale, seed extraction and foreground tree occlusion read correctly. These are actual production world captures, not source-atlas composites: [southbound](../evidence/critic-walk-trio-straight-down.png), [northbound](../evidence/critic-walk-trio-straight-up.png), [direction/position log](../evidence/critic-walk-trio-straight.json). The run had zero browser errors. The first short corner captures are retained separately and should not be mistaken for completed turns by the more distant follower.

## Alpha audit correction after user feedback

The earlier broad scene inspection missed enclosed background islands and tinted checker pixels in action effects. The complete repair and source-conservation evidence are documented in [alpha-extraction-audit.md](alpha-extraction-audit.md). `src/alpha-masks.js` now supplies authoritative measured component seeds and bounded effect thresholds to the loader for both heroes and civilians. Vex's directional sheet also gained two missed coat/leg gap seeds, `[852,267]` and `[551,292]`. Fixed source crops, foot anchors, face identity, and all original PNGs remain unchanged. Final dark-field diagnostics and actual gameplay include every Kaida pose, crew walking, full-party casting, the party panel and six vendor portraits.
