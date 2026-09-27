# Stillwater asset sources

- Forest meshes, scanned ground textures and Barlow font: copied by the registered starter, with original source and license records in `ASSETS.md`, `textures/SOURCES.md`, `art/` and `public/fonts/Barlow-OFL.txt`.
- Pond shoreline, reeds, stones, lilies, water normal field, rod, reel, float, trout mesh/pattern and UI fish icon: original procedural assets authored for this game. Editable source is `src/world/{pondDefinition,PondWorld}.js`, `src/game/Tackle.js`, `src/game/FishingGame.js` and `public/favicon.svg`. No downloaded fish/tackle/texture or generated image is used.
- `src/world/WaterSurface.js`: derived from Three.js 0.186.1 `examples/jsm/objects/Water.js`, MIT. Local changes expose its render target for size control/disposal. Three.js copyright and permission text are preserved in `THREE-LICENSE.txt` alongside this file.
- No audio is included.

Shore-rock runtime color/normal/roughness JPEGs are direct copies of the starter’s `art/textures/rock_boulder_cracked_*_1k.jpg` scanned rock sources; the original attribution is retained in `ASSETS.md`. No new acquisition was performed.
