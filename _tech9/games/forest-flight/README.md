# Forest Flight

Two airplanes, a forest airstrip and a short scenic circuit. Fly the steady **Cedar T-1** trainer or the quicker **Swift S-2** sport plane. Both are available immediately. Three optional scenic markers lead around the valley; return to the runway and brake to a stop for your landing result, or keep exploring.

## Run

From the repository root:

```sh
./_tech9/run --prefix games/forest-flight ci
./_tech9/run --prefix games/forest-flight run dev
```

Open **http://127.0.0.1:4490**. Production preview uses port 4491 after `npm run build`. This standalone package supports Node `^22.13.0 || >=24.0.0`; direct npm commands also work from this directory.

## Fly

| Input      | Action                                                        |
| ---------- | ------------------------------------------------------------- |
| W / S      | Increase / decrease throttle; power remains set when released |
| ↓ / ↑      | Raise / lower the nose                                        |
| ← / →      | Bank left / right; turns coordinate automatically             |
| A / D      | Rudder; steer while taxiing                                   |
| Space      | Steady the wings and ease toward level pitch                  |
| B          | Wheel brakes                                                  |
| C          | Chase / cockpit view                                          |
| P / Escape | Pause / resume                                                |
| R          | Restart with the current airplane                             |
| M          | Mute / unmute engine sound                                    |

Start the engine, hold **W** for full power, then gently pull **↓** around **45 kt in the trainer** or **57 kt in the sport plane**. Use short pitch inputs; the airplane holds its attitude with gentle self-centering. Bank to turn, then use Space to steady the wings. Low-speed feedback prompts you to lower the nose and add power.

For landing, line up with the long runway, reduce power with S and descend gently. Aim for roughly 45–55 kt in the trainer or 55–65 kt in the sport plane. Keep the wings level, ease the nose up just above the runway, then hold S and B to stop. Hard impacts and off-airfield landings offer immediate retry. Focus loss pauses the flight and clears held keys.

The map marks north, the runway, airplane and scenic markers. Altitude is metres above local terrain; airspeed is knots. Graphics quality and mute are accessible in the top toolbar. The bounded valley spans 4.8 km with a 750 m altitude ceiling.

## Development

```sh
npm test
npm run lint
npm run build
SCENE_PORT=4492 npm run verify
```

Browser verification uses installed headed Playwright Chromium and ordinary keyboard controls for a complete scenic circuit and landing with each aircraft. It takes about six minutes. Artifacts and machine/frame-timing records are written to `.artifacts/verification/`. `CHROMIUM_PATH` can select a compatible local Chromium executable.

[Architecture](./ARCHITECTURE.md) describes the code boundaries. [Brief](./BRIEF.md) and [prompt](./PROMPT.md) define the development scope. The copy receipts are `tech9.json` and `GAME_PLAN.json`.

Flight handling is assisted arcade simulation, with coordinated turns, approximate lift and conservative obstacle proxies. Desktop keyboard play is the intended input. The aircraft and airfield geometry are editable JavaScript sources; the forest kit, font and retained asset authoring sources carry their [original licenses](./public/assets/ASSETS.md).
