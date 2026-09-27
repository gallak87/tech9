# Verification

Run commands from this package. Browser checks build the application, start a preview server on port 4400, and close their browser and server. Set `SCENE_PORT` to use another port. All reports and captures belong in this package's ignored `.artifacts/`.

| Command                              | Coverage                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | Settings, persistence, terrain, placement, layer lifecycle, controller contracts and collision descriptors                                    |
| `npm run verify`                     | Scene readiness, browser/WebGL errors, tuning inputs, keyboard flight, bounds, quality, named views, resizing and resource stability          |
| `npm run verify:walking`             | Grounded movement, slopes, collision, input focus and controller lifecycle                                                                    |
| `npm run verify:weather`             | Presets, independent controls, persistent wetness/snow, particle visibility, weather rendering, walking contact, shelter, audio and lifecycle |
| `npm run verify:weather:performance` | Unrecorded frame timing for each weather preset                                                                                               |

## Captures and performance

`npm run capture -- --view=trail --out=.artifacts/trail.png` starts a development server on port 4399 and captures a 1600 × 1000 image plus camera, settings, renderer and frame-timing data. Options include `--view=grove`, `--view=ridge`, `--quality=ultra`, `--width=1920`, `--height=1080` and `--clean`. `--angle` and `--output` alias view and out.

After building, `SCENE_PORT=4502 node tests/weather-review.mjs --pass=1` records matching weather views, motion samples, real-input exploration and video in `.artifacts/weather/pass-1/`. Rendering, exploration and performance checks write to their respective folders under `.artifacts/weather/`; weather behavior checks use `.artifacts/weather-verification/`.

Serialize browser/GPU runs. Performance checks record source commit, browser, GPU, viewport, quality and frame intervals. Set `COMPETING_LOAD` to describe other active work. Use unrecorded runs for timing; browser frame intervals include scheduling and do not guarantee performance on other hardware. Ordered stills do not establish motion smoothness. The audio probe records the output graph and verifies signal, attenuation and silence; listening establishes perceptual quality.

## Browser and test hooks

`SCENE_URL` reuses an existing server, `CHROMIUM_PATH` selects a browser and `HEADED=1` opens a visible window. The launcher discovers installed Playwright Chromium, preferring the full browser for GPU rendering. Otherwise run `npx playwright install chromium`. Development captures disconnect Vite HMR to keep the loaded source stable.

`?test=1` enables `window.__SCENE_TEST__` with readiness, copied snapshots, named views and settings setup. Weather hooks support rare-state setup and lifecycle cycling. Ordinary production URLs expose no hooks. Focus checks dispatch blur/focus events because automated windows do not reliably transfer native OS focus.
