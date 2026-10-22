# Worldkit

`@worldkit/environment` is a local ESM package of reusable Three.js environment systems and art assets. It grew from `_tech9`; its public API is now about composing environments inside an existing game. It does not generate games, own a renderer, create a frame loop, or prescribe a biome.

## Consume

From a sibling game such as `games/vector-nova`:

```sh
npm --prefix ../../worldkit ci
npm install ../../worldkit
```

The first command prepares the linked package for direct Node imports and development. A packed installation uses the consumer's peer instead. Use Three.js **0.186.1**, a shared peer dependency. With Vite, deduplicate Three (`resolve.dedupe: ['three']`) when consuming the local linked package. Runtime images and GLBs use static `new URL(..., import.meta.url)` references, so the consumer build emits them with its own base URL. There is no public-folder copy step and no CDN request.

For a linked local dependency outside Vite's detected workspace root, explicitly include both the application directory and the `worldkit` directory in `server.fs.allow`. Deduplicating Three does not grant permission to serve linked image files: without this allowlist, development asset requests can return 403 even while the production build succeeds. Keep the allowlist limited to these required directories; do not disable Vite's filesystem protection.

```js
import {
  loadForestKit,
  prepareForestParts,
  disposeForestKit,
} from '@worldkit/environment/forest';
import { createOceanLayer } from '@worldkit/environment/ocean';

const kit = await loadForestKit();
const parts = prepareForestParts(kit, 'fern_a');
// Instance the parts with your own transforms, culling and lighting.
// Parts own cloned geometry/materials, but borrow textures from kit.
// Dispose parts' geometry/materials first; disposeForestKit(kit) last.

const ocean = createOceanLayer({ halfSize: 500, quality: 'balanced' });
ocean.init({ scene });
// In your existing frame loop: ocean.update(dt).
// At level teardown: ocean.dispose().
```

## Public entries

| Import                  | Exports and purpose                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@worldkit/environment` | Primary landscape, composed-landscape, ocean, pond-water and weather factories.                                                                                                                                                                                             |
| `/forest`               | `loadForestKit`, `disposeForestKit`, `prepareForestParts`, `loadForestTextures`, `LANDSCAPE_ASSETS`, `FOREST_KIT_URL`, `BARK_MATERIAL_ASSETS`, `FOREST_MATERIAL_ASSETS`, `softenShadowSampling`. Use the assets without adopting a default world layout.                    |
| `/living-forest`        | `createLivingForestKit`, `createLivingForestMaterials`, `createLivingHollow`, geometry helpers, `livingForestBarkURL` and `livingForestLeafURL`. New monumental tree prototypes, attached cutout foliage and route-cut hollow geometry; consumers load the supplied images. |
| `/landscape`            | `createLandscape`, `createComposedLandscape`, deterministic layout helpers, `followLandscapeSun`, `AtmospherePass`.                                                                                                                                                         |
| `/ocean`                | `createOceanLayer`, `createOceanNormals`, `createIslandCoast`, `createNavigationArea`.                                                                                                                                                                                      |
| `/water`                | `createPondWaterLayer`, `createPondShoreLayer`, `createShoreline`, `Water`, `REFLECTION_QUALITY`.                                                                                                                                                                           |
| `/weather`              | `createWeather`, `DEFAULT_WEATHER`, `WEATHER_PRESETS`, `validateWeather`.                                                                                                                                                                                                   |

Detailed configuration and lifecycle contracts live in the [Living Forest](modules/living-forest/README.md), [landscape](modules/landscape/README.md), [water](modules/pond-water/README.md), [ocean](modules/island-ocean/README.md), and [weather](modules/weather/README.md) guides. Only the listed package entries are public API; source paths may change.

For kit-only consumers, use `@worldkit/environment/forest/kit`: it exports `loadForestKit`, `disposeForestKit`, `prepareForestParts`, `FOREST_KIT_URL` and `BARK_MATERIAL_ASSETS`. This entry emits only the kit GLB and three bark maps. Vite discovers static asset URLs before JavaScript tree-shaking, so importing a narrow entry matters even when only a few names are selected from the broader `/forest` entry.

The /industrial entry supplies original press frames, factory bays, roller banks, drive wheels, ejector housings, channel cassettes, gantries, service towers and motor housings through createIndustrialKit, with optional shared metre-scaled steel and enamel finishes through createIndustrialFinish. See the [industrial module guide](modules/industrial/README.md) for ownership. Colossus Works is its first consumer.

## Art and world ownership

Worldkit owns reusable source systems, canonical assets, asset URLs and their provenance. A game owns its landmarks, route, composition, lighting, collision policy, placement recipes and performance budget. A giant hollow tree can use Worldkit's bark and foliage assets while its geometry remains specific to that level.

`BARK_MATERIAL_ASSETS` exposes only `barkColor`, `barkNormal` and `barkRoughness`; prefer it when those are the only scans needed so Vite can omit unrelated art. `FOREST_KIT_URL` likewise references only the GLB. The compatible `FOREST_MATERIAL_ASSETS` collection exposes bark and rock color/normal/roughness maps, `pineSpray` and `endgrainColor`. These are URLs, not allocated GPU textures. Set sRGB only on color maps, keep normal and roughness maps linear, share loaded textures within a level, and dispose them when their last user releases them. Bark and foliage retain their original asset provenance; see [NOTICE.md](NOTICE.md).

`prepareForestParts` respects prototype hierarchy transforms and clones geometries/materials for instancing. Its material textures remain shared with the loaded kit. `loadForestTextures` returns owned floor/path textures; the caller must dispose them. Composed and broad landscape layers manage their own loaded resources, or borrow a supplied `forestKit` in the composed layer's initialization context.

## Integration limits

- Existing broad terrain and weather surface queries are height fields. They do not describe caves, walls, giant tree cavities or stacked roads. Those stay game-owned.
- `AtmospherePass` is optional and renders the final image directly to the screen. It is not automatically compatible with another postprocessing chain; integrate deliberately instead of running two final passes.
- Ocean and pond reflections are planar, throttled and bounded. Their quality presets allocate render targets and rerender scene content.
- Legacy `/forest` prototypes are ordinary metre-scale trees; `/living-forest` prototypes are around 100m tall. Match placement, route clearances and distance detail to the selected kit’s actual bounds.
- Instancing, alpha cutouts and distance transitions help control cost; no package can guarantee a frame rate without measuring the complete game.

## Develop and validate

```sh
nvm use 22
npm ci
npm run check
npm run lint
```

`check` runs the focused module and package tests, then packs the actual npm payload into a temporary standalone Vite consumer and builds it with a non-root base URL. It verifies that all public imports resolve, canonical assets ship, and the resulting build contains no source file URLs. Temporary outputs are removed. The package remains private; no publishing is needed for the pilot.

The old baselines, pilots, CLI and source-copy workflows remain as references. They are excluded from the package payload and are not its API or required workflow. Historical documentation is retained in [legacy-framework.md](docs/legacy-framework.md) and [legacy-architecture.md](docs/legacy-architecture.md). Historical fork receipts keep their original paths.

`ROCK_FORMS_URL` from `/forest` supplies the two original authored rock meshes without the full forest scene or materials. It resolves to the compact canonical GLB; callers own materials, placement and disposal. See [runtime art sources](modules/landscape/assets/runtime/ASSETS.md).
