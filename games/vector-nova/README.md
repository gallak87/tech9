# VECTOR//NOVA

A browser anti-gravity racer built with Three.js and Vite. Choose Kestrel, Shrike, Bastion or Needle for circuit racing, solo practice or Shatterline’s one-way downhill sprint. Courses offer physical rivals, manual boost, airbraking, ship inspection and route review.

## Courses and features

The landing screen is race setup: browse circuit cards, choose Quick Race or Practice and difficulty, select a ship, then Start. Wide screens show everything together; narrow screens use Circuit/session and Ship accordion rows. Hover or arrow keys preview; click or Enter commits. During a session, Escape pauses; Circuits keeps that run loaded, and Resume returns to it.

| Course            | Identity                                                                                                   | Availability            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| Halcyon Speedway  | 5 km metropolitan expressway with a skyline corkscrew, inverted hold and plunge                            | Default route `/`       |
| Asterion Orbital  | 4.5 km shipyard above a planet, open lattice spans, neon decks and tall containment frames                 | `/?level=orbital`       |
| Nacre Tempest     | Ocean/storm world, submerged racing and two airborne jumps                                                 | `/?level=nacre`         |
| Vesper Forest     | Pale giant trees, rooted riverbanks, amber resin, hollow ascent and crown flight                           | `/?level=vesper-forest` |
| Glasswake Comet   | Transparent ice, paired fracture jumps, a crevice corkscrew and collapsing shelves                         | `/?level=glasswake`     |
| Cindercoil        | Ceramic volcanic circuit, warned lava surges, a furnace corkscrew and vent flight                          | `/?level=cindercoil`    |
| Saffron Leviathan | Fossil-desert circuit, skull traversal, vertebral jumps and migrating sand on gold glass                   | `/?level=saffron`       |
| Umbra Fold        | Ruined gravity observatory, tidal countersteering, curved leaps and continuous accretion                   | `/?level=umbra`         |
| Zephyr Basilica   | Floating Gothic archipelago, rose-window nave, waterfall jumps and a full cloud spiral                     | `/?level=zephyr`        |
| Helion Flare      | Solar observatory, flare-lane evasion, furnace passages and sheltered jumps                                | `/?level=helion`        |
| Shatterline       | Ruined mountain mass driver, twelve jumps and three approximately five-second flights in a downhill sprint | `/?level=shatterline`   |

Courses share automatic Vector boost strips and Aegis shields, with course-owned placements. Vector supplies an immediate catapult kick toward 600 km/h during a full strip pass; leaving early retains only the speed gained. Aegis protects reserve from impacts for six seconds. **Quick Race** starts two laps against Rook, Latch and Mule after the countdown; **Practice** starts open solo driving. Shatterline offers **Downhill Sprint** and **Solo Descent**. Difficulty changes rival pace and boosting. Valid finishes produce a brief on-track finish beat, then live track-backed results; invalid runs remain explicitly untimed. Race again, Continue driving and Circuits are available from results. Continue then Escape pauses on track; Circuits retains the session for Resume.

Orbital's bare route review is available at `/?level=orbital&review=shape`. Shape review provides 3D/top/profile overviews. The main setup offers full-course solo practice. Open `/?inspect=1&ship=kestrel&level=halcyon` for silent ship inspection, or press I during a session. Nacre adds storm swells, underwater immersion, two real jumps and one enormous swimming leviathan. Its automatic missed-jump recovery keeps the lap valid while counting the recovery delay; manual R recovery still invalidates it.

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

The Halcyon experiment includes automatic **Repulsor** pads (pink, radial shove after a short charge), **Arc burst** pads (blue, three road-following shots aimed by steering), and **Ion wake** pads (violet, a lingering trail that disrupts followers). Driving across a pad activates it immediately; there is no item inventory or extra action button. Aegis blocks an offensive hit. These devices are available in races and practice and remain disabled in Time Trial.

## Controls

- W / Up: accelerate. S / Down: brake. A/D or Left/Right: steer.
- Space: airbrake. Shift: manual boost using reserve, on the road or in midair.
- R: recover at the last checkpoint and mark the current lap or sprint untimed; after a completed sprint, retry the descent.
- Escape: pause/resume, including after Continue driving. Circuits preserves the loaded session. I: inspect the ship. C: alternate camera.
- F or Free Camera in the developer launcher/pause menu: explore every course with all ships hidden and the session frozen; drag to look, WASD/arrows move, Q/E down/up at a fixed 200 m/s. F/Escape returns.
- Touch: left thumb steers proportionally left/right; pull down on the same pad for airbrake. Right thumb slides through Boost (+ Go), Go, Neutral and Brake. Both controls spring to neutral on release.
- Menus: Tab/Shift-Tab, Enter/Space.
- Tunes: M plays/pauses music, comma/period select songs, and / expands/collapses the player. Start race/practice starts music unless manually paused; ordinary menu clicks and race restarts do not. Explicit Play/M always controls playback. Repeat defaults off.
- Standard controller: left stick steering, X race camera, Menu/Start pause. Settings offers Classic (RT/LT/A/B), Shoulders (RT/LT/RB/LB) and Arcade (A/LT/RT/B) for throttle/brake/boost/airbrake, plus a saved steering dead zone and live test. D-pad/stick navigates menus; A confirms and B returns.

Bend assistance is 0.3; the player steers the remaining turn. Magnetic adhesion follows road pitch/roll and holds a parked craft on slopes. Physical gamepad/mobile use, independent audio listening and foreground frame pacing still need direct verification.

## Desktop / Steam builds

The browser commands above are unchanged. `npm run package:demo` and `npm run package:full` build separate, offline Electron applications for the current platform; add `-- --platform win32 --arch x64` for Windows Steam payloads. The demo contains Kestrel, Halcyon, Nacre and a two-race cup. Both releases omit development tools. See [desktop builds and Steam handoff](docs/steam/desktop.md) for testing, artifacts, controller/window controls, content boundaries and SteamPipe configuration.

## Development

Levels register through asset-free metadata plus a lazy implementation under `src/levels/<slug>/`. The picker and briefing consume the same metadata; see the [level API](docs/LEVEL_API.md) for factories, camera options and resource ownership. Each course owns its model under `src/levels/<slug>/track/`; shared `src/track/` contains reusable geometry/frame helpers.

Package `prepare` installs Husky; the pre-commit hook runs ESLint/Prettier through lint-staged. Routine edits rely on that hook. Manual lint/format scripts are available for explicit whole-repository checks or troubleshooting. Use Node/npm from your configured shell or version manager, meeting the Node requirement above.

`VN_URL=<server-url> npm run verify` checks the current menu/loading/race flow in a hidden browser and writes no artifacts. Use `-- --desktop` during iteration and `-- --responsive` for the final narrow-layout pass. `npm run verify:orbital` runs the generic level contract smoke check for Orbital against the same `VN_URL`; `VN_BROWSER_CHANNEL=chrome` or `VN_BROWSER_PATH` selects its browser. Level checks print results; only an explicit `VN_EVIDENCE=<scratch-folder>` saves their JSON report. Historical harnesses are retained pending migration; see [tools](tools/README.md).

Read [architecture](ARCHITECTURE.md) for runtime contracts, [art direction](docs/ART_BIBLE.md) for visual principles, [audio generation](docs/audio/README.md) for the local music workflow and the [roadmap](ROADMAP.md) for planned features. Assets have editable sources and [provenance](docs/ASSET_MANIFEST.json); third-party notices remain in [docs/licenses](docs/licenses/). Historical reviews and completed handoffs are available in Git.
