# Trail Driving

A complete single-player off-road driving game with a Jeep, an ATV and a dirt bike. Choose a vehicle at a trailhead garage, learn its handling in free drive, then earn medals on three routes through a coherent forest-and-ridge landscape. The pleasure comes from reading the terrain, feeling the vehicle respond and improving a run.

Game slug: `trail-driving`. This folder contains the launch brief and prompt. Follow [GENERATE.md](../../GENERATE.md) to move the packet into the run directory before creating the game package.

## Player experience

- All three vehicles are selectable from the start. The garage shows a useful handling summary, vehicle preview, route selection and best results.
- One authored area, roughly 600 × 600 metres, with a trailhead, connected trails, elevation changes, switchbacks, rocky sections, loose ground and small jumps. Size it for driving speeds and readable sightlines. Landmarks, route signage and a compact map keep navigation clear.
- Three routes: a technical rocky climb, a flowing woodland circuit and an open ridge run with controlled jumps. Each takes roughly 60–150 seconds and supports all three vehicles, with medal times tuned per vehicle and route.
- Free drive allows exploration and practice. A timed run follows ordered directional gates, finishes at a clear line and shows time, penalties, medal and personal best. Results offer retry, another vehicle or return to the garage.
- Best times and medals persist locally per vehicle/route. A clear progress display gives the player a reason to finish all nine combinations; saved results survive reloads and can be reset deliberately.
- Start, pause/resume, vehicle selection, free drive, timed run, finish and recovery are complete usable states. Explain controls at the point of use and keep the current objective visible.

## Three distinct vehicles

| Vehicle   | Driving character                                                                                              | Visible response                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Jeep      | Heavy four-wheel traction, strong low-speed climbing, wider turns, deliberate braking and body weight transfer | Recognizable off-road body, working steering/wheel rotation, suspension travel, body pitch and roll, seated driver |
| ATV       | Compact and agile, tighter turns, quicker weight transfer and a livelier response over bumps                   | Four independent wheel contacts, handlebar steering, exposed suspension, rider posture and weight shift            |
| Dirt bike | Light and narrow, momentum through turns, assisted balance, meaningful lean and controlled jump landings       | Two wheel contacts, fork compression, wheel rotation, steering, bike/rider lean and seated/standing posture        |

Tune acceleration, top speed, braking, grip, steering response, dimensions and suspension separately. The player should recognize the selected vehicle from its movement as well as its model. Favor forgiving, convincing arcade handling with automatic gearing and assisted bike balance.

Terrain contact must drive vehicle height, pitch/roll and suspension. Surface grip should distinguish firm trail, loose gravel and rough ground. Airborne motion and landing must reconnect cleanly with the terrain. Use a simulation approach appropriate to those needs; keep the model comprehensible and bounded.

Use shared authored data for rendered terrain/obstacles and their driving queries. Substantial trees, rocks, barriers and map edges block vehicles. A grounded recovery returns a stuck or overturned vehicle to a valid recent location, clears motion/input and adds a visible time penalty during trials. Recovery must preserve legitimate route progress without awarding skipped gates.

## Controls and cameras

Teach keyboard throttle, steering and braking consistently across vehicles. Provide reverse maneuvering for the Jeep and ATV, and a forgiving low-speed back-up/recovery action for the bike. Include pause, camera switch, recovery and restart actions. Menu focus and lost window focus must clear held driving input.

Every vehicle has a readable chase camera and a driver view: the Jeep's cabin and the ATV/bike handlebars. Chase views anticipate turns and accommodate hills without entering terrain or nearby solid scenery. Driver views have useful sightlines, visible steering response and restrained movement. Switching cameras must preserve the run and avoid abrupt invalid poses.

## Presentation

Author a cohesive outdoor driving park with convincing scale, material variation, useful shadows and clear route contrast. Give each vehicle a finished silhouette and recognizable mechanical detail. Wheels contact the ground, suspension responds to bumps, and riders stay attached through steering, leaning, jumps and recovery.

Surface-sensitive dust, tire feedback and local engine/braking/landing audio communicate what the simulation is doing. Provide volume/mute controls and start audio through player interaction. Keep effects bounded and driven by vehicle state. Include useful graphics settings and readable menus/HUD at narrow browser sizes.

Preserve editable models, asset-generation source and required licenses. The delivery is a focused driving game: depth comes from the three vehicles, terrain, routes, presentation and replayable records.

## Delivery milestones

1. **Complete first loop:** Jeep selection → route → finish → result → retry, including terrain contact, collisions, camera, pause and recovery.
2. **Complete vehicle roster:** ATV and bike handling, animated models/riders, both camera modes and consistent state transitions.
3. **Complete game:** three routes, free drive, vehicle-specific medals, persistent records, audio/effects and finished presentation.
4. **Acceptance:** game checks, real-input playthroughs, independent engineering review and the bounded art review.
5. **Framework-dev:** extract the proven reusable driving work and finish its module handoff.

## Acceptance

Exercise each vehicle through real driving input: acceleration, turning, braking, hills, rough ground, obstacles, jumps/landings and recovery. Complete all nine vehicle/route combinations at normal simulation speed at least once, including result and retry. Tune medals from playable runs.

Verify missed, reversed and out-of-order gates; finish eligibility; recovery penalties; clean restarts; switching vehicles; camera changes; pause/focus loss while accelerating; and persistent records after reload. Test hooks may observe state and arrange targeted edge cases; completed-run evidence must come from real input. Check that repeated switching/restarting releases owned resources.

Run the game's relevant unit, lint, build and browser checks. Target 60 observed FPS at 1600 × 1000 on Balanced, reporting browser, GPU, frame timings and measurement limits. Review a committed build with an independent demanding art critic, stopping at **8/10 or four rounds**, whichever comes first. Resolve correctness blockers and report the actual visual result at the cap.

## Framework-dev handoff

After accepting the game, follow [FRAMEWORK_DEV.md](../../FRAMEWORK_DEV.md). Extract the reusable driving simulation, input lifecycle, terrain/contact interfaces and vehicle configuration that the three vehicles actually share. Bring back useful camera improvements and reusable presentation helpers where they have a concrete interface. Choose module boundaries from the implementation; use descriptive names such as `vehicle-motion` or `vehicle-input` when appropriate.

Keep route layouts, medals, progression and game presentation owned by the game. Modules include focused tests, concise usage examples and required assets/licenses; register their versions in `modules.json` and run the framework checks. Finish with a brief handoff covering game launch/controls, validation, module integration and material limitations.

## Workspace

Use the session's assigned worktree containing this packet and the current framework. Game work lives in `_tech9/games/trail-driving/`; local coordination and captures live in `_tech9/runs/trail-driving/` or the game's `.artifacts/`. The subsequent framework-dev phase owns the relevant modules, registry, guides and tooling changes required by the extraction.

Preferred strict ports: development `4480`, preview `4481`, browser verification `4482`. Check availability and record replacements. Serialize browser/GPU captures and stop task-owned servers at handoff.
