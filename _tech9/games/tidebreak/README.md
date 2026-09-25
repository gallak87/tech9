# Tidebreak

A small motorboat, one forested island, three coastal gates and a gentle return to the jetty. Start aboard the launch at Northlight Island, keep the island to port, and pass **01 East → 02 North → 03 West** between each pair of numbered buoys. Return to the gold mooring ring beside the jetty and hold below **0.8 m/s for 1.2 seconds**. A first lap takes roughly two to four minutes. Session best survives retries until the page reloads.

Use Node **^22.13.0 or >=24**. From this repository checkout:

```sh
./_tech9/run --prefix games/tidebreak ci
./_tech9/run --prefix games/tidebreak run dev
```

Open [Tidebreak](http://127.0.0.1:4460/). Dev **4460**, production preview **4461**, browser verification **4462** are strict ports. This game installs independently and never changes repository hooks. Production preview requires `run build` followed by `run preview` with the same package prefix.

- **W / Up:** throttle forward. **S / Down:** brake, then reverse. Release to coast.
- **A/D / Left/Right:** steer. The rudder needs motion; steering reverses while backing up.
- **P / Escape / Tab:** pause or resume. **R:** return to the dock with a fresh route and clock.
- **Cast off:** start. **Sail again:** retry immediately after a completed lap.
- Losing focus pauses the lap and clears held keys. Resume clears keys again. The start/pause menu offers quality, sunlight, coastal haze, vegetation and exposure controls.

The chart shows your heading, next gate and mooring ring. Gates require crossing the opening in the route direction. A missed gate stays active: loop back around and cross it again. Shore, substantial rocks and dock footprints block the boat; reverse or reset if pinned in a corner. Sailing at the edge of the 520 × 520 m play area is blocked. The water extends beyond this boundary to a finite visual horizon.

## Validate

```sh
./_tech9/run --prefix games/tidebreak test
./_tech9/run --prefix games/tidebreak run lint
./_tech9/run --prefix games/tidebreak run build
./_tech9/run --prefix games/tidebreak run verify
```

Browser verification uses actual keyboard and button input to complete and retry a lap, miss/recover a gate, contact the shore, reverse, try a gate out of order, pause while accelerating and lose focus. It also checks graphics controls, narrow layout and absence of production test hooks. Installed Playwright Chromium is used; `CHROMIUM_PATH` can choose another installed Chromium. Evidence and observed frame timing stay in ignored `.artifacts/verification/`. No public telemetry is collected.

Manual playtest: cast off, accelerate east, turn left toward gate 01, follow the chart around gates 02 and 03, and return along the south shore. Brake early on the final approach, settle inside the gold circle, read the result and choose Sail again. Try reverse against shore and pause while holding throttle. `?test=1` exposes snapshots only; it cannot move the boat, change rules or award a lap.

## Current limits

Desktop keyboard controls, one authored island, planar arcade dynamics and approximate conservative boat/solid footprints. There is no boarding, damage, free camera, AI or progression. The wake and bob are visual, with no fluid displacement. Buoys are course markers rather than solid obstacles. Reflections use one planar surface and can lag moving objects at the Balanced cadence. Water has an island hole and an outward coastal shelf; it is not a general ocean module. The finite horizon and distant fog are authored for this island.

The source is an owned fork of the promoted pond starter. `tech9.json` and `GAME_PLAN.json` are immutable fork receipts, not current runtime state. Copied capability sources and their receipts remain intact; unused pond/walking example files are retained for their existing lifecycle/contract checks but are not loaded by the game. See [architecture](./ARCHITECTURE.md) and [source/license index](./public/assets/TIDEBREAK_SOURCES.md).
