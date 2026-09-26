# Weather

Composable Three.js rain, persistent wetness, settled snow, snowfall and shared wind. The forest baseline is the complete working example: `baseline/src/world/ForestWeather.js` chooses participants and applies condition state to its own sky, lights, fog and interface. Copy this folder into `src/modules/weather/`. Requires Three.js r186, WebGL2, metres and +Y up. No external assets or network requests; particle shapes, surface variation and ambience are authored in the source files.

```js
import {
  createWeather,
  WEATHER_PRESETS,
} from './modules/weather/src/Weather.js';

const weather = createWeather({
  targets: [
    { material: groundMaterial, ground: true },
    { material: rockMaterial },
    { material: plantMaterial, foliage: true, wind: 0.65, snow: 0.75 },
  ],
  surfaceBounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
  sampleSurface(x, z) {
    // Your query, including the height of any overhead shelter.
    return {
      position: [x, groundHeight(x, z), z],
      normal: [0, 1, 0],
      exposure: 1,
      coverHeight: groundHeight(x, z),
      snowRetention: 1,
      puddle: 0.6,
    };
  },
  settings: { ...WEATHER_PRESETS.drizzle, muted: true },
});
await app.register(weather); // calls init(context), then configure(settings)
weather.configure({ rain: 0 }); // ground remains wet and dries over time
weather.configure({ snow: 0.8, snowfall: 0, wind: 0.5 });
// app's existing frame loop calls weather.update(dt, elapsed).
// Read weather.condition to coordinate application-owned lights, fog and sky.
// From an explicit sound-button click:
await weather.unlockAudio();
weather.configure({ muted: false });
// At teardown: app.unregister('weather'), which calls dispose().
```

`init` needs `{scene, camera, bounds}`. Bounds may be supplied as `surfaceBounds` instead. No renderer or second frame loop is created. Use a fresh layer for each activation. Dispose before disposing participating materials. Weather preserves existing `onBeforeCompile` and program keys, and restores its own hooks without overwriting a later owner. Material targets must be unique in meaning: a material shared between two objects receives the same weather policy. Clone it if those objects need different policies. Standard, physical and Lambert materials are supported, with optional `ground`, `foliage` and 0–1 `snow`, `wet`, `wind`, `depth` response scales. `depth` scales geometric snow lift separately from coverage; set it to zero for small debris that should be buried by terrain snow. Wind bends above local Y=0; use plant geometry rooted at its base. Normals account for nonuniform instance scaling. Surface hooks compose terrain textures, wetness and snow without replacing original material maps.

Version 1.1 additionally supports upright +Y pine impostors through `{material: basicMaterial, snowMask, depth:0, wind:0}`. `snowMask` is a linear texture aligned with the diffuse map UVs; red encodes upward-facing snow coverage as `smoothstep(.23,.8,normalY)`. The landscape module bakes it from the same pine geometry/views as its color atlas. This provides prefiltered per-branch snow coverage and shared seasonal/wet tint without a second wind oscillator or weather-time atlas rebakes. These cards must remain upright (Y rotation and uniform scale); their baked illumination and approximate receiving position cannot reproduce arbitrary relighting or exact close-up geometry. Weather borrows this texture and does not dispose it. Basic materials without this explicit atlas contract remain unsupported. Existing Standard/Physical behavior is preserved.

`configure(patch)` or `configure({weather: patch})` accepts independently adjustable 0–1 `rain`, `snowfall`, `snow`, `wetness`, `wind`, `cloud`, `winter`; heading `windDirection` in degrees (0 toward +X, 90 toward +Z); `transition` seconds (0–30); `dryingTime` seconds (1–3600); and boolean `muted`, `paused`. Unknown app settings are ignored. Presets are `clear`, `drizzle`, `rain`, `winter`, `snowfall`; they intentionally leave the wetness reservoir intact. Explicit wetness values set that reservoir. Snow is artist-controlled accumulation and stays when snowfall stops. `condition` and `stats` return copies. State time is accumulated from clamped dt, so focus changes and long frames cannot fast-forward particles or drying. Mute and pause silence ambience; sound must be unlocked by a user gesture.

Disable unneeded features with `features: {rain:false, snowfall:false, wetness:false, snow:false, wind:false, impacts:false, audio:false}`. Targets may be empty for precipitation-only scenes. Surface data is still needed for receiving surfaces and shelter; without a query, particles have no receiving surface and no impacts spawn.

## Surface and cover contract

`sampleSurface(x,z)` returns a downward receiving hit: `position` and `normal` are three-number arrays; normal is normalized by the module. Return null outside your world. `exposure` (0–1) is the fraction of precipitation reaching that hit below `coverHeight`. A canyon overhang can return ledge/ground position, exposure 0 and its overhead roof height. An open ledge returns exposure 1 and coverHeight equal to its own height. Forest canopy returns fractional throughfall. `snowRetention` controls ground deposition, for example a worn path; `puddle` marks suitable pooling spots, additionally filtered by slope and exposure. Rock/log hits need their own height and normal, not the terrain height beneath them.

The module samples a static 128² exposure/height field at init (configurable 8–256). Dynamic shelter requires a new layer; multiple vertically stacked receiving surfaces are not modeled. Particles end at the cover plane according to exposure and at the receiving plane otherwise. This is an approximation for sloped roofs and canopy, not triangle collision. Impacts are bounded to 160 and puddles to 52 around the viewer, with refresh after travel; rain and snowfall use at most 7,200 and 2,800 GPU instances. World-space wrapping keeps volumes at the viewer after jumps. Puddles are thin physical surfaces that reflect the consumer's Three.js environment map with procedural muddy margins and ripples. They do not capture moving scene objects or simulate water flow.

Winter styling reduces liquid gloss when rain is absent, while preserving the wetness reservoir. Snow is a slope/exposure/noise material layer with at most 6.5 cm of geometric lift; it is not a deep volumetric simulation. Retain bark and rock sidewalls by adjusting target retention. Provide the same thin-depth approximation to your controller's ground query. The forest adapter uses terrain slope, canopy exposure and path retention; differences between its analytic cover and the sampled material field stay within the 6.5 cm maximum. Its rock/log/crown proxies approximate authored geometry and static shadows retain the original vegetation pose. No snow footsteps, branch loading or physical melt is claimed.

`src/` is also the editable source for all procedural visual/audio assets. See `NOTICE.md`. Run focused tests from `_tech9`: `./run exec -- node --test modules/weather/tests/*.test.js`.

For a minimal running scene with a solid overhead shelter, launch from `_tech9`:

```sh
./run exec -- vite --host 127.0.0.1 --strictPort --port 4500
# Open /modules/weather/examples/
```

`examples/main.js` is a complete scene integration with explicit roof exposure and four preset buttons. It uses the framework's installed Three.js dependency and no forest assets.

## Visual review notes

Six independent forest art reviews scored **5.8, 6.0, 6.0, 6.5, 6.5 and 6.2/10** against an AAA reference; the 9/10 target was not met. Strengths were coherent weather moods, readable paths, retained bark/rock detail and snow caps. Future polish: more natural ground-snow edges and depth, stronger wet rock/foliage response, and richer precipitation detail.

Critics inspected stills and ordered motion samples. Subsequent user playback review approved the visuals and audio and found walking decent.
