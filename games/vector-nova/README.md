# VECTOR//NOVA

Standalone browser anti-gravity racer, **Gates 1 and 2 human-approved; orbital shape approved, Gate 3 candidate ready for human playtest**. One original Kestrel, the preserved Halcyon Viaduct first level and the Asterion Orbital candidate. Built independently with Three.js/Vite; neither tech9 framework is imported or required.

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
npm run verify:orbital
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

The Gate 2 circuit is now 5 km, down from 7.2 km. The opening introduces a gentle rise and bank, followed by an early descent, skyline climb, complete 360° corkscrew with an inverted hold, a banked upper connector, steep plunge and a shorter undulating canal return. The major features are spread across the lap, with recovery space between them. Start from the real title screen; practice laps repeat indefinitely.

Automatic bend assistance is now 0.3 instead of 1.0. The craft follows 30% of the road's yaw automatically and you steer the remaining turn. Pitch and roll remain magnetically attached to the surface, including upside down. Steering follows the visible driver-left/right directions; stationary magnetic hold prevents rest drift on grades and banks. This is a surface-constrained handling model; free-flight jumps remain deferred.

## Asterion Orbital — Gate 3 human playtest

Open **[Asterion Orbital](http://127.0.0.1:5180/?level=orbital)** after `npm run build` and `npm run preview`. The human-approved 4.5 km route is finished as a sunlit shipyard above a planet. Use **Enter orbital circuit** for a full practice lap. **Circuit views** offers 3D/top/profile views and parked section starts; it collapses while driving. The real Kestrel inspection remains available.

The authorized production and independent critic loop completed six rounds. Final formal scores are 9 for art, lighting, handling, track and visible feedback; UI is 8.5 after the final critic caught portrait inspection framing, now repaired and verified by the integrator without inventing another score. Performance retains 8.5 with foreground, listening and physical-device evidence unverified. This is a playable human-review candidate, not a certified all-category pass. See [critique](docs/GATE3_CRITIQUE.md) and [status](docs/STATUS.json). Industrial is tabled; broader racing systems await explicit Gate 3 approval.

[Halcyon](http://127.0.0.1:5180/) remains at the plain URL. The [approved orbital bare shape](http://127.0.0.1:5180/?level=orbital&review=shape) is preserved for comparison. Gate 2's four historical critic rounds did not certify all-category 9/10; human approval does not rewrite those scores or certify foreground performance. See [roadmap](ROADMAP.md), [handoff](docs/GATE3_HANDOFF.md), [architecture](ARCHITECTURE.md), [art bible](docs/ART_BIBLE.md) and [historical critic](docs/GATE2_CRITIQUE.md).

## Verification

`npm test` checks steering projection, rest/gravity forces, brake/boost behavior, collision bounds, checkpoint order, recovery invalidation, seam/frame continuity, crossing clearance and route showcases. The browser harness drives real keys and checks camera/scenarios, resize/focus/pause/storage, replay and runtime errors. Recorded input replays through the same fixed-step physics; incompatible build/track/physics versions are rejected. `node tools/lap-run.mjs` drives a whole lap through actual keyboard events.

Review browsers stay hidden/headless; do not open external reference videos or visible browser windows, or create new video recordings. Timings from these sessions cannot establish sustained foreground desktop performance. Physical mobile/gamepad and independent audio listening remain unverified. Temporary screenshot sequences and raw reports stay in git-ignored `.experiments/`; concise findings remain in documentation.

Source generators are editable assets. Halcyon’s original generated cloud-only sky is documented in `docs/SKY_ASSET.md`. Orbital terrain and separate cloud-density material maps are documented with exact imagegen prompts in `src/renderer/orbital/asset-provenance.json`. The orbital runtime maps total 16.00MB; the main script is about 248KB gzip, with additional lazy circuit modules. No Blender exports or remote assets are needed. Third-party licence notices are in `docs/licenses/` and dependency packages. Geometry and textures allocate at boot; rendering is warmed before the ready signal.

## Code hygiene

`npm run lint:fix` formats the complete source tree and fixes ESLint issues; `npm run lint` verifies ESLint with zero warnings plus Prettier. As in Echo, the package `prepare` script installs Husky during `npm install`, and `.husky/pre-commit` invokes lint-staged for staged VECTOR//NOVA files. Run `npm run prepare` to reinstall the hook manually. This configuration assumes the app lives under `games/vector-nova` in the tech9 repository. There are no custom hook installation or routing scripts. Review captures/raw profiles go in `.experiments/` and are ignored, as are historical evidence folders.
