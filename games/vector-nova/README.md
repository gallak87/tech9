# VECTOR//NOVA

A browser anti-gravity racer built with Three.js and Vite. Choose Kestrel, Shrike, Bastion or Needle and drive six distinct circuits with banked roads, inversions and real jumps. Halcyon, Orbital, Vesper, Glasswake and Cindercoil offer two-lap racing against three rivals; every circuit offers solo practice, manual boost, airbraking, ship inspection and circuit review.

## Circuits and features

Choose your ship in the paddock, or inspect the player fleet and AI racers. Choose a circuit in the dropdown and press **Load**, then launch racing or solo practice. During a session, pause and return to the paddock to switch circuits.

| Circuit          | Identity                                                                                   | Availability         |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| Halcyon Speedway | 5 km metropolitan expressway with a skyline corkscrew, inverted hold and plunge            | Default route `/`    |
| Asterion Orbital | 4.5 km shipyard above a planet, open lattice spans, neon decks and tall containment frames | `/?level=orbital`    |
| Nacre Tempest    | Ocean/storm world, submerged racing and two airborne jumps                                 | `/?level=nacre`      |
| Vesper Canopy    | Colossal hollow trees, amber resin, crown jumps and sap lines                              | `/?level=vesper`     |
| Glasswake Comet  | Transparent ice, paired fracture jumps, a crevice corkscrew and collapsing shelves         | `/?level=glasswake`  |
| Cindercoil       | Ceramic volcanic circuit, warned lava surges, a furnace corkscrew and vent flight          | `/?level=cindercoil` |

All six circuits share automatic Vector boost strips and Aegis shields, with circuit-owned placements. Vector gives an immediate catapult kick and drives toward 600 km/h during a full strip pass, with strong radial motion blur unless reduced motion is enabled. Leaving early retains only the speed already gained; Aegis protects reserve from impacts for six seconds. **Enter Proving Loop** starts a two-lap session against Rook, Latch and Mule from a 2×2 grid after audible start lights; **Practice Lap** starts solo. Easy uses the baseline rival pace, Medium is faster, and Hard is faster again with more boosting as you boost. Each rival uses its own vehicle physics, reserve and device eligibility. After two laps placements and lap/total times are recorded while driving continues. Escape returns to the paddock with the last roster beside the desktop menu or below the controls on compact screens; unfinished rivals remain in progress and invalid laps are marked untimed.

Orbital's bare route review is available at `/?level=orbital&review=shape`. Shape review provides 3D/top/profile overviews. The shared paddock offers full-circuit Practice Lap and ship inspection. Nacre adds storm swells, underwater immersion, two real jumps and one enormous swimming leviathan. Its automatic missed-jump recovery keeps the lap valid while counting the recovery delay; manual R recovery still invalidates it.

Glasswake Comet combines clear crystal deck panes, low-grip frost, paired fracture jumps and a deep crevice with a full corkscrew. The opening ice sheet breaks once per session; the later shelf collapses at the second jump. Exterior snow and blizzard haze give way to sheltered caverns. Shape review uses `/?level=glasswake&review=shape`.

Cindercoil adds two warned surges with a protected lane and a permanent broad diagonal crater spill across Curtain Reach. Cross the flow briefly instead of following it; lava contact costs speed and reserve. The route retains its full rising roll and physical vent gap. Eruption timing changes takeoff lift; supported barrier landings bounce inward, and missed transfers recover with their delay counted. Its caldera rupture and local ash/heat presentation follow simulation time. Shape review uses `/?level=cindercoil&review=shape`.

Other circuits retain solo practice. Time Trial, championships, ship-to-ship collision and larger opponent fields are future work.

During a race, the HUD shows position, lap timing and all four racers in race order with gaps relative to YOU: 0.0s for the player, negative for rivals ahead and positive for rivals behind. Unavailable gaps remain unknown. Rival dots on the minimap match the colored strips beside their names: Rook cyan, Latch violet and Mule yellow; your marker is orange with a white outline. The full timing roster remains in the paddock.

## Run

Node 22.13+ and npm; run from this directory:

```sh
npm ci
npm run dev       # http://127.0.0.1:5179
npm run build
npm run preview   # http://127.0.0.1:5180
npm test
```

WebGL2 is required. Gameplay uses local assets and needs no account or backend. Keep npm optional dependencies enabled for Vite's native package.

## Controls

- W / Up: accelerate. S / Down: brake. A/D or Left/Right: steer.
- Space: airbrake. Shift: manual boost using reserve.
- R: recover at the last checkpoint and invalidate the current timed lap.
- Escape: pause/settings/restart; after a two-lap run, return to paddock. I: inspect the ship. C: alternate camera.
- F: free camera on every circuit; drag to look, WASD move, Q/E down/up at 200 m/s. F/Escape returns.
- Menus: Tab/Shift-Tab, Enter/Space. Small viewports expose pointer controls.
- Prototype gamepad: left stick steering, RT throttle, LT brake, A boost, B airbrake.

Bend assistance is 0.3; the player steers the remaining turn. Magnetic adhesion follows road pitch/roll and holds a parked craft on slopes. Physical gamepad/mobile use, independent audio listening and foreground frame pacing still need direct verification.

## Development

Levels register through asset-free metadata plus a lazy implementation under `src/levels/<slug>/`. The picker and briefing consume the same metadata; see the [level API](docs/LEVEL_API.md) for factories, camera options and resource ownership. Each circuit owns its model under `src/levels/<slug>/track/`; shared `src/track/` contains reusable geometry/frame helpers.

Package `prepare` installs Husky; the pre-commit hook runs ESLint/Prettier through lint-staged. Routine edits rely on that hook. Manual lint/format scripts are available for explicit whole-repository checks or troubleshooting. Use Node/npm from your configured shell or version manager, meeting the Node requirement above.

`npm run verify` and `npm run verify:orbital` use Chrome/Playwright for short real-input checks. Configure `VN_URL`, `VN_BROWSER_CHANNEL`, `VN_BROWSER_PATH` and `VN_EVIDENCE` as needed; verify the intended build and use a free port when starting a server. Review browsers stay hidden/headless, with temporary output in ignored `.experiments/`.

Read [architecture](ARCHITECTURE.md) for runtime contracts, [art direction](docs/ART_BIBLE.md) for visual principles and the [roadmap](ROADMAP.md) for planned features. Assets have editable sources and [provenance](docs/ASSET_MANIFEST.json); third-party notices remain in [docs/licenses](docs/licenses/). Historical reviews and completed handoffs are available in Git.
