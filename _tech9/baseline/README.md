# Tech9 Baseline

A standalone starting application: Three.js rendering, a 160 × 160 metre forest, editable assets, fly/grounded camera controls, weather and graphics settings.

## Run

From this package, with Node `^22.13.0 || >=24.0.0`:

```sh
npm ci
npm run dev
```

Vite serves port 4399. `npm run build` creates `dist/`; `npm run preview` serves it on port 4400. Assets and fonts are local.

## Controls

The default fly view supports drag-to-look, WASD/arrows, E/Q vertical movement and Shift boost. **Explore the grove** captures the pointer; Escape releases it. H hides the HUD; 01/02/03 select viewpoints.

Open `/?controller=walk` for grounded movement with Start/Pause/Resume, right-drag or IJKL look, optional pointer capture, WASD/arrows and Shift speed. Escape/P pauses. Tuning pauses movement and keeps keyboard focus in the menu.

Quality, sunlight, atmosphere, ground cover and exposure persist locally. Balanced/High/Ultra cap scene pixels at 1.6/2.6/5.2 million. The FPS indicator measures render-loop timing.

## Development

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for runtime contracts. `src/main.js` selects the world definition, registers layers and selects the controller. `SceneApp` owns the renderer and frame loop; layers own their resources. `terrainHeight(x,z)` supplies the shared ground query. Units are metres, +Y up.

`package.json` → `tech9.modules` selects grounded-walking, placement-collisions, weather and landscape. Their owned source copies live under `src/modules/`. The scene owns terrain and authored placements in `forestComposition.js`; `ForestWorld.js` calls landscape’s `createComposedLandscape` for shared rendering and material ownership. Those placements also drive conservative tree, rock and deadfall collision proxies. The fixed forest retains its detail; the landscape module separately exposes larger worlds with traveling detail.

## Assets

[Asset provenance](./src/modules/landscape/assets/runtime/ASSETS.md) records licenses and source files. `src/modules/landscape/assets/art/forest-kit.blend`, source images and scripts reproduce the forest kit. Canonical framework improvements belong in `modules/landscape` and reach baseline through module sync; a standalone game owns its copied assets. Run `npm run assets:build` with Blender 5.1+ and Python/Pillow. `BLENDER_BIN`, `BLENDER_PATH` and `PYTHON_BIN` select executables. Runtime use needs only the committed assets.

## Checks

```sh
npm test
npm run lint
npm run build
npm run verify
npm run verify:walking
```

Browser commands use Playwright Chromium; install it with `npx playwright install chromium` when needed. `SCENE_PORT` selects a free port; `SCENE_URL` uses an existing server. Test hooks require `?test=1`. See [test commands](./tests/README.md) and the [performance roadmap](./ROADMAP.md).

## Weather

The forest consumes the reusable [weather module](./src/modules/weather/README.md). The left field panel selects Clear, Drizzle, Heavy rain, Clear winter and Snowfall. **Shape the weather** exposes independent rain, falling snow, settled snow, wetness, wind, wind direction and cloud controls. Stopping rain leaves slowly drying surfaces; stopping snowfall leaves settled snow. Sound starts muted and requires the Sound button. Pause freezes weather, and Reset returns dry clear conditions. Trail/Rock/Shelter compare exposed and covered surfaces without moving the scene. The ordinary fly/walking controls, view buttons and five renderer controls remain available; H hides both panels.

Snow uses a thin surface layer capped at 6.5 cm; walking uses the corresponding terrain height allowance. Rock, log and tree-crown cover queries are scene-owned analytic approximations. Static vegetation shadows retain the original pose. Puddles and wet surfaces use a small scene-owned forest environment map; reflections do not track moving objects. See the module guide for reuse and [test commands](./tests/README.md) for weather verification.
