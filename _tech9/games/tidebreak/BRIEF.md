# Tidebreak — island boat run

Pilot a small motorboat around a forested island roughly 160 metres across. Leave the dock, thread a short buoy course through coastal shallows, then return and dock gently to finish. The pleasure should come from the boat's weight, wake, turns and the view of the island from the water. Aim for a two-to-four-minute first lap and an immediate retry.

This is a launch packet only. Follow [GENERATE.md](../../GENERATE.md), relocating these two documents into the run directory before the protected starter fork. Start from a committed framework checkpoint containing the verified water promotion; inspect the catalog rather than assuming that this brief makes a capability available.

## First playable

- One authored island of about 160 m diameter, surrounded by a bounded ocean area large enough to circle it. Approximately 400–600 m of total playable width is sufficient; this is not an infinite ocean. Define the actual bounds in the plan.
- A readable coast: dry island terrain above sea level, vegetation kept on land, shore rocks and a clear dock approach. Water must surround the island rather than flood the existing forest. A finite water surface and visual horizon treatment are acceptable.
- One small, clearly visible motorboat with a follow camera. W/S or up/down controls throttle/braking/reverse; A/D or left/right steers. Show speed and the next course marker. Teach controls on the opening screen.
- Noticeable acceleration, drag, turning radius and some momentum, tuned for a forgiving arcade ride. Steering must feel connected to speed. A simple planar boat model with visual bob/roll is enough; no naval physics solver is required.
- Water motion, a small wake and turn feedback that communicate movement. Reuse the promoted water's rendering, quality and resource ownership where useful; document what had to change for open water.
- A short route with three clearly readable buoy gates around the island. Gates count in order, require crossing their opening, and cannot be completed by sitting beside a marker. A timer and personal session best can encourage a second lap; no persistent progression is required.
- Return to a dock zone and slow below a clear speed threshold to finish. Include an obvious result/restart flow, recovery from a missed gate, and a reset-to-start option if stuck.
- Coastline, dock and substantial rock collisions prevent driving through land. Use the same authored placements for visible obstacles and collision proxies. Keep an escape route from shallow corners; no softlocks.
- Start, pause/resume, completed lap and restart states. Losing focus or mouse capture must not leave throttle held. Keep the existing quality controls useful for water reflections and distant rendering.

## Water reuse and new work

The framework's pond water is a useful starting point, not an existing ocean/boat system. Inspect `pond-water` and the pond starter's contracts. Reuse its reflection budgets, lifecycle and shared water/shore data where they fit. Pond geometry fills the inside of a shoreline; this game needs land inside and navigable water outside. Author and validate that change explicitly, including terrain height, water visibility, vegetation exclusion and shoreline collision. Do not apply pond-specific shallows shading blindly to the ocean.

Boat movement, chase camera, island/ocean definition, wake and route rules are new game-owned capabilities. Keep them separate from renderer ownership and from each other at concrete seams. Use one renderer/frame loop and one camera owner. Prefer a coherent small island view over a huge water plane with an unbounded reflection/shadow budget.

## Limits and acceptance

No walking/boarding sequence, boat selection, upgrades, fuel economy, AI traffic, races against opponents, weapons, damage simulation, weather cycle, multiplayer, streaming islands or fluid simulation. Start the player in the boat at the dock. New models/effects may be authored in code; preserve editable sources and licenses.

Use real input to leave the dock, steer through every gate in order, return, stop, finish and restart. Verify reverse and recovery after a shore collision, rejection of out-of-order/missed gates, no land penetration, pause while throttling, cleared inputs after resume, and clean route/timer state after restart. Read-only hooks behind `?test=1` may observe progress; do not teleport the boat, advance gates or award a lap through test hooks.

Target 60 observed FPS at 1600 × 1000, Balanced, reporting the actual browser/GPU and competing-load limits. Run an independent demanding AAA art critic against frozen builds: stop at **8/10 or four rounds, whichever comes first**. At the cap, report a failed art gate honestly and hand over the verified playable game. No additional depth or art rounds without user feedback.

## Workspace and learning handoff

- Game slug: `tidebreak`; own `_tech9/games/tidebreak/**` and `_tech9/runs/tidebreak/**` only.
- Dedicated worktree branch: `codex/tidebreak`, based on the completed capability-promotion checkpoint supplied at kickoff.
- Preferred ports: dev `4460`, preview `4461`, browser tests `4462`. Check availability first, use strict ports and record replacements.
- Preserve accepted games and shared framework source. Keep temporary planning, review and investigation notes in ignored `runs/` or `.artifacts/`; do not commit them.
- At handoff, identify any useful shared capability in the task. A separate framework-dev session can bring it back by following `FRAMEWORK_DEV.md` and inspecting this game’s source; no committed history report is needed.
