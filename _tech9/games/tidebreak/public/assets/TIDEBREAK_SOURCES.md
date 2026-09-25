# Tidebreak asset sources

- The copied forest kit, Blender/editable source, scanned textures and Barlow font retain the original [forest records](./ASSETS.md), [pond source index](./POND_SOURCES.md), texture `SOURCES.md`, Three.js MIT notice and Barlow OFL notice. No license text or source attribution was removed.
- Island terrain, ocean normal texture and shelf shading, lighthouse, dock, course buoys, UI chart, schooner and galleon hulls/sails/rigging/wooden helms/captains and wake/spray are authored locally in the game's JavaScript sources. They require no external image service, remote runtime assets or additional asset licenses.
- `src/capabilities/pond-water/src/WaterSurface.js` is the receipt-tracked MIT Three.js derivative. Tidebreak uses its reflection ownership/quality contract unchanged and adapts its material at the consuming ocean layer. The local capability license remains adjacent to that source.
- `tech9.json` and `GAME_PLAN.json` record the immutable framework fork; subsequent game changes are in Git.
