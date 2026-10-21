# Forest Flight

Two airplanes, a forest airstrip and a short scenic circuit. Fly the steady **Cedar T-1** trainer or the quicker **Swift S-2** sport plane. Both are available immediately. Three optional scenic markers lead around the valley; return to the runway and brake to a stop for your landing result, or keep exploring.

## Run

From the repository root:

```sh
./_tech9/run --prefix games/_pilot/forest-flight ci
./_tech9/run --prefix games/_pilot/forest-flight run dev
```

Open **http://127.0.0.1:4490**. Production preview uses port 4491 after `npm run build`. This standalone package supports Node `^22.13.0 || >=24.0.0`; direct npm commands also work from this directory.

## Fly

| Input      | Action                                                        |
| ---------- | ------------------------------------------------------------- |
| W / S      | Increase / decrease throttle; power remains set when released |
| ↓ / ↑      | Raise / lower the nose                                        |
| ← / →      | Bank left / right; turns coordinate automatically             |
| A / D      | Rudder; steer while taxiing                                   |
| F          | Toggle stabilization (starts on; choice survives restart)     |
| Space      | Steady the wings and ease toward level pitch                  |
| B          | Wheel brakes                                                  |
| C          | Chase / cockpit view                                          |
| P / Escape | Pause / resume                                                |
| R          | Restart with the current airplane                             |
| M          | Mute / unmute engine sound                                    |

Start the engine, hold **W** for full power, then gently pull **↓** around **45 kt in the trainer** or **57 kt in the sport plane**. Stabilization starts enabled: use short pitch inputs and gentle self-centering. Press **F** for free attitude control. Hold a bank key for a complete roll; when inverted, **↑ pushes the nose toward the sky** and **↓ pulls toward the ground**. Inverted flight needs active pitch/power and loses height if left alone. **Space** recovers toward upright level flight in either mode. Bank to turn, then use Space to steady the wings. Low-speed feedback prompts you to lower the nose and add power.

For landing, line up with the long runway, reduce power with S and descend gently. Aim for roughly 45–55 kt in the trainer or 55–65 kt in the sport plane. Keep the wings level, ease the nose up just above the runway, then hold S and B to stop. Hard impacts and off-airfield landings offer immediate retry. Focus loss pauses the flight and clears held keys.

The map marks north, the runway, airplane and scenic markers. Altitude is metres above local terrain; airspeed is knots. Graphics quality and mute are accessible in the top toolbar. The bounded valley spans 4.8 km with a 750 m altitude ceiling. Forest detail follows the camera across the valley: baseline pines, bark, ferns, grasses, mossy rocks, fallen logs and scanned soil. A winding trail crosses the eastern groves. Distant canopy uses baked views of those same trees; detail fades across overlapping distance bands.

## Development

```sh
npm test
npm run lint
npm run build
SCENE_PORT=4492 npm run verify
SCENE_PORT=4492 npm run verify:exploration
SCENE_PORT=4492 npm run verify:art
```

Browser verification uses installed headed Playwright Chromium and ordinary keyboard controls for a complete scenic circuit and landing with each aircraft. Travel runs at 8× by default, with normal speed for screenshots and performance samples. Set `SIMULATION_RATE=1` only when real-time travel is needed. Artifacts and machine/frame-timing records are written to `.artifacts/verification/`. `CHROMIUM_PATH` can select a compatible local Chromium executable.

[Architecture](./ARCHITECTURE.md) describes the code boundaries. [Brief](./BRIEF.md) and [prompt](./PROMPT.md) define the development scope. The copy receipts are `tech9.json` and `GAME_PLAN.json`.

Flight handling is assisted arcade simulation, with coordinated turns, approximate lift and conservative obstacle proxies. Desktop keyboard play is the intended input. The aircraft and airfield geometry are editable JavaScript sources; the forest kit, font and retained asset authoring sources carry their [original licenses](./public/assets/ASSETS.md).

Exploration verification flies the sport plane across both sides of the valley with normal keyboard input, performs a full roll and sustained inverted flight, checks recovery, and records low/high views and resource plateaus. Camera-only art inspection under `?test=1` is separate from these success paths.

## Current handoff status

The first four independent baseline-reference art rounds ended at **7.6/10**. The user then requested three additional art rounds: **7.7 → 7.7 → 8.0/10**. The final independent still-image art review meets the 8/10 target. Remaining polish: repeated distant tree silhouettes, simple/pale broad meadows, some heavy foreground shadows and subtle LOD stippling.

The added rounds improve trail color/normal/roughness, middle-distance grass, grove size/color variation, clearing edges, shaded moss/litter and the mown airfield verge. The final build uses the baseline’s full and reduced grass meshes in a bounded 7×7 detail window, plus a sixteen-azimuth/four-elevation pine atlas. Flight controls and the compact game loop remain as previously validated. Framework extraction is the next separately scoped task; [architecture](./ARCHITECTURE.md#handoff--later-framework-dev) identifies reusable capabilities and required changes in existing modules.

Validation: **36 CPU tests, lint, production build and all three final review sets pass their runtime/resource checks**. The final art sweep holds **193 geometries, 35 textures and 28 programs** after warmup, with **357,361 fixed instance slots**, 49 detail tiles and 109,761 fixed trees. No browser, request or WebGL errors. `npm run verify:art` uses fixed camera spots, a short 90 m local sweep and repeated dispersed-region visits; it avoids another flight circuit. Transition stills show coverage but cannot prove continuous-motion smoothness.

The earlier ordinary-keyboard evidence covers both aircraft’s circuits/landings, remote low/high exploration, a full sport roll, inverted cockpit/pitch and recovery. Those receipts remain under `.artifacts/verification/` and `.artifacts/exploration-flight/`; these art-only rounds did not repeat the circuits. The earlier exploration assertion’s premature warmup cutoff and corrected saved-trace resource audit remain documented with that evidence.

Final High-preset captures at 1440×900 on Chromium 151 / ANGLE Metal / Apple M1 Pro measured roughly **55–62 FPS on the ground, 84 in low flight and 120 at altitude**. These are short headless rAF samples, not a sustained 60 FPS guarantee. Intermediate captures varied substantially; desktop load was uncontrolled and sources differed, so these are not controlled A/B measurements. Lower samples are preserved rather than discarded. Captures and independent review notes are in `.artifacts/art-refinement/`. The corrected final third-round set identifies source commit `62e8463b`; its superseded draft is retained separately.
