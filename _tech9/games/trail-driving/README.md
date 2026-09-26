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

## Recorded acceptance

All nine trials completed through real Playwright keyboard input at normal simulation speed. The feedback driver read observations only; it did not write vehicle position, clocks or progress. Every run crossed every directional gate, finished without collisions, recovery or penalties, and exercised result/retry. All nine records survived a reload.

| Vehicle     | Fernwood Loop   | Granite Switchbacks | Skyline Run     |
| ----------- | --------------- | ------------------- | --------------- |
| Ridge Jeep  | 80.500 s · gold | 102.259 s · gold    | 90.201 s · gold |
| Scout ATV   | 82.351 s · gold | 106.218 s · gold    | 93.533 s · gold |
| Summit Bike | 80.525 s · gold | 104.017 s · silver  | 90.812 s · gold |

These route runs used checkpoint `45f45723`; later changes adjusted visual presentation and medal thresholds without changing route geometry, motion or gate rules. Reported medal categories remain the same. The final generic browser pass used `a0a829b9` and checked all vehicle/camera modes, pause/focus, progression rejection, retry, graphics/audio, responsive menus and bounded model resource replacement. Geometry, texture and program counts were unchanged after repeated vehicle switches. No asset, console, page or WebGL errors occurred.

The 42 CPU tests, lint and production build passed. Separate handling runs verified keyboard collision, braking/reverse, recovery and terrain takeoff followed by grounded landing for all three vehicles. Targeted setup was used for those rare-state checks, not the nine route completions. Hidden-tab engine/tire gains reached zero and boot succeeded when access to local storage threw.

Moving performance observation: Chromium 151.0.7922.34, headless full Chromium, ANGLE Metal on Apple M1 Pro, 1600 × 1000 drawing buffer, Balanced preset, 600 requestAnimationFrame samples over about five seconds: 120.02 observed FPS, 8.332 ms mean interval, 9.4 ms p95. This is a short measured route segment, includes browser scheduling, and is not a worst-case or cross-device performance guarantee.

Independent engineering review found three P2 issues: hidden-tab audio, throwing storage access and missing tall-signpost collision proxies. All were fixed and rechecked, including 39/39 vehicle/signpost probes. No unresolved correctness findings remained in that game review.

The independent art review concluded at **7.6/10** after the four-round cap (6.0 → 7.0 → 7.4 → 7.6), below the 8/10 target. No definite visual correctness blockers remained. The forest and slope treatment remain repetitive, rocky-route identity and distant mountain forms are simple, and riders/materials retain a stylized prototype quality. Animation was assessed through captured takeoff/landing pairs rather than continuous video; those stills do not establish motion continuity.

## Framework handoff

The separate framework-dev phase extracted reusable behavior into canonical modules while leaving this game's local implementation and authored content under game ownership:

- [vehicle-motion](../../modules/vehicle-motion/README.md): configurable arcade vehicle motion, terrain contacts, static collision, jumps and recovery.
- [vehicle-input](../../modules/vehicle-input/README.md): keyboard and focus lifecycle.
- [vehicle-presentation](../../modules/vehicle-presentation/README.md): supplied chassis and wheel transforms, with consumer-owned Three.js resources.
- [follow-camera](../../modules/follow-camera/README.md) 1.1.0: terrain/solid boom resolution applied around camera interpolation.

The immutable fork receipts and the game's copied follow-camera 1.0.1 remain unchanged. Adoption of canonical modules in a future game is explicit; these are source copies rather than runtime framework dependencies.

The final framework check at `76078046` passed **122 tests**, ESLint/formatting, canonical module builds and registry validation (nine total modules). This includes integration checks connecting all three neutral motion presets to wheel presentation and terrain/solid camera clearance. Independent extraction review found a public collision-sweep arithmetic edge case with opposite extremely large finite headings; endpoint normalization and a regression resolved it. Camera arithmetic overflow also fails explicitly. The reviewer rechecked the committed fixes and reported no unresolved findings. The accepted game and its recorded driving behavior are unchanged by these canonical module fixes.
