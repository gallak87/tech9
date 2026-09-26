# Trail Driving

Three off-road vehicles in a 600 × 600 metre forest park. Choose a Ridge Jeep, Scout ATV or Summit Bike, explore freely, or follow directional gates on Fernwood Loop, Granite Switchbacks and Skyline Run. Earn vehicle-specific medals and improve all nine personal records.

## Launch

From the repository root, with a supported Node runtime:

```sh
./_tech9/run --prefix games/trail-driving ci
./_tech9/run --prefix games/trail-driving run dev
```

Open <http://127.0.0.1:4480>. Production preview uses `npm run build` then `npm run preview` in this package, on port 4481. Browser verification uses a free strict port selected with `SCENE_PORT=4482`.

## Drive

| Input            | Action                                               |
| ---------------- | ---------------------------------------------------- |
| W / Up           | Throttle                                             |
| S / Down         | Brake, then reverse (bike has a slow backing assist) |
| A D / Left Right | Steer                                                |
| Space            | Brake                                                |
| C                | Chase / driver camera                                |
| R                | Grounded recovery; +5 seconds in a trial             |
| T                | Restart the current drive                            |
| Escape / P       | Pause; choose Resume to continue                     |

Pass the highlighted gate in the indicated direction, then continue to the next. A missed gate must be revisited; recovery preserves earned progress and does not award skipped gates. The last valid gate finishes the route. Results offer retry, another vehicle or garage. Free drive has no clock or penalty. Focus loss and menus clear held driving controls.

Records persist per vehicle and route under `trail-driving.records.v1`. Settings include graphics quality, volume and mute. Resetting records requires two explicit button presses in Settings. Storage failures leave the current session usable. Audio begins after starting a drive.

## Source and ownership

- `src/park/parkData.js`: authored trails, triangular terrain height, surfaces and solid placements shared by queries and rendering.
- `src/park/ParkWorld.js`: terrain, forest instances, trailhead and route signage.
- `src/driving/`: renderer-independent motion and input lifecycle.
- `src/vehicles/`: editable procedural vehicle models, articulated contacts/riders, bounded dust and synthesized audio.
- `src/game/`: ordered trial rules, records, cameras and UI.
- `src/core/`: copied baseline renderer and layer lifecycle.

The game owns its source copies and content. `tech9.json` and `GAME_PLAN.json` are immutable fork receipts. Forest meshes, source Blender assets and texture licensing remain in `art/` and `public/assets/ASSETS.md`; procedural vehicle asset sources are documented in `art/VEHICLES.md`.

## Checks

```sh
npm test
npm run lint
npm run build
SCENE_PORT=4482 npm run verify
SCENE_PORT=4482 npm run verify:handling
SCENE_PORT=4482 npm run verify:routes
```

`verify` checks real keyboard movement, braking, camera changes, pause/focus, recovery, gate rejection, restart, repeated vehicle switching, responsive menus and graphics controls. `verify:handling` exercises each vehicle against solid obstacles, reverse, rough ground, jumps and recovery, plus hidden-tab audio and denied storage. `verify:routes` completes nine runs at normal simulation speed through Playwright keyboard input and verifies records after reload. Its feedback driver reads snapshots but never writes position, time or progression. Run it alone: browser/GPU measurements are serialized.

Development observations and rare-state setup require `?test=1`. Production exposes no test hooks. Ignored `.artifacts/` contains local screenshots and verification reports. Performance is measured at 1600 × 1000 Balanced with browser/GPU/frame timings reported; it is not a guarantee across hardware.

## Simulation limits

Handling is forgiving arcade vehicle motion, with assisted bike balance and automatic gearing. Solid scenery uses conservative horizontal collision proxies, including while airborne. Suspension follows sampled terrain contacts; it is not a rigid-body drivetrain. Input is keyboard-focused. The landscape and routes are bounded, authored single-player content.
