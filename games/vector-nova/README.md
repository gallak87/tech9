# VECTOR//NOVA

Standalone browser anti-gravity racer, **Gate 2 — ready for human playtest; Gate 1 approved**. One original Kestrel and the complete Halcyon Viaduct first level. Built independently with Three.js/Vite; neither tech9 framework is imported or required.

## Run

Node 22.13+ (tested 22.15), npm. From this directory:

```sh
npm ci
npm run dev
# http://127.0.0.1:5179
npm run build
npm run preview
# http://127.0.0.1:5180
npm test
npm run verify
```

Vite may require its platform-specific optional native dependency; do not install with optional dependencies disabled. Chrome must be installed for verification, or run `npx playwright install chromium`. `VN_BROWSER_CHANNEL`, `VN_BROWSER_PATH`, `VN_URL`, `VN_EVIDENCE` customize verification. Keep verification headless unless explicitly requested otherwise. The harness keeps a server it starts running for review. Rendering needs WebGL2. No network resources, accounts, external fonts, or backend are used by gameplay.

## Controls

- W / Up: throttle; S / Down: brake; A/D or Left/Right: steer.
- Space: airbrake (tighter rotation, controlled lateral slip).
- Shift: boost; reserve is shared with wall damage and slowly recovers off boost.
- R: recover at last passed checkpoint, invalidate current timed lap.
- Escape: pause/resume; pause menu offers a fresh lap, paddock, volume, graphics and reduced motion.
- I: inspect actual ship; C: alternate trackside camera.
- Menus: Tab/Shift-Tab focus, Enter/Space activate.
- Gamepad prototype mapping: left stick steering, RT throttle, LT brake, A boost, B airbrake (physical controller unverified).
- Small viewports expose pointer controls; desktop mobile emulation is not a physical-device test.

The Gate 2 circuit is 7.2km with eleven districts, a 62° bank, a high crossing, elevation, reversing bends, a transit vault and an open gallery. Start from the real title screen. Laps repeat indefinitely. Steering now follows the visible driver-left/right directions; stationary magnetic hold prevents rest drift on grades and banks. The vehicle frame still follows the road tangent, as requested pending the Gate 2 decision. This is a surface-constrained magnetic handling model; free-flight jumps and inverted loops are deferred.

## Review scope

Gate 1 approved the Kestrel silhouette, the metropolitan direction and the basic practice shell. Gate 2 completes the first level and core handling/presentation. Broader game systems and subsequent levels remain pending separate human gates. See [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), [art bible](docs/ART_BIBLE.md), [provenance](docs/REFERENCES.md), [asset manifest](docs/ASSET_MANIFEST.json), [status](docs/STATUS.json) and [independent critic](docs/GATE2_CRITIQUE.md). A score is claimed only when the critic actually awards it; human approval is separate.

The user ended further critic iterations after four completed rounds to move to Gate 2. Last formal scores: art/lighting 8, handling/UI 9, track 8.5, visible feedback 8, qualified performance 8.5. Final facade/water/plume fixes received builder/integrator checks, not a new critic score. The original all-category 9/10 target is not certified. Gate 2 remains pending the user's playtest and automatic-steering decision.

## Verification

`npm test` checks steering projection, rest/gravity forces, brake/boost behavior, collision bounds, checkpoint order, recovery invalidation, seam/frame continuity, crossing clearance and route showcases. The browser harness drives real keys and checks camera/scenarios, resize/focus/pause/storage, replay and runtime errors. Recorded input replays through the same fixed-step physics; incompatible build/track/physics versions are rejected. `node tools/lap-run.mjs` drives a whole lap through actual keyboard events.

Review browsers stay hidden/headless; do not open external reference videos or visible browser windows, or create new video recordings. Timings from these sessions cannot establish sustained foreground desktop performance. Physical mobile/gamepad and independent audio listening remain unverified. Temporary screenshot sequences and raw reports stay in git-ignored `.experiments/`; concise findings remain in documentation.

Source generators are editable assets; the original generated cloud-only sky lives in public/assets/sky/ with prompt/provenance in docs/SKY_ASSET.md. No Blender exports or remote assets are needed. Third-party licence notices are in `docs/licenses/` and dependency packages. The build is approximately 238KB gzip plus the 1.5MB PNG sky; procedural geometry/textures allocate at boot. Rendering is warmed before the ready signal.

## Code hygiene

`npm run lint:fix` formats the complete source tree and fixes ESLint issues; `npm run lint` verifies ESLint with zero warnings plus Prettier. As in Echo, the package `prepare` script installs Husky during `npm install`, and `.husky/pre-commit` invokes lint-staged for staged VECTOR//NOVA files. Run `npm run prepare` to reinstall the hook manually. This configuration assumes the app lives under `games/vector-nova` in the tech9 repository. There are no custom hook installation or routing scripts. Review captures/raw profiles go in `.experiments/` and are ignored, as are historical evidence folders.
