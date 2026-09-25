# Stillwater Pond asset sources

This scene promotes the environment from the owned Stillwater fishing experiment. Gameplay, fish, tackle, catch UI and its review evidence are excluded.

- Forest meshes, scanned ground textures, editable Blender/texture sources and Barlow font remain copied with original records in `ASSETS.md`, `textures/SOURCES.md`, `art/` and `public/fonts/Barlow-OFL.txt`.
- Pond shoreline, reeds, stones, lilies and procedural water normal field were authored locally for Stillwater. The neutral scene keeps their editable source in `src/world/{pondDefinition,PondWorld,terrain}.js` and `src/capabilities/pond-water/src/`. No new acquisition or generated-image asset was used for this promotion.
- `src/capabilities/pond-water/src/WaterSurface.js` derives from Three.js 0.186.1 `examples/jsm/objects/Water.js`, MIT. Copyright/permission text is retained in `THREE-LICENSE.txt` here and beside the capability source. Promotion adds explicit disposal, validated quality/fallback, safe reflection cleanup and a shoreline shader contract shared with CPU queries.
- Shore-rock color/normal/roughness JPEGs are byte copies of `art/textures/rock_boulder_cracked_*_1k.jpg`, the Poly Haven CC0 scanned rock source. Original attribution remains in `ASSETS.md` and `textures/SOURCES.md`; no relicensing or new acquisition is implied.
- The simple wave favicon and exploration UI are local code-native graphics. No audio is included.

There is no inherited scene art-gate pass. A fishing-game review does not grade this scene promotion.
