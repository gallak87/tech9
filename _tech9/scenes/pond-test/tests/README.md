# Pond scene checks

`npm test` runs GPU-free CPU/lifecycle checks. `npm run lint` checks JavaScript and formatting. `npm run verify` first builds, then runs the browser suite on strict port 4452 (or an explicit `SCENE_URL`). No test or script installs repository hooks.

`?test=1` exposes only `window.__SCENE_TEST__`:

- `ready`: getter indicating the running SceneApp is loaded.
- `snapshot()`: renderer/camera/settings/world metadata plus `exploration: {state, controller}`. State is `menu`, `exploring` or `paused`. The controller reports enabled/locked/playerRadius/eyeHeight. The `pond-water` world entry reports reflectionSize, reflectionStride, quality and authoredShore.
- `setSettings(patch)`: graphics-only setup; there is no camera setter, teleport, state setter or completion API.

The suite starts via a visible button, walks with real keys, orients with real right-drag mouse input, presses into the shoreline and a known bank-rock proxy, pauses/resumes/restarts and checks five native controls. A synthetic blur event tests lifecycle response; it does not supply movement or completion. Production test-hook absence is verified on a normal URL.

The ignored report includes exact browser/GPU/viewport/settings and observed requestAnimationFrame timing. This scheduling measurement is not isolated GPU time. Captures and performance runs must be serialized against frozen source; these test sources do not imply a run has occurred.
