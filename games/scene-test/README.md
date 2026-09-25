# Alder Vale

A sunlit pine forest staging concept built with Three.js, Vite and Blender. A fixed 160 × 160 metre landscape has a winding dirt trail, scanned ground materials, instanced trees, wind-touched ground cover, rocks and deadfall. No characters are included.

## Run

Use Node **22.13 or later in the 22.x line**, or **24+**, matching Chronoforge Echo's tooling requirements. Run these commands from `games/scene-test`.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (port 4399). `npm run build` creates a portable relative-path build in `dist`; `npm run preview` serves it on port 4400. All runtime assets and fonts are local. Initial install requires npm access.

## Explore

- Drag the scene to look, or **Explore the grove** to capture the pointer.
- **W A S D** / arrow keys fly; **E / Q** rise and descend; **Shift** boosts speed.
- **Escape** releases the pointer. **H** hides the HUD; Escape restores it. While captured, **Tab** releases and opens tuning.
- **01 / 02 / 03** recall the trail, grove and ridge viewpoints.
- Camera stays inside the authored area and above terrain. This is a fly camera, not a physics controller; trees and rocks do not have collisions.

The overlay has five high-level settings: **render quality, sunlight, atmosphere, ground cover, exposure**. Settings persist locally. Balanced reduces pixels, shadows and scattering cost; Ultra increases them. Scene pixel budgets are 1.6 / 2.6 / 5.2 million for Balanced / High / Ultra, protecting large-display performance while the HUD stays at native resolution. The FPS indicator reports observed render-loop timing, not an estimate.

## Work on the world

Read [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, units, lifecycle and extension contracts. `SceneApp.register(layer)` initializes a self-contained layer; `unregister(id)` disposes it. Use `context.events` (an EventTarget) for narrow cross-layer messages. `context.ui` is an independent HUD mount; append a layer-owned element and remove it on disposal. Add a new module for a character, destructible prop or pickup system instead of adding gameplay to the renderer.

```js
const pickups = {
  id: 'pickups',
  async init({ scene, events }) {
    /* Load and own this layer's objects. */
  },
  update(dt, elapsed) {
    /* Simulation only. */
  },
  configure(settings) {
    /* Optional quality response. */
  },
  dispose() {
    /* Remove owned objects, listeners and GPU resources. */
  },
};
await app.register(pickups);
```

Import and register new layers in `src/main.js` after the forest registration. IDs are unique across loaded and loading layers. `init` may be asynchronous; `configure`, `update` and `dispose` are synchronous. Await registration and handle failures. Unregistering during loading prevents activation once `init` settles and then calls disposal, so disposal must also tolerate partial initialization. A layer owns its objects, listeners, timers and GPU resources; resources borrowed from `context.assets` remain the owner's responsibility. Treat shared settings as read-only.

For HUD controls, set `pointer-events: auto` on your layer's interactive element: the full-screen `context.ui` mount deliberately passes other pointer input through to the scene. Listen to built-in `settingschange`, `viewchange` and `metrics` events through `event.detail`; remove listeners on disposal. Moving shadow-casting objects must set `context.renderer.shadowMap.needsUpdate = true` when their shadows need refreshing. The fly controller updates before layers each frame; a future walking camera controller must explicitly replace or disable that camera owner in the app integration, rather than compete with it.

World placement uses fixed seeds and never expands with travel. `terrainHeight(x,z)` is the shared ground query for future actors. Three.js/glTF use +Y up; one unit is one metre. Named prototype groups in `forest-kit.glb` are reusable Blender-authored assets.

## Assets

`art/forest-kit.blend` is the editable Blender source. `art/build_forest.py` and its local source textures reproduce the export. With Blender 5.1+ and Python 3 with Pillow installed:

```sh
npm run assets:build
```

Set `BLENDER_BIN` (or `BLENDER_PATH`) to the Blender executable's full path when it is not discoverable, or `PYTHON_BIN` to select Python with Pillow. The script regenerates derived textures, then launches Blender with `--background --factory-startup`. Rebuilds use the committed source meshes and textures offline; the optional `art/acquire_groundcover.py --download` is a separate online source reacquisition step and is not part of a normal build. Asset sources/licenses are recorded in `public/assets/ASSETS.md` and `public/assets/textures/SOURCES.md`. The font includes its OFL license. Blender is required only to rebuild models, not to run the web app.

## Check changes

```sh
npm test
npm run lint
npm run verify
npm run capture -- --view trail --out .artifacts/trail.png
npm run capture -- --view grove --out .artifacts/grove.png
```

Browser scripts launch Vite and Playwright automatically, or reuse `SCENE_URL`. Run `npx playwright install chromium` if no browser is installed; this initial browser download requires network access. Once dependencies and the browser are installed, verification and captures run offline. `CHROMIUM_PATH` can select a local Chromium. See [tests/README.md](tests/README.md) for the capture and test contract. Ordinary runs do not expose test hooks; `?test=1` enables deterministic settings and the harness API. Verification produces ignored `.artifacts/verification/report.json` with browser/GPU details, frame timing and errors.

Husky, ESLint, Prettier and lint-staged follow Chronoforge Echo's setup. The repository hook dispatches Echo's staged files to its existing hook and this project's staged files to its lint-staged task.

## Art gates

Each deliverable checkpoint is committed, then reviewed by a separate art critic using actual browser frames. `docs/reviews/` holds compact JSON assessments and up to two representative screenshots per round. A gate ends at ≥8/10 or four rounds. Scores assess visible quality against the supplied forest reference; measured performance is recorded separately and never inferred from a screenshot.

The initial gate ended after four rounds at **6.2/10**, below the 8/10 target. The result is a working forest concept; near-photoreal AAA art remains unfinished. The final [review](docs/reviews/checkpoint-1-round-4.json) and its two screenshots document repetitive tree/canopy forms, wiry grass, simple rocks, sparse distant terrain and lighting limitations for the next art pass.

Final validation: **12 unit tests, 9 Playwright checks, lint and production build passed**. Default High quality at 1600 × 1000, DPR 1, in Chromium/ANGLE Metal on Apple M1 Pro measured **71.8 FPS on the trail and 93.1 FPS in the grove**, with no browser, asset or WebGL errors. These are observed browser frame intervals on this machine, not a guarantee on other hardware. Every implementation attempt and independent review is committed separately.

## Next layers

Graphics optimization and its profiling/validation plan are tracked in [ROADMAP.md](ROADMAP.md).

1. Grounded character controller and authored collision proxies.
2. Interactions/pickups and event-driven HUD.
3. Destructible props with pooled debris and selective shadow refresh.
4. Soundscape, footsteps and environmental interaction.
5. Wider authored maps or streaming only after profiling; the current map is deliberately finite.

Known scope: desktop keyboard/mouse exploration; responsive UI is provided, touch flight is not. Half-resolution volumetric sun shafts sample the actual foliage shadow map. The scattering and contact shading are deliberately lightweight approximations. Baked/static foliage shadows trade perfectly animated shadows for throughput. This is an extensible visual concept; final art-gate scores and real browser measurements document its quality limits.
