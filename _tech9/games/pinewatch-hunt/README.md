# Pinewatch Hunt

A small first-person bow hunt in a quiet pine forest. Follow hoofprints north, approach one wary buck, take a clear shot and walk over to retrieve it. Includes start, pause, success, escape, empty-quiver failure and immediate retry.

Use Node **22.13+ in the 22.x line, or 24+**. From this game directory:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4430. Production: `npm run build`, then `npm run preview` on port 4431. Assets are local. No accounts or external runtime requests. Desktop keyboard/mouse required; touch gameplay is not implemented.

| Action           | Control                                                       |
| ---------------- | ------------------------------------------------------------- |
| Walk             | WASD                                                          |
| Look             | Mouse (captured after Enter the forest), or arrow keys        |
| Quiet approach   | Hold Shift                                                    |
| Aim              | Hold right mouse or Q                                         |
| Draw and shoot   | While aiming, hold left mouse or Space; release to shoot      |
| Retrieve         | E within 3 m of the deer                                      |
| Pause            | Escape or P; leaving pointer lock or losing focus also pauses |
| Resume / restart | On-screen buttons                                             |
| Quality          | Pause menu: Balanced, High, Ultra                             |

Follow the split hoofprints along the dirt trail. Walk normally until the deer is about 23 m away, then hold Shift. Alertness grows with nearby movement and close proximity; stand still at a safe distance to let it fall. At full alert the deer flees and the hunt ends. Aim at the body within 26 m, hold the draw until full and release. Three arrows are available. A hit starts retrieval; it does not award success until you walk to the animal and press E. Presentation is non-graphic.

The opening and pause screens repeat the controls. Keyboard look/aim/draw is a full alternative if browser pointer capture is unavailable. This pilot intentionally has no sound.

```sh
npm test
npm run lint
SCENE_PORT=4432 npm run verify
npm run capture -- --out .artifacts/intro.png
```

The browser harness drives real keyboard and mouse input to complete the hunt and exercise misses, escape, pause, retry and collision. `?test=1` enables read-only observations; there are no teleport or award-hit hooks. Verification writes ignored evidence to `.artifacts/verification`. Run records and independent review live in `../../runs/pinewatch-hunt`.

The game owns its forest source fork, preserves the immutable `tech9.json` / `GAME_PLAN.json` provenance and all original forest assets/licenses, and imports nothing at runtime from the framework. New procedural model provenance is in `public/game/ASSETS.md`.

Known limits: one authored animal/route, simple detection, conservative tree/rock collision circles, no simulated ballistics or ecosystem, no touch support or audio. Ground cover and small saplings are passable. The starter forest is a working art foundation, not finished AAA art. Performance and final independent art scores are recorded in the run's execution report; a visual score is separate from gameplay correctness. A practiced route is shorter than the brief's three-to-five-minute exploratory target.
