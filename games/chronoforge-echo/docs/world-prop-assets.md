# World interaction prop polish

The immutable image-generation source is `public/assets/world-props-source.png` (1774 × 887, genuine RGBA). Its exact prompt and original generated file path are recorded in `public/assets/world-props-prompt.json`. No color key is applied. `src/world-prop-frames.js` records measured source rectangles, source-pixel foot anchors, and the manifest descriptors consumed by `src/assets.js`.

The atlas contains a timber chest, salvage crate, provisions bag, signal console, three rest-lantern frames, and an unfinished foundation. The foundation replaces the rope-and-post placeholder only while a civic structure has level zero; completed structures still use their existing four upgrade tiers. World positions, collision footprints, hero sizes, and enemy sizes are unchanged.

Loot chooses a container and a restrained outline color from its item category. Its silhouette has a slow continuous pulse; there is no detached blinking dot. Reduced motion holds the outline intensity constant. The rest lantern cycles three frames at three phase changes per second (`0,1,2,1`) with a common 376 × 411 source crop, source foot anchor (188,403), and logical height 88. Reduced motion holds frame zero. All original bitmap sources are retained unchanged; the two narrowly bounded overlap exclusions are applied to private runtime crop canvases.

Gulls have an 18-pixel wingspan and deterministic region-coordinate flight paths. Camera movement subtracts from their positions exactly like other world objects, rather than moving a screen-relative flock with the player.

## Rendering integration

Terrain, road variants, indoor floors, and indoor walls now use 256 × 256 backing tiles for logical 128 × 128 tiles. Ground chunks use 768 × 768 backing surfaces for logical 384 × 384 chunks. All material patterns retain their logical repeat scale. A two-source-pixel inset prevents adjacent atlas cells from bleeding into filtered tile edges. Sprite crop/mask canvases remain at original source resolution. The ground cache has a 40-chunk bound, still 90 MiB; reported byte counts use backing dimensions. The new source and private crop/outline canvases are included in art metrics.

## Targeted verification

`tests/review-world-props.mjs` exercises actual production rendering in five scenes and collects the cottage supplies through the production interaction. It records ten views plus `evidence/world-props-lantern-motion.webm`. `evidence/world-props-review.json` records zero runtime errors, successful collection, all new assets installed, and the world-coordinate bird displacement check. This is a targeted fixture review, not a campaign replay.

Inspected images:

- `evidence/polish-signal-console.png`
- `evidence/polish-unfinished-foundation.png`
- `evidence/polish-supply-bag.png`
- `evidence/polish-salvage-crate.png`
- `evidence/polish-treasure-chest.png`
- `evidence/polish-rest-lantern-0.png` through `-2.png`
- `evidence/polish-rest-lantern-reduced-motion.png`

The three lantern crops have distinct pixel hashes; the reduced-motion crop is byte-identical to frame zero. Those results are saved in `evidence/world-props-animation-check.json`. Source alignment and the actual screenshots were inspected for foreign fragments, grounding, and visible hardware drift.
