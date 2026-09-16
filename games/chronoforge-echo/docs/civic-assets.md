# Civic asset import and native review

The two original generated PNGs are preserved unchanged: [production](../public/assets/civic-production-source.png) and [culture](../public/assets/civic-culture-source.png), both 1254×1254. They were generated with the imagegen tool; the exact prompts are recorded under `civic_production` and `civic_culture` in [asset-prompts.json](asset-prompts.json). The requested transparent 2048px output arrived at 1254px with a baked neutral checkerboard, so import uses measured runtime extraction rather than assuming true alpha or the requested dimensions.

| Atlas row | Identity | Four visible stages |
|---|---|---|
| Production 1 | Town Center | Bell shelter → harbor hall → survey hall → glass conservatory |
| Production 2 | Farm | Garden shed → wind-pump terraces → glasshouse → stepped greenhouse |
| Production 3 | Mine | Adit → winch → derrick → reclamation gantry |
| Production 4 | Energy Extractor | Single vane → paired vanes → turbine → spiral collector |
| Culture 1 | Barracks | Field tent → training hall → watch academy → courtyard sanctuary |
| Culture 2 | Forge | Anvil canopy → smithy → machine shop → resonance foundry |
| Culture 3 | Research Lab | Survey tent → observatory → domed lab → ringed library |
| Culture 4 | Walls | Palisade → stone gate → reinforced gate → open civic gateway |

`assets.js` removes only exterior-connected neutral background and measured enclosed pockets, preserving pale stone and glass highlights. `art.js` uses the [32 measured crop rectangles](../evidence/civic-measured-crops.json), fixed source scale and the existing Town Center door anchors. The actual row separators are 320/627/932 for production and 325/627/941 for culture; equal grid cuts had borrowed foundation fragments and clipped turbine tips. World placement now also clears the barracks facade of foreground tree canopies.

The review rendered all 32 variants in the actual Haventide scene at native **960×540**, then recaptured all 32 after repairs and the final two small alpha fixes. These are explicit building-level fixtures with camera positioning and frozen simulation, **not earned construction progression**. All identities and upgrade silhouettes were inspected; no mismatched types remained. Both repaired runs reported zero browser errors. No performance measurement was made, and the browser was closed after capture.

Evidence: [initial measurements](../evidence/civic-review.json), [32 repaired frames/log](../evidence/civic-review-after.json), [final two-frame log](../evidence/civic-review-final.json). Representative repairs: [open gate](../evidence/civic-review-after-walls-4.png), [gantry](../evidence/civic-review-after-mine-4.png), [conservatory](../evidence/civic-review-after-town_center-4.png), [farm](../evidence/civic-review-after-farm-4.png), [forge](../evidence/civic-review-after-forge-3.png), [barracks shelter](../evidence/civic-review-after-barracks-1.png) and [upgraded barracks](../evidence/civic-review-after-barracks-4.png).
