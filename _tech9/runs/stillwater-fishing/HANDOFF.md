# Stillwater Fishing handoff

The complete first playable is committed on `codex/stillwater-fishing` in the isolated worktree `/Users/g/.codex/worktrees/stillwater-fishing/tech9`. Runtime checkpoint: `48f6b9ce`.

## Launch

Dependencies are already installed in this worktree. Run:

```sh
/Users/g/.codex/worktrees/stillwater-fishing/tech9/_tech9/games/stillwater-fishing/play.sh
```

Open http://127.0.0.1:4440. The script selects supported system Node or the bundled Codex Node 24 runtime, and refuses to take an occupied port. `STILLWATER_NODE` can select another supported executable. Standard `npm ci` / `npm run dev` also work with Node ^22.13 or 24+. Preview uses 4441; automated browser checks use 4442. Verification servers were stopped at handoff.

## Play

1. Click **Walk to the water**. Use **WASD / arrows** to approach the bank; **Shift** walks faster.
2. **Right-drag** to look, or use **I J K L**. Hold **Space** for cast power, then release over water. Left mouse can replace Space.
3. When the float dives and **Set the hook** appears, press **Space**.
4. Hold **Space** to reel. Release when tension rises or the fish pulls. Land the trout and use **Space** or **Release & cast again**.
5. **Escape / P** pauses. Resume, graphics settings and restart are in the pause menu. A failed attempt resets with Space.

## Evidence and results

- **38 unit tests passed; lint and build passed.**
- **15 real-input browser checks passed; 0 failed; 2 native checks unavailable.** Success, release/recast, invalid cast, missed bite, line break, pause during fight, restart, shore/rock collision, aiming, settings and responsive layout are covered. No browser, asset or WebGL errors.
- **119.96 observed mean FPS**, 8.34 ms mean / 9.3 ms p95, 600 frame intervals, Balanced at 1600 × 1000 DPR 1. Chromium 151.0.7922.34, headless, Apple M1 Pro, ANGLE Metal. Machine load was not isolated; this is not a hardware guarantee.
- **Art: 7.2/10, failed 8/10 gate at the four-round cap.** Scores: 6.1, 6.6, 6.9, 7.2. The critic confirmed the bank-rock collision finding resolved and found no remaining proven correctness blocker. The bounded cycle is complete.

[Final validation](reviews/round-4/validation.json) · [Final independent critique](reviews/round-4/review.json) · [Bank frame](reviews/round-4/bank.png) · [Landed trout](reviews/round-4/landed.png)

Recheck from the game directory with `npm test`, `npm run lint`, and `npm run verify:game`, using supported Node. Temporary complete logs live in ignored `.artifacts/verification`; compact review evidence is committed in this run.

## Limits

Native pointer capture/exit and actual OS focus-loss delivery were unavailable in automated Chromium on this host. Handler unit tests pass, and right-drag/keyboard look is verified, but these two native interactions still need user-machine playtesting. Mouse capture provides fallback feedback.

Art remains below the requested AAA threshold: water resembles a mirror, the trout and fins are visibly procedural, forest forms repeat and rock/water integration is rough. Static critic captures do not prove animation quality. One species, no hands, no audio, no swimming or boats. A scripted careful fight takes about 45 seconds; the aspirational two-to-four-minute novice first catch is not established by that test.

All changes stay inside this game and run. No push, publication, framework promotion or root migration was performed.
