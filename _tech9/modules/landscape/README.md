# Landscape — extraction draft

Checkpoint only; not yet registered or browser-validated. Extracts the proven finite terrain, fixed pine atlas and bounded 7×7 vegetation detail pools from Forest Flight. Includes runtime forest assets and editable Blender/Python/image sources under `assets/`, with original provenance and licenses in `assets/runtime/ASSETS.md`. Requires Three.js r186/WebGL2. The renderer and frame loop remain caller-owned.

`createLandscape(options)` provides an async scene layer plus height, tree-obstacle and approximate canopy/surface queries. Layout options supply bounds (64–4800 m per axis), seed, terrain/cover callbacks, trail parameters and optional detail exclusion/mowing callbacks. Defaults contain no airport, markers or game rules. Asset URLs are relative to the copied module; bundling/static serving still needs focused validation.

The draft exports camera-following sun placement and the proven terrain-relative AtmospherePass. It does not own application lighting/weather UI.

**Known blocker:** `getWeatherTargets()` currently returns Lambert midgrass and basic pine impostors that accepted weather does not support. Do not wire those targets into weather until the adapter is completed. `windMode: 'weather'` suppresses the old local plant oscillator, ready for weather's shared wind; that integration remains unvalidated. Dispose weather before landscape resources.

Runnable integration examples, weather reconciliation, ownership/failure tests, registry/version metadata and GPU/resource checks remain pending. See [checkpoint](../../docs/FLIGHT_LANDSCAPE_CHECKPOINT.md).
