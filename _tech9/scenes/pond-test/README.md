# Stillwater Pond

A neutral, runnable pond scene extracted from the Stillwater experiment. Walk a finite forest bank beside reflective water. This scene proves a building block: shared shoreline, terrain and vegetation queries; grounded walking and rock/tree proxies; disposable water and quality controls. It contains no fishing rules, tackle, fish, catches or mission progression.

Use Node **^22.13.0 or >=24**. From the repository root:

```sh
npm --prefix _tech9/scenes/pond-test ci
npm --prefix _tech9/scenes/pond-test run dev
```

Open `http://127.0.0.1:4450/`. Production build/preview use `npm run build` and `npm run preview` inside this package; preview is port **4451**. Ports are strict so a different user's server is never silently selected. Dependencies install without modifying repository hooks.

Choose **Begin exploring**, then **WASD / arrows** walk, **Shift** jog. **Right-drag** or **IJKL** look. **Capture mouse** optionally enables pointer lock; **P / Escape / Tab** pause and release it. Blur, a hidden tab and pointer release pause the walk and clear held inputs. **Resume walk** continues; **Restart at south bank** resets the camera and input. The paused/start panel offers exactly five controls: quality, sunlight, atmosphere, ground cover and exposure. Settings use the independent `stillwater-pond.settings` namespace. Balanced is default.

The menu and pause freeze controls. Environmental animation continues for scene inspection and graphics tuning; there is no game clock. Keyboard and mouse are required. Narrow layouts display desktop guidance rather than pretending to supply touch movement.

## Verify

```sh
npm --prefix _tech9/scenes/pond-test test
npm --prefix _tech9/scenes/pond-test run lint
npm --prefix _tech9/scenes/pond-test run build
npm --prefix _tech9/scenes/pond-test run verify
```

`verify` builds and launches production preview on **4452**, drives real keyboard/right-drag/button input, and writes ignored `.artifacts/verification/report.json` plus two representative captures. It covers start, grounded travel, shoreline and authored bank-rock blocking, pause/resume/reset, graphics, narrow layout and production test-hook absence. The report records browser, GPU, viewport, settings and observed frame timing. Only the producer runs this serialized browser/GPU lane against frozen source. `CHROMIUM_PATH` or an installed Playwright Chromium can provide the browser; initial installation/download needs network access. `SCENE_URL` reuses an explicitly supplied server.

CPU tests cover shared shore/terrain/vegetation geometry, rock proxy placement, reflection quality and error cleanup, late-loading resource cleanup and layer lifecycle. Read [tests/README.md](./tests/README.md) for the observational test API. No test result or visual score is inherited from the game that supplied the environment.

## Extend and limitations

Read [ARCHITECTURE.md](./ARCHITECTURE.md). This is scene **stillwater-pond 1.0.0**, the source for **pond-exploration 0.1.0**. A fork owns every source file and asset; it imports nothing at runtime from `_tech9` outside its own copied tree. The local `capabilities/` copies are receipt-tracked building blocks, not live shared imports.

The water is one static irregular ellipse with planar reflections. No swimming, boat physics, fluid solver or underwater rendering is provided. Walking uses approximate horizontal circles for mature trees, forest rocks and the five authored bank rocks. Saplings, deadfall, ground cover and scattered small shore stones are decorative; this is not mesh-accurate physics. The forest is a fixed 160 × 160 m landscape. Higher quality costs more GPU time; frame-throttled reflections can lag moving objects.

The [source/license index](./public/assets/POND_SOURCES.md) retains Three.js MIT, Barlow OFL, forest source/Blender records and Poly Haven CC0 scanned textures. `npm run assets:build` rebuilds the inherited forest kit from local sources with Blender and Python/Pillow; it requires those optional tools. Procedural pond/shore source stays editable in JavaScript. This promotion does not claim a new art-gate pass or perform another art-polish cycle.
