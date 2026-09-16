# Midgame enemy artwork

Six original source atlases were generated with the built-in image tool, copied into `public/assets/`, and retained unchanged. Exact prompts and generation paths are in `mid-enemy-prompts.json`. All six are actual 1536×1024 RGBA sources, not baked checkerboard exports. The viewer's dark presentation background is not part of the opaque artwork; transparency was checked in production.

| Enemy | Design and silhouette | Fixed native scale |
| --- | --- | --- |
| Mire Hulk | Root-footed wetland beast carrying a broken bell tower and shell plates | .235 |
| Glacier Wolf | Ivory swept mane, backward blue ice antlers, charcoal legs | .22 |
| Ember Golem | Broad six-legged basalt kiln, mismatched pincers and glowing furnace | .255 |
| Frost Revenant | Empty mask, suspended paper-like ice ribbons and a long glass spear | .22 |
| Wraith Core | Four dark angular fins around a pale memory heart | .22 |
| Ember Lord | Volcanic mantis, ceramic antler crown, refinery chimneys and scythes | .30 |

Each atlas has idle, anticipation, contact, hurt, defeat and guard/charge poses. `src/mid-enemy-frames.js` stores measured source crops, separate support/hover anchors, and exclusions for the few neighboring pose fragments crossing their nominal cells. Source body size remains constant through crouching and defeat rather than stretching every pose into a fixed rectangle.

The first actual import revealed corner fragments on the Golem, Revenant and Ember Lord. The earlier contact sheet is retained as `evidence/mid-enemy-pose-before-crop-correction.png`; the revised pose import is `evidence/mid-enemy-pose-inspection.png`. `tests/mid-art.mjs` also samples normal production enemy actions. These import images verify cropping, not complete scene quality.

An independent critic subsequently inspected all six in real battles, alongside the five late bosses. See `evidence/boss-art-critic.json` and `docs/SHOWCASE_CRITIQUE.md` for the action evidence and specific contact-staging fixes. The regional backdrop and final animation reviews are separate acceptance steps.
