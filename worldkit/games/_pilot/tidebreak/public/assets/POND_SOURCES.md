# Stillwater Pond asset sources

Required source and license records for the scene assets and third-party water implementation.

- Forest meshes, scanned ground textures, editable Blender/texture sources and Barlow font remain copied with original records in `ASSETS.md`, `textures/SOURCES.md`, `art/` and `public/fonts/Barlow-OFL.txt`.
- Pond shoreline, reeds, stones, lilies and procedural water normal field are locally authored. The neutral scene keeps their editable source in `src/world/{pondDefinition,PondWorld,terrain}.js` and `src/capabilities/pond-water/src/`.
- `src/capabilities/pond-water/src/WaterSurface.js` derives from Three.js 0.186.1 `examples/jsm/objects/Water.js`, MIT. Copyright/permission text is retained in `THREE-LICENSE.txt` here and beside the capability source.
- Shore-rock color/normal/roughness JPEGs are byte copies of `art/textures/rock_boulder_cracked_*_1k.jpg`, the Poly Haven CC0 scanned rock source. Original attribution remains in `ASSETS.md` and `textures/SOURCES.md`; no relicensing or new acquisition is implied.
- The simple wave favicon and exploration UI are local code-native graphics. No audio is included.
