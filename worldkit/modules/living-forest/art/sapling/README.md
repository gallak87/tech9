# Sapling oak study

One experimental tree for a matched Vesper driving-camera comparison. This is
not an accepted replacement for the Living Forest kit or the giant hollow.

The editable `sapling-oak-study.blend` retains Sapling's live source curves and
the two exported mesh objects. `settings.json` records the complete generation
recipe. `build_sapling.py` regenerates the source and the runtime
`../../assets/sapling-oak-study-v1.glb`; `asset.json` records its counts and hash.
Worldkit owns this source and export. Consumers own placement, lighting and route
clearance. The editable `.blend` stays in the repository; the package ships the
GLB, attribution and small build recipe files.

## Build

Use Blender 5.2 or later with **Sapling Tree Gen 1.0.0**. The extension is free,
GPL-3.0-or-later, from the [official extension listing](https://extensions.blender.org/add-ons/sapling-tree-gen/).
The archive used here is the official `add-on-sapling-tree-gen-v1.0.0.zip`, SHA-256
`65a1ae7ab3a73a675a2de7370e27a6186e889f2e396fd27af0a44666bc3b9a9a`.
The extension is a build dependency, not shipped or required by the game.

To avoid changing an artist's normal profile, install it into an isolated profile:

```sh
BLENDER_USER_RESOURCES=/tmp/worldkit-sapling-profile blender --background --factory-startup \
  -c extension install-file -r user_default -e /path/to/add-on-sapling-tree-gen-v1.0.0.zip
BLENDER_USER_RESOURCES=/tmp/worldkit-sapling-profile blender --background --factory-startup \
  --python modules/living-forest/art/sapling/build_sapling.py
```

Run from the Worldkit directory. This build uses Blender 5.2.3 LTS and the
extension's `bl_ext.user_default.sapling_tree_gen` module. Opening the saved blend
to inspect the baked mesh objects does not require the extension.

## Authoring and provenance

- Growth is Sapling's Weber–Penn model, using an adapted **Coast Live Oak** preset
  by Brad Chamberlain (2026, preset source GPL-3.0-only). Sapling credits Andrew
  Hale, Aaron Buchler and the other contributors in its upstream source.
- The complete settings retain that preset's credit in this document. The study
  changes trunk proportions, branch counts, split behavior, curvature, crown
  pruning and seed to suit a monumental broadleaf tree.
- The original export recipe samples those grown curves into a bounded mesh,
  with adaptive ring resolution and bark UVs. It does not replace Sapling's growth
  with the existing JavaScript branch generator.
- Branches carry the existing Living Forest cutout spray at actual grown branch
  points. The current bark and foliage images remain borrowed, with their existing
  [generated-image provenance](../../assets/provenance.json).
- The runtime GLB has two mesh primitives and no embedded images or material
  payload. The narrow Worldkit loader supplies the existing Living Forest finish.

The source preset and parameter recipe are retained under GPL-3.0-only. Worldkit's
existing notices continue to apply to the original generated images and project
art. No third-party tree mesh was downloaded.
