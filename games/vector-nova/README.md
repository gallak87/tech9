# VECTOR//NOVA

A browser anti-gravity racer built with Three.js and Vite. Drive the Blender-authored Kestrel through distinct circuits with banked roads, inversions and steep drops. The current game offers repeatable practice laps, boost, airbraking, ship inspection and circuit review views.

## Circuits and features

Choose a circuit in the paddock dropdown and press **Load**, then enter its practice loop. During a session, pause and return to the paddock to switch circuits.

| Circuit          | Identity                                                                                   | Availability      |
| ---------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Halcyon Viaduct  | 5 km metropolitan expressway with a skyline corkscrew, inverted hold and plunge            | Default route `/` |
| Asterion Orbital | 4.5 km shipyard above a planet, open lattice spans, neon decks and tall containment frames | `/?level=orbital` |
| Nacre Tempest    | Ocean/storm world, submerged racing and two airborne jumps                                 | `/?level=nacre`   |

Halcyon's automatic Vector boost strips and Aegis shields are available with `/?features=halcyon-pickups`. They activate on crossing, with no inventory or use-item button. The plain route retains the baseline handling.

Orbital's bare route review is available at `/?level=orbital&review=shape`. Circuit views provide 3D/top/profile overviews and parked section starts. Nacre adds storm swells, underwater immersion, two real jumps and one enormous swimming leviathan. Its automatic missed-jump recovery keeps the lap valid while counting the recovery delay; manual R recovery still invalidates it.

Seven additional worlds are planned in the [roadmap](ROADMAP.md). Opponents, complete race/results flow, Time Trial and championships are future work.

## Run

Node 22.13+ and npm; run from this directory:

```sh
npm ci
npm run dev       # http://127.0.0.1:5179
npm run build
npm run preview   # http://127.0.0.1:5180
npm test
npm run lint
```

WebGL2 is required. Gameplay uses local assets and needs no account or backend. Keep npm optional dependencies enabled for Vite's native package.

## Controls

- W / Up: accelerate. S / Down: brake. A/D or Left/Right: steer.
- Space: airbrake. Shift: manual boost using reserve.
- R: recover at the last checkpoint and invalidate the current timed lap.
- Escape: pause/settings/restart. I: inspect the ship. C: alternate camera.
- Menus: Tab/Shift-Tab, Enter/Space. Small viewports expose pointer controls.
- Prototype gamepad: left stick steering, RT throttle, LT brake, A boost, B airbrake.

Bend assistance is 0.3; the player steers the remaining turn. Magnetic adhesion follows road pitch/roll and holds a parked craft on slopes. Physical gamepad/mobile use, independent audio listening and foreground frame pacing still need direct verification.

## Development

Levels register through asset-free metadata plus a lazy implementation under `src/levels/<slug>/`. The picker and briefing consume the same metadata; see the [level API](docs/EXPANSION_LEVEL_CONTRACT.md) for factories, camera options and resource ownership. Existing circuit models remain in `src/track/`.

`npm run lint:fix` runs the existing formatting/lint tools. Package `prepare` installs Husky; pre-commit uses lint-staged. No custom installation scripts are needed.

`npm run verify` and `npm run verify:orbital` use Chrome/Playwright for short real-input checks. Configure `VN_URL`, `VN_BROWSER_CHANNEL`, `VN_BROWSER_PATH` and `VN_EVIDENCE` as needed; coordinate existing servers before running. Review browsers stay hidden/headless, with temporary output in ignored `.experiments/`.

Read [architecture](ARCHITECTURE.md) for runtime contracts, [art direction](docs/ART_BIBLE.md) for visual principles, and [current status](docs/STATUS.json) for active work. Assets have editable sources and [provenance](docs/ASSET_MANIFEST.json); third-party notices remain in [docs/licenses](docs/licenses/). Historical reviews and completed handoffs are available in Git.
