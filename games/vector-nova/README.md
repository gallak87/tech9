# VECTOR//NOVA

A browser anti-gravity racer built with Three.js and Vite. Choose Kestrel, Shrike, Bastion or Needle and drive ten circuits plus a one-way downhill sprint, with banked roads, inversions and real jumps. The ten circuits offer two-lap racing; Shatterline races from summit to basin. Every course offers three physical rivals, solo practice, manual boost, airbraking, ship inspection and route review.

## Courses and features

Choose your ship in the paddock, or inspect the player fleet and AI racers. Choose a course in the dropdown and press **Load**, then launch racing or solo practice. During a session, pause and return to the paddock to switch courses.

| Course            | Identity                                                                                                   | Availability          |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- |
| Halcyon Speedway  | 5 km metropolitan expressway with a skyline corkscrew, inverted hold and plunge                            | Default route `/`     |
| Asterion Orbital  | 4.5 km shipyard above a planet, open lattice spans, neon decks and tall containment frames                 | `/?level=orbital`     |
| Nacre Tempest     | Ocean/storm world, submerged racing and two airborne jumps                                                 | `/?level=nacre`       |
| Vesper Canopy     | Colossal hollow trees, amber resin, crown jumps and sap lines                                              | `/?level=vesper`      |
| Glasswake Comet   | Transparent ice, paired fracture jumps, a crevice corkscrew and collapsing shelves                         | `/?level=glasswake`   |
| Cindercoil        | Ceramic volcanic circuit, warned lava surges, a furnace corkscrew and vent flight                          | `/?level=cindercoil`  |
| Saffron Leviathan | Fossil-desert circuit, skull traversal, vertebral jumps and migrating sand on gold glass                   | `/?level=saffron`     |
| Umbra Fold        | Ruined gravity observatory, tidal countersteering, curved leaps and continuous accretion                   | `/?level=umbra`       |
| Zephyr Basilica   | Floating Gothic archipelago, rose-window nave, waterfall jumps and a full cloud spiral                     | `/?level=zephyr`      |
| Helion Flare      | Solar observatory, flare-lane evasion, furnace passages and sheltered jumps                                | `/?level=helion`      |
| Shatterline       | Ruined mountain mass driver, twelve jumps and three approximately five-second flights in a downhill sprint | `/?level=shatterline` |

All eleven courses share automatic Vector boost strips and Aegis shields, with course-owned placements. Vector gives an immediate catapult kick and drives toward 600 km/h during a full strip pass, with course-tuned radial motion blur unless reduced motion is enabled. Leaving early retains only the speed already gained; Aegis protects reserve from impacts for six seconds. On the ten circuits, **Enter Proving Loop** starts a two-lap session against Rook, Latch and Mule from a 2×2 grid after audible start lights; **Practice Lap** starts solo. Shatterline offers **Start Downhill Sprint** and **Solo Descent**, each covering the complete one-way course. Easy uses the baseline rival pace, Medium is faster, and Hard is faster again with more boosting as you boost. Each rival uses its own vehicle physics, reserve and device eligibility. On circuits, placements and lap/total times are recorded after two laps while driving continues. A completed sprint records its descent time and brakes the craft along the supported runout. Escape returns to the paddock with the last roster beside the desktop menu or below the controls on compact screens; unfinished rivals remain in progress and invalid laps or sprints are marked untimed.

Orbital's bare route review is available at `/?level=orbital&review=shape`. Shape review provides 3D/top/profile overviews. The shared paddock offers full-course solo practice and ship inspection. Nacre adds storm swells, underwater immersion, two real jumps and one enormous swimming leviathan. Its automatic missed-jump recovery keeps the lap valid while counting the recovery delay; manual R recovery still invalidates it.

Glasswake Comet combines clear crystal deck panes, low-grip frost, paired fracture jumps and a deep crevice with a full corkscrew. The opening ice sheet breaks once per session; the later shelf collapses at the second jump. Exterior snow and blizzard haze give way to sheltered caverns. Shape review uses `/?level=glasswake&review=shape`.

Cindercoil adds two warned surges with a protected lane and a permanent broad diagonal crater spill across Curtain Reach. Cross the flow briefly instead of following it; lava contact costs speed and reserve. The route retains its full rising roll and physical vent gap. Eruption timing changes takeoff lift; supported barrier landings bounce inward, and missed transfers recover with their delay counted. Its caldera rupture and local ash/heat presentation follow simulation time. Shape review uses `/?level=cindercoil&review=shape`.

Saffron Leviathan descends through an enormous porous skull, banks along its interior and crosses two broken vertebral gaps. Migrating sand slows the craft; exposed glass retains speed and an optional dune crest offers a skip. A moving ridge, plated burrower and source-linked sandfalls follow the level presentation state beneath lavender daylight. Shape review uses `/?level=saffron&review=shape`.

Umbra Fold adds declared tidal pulls, two curved airborne crossings, stacked decks, an inverted vault and a grounded descending fold. Intact distant instruments stretch, fragment and spiral into the ring; one enormous instrument follows a complete timed consumption sequence. Shape review uses `/?level=umbra&review=shape`. Automatic missed-jump recovery retains lap validity and counts its delay. The six automatic devices sit on supported ordinary or recovery shelves; the two flight corridors have no pickups.

Helion Flare adds moving fire lanes, three mandatory furnace passages, physical shield cover and cooling strips. Heat reduces thrust above the declared threshold, recovering within one second after fire contact; smoke and a red viewport pulse fade over five seconds. Two optional driver-left jumps retain a supported main lane, and the banked sunshield wall leads into a braking shelf. The separate star and two timed prominences sit against the selected burgundy space panorama. Shape review uses `/?level=helion&review=shape`.

Zephyr Basilica crosses a floating Gothic archipelago on woven graphite and bronze bridges. Pass through a shattered rose window, bank along the dark nave, cross two physical waterfall jumps, then climb a full spiral around the Cloudspire needle toward the broken halo. Water contact leaves draining visor beads, a wet ship sheen and local spray. The falling belfry and its trailing water follow simulation time. Shape review uses `/?level=zephyr&review=shape`.

Time Trial, championships, ship-to-ship collision and larger opponent fields are future work.

Shatterline follows a 21.1 km sprint through fractured accelerator crowns, descending approximately 6.58 km to a basin receiving installation. Its 50 m roadway plunges through Summit Chute, a double Service Corkscrew and Overturn Weave’s two transparent 70 m tubes with opposing bends and an exposed diving corkscrew, entering on the ceiling with freely drivable walls and floor, then carries two gaps around Avalanche Sweep before folding beneath an earlier road in Scissor Dive. A longer offset transfer and steep exit dive vary the late-course rhythm. Roadways and receiving decks keep descending between them. Its twelve real gaps include The Severance, The Crown Shot and Horizon Transfer, each with approximately five seconds of ballistic flight. Long receiving decks reconnect to supported racing reaches. Ordered checkpoints and physical jump transfers determine the single finish; each racer then brakes along the runout while the remaining field continues. The HUD shows course progress and elapsed time, and the minimap marks separate start and finish points. A course-owned pace profile increases each ship’s cruise target by 25% and boost target by 15%, retaining more earned downhill momentum. The four-ship fleet, three rivals, difficulty, Vector/Aegis devices and solo practice use the shared game systems.

Shatterline's flight lab at `/?level=shatterline&test=jump` offers direct approach, launch and landing cases for each long jump, the long downhill sections, Avalanche Sweep, Scissor Dive and its underpass/medium transfer, district starts and the finish. Use `&case=crown-shot-launch`, `&case=horizon-transfer-launch`, `&case=service-corkscrew-approach`, `&case=avalanche-sweep-approach`, `&case=scissor-dive-approach`, `&case=scissor-underpass`, `&case=tube-entry`, `&case=tube-weave`, `&case=tube-1-exit` or `&case=tube-2-exit` to jump directly to those cases, R to repeat and F for the ship-free fly camera. Automatic checkpoint recovery is disabled only in the untimed flight lab. Normal racing retains timed automatic recovery.

During a race, the HUD shows position, lap timing or sprint progress/elapsed time, and all four racers in race order with gaps relative to YOU: 0.0s for the player, negative for rivals ahead and positive for rivals behind. Unavailable gaps remain unknown. Rival dots on the minimap match the colored strips beside their names: Rook cyan, Latch violet and Mule yellow; your marker is orange with a white outline. The full timing roster remains in the paddock.

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
- R: recover at the last checkpoint and mark the current lap or sprint untimed; after a completed sprint, retry the descent.
- Escape: pause/settings/restart; after a completed two-lap race or sprint, return to paddock. I: inspect the ship. C: alternate camera.
- F or Free Camera in the paddock/pause menu: explore every course with all ships hidden and the session frozen; drag to look, WASD/arrows move, Q/E down/up at a fixed 200 m/s. F/Escape returns.
- Menus: Tab/Shift-Tab, Enter/Space. Small viewports expose pointer controls.
- Tunes: M plays/pauses music, comma/period select songs, and / expands/collapses the player. Music starts when you launch racing or practice; repeat defaults off.
- Prototype gamepad: left stick steering, RT throttle, LT brake, A boost, B airbrake.

Bend assistance is 0.3; the player steers the remaining turn. Magnetic adhesion follows road pitch/roll and holds a parked craft on slopes. Physical gamepad/mobile use, independent audio listening and foreground frame pacing still need direct verification.

## Development

Levels register through asset-free metadata plus a lazy implementation under `src/levels/<slug>/`. The picker and briefing consume the same metadata; see the [level API](docs/LEVEL_API.md) for factories, camera options and resource ownership. Each course owns its model under `src/levels/<slug>/track/`; shared `src/track/` contains reusable geometry/frame helpers.

Package `prepare` installs Husky; the pre-commit hook runs ESLint/Prettier through lint-staged. Routine edits rely on that hook. Manual lint/format scripts are available for explicit whole-repository checks or troubleshooting. Use Node/npm from your configured shell or version manager, meeting the Node requirement above.

`npm run verify` and `npm run verify:orbital` use Chrome/Playwright for short real-input checks. Configure `VN_URL`, `VN_BROWSER_CHANNEL`, `VN_BROWSER_PATH` and `VN_EVIDENCE` as needed; verify the intended build and use a free port when starting a server. Review browsers stay hidden/headless, with temporary output in ignored `.experiments/`.

Read [architecture](ARCHITECTURE.md) for runtime contracts, [art direction](docs/ART_BIBLE.md) for visual principles, [audio generation](docs/audio/README.md) for the local music workflow and the [roadmap](ROADMAP.md) for planned features. Assets have editable sources and [provenance](docs/ASSET_MANIFEST.json); third-party notices remain in [docs/licenses](docs/licenses/). Historical reviews and completed handoffs are available in Git.
