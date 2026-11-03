# VECTOR//NOVA

An anti-gravity racer built with Three.js and Vite, playable in the browser or as an offline Electron demo/full game.

## Current game

The full game on `main` includes:

- Fourteen courses, including three downhill sprints; four player ships and nine physical AI rivals.
- Quick Race, four saved championships, Time Trial and Practice. Time Trials use stock ships, manual boost and local standing/flying records with personal ghosts.
- Twenty-eight career rewards: permanent enhancements, ship unlocks, six equipped abilities and Quad Core. Road devices add automatic boost, shields and combat during races and practice.
- A manual Start screen, three named career slots, dedicated Race/Garage pages, save export/import, shared Settings and a persistent Tunes player.

Start, choose or create a career, then configure a session. Browsing courses and ships does not load a world. Escape pauses a race; returning to setup retains it until you resume or start another run. The full game starts with Shrike; the demo starts with Kestrel. Demo progress can be transferred manually through career save export/import.

Blue Hour is the startup track. Pausing music on the startup screens is remembered; starting a race respects that choice. Master, gameplay effects and Tunes have separate synchronized volume controls.

Eliminator, Interceptor and Freestyle work exists in separate review branches. It is not part of this `main` build; see the [roadmap](ROADMAP.md) for integration and remaining work.

This development branch also includes the playable [Ravel solar-sail circuit](docs/levels/ravel.md): a 13.5 km closed circuit with moving sail waves, three interwoven routes and a giant transfer. Development previews support direct section practice, free-camera inspection and art review.

## Run and check

Use Node 22.13+ and npm from this directory. WebGL2 is required; gameplay uses local assets and needs no account or backend. Keep npm optional dependencies enabled for Vite's native package.

```sh
npm ci
npm run dev       # http://127.0.0.1:5179
npm run build
npm run preview   # http://127.0.0.1:5180
npm test
```

`VN_URL=<server-url> npm run verify` runs the maintained hidden-browser player-flow check. Use `-- --desktop` during iteration and `-- --responsive` for the final production UI pass. Browser selection, scoped career checks and level-specific coverage are documented in [tools/README.md](tools/README.md). Follow the task-specific viewport restrictions in [AGENTS.md](AGENTS.md).

The pre-commit hook runs ESLint/Prettier through lint-staged. Whole-project lint/format commands are available for explicit checks; routine edits use the hook.

## Controls

| Input                                  | Action                                             |
| -------------------------------------- | -------------------------------------------------- |
| WASD / arrow keys                      | Accelerate, brake and steer                        |
| Shift / Space                          | Manual boost / airbrake                            |
| Q / E / Z / X                          | Equipped slots 1–4; slots 3–4 require Quad Core    |
| C                                      | Alternate race camera                              |
| R                                      | Manual recovery; invalidates the current timed run |
| Escape                                 | Pause/back; resume through the pause menu          |
| Tab / Shift-Tab, arrows, Enter / Space | Menu navigation and activation                     |
| M, comma / period, slash               | Music play/pause, previous/next, expand/collapse   |

Controllers use left-stick steering, right-stick click for camera, X/Y for equipment slots 1/2, D-pad left/right for slots 3/4, Menu/Start to pause and View/Select for music. In menus, D-pad/stick navigates, A confirms and B returns; Y opens career rename where available.

Settings provides Classic (RT/LT/A/B), Shoulders (RT/LT/RB/LB) and Arcade (A/LT/RT/B) presets for accelerate/brake/boost/airbrake, plus a saved steering dead zone and live input display. Labels refer to standard controller positions. Shared steering assistance remains 0.3.

On touch screens, the left pad steers and pulling down airbrakes; the right control selects boost/throttle/neutral/brake. Equipment uses its HUD buttons. Release, pause and focus changes clear held input.

## Desktop builds and documentation

`npm run package:demo` and `npm run package:full` create separate offline applications. The demo includes Kestrel, Halcyon, Nacre and a two-race Demo Cup; release builds exclude developer tools. See [desktop build commands](docs/steam/desktop.md) and the [Steam release plan](docs/steam/release.md) for platform scope, packaging and launch decisions.

- [Roadmap](ROADMAP.md): open work, integration and deferred ideas.
- [Event and reward design](docs/level-types-and-rewards.md): mechanics, sidegrades and unresolved choices.
- [Startup and careers](docs/intro-and-profiles.md): UI, names, isolated saves and global settings.
- [Architecture](ARCHITECTURE.md) and [level API](docs/LEVEL_API.md): current runtime contracts and ownership.
- [Art direction](docs/ART_BIBLE.md), [latest art scores](docs/ART_SCORES.json) and [road finish workflow](docs/expansion/roads/README.md): visual constraints, latest map scores and current material references.
- [Audio workflow](docs/audio/README.md): local generation, audition and provenance.
- [Verification tools](tools/README.md): supported checks and their limits.
- [Asset manifest](docs/ASSET_MANIFEST.json), [licences](docs/licenses/) and [ship source workflow](assets/ships/README.md): retained sources, rights and export instructions.

Physical-device/controller acceptance and representative performance measurements remain open release work. Historical implementation proposals and completed handoffs are available in Git.
