# Regional town centers

All four towns now have their own four-stage exterior family. Each sheet was generated as one coherent 2×2 image with built-in imagegen, using the approved Haventide exterior sheet for finish and the existing regional props for materials. The new families are implemented for the user's in-game spot check; Haventide's approved art and 240/280/325/370 world widths are unchanged.

## Review everything from Haventide

In the local development build, press **Backquote** (the backtick key) to open **Art preview** at bottom left. Select Haventide, Emberline, Orbital Reach or Last Crown, then click **1–4** or press the number keys / **← →**. The selected art temporarily replaces the building at Haventide's existing entrance. There is no travel, region change, reveal, unlock or progression change, and the selector includes no story descriptions.

The tool is available only on **localhost**, **127.0.0.1**, and **[::1]**. Backtick requires no flag; **`?dev=1`** additionally opens it automatically when a new/loaded session reaches unobstructed exploration. Remote hosts cannot mount the panel. Temporary overrides and rehearsal images are cleared on close/reset without accessing saved progress.

The party stays in place. Opening the panel pauses play and frames an envelope containing all sixteen building bounds; switching towns or tiers keeps that camera fixed. **Use actual Haventide** resets both selections. **Backquote, Esc or ×** closes the panel, resets all overrides and restores the prior camera. Starting/loading a session also clears it.

`ArtPreview` holds selections outside `game.state`; `visualState` produces a shallow rendering copy. The regional substitution is honored only for `haventide_entrance`. Checkpoints, manual saves, exports, resources, exploration and progression continue to use the original expedition state. Development UI and CSS are excluded from production builds.

## Production selection and size

Actual town entrances select their region's sheet and use the shared `buildings.town_center` level. Each crop has an explicitly chosen world width and measured doorway anchor. Its aspect ratio determines height, without stretching; widths and heights both increase. Foreground occlusion uses those same dimensions. Door interaction positions and existing collision geometry remain unchanged for this art pass.

| Town | Survivor | Reclaimer | Ascendant | Transcendent |
| --- | --- | --- | --- | --- |
| Haventide | 240 × 189 | 280 × 273 | 325 × 316 | 370 × 397 |
| Emberline | 230 × 209 | 275 × 240 | 320 × 314 | 370 × 407 |
| Orbital Reach | 235 × 228 | 280 × 260 | 325 × 331 | 375 × 396 |
| Last Crown | 230 × 185 | 275 × 241 | 325 × 323 | 375 × 414 |

Dimensions are world units, rounded. Exact crops, widths, anchors and extraction settings are in [town-center-art.js](../src/town-center-art.js). All four towns also have live modular interior restoration described below. Successful Town Center upgrades now play the [production upgrade cinematic](upgrade-cinematic.md) using the current town’s exterior and the player’s actual indoor view.


## Interior restoration

Each town has four production twelve-piece kits selected by the real Town Center level. Haventide’s approved sources and layout are unchanged. Emberline uses terracotta, copper, rust/crimson textiles and amber solar equipment. Orbital Reach uses slate, silver, cobalt/indigo textiles and blue navigation machinery. Last Crown uses obsidian, platinum, plum textiles and amethyst living machinery.

Survivor starts with scant rations, empty shelves, salvaged tools and a rough cot. Reclaimer repairs and organizes practical services. Ascendant adds abundant preserved food and powered specialist equipment. Transcendent adds food-growing systems, advanced fabrication, adaptive training and a restored civic hologram. Each tier contains provisions, forge, inn, archive, engineering, training, planning desk, storage, floor material, runner, window wall and column; staff remain separate sprites.

The room geometry and service approaches stay fixed through restoration. Old save positions recover to nearby walkable floor; vendor unlocks still follow civilization requirements. The renderer crops immutable sources at runtime, removes connected neutral background only around declared sprite silhouettes, and leaves floor material opaque. Metadata lives in the regional `*-interior-art.js` modules and the shared `town-interior-art.js` registry.

Enter Haventide’s hall and use the local art panel’s town selector and **1–4** to compare any regional kit in place. Upgrade previews use the same selected kit and exterior at Haventide; actual upgrades use the current town. The approved quick fades, exterior-only zoom and fixed indoor before/after dissolve remain shared across every town. No preview is persisted.

## Sources and extraction

The requested resolution was 3072 × 3072 or the highest available square size with true transparency. Each returned PNG is actually **1254 × 1254 RGB with an opaque checkerboard**. The original files remain unchanged in [public/assets/town-centers](../public/assets/town-centers/).

- Emberline: sandstone, indigo awnings and brass lanterns progress to a solar civic tower with a golden segmented crown.
- Orbital Reach: snow, slate, steel buttresses and red pennants progress to an advanced polar anchor station with floating stabilizers.
- Last Crown: ivory ribs, teal petal roofs and planted galleries progress to a branching bio-ceramic energy spire.

The existing connected neutral-background key removes exterior checkerboard. Measured interior-air seeds clear awning supports, cable loops and branch gaps without globally removing pale architecture or snow. Last Crown's darker checker flecks use `keyMin:130`; outlines protect the ivory surfaces. Its second and fourth frames overlap vertically in the source, so two crop-local masks remove only neighboring-frame fragments. Derived canvases carry those masks; the source PNG is never rewritten.

The [static alpha inspector](../scripts/town-center-alpha-review.mjs) evaluates the production flood-key function on detached canvases in a disposable browser profile, writing regenerable crops into the ignored `.art-review/town-centers/` folder. It starts no server, loads no game entry and accesses no saves or user browser session.

## Verification

Unit tests cover all sixteen preview combinations, checkpoint/manual export isolation, reset behavior, entrance anchors, monotonically increasing sizes, all regional source files, and the fixed camera envelope. Production Vite build and root/subpath asset checks pass. Development overlay JavaScript and CSS also compile in memory with no game launch. The build has the existing non-failing large-chunk warning.

Regional interior checks also cover all 192 piece mappings, regional palette source selection, service/staff/exit reachability, old-save recovery, and immutable preview states. Only static asset extraction and compilation were inspected. The user is performing the gameplay/visual acceptance check; no game or development server was launched for this pass.
