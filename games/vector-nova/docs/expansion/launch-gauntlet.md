# Launch collision gauntlet

## Scope

Improve the assigned level's jump collisions using production physics and the launch helper. Prioritize large reachable structures and forgiving returns to the track.

- Follow [AGENTS.md](../../AGENTS.md) and the [level API](../LEVEL_API.md). Use the assigned checkout; preserve unrelated changes and servers.
- Cap the pass at **30 launches total**, including retries. Start with 8–12 representative cases; reserve runs for verification.
- Keep automatic checkpoint recovery **disabled throughout the gauntlet**. Reset explicitly between cases. Allow genuine supported landings to regain traction.
- Bound each run by simulation ticks; stop on stable support or sufficient collision evidence. Skip distant scenery and indefinite falls.
- Preserve normal handling, 0.3 steering assistance, hazards, devices, and racing rules. Use headless execution and existing helpers/tests.

## Loop

1. Open `?level=<slug>&test=jump`. Wait for `window.__VN.ready`; inspect `test.cases`, `test.jumps`, and `test.targets`. Add minimal adapter wiring if the assigned level lacks the helper.
2. Scan major nearby production objects by name, size, and world bounds, including placed GLB instances. Prioritize ramp faces, walls, supports, and shallow geometry beneath the track. `test.targets` contains only registered solids; check independently for omissions. Register missing collision only where plausible trajectories warrant it.
3. Derive launches from `test.frame(distance)`. Call `reset(caseId)`, then `launch({ jump, position, velocity, quaternion?, angularVelocity? })`. Advance with `step(1–600, controls)` at 120 Hz; inspect events and motion between batches.
4. Cover clean takeoff/landing, short and long arrivals, oblique ramp contacts, left/right wall rebounds with steering, rolled deck returns, and likely underside/major-obstruction impacts. Use realistic speeds; avoid exhaustive angle/fixture combinations.
5. Save failing setups and inputs. Fix missing coverage, response, or support classification; rerun the failure and an affected control. Reuse shared deck traction and `forgivingContacts`; keep geometry metadata and local tuning level-owned.

## Required behavior

- Major reachable solids block the ship without tunneling, seam snags, or clipping through shallow under-track geometry.
- Wall contact nudges toward available road where sensible, damps spin, and preserves useful momentum. Sustained scrapes avoid repeated excessive penalties.
- Supported road returns restore magnetic grip and smoothly self-right the ship. Mild steering must not flip a supported ship or trigger another bounce. Continue throttle and steering for at least one second after landing; verify support and hull clearance.
- Require actual contact and sufficient support on the correct road surface. Undersides, scenery, and unrelated crossing track sections must not attract the ship.
- Keep collision registration independent of presentation quality. Preserve openings and clearance; handle moving geometry explicitly.

## Finish

Run focused regressions, a representative replay, and a production build. Complete desktop iteration before one final relevant mobile check. Stop when representative cases pass or the launch cap is reached. Report launch count, verified outcomes, and remaining failures briefly in chat; keep raw evidence under ignored `.experiments/`.
