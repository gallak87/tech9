# Stillwater execution

## Scope and authority

User invoked the launch prompt and requested a separate worktree. Its delegated authority covers bounded design, implementation, dependencies, validation, local checkpoints and separate critique. Plan validated by the CLI; no extra approval gate was introduced. Managed goal covers playable correctness, review and handoff.

Workspace: `/Users/g/.codex/worktrees/stillwater-fishing/tech9`; branch `codex/stillwater-fishing`. Source starter checkpoint f5c3be1dc7f214add757a3c6553a77adfba40311. Only `_tech9/games/stillwater-fishing/**` and `_tech9/runs/stillwater-fishing/**` are owned. Ports 4440, 4441, 4442 were checked free before launch.

## Implementation

The two-file launch packet was moved as a whole into this run before plan creation. The registered CLI validated and dry-ran the fork before creating the owned game. Node 24.19.0 installed framework/game dependencies without hook changes. `tech9.json` and `GAME_PLAN.json` remain unchanged.

Producer owns integration, world, presentation, docs and run records. Bounded builder contributed FishingRules.js + fishing.test.js; another contributed WalkingController.js then the browser harness. All agent writes are disjoint; critic owns no implementation. Browser/GPU capture work is serialized.

World: authored irregular pond with carved basin and matching vegetation/movement/cast exclusion, reflective water, wet bank, reed pockets, lilies, stones. Rules: charge/cast/bite/hook/reel/land/release, failed cast/missed bite/snap/escape, start/pause/restart. Controller: grounded walking, circular solids, shore footprint, mouse/keyboard look and focus handling.

## Verification and review

Initial rendering/approach check: Chromium 151.0.7922.34, Apple M1 Pro, ANGLE Metal, 1600 × 1000, DPR 1, Balanced. Observed 120.0 mean FPS, 8.33 ms mean, 10 ms p95 in a short 3.5-second sample. No browser/page/request/WebGL errors. This is browser scheduling, not a hardware guarantee; competing machine load is not controlled.

Full browser evidence, committed checkpoints and independent art review rounds are recorded below as completed. The art gate stops at 8/10 or four rounds and is independent from behavioral correctness.

### First playable checks

Corrected production browser pass: 14 passed checks, 0 failed, 2 unavailable. Actual input approached the bank, tested its boundary, aimed with right-drag and keyboard, charged/cast, watched a bite, hooked, paused mid-fight (camera and rules frozen), reeled/eased to a landed trout, released and cast again. Invalid land cast, missed hook and line break recovered without reload. Restart cleared catches, targets and held inputs. All five settings and narrow layouts responded; ordinary launch had no test global and no browser/asset/WebGL errors.

Balanced performance after that full pass: Apple M1 Pro / Chromium 151.0.7922.34 / ANGLE Metal, 1600 × 1000 DPR 1: 102.52 observed mean FPS, 9.75 ms mean, 16.8 ms p95 over 513 intervals. Machine load is uncontrolled; measurements are scheduling observations, not a guarantee.

Native pointer capture was not granted in automated Chromium (including a visible-window spot check), and a second page did not deliver real focus loss in headless mode. These are **unavailable**, not passing browser checks. Mouse capture reports its fallback; right-drag and keyboard look are verified. Persistent controller event-handler tests cover blur/hidden/lock-exit pause and disposal. Real focus/lock behavior still warrants user-machine playtesting.

Validation fixed a pointer-event mismatch (preventing pointerdown suppressed compatibility mousemove; the controller now listens to pointermove) and clears the stored cast target on restart. All verified gameplay uses real browser input; no hook awards a catch or changes fishing state.

### Art round 1

Frozen implementation `32dfab68`. Independent critic inspected bank, fight and landed browser frames plus source: **6.1/10, failed gate**. No proven correctness blocker. Priorities: calmer water/shallows, improved trout anatomy and landing support, asymmetric shore detail. Two representative images and compact validation/review JSON are preserved in `reviews/round-1/`.
