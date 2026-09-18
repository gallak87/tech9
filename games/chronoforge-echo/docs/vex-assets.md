# Faceless Vex redesign

Archive note (September 17): superseded Vex/Gravbot sources and rejected attempts now live under [experiments/2026-09-ui-and-art](../experiments/2026-09-ui-and-art/README.md). Historical source paths below can be resolved through its [archive manifest](../experiments/2026-09-ui-and-art/archive-manifest.json). Current selected assets remain in `public/assets/`.

## Current hood-proportion correction (September 17)

The active sources are now `public/assets/vex/faceless-vex-hood-v2-source.png` and `public/assets/vex/faceless-vex-hood-v2-walk-source.png`, both 1447×1087 RGBA. The prior assets and provenance below describe the superseded narrow-hood version.

Built-in `image_gen.imagegen` edit mode broadened the hood around an adult-sized cranium and deepened the black opening in all combat and directional frames. Exact prompts and intermediate rejections are in [vex-hood-v2-prompts.json](vex-hood-v2-prompts.json). Several edits baked in checkerboards; only the two verified true-alpha results are loaded. The source PNGs are preserved without pixel rewriting.

Measured crops and foot anchors are in the hero descriptors. Fixed source-scale corrections for the independently authored front/back drawings and gait rows keep Vex at about 80 native pixels; cloak width does not drive scaling. `drawHero` and `actorBounds` both honor those authored frame scales and facing.

`tests/vex-hood-review.mjs` verifies the actual Emberline NPC beside Kaida and dialogue portrait, plus production-rendered gait and combat crops. The 15 idle/gait measurements are 78–81 pixels high, with standing 81 in all three source directions. No asset/page/console errors. The isolated browser closes afterwards; the user session/save is untouched. Acceptance captures and source-alpha measurements are in `evidence/vex-hood-v2/`.

## Original faceless redesign (superseded sources)

Vex is now the user-requested mysterious adult in a deep purple hood and layered robes, with an empty black face cavity and a cyan staff/orb. The two preferred faceless references informed the silhouette and restrained magic. No visible boy face, hair or skin remains in the active hero, NPC, follower, portrait or directional gait sources. Vex's ID, stats, skills and story are unchanged.

The built-in `image_gen.imagegen` created the following immutable selected sources:

| Source | Dimensions | Compressed bytes | SHA-256 |
|---|---|---:|---|
| `public/assets/vex/faceless-vex-source.png` | 1448×1086 RGBA | 1,407,966 | `81c492428efa3aef692045d69733db3461b5fa751079c8eb415154ec0713ffae` |
| `public/assets/vex/faceless-vex-walk-source.png` | 1447×1087 RGBA | 1,637,253 | `a5039947ea1f9ac097a5a8030ae2ba39cb8cda3dc21f8e24f64a6d9fffb1e36f` |

All three exact prompts, reference names, original built-in output paths and selected/rejected status are recorded in `docs/vex-art-prompts.json`. The first directional-walk attempt had an RGB checker background and is retained, unselected, as `faceless-vex-walk-checker-source.png`. The earlier boy Vex sources remain unchanged. No CLI generation or procedural replacement was used.

The selected files contain respectively 1,018,062 and 905,115 fully transparent pixels. No visible pixels above alpha32 touch any outer source edge. Their source alpha is used directly, including pale cyan magic cores and silver clasps; no color key or alpha rewriting is applied. `preserveSourceAlpha` explicitly prevents the old Vex extraction masks from being inherited in `assets.js`. Measurements are recorded in `evidence/vex-refresh/source-alpha.json` and `components.json`.

`src/hero-frames.js` preserves the twelve-pose index contract at fixed source scale0.245. `src/hero-walk-frames.js` supplies four gait phases for each side/front/back direction at fixed scale0.235; the runtime mirrors the side row for leftward movement. Source crops and ground anchors are measured per pose. Two small crop-local import exclusions remove adjacent-frame pixels at the attack/cast overlap without editing the original PNG. The portrait is an authored crop of the same front-facing hood/shoulder pose.

`tests/vex-art.mjs` passed27 production captures with no asset, page or console errors. Explicit NPC/party/battle fixtures exercise the actual Emberline NPC, dialogue portrait, keyboard followers and production Attack/Void Lance/Lantern Mend timelines. The test separately uses main's installed `__ECHO__.drawHero` hook for all pose/directional import views, avoiding a second uninitialized Vite art instance. The first world fixture accidentally placed companions behind a roof; its world staging is superseded by `tests/vex-staging.mjs` and `evidence/vex-refresh/staging.json`, which passed clear-ground movement plus actual Vex Party selection. No earned campaign progression is claimed.

Reviewed acceptance images under `evidence/vex-refresh/`: `npc-dialogue-portrait.png`, `crew-idle.png`, `crew-clear-ground-walking.png`, `party-portrait.png`, `battle-attack-1_1.png`, `battle-void-lance-1_1.png`, `battle-heal-0_75.png`, `poses-dark-pale.png` and `directional-gait.png`. They show a consistent faceless identity, clean transparent edges, full staff/robe silhouettes and grounded gait. The coat deliberately covers most of the boots, so front/back walking reads primarily through robe sway and short boot reveals. Browsers closed after verification; shared Vite remains running.
